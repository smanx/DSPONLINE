import { createHash } from "node:crypto";

export const CLOUD_PAYLOAD_STORE_INTERNAL_VERSION = 1;
export const CLOUD_PAYLOAD_SQLITE_LAYOUT_VERSION = 2;
export const CLOUD_PAYLOAD_TABLE = "cloud_save_payloads";
export const CLOUD_PAYLOAD_BLOB_TABLE = "cloud_save_payload_blobs";
export const CLOUD_PAYLOAD_ALIAS_PREFIX = "\u001eDSPIDLE-CLOUD-PAYLOAD-ALIAS/V1/";

const CLOUD_PAYLOAD_ALIAS_SUFFIX = "\u001f";
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ALIAS_PATTERN = /^\u001eDSPIDLE-CLOUD-PAYLOAD-ALIAS\/V1\/([0-9a-f]{64})\/(0|[1-9][0-9]{0,15})\u001f$/;
const DEFAULT_SCAN_BATCH_SIZE = 1;

export class CloudPayloadStoreError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "CloudPayloadStoreError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details = undefined) {
  throw new CloudPayloadStoreError(code, message, details);
}

function assertDatabase(database) {
  if (!database || typeof database.prepare !== "function" || typeof database.exec !== "function") {
    fail("CLOUD_PAYLOAD_DATABASE_INVALID", "A synchronous SQLite database connection is required");
  }
}

function requireOuterTransaction(database, operation) {
  assertDatabase(database);
  if (database.inTransaction !== true) {
    fail(
      "CLOUD_PAYLOAD_TRANSACTION_REQUIRED",
      `${operation} requires a caller-owned SQLite transaction`,
      { operation },
    );
  }
}

function assertTableColumns(database, tableName, requiredColumns) {
  const row = database.prepare("SELECT type FROM sqlite_master WHERE name = ?").get(tableName);
  if (!row || row.type !== "table") {
    fail("CLOUD_PAYLOAD_SCHEMA_INVALID", `Required SQLite table ${tableName} is missing`);
  }
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all();
  const byName = new Map(columns.map((column) => [column.name, column]));
  const names = new Set(byName.keys());
  const missing = requiredColumns.filter((column) => !names.has(column));
  if (missing.length > 0) {
    fail("CLOUD_PAYLOAD_SCHEMA_INVALID", `SQLite table ${tableName} has an incompatible shape`, {
      table: tableName,
      missingColumns: missing,
    });
  }
  return byName;
}

function declaredType(column) {
  return typeof column?.type === "string" ? column.type.trim().toUpperCase() : "";
}

function assertCanonicalPayloadTableShape(columns) {
  const expected = [
    ["user_id", "TEXT", 1],
    ["slot", "TEXT", 2],
    ["revision", "INTEGER", 3],
    ["payload", "TEXT", 0],
  ];
  for (const [name, type, primaryKeyPosition] of expected) {
    const column = columns.get(name);
    if (declaredType(column) !== type || Number(column?.notnull) !== 1 || Number(column?.pk) !== primaryKeyPosition) {
      fail("CLOUD_PAYLOAD_SCHEMA_INVALID", `SQLite table ${CLOUD_PAYLOAD_TABLE} has an incompatible ${name} column`);
    }
  }
}

function assertBlobTableShape(columns) {
  const checksum = columns.get("checksum");
  const sizeBytes = columns.get("size_bytes");
  const payload = columns.get("payload");
  if (declaredType(checksum) !== "TEXT" || Number(checksum?.notnull) !== 1 || Number(checksum?.pk) !== 1 ||
      declaredType(sizeBytes) !== "INTEGER" || Number(sizeBytes?.notnull) !== 1 || Number(sizeBytes?.pk) !== 0 ||
      declaredType(payload) !== "TEXT" || Number(payload?.notnull) !== 1 || Number(payload?.pk) !== 0) {
    fail("CLOUD_PAYLOAD_SCHEMA_INVALID", `SQLite table ${CLOUD_PAYLOAD_BLOB_TABLE} has an incompatible shape`);
  }
}

function validateIdentity({ userId, slot, revision }) {
  if (typeof userId !== "string" || userId.length === 0) {
    fail("CLOUD_PAYLOAD_IDENTITY_INVALID", "Cloud payload userId must be a non-empty string");
  }
  if (typeof slot !== "string" || slot.length === 0) {
    fail("CLOUD_PAYLOAD_IDENTITY_INVALID", "Cloud payload slot must be a non-empty string");
  }
  if (!Number.isSafeInteger(revision) || revision < 1) {
    fail("CLOUD_PAYLOAD_IDENTITY_INVALID", "Cloud payload revision must be a positive safe integer");
  }
  return { userId, slot, revision };
}

function validateUserId(userId) {
  if (typeof userId !== "string" || userId.length === 0) {
    fail("CLOUD_PAYLOAD_IDENTITY_INVALID", "Cloud payload userId must be a non-empty string");
  }
  return userId;
}

function assertChecksum(checksum, code = "CLOUD_PAYLOAD_CHECKSUM_INVALID") {
  if (typeof checksum !== "string" || !SHA256_PATTERN.test(checksum)) {
    fail(code, "Cloud payload checksum must be a lowercase SHA-256 hex digest");
  }
  return checksum;
}

function assertSizeBytes(sizeBytes, code = "CLOUD_PAYLOAD_SIZE_INVALID") {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
    fail(code, "Cloud payload byte size must be a non-negative safe integer");
  }
  return sizeBytes;
}

function isAliasCandidate(value) {
  return typeof value === "string" && value.charCodeAt(0) === 0x1e;
}

function sha256(payload) {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

function describePayload(payload, expectedChecksum = undefined) {
  if (typeof payload !== "string") {
    fail("CLOUD_PAYLOAD_BODY_INVALID", "Cloud payload body must be a string");
  }
  if (isAliasCandidate(payload)) {
    fail("CLOUD_PAYLOAD_BODY_INVALID", "A payload alias cannot be stored as blob content");
  }
  if (Buffer.from(payload, "utf8").toString("utf8") !== payload) {
    fail("CLOUD_PAYLOAD_TEXT_ENCODING_INVALID", "Cloud payload body is not stable UTF-8 text");
  }
  const sizeBytes = Buffer.byteLength(payload, "utf8");
  assertSizeBytes(sizeBytes);
  const checksum = sha256(payload);
  if (expectedChecksum !== undefined) {
    assertChecksum(expectedChecksum);
    if (expectedChecksum !== checksum) {
      fail("CLOUD_PAYLOAD_INPUT_CHECKSUM_MISMATCH", "Cloud payload body does not match its supplied SHA-256 checksum", {
        sizeBytes,
      });
    }
  }
  return { payload, checksum, sizeBytes };
}

export function createCloudPayloadAlias(checksum, sizeBytes) {
  assertChecksum(checksum);
  assertSizeBytes(sizeBytes);
  return `${CLOUD_PAYLOAD_ALIAS_PREFIX}${checksum}/${sizeBytes}${CLOUD_PAYLOAD_ALIAS_SUFFIX}`;
}

export function parseCloudPayloadAlias(value) {
  if (!isAliasCandidate(value)) return null;
  const match = ALIAS_PATTERN.exec(value);
  if (!match) {
    fail("CLOUD_PAYLOAD_ALIAS_INVALID", "Cloud payload alias is malformed or uses an unsupported version");
  }
  const sizeBytes = Number(match[2]);
  if (!Number.isSafeInteger(sizeBytes)) {
    fail("CLOUD_PAYLOAD_ALIAS_INVALID", "Cloud payload alias contains an unsafe byte size");
  }
  return { version: 1, checksum: match[1], sizeBytes };
}

/**
 * Adds the content-addressed blob table without changing the existing layout-v2
 * cloud_save_payloads table or its direct-SELECT compatibility contract.
 */
export function initializeCloudPayloadStore(database) {
  assertDatabase(database);
  const payloadColumns = assertTableColumns(database, CLOUD_PAYLOAD_TABLE, ["user_id", "slot", "revision", "payload"]);
  assertCanonicalPayloadTableShape(payloadColumns);
  const existing = database.prepare("SELECT type FROM sqlite_master WHERE name = ?").get(CLOUD_PAYLOAD_BLOB_TABLE);
  if (existing && existing.type !== "table") {
    fail("CLOUD_PAYLOAD_SCHEMA_INVALID", `SQLite object ${CLOUD_PAYLOAD_BLOB_TABLE} must be a table`);
  }
  if (!existing) {
    database.exec(`
      CREATE TABLE ${CLOUD_PAYLOAD_BLOB_TABLE} (
        checksum TEXT NOT NULL PRIMARY KEY
          CHECK(length(checksum) = 64 AND checksum NOT GLOB '*[^0-9a-f]*'),
        size_bytes INTEGER NOT NULL
          CHECK(typeof(size_bytes) = 'integer' AND size_bytes >= 0),
        payload TEXT NOT NULL
          CHECK(typeof(payload) = 'text' AND length(CAST(payload AS BLOB)) = size_bytes)
      ) WITHOUT ROWID
    `);
  }
  const blobColumns = assertTableColumns(database, CLOUD_PAYLOAD_BLOB_TABLE, ["checksum", "size_bytes", "payload"]);
  assertBlobTableShape(blobColumns);
  return {
    internalVersion: CLOUD_PAYLOAD_STORE_INTERNAL_VERSION,
    sqliteLayoutVersion: CLOUD_PAYLOAD_SQLITE_LAYOUT_VERSION,
    payloadTable: CLOUD_PAYLOAD_TABLE,
    blobTable: CLOUD_PAYLOAD_BLOB_TABLE,
  };
}

function readBlobRow(database, checksum) {
  return database.prepare(`
    SELECT checksum, size_bytes AS sizeBytes, payload
    FROM ${CLOUD_PAYLOAD_BLOB_TABLE}
    WHERE checksum = ?
  `).get(checksum);
}

function validateResolvedBlob(row, alias) {
  if (!row) {
    fail("CLOUD_PAYLOAD_BLOB_MISSING", "Cloud payload alias points to a missing blob", {
      expectedSizeBytes: alias.sizeBytes,
    });
  }
  if (typeof row.payload !== "string" || isAliasCandidate(row.payload)) {
    fail("CLOUD_PAYLOAD_BLOB_BODY_INVALID", "Cloud payload blob does not contain original text");
  }
  if (!Number.isSafeInteger(row.sizeBytes) || row.sizeBytes < 0) {
    fail("CLOUD_PAYLOAD_BLOB_SIZE_INVALID", "Cloud payload blob has invalid byte-size metadata");
  }
  if (row.sizeBytes !== alias.sizeBytes) {
    fail("CLOUD_PAYLOAD_ALIAS_SIZE_MISMATCH", "Cloud payload alias and blob disagree on byte size", {
      aliasSizeBytes: alias.sizeBytes,
      blobSizeBytes: row.sizeBytes,
    });
  }
  const actualSizeBytes = Buffer.byteLength(row.payload, "utf8");
  if (actualSizeBytes !== row.sizeBytes) {
    fail("CLOUD_PAYLOAD_BLOB_SIZE_MISMATCH", "Cloud payload blob body does not match its stored byte size", {
      storedSizeBytes: row.sizeBytes,
      actualSizeBytes,
    });
  }
  if (sha256(row.payload) !== alias.checksum) {
    fail("CLOUD_PAYLOAD_BLOB_CHECKSUM_MISMATCH", "Cloud payload blob body does not match its SHA-256 address", {
      sizeBytes: row.sizeBytes,
    });
  }
  return row.payload;
}

function resolveAlias(database, alias) {
  return validateResolvedBlob(readBlobRow(database, alias.checksum), alias);
}

function ensureBlob(database, descriptor) {
  const existing = readBlobRow(database, descriptor.checksum);
  if (existing) {
    if (existing.payload !== descriptor.payload) {
      fail(
        "CLOUD_PAYLOAD_CHECKSUM_COLLISION",
        "An existing cloud payload blob has the same checksum but different content; it was not overwritten",
        { incomingSizeBytes: descriptor.sizeBytes },
      );
    }
    validateResolvedBlob(existing, descriptor);
    return "reused";
  }
  database.prepare(`
    INSERT INTO ${CLOUD_PAYLOAD_BLOB_TABLE} (checksum, size_bytes, payload)
    VALUES (?, ?, ?)
  `).run(descriptor.checksum, descriptor.sizeBytes, descriptor.payload);
  return "inserted";
}

function inspectedPayloadDescriptor(payload, checksum, sizeBytes) {
  if (typeof payload !== "string" || isAliasCandidate(payload)) {
    fail("CLOUD_PAYLOAD_BODY_INVALID", "Inspected cloud payload body must be original text");
  }
  assertChecksum(checksum);
  assertSizeBytes(sizeBytes);
  return { payload, checksum, sizeBytes };
}

export function writeCloudPayload(database, input) {
  requireOuterTransaction(database, "writeCloudPayload");
  const identity = validateIdentity(input ?? {});
  const descriptor = describePayload(input?.payload, input?.checksum);
  const blob = ensureBlob(database, descriptor);
  const alias = createCloudPayloadAlias(descriptor.checksum, descriptor.sizeBytes);
  const result = database.prepare(`
    INSERT INTO ${CLOUD_PAYLOAD_TABLE} (user_id, slot, revision, payload)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, slot, revision) DO UPDATE SET payload = excluded.payload
  `).run(identity.userId, identity.slot, identity.revision, alias);
  return {
    checksum: descriptor.checksum,
    sizeBytes: descriptor.sizeBytes,
    blob,
    rowChanges: result.changes,
  };
}

/**
 * Persist a body whose exact UTF-8 size and SHA-256 were already produced by
 * the authoritative upload inspector. This deliberately avoids hashing a
 * second 30 MiB string while the SQLite mutation queue is held. The blob-table
 * CHECK constraint still enforces the supplied byte size, and an existing
 * address is compared byte-for-byte so a checksum collision cannot overwrite
 * stored content. Callers outside that inspected boundary must use
 * writeCloudPayload(), which computes both values itself.
 */
export function writeInspectedCloudPayload(database, input) {
  requireOuterTransaction(database, "writeInspectedCloudPayload");
  const identity = validateIdentity(input ?? {});
  const descriptor = inspectedPayloadDescriptor(input?.payload, input?.checksum, input?.sizeBytes);
  const blob = ensureBlob(database, descriptor);
  const alias = createCloudPayloadAlias(descriptor.checksum, descriptor.sizeBytes);
  const result = database.prepare(`
    INSERT INTO ${CLOUD_PAYLOAD_TABLE} (user_id, slot, revision, payload)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, slot, revision) DO UPDATE SET payload = excluded.payload
  `).run(identity.userId, identity.slot, identity.revision, alias);
  return {
    checksum: descriptor.checksum,
    sizeBytes: descriptor.sizeBytes,
    blob,
    rowChanges: result.changes,
  };
}

export function readCloudPayload(database, input) {
  assertDatabase(database);
  const identity = validateIdentity(input ?? {});
  const row = database.prepare(`
    SELECT payload
    FROM ${CLOUD_PAYLOAD_TABLE}
    WHERE user_id = ? AND slot = ? AND revision = ?
  `).get(identity.userId, identity.slot, identity.revision);
  if (!row) return null;
  if (typeof row.payload !== "string") {
    fail("CLOUD_PAYLOAD_ROW_INVALID", "Cloud payload row does not contain text");
  }
  const alias = parseCloudPayloadAlias(row.payload);
  return alias ? resolveAlias(database, alias) : row.payload;
}

export function deleteCloudPayload(database, input) {
  requireOuterTransaction(database, "deleteCloudPayload");
  const identity = validateIdentity(input ?? {});
  return database.prepare(`
    DELETE FROM ${CLOUD_PAYLOAD_TABLE}
    WHERE user_id = ? AND slot = ? AND revision = ?
  `).run(identity.userId, identity.slot, identity.revision).changes;
}

export function deleteCloudPayloadsForUser(database, userId) {
  requireOuterTransaction(database, "deleteCloudPayloadsForUser");
  validateUserId(userId);
  return database.prepare(`DELETE FROM ${CLOUD_PAYLOAD_TABLE} WHERE user_id = ?`).run(userId).changes;
}

function normalizeBatchSize(value) {
  if (value === undefined) return DEFAULT_SCAN_BATCH_SIZE;
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    fail("CLOUD_PAYLOAD_BATCH_SIZE_INVALID", "Cloud payload scan batch size must be an integer from 1 through 100");
  }
  return value;
}

function scanPayloadRows(database, batchSize, visitor) {
  const first = database.prepare(`
    SELECT user_id AS userId, slot, revision, payload
    FROM ${CLOUD_PAYLOAD_TABLE}
    ORDER BY user_id, slot, revision
    LIMIT ?
  `);
  const next = database.prepare(`
    SELECT user_id AS userId, slot, revision, payload
    FROM ${CLOUD_PAYLOAD_TABLE}
    WHERE (user_id, slot, revision) > (?, ?, ?)
    ORDER BY user_id, slot, revision
    LIMIT ?
  `);
  let cursor = null;
  while (true) {
    const rows = cursor
      ? next.all(cursor.userId, cursor.slot, cursor.revision, batchSize)
      : first.all(batchSize);
    if (rows.length === 0) break;
    for (const row of rows) visitor(row);
    const last = rows.at(-1);
    cursor = { userId: last.userId, slot: last.slot, revision: last.revision };
  }
}

function addSafe(total, value) {
  return Math.min(Number.MAX_SAFE_INTEGER, total + Math.max(0, Number(value) || 0));
}

export function backfillCloudPayloadAliases(database, options = {}) {
  requireOuterTransaction(database, "backfillCloudPayloadAliases");
  const batchSize = normalizeBatchSize(options.batchSize);
  const update = database.prepare(`
    UPDATE ${CLOUD_PAYLOAD_TABLE}
    SET payload = ?
    WHERE user_id = ? AND slot = ? AND revision = ?
  `);
  const result = {
    scannedRows: 0,
    backfilledRows: 0,
    alreadyAliasedRows: 0,
    blobsInserted: 0,
    blobsReused: 0,
    logicalBytes: 0,
  };
  scanPayloadRows(database, batchSize, (row) => {
    result.scannedRows += 1;
    if (typeof row.payload !== "string") {
      fail("CLOUD_PAYLOAD_ROW_INVALID", "Cloud payload row does not contain text");
    }
    const alias = parseCloudPayloadAlias(row.payload);
    if (alias) {
      resolveAlias(database, alias);
      result.alreadyAliasedRows += 1;
      result.logicalBytes = addSafe(result.logicalBytes, alias.sizeBytes);
      return;
    }
    const descriptor = describePayload(row.payload);
    const blob = ensureBlob(database, descriptor);
    const changes = update.run(
      createCloudPayloadAlias(descriptor.checksum, descriptor.sizeBytes),
      row.userId,
      row.slot,
      row.revision,
    ).changes;
    if (changes !== 1) {
      fail("CLOUD_PAYLOAD_ROW_CHANGED", "Cloud payload row changed during backfill");
    }
    result.backfilledRows += 1;
    result.logicalBytes = addSafe(result.logicalBytes, descriptor.sizeBytes);
    if (blob === "inserted") result.blobsInserted += 1;
    else result.blobsReused += 1;
  });
  return result;
}

export function materializeCloudPayloadAliases(database, options = {}) {
  requireOuterTransaction(database, "materializeCloudPayloadAliases");
  const batchSize = normalizeBatchSize(options.batchSize);
  const update = database.prepare(`
    UPDATE ${CLOUD_PAYLOAD_TABLE}
    SET payload = ?
    WHERE user_id = ? AND slot = ? AND revision = ?
  `);
  const result = {
    scannedRows: 0,
    materializedRows: 0,
    alreadyMaterializedRows: 0,
    logicalBytes: 0,
  };
  scanPayloadRows(database, batchSize, (row) => {
    result.scannedRows += 1;
    if (typeof row.payload !== "string") {
      fail("CLOUD_PAYLOAD_ROW_INVALID", "Cloud payload row does not contain text");
    }
    const alias = parseCloudPayloadAlias(row.payload);
    if (!alias) {
      result.alreadyMaterializedRows += 1;
      result.logicalBytes = addSafe(result.logicalBytes, Buffer.byteLength(row.payload, "utf8"));
      return;
    }
    const payload = resolveAlias(database, alias);
    const changes = update.run(payload, row.userId, row.slot, row.revision).changes;
    if (changes !== 1) {
      fail("CLOUD_PAYLOAD_ROW_CHANGED", "Cloud payload row changed during rollback materialization");
    }
    result.materializedRows += 1;
    result.logicalBytes = addSafe(result.logicalBytes, alias.sizeBytes);
  });
  return result;
}

function collectAliasReferences(database) {
  const references = new Map();
  for (const row of database.prepare(`
    SELECT
      substr(payload, 1, 160) AS prefix,
      length(CAST(payload AS BLOB)) AS storedBytes
    FROM ${CLOUD_PAYLOAD_TABLE}
  `).iterate()) {
    if (typeof row.prefix !== "string") {
      fail("CLOUD_PAYLOAD_ROW_INVALID", "Cloud payload row does not contain text");
    }
    if (!isAliasCandidate(row.prefix)) continue;
    const storedBytes = sqliteSafeNumber(row.storedBytes);
    if (storedBytes !== Buffer.byteLength(row.prefix, "utf8")) {
      fail("CLOUD_PAYLOAD_ALIAS_INVALID", "Cloud payload alias exceeds its fixed maximum representation");
    }
    const alias = parseCloudPayloadAlias(row.prefix);
    if (!alias) continue;
    const previousSize = references.get(alias.checksum);
    if (previousSize !== undefined && previousSize !== alias.sizeBytes) {
      fail("CLOUD_PAYLOAD_ALIAS_SIZE_MISMATCH", "Aliases sharing a checksum disagree on byte size");
    }
    references.set(alias.checksum, alias.sizeBytes);
  }
  return references;
}

export function garbageCollectCloudPayloadBlobs(database) {
  requireOuterTransaction(database, "garbageCollectCloudPayloadBlobs");
  const references = collectAliasReferences(database);
  for (const [checksum, sizeBytes] of references) {
    resolveAlias(database, { version: 1, checksum, sizeBytes });
  }
  const orphanChecksums = [];
  for (const row of database.prepare(`SELECT checksum FROM ${CLOUD_PAYLOAD_BLOB_TABLE}`).iterate()) {
    if (typeof row.checksum !== "string" || !SHA256_PATTERN.test(row.checksum)) {
      fail("CLOUD_PAYLOAD_BLOB_CHECKSUM_INVALID", "Cloud payload blob has an invalid checksum address");
    }
    if (!references.has(row.checksum)) orphanChecksums.push(row.checksum);
  }
  const remove = database.prepare(`DELETE FROM ${CLOUD_PAYLOAD_BLOB_TABLE} WHERE checksum = ?`);
  let deletedBlobs = 0;
  for (const checksum of orphanChecksums) deletedBlobs += remove.run(checksum).changes;
  return {
    referencedBlobs: references.size,
    orphanBlobs: orphanChecksums.length,
    deletedBlobs,
  };
}

function sqliteSafeNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(number));
}

/**
 * Returns only aggregate counts and byte totals. It never returns account IDs,
 * slots, revisions, checksums, aliases, or save payload text.
 */
export function collectCloudPayloadStoreStats(database) {
  assertDatabase(database);
  const references = new Map();
  let totalRows = 0;
  let legacyRows = 0;
  let aliasRows = 0;
  let invalidAliasRows = 0;
  let conflictingAliasMetadata = 0;
  let mainStoredBytes = 0;
  let legacyLogicalBytes = 0;
  let aliasedLogicalBytes = 0;
  const rows = database.prepare(`
    SELECT
      substr(payload, 1, 160) AS prefix,
      length(CAST(payload AS BLOB)) AS storedBytes
    FROM ${CLOUD_PAYLOAD_TABLE}
  `).iterate();
  for (const row of rows) {
    totalRows += 1;
    const storedBytes = sqliteSafeNumber(row.storedBytes);
    mainStoredBytes = addSafe(mainStoredBytes, storedBytes);
    if (!isAliasCandidate(row.prefix)) {
      legacyRows += 1;
      legacyLogicalBytes = addSafe(legacyLogicalBytes, storedBytes);
      continue;
    }
    try {
      if (storedBytes !== Buffer.byteLength(row.prefix, "utf8")) {
        fail("CLOUD_PAYLOAD_ALIAS_INVALID", "Cloud payload alias exceeds its fixed maximum representation");
      }
      const alias = parseCloudPayloadAlias(row.prefix);
      aliasRows += 1;
      aliasedLogicalBytes = addSafe(aliasedLogicalBytes, alias.sizeBytes);
      const previousSize = references.get(alias.checksum);
      if (previousSize !== undefined && previousSize !== alias.sizeBytes) conflictingAliasMetadata += 1;
      else references.set(alias.checksum, alias.sizeBytes);
    } catch (error) {
      if (!(error instanceof CloudPayloadStoreError)) throw error;
      invalidAliasRows += 1;
    }
  }

  let blobRows = 0;
  let blobBytes = 0;
  let referencedBlobRows = 0;
  let referencedBlobBytes = 0;
  let orphanBlobRows = 0;
  const foundReferences = new Set();
  for (const row of database.prepare(`
    SELECT checksum, size_bytes AS sizeBytes
    FROM ${CLOUD_PAYLOAD_BLOB_TABLE}
  `).iterate()) {
    blobRows += 1;
    const sizeBytes = sqliteSafeNumber(row.sizeBytes);
    blobBytes = addSafe(blobBytes, sizeBytes);
    if (typeof row.checksum === "string" && references.has(row.checksum)) {
      referencedBlobRows += 1;
      referencedBlobBytes = addSafe(referencedBlobBytes, sizeBytes);
      foundReferences.add(row.checksum);
    } else {
      orphanBlobRows += 1;
    }
  }
  let missingBlobReferences = 0;
  for (const checksum of references.keys()) if (!foundReferences.has(checksum)) missingBlobReferences += 1;

  return {
    internalVersion: CLOUD_PAYLOAD_STORE_INTERNAL_VERSION,
    sqliteLayoutVersion: CLOUD_PAYLOAD_SQLITE_LAYOUT_VERSION,
    rows: {
      total: totalRows,
      legacy: legacyRows,
      aliases: aliasRows,
      invalidAliases: invalidAliasRows,
      conflictingAliasMetadata,
    },
    blobs: {
      total: blobRows,
      referenced: referencedBlobRows,
      orphan: orphanBlobRows,
      missingReferences: missingBlobReferences,
    },
    bytes: {
      mainStored: mainStoredBytes,
      logical: addSafe(legacyLogicalBytes, aliasedLogicalBytes),
      legacyLogical: legacyLogicalBytes,
      aliasedLogical: aliasedLogicalBytes,
      blobStored: blobBytes,
      referencedBlobStored: referencedBlobBytes,
      deduplicated: Math.max(0, aliasedLogicalBytes - referencedBlobBytes),
    },
  };
}
