import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import Database from "better-sqlite3";
import {
  applyLeaderboardModerationToData,
  isLeaderboardRestricted,
  normalizeLeaderboardModeration,
  publicLeaderboardModerationResolution,
  resolveLeaderboardModerationTarget,
} from "./leaderboard-moderation.mjs";
import { runLeaderboardModeration } from "./moderate-leaderboard.mjs";
import { computeSaveStateChecksum } from "./save-integrity.mjs";

let directory;

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "dsp-leaderboard-moderation-"));
});

after(async () => {
  await rm(directory, { recursive: true, force: true });
});

function savePayload() {
  const state = {
    version: 40,
    elapsedSeconds: 12_000,
    entities: [{ id: "vein_fixture", kind: "vein", machineCount: 1, minerCount: 0 }],
    research: { completedTechIds: [] },
    totalProduced: { universe_matrix: 10 },
  };
  const envelope = { formatVersion: 2, savedAt: 123, state };
  return JSON.stringify({ ...envelope, checksum: computeSaveStateChecksum(2, state) });
}

function fixtureData() {
  const payload = savePayload();
  const checksum = createHash("sha256").update(payload).digest("hex");
  const userId = "target-user-id";
  const otherId = "ordinary-user-id";
  return {
    userId,
    payload,
    data: {
      schemaVersion: 7,
      storageLayoutVersion: 2,
      users: {
        [userId]: { id: userId, displayName: "Target Pilot", leaderboardVisible: true },
        [otherId]: { id: otherId, displayName: "Ordinary Pilot", leaderboardVisible: true },
      },
      sessions: {},
      emailVerifications: {},
      passwordResets: {},
      auditLog: [],
      cloudSaves: { [userId]: { revision: 4, checksum, size: payload.length, updatedAt: 10 } },
      cloudSaveHistory: { [userId]: [{ revision: 1 }, { revision: 2 }, { revision: 3 }, { revision: 4 }] },
      cloudSaveSlots: {},
      cloudSaveSlotHistory: {},
      submissions: {
        [`season_01:${userId}`]: {
          userId,
          accountId: userId,
          displayName: "Target Pilot",
          seasonId: "season_01",
          visible: true,
          metrics: { galaxyScore: 1000 },
          verification: { strategy: "main-cloud-save-v1", cloudRevision: 4, checksum },
        },
        [`season_00:${userId}`]: {
          userId,
          accountId: userId,
          displayName: "Target Pilot",
          seasonId: "season_00",
          visible: true,
          metrics: { galaxyScore: 900 },
          verification: { strategy: "main-cloud-save-v1", cloudRevision: 4, checksum },
        },
        [`season_01:${otherId}`]: {
          userId: otherId,
          accountId: otherId,
          displayName: "Ordinary Pilot",
          seasonId: "season_01",
          visible: true,
          metrics: { galaxyScore: 100 },
          verification: { strategy: "main-cloud-save-v1", cloudRevision: 1, checksum: "other" },
        },
      },
      leaderboardModeration: {},
      players: {},
      feedback: [],
      errors: [],
      dailyMetrics: {},
      analytics: { visitors: {}, sessions: {}, daily: {} },
    },
  };
}

function createFixtureDatabase(file) {
  const fixture = fixtureData();
  const database = new Database(file);
  database.exec("CREATE TABLE app_state (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL, updated_at INTEGER NOT NULL)");
  database.exec("CREATE TABLE cloud_save_payloads (user_id TEXT NOT NULL, slot TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (user_id, slot, revision)) WITHOUT ROWID");
  database.prepare("INSERT INTO app_state (id, payload, updated_at) VALUES (1, ?, ?)").run(JSON.stringify(fixture.data), 100);
  database.prepare("INSERT INTO cloud_save_payloads (user_id, slot, revision, payload) VALUES (?, 'main', 4, ?)").run(fixture.userId, fixture.payload);
  database.close();
  return fixture;
}

test("normalizes only valid internal moderation records", () => {
  const users = { valid: { id: "valid" }, mismatch: { id: "other" } };
  const normalized = normalizeLeaderboardModeration({
    valid: { status: "blocked", reasonCode: "SAVE_DATA_INTEGRITY", source: "audit-source", createdAt: Number.MAX_VALUE },
    mismatch: { status: "blocked", reasonCode: "SAVE_DATA_INTEGRITY", source: "audit-source", createdAt: 1 },
    unknown: { status: "blocked", reasonCode: "SAVE_DATA_INTEGRITY", source: "audit-source", createdAt: 1 },
    invalid: { status: "review", reasonCode: "OTHER", source: "bad source with spaces", createdAt: -1 },
  }, users);
  assert.deepEqual(Object.keys(normalized), ["valid"]);
  assert.equal(normalized.valid.createdAt, Number.MAX_SAFE_INTEGER);
  assert.equal(isLeaderboardRestricted({ leaderboardModeration: normalized }, "valid"), true);
});

test("locks moderation to the current rank-one submission before checking its display name", () => {
  const fixture = fixtureData();
  const loadMainPayload = (userId) => userId === fixture.userId ? fixture.payload : null;
  const ready = resolveLeaderboardModerationTarget(fixture.data, { displayName: "Target Pilot", loadMainPayload });
  assert.deepEqual(publicLeaderboardModerationResolution(ready), {
    status: "ready",
    candidateCount: 1,
    cloudRevision: 4,
    submissionRevision: 4,
    verificationStrategyMatches: true,
    revisionMatches: true,
    checksumMatches: true,
    payloadChecksumMatches: true,
    envelopeIntegrityValid: true,
    invariantViolationConfirmed: true,
    submissionsToRemove: 2,
    alreadyModerated: false,
  });

  fixture.data.users["same-name-user"] = { id: "same-name-user", displayName: "Target Pilot", leaderboardVisible: true };
  fixture.data.submissions["season_01:same-name-user"] = {
    userId: "same-name-user",
    displayName: "Target Pilot",
    seasonId: "season_01",
    visible: true,
    metrics: { galaxyScore: 200 },
  };
  const sameNameResult = resolveLeaderboardModerationTarget(fixture.data, { displayName: "Target Pilot", loadMainPayload });
  assert.equal(sameNameResult.status, "ready");
  assert.equal(sameNameResult.candidateCount, 1);
  assert.equal(sameNameResult.userId, fixture.userId);

  fixture.data.submissions[`season_01:${fixture.userId}`].metrics.galaxyScore = 1;
  const invalidNewLeader = resolveLeaderboardModerationTarget(fixture.data, { displayName: "Target Pilot", loadMainPayload });
  assert.equal(invalidNewLeader.status, "verification-failed");
  assert.equal(invalidNewLeader.userId, "same-name-user");
  const wrongRankOne = resolveLeaderboardModerationTarget(fixture.data, { displayName: "Ordinary Pilot", loadMainPayload });
  assert.equal(wrongRankOne.status, "not-found");
  assert.equal(wrongRankOne.candidateCount, 0);
});

test("applies the SQLite remediation transactionally and remains idempotent", async () => {
  const databaseFile = path.join(directory, "production.sqlite");
  const backupFile = path.join(directory, "verified-backup.sqlite");
  createFixtureDatabase(databaseFile);
  await copyFile(databaseFile, backupFile);

  const dryRun = runLeaderboardModeration({ database: databaseFile, displayName: "Target Pilot", apply: false });
  assert.equal(dryRun.status, "ready");
  assert.equal(dryRun.submissionsToRemove, 2);

  const applied = runLeaderboardModeration({
    database: databaseFile,
    backup: backupFile,
    displayName: "Target Pilot",
    source: "test-readonly-audit",
    apply: true,
    confirmServiceStopped: true,
  });
  assert.equal(applied.changed, true);
  assert.equal(applied.submissionsRemoved, 2);
  assert.equal(applied.status, "already-moderated");
  assert.equal(applied.cloudRevisionUnchanged, true);
  assert.equal(applied.historyCountUnchanged, true);
  assert.equal(applied.payloadCountUnchanged, true);

  const database = new Database(databaseFile, { readonly: true });
  const stored = JSON.parse(database.prepare("SELECT payload FROM app_state WHERE id = 1").get().payload);
  assert.equal(Object.keys(stored.submissions).length, 1);
  assert.equal(Object.keys(stored.leaderboardModeration).length, 1);
  assert.equal(stored.auditLog.at(-1).action, "leaderboard.moderation_blocked");
  assert.equal(database.prepare("SELECT count(*) AS count FROM cloud_save_payloads").get().count, 1);
  database.close();

  const secondBackup = path.join(directory, "post-remediation-backup.sqlite");
  await copyFile(databaseFile, secondBackup);
  const repeated = runLeaderboardModeration({
    database: databaseFile,
    backup: secondBackup,
    displayName: "Target Pilot",
    source: "test-readonly-audit",
    apply: true,
    confirmServiceStopped: true,
  });
  assert.equal(repeated.changed, false);
  assert.equal(repeated.alreadyModerated, true);
  assert.equal(repeated.submissionsRemoved, 0);
});

test("pure remediation preserves cloud metadata and affects only the resolved account", () => {
  const fixture = fixtureData();
  const resolution = resolveLeaderboardModerationTarget(fixture.data, {
    displayName: "Target Pilot",
    loadMainPayload: () => fixture.payload,
  });
  const before = structuredClone({
    cloudSaves: fixture.data.cloudSaves,
    cloudSaveHistory: fixture.data.cloudSaveHistory,
    users: fixture.data.users,
  });
  const result = applyLeaderboardModerationToData(fixture.data, resolution, { source: "test-audit", now: 500 });
  assert.deepEqual(result, { changed: true, alreadyModerated: false, submissionsRemoved: 2 });
  assert.deepEqual({
    cloudSaves: fixture.data.cloudSaves,
    cloudSaveHistory: fixture.data.cloudSaveHistory,
    users: fixture.data.users,
  }, before);
  assert.equal(fixture.data.submissions["season_01:ordinary-user-id"].displayName, "Ordinary Pilot");
});
