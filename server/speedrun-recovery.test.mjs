import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { computeSaveStateChecksum } from "./save-integrity.mjs";
import { applySpeedrunRecovery, previewSpeedrunRecovery } from "./speedrun-recovery.mjs";

function envelope(state) {
  return JSON.stringify({ formatVersion: 2, savedAt: Date.now(), state, checksum: computeSaveStateChecksum(2, state) });
}

function createFixture(databasePath, { amount = 1_000_162, accountId = "user_recovery_fixture" } = {}) {
  const database = new Database(databasePath);
  database.exec("CREATE TABLE app_state (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL); CREATE TABLE cloud_save_payloads (user_id TEXT NOT NULL, slot TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (user_id, slot, revision)) WITHOUT ROWID;");
  const state = {
    version: 46,
    entities: [{}],
    contentPacks: [],
    totalProduced: { universe_matrix: amount },
    speedrun: {
      enabled: true, mode: "speedrun", eligible: true, rulesetVersion: "speedrun-v1", seasonId: "season_01",
      factoryId: "speedrun_factory_recovery", startedAt: Date.now() - 2_000_000, elapsedActiveSeconds: 821,
      baseline: { whiteMatrixProduced: 0 }, milestones: { white_matrix_1m: { completed: false } },
    },
  };
  const payload = envelope(state);
  const checksum = createHash("sha256").update(payload).digest("hex");
  const data = {
    schemaVersion: 7, storageLayoutVersion: 2,
    users: { [accountId]: { id: accountId, username: "recovery", displayName: "恢复测试" } },
    cloudSaves: { [accountId]: { revision: 3, checksum, size: payload.length } },
    speedrunSubmissions: {}, auditLog: [],
  };
  database.prepare("INSERT INTO app_state VALUES (1, ?, ?)").run(JSON.stringify(data), Date.now());
  database.prepare("INSERT INTO cloud_save_payloads VALUES (?, 'main', 3, ?)").run(accountId, payload);
  return { database, accountId };
}

test("previews conservatively, requires matching backup, and applies once without editing the save payload", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dsp-speedrun-recovery-"));
  const productionPath = path.join(directory, "cloud.sqlite");
  const backupPath = path.join(directory, "backup.sqlite");
  const { database, accountId } = createFixture(productionPath);
  try {
    const preview = previewSpeedrunRecovery(database, accountId);
    assert.equal(preview.eligible, true);
    assert.equal(preview.elapsedSeconds, 821);
    await database.backup(backupPath);
    const backup = new Database(backupPath, { readonly: true });
    try {
      assert.throws(() => applySpeedrunRecovery(database, backup, { accountId, confirmation: preview.confirmation }), /停止云服务/);
      const beforePayload = database.prepare("SELECT payload FROM cloud_save_payloads WHERE user_id = ? AND slot = 'main' AND revision = 3").get(accountId).payload;
      const applied = applySpeedrunRecovery(database, backup, { accountId, confirmation: preview.confirmation, serviceStopped: true });
      assert.equal(applied.applied, true);
      const afterPayload = database.prepare("SELECT payload FROM cloud_save_payloads WHERE user_id = ? AND slot = 'main' AND revision = 3").get(accountId).payload;
      assert.equal(afterPayload, beforePayload);
      const duplicate = applySpeedrunRecovery(database, backup, { accountId, confirmation: preview.confirmation, serviceStopped: true });
      assert.equal(duplicate.idempotent, true);
      const stored = JSON.parse(database.prepare("SELECT payload FROM app_state WHERE id = 1").get().payload);
      assert.equal(Object.keys(stored.speedrunSubmissions).length, 1);
      assert.equal(stored.auditLog.filter((entry) => entry.action === "speedrun.manual_recovery").length, 1);
    } finally {
      backup.close();
    }
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("refuses incomplete saves and a stale backup", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dsp-speedrun-recovery-reject-"));
  const productionPath = path.join(directory, "cloud.sqlite");
  const backupPath = path.join(directory, "backup.sqlite");
  const incomplete = createFixture(productionPath, { amount: 999_999 });
  try {
    const preview = previewSpeedrunRecovery(incomplete.database, incomplete.accountId);
    assert.equal(preview.eligible, false);
    assert.equal(preview.code, "TARGET_INCOMPLETE");
    await incomplete.database.backup(backupPath);
  } finally {
    incomplete.database.close();
  }
  const production2 = path.join(directory, "cloud2.sqlite");
  const ready = createFixture(production2);
  const stale = new Database(backupPath, { readonly: true });
  try {
    const preview = previewSpeedrunRecovery(ready.database, ready.accountId);
    assert.throws(() => applySpeedrunRecovery(ready.database, stale, { accountId: ready.accountId, confirmation: preview.confirmation, serviceStopped: true }), /备份库/);
  } finally {
    stale.close();
    ready.database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
