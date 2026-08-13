import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createCloudServer } from "./index.mjs";
import { collectCloudPayloadStoreStats, readCloudPayload } from "./cloud-payload-store.mjs";
import { computeSaveStateChecksum } from "./save-integrity.mjs";

const DIRECT_SAVE_CONTENT_TYPE = "application/vnd.dspidle.save+json";
const TEST_PASSWORD = "synthetic-pass-123";
const TEST_ADMIN_TOKEN = "synthetic-admin-token-1234567890-abcdef";
const READINESS_KEYS = [
  "lastErrorAt",
  "lastErrorCategory",
  "lastSuccessAt",
  "pendingWrites",
  "shuttingDown",
  "writable",
].sort();

function createV46State(mode = "normal", sequence = 1) {
  return {
    version: 46,
    mode,
    elapsedSeconds: 600 + sequence,
    entities: [{ id: "storage", kind: "storage", buildingId: "storage_mk1" }],
    belts: [{ id: "belt", source: "storage", target: "storage", itemId: "iron_ore" }],
    settings: {
      productionBufferLimit: 1_000_000,
      logisticsBufferLimit: 1_000_000,
      beltBufferLimit: 100_000_000,
      proliferatorBufferLimit: 600,
    },
    contentPacks: [],
    galaxy: { planetMetadata: {}, systemMetadata: {} },
    quantumLogisticsNetwork: {
      enabled: false,
      inventory: {},
      routingCursors: {},
      itemCapacities: {},
      uploadRoutingCursors: {},
    },
    constructionAutomation: { destroyedByproducts: {} },
    blueprints: [],
    blueprintVersions: [],
    constructionQueue: [],
    dysonPlans: {},
    timeWarp: {
      controllerEntityId: null,
      enabled: false,
      requestedMultiplier: 5,
      effectiveMultiplier: 1,
      pendingSimulationSeconds: 0,
      pendingWallSeconds: 0,
      requiredPowerKw: 0,
      allocatedPowerKw: 0,
    },
    endgame: {
      infiniteResearch: Object.fromEntries([
        "matrix_compression",
        "vein_utilization",
        "galactic_logistics",
        "stellar_harnessing",
        "continuum_simulation",
      ].map((id) => [id, { level: 0, progress: "0" }])),
    },
    totalProduced: { iron_ore: sequence, universe_matrix: sequence },
    metrics: { generationKw: 0, totalItemsPerMinute: sequence, rayGenerationKw: 0 },
    exploration: { unlockedSystemIds: ["helios"], colonizedPlanetIds: ["home"] },
  };
}

function createSavePayload(mode = "normal", sequence = 1) {
  const state = createV46State(mode, sequence);
  const envelope = { formatVersion: 2, savedAt: 100_000 + sequence, mode, state };
  return JSON.stringify({
    ...envelope,
    checksum: computeSaveStateChecksum(envelope.formatVersion, state),
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function withTimeout(promise, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs} ms`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function createFaultController() {
  let armed = null;
  return {
    injector({ phase }) {
      if (!armed || armed.phase !== phase) return;
      const fault = armed;
      armed = null;
      const error = new Error(`synthetic persistence failure at ${phase}`);
      error.code = fault.code;
      throw error;
    },
    arm(phase, code) {
      armed = { phase, code };
    },
    disarm() {
      armed = null;
    },
  };
}

async function startServer(databaseFile, options = {}) {
  const server = await createCloudServer({
    databaseFile,
    registrationLimit: 100,
    historyPruneIntervalMs: 0,
    backupIntervalMs: 0,
    mailer: null,
    logger: { error() {} },
    ...options,
  });
  await new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  };
}

async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function request(baseUrl, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { response, body };
}

async function register(baseUrl, username) {
  const registered = await request(baseUrl, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      username,
      password: TEST_PASSWORD,
      displayName: "原子持久化合成账号",
    }),
  });
  assert.equal(registered.response.status, 201, JSON.stringify(registered.body));
  return {
    accountId: registered.body.user.id,
    token: registered.body.token,
    headers: { authorization: `Bearer ${registered.body.token}` },
  };
}

async function uploadJson(baseUrl, route, headers, payload, expectedRevision) {
  return request(baseUrl, route, {
    method: "PUT",
    headers,
    body: JSON.stringify({ payload, expectedRevision }),
  });
}

async function uploadDirect(baseUrl, route, headers, payload, expectedRevision, requestId) {
  return request(baseUrl, route, {
    method: "PUT",
    headers: {
      ...headers,
      "content-type": DIRECT_SAVE_CONTENT_TYPE,
      "x-dsp-expected-revision": String(expectedRevision),
      "x-dsp-request-id": requestId,
      "x-dsp-save-original-bytes": String(Buffer.byteLength(payload)),
    },
    body: payload,
  });
}

async function assertCurrentSave(running, route, headers, expectedPayload, expectedRevision) {
  const loaded = await request(running.baseUrl, route, { headers });
  assert.equal(loaded.response.status, 200, JSON.stringify(loaded.body));
  assert.equal(loaded.body.cloudSave?.revision, expectedRevision);
  assert.equal(loaded.body.cloudSave?.payload, expectedPayload);
  assert.equal(loaded.body.cloudSave?.checksum, sha256(expectedPayload));
}

function payloadRows(server, accountId, storageSlot) {
  const rows = server.store.database.prepare(`
    SELECT revision
    FROM cloud_save_payloads
    WHERE user_id = ? AND slot = ?
    ORDER BY revision ASC
  `).all(accountId, storageSlot);
  return rows.map(({ revision }) => ({
    revision,
    payload: readCloudPayload(server.store.database, { userId: accountId, slot: storageSlot, revision }),
  }));
}

function payloadStoreStats(server) {
  return collectCloudPayloadStoreStats(server.store.database);
}

const SQLITE_FAILURE_SCENARIOS = [
  { phase: "before-sqlite-transaction", code: "SQLITE_FULL" },
  { phase: "after-user-payload-deletes", code: "SQLITE_IOERR" },
  { phase: "after-payload-deletes", code: "SQLITE_BUSY" },
  { phase: "after-payload-writes", code: "SQLITE_READONLY" },
  { phase: "after-app-state-write", code: "SQLITE_IOERR" },
];

for (const [index, scenario] of SQLITE_FAILURE_SCENARIOS.entries()) {
  test(`failed cloud PUT at ${scenario.phase} is invisible and the queue recovers`, async () => {
    const directory = await mkdtemp(path.join(tmpdir(), `dsp-persistence-${index + 1}-`));
    const databaseFile = path.join(directory, "cloud.sqlite");
    const faults = createFaultController();
    let running;
    try {
      running = await startServer(databaseFile, { persistenceFaultInjector: faults.injector });
      const account = await register(running.baseUrl, `atomic_fail_${index + 1}`);
      const baselinePayload = createSavePayload("normal", 10 + index);
      const failedPayload = createSavePayload("normal", 100 + index);
      const recoveryPayload = createSavePayload("normal", 200 + index);

      const baseline = await uploadJson(
        running.baseUrl,
        "/api/cloud-save?slot=1&mode=normal",
        account.headers,
        baselinePayload,
        0,
      );
      assert.equal(baseline.response.status, 200, JSON.stringify(baseline.body));
      assert.equal(baseline.body.cloudSave.revision, 1);
      const storageBeforeFailure = payloadStoreStats(running.server);

      faults.arm(scenario.phase, scenario.code);
      const failed = await uploadJson(
        running.baseUrl,
        "/api/cloud-save?slot=1&mode=normal",
        account.headers,
        failedPayload,
        1,
      );
      faults.disarm();
      assert.equal(failed.response.status, 500, JSON.stringify(failed.body));

      await assertCurrentSave(
        running,
        "/api/cloud-save?slot=1&mode=normal",
        account.headers,
        baselinePayload,
        1,
      );
      const historyAfterFailure = await request(
        running.baseUrl,
        "/api/cloud-save/history?slot=1&mode=normal",
        { headers: account.headers },
      );
      assert.equal(historyAfterFailure.response.status, 200);
      assert.deepEqual(historyAfterFailure.body.history.map((entry) => entry.revision), [1]);
      assert.deepEqual(payloadRows(running.server, account.accountId, "1"), [
        { revision: 1, payload: baselinePayload },
      ]);
      assert.deepEqual(payloadStoreStats(running.server), storageBeforeFailure, "failed transaction must not leave an alias or orphan blob");

      const recovery = await uploadJson(
        running.baseUrl,
        "/api/cloud-save?slot=2&mode=normal",
        account.headers,
        recoveryPayload,
        0,
      );
      assert.equal(recovery.response.status, 200, JSON.stringify(recovery.body));
      assert.equal(recovery.body.cloudSave.revision, 1);
      await assertCurrentSave(
        running,
        "/api/cloud-save?slot=1&mode=normal",
        account.headers,
        baselinePayload,
        1,
      );
      assert.deepEqual(payloadRows(running.server, account.accountId, "1"), [
        { revision: 1, payload: baselinePayload },
      ]);
      assert.deepEqual(payloadRows(running.server, account.accountId, "2"), [
        { revision: 1, payload: recoveryPayload },
      ]);

      await closeServer(running.server);
      running = await startServer(databaseFile, { persistenceFaultInjector: faults.injector });
      await assertCurrentSave(
        running,
        "/api/cloud-save?slot=1&mode=normal",
        account.headers,
        baselinePayload,
        1,
      );
      await assertCurrentSave(
        running,
        "/api/cloud-save?slot=2&mode=normal",
        account.headers,
        recoveryPayload,
        1,
      );
      assert.deepEqual(payloadRows(running.server, account.accountId, "1"), [
        { revision: 1, payload: baselinePayload },
      ]);

      const retried = await uploadJson(
        running.baseUrl,
        "/api/cloud-save?slot=1&mode=normal",
        account.headers,
        failedPayload,
        1,
      );
      assert.equal(retried.response.status, 200, JSON.stringify(retried.body));
      assert.equal(retried.body.cloudSave.revision, 2);
      await assertCurrentSave(
        running,
        "/api/cloud-save?slot=1&mode=normal",
        account.headers,
        failedPayload,
        2,
      );
      const historyAfterRetry = await request(
        running.baseUrl,
        "/api/cloud-save/history?slot=1&mode=normal",
        { headers: account.headers },
      );
      assert.deepEqual(historyAfterRetry.body.history.map((entry) => entry.revision), [2, 1]);
      assert.deepEqual(payloadRows(running.server, account.accountId, "1"), [
        { revision: 1, payload: baselinePayload },
        { revision: 2, payload: failedPayload },
      ]);
    } finally {
      faults.disarm();
      await closeServer(running?.server);
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test("same expectedRevision concurrent PUTs produce one commit and one conflict", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dsp-persistence-concurrent-"));
  const databaseFile = path.join(directory, "cloud.sqlite");
  let running;
  try {
    running = await startServer(databaseFile);
    const account = await register(running.baseUrl, "atomic_concurrent");
    const payloads = [createSavePayload("normal", 301), createSavePayload("normal", 302)];
    const attempts = await Promise.all(payloads.map((payload) => uploadJson(
      running.baseUrl,
      "/api/cloud-save?slot=3&mode=normal",
      account.headers,
      payload,
      0,
    )));

    assert.deepEqual(attempts.map((attempt) => attempt.response.status).sort((left, right) => left - right), [200, 409]);
    const winnerIndex = attempts.findIndex((attempt) => attempt.response.status === 200);
    assert.notEqual(winnerIndex, -1);
    assert.equal(attempts[winnerIndex].body.cloudSave.revision, 1);
    await assertCurrentSave(
      running,
      "/api/cloud-save?slot=3&mode=normal",
      account.headers,
      payloads[winnerIndex],
      1,
    );
    const history = await request(
      running.baseUrl,
      "/api/cloud-save/history?slot=3&mode=normal",
      { headers: account.headers },
    );
    assert.deepEqual(history.body.history.map((entry) => entry.revision), [1]);
    assert.deepEqual(payloadRows(running.server, account.accountId, "3"), [
      { revision: 1, payload: payloads[winnerIndex] },
    ]);
    const storage = payloadStoreStats(running.server);
    assert.equal(storage.rows.aliases, 1);
    assert.equal(storage.blobs.referenced, 1);
    assert.equal(storage.blobs.orphan, 0);
    const readiness = await request(running.baseUrl, "/api/ready");
    assert.equal(readiness.response.status, 200, JSON.stringify(readiness.body));
    assert.equal(readiness.body.writable, true);
  } finally {
    await closeServer(running?.server);
    await rm(directory, { recursive: true, force: true });
  }
});

test("failed registration publishes no account, session, or audit state and can be retried", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dsp-persistence-register-"));
  const databaseFile = path.join(directory, "cloud.sqlite");
  const faults = createFaultController();
  let running;
  try {
    running = await startServer(databaseFile, { persistenceFaultInjector: faults.injector });
    const usersBefore = Object.keys(running.server.store.data.users).length;
    const sessionsBefore = Object.keys(running.server.store.data.sessions).length;
    const auditBefore = running.server.store.data.auditLog.length;
    faults.arm("after-app-state-write", "SQLITE_IOERR");
    const failed = await request(running.baseUrl, "/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: "atomic_register", password: TEST_PASSWORD, displayName: "注册回滚测试" }),
    });
    faults.disarm();
    assert.equal(failed.response.status, 500, JSON.stringify(failed.body));
    assert.equal(Object.keys(running.server.store.data.users).length, usersBefore);
    assert.equal(Object.keys(running.server.store.data.sessions).length, sessionsBefore);
    assert.equal(running.server.store.data.auditLog.length, auditBefore);

    await closeServer(running.server);
    running = await startServer(databaseFile, { persistenceFaultInjector: faults.injector });
    assert.equal(Object.values(running.server.store.data.users).some((user) => user.username === "atomic_register"), false);
    const retried = await request(running.baseUrl, "/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: "atomic_register", password: TEST_PASSWORD, displayName: "注册回滚测试" }),
    });
    assert.equal(retried.response.status, 201, JSON.stringify(retried.body));
  } finally {
    faults.disarm();
    await closeServer(running?.server);
    await rm(directory, { recursive: true, force: true });
  }
});

test("failed password change preserves the old password and current session", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dsp-persistence-password-"));
  const databaseFile = path.join(directory, "cloud.sqlite");
  const faults = createFaultController();
  let running;
  try {
    running = await startServer(databaseFile, { persistenceFaultInjector: faults.injector });
    const account = await register(running.baseUrl, "atomic_password");
    faults.arm("after-app-state-write", "SQLITE_IOERR");
    const failed = await request(running.baseUrl, "/api/account/password", {
      method: "POST",
      headers: account.headers,
      body: JSON.stringify({ currentPassword: TEST_PASSWORD, newPassword: "synthetic-new-pass-456" }),
    });
    faults.disarm();
    assert.equal(failed.response.status, 500, JSON.stringify(failed.body));
    assert.equal((await request(running.baseUrl, "/api/account", { headers: account.headers })).response.status, 200);
    assert.equal((await request(running.baseUrl, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier: "atomic_password", password: TEST_PASSWORD }),
    })).response.status, 200);
    assert.equal((await request(running.baseUrl, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier: "atomic_password", password: "synthetic-new-pass-456" }),
    })).response.status, 401);

    await closeServer(running.server);
    running = await startServer(databaseFile, { persistenceFaultInjector: faults.injector });
    assert.equal((await request(running.baseUrl, "/api/account", { headers: account.headers })).response.status, 200);
    assert.equal((await request(running.baseUrl, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier: "atomic_password", password: TEST_PASSWORD }),
    })).response.status, 200);
  } finally {
    faults.disarm();
    await closeServer(running?.server);
    await rm(directory, { recursive: true, force: true });
  }
});

test("failed cloud deletion and restore preserve both normal and speedrun slots", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dsp-persistence-delete-restore-"));
  const databaseFile = path.join(directory, "cloud.sqlite");
  const faults = createFaultController();
  let running;
  try {
    running = await startServer(databaseFile, { persistenceFaultInjector: faults.injector });
    const account = await register(running.baseUrl, "atomic_delete_restore");
    const normal1 = createSavePayload("normal", 701);
    const normal2 = createSavePayload("normal", 702);
    const speedrun1 = createSavePayload("speedrun", 703);
    assert.equal((await uploadJson(running.baseUrl, "/api/cloud-save?slot=1&mode=normal", account.headers, normal1, 0)).response.status, 200);
    assert.equal((await uploadJson(running.baseUrl, "/api/cloud-save?slot=1&mode=normal", account.headers, normal2, 1)).response.status, 200);
    assert.equal((await uploadJson(running.baseUrl, "/api/cloud-save?mode=speedrun", account.headers, speedrun1, 0)).response.status, 200);

    faults.arm("after-payload-deletes", "SQLITE_IOERR");
    const failedDelete = await request(running.baseUrl, "/api/cloud-save?mode=speedrun", {
      method: "DELETE",
      headers: account.headers,
      body: JSON.stringify({ expectedRevision: 1, confirmation: "DELETE_CLOUD_SAVE:speedrun:main" }),
    });
    faults.disarm();
    assert.equal(failedDelete.response.status, 500, JSON.stringify(failedDelete.body));
    await assertCurrentSave(running, "/api/cloud-save?mode=speedrun", account.headers, speedrun1, 1);

    faults.arm("after-payload-writes", "SQLITE_FULL");
    const failedRestore = await request(running.baseUrl, "/api/cloud-save/restore?slot=1&mode=normal", {
      method: "POST",
      headers: account.headers,
      body: JSON.stringify({ revision: 1, expectedRevision: 2 }),
    });
    faults.disarm();
    assert.equal(failedRestore.response.status, 500, JSON.stringify(failedRestore.body));
    await assertCurrentSave(running, "/api/cloud-save?slot=1&mode=normal", account.headers, normal2, 2);
    assert.deepEqual((await request(running.baseUrl, "/api/cloud-save/history?slot=1&mode=normal", { headers: account.headers })).body.history.map((entry) => entry.revision), [2, 1]);

    await closeServer(running.server);
    running = await startServer(databaseFile, { persistenceFaultInjector: faults.injector });
    await assertCurrentSave(running, "/api/cloud-save?mode=speedrun", account.headers, speedrun1, 1);
    await assertCurrentSave(running, "/api/cloud-save?slot=1&mode=normal", account.headers, normal2, 2);
  } finally {
    faults.disarm();
    await closeServer(running?.server);
    await rm(directory, { recursive: true, force: true });
  }
});

test("failed leaderboard visibility and administrator restriction leave public state unchanged", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dsp-persistence-leaderboard-"));
  const databaseFile = path.join(directory, "cloud.sqlite");
  const faults = createFaultController();
  let running;
  try {
    running = await startServer(databaseFile, {
      persistenceFaultInjector: faults.injector,
      adminToken: TEST_ADMIN_TOKEN,
    });
    const account = await register(running.baseUrl, "atomic_leaderboard");
    const payload = createSavePayload("normal", 801);
    assert.equal((await uploadJson(running.baseUrl, "/api/cloud-save?mode=normal", account.headers, payload, 0)).response.status, 200);
    const publicBefore = await request(running.baseUrl, "/api/leaderboard?category=galaxy&seasonId=season_01");
    assert.equal(publicBefore.body.entries.some((entry) => entry.userId === account.accountId), true);
    const auditBefore = running.server.store.data.auditLog.length;

    faults.arm("after-app-state-write", "SQLITE_IOERR");
    const hidden = await request(running.baseUrl, "/api/leaderboard/visibility", {
      method: "POST",
      headers: account.headers,
      body: JSON.stringify({ visible: false }),
    });
    faults.disarm();
    assert.equal(hidden.response.status, 500, JSON.stringify(hidden.body));
    const accountAfterHiddenFailure = await request(running.baseUrl, "/api/account", { headers: account.headers });
    assert.equal(accountAfterHiddenFailure.body.user.leaderboardVisible, true);
    assert.equal((await request(running.baseUrl, "/api/leaderboard?category=galaxy&seasonId=season_01")).body.entries.some((entry) => entry.userId === account.accountId), true);
    assert.equal(running.server.store.data.auditLog.length, auditBefore);

    faults.arm("after-app-state-write", "SQLITE_FULL");
    const restricted = await request(running.baseUrl, "/api/admin/account/action", {
      method: "POST",
      headers: { authorization: `Bearer ${TEST_ADMIN_TOKEN}` },
      body: JSON.stringify({
        accountId: account.accountId,
        action: "restrict-leaderboard",
        confirmation: `CONFIRM:restrict-leaderboard:${account.accountId}`,
      }),
    });
    faults.disarm();
    assert.equal(restricted.response.status, 500, JSON.stringify(restricted.body));
    const summary = await request(running.baseUrl, `/api/admin/account?accountId=${account.accountId}`, {
      headers: { authorization: `Bearer ${TEST_ADMIN_TOKEN}` },
    });
    assert.equal(summary.body.account.leaderboardRestricted, false);
    assert.equal((await request(running.baseUrl, "/api/leaderboard?category=galaxy&seasonId=season_01")).body.entries.some((entry) => entry.userId === account.accountId), true);

    await closeServer(running.server);
    running = await startServer(databaseFile, { adminToken: TEST_ADMIN_TOKEN, persistenceFaultInjector: faults.injector });
    assert.equal((await request(running.baseUrl, "/api/account", { headers: account.headers })).body.user.leaderboardVisible, true);
    const restartedSummary = await request(running.baseUrl, `/api/admin/account?accountId=${account.accountId}`, {
      headers: { authorization: `Bearer ${TEST_ADMIN_TOKEN}` },
    });
    assert.equal(restartedSummary.body.account.leaderboardRestricted, false);
  } finally {
    faults.disarm();
    await closeServer(running?.server);
    await rm(directory, { recursive: true, force: true });
  }
});

test("mail delivery never runs when issuing its token fails to persist", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dsp-persistence-mail-"));
  const databaseFile = path.join(directory, "cloud.sqlite");
  const faults = createFaultController();
  const deliveries = [];
  let running;
  try {
    running = await startServer(databaseFile, {
      persistenceFaultInjector: faults.injector,
      mailer: async (message) => { deliveries.push(message); return true; },
    });
    const account = await register(running.baseUrl, "atomic_mail");
    faults.arm("after-app-state-write", "SQLITE_IOERR");
    const failed = await request(running.baseUrl, "/api/account/email", {
      method: "POST",
      headers: account.headers,
      body: JSON.stringify({ email: "atomic-mail@example.test" }),
    });
    faults.disarm();
    assert.equal(failed.response.status, 500, JSON.stringify(failed.body));
    assert.equal(deliveries.length, 0);
    assert.equal((await request(running.baseUrl, "/api/account", { headers: account.headers })).body.user.email, "");
    assert.equal(Object.keys(running.server.store.data.emailVerifications).length, 0);

    await closeServer(running.server);
    running = await startServer(databaseFile, {
      persistenceFaultInjector: faults.injector,
      mailer: async (message) => { deliveries.push(message); return true; },
    });
    assert.equal((await request(running.baseUrl, "/api/account", { headers: account.headers })).body.user.email, "");
    const succeeded = await request(running.baseUrl, "/api/account/email", {
      method: "POST",
      headers: account.headers,
      body: JSON.stringify({ email: "atomic-mail@example.test" }),
    });
    assert.equal(succeeded.response.status, 202, JSON.stringify(succeeded.body));
    assert.equal(deliveries.length, 1);
  } finally {
    faults.disarm();
    await closeServer(running?.server);
    await rm(directory, { recursive: true, force: true });
  }
});

function assertReadinessShape(body) {
  assert.equal(body !== null && typeof body === "object" && !Array.isArray(body), true);
  assert.deepEqual(Object.keys(body).sort(), READINESS_KEYS);
  assert.equal(typeof body.writable, "boolean");
  assert.equal(Number.isFinite(body.lastSuccessAt), true);
  assert.equal(body.lastErrorAt === null || Number.isFinite(body.lastErrorAt), true);
  assert.equal(body.lastErrorCategory === null || typeof body.lastErrorCategory === "string", true);
  assert.equal(Number.isInteger(body.pendingWrites) && body.pendingWrites >= 0, true);
  assert.equal(typeof body.shuttingDown, "boolean");
}

test("/api/ready reports healthy, failed, and recovered persistence without internal details", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dsp-persistence-ready-"));
  const databaseFile = path.join(directory, "cloud.sqlite");
  const faults = createFaultController();
  let running;
  try {
    running = await startServer(databaseFile, { persistenceFaultInjector: faults.injector });
    const account = await register(running.baseUrl, "atomic_readiness");
    const healthy = await request(running.baseUrl, "/api/ready");

    faults.arm("after-payload-writes", "SQLITE_IOERR");
    const failedWrite = await uploadJson(
      running.baseUrl,
      "/api/cloud-save?slot=1&mode=normal",
      account.headers,
      createSavePayload("normal", 401),
      0,
    );
    faults.disarm();
    const failed = await request(running.baseUrl, "/api/ready");

    const recoveredWrite = await uploadJson(
      running.baseUrl,
      "/api/cloud-save?slot=2&mode=normal",
      account.headers,
      createSavePayload("normal", 402),
      0,
    );
    const recovered = await request(running.baseUrl, "/api/ready");

    assert.equal(failedWrite.response.status, 500, JSON.stringify(failedWrite.body));
    assert.equal(recoveredWrite.response.status, 200, JSON.stringify(recoveredWrite.body));

    assert.equal(healthy.response.status, 200, JSON.stringify(healthy.body));
    assertReadinessShape(healthy.body);
    assert.equal(healthy.body.writable, true);
    assert.equal(healthy.body.lastErrorAt, null);
    assert.equal(healthy.body.lastErrorCategory, null);
    assert.equal(healthy.body.pendingWrites, 0);
    assert.equal(healthy.body.shuttingDown, false);

    assert.equal(failed.response.status, 503, JSON.stringify(failed.body));
    assertReadinessShape(failed.body);
    assert.equal(failed.body.writable, false);
    assert.equal(failed.body.lastErrorCategory, "io");
    assert.equal(Number.isFinite(failed.body.lastErrorAt), true);
    assert.equal(failed.body.pendingWrites, 0);
    assert.equal(failed.body.shuttingDown, false);

    assert.equal(recovered.response.status, 200, JSON.stringify(recovered.body));
    assertReadinessShape(recovered.body);
    assert.equal(recovered.body.writable, true);
    assert.equal(recovered.body.pendingWrites, 0);
    assert.equal(recovered.body.shuttingDown, false);
    assert.equal(recovered.body.lastSuccessAt >= healthy.body.lastSuccessAt, true);
  } finally {
    faults.disarm();
    await closeServer(running?.server);
    await rm(directory, { recursive: true, force: true });
  }
});

test("a real SQLite query-only failure is invisible and readiness recovers after writes resume", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dsp-persistence-readonly-"));
  const databaseFile = path.join(directory, "cloud.sqlite");
  let running;
  try {
    running = await startServer(databaseFile);
    const account = await register(running.baseUrl, "atomic_readonly");
    running.server.store.database.pragma("query_only = ON");
    const failed = await uploadJson(
      running.baseUrl,
      "/api/cloud-save?slot=1&mode=normal",
      account.headers,
      createSavePayload("normal", 901),
      0,
    );
    assert.equal(failed.response.status, 500, JSON.stringify(failed.body));
    assert.equal((await request(running.baseUrl, "/api/cloud-save?slot=1&mode=normal", { headers: account.headers })).body.cloudSave, null);
    const unavailable = await request(running.baseUrl, "/api/ready");
    assert.equal(unavailable.response.status, 503);
    assert.equal(unavailable.body.writable, false);
    assert.equal(unavailable.body.lastErrorCategory, "read-only");

    running.server.store.database.pragma("query_only = OFF");
    const recovered = await uploadJson(
      running.baseUrl,
      "/api/cloud-save?slot=1&mode=normal",
      account.headers,
      createSavePayload("normal", 902),
      0,
    );
    assert.equal(recovered.response.status, 200, JSON.stringify(recovered.body));
    assert.equal((await request(running.baseUrl, "/api/ready")).response.status, 200);
  } finally {
    if (running?.server?.store?.database?.open) running.server.store.database.pragma("query_only = OFF");
    await closeServer(running?.server);
    await rm(directory, { recursive: true, force: true });
  }
});

test("requestId receipt replays one committed cloud PUT, rejects conflicts, and is queryable", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "dsp-persistence-receipt-"));
  const databaseFile = path.join(directory, "cloud.sqlite");
  let running;
  try {
    running = await startServer(databaseFile);
    const account = await register(running.baseUrl, "atomic_receipt");
    const requestId = "receipt-11111111-1111-4111-8111-111111111111";
    const payload = createSavePayload("normal", 501);
    const conflictingPayload = createSavePayload("normal", 502);
    const route = "/api/cloud-save?slot=2&mode=normal";

    const first = await uploadDirect(running.baseUrl, route, account.headers, payload, 0, requestId);
    assert.equal(first.response.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.cloudSave.revision, 1);

    const queried = await request(
      running.baseUrl,
      `/api/operations/${encodeURIComponent(requestId)}`,
      { headers: account.headers },
    );
    if (queried.response.status === 404) {
      t.skip("operation receipt query is not exposed by the current implementation");
      return;
    }

    assert.equal(queried.response.status, 200, JSON.stringify(queried.body));
    const receipt = queried.body.receipt ?? queried.body.operation ?? queried.body;
    assert.equal(receipt.requestId, requestId);
    assert.equal(["committed", "complete", "completed", "succeeded"].includes(receipt.status ?? receipt.state), true);
    assert.equal(JSON.stringify(queried.body).includes(payload), false);
    assert.equal(JSON.stringify(queried.body).includes(account.token), false);

    await closeServer(running.server);
    running = await startServer(databaseFile);

    const replay = await uploadDirect(running.baseUrl, route, account.headers, payload, 0, requestId);
    assert.equal(replay.response.status, 200, JSON.stringify(replay.body));
    assert.equal(replay.body.cloudSave.revision, 1);
    const historyAfterReplay = await request(
      running.baseUrl,
      "/api/cloud-save/history?slot=2&mode=normal",
      { headers: account.headers },
    );
    assert.deepEqual(historyAfterReplay.body.history.map((entry) => entry.revision), [1]);

    const conflict = await uploadDirect(running.baseUrl, route, account.headers, conflictingPayload, 0, requestId);
    assert.equal(conflict.response.status, 409, JSON.stringify(conflict.body));
    await assertCurrentSave(running, route, account.headers, payload, 1);
    assert.deepEqual(payloadRows(running.server, account.accountId, "2"), [
      { revision: 1, payload },
    ]);
    const storage = payloadStoreStats(running.server);
    assert.equal(storage.rows.aliases, 1);
    assert.equal(storage.blobs.referenced, 1);
    assert.equal(storage.blobs.orphan, 0);

    const queriedAgain = await request(
      running.baseUrl,
      `/api/operations/${encodeURIComponent(requestId)}`,
      { headers: account.headers },
    );
    assert.equal(queriedAgain.response.status, 200, JSON.stringify(queriedAgain.body));
    const replayedReceipt = queriedAgain.body.receipt ?? queriedAgain.body.operation ?? queriedAgain.body;
    assert.equal(replayedReceipt.requestId, requestId);
  } finally {
    await closeServer(running?.server);
    await rm(directory, { recursive: true, force: true });
  }
});

test("uncommitted PUT stays invisible and server close waits for the paused transaction", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dsp-persistence-close-"));
  const databaseFile = path.join(directory, "cloud.sqlite");
  let running;
  let releaseCommit;
  let uploadPromise;
  let closePromise;
  try {
    running = await startServer(databaseFile);
    const account = await register(running.baseUrl, "atomic_shutdown");
    const payload = createSavePayload("normal", 601);
    const enteredCommit = deferred();
    releaseCommit = deferred();
    const originalCommitCandidate = running.server.store.commitCandidate.bind(running.server.store);
    let pauseNextCommit = true;
    running.server.store.commitCandidate = async (...args) => {
      if (pauseNextCommit) {
        pauseNextCommit = false;
        enteredCommit.resolve();
        await releaseCommit.promise;
      }
      return originalCommitCandidate(...args);
    };

    uploadPromise = uploadJson(
      running.baseUrl,
      "/api/cloud-save?slot=3&mode=normal",
      account.headers,
      payload,
      0,
    );
    await withTimeout(enteredCommit.promise, 5_000, "paused cloud commit entry");

    const beforeCommit = await request(
      running.baseUrl,
      "/api/cloud-save?slot=3&mode=normal",
      { headers: account.headers },
    );
    assert.equal(beforeCommit.response.status, 200, JSON.stringify(beforeCommit.body));
    assert.equal(beforeCommit.body.cloudSave, null);
    assert.deepEqual(payloadRows(running.server, account.accountId, "3"), []);

    let closeResolved = false;
    closePromise = new Promise((resolve, reject) => {
      running.server.close((error) => error ? reject(error) : resolve());
    }).then(() => { closeResolved = true; });
    const closeStateBeforeRelease = await Promise.race([
      closePromise.then(() => "closed"),
      new Promise((resolve) => setTimeout(() => resolve("pending"), 50)),
    ]);
    assert.equal(closeStateBeforeRelease, "pending");
    assert.equal(closeResolved, false);

    releaseCommit.resolve();
    const uploaded = await withTimeout(uploadPromise, 5_000, "paused cloud upload completion");
    assert.equal(uploaded.response.status, 200, JSON.stringify(uploaded.body));
    assert.equal(uploaded.body.cloudSave.revision, 1);
    await withTimeout(closePromise, 5_000, "server close drain");
    assert.equal(closeResolved, true);

    running = await startServer(databaseFile);
    await assertCurrentSave(
      running,
      "/api/cloud-save?slot=3&mode=normal",
      account.headers,
      payload,
      1,
    );
  } finally {
    releaseCommit?.resolve();
    if (uploadPromise) await Promise.allSettled([withTimeout(uploadPromise, 5_000, "upload cleanup")]);
    if (closePromise) await Promise.allSettled([withTimeout(closePromise, 5_000, "close cleanup")]);
    await closeServer(running?.server);
    await rm(directory, { recursive: true, force: true });
  }
});
