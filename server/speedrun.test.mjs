import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { createCloudServer } from "./index.mjs";
import { computeSaveStateChecksum } from "./save-integrity.mjs";

let directory;
let server;
let baseUrl;
let token;

function createSavePayload(state, savedAt = Date.now()) {
  const envelope = { formatVersion: 2, savedAt, state };
  return JSON.stringify({ ...envelope, checksum: computeSaveStateChecksum(envelope.formatVersion, state) });
}

async function request(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  return { response, body: await response.json() };
}

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "dsp-speedrun-"));
  server = await createCloudServer({
    databaseFile: path.join(directory, "cloud.sqlite"),
    allowedOrigin: "https://localhost",
    registrationLimit: 100,
    logger: { error() {} },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const registered = await request("/api/auth/register", { method: "POST", body: JSON.stringify({ username: "speedrunner", password: "strong-pass-123", displayName: "速通测试" }) });
  assert.equal(registered.response.status, 201);
  token = registered.body.token;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
});

function speedrunState(factoryId = "speedrun_test_factory_001") {
  return {
    version: 24,
    entities: [],
    totalProduced: { universe_matrix: 0 },
    dysonSphere: { totalRocketsLaunched: 10_000 },
    research: { completedTechIds: [] },
    contentPacks: [],
    speedrun: {
      enabled: true,
      mode: "speedrun",
      rulesetVersion: "speedrun-v1",
      seasonId: "season_01",
      startedAt: Date.now() - 60_000,
      elapsedActiveSeconds: 42,
      baseline: { completedTechIds: [], rocketsLaunched: 0, whiteMatrixProduced: 0 },
      milestones: {
        all_technologies: { completed: false },
        dyson_rockets_10000: { completed: true, completedAtSeconds: 42 },
        white_matrix_1m: { completed: false },
      },
      eligible: true,
      factoryId,
    },
  };
}

test("verifies speedrun submissions against the current cloud revision and keeps them idempotent", async () => {
  const headers = { authorization: `Bearer ${token}` };
  const payload = createSavePayload(speedrunState());
  const uploaded = await request("/api/cloud-save", { method: "PUT", headers, body: JSON.stringify({ payload, expectedRevision: 0 }) });
  assert.equal(uploaded.response.status, 200);
  const cloud = uploaded.body.cloudSave;
  const submitted = await request("/api/speedrun/submit", {
    method: "POST",
    headers,
    body: JSON.stringify({ targetId: "dyson_rockets_10000", seasonId: "season_01", rulesetVersion: "speedrun-v1", factoryId: "speedrun_test_factory_001", elapsedSeconds: 42, saveRevision: cloud.revision, saveHash: cloud.checksum, clientVersion: "test" }),
  });
  assert.equal(submitted.response.status, 200);
  assert.equal(submitted.body.verified, true);
  assert.equal(submitted.body.idempotent, false);
  const duplicate = await request("/api/speedrun/submit", {
    method: "POST",
    headers,
    body: JSON.stringify({ targetId: "dyson_rockets_10000", seasonId: "season_01", rulesetVersion: "speedrun-v1", factoryId: "speedrun_test_factory_001", elapsedSeconds: 42, saveRevision: cloud.revision, saveHash: cloud.checksum, clientVersion: "test" }),
  });
  assert.equal(duplicate.response.status, 200);
  assert.equal(duplicate.body.idempotent, true);
  const fasterState = speedrunState();
  fasterState.speedrun.elapsedActiveSeconds = 41;
  fasterState.speedrun.milestones.dyson_rockets_10000.completedAtSeconds = 41;
  const fasterPayload = createSavePayload(fasterState);
  const fasterUpload = await request("/api/cloud-save", { method: "PUT", headers, body: JSON.stringify({ payload: fasterPayload, expectedRevision: cloud.revision }) });
  assert.equal(fasterUpload.response.status, 200);
  const rollback = await request("/api/speedrun/submit", {
    method: "POST",
    headers,
    body: JSON.stringify({ targetId: "dyson_rockets_10000", seasonId: "season_01", rulesetVersion: "speedrun-v1", factoryId: "speedrun_test_factory_001", elapsedSeconds: 41, saveRevision: fasterUpload.body.cloudSave.revision, saveHash: fasterUpload.body.cloudSave.checksum, clientVersion: "test" }),
  });
  assert.equal(rollback.response.status, 409);
  assert.equal(rollback.body.code, "SPEEDRUN_ROLLBACK");
  const unreasonableState = speedrunState("speedrun_clock_test_001");
  unreasonableState.speedrun.startedAt = Date.now();
  unreasonableState.speedrun.elapsedActiveSeconds = 3_600;
  unreasonableState.speedrun.milestones.dyson_rockets_10000.completedAtSeconds = 3_600;
  const unreasonableUpload = await request("/api/cloud-save", { method: "PUT", headers, body: JSON.stringify({ payload: createSavePayload(unreasonableState), expectedRevision: fasterUpload.body.cloudSave.revision }) });
  assert.equal(unreasonableUpload.response.status, 200);
  const unreasonable = await request("/api/speedrun/submit", {
    method: "POST",
    headers,
    body: JSON.stringify({ targetId: "dyson_rockets_10000", seasonId: "season_01", rulesetVersion: "speedrun-v1", factoryId: "speedrun_clock_test_001", elapsedSeconds: 3_600, saveRevision: unreasonableUpload.body.cloudSave.revision, saveHash: unreasonableUpload.body.cloudSave.checksum, clientVersion: "test" }),
  });
  assert.equal(unreasonable.response.status, 422);
  assert.equal(unreasonable.body.code, "SPEEDRUN_CLOCK_INVALID");
  const restored = await request("/api/cloud-save", { method: "PUT", headers, body: JSON.stringify({ payload, expectedRevision: unreasonableUpload.body.cloudSave.revision }) });
  assert.equal(restored.response.status, 200);
  const ranking = await request("/api/speedrun/leaderboard?targetId=dyson_rockets_10000&seasonId=season_01");
  assert.equal(ranking.response.status, 200);
  assert.equal(ranking.body.category, "speedrun-dyson-rockets-10000");
  assert.equal(ranking.body.entries[0].elapsedSeconds, 42);
});

test("rejects forged times and ordinary saves without changing ordinary rankings", async () => {
  const headers = { authorization: `Bearer ${token}` };
  const current = await request("/api/cloud-save", { headers });
  const forged = await request("/api/speedrun/submit", {
    method: "POST",
    headers,
    body: JSON.stringify({ targetId: "dyson_rockets_10000", seasonId: "season_01", rulesetVersion: "speedrun-v1", factoryId: "speedrun_test_factory_001", elapsedSeconds: 1, saveRevision: current.body.cloudSave.revision, saveHash: current.body.cloudSave.checksum, clientVersion: "test" }),
  });
  assert.equal(forged.response.status, 422);
  assert.equal(forged.body.code, "SPEEDRUN_TIME_INVALID");

  const ordinaryPayload = createSavePayload({ version: 24, entities: [], contentPacks: [], totalProduced: {}, research: { completedTechIds: [] } });
  const ordinary = await request("/api/cloud-save", { method: "PUT", headers, body: JSON.stringify({ payload: ordinaryPayload, expectedRevision: current.body.cloudSave.revision }) });
  assert.equal(ordinary.response.status, 200);
  const rejected = await request("/api/speedrun/submit", {
    method: "POST",
    headers,
    body: JSON.stringify({ targetId: "dyson_rockets_10000", seasonId: "season_01", rulesetVersion: "speedrun-v1", factoryId: "speedrun_test_factory_001", elapsedSeconds: 42, saveRevision: ordinary.body.cloudSave.revision, saveHash: ordinary.body.cloudSave.checksum, clientVersion: "test" }),
  });
  assert.equal(rejected.response.status, 422);
  assert.equal(rejected.body.code, "SPEEDRUN_SAVE_NOT_ENABLED");
  const ordinaryRanking = await request("/api/leaderboard?category=galaxy&seasonId=season_01");
  assert.equal(ordinaryRanking.response.status, 200);
});

test("recovers a missing million-white-matrix milestone conservatively and idempotently", async () => {
  const registered = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username: "speedrecovery", password: "strong-pass-123", displayName: "速通恢复测试" }),
  });
  assert.equal(registered.response.status, 201);
  const headers = { authorization: `Bearer ${registered.body.token}` };
  const state = speedrunState("speedrun_recovery_factory_001");
  state.totalProduced.universe_matrix = 1_000_000;
  state.speedrun.elapsedActiveSeconds = 77;
  state.speedrun.milestones.white_matrix_1m = { completed: false };
  const uploaded = await request("/api/cloud-save", {
    method: "PUT",
    headers,
    body: JSON.stringify({ payload: createSavePayload(state), expectedRevision: 0 }),
  });
  assert.equal(uploaded.response.status, 200);

  const submission = {
    targetId: "white_matrix_1m",
    seasonId: "season_01",
    rulesetVersion: "speedrun-v1",
    factoryId: "speedrun_recovery_factory_001",
    elapsedSeconds: 77,
    saveRevision: uploaded.body.cloudSave.revision,
    saveHash: uploaded.body.cloudSave.checksum,
    clientVersion: "test",
  };
  const recovered = await request("/api/speedrun/submit", {
    method: "POST",
    headers,
    body: JSON.stringify(submission),
  });
  assert.equal(recovered.response.status, 200);
  assert.equal(recovered.body.verified, true);
  assert.equal(recovered.body.idempotent, false);
  assert.equal(recovered.body.entry.elapsedSeconds, 77);

  const duplicate = await request("/api/speedrun/submit", {
    method: "POST",
    headers,
    body: JSON.stringify(submission),
  });
  assert.equal(duplicate.response.status, 200);
  assert.equal(duplicate.body.idempotent, true);

  state.speedrun.elapsedActiveSeconds = 76;
  state.speedrun.milestones.white_matrix_1m = { completed: true, completedAtSeconds: 76 };
  const rollbackUpload = await request("/api/cloud-save", {
    method: "PUT",
    headers,
    body: JSON.stringify({
      payload: createSavePayload(state),
      expectedRevision: uploaded.body.cloudSave.revision,
    }),
  });
  assert.equal(rollbackUpload.response.status, 200);
  const rollback = await request("/api/speedrun/submit", {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...submission,
      elapsedSeconds: 76,
      saveRevision: rollbackUpload.body.cloudSave.revision,
      saveHash: rollbackUpload.body.cloudSave.checksum,
    }),
  });
  assert.equal(rollback.response.status, 409);
  assert.equal(rollback.body.code, "SPEEDRUN_ROLLBACK");
});
