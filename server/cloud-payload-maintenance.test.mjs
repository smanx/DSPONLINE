import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import Database from "better-sqlite3";
import {
  CLOUD_PAYLOAD_MAINTENANCE_CONFIRMATIONS,
  CloudPayloadMaintenanceError,
  normalizeCloudPayloadMaintenanceError,
  parseCloudPayloadMaintenanceArguments,
  runCloudPayloadMaintenance,
} from "./cloud-payload-maintenance.mjs";
import {
  CLOUD_PAYLOAD_ALIAS_PREFIX,
  CLOUD_PAYLOAD_BLOB_TABLE,
  CloudPayloadStoreError,
  createCloudPayloadAlias,
  initializeCloudPayloadStore,
  writeCloudPayload,
} from "./cloud-payload-store.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const maintenanceCli = path.join(testDirectory, "cloud-payload-maintenance.mjs");

function sha256(payload) {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

function createLegacyDatabase(filename, initialize = true) {
  const database = new Database(filename);
  database.exec(`
    CREATE TABLE cloud_save_payloads (
      user_id TEXT NOT NULL,
      slot TEXT NOT NULL,
      revision INTEGER NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY (user_id, slot, revision)
    ) WITHOUT ROWID
  `);
  if (initialize) initializeCloudPayloadStore(database);
  return database;
}

function transaction(database, callback) {
  return database.transaction(callback)();
}

async function temporaryDatabase(t, name = "cloud.sqlite", initialize = true) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dsp-cloud-payload-maintenance-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, name);
  const database = createLegacyDatabase(filename, initialize);
  return { directory, filename, database };
}

function expectCode(code) {
  return (error) =>
    (error instanceof CloudPayloadMaintenanceError || error instanceof CloudPayloadStoreError) && error.code === code;
}

function openReadonly(filename) {
  return new Database(filename, { readonly: true, fileMustExist: true });
}

test("parses a read-only default status and requires exact mutation confirmation phrases", async (t) => {
  const { directory, filename, database } = await temporaryDatabase(t);
  const body = JSON.stringify({ formatVersion: 2, state: { version: 46 }, marker: "status-secret" });
  database.prepare("INSERT INTO cloud_save_payloads VALUES (?, ?, ?, ?)").run("private_account", "main", 1, body);
  database.close();

  const parsed = parseCloudPayloadMaintenanceArguments(["--database", filename]);
  assert.equal(parsed.action, "status");
  assert.equal(parsed.database, filename);
  assert.equal(parsed.backup, undefined);

  const beforeFiles = await readdir(directory);
  const result = await runCloudPayloadMaintenance(parsed);
  assert.equal(result.ok, true);
  assert.equal(result.action, "status");
  assert.equal(result.readOnly, true);
  assert.equal(result.store.healthy, true);
  assert.equal(result.store.stats.rows.legacy, 1);
  assert.deepEqual(await readdir(directory), beforeFiles, "status must not create a backup or side file");

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(directory), false);
  assert.equal(serialized.includes("private_account"), false);
  assert.equal(serialized.includes("status-secret"), false);

  const cli = spawnSync(process.execPath, [maintenanceCli, "--database", filename], {
    cwd: testDirectory,
    encoding: "utf8",
  });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(cli.stderr, "");
  const cliResult = JSON.parse(cli.stdout);
  assert.equal(cliResult.action, "status");
  assert.equal(cliResult.database, path.basename(filename));
  assert.equal(cli.stdout.includes(directory), false);
  assert.equal(cli.stdout.includes("private_account"), false);
  assert.equal(cli.stdout.includes("status-secret"), false);

  const backup = path.join(directory, "must-not-exist.sqlite");
  await assert.rejects(
    runCloudPayloadMaintenance({ database: filename, action: "backfill", backup }),
    expectCode("CLOUD_PAYLOAD_MAINTENANCE_CONFIRMATION_REQUIRED"),
  );
  await assert.rejects(
    runCloudPayloadMaintenance({ database: filename, action: "backfill", backup, confirmation: "backfill" }),
    expectCode("CLOUD_PAYLOAD_MAINTENANCE_CONFIRMATION_REQUIRED"),
  );
  assert.equal(existsSync(backup), false, "a rejected confirmation must not create a backup");
});

test("backfill creates and verifies a backup, deduplicates modes, and is idempotent", async (t) => {
  const { directory, filename, database } = await temporaryDatabase(t);
  const shared = JSON.stringify({ formatVersion: 2, state: { version: 46 }, marker: "shared-private-body" });
  const distinct = JSON.stringify({ formatVersion: 2, state: { version: 46 }, marker: "distinct-private-body" });
  database.prepare("INSERT INTO cloud_save_payloads VALUES (?, ?, ?, ?)").run("private_a", "main", 1, shared);
  database.prepare("INSERT INTO cloud_save_payloads VALUES (?, ?, ?, ?)").run("private_a", "speedrun:main", 1, shared);
  database.prepare("INSERT INTO cloud_save_payloads VALUES (?, ?, ?, ?)").run("private_b", "1", 2, distinct);
  database.close();

  const backup = path.join(directory, "before-backfill.sqlite");
  const first = await runCloudPayloadMaintenance({
    database: filename,
    action: "backfill",
    backup,
    confirmation: CLOUD_PAYLOAD_MAINTENANCE_CONFIRMATIONS.backfill,
    batchSize: 2,
  });
  assert.equal(first.ok, true);
  assert.equal(first.transaction, "committed");
  assert.equal(first.backup.verified, true);
  assert.equal(first.backup.file, path.basename(backup));
  assert.equal(first.changes.backfilledRows, 3);
  assert.equal(first.changes.blobsInserted, 2);
  assert.equal(first.changes.blobsReused, 1);
  assert.equal(first.after.rows.aliases, 3);
  assert.equal(first.after.rows.legacy, 0);
  assert.equal(first.after.blobs.missingReferences, 0);
  assert.equal(first.validation.readableJsonRows, 3);

  const safeOutput = JSON.stringify(first);
  for (const secret of [directory, "private_a", "private_b", "shared-private-body", sha256(shared)]) {
    assert.equal(safeOutput.includes(secret), false, `result leaked ${secret}`);
  }

  const backupDatabase = openReadonly(backup);
  try {
    assert.deepEqual(backupDatabase.pragma("quick_check"), [{ quick_check: "ok" }]);
    assert.equal(
      backupDatabase.prepare("SELECT payload FROM cloud_save_payloads WHERE user_id = ? AND slot = ?").get("private_a", "main").payload,
      shared,
      "the pre-mutation backup must preserve the original direct body",
    );
  } finally {
    backupDatabase.close();
  }

  const updated = openReadonly(filename);
  try {
    const rows = updated.prepare("SELECT payload FROM cloud_save_payloads ORDER BY user_id, slot").all();
    assert.equal(rows.every((row) => row.payload.startsWith(CLOUD_PAYLOAD_ALIAS_PREFIX)), true);
    assert.equal(updated.prepare(`SELECT count(*) AS count FROM ${CLOUD_PAYLOAD_BLOB_TABLE}`).get().count, 2);
  } finally {
    updated.close();
  }

  const second = await runCloudPayloadMaintenance({
    database: filename,
    action: "backfill",
    backup: path.join(directory, "before-second-backfill.sqlite"),
    confirmation: CLOUD_PAYLOAD_MAINTENANCE_CONFIRMATIONS.backfill,
  });
  assert.equal(second.changes.backfilledRows, 0);
  assert.equal(second.changes.alreadyAliasedRows, 3);
  assert.equal(second.after.rows.aliases, 3);
});

test("backfill safely initializes a legacy layout-v2 database inside the mutation transaction", async (t) => {
  const { directory, filename, database } = await temporaryDatabase(t, "legacy.sqlite", false);
  const body = JSON.stringify({ formatVersion: 2, state: { version: 46 }, legacy: true });
  database.prepare("INSERT INTO cloud_save_payloads VALUES (?, ?, ?, ?)").run("legacy_private", "main", 1, body);
  database.close();

  const status = await runCloudPayloadMaintenance({ database: filename });
  assert.equal(status.store.initialized, false);
  assert.equal(status.store.healthy, true);
  assert.equal(status.store.stats.rows.legacy, 1);

  const result = await runCloudPayloadMaintenance({
    database: filename,
    action: "backfill",
    backup: path.join(directory, "legacy-before.sqlite"),
    confirmation: CLOUD_PAYLOAD_MAINTENANCE_CONFIRMATIONS.backfill,
  });
  assert.equal(result.before.rows.legacy, 1);
  assert.equal(result.after.rows.aliases, 1);

  const backup = openReadonly(path.join(directory, "legacy-before.sqlite"));
  try {
    assert.equal(
      backup.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?").get(CLOUD_PAYLOAD_BLOB_TABLE).count,
      0,
      "the verified backup must precede blob-table initialization",
    );
  } finally {
    backup.close();
  }
});

test("materialize restores exact direct-SELECT JSON for old code and is idempotent", async (t) => {
  const { directory, filename, database } = await temporaryDatabase(t);
  const normal = JSON.stringify({ formatVersion: 2, state: { version: 46, saveMode: "normal" } });
  const speedrun = JSON.stringify({ formatVersion: 2, state: { version: 46, saveMode: "speedrun" } });
  transaction(database, () => {
    writeCloudPayload(database, { userId: "private_a", slot: "main", revision: 3, payload: normal });
    writeCloudPayload(database, { userId: "private_a", slot: "speedrun:main", revision: 7, payload: speedrun });
  });
  database.close();

  const first = await runCloudPayloadMaintenance({
    database: filename,
    action: "materialize",
    backup: path.join(directory, "before-materialize.sqlite"),
    confirmation: CLOUD_PAYLOAD_MAINTENANCE_CONFIRMATIONS.materialize,
  });
  assert.equal(first.changes.materializedRows, 2);
  assert.equal(first.after.rows.aliases, 0);
  assert.equal(first.after.blobs.missingReferences, 0);
  assert.equal(first.validation.materializedRows, 2);
  assert.equal(first.validation.readableJsonRows, 2);

  const direct = openReadonly(filename);
  try {
    const rows = direct.prepare("SELECT slot, payload FROM cloud_save_payloads ORDER BY slot").all();
    assert.deepEqual(rows, [
      { slot: "main", payload: normal },
      { slot: "speedrun:main", payload: speedrun },
    ]);
    for (const row of rows) assert.doesNotThrow(() => JSON.parse(row.payload));
  } finally {
    direct.close();
  }

  const second = await runCloudPayloadMaintenance({
    database: filename,
    action: "materialize",
    backup: path.join(directory, "before-second-materialize.sqlite"),
    confirmation: CLOUD_PAYLOAD_MAINTENANCE_CONFIRMATIONS.materialize,
  });
  assert.equal(second.changes.materializedRows, 0);
  assert.equal(second.changes.alreadyMaterializedRows, 2);
});

test("gc removes only orphan blobs, uses a same-directory default backup, and repeats safely", async (t) => {
  const { directory, filename, database } = await temporaryDatabase(t);
  const referenced = JSON.stringify({ formatVersion: 2, state: { version: 46 }, retained: true });
  const orphan = JSON.stringify({ formatVersion: 2, state: { version: 46 }, orphan: true });
  transaction(database, () => writeCloudPayload(database, {
    userId: "private_a",
    slot: "main",
    revision: 1,
    payload: referenced,
  }));
  database.prepare(`INSERT INTO ${CLOUD_PAYLOAD_BLOB_TABLE} (checksum, size_bytes, payload) VALUES (?, ?, ?)`)
    .run(sha256(orphan), Buffer.byteLength(orphan), orphan);
  database.close();

  const first = await runCloudPayloadMaintenance({
    database: filename,
    action: "gc",
    confirmation: CLOUD_PAYLOAD_MAINTENANCE_CONFIRMATIONS.gc,
    now: Date.UTC(2026, 7, 13, 0, 0, 0),
  });
  assert.equal(first.changes.referencedBlobs, 1);
  assert.equal(first.changes.orphanBlobs, 1);
  assert.equal(first.changes.deletedBlobs, 1);
  assert.equal(first.after.blobs.orphan, 0);
  const defaultBackup = path.join(directory, first.backup.file);
  assert.equal(existsSync(defaultBackup), true);
  const verifiedBackup = openReadonly(defaultBackup);
  try {
    assert.deepEqual(verifiedBackup.pragma("quick_check"), [{ quick_check: "ok" }]);
    assert.equal(verifiedBackup.prepare(`SELECT count(*) AS count FROM ${CLOUD_PAYLOAD_BLOB_TABLE}`).get().count, 2);
  } finally {
    verifiedBackup.close();
  }

  const second = await runCloudPayloadMaintenance({
    database: filename,
    action: "gc",
    backup: path.join(directory, "before-second-gc.sqlite"),
    confirmation: CLOUD_PAYLOAD_MAINTENANCE_CONFIRMATIONS.gc,
  });
  assert.equal(second.changes.deletedBlobs, 0);
  assert.equal(second.after.blobs.total, 1);
});

test("a later corrupt alias rejects backfill and rolls every earlier row and blob change back", async (t) => {
  const { directory, filename, database } = await temporaryDatabase(t);
  const pending = JSON.stringify({ formatVersion: 2, state: { version: 46 }, pending: "rollback-marker" });
  const corrupt = `${CLOUD_PAYLOAD_ALIAS_PREFIX}broken`;
  database.prepare("INSERT INTO cloud_save_payloads VALUES (?, ?, ?, ?)").run("a_private", "main", 1, pending);
  database.prepare("INSERT INTO cloud_save_payloads VALUES (?, ?, ?, ?)").run("z_private", "main", 1, corrupt);
  database.close();

  const status = await runCloudPayloadMaintenance({ database: filename });
  assert.equal(status.store.healthy, false);
  assert.equal(status.store.stats.rows.invalidAliases, 1);

  const backup = path.join(directory, "before-failed-backfill.sqlite");
  await assert.rejects(
    runCloudPayloadMaintenance({
      database: filename,
      action: "backfill",
      backup,
      confirmation: CLOUD_PAYLOAD_MAINTENANCE_CONFIRMATIONS.backfill,
      batchSize: 1,
    }),
    expectCode("CLOUD_PAYLOAD_ALIAS_INVALID"),
  );
  assert.equal(existsSync(backup), true, "the verified pre-mutation backup remains available as evidence");

  const after = openReadonly(filename);
  try {
    assert.equal(after.prepare("SELECT payload FROM cloud_save_payloads WHERE user_id = ?").get("a_private").payload, pending);
    assert.equal(after.prepare("SELECT payload FROM cloud_save_payloads WHERE user_id = ?").get("z_private").payload, corrupt);
    assert.equal(after.prepare(`SELECT count(*) AS count FROM ${CLOUD_PAYLOAD_BLOB_TABLE}`).get().count, 0);
  } finally {
    after.close();
  }
});

test("existing backup targets are never overwritten and missing databases are not created", async (t) => {
  const { directory, filename, database } = await temporaryDatabase(t);
  database.close();
  const backup = path.join(directory, "existing.sqlite");
  const existing = new Database(backup);
  existing.exec("CREATE TABLE sentinel(value TEXT); INSERT INTO sentinel VALUES ('keep')");
  existing.close();

  await assert.rejects(
    runCloudPayloadMaintenance({
      database: filename,
      action: "gc",
      backup,
      confirmation: CLOUD_PAYLOAD_MAINTENANCE_CONFIRMATIONS.gc,
    }),
    expectCode("CLOUD_PAYLOAD_MAINTENANCE_BACKUP_EXISTS"),
  );
  const preserved = openReadonly(backup);
  try {
    assert.equal(preserved.prepare("SELECT value FROM sentinel").get().value, "keep");
  } finally {
    preserved.close();
  }

  const missing = path.join(directory, "missing.sqlite");
  await assert.rejects(
    runCloudPayloadMaintenance({ database: missing }),
    expectCode("CLOUD_PAYLOAD_MAINTENANCE_DATABASE_OPEN_FAILED"),
  );
  assert.equal(existsSync(missing), false, "fileMustExist must prevent accidental database creation");
});

test("writer locks and read-only/disk failures use explicit path-free error categories", async (t) => {
  const { directory, filename, database } = await temporaryDatabase(t);
  database.close();
  const blocker = new Database(filename);
  blocker.exec("BEGIN IMMEDIATE");
  try {
    await assert.rejects(
      runCloudPayloadMaintenance({
        database: filename,
        action: "gc",
        backup: path.join(directory, "locked-backup.sqlite"),
        confirmation: CLOUD_PAYLOAD_MAINTENANCE_CONFIRMATIONS.gc,
        busyTimeoutMs: 0,
      }),
      expectCode("CLOUD_PAYLOAD_MAINTENANCE_DATABASE_LOCKED"),
    );
  } finally {
    blocker.exec("ROLLBACK");
    blocker.close();
  }

  assert.equal(
    normalizeCloudPayloadMaintenanceError({ code: "SQLITE_READONLY" }).code,
    "CLOUD_PAYLOAD_MAINTENANCE_DATABASE_READ_ONLY",
  );
  assert.equal(
    normalizeCloudPayloadMaintenanceError({ code: "ENOSPC" }).code,
    "CLOUD_PAYLOAD_MAINTENANCE_DISK_ERROR",
  );
  assert.equal(
    normalizeCloudPayloadMaintenanceError({ code: "SQLITE_IOERR_WRITE" }).code,
    "CLOUD_PAYLOAD_MAINTENANCE_DISK_ERROR",
  );
});

test("argument parsing accepts separated or equals syntax without allowing unsafe ambiguity", () => {
  const database = path.resolve("synthetic.sqlite");
  const backup = path.resolve("synthetic.backup.sqlite");
  const parsed = parseCloudPayloadMaintenanceArguments([
    `--database=${database}`,
    "--action=materialize",
    `--backup=${backup}`,
    "--confirmation",
    CLOUD_PAYLOAD_MAINTENANCE_CONFIRMATIONS.materialize,
    "--batch-size=100",
    "--busy-timeout-ms=0",
  ]);
  assert.deepEqual(parsed, {
    action: "materialize",
    database,
    backup,
    confirmation: CLOUD_PAYLOAD_MAINTENANCE_CONFIRMATIONS.materialize,
    batchSize: 100,
    busyTimeoutMs: 0,
  });
  assert.throws(
    () => parseCloudPayloadMaintenanceArguments(["--database", database, "--database", database]),
    expectCode("CLOUD_PAYLOAD_MAINTENANCE_ARGUMENT_INVALID"),
  );
  assert.throws(
    () => parseCloudPayloadMaintenanceArguments(["--database", database, "--unknown", "value"]),
    expectCode("CLOUD_PAYLOAD_MAINTENANCE_ARGUMENT_INVALID"),
  );
  assert.throws(
    () => parseCloudPayloadMaintenanceArguments(["--database", database, "--action", "status", "--backup", backup]),
    expectCode("CLOUD_PAYLOAD_MAINTENANCE_ARGUMENT_INVALID"),
  );
  assert.throws(
    () => parseCloudPayloadMaintenanceArguments([
      "--database", database,
      "--action", "gc",
      "--backup", database,
      "--confirm", CLOUD_PAYLOAD_MAINTENANCE_CONFIRMATIONS.gc,
    ]),
    expectCode("CLOUD_PAYLOAD_MAINTENANCE_BACKUP_TARGET_INVALID"),
  );
});

test("malformed materialized JSON fails before commit and leaves aliases intact", async (t) => {
  const { directory, filename, database } = await temporaryDatabase(t);
  const invalidJson = "this-is-not-json";
  const digest = sha256(invalidJson);
  database.prepare(`INSERT INTO ${CLOUD_PAYLOAD_BLOB_TABLE} (checksum, size_bytes, payload) VALUES (?, ?, ?)`)
    .run(digest, Buffer.byteLength(invalidJson), invalidJson);
  const alias = createCloudPayloadAlias(digest, Buffer.byteLength(invalidJson));
  database.prepare("INSERT INTO cloud_save_payloads VALUES (?, ?, ?, ?)").run("private", "main", 1, alias);
  database.close();

  await assert.rejects(
    runCloudPayloadMaintenance({
      database: filename,
      action: "materialize",
      backup: path.join(directory, "before-invalid-materialize.sqlite"),
      confirmation: CLOUD_PAYLOAD_MAINTENANCE_CONFIRMATIONS.materialize,
    }),
    expectCode("CLOUD_PAYLOAD_MAINTENANCE_BODY_INVALID"),
  );
  const after = openReadonly(filename);
  try {
    assert.equal(after.prepare("SELECT payload FROM cloud_save_payloads").get().payload, alias);
  } finally {
    after.close();
  }
});
