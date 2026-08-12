import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import {
  backupWindowState,
  buildCloudHistoryPrunePlan,
  collectSqliteGovernanceMetrics,
  parseDailyBackupWindow,
  publicCloudHistoryPrunePlan,
  trimCloudHistoryMetadataInPlace,
} from "./cloud-governance.mjs";

function fixtureData() {
  return {
    storageLayoutVersion: 2,
    users: { user_a: { id: "user_a" } },
    cloudSaves: { user_a: { revision: 25 } },
    cloudSaveHistory: { user_a: Array.from({ length: 25 }, (_, index) => ({ revision: index + 1 })) },
    cloudSaveSlots: {},
    cloudSaveSlotHistory: {},
    cloudSavesByMode: {},
    cloudSaveHistoryByMode: {},
    cloudSaveSlotsByMode: {},
    cloudSaveSlotHistoryByMode: {},
  };
}

test("builds an auditable and stable cloud-history prune preview", () => {
  const data = fixtureData();
  trimCloudHistoryMetadataInPlace(data, 20);
  const rows = [
    ...Array.from({ length: 25 }, (_, index) => ({ userId: "user_a", slot: "main", revision: index + 1 })),
    { userId: "missing", slot: "main", revision: 1 },
  ];
  const first = buildCloudHistoryPrunePlan(data, rows);
  const second = buildCloudHistoryPrunePlan(data, [...rows].reverse());
  assert.equal(first.previewId, second.previewId);
  assert.equal(first.deletionCount, 6);
  assert.deepEqual(first.reasons, { orphanAccount: 1, invalidSlot: 0, expiredRevision: 5 });
  assert.equal(Object.hasOwn(publicCloudHistoryPrunePlan(first), "deletions"), false);
});

test("retains and trims normal and speedrun histories independently in all four slots", () => {
  const data = fixtureData();
  data.cloudSavesByMode.user_a = { speedrun: { revision: 25 } };
  data.cloudSaveHistoryByMode.user_a = {
    speedrun: Array.from({ length: 25 }, (_, index) => ({ revision: index + 1 })),
  };
  data.cloudSaveSlots.user_a = {};
  data.cloudSaveSlotHistory.user_a = {};
  data.cloudSaveSlotsByMode.user_a = { speedrun: {} };
  data.cloudSaveSlotHistoryByMode.user_a = { speedrun: {} };
  for (const slot of ["1", "2", "3"]) {
    data.cloudSaveSlots.user_a[slot] = { revision: 25 };
    data.cloudSaveSlotHistory.user_a[slot] = Array.from({ length: 25 }, (_, index) => ({ revision: index + 1 }));
    data.cloudSaveSlotsByMode.user_a.speedrun[slot] = { revision: 25 };
    data.cloudSaveSlotHistoryByMode.user_a.speedrun[slot] = Array.from({ length: 25 }, (_, index) => ({ revision: index + 1 }));
  }

  assert.equal(trimCloudHistoryMetadataInPlace(data, 20), 40);
  const rows = [];
  for (const slot of ["main", "1", "2", "3"]) {
    for (let revision = 1; revision <= 25; revision += 1) {
      rows.push({ userId: "user_a", slot, revision });
      rows.push({ userId: "user_a", slot: `speedrun:${slot}`, revision });
    }
  }
  const plan = buildCloudHistoryPrunePlan(data, rows, 20);
  assert.equal(plan.deletionCount, 40);
  assert.deepEqual(plan.reasons, { orphanAccount: 0, invalidSlot: 0, expiredRevision: 40 });
  assert.equal(plan.deletions.some((entry) => entry.slot.startsWith("speedrun:") && entry.revision > 5), false);
  assert.equal(plan.deletions.some((entry) => !entry.slot.startsWith("speedrun:") && entry.revision > 5), false);
});

test("reports SQLite table, page and revision sizes without exposing payloads", () => {
  const database = new Database(":memory:");
  try {
    database.exec("CREATE TABLE app_state (id INTEGER PRIMARY KEY, payload TEXT); CREATE TABLE cloud_save_payloads (user_id TEXT, slot TEXT, revision INTEGER, payload TEXT)");
    database.prepare("INSERT INTO app_state VALUES (1, ?)").run(JSON.stringify(fixtureData()));
    database.prepare("INSERT INTO cloud_save_payloads VALUES (?, ?, ?, ?)").run("user_a", "main", 1, "payload-one");
    database.prepare("INSERT INTO cloud_save_payloads VALUES (?, ?, ?, ?)").run("user_a", "main", 2, "payload-two");
    const metrics = collectSqliteGovernanceMetrics(database, fixtureData(), { databaseBytes: 4096, walBytes: 512 });
    assert.equal(metrics.cloudPayloadRows, 2);
    assert.equal(metrics.cloudPayloadBytes, 22);
    assert.equal(metrics.averageRevisionsPerAccount, 2);
    assert.equal(metrics.databaseBytes, 4096);
    assert.equal(metrics.walBytes, 512);
    assert.equal(JSON.stringify(metrics).includes("payload-one"), false);
  } finally {
    database.close();
  }
});

test("supports a daily low-traffic backup window including midnight rollover", () => {
  const daytime = parseDailyBackupWindow("02:00-05:00");
  assert.equal(backupWindowState(daytime, new Date(2026, 7, 9, 3, 0)).withinWindow, true);
  assert.equal(backupWindowState(daytime, new Date(2026, 7, 9, 8, 0)).withinWindow, false);
  const overnight = parseDailyBackupWindow("23:00-02:00");
  const state = backupWindowState(overnight, new Date(2026, 7, 10, 1, 0));
  assert.equal(state.withinWindow, true);
  assert.equal(state.dayKey, "2026-08-09");
  assert.equal(parseDailyBackupWindow("25:00-26:00"), null);
});
