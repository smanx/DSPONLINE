import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import {
  createReleaseSwitchOptions,
  parseReleaseSwitchArguments,
  runReleaseSwitch,
} from "./release-switch.mjs";

const requireFromServer = createRequire(path.resolve("server/package.json"));
const Database = requireFromServer("better-sqlite3");

let root;

before(async () => {
  root = await mkdtemp(path.join(tmpdir(), "dsp-release-switch-"));
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

async function createFixture(name) {
  const directory = path.join(root, name);
  const webRoot = path.join(directory, "web");
  const apiRoot = path.join(directory, "api");
  const stateRoot = path.join(directory, "state");
  const runtimeRoot = path.join(directory, "run");
  const preflightRoot = path.join(directory, "preflight");
  const backupDirectory = path.join(directory, "backups");
  for (const release of ["old", "new"]) {
    await mkdir(path.join(webRoot, "releases", release, "assets"), { recursive: true });
    await mkdir(path.join(apiRoot, "releases", release), { recursive: true });
    await writeFile(path.join(webRoot, "releases", release, "assets", `${release}.js`), release);
    await writeFile(path.join(apiRoot, "releases", release, "index.mjs"), "export {};\n");
  }
  await mkdir(stateRoot, { recursive: true });
  await mkdir(runtimeRoot, { recursive: true });
  await mkdir(backupDirectory, { recursive: true });
  await symlink(path.join(webRoot, "releases", "old"), path.join(webRoot, "current"), process.platform === "win32" ? "junction" : "dir");
  await symlink(path.join(apiRoot, "releases", "old"), path.join(apiRoot, "current"), process.platform === "win32" ? "junction" : "dir");
  const environment = {
    DSP_WEB_ROOT: webRoot,
    DSP_API_ROOT: apiRoot,
    DSP_RELEASE_STATE_ROOT: stateRoot,
    DSP_RELEASE_RUNTIME_ROOT: runtimeRoot,
    DSP_RELEASE_PREFLIGHT_ROOT: preflightRoot,
    DSP_SHARED_ASSETS_ROOT: path.join(webRoot, "shared", "assets"),
    DSP_CLOUD_DATABASE_FILE: path.join(directory, "production.sqlite"),
    DSP_CLOUD_DATA_FILE: path.join(directory, "cloud.json"),
    DSP_CLOUD_BACKUP_DIRECTORY: backupDirectory,
    DSP_RELEASE_READINESS_TIMEOUT_MS: "1000",
    DSP_RELEASE_DRAIN_TIMEOUT_MS: "1000",
    DSP_RELEASE_PROXY_TIMEOUT_MS: "1000",
    DSP_RELEASE_WRITER_LOCK_TIMEOUT_MS: "1000",
  };
  return { directory, webRoot, apiRoot, stateRoot, runtimeRoot, options: createReleaseSwitchOptions(environment) };
}

class FakeRuntime {
  constructor(options, { fail = null } = {}) {
    this.options = options;
    this.fail = fail;
    this.calls = [];
    this.services = new Set([options.legacyServiceUnit]);
    this.status = {
      version: 1,
      listening: true,
      generation: 1,
      mode: "forward",
      upstream: { host: "127.0.0.1", port: options.legacyPort, slot: "legacy", releaseId: "old" },
      activeRequests: 0,
      activeWriterRequests: 0,
      queuedRequests: 0,
      queuedWriterRequests: 0,
    };
  }

  hit(name) {
    this.calls.push(name);
    if (this.fail === name) throw new Error(`fake runtime failure: ${name}`);
  }

  async startService(unit) {
    this.hit(`start:${unit}`);
    this.services.add(unit);
    if (unit === this.options.proxyUnit) {
      const state = JSON.parse(await readFile(this.options.proxyStateFile, "utf8"));
      this.status = { ...this.status, generation: state.generation, mode: state.mode, upstream: state.upstream };
    }
  }

  async enableService(unit) { this.hit(`enable:${unit}`); }
  async disableService(unit) { this.hit(`disable:${unit}`); }

  async stopService(unit) {
    this.hit(`stop:${unit}`);
    this.services.delete(unit);
  }

  async nginxTest() { this.hit("nginx-test"); }
  async reloadNginx() { this.hit("nginx-reload"); }
  async waitProxy(expected) {
    this.hit(`proxy:${expected.mode}:${expected.upstream.port}`);
    this.status = { ...this.status, generation: expected.generation, mode: expected.mode, upstream: expected.upstream };
    return this.status;
  }
  async waitProxyIdle({ writersOnly }) { this.hit(writersOnly ? "drain-writers" : "drain-all"); return this.status; }
  async writerLockAvailable() { this.hit("writer-lock"); }
  async command(file) { this.hit(`command:${file}`); return { stdout: "", stderr: "" }; }
  async waitHealth(port) { this.hit(`health:${port}`); return { ok: true, storage: "sqlite", schemaVersion: 7, storageLayoutVersion: 2 }; }
  async waitReady(port) { this.hit(`ready:${port}`); return { writable: true, shuttingDown: false }; }
  async preparePreflight(evidence, target) {
    this.hit("prepare-preflight");
    const databaseFile = path.join(this.options.preflightRoot, `candidate-${target.apiReleaseId}.sqlite`);
    await mkdir(this.options.preflightRoot, { recursive: true });
    await writeFile(databaseFile, evidence.sha256);
    return { databaseFile };
  }
  async cleanupPreflight(preflight) { this.hit("cleanup-preflight"); await rm(preflight.databaseFile, { force: true }); }
}

async function createEvidence(fixture) {
  const databaseFile = path.join(fixture.directory, "verified.sqlite");
  const database = new Database(databaseFile);
  database.exec("CREATE TABLE app_state (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)");
  database.prepare("INSERT INTO app_state VALUES (1, ?, ?)").run(JSON.stringify({ schemaVersion: 7, storageLayoutVersion: 2, users: {}, cloudSaves: {} }), Date.now());
  database.close();
  const { createReleaseBackupEvidence } = await import("./release-backup-evidence.mjs");
  const evidenceFile = path.join(fixture.directory, "backup-evidence.json");
  await createReleaseBackupEvidence({ databaseFile, evidenceFile });
  return evidenceFile;
}

test("dry-run validates release paths without service or symlink mutation", async () => {
  const fixture = await createFixture("dry-run");
  const runtime = new FakeRuntime(fixture.options);
  const evidenceFile = await createEvidence(fixture);
  const result = await runReleaseSwitch({
    options: fixture.options,
    runtime,
    input: { webRelease: "new", apiRelease: "new", backupEvidence: evidenceFile, dryRun: true },
  });
  assert.equal(result.dryRun, true);
  assert.equal(result.plan.apiChanges, true);
  assert.equal(result.evidence.schemaVersion, 7);
  assert.deepEqual(runtime.calls, []);
  assert.equal(await realpath(path.join(fixture.webRoot, "current")), path.join(fixture.webRoot, "releases", "old"));
});

test("successful switch preflights a backup clone, drains, hands off one writer and is idempotent", async () => {
  const fixture = await createFixture("success");
  const evidenceFile = await createEvidence(fixture);
  const runtime = new FakeRuntime(fixture.options);
  const input = { webRelease: "new", apiRelease: "new", backupEvidence: evidenceFile };
  const result = await runReleaseSwitch({ options: fixture.options, runtime, input });
  assert.equal(result.state.current.apiReleaseId, "new");
  assert.equal(result.state.current.unit, fixture.options.activeServiceUnit);
  assert.equal(await realpath(path.join(fixture.webRoot, "current")), path.join(fixture.webRoot, "releases", "new"));
  assert.equal(await realpath(path.join(fixture.apiRoot, "current")), path.join(fixture.apiRoot, "releases", "new"));
  assert.ok(runtime.calls.indexOf("drain-writers") < runtime.calls.indexOf(`stop:${fixture.options.legacyServiceUnit}`));
  assert.ok(runtime.calls.indexOf(`stop:${fixture.options.legacyServiceUnit}`) < runtime.calls.indexOf("writer-lock"));
  assert.ok(runtime.calls.indexOf("writer-lock") < runtime.calls.indexOf(`start:${fixture.options.activeServiceUnit}`));
  assert.ok(runtime.calls.indexOf(`ready:${fixture.options.bluePort}`) < runtime.calls.indexOf(`proxy:forward:${fixture.options.bluePort}`));
  assert.ok(runtime.calls.includes(`enable:${fixture.options.activeServiceUnit}`));
  assert.ok(runtime.calls.includes(`disable:${fixture.options.legacyServiceUnit}`));

  const secondRuntime = new FakeRuntime(fixture.options);
  const second = await runReleaseSwitch({ options: fixture.options, runtime: secondRuntime, input });
  assert.equal(second.noOp, true);
  assert.deepEqual(secondRuntime.calls, []);
});

for (const failure of [
  "start:dsp-idle-api-preflight.service",
  "health:4390",
  "nginx-test",
  "nginx-reload",
  "writer-lock",
  "start:dsp-idle-api-active.service",
  "ready:4321",
]) {
  test(`failure ${failure} preserves or restores the old release`, async () => {
    const fixture = await createFixture(`failure-${failure.replaceAll(/[^a-z0-9]+/gi, "-")}`);
    const evidenceFile = await createEvidence(fixture);
    const runtime = new FakeRuntime(fixture.options, { fail: failure });
    await assert.rejects(() => runReleaseSwitch({
      options: fixture.options,
      runtime,
      input: { webRelease: "new", apiRelease: "new", backupEvidence: evidenceFile },
    }), /fake runtime failure/);
    assert.equal(await realpath(path.join(fixture.webRoot, "current")), path.join(fixture.webRoot, "releases", "old"));
    assert.equal(await realpath(path.join(fixture.apiRoot, "current")), path.join(fixture.apiRoot, "releases", "old"));
  });
}

test("fault injection is rejected unless the test-only gate is explicit", async () => {
  const fixture = await createFixture("fault-gate");
  await assert.rejects(() => runReleaseSwitch({
    options: fixture.options,
    runtime: new FakeRuntime(fixture.options),
    input: { webRelease: "new", apiRelease: "new", fault: "new-start" },
  }), /explicit test-only enablement/);
  assert.equal(parseReleaseSwitchArguments(["--dry-run", "--web-release", "new"]).dryRun, true);
});

test("explicit fault injection after hold restores the old writer and releases queued traffic", async () => {
  const fixture = await createFixture("fault-after-hold");
  const evidenceFile = await createEvidence(fixture);
  const runtime = new FakeRuntime(fixture.options);
  await assert.rejects(() => runReleaseSwitch({
    options: fixture.options,
    runtime,
    input: {
      webRelease: "new",
      apiRelease: "new",
      backupEvidence: evidenceFile,
      fault: "after-hold",
      enableFaultInjection: true,
    },
  }), /injected release switch fault/);
  assert.ok(runtime.calls.includes(`proxy:forward:${fixture.options.legacyPort}`));
  assert.equal(await realpath(path.join(fixture.apiRoot, "current")), path.join(fixture.apiRoot, "releases", "old"));
});

test("rollback-last performs the same verified API handoff and never restores a database", async () => {
  const fixture = await createFixture("rollback");
  const evidenceFile = await createEvidence(fixture);
  const firstRuntime = new FakeRuntime(fixture.options);
  await runReleaseSwitch({
    options: fixture.options,
    runtime: firstRuntime,
    input: { webRelease: "new", apiRelease: "new", backupEvidence: evidenceFile },
  });
  const rollbackRuntime = new FakeRuntime(fixture.options);
  rollbackRuntime.status = {
    ...rollbackRuntime.status,
    generation: 5,
    upstream: { host: "127.0.0.1", port: fixture.options.bluePort, slot: "blue", releaseId: "new" },
  };
  const result = await runReleaseSwitch({
    options: fixture.options,
    runtime: rollbackRuntime,
    input: { rollbackLast: true, backupEvidence: evidenceFile },
  });
  assert.equal(result.state.current.apiReleaseId, "old");
  assert.equal(await realpath(path.join(fixture.apiRoot, "current")), path.join(fixture.apiRoot, "releases", "old"));
  assert.equal(rollbackRuntime.calls.some((call) => call.includes("restore") || call.includes("database")), false);
});
