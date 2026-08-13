import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  API_ARCHIVE_SOURCE_FILES,
  expandApiReleaseLayout,
  stageApiArchiveLayout,
  stageExpandedApiRelease,
  verifyApiArchiveLayout,
  verifyApiReleaseCandidate,
} from "./prepare-api-release.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let directory;

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "dsp-api-package-layout-test-"));
});

after(async () => {
  const resolved = path.resolve(directory);
  assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
  assert.match(path.basename(resolved), /^dsp-api-package-layout-test-/);
  await rm(resolved, { recursive: true, force: true });
});

test("stages the historical API archive and expands server files byte-for-byte into the systemd entry root", async () => {
  const releaseRoot = path.join(directory, "expanded");
  const staged = await stageExpandedApiRelease({ repositoryRoot, releaseRoot });

  assert.equal(staged.archiveFileCount, API_ARCHIVE_SOURCE_FILES.length);
  assert.deepEqual(
    JSON.parse(await readFile(path.join(releaseRoot, "cloud-transfer-contract.json"), "utf8")),
    JSON.parse(await readFile(path.join(repositoryRoot, "cloud-transfer-contract.json"), "utf8")),
  );
  assert.deepEqual(
    await readFile(path.join(releaseRoot, "index.mjs")),
    await readFile(path.join(releaseRoot, "server", "index.mjs")),
  );
  assert.deepEqual(
    await readFile(path.join(releaseRoot, "cloud-transfer-contract.json")),
    await readFile(path.join(releaseRoot, "server", "cloud-transfer-contract.json")),
  );
  assert.deepEqual(
    await readFile(path.join(releaseRoot, "save-field-contract.mjs")),
    await readFile(path.join(repositoryRoot, "save-field-contract.mjs")),
  );
  assert.deepEqual(
    await readFile(path.join(releaseRoot, "save-field-contract.json")),
    await readFile(path.join(repositoryRoot, "save-field-contract.json")),
  );
  assert.deepEqual(
    await readFile(path.join(releaseRoot, "server", "save-field-contract.mjs")),
    await readFile(path.join(repositoryRoot, "server", "save-field-contract.mjs")),
  );
  for (const file of [
    "http-security.mjs",
    "http-route-policy.mjs",
    "account-archive-legacy-json.mjs",
    "runtime-state-persistence.mjs",
  ]) {
    assert.deepEqual(
      await readFile(path.join(releaseRoot, file)),
      await readFile(path.join(repositoryRoot, "server", file)),
      `${file} must be present byte-for-byte in the expanded API entry root`,
    );
  }
  for (const file of [
    "api-handoff-proxy.mjs",
    "api-active-entry.sh",
    "api-writer-lock.sh",
    "probe-api-readiness.mjs",
    "dsp-idle-api-handoff-proxy.service",
    "dsp-idle-api-active.service",
    "dsp-idle-api-preflight.service",
    "dsp-idle-healthcheck.service",
    "dsp-idle-runtime.env.example",
  ]) {
    assert.deepEqual(
      await readFile(path.join(releaseRoot, "deploy", file)),
      await readFile(path.join(repositoryRoot, "deploy", file)),
      `${file} must be packaged byte-for-byte with the release control plane`,
    );
  }
});

test("refuses to expand an archive when its two transfer-contract copies differ", async () => {
  const releaseRoot = path.join(directory, "mismatched-contract");
  await stageApiArchiveLayout({ repositoryRoot, archiveRoot: releaseRoot });
  const packagedContract = JSON.parse(await readFile(path.join(releaseRoot, "server", "cloud-transfer-contract.json"), "utf8"));
  packagedContract.maximumTimeoutMs += 1;
  await writeFile(
    path.join(releaseRoot, "server", "cloud-transfer-contract.json"),
    `${JSON.stringify(packagedContract, null, 2)}\n`,
    "utf8",
  );

  await assert.rejects(
    () => verifyApiArchiveLayout({ repositoryRoot, archiveRoot: releaseRoot }),
    /source byte mismatch|contract copies differ/,
  );
  await assert.rejects(
    () => expandApiReleaseLayout({ repositoryRoot, releaseRoot }),
    /source byte mismatch|contract copies differ/,
  );
});

test("runs npm ci in the real expanded layout and reaches health with a temporary SQLite database", { timeout: 120_000 }, async () => {
  const releaseRoot = path.join(directory, "health");
  await stageExpandedApiRelease({ repositoryRoot, releaseRoot });
  const result = await verifyApiReleaseCandidate({ repositoryRoot, releaseRoot });

  assert.equal(result.status, 200);
  assert.equal(result.health.ok, true);
  assert.equal(result.health.service, "dsp-idle-cloud");
  assert.equal(result.health.schemaVersion, 7);
  assert.equal(result.health.storage, "sqlite");
  assert.equal(result.health.storageLayoutVersion, 2);
});
