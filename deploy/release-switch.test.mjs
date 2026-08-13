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
  constructor(options, { fail = null, failAfter = null } = {}) {
    this.options = options;
    this.fail = fail;
    this.failAfter = failAfter;
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
    if (this.fail === name) {
      this.fail = null;
      throw new Error(`fake runtime failure: ${name}`);
    }
  }

  hitAfter(name) {
    if (this.failAfter === name) {
      this.failAfter = null;
      throw new Error(`fake runtime post-effect failure: ${name}`);
    }
  }

  async startService(unit) {
    this.hit(`start:${unit}`);
    this.services.add(unit);
    if (unit === this.options.proxyUnit) {
      const state = JSON.parse(await readFile(this.options.proxyStateFile, "utf8"));
      this.status = { ...this.status, generation: state.generation, mode: state.mode, upstream: state.upstream };
    }
    this.hitAfter(`start:${unit}`);
  }

  async enableService(unit) { this.hit(`enable:${unit}`); }
  async disableService(unit) { this.hit(`disable:${unit}`); }

  async stopService(unit) {
    this.hit(`stop:${unit}`);
    this.services.delete(unit);
    this.hitAfter(`stop:${unit}`);
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
  async ensureWriterLockFile() { this.hit("prepare-writer-lock"); }
  async ensureReleaseStateAccess() { this.hit("prepare-release-state"); }
  async command(file) { this.hit(`command:${file}`); return { stdout: "", stderr: "" }; }
  async waitHealth(port) { this.hit(`health:${port}`); return { ok: true, storage: "sqlite", schemaVersion: 7, storageLayoutVersion: 2 }; }
  async waitReady(port) { this.hit(`ready:${port}`); return { writable: true, shuttingDown: false }; }
  async waitServiceReady(active) {
    this.hit(`service-ready:${active.port}`);
    return { writable: true, shuttingDown: false, legacyHealthFallback: active.slot === "legacy" };
  }
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

async function readOptionalJson(file) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}

function activeFixtureState(fixture, release, { slot, port, unit }) {
  return {
    webPath: path.join(fixture.webRoot, "releases", release),
    apiPath: path.join(fixture.apiRoot, "releases", release),
    slot,
    port,
    unit,
  };
}

function pendingFixtureState(fixture, phase = "prepared") {
  const oldActive = activeFixtureState(fixture, "old", {
    slot: "legacy",
    port: fixture.options.legacyPort,
    unit: fixture.options.legacyServiceUnit,
  });
  const newActive = activeFixtureState(fixture, "new", {
    slot: "blue",
    port: fixture.options.bluePort,
    unit: fixture.options.activeServiceUnit,
  });
  const base = { version: 1, generation: 1, current: oldActive, previous: null, updatedAt: Date.now() };
  const target = { version: 1, generation: 2, current: newActive, previous: oldActive, updatedAt: Date.now() };
  return { pendingVersion: 1, phase, base, target, updatedAt: Date.now() };
}

async function assertOldReleaseConsistent(fixture, runtime, expectedUnit = null) {
  assert.equal(await realpath(path.join(fixture.webRoot, "current")), path.join(fixture.webRoot, "releases", "old"));
  assert.equal(await realpath(path.join(fixture.apiRoot, "current")), path.join(fixture.apiRoot, "releases", "old"));
  const state = await readOptionalJson(fixture.options.switchStateFile);
  if (state) {
    assert.equal(path.resolve(state.current.webPath), path.join(fixture.webRoot, "releases", "old"));
    assert.equal(path.resolve(state.current.apiPath), path.join(fixture.apiRoot, "releases", "old"));
    if (expectedUnit) assert.equal(state.current.unit, expectedUnit);
  }
  assert.equal(await readOptionalJson(fixture.options.activeStartFile), null);
  if (runtime.status) {
    assert.equal(runtime.status.mode, "forward");
    assert.equal(runtime.status.upstream.port, fixture.options.legacyPort);
  }
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
  assert.ok(runtime.calls.indexOf(`stop:${fixture.options.legacyServiceUnit}`) < runtime.calls.indexOf("prepare-writer-lock"));
  assert.ok(runtime.calls.indexOf("prepare-writer-lock") < runtime.calls.indexOf("writer-lock"));
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
    await assertOldReleaseConsistent(fixture, runtime);
  });
}

for (const failureAfter of [
  "stop:dsp-idle-cloud.service",
  "start:dsp-idle-api-active.service",
]) {
  test(`post-effect systemd failure ${failureAfter} still restores exactly one old writer`, async () => {
    const fixture = await createFixture(`post-effect-${failureAfter.replaceAll(/[^a-z0-9]+/gi, "-")}`);
    const evidenceFile = await createEvidence(fixture);
    const runtime = new FakeRuntime(fixture.options, { failAfter: failureAfter });
    await assert.rejects(() => runReleaseSwitch({
      options: fixture.options,
      runtime,
      input: { webRelease: "new", apiRelease: "new", backupEvidence: evidenceFile },
    }), /post-effect failure/);
    assert.equal(runtime.services.has(fixture.options.legacyServiceUnit), false);
    assert.equal(runtime.services.has(fixture.options.activeServiceUnit), true);
    assert.equal(runtime.services.has(fixture.options.proxyUnit), true);
    await assertOldReleaseConsistent(fixture, runtime, fixture.options.activeServiceUnit);
  });
}

test("a stop failure before its side effect keeps hold and journal when a second stop cannot prove exclusivity", async () => {
  const fixture = await createFixture("stop-before-effect-double-failure");
  const evidenceFile = await createEvidence(fixture);
  const runtime = new FakeRuntime(fixture.options);
  const originalStop = runtime.stopService.bind(runtime);
  runtime.stopService = async (unit) => {
    if (unit === fixture.options.legacyServiceUnit) {
      runtime.calls.push(`stop:${unit}`);
      throw new Error(`persistent stop failure: ${unit}`);
    }
    return originalStop(unit);
  };
  await assert.rejects(() => runReleaseSwitch({
    options: fixture.options,
    runtime,
    input: { webRelease: "new", apiRelease: "new", backupEvidence: evidenceFile },
  }), (error) => error instanceof AggregateError && /did not complete verified recovery/.test(error.message));
  assert.equal(runtime.services.has(fixture.options.legacyServiceUnit), true);
  assert.equal(runtime.status.mode, "hold");
  assert.equal((await readOptionalJson(fixture.options.activeStartFile)).phase, "recovering");
});

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
  await assertOldReleaseConsistent(fixture, runtime);
});

test("durable pending journal survives a simulated process death and next run recovers before switching", async () => {
  const fixture = await createFixture("pending-reentry");
  const evidenceFile = await createEvidence(fixture);
  const firstRuntime = new FakeRuntime(fixture.options);
  const input = {
    webRelease: "new",
    apiRelease: "new",
    backupEvidence: evidenceFile,
    fault: "after-pending",
    enableFaultInjection: true,
  };
  // Simulate a process death by refusing the ordinary catch cleanup only for
  // this fixture: capture the durable journal at the injection point, then put
  // it back after the normal rollback assertions have completed.
  let capturedPending = null;
  const originalStop = firstRuntime.stopService.bind(firstRuntime);
  firstRuntime.stopService = async (unit) => {
    capturedPending ??= await readOptionalJson(fixture.options.activeStartFile);
    return originalStop(unit);
  };
  await assert.rejects(() => runReleaseSwitch({ options: fixture.options, runtime: firstRuntime, input }), /after-pending/);
  // after-pending occurs before stopService, so read the journal from the audit
  // window by executing a second synthetic run that throws during old stop.
  const crashRuntime = new FakeRuntime(fixture.options, { fail: `stop:${fixture.options.legacyServiceUnit}` });
  await assert.rejects(() => runReleaseSwitch({
    options: fixture.options,
    runtime: crashRuntime,
    input: { ...input, fault: null },
  }), /fake runtime failure/);
  capturedPending = capturedPending ?? pendingFixtureState(fixture);
  await writeFile(fixture.options.activeStartFile, JSON.stringify(capturedPending));
  const recoveryRuntime = new FakeRuntime(fixture.options);
  const result = await runReleaseSwitch({
    options: fixture.options,
    runtime: recoveryRuntime,
    input: { webRelease: "old", apiRelease: "old", dryRun: false },
  });
  assert.equal(result.recovered, true);
  assert.ok(recoveryRuntime.calls.includes(`service-ready:${fixture.options.legacyPort}`));
  assert.equal(recoveryRuntime.services.has(fixture.options.legacyServiceUnit), false);
  assert.equal(recoveryRuntime.services.has(fixture.options.activeServiceUnit), true);
  assert.ok(recoveryRuntime.calls.includes("prepare-writer-lock"));
  assert.ok(recoveryRuntime.calls.includes("writer-lock"));
  await assertOldReleaseConsistent(fixture, recoveryRuntime);
});

test("published journal with matching state and symlinks completes the new release instead of rolling it back", async () => {
  const fixture = await createFixture("published-reentry");
  const pending = pendingFixtureState(fixture, "published");
  await rm(path.join(fixture.webRoot, "current"), { force: true, recursive: true });
  await rm(path.join(fixture.apiRoot, "current"), { force: true, recursive: true });
  await symlink(pending.target.current.webPath, path.join(fixture.webRoot, "current"), process.platform === "win32" ? "junction" : "dir");
  await symlink(pending.target.current.apiPath, path.join(fixture.apiRoot, "current"), process.platform === "win32" ? "junction" : "dir");
  await writeFile(fixture.options.switchStateFile, JSON.stringify(pending.target));
  await writeFile(fixture.options.activeStartFile, JSON.stringify(pending));
  const runtime = new FakeRuntime(fixture.options);
  runtime.services = new Set([fixture.options.activeServiceUnit]);
  const result = await runReleaseSwitch({
    options: fixture.options,
    runtime,
    input: { webRelease: "new", apiRelease: "new" },
  });
  assert.equal(result.recovered, true);
  assert.equal(result.state.current.apiReleaseId, "new");
  assert.equal(runtime.services.has(fixture.options.legacyServiceUnit), false);
  assert.equal(runtime.services.has(fixture.options.activeServiceUnit), true);
  assert.equal(await realpath(path.join(fixture.webRoot, "current")), pending.target.current.webPath);
  assert.equal(await realpath(path.join(fixture.apiRoot, "current")), pending.target.current.apiPath);
  assert.equal(await readOptionalJson(fixture.options.activeStartFile), null);
  assert.equal(runtime.status.mode, "forward");
  assert.equal(runtime.status.upstream.port, fixture.options.bluePort);
});

test("published journal with mixed symlinks rolls back to its durable base", async () => {
  const fixture = await createFixture("published-mixed-reentry");
  const pending = pendingFixtureState(fixture, "published");
  await rm(path.join(fixture.apiRoot, "current"), { force: true, recursive: true });
  await symlink(pending.target.current.apiPath, path.join(fixture.apiRoot, "current"), process.platform === "win32" ? "junction" : "dir");
  await writeFile(fixture.options.switchStateFile, JSON.stringify(pending.target));
  await writeFile(fixture.options.activeStartFile, JSON.stringify(pending));
  const runtime = new FakeRuntime(fixture.options);
  runtime.services = new Set([fixture.options.activeServiceUnit]);
  const result = await runReleaseSwitch({
    options: fixture.options,
    runtime,
    input: { webRelease: "old", apiRelease: "old" },
  });
  assert.equal(result.recovered, true);
  assert.equal(result.state.current.apiReleaseId, "old");
  assert.equal(runtime.services.has(fixture.options.activeServiceUnit), true);
  assert.equal(runtime.services.has(fixture.options.legacyServiceUnit), false);
  await assertOldReleaseConsistent(fixture, runtime, fixture.options.activeServiceUnit);
});

test("recovery failure keeps the durable journal and proxy hold instead of claiming rollback", async () => {
  const fixture = await createFixture("recovery-failure-journal");
  const evidenceFile = await createEvidence(fixture);
  const runtime = new FakeRuntime(fixture.options, { fail: `service-ready:${fixture.options.legacyPort}` });
  await assert.rejects(() => runReleaseSwitch({
    options: fixture.options,
    runtime,
    input: {
      webRelease: "new",
      apiRelease: "new",
      backupEvidence: evidenceFile,
      fault: "new-readiness-timeout",
      enableFaultInjection: true,
    },
  }), (error) => error instanceof AggregateError && /did not complete verified recovery/.test(error.message));
  const pending = await readOptionalJson(fixture.options.activeStartFile);
  assert.equal(pending.phase, "recovering");
  assert.equal(runtime.status.mode, "hold");
  assert.equal(await realpath(path.join(fixture.apiRoot, "current")), path.join(fixture.apiRoot, "releases", "old"));
});

test("a failed restart-time recovery preserves the pre-existing journal for the next attempt", async () => {
  const fixture = await createFixture("interrupted-recovery-failure-journal");
  const evidenceFile = await createEvidence(fixture);
  const pending = pendingFixtureState(fixture, "prepared");
  await writeFile(fixture.options.activeStartFile, JSON.stringify(pending));
  const runtime = new FakeRuntime(fixture.options, { fail: `service-ready:${fixture.options.legacyPort}` });

  await assert.rejects(() => runReleaseSwitch({
    options: fixture.options,
    runtime,
    input: {
      webRelease: "new",
      apiRelease: "new",
      backupEvidence: evidenceFile,
    },
  }), /fake runtime failure/);

  const preserved = await readOptionalJson(fixture.options.activeStartFile);
  assert.equal(preserved.phase, "recovering");
  assert.equal(preserved.base.current.apiPath, pending.base.current.apiPath);
  assert.equal(preserved.target.current.apiPath, pending.target.current.apiPath);
  assert.equal(runtime.status.mode, "hold");
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
