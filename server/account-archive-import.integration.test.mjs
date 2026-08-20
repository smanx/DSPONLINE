import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { createAccountArchiveZipStream } from "./account-archive.mjs";
import { ACCOUNT_ARCHIVE_IMPORT_CONTENT_TYPE } from "./account-archive-import.mjs";
import { createCloudServer, inspectDecodedCloudSaveUpload } from "./index.mjs";
import { computeSaveStateChecksum } from "./save-integrity.mjs";

const PASSWORD = "synthetic-import-pass-123";
const MODES = ["normal", "speedrun"];
const SLOTS = ["main", "1", "2", "3"];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function createV46State(mode, sequence, paddingBytes = 0) {
  return {
    version: 46,
    mode,
    elapsedSeconds: 600 + sequence * 60,
    entities: [{ id: `storage_${sequence}`, kind: "storage", buildingId: "storage_mk1" }],
    belts: [{ id: `belt_${sequence}`, source: `storage_${sequence}`, target: `storage_${sequence}`, itemId: "iron_ore" }],
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
    metrics: { generationKw: sequence, totalItemsPerMinute: sequence, rayGenerationKw: 0 },
    exploration: { unlockedSystemIds: ["helios"], colonizedPlanetIds: ["home"] },
    ...(paddingBytes > 0 ? { syntheticPadding: "x".repeat(paddingBytes) } : {}),
  };
}

function savePayload(mode, sequence, paddingBytes = 0) {
  const state = createV46State(mode, sequence, paddingBytes);
  const envelope = { formatVersion: 2, savedAt: 1_000_000 + sequence, mode, state };
  return JSON.stringify({
    ...envelope,
    checksum: computeSaveStateChecksum(envelope.formatVersion, state),
  });
}

async function start(databaseFile, options = {}) {
  const server = await createCloudServer({
    databaseFile,
    accountArchiveTemporaryRoot: options.temporaryRoot,
    persistenceFaultInjector: options.persistenceFaultInjector,
    accountArchivePayloadInspector: options.accountArchivePayloadInspector,
    cloudQuotaPolicy: options.cloudQuotaPolicy,
    registrationLimit: 100,
    historyPruneIntervalMs: 0,
    backupIntervalMs: 0,
    mailer: null,
    logger: { error() {} },
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function close(server) {
  if (!server?.listening) return;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function jsonRequest(baseUrl, route, options = {}) {
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
    try { body = JSON.parse(text); } catch { body = text; }
  }
  return { response, body, text };
}

async function register(running, username) {
  const result = await jsonRequest(running.baseUrl, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password: PASSWORD, displayName: `合成账号 ${username}` }),
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  return {
    id: result.body.user.id,
    token: result.body.token,
    headers: { authorization: `Bearer ${result.body.token}` },
  };
}

async function upload(running, account, mode, slot, payload, expectedRevision) {
  const result = await jsonRequest(
    running.baseUrl,
    `/api/cloud-save?mode=${mode}&slot=${slot}`,
    {
      method: "PUT",
      headers: account.headers,
      body: JSON.stringify({ payload, expectedRevision }),
    },
  );
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body.cloudSave;
}

async function download(running, account, mode, slot, revision = null) {
  const suffix = revision == null ? "" : `&revision=${revision}`;
  const result = await jsonRequest(running.baseUrl, `/api/cloud-save?mode=${mode}&slot=${slot}${suffix}`, { headers: account.headers });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body.cloudSave;
}

async function history(running, account, mode, slot) {
  const result = await jsonRequest(running.baseUrl, `/api/cloud-save/history?mode=${mode}&slot=${slot}`, { headers: account.headers });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body.history;
}

async function exportArchive(running, account) {
  const response = await fetch(`${running.baseUrl}/api/account/export/archive`, { headers: account.headers });
  assert.equal(response.status, 200);
  return Buffer.from(await response.arrayBuffer());
}

async function previewImport(running, account) {
  const result = await jsonRequest(running.baseUrl, "/api/account/import/archive", { headers: account.headers });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body.import;
}

async function importArchive(running, account, archive, preview, headers = {}) {
  return jsonRequest(running.baseUrl, "/api/account/import/archive", {
    method: "POST",
    headers: {
      ...account.headers,
      "content-type": ACCOUNT_ARCHIVE_IMPORT_CONTENT_TYPE,
      "x-dsp-account-import-guard": preview.guard,
      "x-dsp-account-import-confirmation": preview.confirmation,
      ...headers,
    },
    body: archive,
  });
}

function storageRows(server, userId) {
  return server.store.database.prepare(`
    SELECT user_id AS userId, slot, revision, payload
    FROM cloud_save_payloads
    WHERE user_id = ?
    ORDER BY slot, revision
  `).all(userId);
}

function durableFingerprint(server, userId) {
  return {
    rows: storageRows(server, userId),
    blobs: server.store.database.prepare("SELECT checksum, size_bytes AS sizeBytes, payload FROM cloud_save_payload_blobs ORDER BY checksum").all(),
  };
}

function stateProjection(server, userId) {
  const data = server.store.data;
  return structuredClone({
    user: data.users[userId],
    sessions: Object.values(data.sessions).filter((entry) => entry.userId === userId),
    controls: data.accountControls[userId] ?? null,
    moderation: data.leaderboardModeration[userId] ?? null,
    submissions: Object.values(data.submissions).filter((entry) => entry.userId === userId || entry.accountId === userId),
    speedrunSubmissions: Object.values(data.speedrunSubmissions).filter((entry) => entry.userId === userId),
    feedback: data.feedback.filter((entry) => entry.userId === userId),
    errors: data.errors.filter((entry) => entry.userId === userId),
    auditActions: data.auditLog.map((entry) => entry.action),
    cloud: {
      normalMain: data.cloudSaves[userId] ?? null,
      normalMainHistory: data.cloudSaveHistory[userId] ?? [],
      normalSlots: data.cloudSaveSlots[userId] ?? {},
      normalSlotHistory: data.cloudSaveSlotHistory[userId] ?? {},
      speedrunMain: data.cloudSavesByMode[userId]?.speedrun ?? null,
      speedrunMainHistory: data.cloudSaveHistoryByMode[userId]?.speedrun ?? [],
      speedrunSlots: data.cloudSaveSlotsByMode[userId]?.speedrun ?? {},
      speedrunSlotHistory: data.cloudSaveSlotHistoryByMode[userId]?.speedrun ?? {},
    },
  });
}

async function temporaryDirectoryEmpty(directory) {
  try { return (await readdir(directory)).length === 0; }
  catch (error) { if (error?.code === "ENOENT") return true; throw error; }
}

async function withHarness(label, operation, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), `dspidle-import-http-${label}-`));
  const temporaryRoot = path.join(directory, "imports");
  const databaseFile = path.join(directory, "cloud.sqlite");
  let running;
  try {
    running = await start(databaseFile, { ...options, temporaryRoot });
    await operation({
      directory,
      temporaryRoot,
      databaseFile,
      get running() { return running; },
      async restart(restartOptions = options) {
        await close(running.server);
        running = await start(databaseFile, { ...restartOptions, temporaryRoot });
      },
    });
  } finally {
    await close(running?.server);
    await rm(directory, { recursive: true, force: true });
  }
}

test("archive import round-trips all normal/speedrun slots and revisions across restart", async () => {
  await withHarness("matrix", async (harness) => {
    const { running } = harness;
    const account = await register(running, "import_matrix");
    const expected = new Map();
    let sequence = 10;
    for (const mode of MODES) {
      for (const slot of SLOTS) {
        for (let revision = 1; revision <= 2; revision += 1) {
          const payload = savePayload(mode, sequence++);
          await upload(running, account, mode, slot, payload, revision - 1);
          expected.set(`${mode}:${slot}:${revision}`, payload);
        }
      }
    }
    const archive = await exportArchive(running, account);
    for (const mode of MODES) for (const slot of SLOTS) {
      await upload(running, account, mode, slot, savePayload(mode, sequence++), 2);
    }
    const preview = await previewImport(running, account);
    const result = await importArchive(running, account, archive, preview);
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.revisionCount, 16);
    assert.deepEqual(result.body.leaderboardRevalidationRequired, { normal: true, speedrun: true });
    assert.notEqual(result.body.guard, preview.guard);
    assert.equal(await temporaryDirectoryEmpty(harness.temporaryRoot), true);

    for (const mode of MODES) for (const slot of SLOTS) {
      assert.deepEqual((await history(running, account, mode, slot)).map((entry) => entry.revision), [2, 1]);
      for (const revision of [1, 2]) {
        assert.equal((await download(running, account, mode, slot, revision)).payload, expected.get(`${mode}:${slot}:${revision}`));
      }
    }
    await harness.restart();
    for (const mode of MODES) for (const slot of SLOTS) {
      assert.equal((await download(harness.running, account, mode, slot)).payload, expected.get(`${mode}:${slot}:2`));
    }
    assert.equal(await temporaryDirectoryEmpty(harness.temporaryRoot), true);
  });
});

test("archive import preserves identity, sessions, moderation and existing leaderboard history", async () => {
  await withHarness("preserve", async ({ running, temporaryRoot }) => {
    const account = await register(running, "import_preserve");
    const original = savePayload("normal", 100);
    await upload(running, account, "normal", "main", original, 0);
    const archive = await exportArchive(running, account);
    running.server.store.data.accountControls[account.id] = {
      source: "synthetic-existing",
      createdAt: 456,
      loginDisabledUntil: Date.now() + 60_000,
    };
    running.server.store.data.submissions[`season_01:${account.id}`] = {
      userId: account.id,
      accountId: account.id,
      seasonId: "season_01",
      marker: "existing-galaxy-history",
    };
    running.server.store.data.speedrunSubmissions.synthetic = {
      userId: account.id,
      submissionId: "existing-speedrun-history",
      marker: "existing-speedrun-history",
    };
    await running.server.store.persist({ operation: "test.seed-preserved-state" });
    const before = stateProjection(running.server, account.id);

    const preview = await previewImport(running, account);
    const result = await importArchive(running, account, archive, preview);
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    const after = stateProjection(running.server, account.id);
    assert.deepEqual(after.user, before.user);
    assert.deepEqual(after.sessions.map(({ lastSeenAt: _lastSeenAt, ...entry }) => entry), before.sessions.map(({ lastSeenAt: _lastSeenAt, ...entry }) => entry));
    assert.deepEqual(after.moderation, before.moderation);
    assert.deepEqual(after.submissions, before.submissions);
    assert.deepEqual(after.speedrunSubmissions, before.speedrunSubmissions);
    assert.equal(after.controls.source, before.controls.source);
    assert.equal(after.controls.createdAt, before.controls.createdAt);
    assert.equal(after.controls.loginDisabledUntil, before.controls.loginDisabledUntil);
    assert.equal(after.controls.leaderboardResumeAfterRevisionByMode.normal, 1);
    assert.equal(await temporaryDirectoryEmpty(temporaryRoot), true);
  });
});

test("archive import refuses another account and invalid confirmation without modifying either account", async () => {
  await withHarness("identity", async ({ running, temporaryRoot }) => {
    const first = await register(running, "import_owner_a");
    const second = await register(running, "import_owner_b");
    await upload(running, first, "normal", "main", savePayload("normal", 200), 0);
    await upload(running, second, "normal", "main", savePayload("normal", 201), 0);
    const archive = await exportArchive(running, first);
    const secondBefore = durableFingerprint(running.server, second.id);
    const preview = await previewImport(running, second);

    const badConfirmation = await importArchive(running, second, archive, preview, {
      "x-dsp-account-import-confirmation": "WRONG",
    });
    assert.equal(badConfirmation.response.status, 400);
    assert.equal(badConfirmation.body.code, "DSP_IMPORT_CONFIRMATION_INVALID");
    const mismatch = await importArchive(running, second, archive, preview);
    assert.equal(mismatch.response.status, 409, JSON.stringify(mismatch.body));
    assert.equal(mismatch.body.code, "ACCOUNT_ARCHIVE_ACCOUNT_MISMATCH");
    assert.deepEqual(durableFingerprint(running.server, second.id), secondBefore);
    assert.equal(await temporaryDirectoryEmpty(temporaryRoot), true);
  });
});

test("archive validation race returns guard conflict and preserves the concurrent upload", async () => {
  let releaseInspection;
  let inspectionStarted;
  const started = new Promise((resolve) => { inspectionStarted = resolve; });
  const gate = new Promise((resolve) => { releaseInspection = resolve; });
  let calls = 0;
  const inspector = async ({ file, checksum, size, mode }) => {
    calls += 1;
    if (calls === 1) {
      inspectionStarted();
      await gate;
    }
    const raw = await readFile(file);
    return inspectDecodedCloudSaveUpload(raw, {
      direct: true,
      expectedRevision: 0,
      requestId: null,
      declaredOriginalBytes: size,
      payloadLimit: 33_553_408,
    });
  };
  await withHarness("guard-race", async ({ running, temporaryRoot }) => {
    const account = await register(running, "import_guard_race");
    const archived = savePayload("normal", 300);
    await upload(running, account, "normal", "main", archived, 0);
    const archive = await exportArchive(running, account);
    const preview = await previewImport(running, account);
    const importing = importArchive(running, account, archive, preview);
    await started;
    const concurrent = savePayload("normal", 301);
    await upload(running, account, "normal", "main", concurrent, 1);
    releaseInspection();
    const result = await importing;
    assert.equal(result.response.status, 409, JSON.stringify(result.body));
    assert.equal(result.body.code, "ACCOUNT_ARCHIVE_IMPORT_GUARD_CONFLICT");
    assert.equal((await download(running, account, "normal", "main")).payload, concurrent);
    assert.equal((await download(running, account, "normal", "main", 1)).payload, archived);
    assert.equal(await temporaryDirectoryEmpty(temporaryRoot), true);
  }, { accountArchivePayloadInspector: inspector });
});

function faultController() {
  let armed = null;
  return {
    arm(phase) { armed = phase; },
    disarm() { armed = null; },
    injector({ phase }) {
      if (phase !== armed) return;
      const error = new Error(`synthetic ${phase}`);
      error.code = phase === "after-app-state-write" ? "SQLITE_FULL" : "SQLITE_IOERR";
      throw error;
    },
  };
}

for (const phase of ["before-sqlite-transaction", "after-user-payload-deletes", "after-payload-writes", "after-app-state-write", "after-payload-blob-cleanup"]) {
  test(`archive import ${phase} failure leaves memory and SQLite byte-for-byte unchanged`, async () => {
    const faults = faultController();
    await withHarness(`fault-${phase}`, async (harness) => {
      const account = await register(harness.running, `imp_${sha256(phase).slice(0, 12)}`);
      await upload(harness.running, account, "normal", "main", savePayload("normal", 400), 0);
      await upload(harness.running, account, "speedrun", "2", savePayload("speedrun", 401), 0);
      const archive = await exportArchive(harness.running, account);
      await upload(harness.running, account, "normal", "main", savePayload("normal", 402), 1);
      const preview = await previewImport(harness.running, account);
      const beforeDurable = durableFingerprint(harness.running.server, account.id);
      const beforeState = stateProjection(harness.running.server, account.id);
      faults.arm(phase);
      const result = await importArchive(harness.running, account, archive, preview);
      faults.disarm();
      assert.equal(result.response.status, 500, JSON.stringify(result.body));
      assert.deepEqual(durableFingerprint(harness.running.server, account.id), beforeDurable);
      const afterState = stateProjection(harness.running.server, account.id);
      assert.deepEqual({
        ...afterState,
        sessions: afterState.sessions.map(({ lastSeenAt: _lastSeenAt, ...entry }) => entry),
      }, {
        ...beforeState,
        sessions: beforeState.sessions.map(({ lastSeenAt: _lastSeenAt, ...entry }) => entry),
      });
      assert.equal(await temporaryDirectoryEmpty(harness.temporaryRoot), true);
      await harness.restart({ persistenceFaultInjector: faults.injector });
      assert.deepEqual(durableFingerprint(harness.running.server, account.id), beforeDurable);
      const restartedState = stateProjection(harness.running.server, account.id);
      assert.deepEqual({
        ...restartedState,
        sessions: restartedState.sessions.map(({ lastSeenAt: _lastSeenAt, ...entry }) => entry),
      }, {
        ...beforeState,
        sessions: beforeState.sessions.map(({ lastSeenAt: _lastSeenAt, ...entry }) => entry),
      });
    }, { persistenceFaultInjector: faults.injector });
    faults.disarm();
  });
}

test("archive import deduplicates repeated payload bodies while keeping independent revisions restorable", async () => {
  await withHarness("dedupe", async ({ running }) => {
    const account = await register(running, "import_dedupe");
    const repeated = savePayload("normal", 500);
    await upload(running, account, "normal", "main", repeated, 0);
    await upload(running, account, "normal", "main", repeated, 1);
    const archive = await exportArchive(running, account);
    const replaced = savePayload("normal", 501);
    await upload(running, account, "normal", "main", replaced, 2);
    const preview = await previewImport(running, account);
    const result = await importArchive(running, account, archive, preview);
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    const rows = storageRows(running.server, account.id);
    assert.equal(rows.length, 2);
    assert.equal(new Set(rows.map((entry) => entry.payload)).size, 1, "both revisions should store the same small alias");
    const blobs = running.server.store.database.prepare("SELECT checksum FROM cloud_save_payload_blobs").all();
    assert.equal(blobs.filter((entry) => entry.checksum === sha256(repeated)).length, 1);
    assert.equal(blobs.filter((entry) => entry.checksum === sha256(replaced)).length, 0, "replace must remove the last reference to the displaced blob");
    assert.equal((await download(running, account, "normal", "main", 1)).payload, repeated);
    assert.equal((await download(running, account, "normal", "main", 2)).payload, repeated);

    const restored = await jsonRequest(running.baseUrl, "/api/cloud-save/restore?mode=normal&slot=main", {
      method: "POST",
      headers: account.headers,
      body: JSON.stringify({ revision: 1, expectedRevision: 2 }),
    });
    assert.equal(restored.response.status, 200, JSON.stringify(restored.body));
    assert.equal((await download(running, account, "normal", "main")).payload, repeated);
  });
});

test("archive import enforces authentication, content type, length and quota before mutation", async () => {
  await withHarness("boundaries", async ({ running, temporaryRoot }) => {
    const account = await register(running, "import_boundaries");
    await upload(running, account, "normal", "main", savePayload("normal", 600), 0);
    const archive = await exportArchive(running, account);
    const preview = await previewImport(running, account);
    const before = durableFingerprint(running.server, account.id);

    const unauthorized = await jsonRequest(running.baseUrl, "/api/account/import/archive", {
      method: "POST",
      headers: { "content-type": ACCOUNT_ARCHIVE_IMPORT_CONTENT_TYPE },
      body: archive,
    });
    assert.equal(unauthorized.response.status, 401);
    const wrongType = await importArchive(running, account, archive, preview, { "content-type": "application/zip" });
    assert.equal(wrongType.response.status, 415);
    assert.equal(wrongType.body.code, "CONTENT_TYPE_NOT_ALLOWED");
    assert.deepEqual(durableFingerprint(running.server, account.id), before);
    assert.equal(await temporaryDirectoryEmpty(temporaryRoot), true);
  }, {
    cloudQuotaPolicy: {
      revisionBytes: 33_553_408,
      slotBytes: 256 * 1024 * 1024,
      modeBytes: 512 * 1024 * 1024,
      accountBytes: 1024 * 1024 * 1024,
      historyRevisions: 20,
    },
  });
});
