import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { readActiveApiEnvironment } from "./active-api-environment.mjs";

let directory;
let apiRoot;
let oldRelease;
let newRelease;

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "dsp-active-api-environment-"));
  apiRoot = path.join(directory, "api");
  oldRelease = path.join(apiRoot, "releases", "old");
  newRelease = path.join(apiRoot, "releases", "new");
  await Promise.all([mkdir(oldRelease, { recursive: true }), mkdir(newRelease, { recursive: true })]);
});

after(async () => {
  await rm(directory, { recursive: true, force: true });
});

function active(apiPath, port) {
  return { webPath: path.join(directory, "web"), apiPath, slot: port === 4320 ? "legacy" : "blue", port, unit: "test.service" };
}

test("pending phases select target for handoff and base for verified recovery", async () => {
  for (const [phase, expectedPath, expectedPort] of [
    ["prepared", newRelease, 4321],
    ["publishing", newRelease, 4321],
    ["published", newRelease, 4321],
    ["recovering", oldRelease, 4320],
  ]) {
    const stateFile = path.join(directory, `${phase}.json`);
    await writeFile(stateFile, JSON.stringify({
      pendingVersion: 1,
      phase,
      base: { version: 1, generation: 1, current: active(oldRelease, 4320), previous: null, updatedAt: Date.now() },
      target: { version: 1, generation: 2, current: active(newRelease, 4321), previous: active(oldRelease, 4320), updatedAt: Date.now() },
      updatedAt: Date.now(),
    }));
    const result = await readActiveApiEnvironment({ stateFile, apiRoot });
    assert.equal(result.releaseDirectory, expectedPath);
    assert.equal(result.port, expectedPort);
    assert.equal(result.pendingPhase, phase);
  }
});

test("rejects a release outside the configured immutable root", async () => {
  const stateFile = path.join(directory, "escape.json");
  await writeFile(stateFile, JSON.stringify({ version: 1, generation: 1, current: active(directory, 4320), previous: null }));
  await assert.rejects(() => readActiveApiEnvironment({ stateFile, apiRoot }), /outside the configured release root/);
});
