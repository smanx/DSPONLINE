import path from "node:path";
import { realpathSync } from "node:fs";
import { open, rm, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import {
  CLOUD_PAYLOAD_ALIAS_PREFIX,
  CLOUD_PAYLOAD_BLOB_TABLE,
  CLOUD_PAYLOAD_TABLE,
  CloudPayloadStoreError,
  backfillCloudPayloadAliases,
  collectCloudPayloadStoreStats,
  garbageCollectCloudPayloadBlobs,
  initializeCloudPayloadStore,
  materializeCloudPayloadAliases,
  parseCloudPayloadAlias,
  readCloudPayload,
} from "./cloud-payload-store.mjs";

export const CLOUD_PAYLOAD_MAINTENANCE_ACTIONS = Object.freeze([
  "status",
  "backfill",
  "materialize",
  "gc",
]);

export const CLOUD_PAYLOAD_MAINTENANCE_CONFIRMATIONS = Object.freeze({
  backfill: "BACKFILL_CLOUD_PAYLOADS",
  materialize: "MATERIALIZE_CLOUD_PAYLOADS_FOR_CODE_ROLLBACK",
  gc: "GC_CLOUD_PAYLOAD_BLOBS",
});

const ACTIONS = new Set(CLOUD_PAYLOAD_MAINTENANCE_ACTIONS);
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_BUSY_TIMEOUT_MS = 5_000;
const MAX_BUSY_TIMEOUT_MS = 60_000;
const ALIAS_PREFIX_CHARACTER = CLOUD_PAYLOAD_ALIAS_PREFIX[0];

export class CloudPayloadMaintenanceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CloudPayloadMaintenanceError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new CloudPayloadMaintenanceError(code, message);
}

function errorCode(error) {
  return typeof error?.code === "string" ? error.code.toUpperCase() : "";
}

function codeStartsWith(code, prefixes) {
  return prefixes.some((prefix) => code === prefix || code.startsWith(`${prefix}_`));
}

/**
 * Converts native/SQLite failures to path-free, operator-actionable errors.
 * CloudPayloadStoreError messages are controlled by the store module and are
 * intentionally preserved without their optional details.
 */
export function normalizeCloudPayloadMaintenanceError(error, phase = "operation") {
  if (error instanceof CloudPayloadMaintenanceError || error instanceof CloudPayloadStoreError) return error;
  const code = errorCode(error);
  if (codeStartsWith(code, ["SQLITE_BUSY", "SQLITE_LOCKED"])) {
    return new CloudPayloadMaintenanceError(
      "CLOUD_PAYLOAD_MAINTENANCE_DATABASE_LOCKED",
      "The database is locked by another writer; stop the writer or retry after it releases the lock",
    );
  }
  if (codeStartsWith(code, ["SQLITE_READONLY"]) || ["EACCES", "EPERM", "EROFS"].includes(code)) {
    return new CloudPayloadMaintenanceError(
      "CLOUD_PAYLOAD_MAINTENANCE_DATABASE_READ_ONLY",
      "The database or backup destination is read-only",
    );
  }
  if (codeStartsWith(code, ["SQLITE_FULL", "SQLITE_IOERR"]) || ["ENOSPC", "EDQUOT", "EIO"].includes(code)) {
    return new CloudPayloadMaintenanceError(
      "CLOUD_PAYLOAD_MAINTENANCE_DISK_ERROR",
      "SQLite or the filesystem reported a disk capacity or I/O failure",
    );
  }
  if (codeStartsWith(code, ["SQLITE_CORRUPT", "SQLITE_NOTADB"])) {
    return new CloudPayloadMaintenanceError(
      "CLOUD_PAYLOAD_MAINTENANCE_DATABASE_CORRUPT",
      "SQLite rejected the database as corrupt or invalid",
    );
  }
  if (codeStartsWith(code, ["SQLITE_CANTOPEN"]) || ["ENOENT", "ENOTDIR"].includes(code)) {
    return new CloudPayloadMaintenanceError(
      phase === "backup" ? "CLOUD_PAYLOAD_MAINTENANCE_BACKUP_OPEN_FAILED" : "CLOUD_PAYLOAD_MAINTENANCE_DATABASE_OPEN_FAILED",
      phase === "backup" ? "The backup destination could not be opened" : "The existing database file could not be opened",
    );
  }
  return new CloudPayloadMaintenanceError(
    "CLOUD_PAYLOAD_MAINTENANCE_FAILED",
    "Cloud payload maintenance failed without changing the database",
  );
}

export function publicCloudPayloadMaintenanceError(error) {
  const normalized = normalizeCloudPayloadMaintenanceError(error);
  return { code: normalized.code, message: normalized.message };
}

function resolveRequiredPath(value, code, message) {
  if (typeof value !== "string" || value.trim().length === 0 || value.includes("\0")) fail(code, message);
  return path.resolve(value);
}

function parseInteger(value, name, minimum, maximum) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    fail("CLOUD_PAYLOAD_MAINTENANCE_ARGUMENT_INVALID", `${name} must be an integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    fail("CLOUD_PAYLOAD_MAINTENANCE_ARGUMENT_INVALID", `${name} is outside its supported range`);
  }
  return parsed;
}

function argumentValue(values, index, inlineValue, name) {
  if (inlineValue !== undefined) {
    if (inlineValue.length === 0) fail("CLOUD_PAYLOAD_MAINTENANCE_ARGUMENT_INVALID", `${name} requires a value`);
    return { value: inlineValue, nextIndex: index };
  }
  const value = values[index + 1];
  if (typeof value !== "string" || value.startsWith("--")) {
    fail("CLOUD_PAYLOAD_MAINTENANCE_ARGUMENT_INVALID", `${name} requires a value`);
  }
  return { value, nextIndex: index + 1 };
}

export function parseCloudPayloadMaintenanceArguments(values) {
  if (!Array.isArray(values)) fail("CLOUD_PAYLOAD_MAINTENANCE_ARGUMENT_INVALID", "CLI arguments must be an array");
  const parsed = {};
  const seen = new Set();
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (typeof token !== "string" || !token.startsWith("--")) {
      fail("CLOUD_PAYLOAD_MAINTENANCE_ARGUMENT_INVALID", "Only named CLI arguments are accepted");
    }
    const separator = token.indexOf("=");
    const name = separator >= 0 ? token.slice(0, separator) : token;
    const inlineValue = separator >= 0 ? token.slice(separator + 1) : undefined;
    const canonicalName = name === "--confirmation" ? "--confirm" : name;
    if (!["--database", "--action", "--backup", "--confirm", "--batch-size", "--busy-timeout-ms"].includes(canonicalName)) {
      fail("CLOUD_PAYLOAD_MAINTENANCE_ARGUMENT_INVALID", "An unknown CLI argument was supplied");
    }
    if (seen.has(canonicalName)) fail("CLOUD_PAYLOAD_MAINTENANCE_ARGUMENT_INVALID", "A CLI argument was supplied more than once");
    seen.add(canonicalName);
    const read = argumentValue(values, index, inlineValue, canonicalName);
    index = read.nextIndex;
    if (canonicalName === "--database") parsed.database = read.value;
    else if (canonicalName === "--action") parsed.action = read.value;
    else if (canonicalName === "--backup") parsed.backup = read.value;
    else if (canonicalName === "--confirm") parsed.confirmation = read.value;
    else if (canonicalName === "--batch-size") parsed.batchSize = parseInteger(read.value, "batch size", 1, 100);
    else parsed.busyTimeoutMs = parseInteger(read.value, "busy timeout", 0, MAX_BUSY_TIMEOUT_MS);
  }
  return validateOptions(parsed);
}

function validateOptions(options = {}) {
  const action = options.action ?? "status";
  if (!ACTIONS.has(action)) {
    fail("CLOUD_PAYLOAD_MAINTENANCE_ACTION_INVALID", "Action must be status, backfill, materialize, or gc");
  }
  const database = resolveRequiredPath(
    options.database,
    "CLOUD_PAYLOAD_MAINTENANCE_DATABASE_REQUIRED",
    "--database is required",
  );
  const backup = options.backup === undefined
    ? undefined
    : resolveRequiredPath(
      options.backup,
      "CLOUD_PAYLOAD_MAINTENANCE_BACKUP_INVALID",
      "--backup must name a file",
    );
  if (backup !== undefined && backup === database) {
    fail("CLOUD_PAYLOAD_MAINTENANCE_BACKUP_TARGET_INVALID", "Backup and database files must differ");
  }
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    fail("CLOUD_PAYLOAD_MAINTENANCE_ARGUMENT_INVALID", "batch size is outside its supported range");
  }
  const busyTimeoutMs = options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;
  if (!Number.isSafeInteger(busyTimeoutMs) || busyTimeoutMs < 0 || busyTimeoutMs > MAX_BUSY_TIMEOUT_MS) {
    fail("CLOUD_PAYLOAD_MAINTENANCE_ARGUMENT_INVALID", "busy timeout is outside its supported range");
  }
  if (action === "status") {
    if (backup !== undefined || options.confirmation !== undefined) {
      fail("CLOUD_PAYLOAD_MAINTENANCE_ARGUMENT_INVALID", "status does not accept backup or confirmation arguments");
    }
  } else {
    const expected = CLOUD_PAYLOAD_MAINTENANCE_CONFIRMATIONS[action];
    if (options.confirmation !== expected) {
      fail(
        "CLOUD_PAYLOAD_MAINTENANCE_CONFIRMATION_REQUIRED",
        `Action ${action} requires --confirm ${expected}`,
      );
    }
  }
  return { action, database, backup, confirmation: options.confirmation, batchSize, busyTimeoutMs };
}

function quickCheck(database, label) {
  const rows = database.pragma("quick_check");
  if (!Array.isArray(rows) || rows.length === 0 || rows.some((row) => row.quick_check !== "ok")) {
    fail("CLOUD_PAYLOAD_MAINTENANCE_INTEGRITY_CHECK_FAILED", `${label} failed SQLite quick_check`);
  }
  return true;
}

function sqliteScalarText(database, sql) {
  const row = database.prepare(sql).get();
  const value = row?.value;
  return value === null || value === undefined ? "0" : String(value);
}

function sqliteObject(database, name) {
  return database.prepare("SELECT type FROM sqlite_master WHERE name = ?").get(name) ?? null;
}

function tableFingerprint(database, tableName, byteExpression) {
  const object = sqliteObject(database, tableName);
  if (!object) return { exists: false };
  if (object.type !== "table") return { exists: true, type: object.type };
  return {
    exists: true,
    type: "table",
    rows: sqliteScalarText(database, `SELECT CAST(count(*) AS TEXT) AS value FROM ${tableName}`),
    bytes: sqliteScalarText(database, `SELECT CAST(COALESCE(SUM(${byteExpression}), 0) AS TEXT) AS value FROM ${tableName}`),
  };
}

function databaseFingerprint(database) {
  return {
    userVersion: String(database.pragma("user_version", { simple: true })),
    applicationId: String(database.pragma("application_id", { simple: true })),
    protectedObjects: database.prepare(`
      SELECT name, type, sql
      FROM sqlite_master
      WHERE name IN ('app_state', '${CLOUD_PAYLOAD_TABLE}', '${CLOUD_PAYLOAD_BLOB_TABLE}')
      ORDER BY name
    `).all(),
    appState: tableFingerprint(database, "app_state", "length(CAST(payload AS BLOB))"),
    payloads: tableFingerprint(database, CLOUD_PAYLOAD_TABLE, "length(CAST(payload AS BLOB))"),
    blobs: tableFingerprint(database, CLOUD_PAYLOAD_BLOB_TABLE, "length(CAST(payload AS BLOB))"),
  };
}

function sameFingerprint(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function dataVersion(database) {
  return Number(database.pragma("data_version", { simple: true }));
}

function assertCanonicalPayloadTable(database) {
  const object = sqliteObject(database, CLOUD_PAYLOAD_TABLE);
  if (!object || object.type !== "table") {
    fail("CLOUD_PAYLOAD_MAINTENANCE_SCHEMA_INVALID", "The canonical cloud payload table is missing");
  }
  const columns = new Map(database.pragma(`table_info(${CLOUD_PAYLOAD_TABLE})`).map((column) => [column.name, column]));
  const expected = [
    ["user_id", "TEXT", 1],
    ["slot", "TEXT", 2],
    ["revision", "INTEGER", 3],
    ["payload", "TEXT", 0],
  ];
  for (const [name, type, primaryKeyPosition] of expected) {
    const column = columns.get(name);
    if (
      typeof column !== "object" ||
      String(column.type).trim().toUpperCase() !== type ||
      Number(column.notnull) !== 1 ||
      Number(column.pk) !== primaryKeyPosition
    ) {
      fail("CLOUD_PAYLOAD_MAINTENANCE_SCHEMA_INVALID", "The canonical cloud payload table has an incompatible shape");
    }
  }
}

function safeAdd(total, value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return total;
  return Math.min(Number.MAX_SAFE_INTEGER, total + Math.floor(number));
}

function uninitializedStoreStats(database) {
  assertCanonicalPayloadTable(database);
  let total = 0;
  let legacy = 0;
  let aliases = 0;
  let invalidAliases = 0;
  let mainStored = 0;
  let legacyLogical = 0;
  let aliasedLogical = 0;
  const references = new Set();
  for (const row of database.prepare(`
    SELECT substr(payload, 1, 160) AS prefix, length(CAST(payload AS BLOB)) AS storedBytes
    FROM ${CLOUD_PAYLOAD_TABLE}
  `).iterate()) {
    total += 1;
    const storedBytes = Number(row.storedBytes);
    mainStored = safeAdd(mainStored, storedBytes);
    if (typeof row.prefix !== "string" || row.prefix[0] !== ALIAS_PREFIX_CHARACTER) {
      legacy += 1;
      legacyLogical = safeAdd(legacyLogical, storedBytes);
      continue;
    }
    try {
      if (storedBytes !== Buffer.byteLength(row.prefix, "utf8")) throw new Error("oversized alias");
      const alias = parseCloudPayloadAlias(row.prefix);
      aliases += 1;
      aliasedLogical = safeAdd(aliasedLogical, alias.sizeBytes);
      references.add(alias.checksum);
    } catch {
      invalidAliases += 1;
    }
  }
  return {
    internalVersion: 0,
    sqliteLayoutVersion: 2,
    rows: { total, legacy, aliases, invalidAliases, conflictingAliasMetadata: 0 },
    blobs: { total: 0, referenced: 0, orphan: 0, missingReferences: references.size },
    bytes: {
      mainStored,
      logical: safeAdd(legacyLogical, aliasedLogical),
      legacyLogical,
      aliasedLogical,
      blobStored: 0,
      referencedBlobStored: 0,
      deduplicated: 0,
    },
  };
}

function isBlobStoreInitialized(database) {
  const object = sqliteObject(database, CLOUD_PAYLOAD_BLOB_TABLE);
  if (!object) return false;
  if (object.type !== "table") {
    fail("CLOUD_PAYLOAD_MAINTENANCE_SCHEMA_INVALID", "The cloud payload blob object is not a table");
  }
  return true;
}

function parseJsonBody(payload) {
  try {
    JSON.parse(payload);
  } catch {
    fail("CLOUD_PAYLOAD_MAINTENANCE_BODY_INVALID", "A cloud payload body is not readable JSON");
  }
}

function validatePayloadBodies(database, requirement = "mixed") {
  const validatedAliases = new Set();
  let rows = 0;
  let aliasRows = 0;
  let materializedRows = 0;
  let jsonRows = 0;
  for (const row of database.prepare(`
    SELECT user_id AS userId, slot, revision, payload
    FROM ${CLOUD_PAYLOAD_TABLE}
    ORDER BY user_id, slot, revision
  `).iterate()) {
    rows += 1;
    if (typeof row.payload !== "string") {
      fail("CLOUD_PAYLOAD_MAINTENANCE_BODY_INVALID", "A cloud payload row does not contain text");
    }
    const alias = parseCloudPayloadAlias(row.payload);
    if (alias) {
      aliasRows += 1;
      if (requirement === "materialized") {
        fail("CLOUD_PAYLOAD_MAINTENANCE_POSTCONDITION_FAILED", "Materialization left an alias in the canonical table");
      }
      const key = `${alias.checksum}/${alias.sizeBytes}`;
      if (!validatedAliases.has(key)) {
        const payload = readCloudPayload(database, {
          userId: row.userId,
          slot: row.slot,
          revision: Number(row.revision),
        });
        if (typeof payload !== "string") {
          fail("CLOUD_PAYLOAD_MAINTENANCE_BODY_INVALID", "An aliased cloud payload could not be resolved");
        }
        parseJsonBody(payload);
        validatedAliases.add(key);
      }
      jsonRows += 1;
      continue;
    }
    materializedRows += 1;
    if (requirement === "aliased") {
      fail("CLOUD_PAYLOAD_MAINTENANCE_POSTCONDITION_FAILED", "Backfill left a legacy body in the canonical table");
    }
    parseJsonBody(row.payload);
    jsonRows += 1;
  }
  return {
    rows,
    aliasRows,
    materializedRows,
    readableJsonRows: jsonRows,
    uniqueAliasBodies: validatedAliases.size,
  };
}

function metadataHealthy(stats) {
  return stats.rows.invalidAliases === 0 &&
    stats.rows.conflictingAliasMetadata === 0 &&
    stats.blobs.missingReferences === 0;
}

function assertMetadataHealthy(stats) {
  if (!metadataHealthy(stats)) {
    fail(
      "CLOUD_PAYLOAD_MAINTENANCE_POSTCONDITION_FAILED",
      "Cloud payload metadata contains invalid aliases, conflicting sizes, or missing blobs",
    );
  }
}

function inspectStatus(database) {
  assertCanonicalPayloadTable(database);
  const initialized = isBlobStoreInitialized(database);
  if (initialized) initializeCloudPayloadStore(database);
  const stats = initialized ? collectCloudPayloadStoreStats(database) : uninitializedStoreStats(database);
  let bodyValidation;
  if (!metadataHealthy(stats)) {
    bodyValidation = { ok: false, code: "CLOUD_PAYLOAD_MAINTENANCE_METADATA_INVALID" };
  } else {
    try {
      bodyValidation = { ok: true, ...validatePayloadBodies(database, "mixed") };
    } catch (error) {
      const normalized = publicCloudPayloadMaintenanceError(error);
      bodyValidation = { ok: false, code: normalized.code };
    }
  }
  return {
    initialized,
    healthy: metadataHealthy(stats) && bodyValidation.ok,
    bodyValidation,
    stats,
  };
}

function defaultBackupCandidate(databasePath, action, now, attempt) {
  const parsed = path.parse(databasePath);
  const timestamp = new Date(now).toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
  const suffix = attempt === 0 ? "" : `-${attempt}`;
  const extension = parsed.ext || ".sqlite";
  return path.join(
    parsed.dir,
    `${parsed.name}.cloud-payload-${action}-${timestamp}-${process.pid}${suffix}.backup${extension}`,
  );
}

async function reserveBackupFile(databasePath, action, explicitBackup, now) {
  if (explicitBackup !== undefined) {
    try {
      const handle = await open(explicitBackup, "wx", 0o600);
      await handle.close();
      return explicitBackup;
    } catch (error) {
      if (errorCode(error) === "EEXIST") {
        fail("CLOUD_PAYLOAD_MAINTENANCE_BACKUP_EXISTS", "The backup target already exists and will not be overwritten");
      }
      throw normalizeCloudPayloadMaintenanceError(error, "backup");
    }
  }
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = defaultBackupCandidate(databasePath, action, now, attempt);
    try {
      const handle = await open(candidate, "wx", 0o600);
      await handle.close();
      return candidate;
    } catch (error) {
      if (errorCode(error) === "EEXIST") continue;
      throw normalizeCloudPayloadMaintenanceError(error, "backup");
    }
  }
  fail("CLOUD_PAYLOAD_MAINTENANCE_BACKUP_EXISTS", "A unique backup filename could not be reserved");
}

export async function createVerifiedCloudPayloadBackup(database, options) {
  const databasePath = resolveRequiredPath(
    options?.database,
    "CLOUD_PAYLOAD_MAINTENANCE_DATABASE_REQUIRED",
    "A database path is required for backup",
  );
  const action = options?.action;
  if (!ACTIONS.has(action) || action === "status") {
    fail("CLOUD_PAYLOAD_MAINTENANCE_ACTION_INVALID", "A mutation action is required for backup");
  }
  const explicitBackup = options?.backup === undefined
    ? undefined
    : resolveRequiredPath(
      options.backup,
      "CLOUD_PAYLOAD_MAINTENANCE_BACKUP_INVALID",
      "The backup path is invalid",
    );
  if (explicitBackup === databasePath) {
    fail("CLOUD_PAYLOAD_MAINTENANCE_BACKUP_TARGET_INVALID", "Backup and database files must differ");
  }
  quickCheck(database, "Source database");
  const beforeDataVersion = dataVersion(database);
  const sourceFingerprint = databaseFingerprint(database);
  const backupPath = await reserveBackupFile(
    databasePath,
    action,
    explicitBackup,
    Number.isFinite(options?.now) ? options.now : Date.now(),
  );
  try {
    await database.backup(backupPath);
  } catch (error) {
    await rm(backupPath, { force: true }).catch(() => {});
    throw normalizeCloudPayloadMaintenanceError(error, "backup");
  }
  try {
    const backupStat = await stat(backupPath);
    if (!backupStat.isFile() || backupStat.size <= 0) {
      fail("CLOUD_PAYLOAD_MAINTENANCE_BACKUP_INVALID", "SQLite backup did not produce a non-empty regular file");
    }
    let backupDatabase;
    try {
      backupDatabase = new Database(backupPath, { readonly: true, fileMustExist: true });
      backupDatabase.pragma("query_only = ON");
      quickCheck(backupDatabase, "Backup database");
      const backupFingerprint = databaseFingerprint(backupDatabase);
      if (!sameFingerprint(sourceFingerprint, backupFingerprint)) {
        fail("CLOUD_PAYLOAD_MAINTENANCE_BACKUP_MISMATCH", "SQLite backup does not match the source snapshot");
      }
    } catch (error) {
      throw normalizeCloudPayloadMaintenanceError(error, "backup");
    } finally {
      backupDatabase?.close();
    }
    if (dataVersion(database) !== beforeDataVersion || !sameFingerprint(sourceFingerprint, databaseFingerprint(database))) {
      fail(
        "CLOUD_PAYLOAD_MAINTENANCE_DATABASE_CHANGED_AFTER_BACKUP",
        "The database changed while the backup was being created; no maintenance was applied",
      );
    }
    return {
      path: backupPath,
      file: path.basename(backupPath),
      verified: true,
      quickCheck: true,
      sourceDataVersion: beforeDataVersion,
      sourceFingerprint,
    };
  } catch (error) {
    await rm(backupPath, { force: true }).catch(() => {});
    throw normalizeCloudPayloadMaintenanceError(error, "backup");
  }
}

function assertPreservedLogicalRows(before, after) {
  if (before.rows.total !== after.rows.total || before.bytes.logical !== after.bytes.logical) {
    fail(
      "CLOUD_PAYLOAD_MAINTENANCE_POSTCONDITION_FAILED",
      "Cloud payload row count or logical byte count changed unexpectedly",
    );
  }
}

function performMutation(database, action, batchSize) {
  initializeCloudPayloadStore(database);
  const before = collectCloudPayloadStoreStats(database);
  let changes;
  if (action === "backfill") changes = backfillCloudPayloadAliases(database, { batchSize });
  else if (action === "materialize") changes = materializeCloudPayloadAliases(database, { batchSize });
  else changes = garbageCollectCloudPayloadBlobs(database);
  const after = collectCloudPayloadStoreStats(database);
  assertPreservedLogicalRows(before, after);
  assertMetadataHealthy(after);

  let validation;
  if (action === "backfill") {
    if (after.rows.legacy !== 0 || after.rows.aliases !== after.rows.total) {
      fail("CLOUD_PAYLOAD_MAINTENANCE_POSTCONDITION_FAILED", "Backfill did not alias every canonical payload row");
    }
    validation = validatePayloadBodies(database, "aliased");
  } else if (action === "materialize") {
    if (
      after.rows.aliases !== 0 ||
      after.rows.invalidAliases !== 0 ||
      after.blobs.missingReferences !== 0
    ) {
      fail(
        "CLOUD_PAYLOAD_MAINTENANCE_POSTCONDITION_FAILED",
        "Materialization did not remove every alias or left an invalid reference",
      );
    }
    validation = validatePayloadBodies(database, "materialized");
    if (validation.materializedRows !== after.rows.total || validation.readableJsonRows !== after.rows.total) {
      fail(
        "CLOUD_PAYLOAD_MAINTENANCE_POSTCONDITION_FAILED",
        "Legacy direct SELECT readers cannot parse every materialized body",
      );
    }
  } else {
    if (after.blobs.orphan !== 0) {
      fail("CLOUD_PAYLOAD_MAINTENANCE_POSTCONDITION_FAILED", "Garbage collection left orphan payload blobs");
    }
    validation = validatePayloadBodies(database, "mixed");
  }
  quickCheck(database, "Post-maintenance database");
  return { before, changes, after, validation };
}

export async function runCloudPayloadMaintenance(rawOptions) {
  const options = validateOptions(rawOptions);
  let database;
  try {
    database = new Database(options.database, {
      readonly: options.action === "status",
      fileMustExist: true,
      timeout: options.busyTimeoutMs,
    });
  } catch (error) {
    throw normalizeCloudPayloadMaintenanceError(error, "database");
  }

  try {
    database.pragma(`busy_timeout = ${options.busyTimeoutMs}`);
    if (options.action === "status") {
      database.pragma("query_only = ON");
      quickCheck(database, "Database");
      return {
        ok: true,
        action: "status",
        database: path.basename(options.database),
        readOnly: true,
        quickCheck: true,
        store: inspectStatus(database),
      };
    }

    const backup = await createVerifiedCloudPayloadBackup(database, options);
    const transaction = database.transaction(() => {
      if (
        dataVersion(database) !== backup.sourceDataVersion ||
        !sameFingerprint(backup.sourceFingerprint, databaseFingerprint(database))
      ) {
        fail(
          "CLOUD_PAYLOAD_MAINTENANCE_DATABASE_CHANGED_AFTER_BACKUP",
          "The database changed after its verified backup; no maintenance was applied",
        );
      }
      return performMutation(database, options.action, options.batchSize);
    });
    let mutation;
    try {
      mutation = transaction.immediate();
    } catch (error) {
      throw normalizeCloudPayloadMaintenanceError(error, "operation");
    }
    return {
      ok: true,
      action: options.action,
      database: path.basename(options.database),
      backup: { file: backup.file, verified: true, quickCheck: true },
      confirmationAccepted: true,
      transaction: "committed",
      ...mutation,
    };
  } catch (error) {
    throw normalizeCloudPayloadMaintenanceError(error, "operation");
  } finally {
    database.close();
  }
}

export async function mainCloudPayloadMaintenance(values = process.argv.slice(2), io = process) {
  let action = "status";
  try {
    const options = parseCloudPayloadMaintenanceArguments(values);
    action = options.action;
    const result = await runCloudPayloadMaintenance(options);
    io.stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    io.stderr.write(`${JSON.stringify({
      ok: false,
      action,
      error: publicCloudPayloadMaintenanceError(error),
    })}\n`);
    return 1;
  }
}

let isCli = false;
try { isCli = Boolean(process.argv[1]) && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); }
catch { isCli = false; }
if (isCli) process.exitCode = await mainCloudPayloadMaintenance();
