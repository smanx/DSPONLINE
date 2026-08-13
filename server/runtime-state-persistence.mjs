import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

export const RUNTIME_STATE_PERSISTENCE_VERSION = 1;
export const RUNTIME_STATE_RECORDS_TABLE = "runtime_state_records";
export const RUNTIME_STATE_METADATA_TABLE = "runtime_state_metadata";

const METADATA_ROW_ID = 1;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;

const NAMESPACE = Object.freeze({
  player: "player",
  serviceDaily: "service_daily",
  analyticsVisitor: "analytics_visitor",
  analyticsSession: "analytics_session",
  analyticsDaily: "analytics_daily",
});

const NAMESPACE_LIMITS = Object.freeze({
  [NAMESPACE.player]: 1_024,
  [NAMESPACE.serviceDaily]: 64 * 1_024,
  [NAMESPACE.analyticsVisitor]: 1_024,
  [NAMESPACE.analyticsSession]: 2 * 1_024,
  [NAMESPACE.analyticsDaily]: 64 * 1_024,
});

const RUNTIME_ONLY_OPERATIONS = new Set([
  "presence.touch",
  "presence.update",
  "analytics.record",
]);

export class RuntimeStatePersistenceError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "RuntimeStatePersistenceError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details = undefined) {
  throw new RuntimeStatePersistenceError(code, message, details);
}

function assertDatabase(database) {
  if (!database || typeof database.prepare !== "function" || typeof database.exec !== "function") {
    fail("RUNTIME_STATE_DATABASE_INVALID", "A synchronous SQLite database connection is required");
  }
}

export function runtimeAppStateFingerprint(payload) {
  if (typeof payload !== "string") {
    fail("RUNTIME_STATE_APP_STATE_INVALID", "app_state payload must be a string before fingerprinting");
  }
  return createHash("sha256").update(payload).digest("hex");
}

function ownRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function analyticsState(value) {
  const source = ownRecord(value);
  return {
    visitors: ownRecord(source.visitors),
    sessions: ownRecord(source.sessions),
    daily: ownRecord(source.daily),
  };
}

function namespaceRecordMap(state, namespace) {
  const source = ownRecord(state);
  if (namespace === NAMESPACE.player) return ownRecord(source.players);
  if (namespace === NAMESPACE.serviceDaily) return ownRecord(source.dailyMetrics);
  const analytics = analyticsState(source.analytics);
  if (namespace === NAMESPACE.analyticsVisitor) return analytics.visitors;
  if (namespace === NAMESPACE.analyticsSession) return analytics.sessions;
  if (namespace === NAMESPACE.analyticsDaily) return analytics.daily;
  fail("RUNTIME_STATE_NAMESPACE_INVALID", "Runtime-state namespace is not supported", { namespace });
}

function validateRecordKey(namespace, key) {
  const valid = namespace === NAMESPACE.serviceDaily || namespace === NAMESPACE.analyticsDaily
    ? DAY_PATTERN.test(key)
    : HASH_PATTERN.test(key);
  if (!valid) {
    fail("RUNTIME_STATE_KEY_INVALID", "Runtime-state record key is invalid", { namespace });
  }
  return key;
}

function serializeRecord(namespace, key, value) {
  validateRecordKey(namespace, key);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("RUNTIME_STATE_RECORD_INVALID", "Runtime-state record must be an object", { namespace });
  }
  let payload;
  try {
    payload = JSON.stringify(value);
  } catch {
    fail("RUNTIME_STATE_RECORD_INVALID", "Runtime-state record is not JSON serializable", { namespace });
  }
  if (typeof payload !== "string") {
    fail("RUNTIME_STATE_RECORD_INVALID", "Runtime-state record serialization failed", { namespace });
  }
  const bytes = Buffer.byteLength(payload, "utf8");
  if (bytes > NAMESPACE_LIMITS[namespace]) {
    fail("RUNTIME_STATE_RECORD_TOO_LARGE", "Runtime-state record exceeds its bounded size", {
      namespace,
      bytes,
      maximumBytes: NAMESPACE_LIMITS[namespace],
    });
  }
  return payload;
}

function parseRecord(namespace, key, payload) {
  validateRecordKey(namespace, key);
  if (typeof payload !== "string" || Buffer.byteLength(payload, "utf8") > NAMESPACE_LIMITS[namespace]) {
    fail("RUNTIME_STATE_ROW_INVALID", "Persisted runtime-state row is invalid", { namespace });
  }
  try {
    const parsed = JSON.parse(payload);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new TypeError("record must be an object");
    return parsed;
  } catch {
    fail("RUNTIME_STATE_ROW_INVALID", "Persisted runtime-state row cannot be decoded", { namespace });
  }
}

function schemaColumns(database, table) {
  return new Map(database.prepare(`PRAGMA table_info(${table})`).all().map((column) => [column.name, column]));
}

function assertSchema(database) {
  const recordColumns = schemaColumns(database, RUNTIME_STATE_RECORDS_TABLE);
  const metadataColumns = schemaColumns(database, RUNTIME_STATE_METADATA_TABLE);
  for (const column of ["namespace", "record_key", "payload", "updated_at"]) {
    if (!recordColumns.has(column)) fail("RUNTIME_STATE_SCHEMA_INVALID", "Runtime-state records table has an incompatible shape");
  }
  for (const column of ["id", "version", "initialized_at", "updated_at", "app_state_updated_at", "app_state_fingerprint"]) {
    if (!metadataColumns.has(column)) fail("RUNTIME_STATE_SCHEMA_INVALID", "Runtime-state metadata table has an incompatible shape");
  }
  if (Number(recordColumns.get("namespace")?.pk) !== 1 || Number(recordColumns.get("record_key")?.pk) !== 2) {
    fail("RUNTIME_STATE_SCHEMA_INVALID", "Runtime-state records table must use the expected composite primary key");
  }
  if (Number(metadataColumns.get("id")?.pk) !== 1) {
    fail("RUNTIME_STATE_SCHEMA_INVALID", "Runtime-state metadata table must use the expected primary key");
  }
}

function emptyPlan(operation, kind, canSkipAppState) {
  return {
    version: RUNTIME_STATE_PERSISTENCE_VERSION,
    operation,
    kind,
    canSkipAppState,
    upserts: [],
    deletes: [],
    scannedRecords: 0,
  };
}

function changedKeys(before, after, requestedKeys = null) {
  if (requestedKeys) return [...requestedKeys];
  return [...new Set([...Object.keys(before), ...Object.keys(after)])];
}

function appendNamespaceDiff(plan, namespace, before, after, requestedKeys = null) {
  for (const key of changedKeys(before, after, requestedKeys)) {
    plan.scannedRecords += 1;
    const previous = before[key];
    const next = after[key];
    if (next === undefined) {
      if (previous !== undefined) plan.deletes.push({ namespace, key: validateRecordKey(namespace, key) });
      continue;
    }
    if (previous !== undefined && isDeepStrictEqual(previous, next)) continue;
    plan.upserts.push({ namespace, key, payload: serializeRecord(namespace, key, next) });
  }
}

function presenceEventKeys(events) {
  const keys = new Set();
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.type !== "presence") continue;
    if (typeof event.playerHash !== "string" || !HASH_PATTERN.test(event.playerHash)) {
      fail("RUNTIME_STATE_EVENT_INVALID", "Presence persistence event is missing a valid player hash");
    }
    keys.add(event.playerHash);
  }
  return keys;
}

function explicitDayKeys(days) {
  if (days === null || days === undefined) return null;
  if (!Array.isArray(days) && !(days instanceof Set)) {
    fail("RUNTIME_STATE_DAY_KEYS_INVALID", "Dirty service days must be an array or set");
  }
  const keys = new Set();
  for (const day of days) {
    if (typeof day !== "string" || !DAY_PATTERN.test(day)) {
      fail("RUNTIME_STATE_DAY_KEYS_INVALID", "Dirty service day is invalid");
    }
    keys.add(day);
  }
  return keys;
}

/**
 * Build a durable delta between two already-normalized store snapshots.
 *
 * Presence uses the existing committed runtime-index event as its O(1) dirty
 * key. Analytics intentionally reconciles its bounded visitor/session/day
 * maps because recordAnalyticsBatch may expire several sessions at once.
 */
export function createRuntimeStatePersistencePlan(beforeState, afterState, {
  operation = "runtime.reconcile",
  runtimeIndexEvents = [],
  reconcileAll = false,
  dirtyServiceDays = null,
} = {}) {
  const runtimeOnly = RUNTIME_ONLY_OPERATIONS.has(operation);
  // Every ordinary app_state commit reconciles the projections in the same
  // transaction. That keeps an older-code rollback or retention write from
  // being overlaid by stale side-table rows on the next restart.
  const effectiveReconcileAll = reconcileAll || !runtimeOnly;
  const kind = runtimeOnly && !effectiveReconcileAll ? "incremental" : "reconcile";
  const plan = emptyPlan(operation, kind, runtimeOnly && !effectiveReconcileAll);

  if (effectiveReconcileAll || operation.startsWith("presence.")) {
    const requestedKeys = effectiveReconcileAll ? null : presenceEventKeys(runtimeIndexEvents);
    if (!effectiveReconcileAll && requestedKeys.size === 0) {
      fail("RUNTIME_STATE_EVENT_REQUIRED", "Incremental presence persistence requires its committed dirty key");
    }
    appendNamespaceDiff(
      plan,
      NAMESPACE.player,
      namespaceRecordMap(beforeState, NAMESPACE.player),
      namespaceRecordMap(afterState, NAMESPACE.player),
      requestedKeys,
    );
  }

  if (effectiveReconcileAll || operation === "analytics.record") {
    for (const namespace of [NAMESPACE.analyticsVisitor, NAMESPACE.analyticsSession, NAMESPACE.analyticsDaily]) {
      appendNamespaceDiff(plan, namespace, namespaceRecordMap(beforeState, namespace), namespaceRecordMap(afterState, namespace));
    }
  }

  // Every mutating API request updates the small service-day record. Keeping
  // it in the same SQLite transaction preserves request/player counters.
  appendNamespaceDiff(
    plan,
    NAMESPACE.serviceDaily,
    namespaceRecordMap(beforeState, NAMESPACE.serviceDaily),
    namespaceRecordMap(afterState, NAMESPACE.serviceDaily),
    effectiveReconcileAll ? null : explicitDayKeys(dirtyServiceDays),
  );

  return plan;
}

export function mergeRuntimeStatePersistencePlans(plans, operation = "runtime.batch") {
  const validPlans = Array.isArray(plans) ? plans.filter(Boolean) : [];
  const changes = new Map();
  let scannedRecords = 0;
  for (const plan of validPlans) {
    if (plan.version !== RUNTIME_STATE_PERSISTENCE_VERSION) {
      fail("RUNTIME_STATE_PLAN_INVALID", "Runtime-state persistence plan version is invalid");
    }
    scannedRecords += Number.isSafeInteger(plan.scannedRecords) ? plan.scannedRecords : 0;
    for (const deletion of plan.deletes) changes.set(`${deletion.namespace}\0${deletion.key}`, { type: "delete", ...deletion });
    for (const upsert of plan.upserts) changes.set(`${upsert.namespace}\0${upsert.key}`, { type: "upsert", ...upsert });
  }
  const merged = emptyPlan(
    operation,
    "batch",
    validPlans.length > 0 && validPlans.every((plan) => plan.canSkipAppState === true),
  );
  merged.scannedRecords = scannedRecords;
  for (const change of changes.values()) {
    if (change.type === "delete") merged.deletes.push({ namespace: change.namespace, key: change.key });
    else merged.upserts.push({ namespace: change.namespace, key: change.key, payload: change.payload });
  }
  return merged;
}

function allSeedRecords(state) {
  const records = [];
  for (const namespace of Object.values(NAMESPACE)) {
    for (const [key, value] of Object.entries(namespaceRecordMap(state, namespace))) {
      records.push({ namespace, key, payload: serializeRecord(namespace, key, value) });
    }
  }
  return records;
}

export class SqliteRuntimeStatePersistence {
  constructor(database, {
    nowProvider = Date.now,
    faultInjector = null,
  } = {}) {
    assertDatabase(database);
    this.database = database;
    this.nowProvider = typeof nowProvider === "function" ? nowProvider : Date.now;
    this.faultInjector = typeof faultInjector === "function" ? faultInjector : null;
    this.initialized = false;
    this.counters = {
      initializations: 0,
      seededRecords: 0,
      commits: 0,
      batches: 0,
      upserts: 0,
      deletes: 0,
      failures: 0,
    };
  }

  initialize(seedState = {}, { appStateUpdatedAt = null, appStateFingerprint = null } = {}) {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS ${RUNTIME_STATE_RECORDS_TABLE} (
        namespace TEXT NOT NULL,
        record_key TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (namespace, record_key),
        CHECK (namespace IN ('${NAMESPACE.player}', '${NAMESPACE.serviceDaily}', '${NAMESPACE.analyticsVisitor}', '${NAMESPACE.analyticsSession}', '${NAMESPACE.analyticsDaily}'))
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS ${RUNTIME_STATE_METADATA_TABLE} (
        id INTEGER PRIMARY KEY CHECK (id = ${METADATA_ROW_ID}),
        version INTEGER NOT NULL,
        initialized_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        app_state_updated_at INTEGER NOT NULL,
        app_state_fingerprint TEXT NOT NULL
      );
    `);
    assertSchema(this.database);
    const sourceUpdatedAt = Number.isSafeInteger(appStateUpdatedAt) && appStateUpdatedAt >= 0 ? appStateUpdatedAt : null;
    const sourceFingerprint = typeof appStateFingerprint === "string" && HASH_PATTERN.test(appStateFingerprint)
      ? appStateFingerprint
      : null;
    const metadata = this.database.prepare(`
      SELECT version, app_state_updated_at AS appStateUpdatedAt, app_state_fingerprint AS appStateFingerprint
      FROM ${RUNTIME_STATE_METADATA_TABLE}
      WHERE id = ?
    `).get(METADATA_ROW_ID);
    if (metadata) {
      if (metadata.version !== RUNTIME_STATE_PERSISTENCE_VERSION) {
        fail("RUNTIME_STATE_VERSION_UNSUPPORTED", "Runtime-state persistence version is not supported", { version: metadata.version });
      }
      // If older code rewrote app_state without maintaining this projection,
      // app_state wins on the next startup and atomically reseeds the rows.
      const sourceChanged = sourceUpdatedAt !== null && metadata.appStateUpdatedAt !== sourceUpdatedAt
        || sourceFingerprint !== null && metadata.appStateFingerprint !== sourceFingerprint;
      if (sourceChanged) {
        const records = allSeedRecords(seedState);
        const now = Math.max(0, Math.floor(this.nowProvider()));
        const insertRecord = this.database.prepare(`
          INSERT INTO ${RUNTIME_STATE_RECORDS_TABLE} (namespace, record_key, payload, updated_at)
          VALUES (?, ?, ?, ?)
        `);
        this.database.transaction(() => {
          this.faultInjector?.({ phase: "before-runtime-reseed", operation: "runtime.reseed" });
          this.database.prepare(`DELETE FROM ${RUNTIME_STATE_RECORDS_TABLE}`).run();
          for (const record of records) insertRecord.run(record.namespace, record.key, record.payload, now);
          this.faultInjector?.({ phase: "after-runtime-reseed", operation: "runtime.reseed" });
          this.database.prepare(`
            UPDATE ${RUNTIME_STATE_METADATA_TABLE}
            SET updated_at = ?, app_state_updated_at = ?, app_state_fingerprint = ?
            WHERE id = ?
          `).run(now, sourceUpdatedAt ?? metadata.appStateUpdatedAt, sourceFingerprint ?? metadata.appStateFingerprint, METADATA_ROW_ID);
        })();
        this.initialized = true;
        this.counters.initializations += 1;
        this.counters.seededRecords += records.length;
        return { initialized: false, reseeded: true, seededRecords: records.length, version: metadata.version };
      }
      this.initialized = true;
      return { initialized: false, seededRecords: 0, version: metadata.version };
    }

    const records = allSeedRecords(seedState);
    const now = Math.max(0, Math.floor(this.nowProvider()));
    const insertRecord = this.database.prepare(`
      INSERT INTO ${RUNTIME_STATE_RECORDS_TABLE} (namespace, record_key, payload, updated_at)
      VALUES (?, ?, ?, ?)
    `);
    const initialize = this.database.transaction(() => {
      this.faultInjector?.({ phase: "before-runtime-initialize", operation: "runtime.initialize" });
      this.database.prepare(`DELETE FROM ${RUNTIME_STATE_RECORDS_TABLE}`).run();
      for (const record of records) insertRecord.run(record.namespace, record.key, record.payload, now);
      this.faultInjector?.({ phase: "after-runtime-seed", operation: "runtime.initialize" });
      this.database.prepare(`
        INSERT INTO ${RUNTIME_STATE_METADATA_TABLE} (id, version, initialized_at, updated_at, app_state_updated_at, app_state_fingerprint)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(METADATA_ROW_ID, RUNTIME_STATE_PERSISTENCE_VERSION, now, now, sourceUpdatedAt ?? 0, sourceFingerprint ?? "0".repeat(64));
    });
    initialize();
    this.initialized = true;
    this.counters.initializations += 1;
    this.counters.seededRecords += records.length;
    return { initialized: true, seededRecords: records.length, version: RUNTIME_STATE_PERSISTENCE_VERSION };
  }

  readRuntimeState() {
    this.#requireInitialized();
    const result = {
      players: {},
      dailyMetrics: {},
      analytics: { visitors: {}, sessions: {}, daily: {} },
    };
    const destinations = {
      [NAMESPACE.player]: result.players,
      [NAMESPACE.serviceDaily]: result.dailyMetrics,
      [NAMESPACE.analyticsVisitor]: result.analytics.visitors,
      [NAMESPACE.analyticsSession]: result.analytics.sessions,
      [NAMESPACE.analyticsDaily]: result.analytics.daily,
    };
    const rows = this.database.prepare(`
      SELECT namespace, record_key AS recordKey, payload
      FROM ${RUNTIME_STATE_RECORDS_TABLE}
      ORDER BY namespace, record_key
    `).all();
    for (const row of rows) {
      const destination = destinations[row.namespace];
      if (!destination) fail("RUNTIME_STATE_NAMESPACE_INVALID", "Persisted runtime-state namespace is invalid");
      destination[row.recordKey] = parseRecord(row.namespace, row.recordKey, row.payload);
    }
    return result;
  }

  hydrateState(baseState) {
    const runtime = this.readRuntimeState();
    return {
      ...ownRecord(baseState),
      players: runtime.players,
      dailyMetrics: runtime.dailyMetrics,
      analytics: runtime.analytics,
    };
  }

  applyPlanInTransaction(plan, context = {}) {
    this.#requireInitialized();
    if (this.database.inTransaction !== true) {
      fail("RUNTIME_STATE_TRANSACTION_REQUIRED", "Runtime-state delta requires a caller-owned SQLite transaction");
    }
    if (!plan || plan.version !== RUNTIME_STATE_PERSISTENCE_VERSION || !Array.isArray(plan.upserts) || !Array.isArray(plan.deletes)) {
      fail("RUNTIME_STATE_PLAN_INVALID", "Runtime-state persistence plan is invalid");
    }
    const operation = typeof context.operation === "string" ? context.operation : plan.operation;
    const now = Math.max(0, Math.floor(this.nowProvider()));
    const deleteRecord = this.database.prepare(`DELETE FROM ${RUNTIME_STATE_RECORDS_TABLE} WHERE namespace = ? AND record_key = ?`);
    const upsertRecord = this.database.prepare(`
      INSERT INTO ${RUNTIME_STATE_RECORDS_TABLE} (namespace, record_key, payload, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(namespace, record_key) DO UPDATE SET
        payload = excluded.payload,
        updated_at = excluded.updated_at
      WHERE payload <> excluded.payload
    `);
    let deleted = 0;
    let upserted = 0;
    this.faultInjector?.({ phase: "before-runtime-delta", operation });
    for (const record of plan.deletes) {
      validateRecordKey(record.namespace, record.key);
      deleted += deleteRecord.run(record.namespace, record.key).changes;
    }
    this.faultInjector?.({ phase: "after-runtime-deletes", operation });
    for (const record of plan.upserts) {
      // Decode as well as bound-check caller-provided plans before writing.
      parseRecord(record.namespace, record.key, record.payload);
      upserted += upsertRecord.run(record.namespace, record.key, record.payload, now).changes;
    }
    this.faultInjector?.({ phase: "after-runtime-upserts", operation });
    let synchronizedAppStateAt = Number.isSafeInteger(context.appStateUpdatedAt) && context.appStateUpdatedAt >= 0
      ? context.appStateUpdatedAt
      : null;
    let synchronizedFingerprint = typeof context.appStateFingerprint === "string" && HASH_PATTERN.test(context.appStateFingerprint)
      ? context.appStateFingerprint
      : null;
    if (context.synchronizeAppState === true) {
      const appState = this.database.prepare("SELECT payload, updated_at AS updatedAt FROM app_state WHERE id = 1").get();
      if (typeof appState?.payload !== "string" || !Number.isSafeInteger(appState.updatedAt) || appState.updatedAt < 0) {
        fail("RUNTIME_STATE_APP_STATE_INVALID", "Cannot synchronize runtime projection without a valid app_state row");
      }
      synchronizedAppStateAt = appState.updatedAt;
      synchronizedFingerprint = runtimeAppStateFingerprint(appState.payload);
    }
    if (synchronizedAppStateAt === null && synchronizedFingerprint === null) {
      this.database.prepare(`UPDATE ${RUNTIME_STATE_METADATA_TABLE} SET updated_at = ? WHERE id = ?`).run(now, METADATA_ROW_ID);
    } else {
      this.database.prepare(`
        UPDATE ${RUNTIME_STATE_METADATA_TABLE}
        SET updated_at = ?,
            app_state_updated_at = coalesce(?, app_state_updated_at),
            app_state_fingerprint = coalesce(?, app_state_fingerprint)
        WHERE id = ?
      `).run(now, synchronizedAppStateAt, synchronizedFingerprint, METADATA_ROW_ID);
    }
    this.faultInjector?.({ phase: "after-runtime-metadata", operation });
    return { upserted, deleted };
  }

  commitPlan(plan, context = {}) {
    this.#requireInitialized();
    if (plan?.canSkipAppState !== true) {
      fail(
        "RUNTIME_STATE_APP_STATE_REQUIRED",
        "A reconciled runtime-state plan must share the caller's app_state transaction",
      );
    }
    try {
      const result = this.database.transaction(() => this.applyPlanInTransaction(plan, context))();
      this.observeCommitted(plan, result);
      return result;
    } catch (error) {
      this.counters.failures += 1;
      throw error;
    }
  }

  commitPlans(plans, context = {}) {
    const merged = mergeRuntimeStatePersistencePlans(plans, context.operation ?? "runtime.batch");
    const result = this.commitPlan(merged, context);
    this.counters.batches += 1;
    return { ...result, mergedPlan: merged };
  }

  observeCommitted(plan, result) {
    this.counters.commits += 1;
    this.counters.upserts += Number(result?.upserted ?? 0);
    this.counters.deletes += Number(result?.deleted ?? 0);
    return { ...this.counters, operation: plan?.operation ?? null };
  }

  diagnostics({ includeRowCounts = false } = {}) {
    const result = { version: RUNTIME_STATE_PERSISTENCE_VERSION, initialized: this.initialized, ...this.counters };
    if (!includeRowCounts || !this.initialized) return result;
    result.rows = Object.fromEntries(this.database.prepare(`
      SELECT namespace, count(*) AS count
      FROM ${RUNTIME_STATE_RECORDS_TABLE}
      GROUP BY namespace
      ORDER BY namespace
    `).all().map((row) => [row.namespace, row.count]));
    return result;
  }

  #requireInitialized() {
    if (!this.initialized) fail("RUNTIME_STATE_NOT_INITIALIZED", "Runtime-state persistence must be initialized before use");
  }
}

export const RUNTIME_STATE_NAMESPACES = NAMESPACE;
