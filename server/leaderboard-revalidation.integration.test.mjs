import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createCloudServer } from "./index.mjs";
import { computeSaveStateChecksum } from "./save-integrity.mjs";

function createPayload(state, mode, savedAt = Date.now()) {
  const markedState = { ...state, mode };
  const envelope = { formatVersion: 2, savedAt, mode, state: markedState };
  return JSON.stringify({
    ...envelope,
    checksum: computeSaveStateChecksum(envelope.formatVersion, markedState),
  });
}

function normalState(elapsedSeconds, produced) {
  return {
    version: 24,
    elapsedSeconds,
    entities: [],
    totalProduced: { universe_matrix: produced },
    metrics: { generationKw: 1_000, totalItemsPerMinute: produced, rayGenerationKw: 0 },
    exploration: { unlockedSystemIds: ["helios"], colonizedPlanetIds: ["home"] },
  };
}

function speedrunState(factoryId, elapsedSeconds = 42) {
  return {
    version: 24,
    elapsedSeconds,
    entities: [],
    contentPacks: [],
    totalProduced: { universe_matrix: 0 },
    dysonSphere: { totalRocketsLaunched: 10_000 },
    research: { completedTechIds: [] },
    speedrun: {
      enabled: true,
      mode: "speedrun",
      rulesetVersion: "speedrun-v1",
      seasonId: "season_01",
      startedAt: Date.now() - 120_000,
      elapsedActiveSeconds: elapsedSeconds,
      baseline: { completedTechIds: [], rocketsLaunched: 0, whiteMatrixProduced: 0 },
      milestones: {
        all_technologies: { completed: false },
        dyson_rockets_10000: { completed: true, completedAtSeconds: elapsedSeconds },
        white_matrix_1m: { completed: false },
      },
      eligible: true,
      factoryId,
    },
  };
}

async function withServer(callback) {
  const directory = await mkdtemp(path.join(tmpdir(), "dsp-leaderboard-revalidation-"));
  const adminToken = "synthetic-review-admin-token-123456";
  const server = await createCloudServer({
    databaseFile: path.join(directory, "cloud.sqlite"),
    adminToken,
    registrationLimit: 100,
    historyPruneIntervalMs: 0,
    logger: { error() {} },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const request = async (route, options = {}) => {
    const response = await fetch(`${baseUrl}${route}`, {
      ...options,
      headers: { "content-type": "application/json", ...(options.headers ?? {}) },
    });
    return { response, body: await response.json() };
  };
  try {
    await callback({ request, adminToken });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
}

test("normal and speedrun review revisions clear independently on upload and restore", async () => {
  await withServer(async ({ request, adminToken }) => {
    const registered = await request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: "review_modes", password: "synthetic-pass-123", displayName: "复核模式测试" }),
    });
    assert.equal(registered.response.status, 201);
    const accountId = registered.body.user.id;
    const headers = { authorization: `Bearer ${registered.body.token}` };
    const adminHeaders = { authorization: `Bearer ${adminToken}` };
    const factoryId = "review_modes_factory_001";

    const normal1 = createPayload(normalState(60, 10), "normal", 1);
    const normal2 = createPayload(normalState(120, 20), "normal", 2);
    const normal3 = createPayload(normalState(180, 30), "normal", 3);
    const speedrun1 = createPayload(speedrunState(factoryId), "speedrun", 4);
    const speedrun2 = createPayload(speedrunState(factoryId), "speedrun", 5);
    assert.equal((await request("/api/cloud-save", {
      method: "PUT", headers, body: JSON.stringify({ payload: normal1, expectedRevision: 0 }),
    })).response.status, 200);
    assert.equal((await request("/api/cloud-save", {
      method: "PUT", headers, body: JSON.stringify({ payload: normal2, expectedRevision: 1 }),
    })).response.status, 200);
    const speedrunUpload1 = await request("/api/cloud-save?mode=speedrun", {
      method: "PUT", headers, body: JSON.stringify({ payload: speedrun1, expectedRevision: 0 }),
    });
    assert.equal(speedrunUpload1.response.status, 200);

    const restrict = await request("/api/admin/account/action", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ accountId, action: "restrict-leaderboard", confirmation: `CONFIRM:restrict-leaderboard:${accountId}` }),
    });
    assert.equal(restrict.response.status, 200);
    const restoreReview = await request("/api/admin/account/action", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ accountId, action: "restore-leaderboard", confirmation: `CONFIRM:restore-leaderboard:${accountId}` }),
    });
    assert.equal(restoreReview.response.status, 200);
    assert.deepEqual(restoreReview.body.account.leaderboardResumeAfterRevisionByMode, { normal: 2, speedrun: 1 });

    const normalUpload3 = await request("/api/cloud-save", {
      method: "PUT", headers, body: JSON.stringify({ payload: normal3, expectedRevision: 2 }),
    });
    assert.equal(normalUpload3.response.status, 200);
    const afterNormal = await request(`/api/admin/account?accountId=${accountId}`, { headers: adminHeaders });
    assert.deepEqual(afterNormal.body.account.leaderboardResumeAfterRevisionByMode, { normal: null, speedrun: 1 });

    const blockedSpeedrun = await request("/api/speedrun/submit", {
      method: "POST",
      headers,
      body: JSON.stringify({
        targetId: "dyson_rockets_10000",
        seasonId: "season_01",
        rulesetVersion: "speedrun-v1",
        factoryId,
        elapsedSeconds: 42,
        saveRevision: 1,
        saveHash: speedrunUpload1.body.cloudSave.checksum,
        clientVersion: "test",
      }),
    });
    assert.equal(blockedSpeedrun.response.status, 403);
    assert.equal(blockedSpeedrun.body.code, "LEADERBOARD_RESTRICTED");

    const speedrunUpload2 = await request("/api/cloud-save?mode=speedrun", {
      method: "PUT", headers, body: JSON.stringify({ payload: speedrun2, expectedRevision: 1 }),
    });
    assert.equal(speedrunUpload2.response.status, 200);
    const afterSpeedrun = await request(`/api/admin/account?accountId=${accountId}`, { headers: adminHeaders });
    assert.deepEqual(afterSpeedrun.body.account.leaderboardResumeAfterRevisionByMode, { normal: null, speedrun: null });
    const acceptedSpeedrun = await request("/api/speedrun/submit", {
      method: "POST",
      headers,
      body: JSON.stringify({
        targetId: "dyson_rockets_10000",
        seasonId: "season_01",
        rulesetVersion: "speedrun-v1",
        factoryId,
        elapsedSeconds: 42,
        saveRevision: 2,
        saveHash: speedrunUpload2.body.cloudSave.checksum,
        clientVersion: "test",
      }),
    });
    assert.equal(acceptedSpeedrun.response.status, 200, JSON.stringify(acceptedSpeedrun.body));

    await request("/api/admin/account/action", {
      method: "POST", headers: adminHeaders,
      body: JSON.stringify({ accountId, action: "restrict-leaderboard", confirmation: `CONFIRM:restrict-leaderboard:${accountId}` }),
    });
    const secondReview = await request("/api/admin/account/action", {
      method: "POST", headers: adminHeaders,
      body: JSON.stringify({ accountId, action: "restore-leaderboard", confirmation: `CONFIRM:restore-leaderboard:${accountId}` }),
    });
    assert.deepEqual(secondReview.body.account.leaderboardResumeAfterRevisionByMode, { normal: 3, speedrun: 2 });

    const restoredNormal = await request("/api/cloud-save/restore", {
      method: "POST", headers, body: JSON.stringify({ revision: 1, expectedRevision: 3 }),
    });
    assert.equal(restoredNormal.response.status, 200);
    assert.equal(restoredNormal.body.cloudSave.revision, 4);
    const afterNormalRestore = await request(`/api/admin/account?accountId=${accountId}`, { headers: adminHeaders });
    assert.deepEqual(afterNormalRestore.body.account.leaderboardResumeAfterRevisionByMode, { normal: null, speedrun: 2 });

    const restoredSpeedrun = await request("/api/cloud-save/restore?mode=speedrun", {
      method: "POST", headers, body: JSON.stringify({ revision: 1, expectedRevision: 2 }),
    });
    assert.equal(restoredSpeedrun.response.status, 200);
    assert.equal(restoredSpeedrun.body.cloudSave.revision, 3);
    const afterSpeedrunRestore = await request(`/api/admin/account?accountId=${accountId}`, { headers: adminHeaders });
    assert.deepEqual(afterSpeedrunRestore.body.account.leaderboardResumeAfterRevisionByMode, { normal: null, speedrun: null });
    assert.equal((await request("/api/cloud-save", { headers })).body.cloudSave.mode, "normal");
    assert.equal((await request("/api/cloud-save?mode=speedrun", { headers })).body.cloudSave.mode, "speedrun");
  });
});

test("hidden accounts complete review without becoming visible and permanent freezes remain blocking", async () => {
  await withServer(async ({ request, adminToken }) => {
    const registered = await request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: "review_hidden", password: "synthetic-pass-123", displayName: "隐藏复核测试" }),
    });
    assert.equal(registered.response.status, 201);
    const accountId = registered.body.user.id;
    const headers = { authorization: `Bearer ${registered.body.token}` };
    const adminHeaders = { authorization: `Bearer ${adminToken}` };
    const factoryId = "review_hidden_factory_001";
    const upload = async (route, payload, expectedRevision) => request(route, {
      method: "PUT", headers, body: JSON.stringify({ payload, expectedRevision }),
    });
    assert.equal((await upload("/api/cloud-save", createPayload(normalState(60, 10), "normal", 10), 0)).response.status, 200);
    const speedrun1 = await upload("/api/cloud-save?mode=speedrun", createPayload(speedrunState(factoryId), "speedrun", 11), 0);
    assert.equal(speedrun1.response.status, 200);
    const initialSpeedrunSubmission = await request("/api/speedrun/submit", {
      method: "POST",
      headers,
      body: JSON.stringify({
        targetId: "dyson_rockets_10000",
        seasonId: "season_01",
        rulesetVersion: "speedrun-v1",
        factoryId,
        elapsedSeconds: 42,
        saveRevision: 1,
        saveHash: speedrun1.body.cloudSave.checksum,
        clientVersion: "test",
      }),
    });
    assert.equal(initialSpeedrunSubmission.response.status, 200, JSON.stringify(initialSpeedrunSubmission.body));
    assert.equal((await request("/api/leaderboard/visibility", {
      method: "POST", headers, body: JSON.stringify({ visible: false }),
    })).response.status, 200);

    await request("/api/admin/account/action", {
      method: "POST", headers: adminHeaders,
      body: JSON.stringify({ accountId, action: "restrict-leaderboard", confirmation: `CONFIRM:restrict-leaderboard:${accountId}` }),
    });
    const review = await request("/api/admin/account/action", {
      method: "POST", headers: adminHeaders,
      body: JSON.stringify({ accountId, action: "restore-leaderboard", confirmation: `CONFIRM:restore-leaderboard:${accountId}` }),
    });
    assert.deepEqual(review.body.account.leaderboardResumeAfterRevisionByMode, { normal: 1, speedrun: 1 });

    assert.equal((await upload("/api/cloud-save", createPayload(normalState(120, 20), "normal", 12), 1)).response.status, 200);
    let summary = await request(`/api/admin/account?accountId=${accountId}`, { headers: adminHeaders });
    assert.deepEqual(summary.body.account.leaderboardResumeAfterRevisionByMode, { normal: null, speedrun: 1 });
    const speedrun2 = await upload("/api/cloud-save?mode=speedrun", createPayload(speedrunState(factoryId), "speedrun", 13), 1);
    assert.equal(speedrun2.response.status, 200);
    summary = await request(`/api/admin/account?accountId=${accountId}`, { headers: adminHeaders });
    assert.equal(summary.body.account.leaderboardVisible, false);
    assert.deepEqual(summary.body.account.leaderboardResumeAfterRevisionByMode, { normal: null, speedrun: null });
    assert.equal((await request("/api/leaderboard?category=galaxy&seasonId=season_01")).body.entries.some((entry) => entry.userId === accountId), false);
    assert.equal((await request("/api/speedrun/leaderboard?targetId=dyson_rockets_10000&seasonId=season_01")).body.entries.some((entry) => entry.userId === accountId), false);

    const frozen = await request("/api/admin/account/action", {
      method: "POST", headers: adminHeaders,
      body: JSON.stringify({ accountId, action: "restrict-leaderboard", confirmation: `CONFIRM:restrict-leaderboard:${accountId}` }),
    });
    assert.equal(frozen.body.account.leaderboardRestricted, true);
    assert.equal((await upload("/api/cloud-save", createPayload(normalState(180, 30), "normal", 14), 2)).response.status, 200);
    assert.equal((await upload("/api/cloud-save?mode=speedrun", createPayload(speedrunState(factoryId), "speedrun", 15), 2)).response.status, 200);
    assert.equal((await request("/api/cloud-save/restore", {
      method: "POST", headers, body: JSON.stringify({ revision: 1, expectedRevision: 3 }),
    })).response.status, 200);
    assert.equal((await request("/api/cloud-save/restore?mode=speedrun", {
      method: "POST", headers, body: JSON.stringify({ revision: 1, expectedRevision: 3 }),
    })).response.status, 200);
    summary = await request(`/api/admin/account?accountId=${accountId}`, { headers: adminHeaders });
    assert.equal(summary.body.account.leaderboardRestricted, true);

    const blockedNormal = await request("/api/leaderboard", {
      method: "POST", headers, body: JSON.stringify({ seasonId: "season_01" }),
    });
    assert.equal(blockedNormal.response.status, 403);
    assert.equal(blockedNormal.body.code, "LEADERBOARD_RESTRICTED");
    const blockedSpeedrun = await request("/api/speedrun/submit", {
      method: "POST",
      headers,
      body: JSON.stringify({
        targetId: "dyson_rockets_10000",
        seasonId: "season_01",
        rulesetVersion: "speedrun-v1",
        factoryId,
        elapsedSeconds: 42,
        saveRevision: 4,
        saveHash: speedrun1.body.cloudSave.checksum,
        clientVersion: "test",
      }),
    });
    assert.equal(blockedSpeedrun.response.status, 403);
    assert.equal(blockedSpeedrun.body.code, "LEADERBOARD_RESTRICTED");
  });
});
