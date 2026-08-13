import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createCloudServer } from "./index.mjs";
import { computeSaveStateChecksum } from "./save-integrity.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function save(mode, slot, revision, elapsedSeconds) {
  const state = {
    // The route test targets import atomicity and mode/slot preservation. Use
    // a compact historical state that is valid without constructing every v46
    // gameplay field; v46 authority is covered by the save-contract suites.
    version: 24,
    mode,
    elapsedSeconds,
    entities: [],
    belts: [],
    totalProduced: { universe_matrix: elapsedSeconds },
    metrics: { generationKw: 1_000, totalItemsPerMinute: 0, rayGenerationKw: 0 },
    exploration: { unlockedSystemIds: ["helios"], colonizedPlanetIds: ["home"] },
    speedrun: mode === "speedrun" ? {
      enabled: true,
      mode: "speedrun",
      eligible: true,
      rulesetVersion: "speedrun-v1",
      seasonId: "season_01",
      factoryId: "synthetic_legacy_json_factory",
      startedAt: 1,
      elapsedActiveSeconds: elapsedSeconds,
      baseline: {},
      milestones: {},
    } : undefined,
  };
  const envelope = { formatVersion: 2, savedAt: 1_786_600_000_000 + revision, mode, state };
  const payload = JSON.stringify({ ...envelope, checksum: computeSaveStateChecksum(2, state) });
  return {
    mode,
    slot,
    revision,
    updatedAt: envelope.savedAt,
    size: Buffer.byteLength(payload),
    checksum: sha256(payload),
    payload,
  };
}

async function withRuntime(operation) {
  const directory = await mkdtemp(path.join(tmpdir(), "dsp-legacy-json-http-"));
  const databaseFile = path.join(directory, "cloud.sqlite");
  const server = await createCloudServer({
    databaseFile,
    registrationLimit: 100,
    allowedOrigin: "https://dsponline.cn,https://localhost",
    logger: { error() {} },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const call = async (route, options = {}) => {
    const response = await fetch(`${baseUrl}${route}`, options);
    return { response, body: await response.json() };
  };
  try {
    await operation({ server, call, databaseFile });
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
}

async function register(call, username) {
  const result = await call("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "legacy-json-pass-123", displayName: "合成导入账号" }),
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  return result.body;
}

async function preview(call, token) {
  const result = await call("/api/account/import/archive", { headers: { authorization: `Bearer ${token}` } });
  assert.equal(result.response.status, 200);
  return result.body.import;
}

function importHeaders(token, guard, contentLength) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/vnd.dspidle.account-export+json; charset=utf-8",
    "content-length": String(contentLength),
    "x-dsp-account-import-guard": guard,
    "x-dsp-account-import-confirmation": `REPLACE_CLOUD_SAVES:${guard}`,
  };
}

test("legacy JSON HTTP import atomically installs normal/speedrun modes and survives restart", async () => {
  await withRuntime(async ({ server, call, databaseFile }) => {
    const account = await register(call, "LegacyHttpPilot");
    const normal = save("normal", "main", 7, 700);
    const normalSlot = save("normal", "1", 8, 800);
    const speedrun = save("speedrun", "main", 9, 900);
    const exportBody = JSON.stringify({
      exportedAt: 1_786_600_000_000,
      schemaVersion: 7,
      user: { id: account.user.id },
      cloudSave: normal,
      cloudSaveSlots: { "1": normalSlot },
      cloudSavesByMode: {
        normal: { main: normal, slots: { "1": normalSlot } },
        speedrun: { main: speedrun, slots: {} },
      },
    });
    const confirmation = await preview(call, account.token);
    const imported = await call("/api/account/import/legacy-json", {
      method: "POST",
      headers: importHeaders(account.token, confirmation.guard, Buffer.byteLength(exportBody)),
      body: exportBody,
    });
    assert.equal(imported.response.status, 200, JSON.stringify(imported.body));
    assert.equal(imported.body.imported, true);
    assert.equal(imported.body.revisionCount, 3);
    assert.equal(imported.body.modes.normal.main.revision, 7);
    assert.equal(imported.body.modes.normal["1"].revision, 8);
    assert.equal(imported.body.modes.speedrun.main.revision, 9);
    assert.equal(imported.body.leaderboardRevalidationRequired.normal, true);
    assert.equal(imported.body.leaderboardRevalidationRequired.speedrun, true);
    for (const [route, expected] of [
      ["/api/cloud-save?mode=normal", normal],
      ["/api/cloud-save?mode=normal&slot=1", normalSlot],
      ["/api/cloud-save?mode=speedrun", speedrun],
    ]) {
      const downloaded = await call(route, { headers: { authorization: `Bearer ${account.token}` } });
      assert.equal(downloaded.response.status, 200);
      assert.equal(downloaded.body.cloudSave.payload, expected.payload);
      assert.equal(downloaded.body.cloudSave.checksum, expected.checksum);
    }

    await new Promise((resolve) => server.close(resolve));
    const reopened = await createCloudServer({ databaseFile, logger: { error() {} } });
    await new Promise((resolve) => reopened.listen(0, "127.0.0.1", resolve));
    try {
      assert.equal(reopened.store.data.cloudSaves[account.user.id].revision, 7);
      assert.equal(reopened.store.data.cloudSavesByMode[account.user.id].speedrun.revision, 9);
      assert.equal(reopened.store.readCloudSavePayload(account.user.id, "main", 7), normal.payload);
      assert.equal(reopened.store.readCloudSavePayload(account.user.id, "speedrun:main", 9), speedrun.payload);
    } finally {
      await new Promise((resolve) => reopened.close(resolve));
    }
  });
});

test("legacy JSON corruption, account mismatch and stale guard leave SQLite authority unchanged", async () => {
  await withRuntime(async ({ server, call }) => {
    const account = await register(call, "LegacyRejectPilot");
    const existing = save("normal", "main", 1, 100);
    const upload = await call("/api/cloud-save", {
      method: "PUT",
      headers: { authorization: `Bearer ${account.token}`, "content-type": "application/json" },
      body: JSON.stringify({ payload: existing.payload, expectedRevision: 0 }),
    });
    assert.equal(upload.response.status, 200);
    const before = JSON.stringify(server.store.data);
    const beforePayload = server.store.readCloudSavePayload(account.user.id, "main", 1);
    const confirmation = await preview(call, account.token);
    const candidate = save("speedrun", "main", 3, 300);
    const invalidCases = [
      {
        expected: 409,
        body: JSON.stringify({ exportedAt: 1, schemaVersion: 7, user: { id: "other_account" }, cloudSavesByMode: { speedrun: { main: candidate, slots: {} } } }),
      },
      {
        expected: 400,
        body: JSON.stringify({ exportedAt: 1, schemaVersion: 7, user: { id: account.user.id }, cloudSave: { ...existing, checksum: "0".repeat(64) } }),
      },
    ];
    for (const entry of invalidCases) {
      const rejected = await call("/api/account/import/legacy-json", {
        method: "POST",
        headers: importHeaders(account.token, confirmation.guard, Buffer.byteLength(entry.body)),
        body: entry.body,
      });
      assert.equal(rejected.response.status, entry.expected, JSON.stringify(rejected.body));
      assert.equal(JSON.stringify(server.store.data), before);
      assert.equal(server.store.readCloudSavePayload(account.user.id, "main", 1), beforePayload);
      assert.equal(server.store.data.cloudSavesByMode[account.user.id], undefined);
    }
    const staleBody = JSON.stringify({ exportedAt: 1, schemaVersion: 7, user: { id: account.user.id }, cloudSavesByMode: { speedrun: { main: candidate, slots: {} } } });
    const stale = await call("/api/account/import/legacy-json", {
      method: "POST",
      headers: importHeaders(account.token, "f".repeat(64), Buffer.byteLength(staleBody)),
      body: staleBody,
    });
    assert.equal(stale.response.status, 409);
    assert.equal(JSON.stringify(server.store.data), before);
  });
});
