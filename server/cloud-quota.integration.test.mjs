import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createCloudServer } from "./index.mjs";
import { computeSaveStateChecksum } from "./save-integrity.mjs";

const TEST_PASSWORD = "synthetic-quota-pass-123";
const PAYLOAD_BYTES = 1_500;

function quotaPolicy(overrides = {}) {
  return {
    revisionBytes: 2_000,
    slotBytes: 6_000,
    modeBytes: 24_000,
    accountBytes: 48_000,
    historyRevisions: 4,
    ...overrides,
  };
}

function createV46State(mode, sequence, quotaPadding) {
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
    quotaPadding,
  };
}

function serializeSave(mode, sequence, quotaPadding) {
  const state = createV46State(mode, sequence, quotaPadding);
  const envelope = {
    formatVersion: 2,
    savedAt: 100_000 + sequence,
    mode,
    state,
  };
  return JSON.stringify({
    ...envelope,
    checksum: computeSaveStateChecksum(envelope.formatVersion, state),
  });
}

function createSavePayload(mode, sequence, targetBytes = PAYLOAD_BYTES) {
  const empty = serializeSave(mode, sequence, "");
  const paddingBytes = targetBytes - Buffer.byteLength(empty);
  assert.ok(paddingBytes >= 0, `target ${targetBytes} is smaller than the legal v46 envelope`);
  const payload = serializeSave(mode, sequence, "x".repeat(paddingBytes));
  assert.equal(Buffer.byteLength(payload), targetBytes, "synthetic payload size must be exact");
  return payload;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
    arm(phase, code = "SQLITE_IOERR") {
      armed = { phase, code };
    },
    disarm() {
      armed = null;
    },
  };
}

async function startServer(databaseFile, policy, options = {}) {
  const server = await createCloudServer({
    databaseFile,
    cloudQuotaPolicy: policy,
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

async function withHarness(prefix, policy, callback, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), `dsp-cloud-quota-${prefix}-`));
  const databaseFile = path.join(directory, "cloud.sqlite");
  let running;
  const harness = {
    databaseFile,
    get running() {
      return running;
    },
    async restart() {
      await closeServer(running?.server);
      running = await startServer(databaseFile, policy, options);
      return running;
    },
  };
  try {
    running = await startServer(databaseFile, policy, options);
    await callback(harness);
  } finally {
    await closeServer(running?.server);
    await rm(directory, { recursive: true, force: true });
  }
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

async function register(running, username) {
  const registered = await request(running.baseUrl, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      username,
      password: TEST_PASSWORD,
      displayName: "云配额合成账号",
    }),
  });
  assert.equal(registered.response.status, 201, JSON.stringify(registered.body));
  return {
    accountId: registered.body.user.id,
    token: registered.body.token,
    headers: { authorization: `Bearer ${registered.body.token}` },
  };
}

function cloudRoute(mode, slot, suffix = "") {
  const parameters = new URLSearchParams({ mode, slot });
  if (suffix) parameters.set("revision", suffix);
  return `/api/cloud-save?${parameters}`;
}

async function uploadSave(running, account, mode, slot, payload, expectedRevision) {
  return request(running.baseUrl, cloudRoute(mode, slot), {
    method: "PUT",
    headers: account.headers,
    body: JSON.stringify({ payload, expectedRevision }),
  });
}

async function mustUpload(running, account, mode, slot, payload, expectedRevision) {
  const uploaded = await uploadSave(running, account, mode, slot, payload, expectedRevision);
  assert.equal(uploaded.response.status, 200, JSON.stringify(uploaded.body));
  assert.equal(uploaded.body.cloudSave.revision, expectedRevision + 1);
  assert.equal(uploaded.body.cloudSave.mode, mode);
  assert.equal(uploaded.body.cloudSave.slot, slot);
  assert.equal(uploaded.body.cloudSave.size, Buffer.byteLength(payload));
  assert.equal(uploaded.body.cloudSave.checksum, sha256(payload));
  return uploaded.body.cloudSave;
}

async function quotaSnapshot(running, account) {
  const result = await request(running.baseUrl, "/api/cloud-save/quota", { headers: account.headers });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body.cloudQuota;
}

async function history(running, account, mode, slot) {
  const result = await request(
    running.baseUrl,
    `/api/cloud-save/history?${new URLSearchParams({ mode, slot })}`,
    { headers: account.headers },
  );
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body.history;
}

async function download(running, account, mode, slot, revision = null) {
  const result = await request(
    running.baseUrl,
    cloudRoute(mode, slot, revision === null ? "" : String(revision)),
    { headers: account.headers },
  );
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body.cloudSave;
}

async function restore(running, account, mode, slot, revision, expectedRevision) {
  return request(
    running.baseUrl,
    `/api/cloud-save/restore?${new URLSearchParams({ mode, slot })}`,
    {
      method: "POST",
      headers: account.headers,
      body: JSON.stringify({ revision, expectedRevision }),
    },
  );
}

function payloadRows(server, accountId) {
  return server.store.database.prepare(`
    SELECT slot, revision, payload
    FROM cloud_save_payloads
    WHERE user_id = ?
    ORDER BY slot ASC, revision ASC
  `).all(accountId);
}

function revisionsForStorageSlot(server, accountId, storageSlot) {
  return server.store.database.prepare(`
    SELECT revision
    FROM cloud_save_payloads
    WHERE user_id = ? AND slot = ?
    ORDER BY revision ASC
  `).all(accountId, storageSlot).map((entry) => entry.revision);
}

function appStatePayload(server) {
  return server.store.database.prepare("SELECT payload FROM app_state WHERE id = 1").get().payload;
}

async function historyRevisionMap(running, account, targets) {
  return Object.fromEntries(await Promise.all(targets.map(async ([mode, slot]) => [
    `${mode}:${slot}`,
    (await history(running, account, mode, slot)).map((entry) => entry.revision),
  ])));
}

test("GET quota snapshots isolate normal/speedrun main and manual slots", async () => {
  const policy = quotaPolicy({
    revisionBytes: 3_000,
    slotBytes: 10_000,
    modeBytes: 50_000,
    accountBytes: 100_000,
    historyRevisions: 5,
  });
  await withHarness("snapshot", policy, async (harness) => {
    const { running } = harness;
    const account = await register(running, "quota_snapshot");
    const sizes = {
      normal: { main: 1_500, "1": 1_510, "2": 1_520, "3": 1_530 },
      speedrun: { main: 1_600, "1": 1_610, "2": 1_620, "3": 1_630 },
    };
    let sequence = 10;
    for (const mode of ["normal", "speedrun"]) {
      for (const slot of ["main", "1", "2", "3"]) {
        await mustUpload(running, account, mode, slot, createSavePayload(mode, sequence, sizes[mode][slot]), 0);
        sequence += 1;
      }
    }

    const snapshot = await quotaSnapshot(running, account);
    assert.equal(snapshot.version, "cloud-quota-v1");
    assert.deepEqual(snapshot.limits, policy);
    let expectedAccountBytes = 0;
    for (const mode of ["normal", "speedrun"]) {
      let expectedModeBytes = 0;
      assert.deepEqual(Object.keys(snapshot.usage.modes[mode].slots).sort(), ["1", "2", "3", "main"]);
      for (const slot of ["main", "1", "2", "3"]) {
        const usage = snapshot.usage.modes[mode].slots[slot];
        assert.equal(usage.logicalBytes, sizes[mode][slot], `${mode}/${slot} logical bytes`);
        assert.equal(usage.uniquePayloadBytes, sizes[mode][slot], `${mode}/${slot} unique bytes`);
        assert.equal(usage.revisionCount, 1, `${mode}/${slot} revision count`);
        expectedModeBytes += sizes[mode][slot];
      }
      assert.equal(snapshot.usage.modes[mode].logicalBytes, expectedModeBytes);
      assert.equal(snapshot.usage.modes[mode].uniquePayloadBytes, expectedModeBytes);
      assert.equal(snapshot.usage.modes[mode].revisionCount, 4);
      expectedAccountBytes += expectedModeBytes;
    }
    assert.equal(snapshot.usage.logicalBytes, expectedAccountBytes);
    assert.equal(snapshot.usage.uniquePayloadBytes, expectedAccountBytes);
    assert.equal(snapshot.usage.revisionCount, 8);

    const accountResult = await request(running.baseUrl, "/api/account", { headers: account.headers });
    assert.equal(accountResult.response.status, 200, JSON.stringify(accountResult.body));
    assert.deepEqual(accountResult.body.cloudQuota, snapshot, "/api/account and quota endpoint must agree");
  });
});

test("POST quota preflight accepts byte boundaries and rejects invalid inputs", async () => {
  const policy = quotaPolicy({
    revisionBytes: 2_000,
    slotBytes: 10_000,
    modeBytes: 20_000,
    accountBytes: 40_000,
    historyRevisions: 5,
  });
  await withHarness("preflight", policy, async (harness) => {
    const { running } = harness;
    const account = await register(running, "quota_preflight");
    const preflight = (body, headers = account.headers) => request(running.baseUrl, "/api/cloud-save/quota", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    for (const [size, accepted] of [[1_999, true], [2_000, true], [2_001, false]]) {
      const result = await preflight({ mode: "normal", slot: "main", size, checksum: "a".repeat(64) });
      assert.equal(result.response.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.plan.accepted, accepted, `preflight size ${size}`);
      assert.equal(result.body.plan.incoming.bytes, size);
      if (!accepted) {
        assert.equal(result.body.plan.reason, "revisionBytes");
        assert.equal(result.body.plan.code, "CLOUD_REVISION_QUOTA_EXCEEDED");
      }
    }

    const invalidCases = [
      [{ mode: "normal", slot: "4", size: 100 }, "CLOUD_QUOTA_TARGET_INVALID"],
      [{ mode: "sandbox", slot: "main", size: 100 }, "SAVE_MODE_INVALID"],
      [{ mode: "normal", slot: "main", size: -1 }, "CLOUD_QUOTA_INPUT_INVALID"],
      [{ mode: "normal", slot: "main", size: 1.5 }, "CLOUD_QUOTA_INPUT_INVALID"],
      [{ mode: "normal", slot: "main", size: 100, checksum: "not-a-checksum" }, "CLOUD_QUOTA_INPUT_INVALID"],
    ];
    for (const [body, code] of invalidCases) {
      const result = await preflight(body);
      assert.equal(result.response.status, 400, JSON.stringify(result.body));
      assert.equal(result.body.code, code);
    }
    const oversized = await preflight({ mode: "normal", slot: "main", size: Number.MAX_SAFE_INTEGER });
    assert.equal(oversized.response.status, 413, JSON.stringify(oversized.body));
    assert.equal(oversized.body.code, "SAVE_SIZE_TOO_LARGE");
    assert.equal(oversized.body.originalBytes, Number.MAX_SAFE_INTEGER);
    assert.equal(oversized.body.expandedBytes, Number.MAX_SAFE_INTEGER);
    assert.ok(oversized.body.originalBytes > oversized.body.payloadLimitBytes);
    assert.equal(oversized.body.overBytes, oversized.body.originalBytes - oversized.body.payloadLimitBytes);
    assert.equal((await preflight({ mode: "normal", slot: "main", size: 100 }, {})).response.status, 401);

    const snapshot = await quotaSnapshot(running, account);
    assert.equal(snapshot.usage.logicalBytes, 0, "preflight must remain read-only");
    assert.deepEqual(payloadRows(running.server, account.accountId), []);
  });
});

test("PUT prunes only oldest target history and preserves an adjacent revision for download and restore", async () => {
  const policy = quotaPolicy({
    revisionBytes: 2_000,
    slotBytes: 4_500,
    modeBytes: 9_000,
    accountBytes: 18_000,
    historyRevisions: 3,
  });
  await withHarness("put-prune", policy, async (harness) => {
    const { running } = harness;
    const account = await register(running, "quota_put_prune");
    const payloads = [1, 2, 3, 4].map((sequence) => createSavePayload("normal", 100 + sequence));
    for (let index = 0; index < 3; index += 1) {
      await mustUpload(running, account, "normal", "1", payloads[index], index);
    }
    await mustUpload(running, account, "normal", "1", payloads[3], 3);

    assert.deepEqual((await history(running, account, "normal", "1")).map((entry) => entry.revision), [4, 3, 2]);
    assert.deepEqual(revisionsForStorageSlot(running.server, account.accountId, "1"), [2, 3, 4]);
    assert.equal((await download(running, account, "normal", "1")).payload, payloads[3]);
    assert.equal((await download(running, account, "normal", "1", 3)).payload, payloads[2]);
    assert.equal(await download(running, account, "normal", "1", 1), null, "pruned revision must no longer download");

    const restored = await restore(running, account, "normal", "1", 3, 4);
    assert.equal(restored.response.status, 200, JSON.stringify(restored.body));
    assert.equal(restored.body.cloudSave.revision, 5);
    assert.equal(restored.body.cloudSave.restoredFromRevision, 3);
    assert.deepEqual((await history(running, account, "normal", "1")).map((entry) => entry.revision), [5, 4, 3]);
    assert.deepEqual(revisionsForStorageSlot(running.server, account.accountId, "1"), [3, 4, 5]);
    assert.equal((await download(running, account, "normal", "1")).payload, payloads[2]);
    assert.equal((await download(running, account, "normal", "1", 4)).payload, payloads[3], "previous latest revision must survive restore");
  });
});

test("quota pruning never deletes another slot or mode", async () => {
  const policy = quotaPolicy({
    revisionBytes: 2_000,
    slotBytes: 3_000,
    modeBytes: 12_000,
    accountBytes: 24_000,
    historyRevisions: 2,
  });
  await withHarness("target-only", policy, async (harness) => {
    const { running } = harness;
    const account = await register(running, "quota_target_only");
    const normalOne = [createSavePayload("normal", 201), createSavePayload("normal", 202)];
    const normalTwo = [createSavePayload("normal", 211), createSavePayload("normal", 212)];
    const speedrunOne = [createSavePayload("speedrun", 221), createSavePayload("speedrun", 222)];
    for (let index = 0; index < 2; index += 1) {
      await mustUpload(running, account, "normal", "1", normalOne[index], index);
      await mustUpload(running, account, "normal", "2", normalTwo[index], index);
      await mustUpload(running, account, "speedrun", "1", speedrunOne[index], index);
    }
    const untouchedRowsBefore = payloadRows(running.server, account.accountId)
      .filter((entry) => entry.slot === "2" || entry.slot === "speedrun:1");

    const normalThird = createSavePayload("normal", 203);
    await mustUpload(running, account, "normal", "1", normalThird, 2);

    assert.deepEqual((await history(running, account, "normal", "1")).map((entry) => entry.revision), [3, 2]);
    assert.deepEqual((await history(running, account, "normal", "2")).map((entry) => entry.revision), [2, 1]);
    assert.deepEqual((await history(running, account, "speedrun", "1")).map((entry) => entry.revision), [2, 1]);
    assert.deepEqual(
      payloadRows(running.server, account.accountId).filter((entry) => entry.slot === "2" || entry.slot === "speedrun:1"),
      untouchedRowsBefore,
    );
    assert.equal((await download(running, account, "normal", "2")).payload, normalTwo[1]);
    assert.equal((await download(running, account, "speedrun", "1")).payload, speedrunOne[1]);
  });
});

test("an impossible account quota returns 507 without applying its proposed target-slot prune", async () => {
  const policy = quotaPolicy({
    revisionBytes: 2_000,
    slotBytes: 5_000,
    modeBytes: 6_500,
    accountBytes: 7_500,
    historyRevisions: 20,
  });
  await withHarness("reject", policy, async (harness) => {
    const { running } = harness;
    const account = await register(running, "quota_reject");
    const targetOne = createSavePayload("normal", 301);
    const targetTwo = createSavePayload("normal", 302);
    const normalOther = createSavePayload("normal", 311);
    const speedrunTwo = createSavePayload("speedrun", 321);
    const speedrunThree = createSavePayload("speedrun", 331);
    await mustUpload(running, account, "normal", "1", targetOne, 0);
    await mustUpload(running, account, "normal", "1", targetTwo, 1);
    await mustUpload(running, account, "normal", "2", normalOther, 0);
    await mustUpload(running, account, "speedrun", "2", speedrunTwo, 0);
    await mustUpload(running, account, "speedrun", "3", speedrunThree, 0);

    const targets = [["normal", "1"], ["normal", "2"], ["speedrun", "2"], ["speedrun", "3"]];
    const quotaBefore = await quotaSnapshot(running, account);
    const historyBefore = await historyRevisionMap(running, account, targets);
    const rowsBefore = payloadRows(running.server, account.accountId);
    const appStateBefore = appStatePayload(running.server);

    const rejected = await uploadSave(
      running,
      account,
      "normal",
      "1",
      createSavePayload("normal", 303, 1_800),
      2,
    );
    assert.equal(rejected.response.status, 507, JSON.stringify(rejected.body));
    assert.equal(rejected.body.code, "CLOUD_ACCOUNT_BYTES_QUOTA_EXCEEDED");
    assert.equal(rejected.body.plan.accepted, false);
    assert.equal(rejected.body.plan.reason, "accountBytes");
    assert.deepEqual(rejected.body.plan.prune.revisions, [1], "the read-only plan may propose only target history");

    assert.deepEqual(await quotaSnapshot(running, account), quotaBefore);
    assert.deepEqual(await historyRevisionMap(running, account, targets), historyBefore);
    assert.deepEqual(payloadRows(running.server, account.accountId), rowsBefore);
    assert.equal(appStatePayload(running.server), appStateBefore);
    assert.equal((await download(running, account, "normal", "1")).payload, targetTwo);
    assert.equal((await download(running, account, "normal", "1", 1)).payload, targetOne);
  });
});

test("same-checksum revisions consume logical quota per revision while unique bytes are deduplicated", async () => {
  const policy = quotaPolicy({
    revisionBytes: 2_000,
    slotBytes: 6_000,
    modeBytes: 12_000,
    accountBytes: 24_000,
    historyRevisions: 5,
  });
  await withHarness("dedupe", policy, async (harness) => {
    const { running } = harness;
    const account = await register(running, "quota_dedupe");
    const repeatedPayload = createSavePayload("normal", 401, 1_600);
    for (let revision = 0; revision < 3; revision += 1) {
      await mustUpload(running, account, "normal", "1", repeatedPayload, revision);
    }

    const snapshot = await quotaSnapshot(running, account);
    const slot = snapshot.usage.modes.normal.slots["1"];
    assert.equal(slot.revisionCount, 3);
    assert.equal(slot.logicalBytes, 4_800);
    assert.equal(slot.uniquePayloadBytes, 1_600);
    assert.equal(slot.remainingBytes, 1_200);
    assert.equal(snapshot.usage.logicalBytes, 4_800);
    assert.equal(snapshot.usage.uniquePayloadBytes, 1_600);
    assert.equal(new Set((await history(running, account, "normal", "1")).map((entry) => entry.checksum)).size, 1);
    const rows = payloadRows(running.server, account.accountId);
    assert.equal(rows.length, 3, "logical revisions remain independently restorable");
    assert.equal(new Set(rows.map((entry) => entry.payload)).size, 1);
  });
});

test("restore obeys quota pruning and rolls back the prune and restored revision together", async () => {
  const policy = quotaPolicy({
    revisionBytes: 2_000,
    slotBytes: 4_500,
    modeBytes: 9_000,
    accountBytes: 18_000,
    historyRevisions: 3,
  });
  const faults = createFaultController();
  await withHarness("restore", policy, async (harness) => {
    const account = await register(harness.running, "quota_restore");
    const payloads = [501, 502, 503].map((sequence) => createSavePayload("normal", sequence));
    for (let index = 0; index < payloads.length; index += 1) {
      await mustUpload(harness.running, account, "normal", "2", payloads[index], index);
    }

    const restored = await restore(harness.running, account, "normal", "2", 1, 3);
    assert.equal(restored.response.status, 200, JSON.stringify(restored.body));
    assert.equal(restored.body.cloudSave.revision, 4);
    assert.equal(restored.body.cloudSave.restoredFromRevision, 1);
    assert.deepEqual((await history(harness.running, account, "normal", "2")).map((entry) => entry.revision), [4, 3, 2]);
    assert.deepEqual(revisionsForStorageSlot(harness.running.server, account.accountId, "2"), [2, 3, 4]);
    assert.equal((await download(harness.running, account, "normal", "2")).payload, payloads[0]);

    const quotaBeforeFailure = await quotaSnapshot(harness.running, account);
    const rowsBeforeFailure = payloadRows(harness.running.server, account.accountId);
    const appStateBeforeFailure = appStatePayload(harness.running.server);
    faults.arm("after-payload-writes", "SQLITE_IOERR");
    const failed = await restore(harness.running, account, "normal", "2", 2, 4);
    faults.disarm();
    assert.equal(failed.response.status, 500, JSON.stringify(failed.body));
    assert.deepEqual((await history(harness.running, account, "normal", "2")).map((entry) => entry.revision), [4, 3, 2]);
    assert.deepEqual(await quotaSnapshot(harness.running, account), quotaBeforeFailure);
    assert.deepEqual(payloadRows(harness.running.server, account.accountId), rowsBeforeFailure);
    assert.equal(appStatePayload(harness.running.server), appStateBeforeFailure);

    await harness.restart();
    assert.deepEqual((await history(harness.running, account, "normal", "2")).map((entry) => entry.revision), [4, 3, 2]);
    assert.deepEqual(payloadRows(harness.running.server, account.accountId), rowsBeforeFailure);
    assert.equal((await download(harness.running, account, "normal", "2")).payload, payloads[0]);
  }, { persistenceFaultInjector: faults.injector });
  faults.disarm();
});

test("persistence failure exposes neither a quota prune nor its new PUT revision in memory or SQLite", async () => {
  const policy = quotaPolicy({
    revisionBytes: 2_000,
    slotBytes: 3_000,
    modeBytes: 9_000,
    accountBytes: 18_000,
    historyRevisions: 2,
  });
  const faults = createFaultController();
  await withHarness("put-fault", policy, async (harness) => {
    const account = await register(harness.running, "quota_put_fault");
    const first = createSavePayload("normal", 601);
    const second = createSavePayload("normal", 602);
    const third = createSavePayload("normal", 603);
    await mustUpload(harness.running, account, "normal", "3", first, 0);
    await mustUpload(harness.running, account, "normal", "3", second, 1);

    const quotaBefore = await quotaSnapshot(harness.running, account);
    const rowsBefore = payloadRows(harness.running.server, account.accountId);
    const appStateBefore = appStatePayload(harness.running.server);
    faults.arm("after-app-state-write", "SQLITE_FULL");
    const failed = await uploadSave(harness.running, account, "normal", "3", third, 2);
    faults.disarm();
    assert.equal(failed.response.status, 500, JSON.stringify(failed.body));
    assert.deepEqual((await history(harness.running, account, "normal", "3")).map((entry) => entry.revision), [2, 1]);
    assert.equal((await download(harness.running, account, "normal", "3")).payload, second);
    assert.equal((await download(harness.running, account, "normal", "3", 1)).payload, first);
    assert.deepEqual(await quotaSnapshot(harness.running, account), quotaBefore);
    assert.deepEqual(payloadRows(harness.running.server, account.accountId), rowsBefore);
    assert.equal(appStatePayload(harness.running.server), appStateBefore);

    await harness.restart();
    assert.deepEqual((await history(harness.running, account, "normal", "3")).map((entry) => entry.revision), [2, 1]);
    assert.deepEqual(payloadRows(harness.running.server, account.accountId), rowsBefore);
    assert.equal((await download(harness.running, account, "normal", "3")).payload, second);

    await mustUpload(harness.running, account, "normal", "3", third, 2);
    assert.deepEqual((await history(harness.running, account, "normal", "3")).map((entry) => entry.revision), [3, 2]);
    assert.deepEqual(revisionsForStorageSlot(harness.running.server, account.accountId, "3"), [2, 3]);
  }, { persistenceFaultInjector: faults.injector });
  faults.disarm();
});

test("server restart preserves quota snapshots, bodies, and history metadata", async () => {
  const policy = quotaPolicy({
    revisionBytes: 2_000,
    slotBytes: 8_000,
    modeBytes: 24_000,
    accountBytes: 48_000,
    historyRevisions: 4,
  });
  await withHarness("restart", policy, async (harness) => {
    const account = await register(harness.running, "quota_restart");
    const normalMain = [createSavePayload("normal", 701), createSavePayload("normal", 702)];
    const speedrunMain = [createSavePayload("speedrun", 711), createSavePayload("speedrun", 712)];
    const normalThree = createSavePayload("normal", 721);
    await mustUpload(harness.running, account, "normal", "main", normalMain[0], 0);
    await mustUpload(harness.running, account, "normal", "main", normalMain[1], 1);
    await mustUpload(harness.running, account, "speedrun", "main", speedrunMain[0], 0);
    await mustUpload(harness.running, account, "speedrun", "main", speedrunMain[1], 1);
    await mustUpload(harness.running, account, "normal", "3", normalThree, 0);

    const targets = [["normal", "main"], ["speedrun", "main"], ["normal", "3"]];
    const quotaBefore = await quotaSnapshot(harness.running, account);
    const historiesBefore = Object.fromEntries(await Promise.all(targets.map(async ([mode, slot]) => [
      `${mode}:${slot}`,
      await history(harness.running, account, mode, slot),
    ])));
    const rowsBefore = payloadRows(harness.running.server, account.accountId);
    const downloadsBefore = {
      normalMain: await download(harness.running, account, "normal", "main"),
      normalMainOne: await download(harness.running, account, "normal", "main", 1),
      speedrunMain: await download(harness.running, account, "speedrun", "main"),
      normalThree: await download(harness.running, account, "normal", "3"),
    };

    await harness.restart();
    assert.deepEqual(await quotaSnapshot(harness.running, account), quotaBefore);
    assert.deepEqual(payloadRows(harness.running.server, account.accountId), rowsBefore);
    for (const [mode, slot] of targets) {
      assert.deepEqual(await history(harness.running, account, mode, slot), historiesBefore[`${mode}:${slot}`]);
    }
    assert.deepEqual(await download(harness.running, account, "normal", "main"), downloadsBefore.normalMain);
    assert.deepEqual(await download(harness.running, account, "normal", "main", 1), downloadsBefore.normalMainOne);
    assert.deepEqual(await download(harness.running, account, "speedrun", "main"), downloadsBefore.speedrunMain);
    assert.deepEqual(await download(harness.running, account, "normal", "3"), downloadsBefore.normalThree);
    const accountResult = await request(harness.running.baseUrl, "/api/account", { headers: account.headers });
    assert.equal(accountResult.response.status, 200, JSON.stringify(accountResult.body));
    assert.deepEqual(accountResult.body.cloudQuota, quotaBefore);
  });
});

test("normal and speedrun revisions in the same public slot remain independently quota-governed", async () => {
  const policy = quotaPolicy({
    revisionBytes: 2_000,
    slotBytes: 3_000,
    modeBytes: 9_000,
    accountBytes: 18_000,
    historyRevisions: 2,
  });
  await withHarness("mode-slot", policy, async (harness) => {
    const { running } = harness;
    const account = await register(running, "quota_mode_slot");
    const normal = [801, 802, 803].map((sequence) => createSavePayload("normal", sequence));
    const speedrun = [811, 812, 813].map((sequence) => createSavePayload("speedrun", sequence));
    for (let index = 0; index < 3; index += 1) {
      await mustUpload(running, account, "normal", "2", normal[index], index);
      await mustUpload(running, account, "speedrun", "2", speedrun[index], index);
    }

    assert.deepEqual((await history(running, account, "normal", "2")).map((entry) => entry.revision), [3, 2]);
    assert.deepEqual((await history(running, account, "speedrun", "2")).map((entry) => entry.revision), [3, 2]);
    assert.equal((await download(running, account, "normal", "2")).payload, normal[2]);
    assert.equal((await download(running, account, "speedrun", "2")).payload, speedrun[2]);
    assert.equal((await download(running, account, "normal", "2", 2)).payload, normal[1]);
    assert.equal((await download(running, account, "speedrun", "2", 2)).payload, speedrun[1]);
    assert.deepEqual(revisionsForStorageSlot(running.server, account.accountId, "2"), [2, 3]);
    assert.deepEqual(revisionsForStorageSlot(running.server, account.accountId, "speedrun:2"), [2, 3]);

    const snapshot = await quotaSnapshot(running, account);
    for (const mode of ["normal", "speedrun"]) {
      assert.equal(snapshot.usage.modes[mode].slots["2"].revisionCount, 2);
      assert.equal(snapshot.usage.modes[mode].slots["2"].logicalBytes, 3_000);
      assert.equal(snapshot.usage.modes[mode].slots["1"].revisionCount, 0);
    }
  });
});
