import {
  LOCAL_SAVE_BROADCAST_CHANNEL,
  LOCAL_SAVE_CONFLICT_KEY_PREFIX,
  LOCAL_SAVE_COORDINATION_PREFIX,
  LOCAL_SAVE_HEARTBEAT_INTERVAL_MS,
  LOCAL_SAVE_LEASE_DURATION_MS,
  LOCAL_SAVE_REVISION_KEY_PREFIX,
  LOCAL_SAVE_STORAGE_EVENT_KEY,
  LOCAL_SAVE_WRITER_LEASE_KEY,
  LOCAL_SAVE_WRITER_LOCK,
  LocalSaveConflictError,
  LocalSaveReadOnlyError,
  canClaimLocalSaveWriterLease,
  createLocalSaveConflictId,
  createLocalSaveRevision,
  createLocalSaveWriterId,
  createLocalSaveWriterLease,
  inspectLocalSaveIdentity,
  localSaveConflictKeys,
  localSaveConflictMetadataKey,
  localSaveRevisionKey,
  parseLocalSaveConflictRecord,
  parseLocalSaveRevision,
  parseLocalSaveWriterLease,
  type LocalSaveBroadcastMessage,
  type LocalSaveConflictRecord,
  type LocalSaveRevision,
  type LocalSaveWriterLease,
  type LocalSaveWriterStatus,
} from "./localSaveCoordination";

const DATABASE_NAME = "dsp-idle-network.local-saves";
const DATABASE_VERSION = 2;
const RECORD_STORE = "records";
const SAVE_KEY = "dsp-idle-network.save.v1";
const SLOT_KEY_PREFIX = "dsp-idle-network.slot.";
const IMPORT_CACHE_KEY_PREFIX = `${SAVE_KEY}.import-cache.`;
export const LOCAL_AUTOMATIC_SNAPSHOT_LIMIT = 2;
const MANAGED_SNAPSHOT_WARNING_COUNT = 8;
const MANAGED_SNAPSHOT_WARNING_BYTES = 64 * 1024 * 1024;

export type LocalSaveMode = "normal" | "speedrun";
export type LocalSaveStorageCategory =
  | "primary"
  | "backup"
  | "slot"
  | "automatic-snapshot"
  | "manual-snapshot"
  | "protected"
  | "import-cache";
export type LocalSavePersistenceStatus = "granted" | "not-granted" | "denied" | "unsupported";
export type LocalSaveStoragePressure = "normal" | "high" | "critical" | "unknown";

interface StoredSaveSummary {
  schemaVersion: 1;
  mode: LocalSaveMode;
  category: LocalSaveStorageCategory;
  savedAt: number;
  slot: "main" | 1 | 2 | 3 | null;
  reason: string | null;
  automatic: boolean;
  protected: boolean;
  checksum: string | null;
}

interface StoredSaveRecord {
  key: string;
  value: string;
  updatedAt: number;
  bytes: number;
  summary?: StoredSaveSummary;
}

export type LocalSaveBackend = "indexeddb" | "local-storage" | "memory";

export interface LocalSaveStorageEntry {
  key: string;
  label: string;
  bytes: number;
  updatedAt: number;
  savedAt: number;
  mode: LocalSaveMode;
  category: LocalSaveStorageCategory;
  slot: "main" | 1 | 2 | 3 | null;
  source: string;
  reason: string | null;
  automatic: boolean;
  protected: boolean;
}

export interface LocalSaveModeStorageUsage {
  mode: LocalSaveMode;
  totalBytes: number;
  primaryBytes: number;
  backupBytes: number;
  slotBytes: number;
  automaticSnapshotBytes: number;
  manualSnapshotBytes: number;
  protectedBytes: number;
  importCacheBytes: number;
  slotCount: number;
  automaticSnapshotCount: number;
  manualSnapshotCount: number;
  protectedCount: number;
  importCacheCount: number;
}

export interface LocalSaveRecoveryPrompt {
  mode: LocalSaveMode;
  key: string;
  occurredAt: number;
  preservedChecksummedMain: boolean;
  message: string;
}

export interface LocalSaveStorageEstimate {
  backend: LocalSaveBackend;
  payloadBytes: number;
  browserUsageBytes: number | null;
  browserQuotaBytes: number | null;
  persistenceStatus: LocalSavePersistenceStatus;
  persistenceRequestSupported: boolean;
  pressure: LocalSaveStoragePressure;
  modes: LocalSaveModeStorageUsage[];
  warnings: string[];
  recoveryPrompt: LocalSaveRecoveryPrompt | null;
  entries: LocalSaveStorageEntry[];
}

export interface LocalSaveConflictSummary {
  conflictId: string;
  saveKey: string;
  createdAt: number;
  candidate: { available: boolean; deleted: boolean; savedAt: number; checksum: string | null };
  persisted: { available: boolean; missing: boolean; savedAt: number; checksum: string | null };
}

const cache = new Map<string, string>();
const revisionCache = new Map<string, number>();
const storageEntryCache = new Map<string, LocalSaveStorageEntry & { checksum: string | null }>();
let backend: LocalSaveBackend = "memory";
let database: IDBDatabase | null = null;
let initialization: Promise<void> | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let pendingWriteError: unknown = null;
let startupConflictId: string | null = null;
let startupConflictCreatedAt = -1;
const writerId = createLocalSaveWriterId();
let writerStatus: LocalSaveWriterStatus = {
  role: "initializing",
  writerId,
  fencingToken: 0,
  leaseExpiresAt: 0,
  reason: "正在确认本地存档主标签页",
};
let writerHeartbeat: number | null = null;
let broadcastChannel: BroadcastChannel | null = null;
const writerStatusListeners = new Set<(status: LocalSaveWriterStatus) => void>();
const saveChangeListeners = new Set<(message: LocalSaveBroadcastMessage) => void>();
const storageStatusListeners = new Set<() => void>();
let recoveryPrompt: LocalSaveRecoveryPrompt | null = null;
let lastPersistenceStatus: LocalSavePersistenceStatus | null = null;

function ensureSynchronousFallback(): void {
  if (initialization || backend !== "memory" || typeof window === "undefined") return;
  initializeFallback();
}

function isSaveKey(key: string): boolean {
  return key === SAVE_KEY || key === `${SAVE_KEY}.backup` || key === `${SAVE_KEY}.backup.speedrun` ||
    key.startsWith(`${SAVE_KEY}.migration-backup.`) ||
    key.startsWith(`${SAVE_KEY}.normal`) || key.startsWith(`${SAVE_KEY}.speedrun`) ||
    key.startsWith(`${SAVE_KEY}.snapshot.`) || key.startsWith(IMPORT_CACHE_KEY_PREFIX) ||
    key.startsWith(LOCAL_SAVE_CONFLICT_KEY_PREFIX) || key.startsWith(SLOT_KEY_PREFIX);
}

function byteLength(value: string): number {
  try {
    return new TextEncoder().encode(value).byteLength;
  } catch {
    return value.length;
  }
}

function savedAt(value: string): number {
  return inspectLocalSaveIdentity(value).savedAt;
}

function modeFromKey(key: string, valuePrefix = ""): LocalSaveMode {
  if (key === `${SAVE_KEY}.speedrun` || key === `${SAVE_KEY}.backup.speedrun` ||
    key.startsWith(`${SAVE_KEY}.speedrun.`) || key.startsWith(`${SAVE_KEY}.snapshot.speedrun.`) ||
    key.startsWith(`${SLOT_KEY_PREFIX}speedrun.`) || key.startsWith(`${IMPORT_CACHE_KEY_PREFIX}speedrun.`)) return "speedrun";
  // Save keys own mode isolation. Only conflict copies lack a mode namespace,
  // so their already-preserved payload header is used for display grouping.
  return key.startsWith(LOCAL_SAVE_CONFLICT_KEY_PREFIX) && /"mode"\s*:\s*"speedrun"/.test(valuePrefix) ? "speedrun" : "normal";
}

function snapshotReasonFromPrefix(valuePrefix: string): string | null {
  const match = /"reason"\s*:\s*("(?:[^"\\]|\\.)*")/.exec(valuePrefix);
  if (!match) return null;
  try {
    const decoded = JSON.parse(match[1]) as unknown;
    return typeof decoded === "string" && decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

function isProtectedSnapshotReason(reason: string | null): boolean {
  if (!reason) return false;
  return /(?:前|迁移|恢复|回滚|救援|扩容|云存档|外部存档|新工厂|槽位)/u.test(reason) && reason !== "手动快照";
}

function slotFromKey(key: string): "main" | 1 | 2 | 3 | null {
  if (key === SAVE_KEY || key.startsWith(`${SAVE_KEY}.normal`) || key.startsWith(`${SAVE_KEY}.speedrun`)) return "main";
  const slotMatch = /^dsp-idle-network\.slot\.(?:speedrun\.)?([123])$/.exec(key);
  return slotMatch ? Number(slotMatch[1]) as 1 | 2 | 3 : null;
}

function classifySaveRecord(key: string, value: string): StoredSaveSummary {
  const prefix = value.slice(0, Math.min(value.length, 4_096));
  const mode = modeFromKey(key, prefix);
  const snapshot = key.includes(".snapshot.");
  const reason = snapshot ? snapshotReasonFromPrefix(prefix) : null;
  const recognizableSnapshot = /"kind"\s*:\s*"snapshot"/.test(prefix);
  const automatic = snapshot && reason === "自动快照";
  const protectedSnapshot = snapshot && !automatic && (reason === null || !recognizableSnapshot || isProtectedSnapshotReason(reason));
  let category: LocalSaveStorageCategory;
  if (key.startsWith(IMPORT_CACHE_KEY_PREFIX)) category = "import-cache";
  else if (key.startsWith(`${SAVE_KEY}.migration-backup.`) || key.startsWith(LOCAL_SAVE_CONFLICT_KEY_PREFIX) || protectedSnapshot) category = "protected";
  else if (key === `${SAVE_KEY}.backup` || key === `${SAVE_KEY}.backup.speedrun`) category = "backup";
  else if (key.startsWith(SLOT_KEY_PREFIX)) category = "slot";
  else if (key.includes(".snapshot.")) category = automatic ? "automatic-snapshot" : "manual-snapshot";
  else category = "primary";
  const identity = inspectLocalSaveIdentity(value);
  return {
    schemaVersion: 1,
    mode,
    category,
    savedAt: identity.savedAt,
    slot: slotFromKey(key),
    reason,
    automatic,
    protected: category === "protected",
    checksum: identity.checksum,
  };
}

function validStoredSummary(value: unknown): value is StoredSaveSummary {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredSaveSummary>;
  return candidate.schemaVersion === 1 && (candidate.mode === "normal" || candidate.mode === "speedrun") &&
    ["primary", "backup", "slot", "automatic-snapshot", "manual-snapshot", "protected", "import-cache"].includes(candidate.category ?? "") &&
    typeof candidate.savedAt === "number" && Number.isFinite(candidate.savedAt) &&
    (candidate.slot === null || candidate.slot === "main" || candidate.slot === 1 || candidate.slot === 2 || candidate.slot === 3) &&
    (candidate.reason === null || typeof candidate.reason === "string") && typeof candidate.automatic === "boolean" &&
    typeof candidate.protected === "boolean" && (candidate.checksum === null || typeof candidate.checksum === "string");
}

function entrySource(summary: StoredSaveSummary): string {
  if (summary.category === "primary") return "主存档";
  if (summary.category === "backup") return "上一版本备份";
  if (summary.category === "slot") return `手动槽位 ${summary.slot ?? "--"}`;
  if (summary.category === "automatic-snapshot") return "自动快照";
  if (summary.category === "manual-snapshot") return "手动快照";
  if (summary.category === "import-cache") return "导入缓存";
  return "保护副本";
}

function updateStorageEntry(record: StoredSaveRecord): void {
  if (!isSaveKey(record.key) || record.key.endsWith(".snapshot.sequence") || record.key.endsWith(".snapshot.speedrun.sequence")) return;
  const identity = inspectLocalSaveIdentity(record.value);
  const derived = classifySaveRecord(record.key, record.value);
  const summary = validStoredSummary(record.summary) && record.summary.savedAt === identity.savedAt && record.summary.checksum === identity.checksum &&
    record.summary.mode === derived.mode && record.summary.category === derived.category && record.summary.slot === derived.slot &&
    record.summary.reason === derived.reason && record.summary.automatic === derived.automatic && record.summary.protected === derived.protected
    ? record.summary
    : derived;
  storageEntryCache.set(record.key, {
    key: record.key,
    label: entryLabel(record.key, summary),
    bytes: Number.isFinite(record.bytes) && record.bytes >= 0 ? record.bytes : byteLength(record.value),
    updatedAt: Number.isFinite(record.updatedAt) ? record.updatedAt : summary.savedAt,
    savedAt: summary.savedAt,
    mode: summary.mode,
    category: summary.category,
    slot: summary.slot,
    source: entrySource(summary),
    reason: summary.reason,
    automatic: summary.automatic,
    protected: summary.protected,
    checksum: summary.checksum,
  });
}

function notifyStorageStatus(): void {
  storageStatusListeners.forEach((listener) => listener());
}

function removeStorageEntry(key: string): void {
  if (storageEntryCache.delete(key)) notifyStorageStatus();
}

function putCacheValue(key: string, value: string, now = Date.now()): void {
  cache.set(key, value);
  updateStorageEntry({ key, value, updatedAt: now, bytes: byteLength(value), summary: classifySaveRecord(key, value) });
  notifyStorageStatus();
}

function isQuotaExceededError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; code?: unknown };
  return candidate.name === "QuotaExceededError" || candidate.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    candidate.code === 22 || candidate.code === 1014;
}

function primaryKeyForMode(mode: LocalSaveMode): string {
  return mode === "speedrun" ? `${SAVE_KEY}.speedrun` : SAVE_KEY;
}

function recordQuotaRecoveryPrompt(key: string): void {
  const mode = modeFromKey(key, cache.get(key)?.slice(0, 4_096) ?? "");
  const main = storageEntryCache.get(primaryKeyForMode(mode));
  const preservedChecksummedMain = Boolean(main?.checksum && main.category === "primary");
  recoveryPrompt = {
    mode,
    key,
    occurredAt: Date.now(),
    preservedChecksummedMain,
    message: preservedChecksummedMain
      ? `空间不足，本次${entrySource(classifySaveRecord(key, cache.get(key) ?? ""))}未写入；上一次带校验值的${mode === "speedrun" ? "速通" : "普通"}主存档仍原样保留。请管理快照或立即导出当前进度。`
      : `空间不足且未确认到可校验的${mode === "speedrun" ? "速通" : "普通"}主存档。请不要关闭页面，立即导出当前进度。`,
  };
  notifyStorageStatus();
}

function clearRecoveredQuotaPrompt(key: string): void {
  if (!recoveryPrompt || key !== primaryKeyForMode(recoveryPrompt.mode)) return;
  recoveryPrompt = null;
  notifyStorageStatus();
}

function automaticSnapshotOverflow(mode: LocalSaveMode): Array<LocalSaveStorageEntry & { checksum: string | null }> {
  return [...storageEntryCache.values()]
    .filter((entry) => entry.mode === mode && entry.category === "automatic-snapshot")
    .sort((left, right) => right.savedAt - left.savedAt || right.key.localeCompare(left.key))
    .slice(LOCAL_AUTOMATIC_SNAPSHOT_LIMIT);
}

function enforceAutomaticSnapshotLimit(mode: LocalSaveMode): void {
  for (const entry of automaticSnapshotOverflow(mode)) {
    try {
      removeLocalSaveValue(entry.key);
    } catch {
      // The new recovery point is already committed. Cleanup remains best
      // effort and is retried by the existing storage-layer snapshot trim.
    }
  }
}

function restoreCachedValueAfterFailedCommit(key: string, baseValue: string | null, expectedRevision: number): void {
  revisionCache.set(key, expectedRevision);
  if (baseValue === null) {
    cache.delete(key);
    removeStorageEntry(key);
    return;
  }
  cache.set(key, baseValue);
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const next = request.result;
      if (!next.objectStoreNames.contains(RECORD_STORE)) next.createObjectStore(RECORD_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        if (database === request.result) database = null;
        publishWriterStatus({ role: "unavailable", writerId, fencingToken: writerStatus.fencingToken, leaseExpiresAt: 0, reason: "另一个页面已升级本地存储，请刷新本页后继续" });
      };
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error("IndexedDB unavailable"));
    request.onblocked = () => reject(new Error("IndexedDB upgrade blocked"));
  });
}

async function readAllStoredRecords(db: IDBDatabase): Promise<StoredSaveRecord[]> {
  const transaction = db.transaction(RECORD_STORE, "readonly");
  const done = transactionDone(transaction);
  const records = await requestResult(transaction.objectStore(RECORD_STORE).getAll() as IDBRequest<StoredSaveRecord[]>);
  await done;
  return records.filter((record) => record && typeof record.key === "string" && typeof record.value === "string");
}

async function readRecord(db: IDBDatabase, key: string): Promise<StoredSaveRecord | undefined> {
  const transaction = db.transaction(RECORD_STORE, "readonly");
  const done = transactionDone(transaction);
  const record = await requestResult(transaction.objectStore(RECORD_STORE).get(key) as IDBRequest<StoredSaveRecord | undefined>);
  await done;
  return record;
}

async function readCoordinationValue(db: IDBDatabase, key: string): Promise<string | null> {
  return (await readRecord(db, key))?.value ?? null;
}

function putStoredValue(store: IDBObjectStore, key: string, value: string, now = Date.now()): void {
  store.put({ key, value, updatedAt: now, bytes: byteLength(value), ...(isSaveKey(key) ? { summary: classifySaveRecord(key, value) } : {}) } satisfies StoredSaveRecord);
}

async function writeRecord(db: IDBDatabase, key: string, value: string): Promise<void> {
  const transaction = db.transaction(RECORD_STORE, "readwrite");
  const done = transactionDone(transaction);
  const now = Date.now();
  transaction.objectStore(RECORD_STORE).put({ key, value, updatedAt: now, bytes: byteLength(value), ...(isSaveKey(key) ? { summary: classifySaveRecord(key, value) } : {}) } satisfies StoredSaveRecord);
  await done;
  const stored = await readRecord(db, key);
  if (!stored || stored.value !== value) throw new DOMException("IndexedDB read-back verification failed", "DataError");
  updateStorageEntry(stored);
  notifyStorageStatus();
}

function publishWriterStatus(next: LocalSaveWriterStatus): void {
  const changed = writerStatus.role !== next.role || writerStatus.fencingToken !== next.fencingToken ||
    writerStatus.leaseExpiresAt !== next.leaseExpiresAt || writerStatus.reason !== next.reason ||
    writerStatus.conflictId !== next.conflictId;
  writerStatus = next;
  if (changed) writerStatusListeners.forEach((listener) => listener({ ...writerStatus }));
}

function postCoordinationMessage(message: LocalSaveBroadcastMessage): void {
  try { broadcastChannel?.postMessage(message); } catch { /* storage-event fallback below */ }
  try {
    window.localStorage.setItem(LOCAL_SAVE_STORAGE_EVENT_KEY, JSON.stringify({ ...message, nonce: Math.random() }));
    window.localStorage.removeItem(LOCAL_SAVE_STORAGE_EVENT_KEY);
  } catch {
    // Broadcast and storage events are accelerators; durable revisions remain authoritative.
  }
}

async function withBrowserCoordinationLock<T>(operation: () => Promise<T>): Promise<{ acquired: boolean; value?: T }> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) return { acquired: true, value: await operation() };
  try {
    return await locks.request(LOCAL_SAVE_WRITER_LOCK, { mode: "exclusive", ifAvailable: true }, async (lock) =>
      lock ? { acquired: true, value: await operation() } : { acquired: false });
  } catch {
    // IndexedDB's readwrite transaction remains the fallback serialization.
    return { acquired: true, value: await operation() };
  }
}

async function writeLease(db: IDBDatabase, lease: LocalSaveWriterLease): Promise<void> {
  const transaction = db.transaction(RECORD_STORE, "readwrite");
  const done = transactionDone(transaction);
  const store = transaction.objectStore(RECORD_STORE);
  const current = parseLocalSaveWriterLease((await requestResult(store.get(LOCAL_SAVE_WRITER_LEASE_KEY) as IDBRequest<StoredSaveRecord | undefined>))?.value);
  if (current && current.ownerId !== writerId && current.expiresAt > lease.heartbeatAt) {
    transaction.abort();
    void done.catch(() => undefined);
    throw new LocalSaveReadOnlyError();
  }
  putStoredValue(store, LOCAL_SAVE_WRITER_LEASE_KEY, JSON.stringify(lease), lease.heartbeatAt);
  await done;
}

async function claimWriterLease(): Promise<boolean> {
  const now = Date.now();
  if (backend !== "indexeddb" || !database) {
    publishWriterStatus({ role: "primary", writerId, fencingToken: 1, leaseExpiresAt: Number.MAX_SAFE_INTEGER, reason: "当前环境使用兼容存储后端" });
    return true;
  }
  const attempt = await withBrowserCoordinationLock(async () => {
    const previous = parseLocalSaveWriterLease(await readCoordinationValue(database!, LOCAL_SAVE_WRITER_LEASE_KEY));
    if (!canClaimLocalSaveWriterLease(previous, writerId, now)) return { ok: false as const, previous };
    const lease = createLocalSaveWriterLease(writerId, previous, now);
    await writeLease(database!, lease);
    return { ok: true as const, previous, lease };
  });
  if (!attempt.acquired) {
    publishWriterStatus({
      role: "secondary",
      writerId,
      fencingToken: writerStatus.fencingToken,
      leaseExpiresAt: now + Math.min(1_000, LOCAL_SAVE_HEARTBEAT_INTERVAL_MS),
      reason: "另一个标签页正在更新本地存档，当前页面暂为只读",
    });
    return false;
  }
  if (!attempt.value?.ok) {
    const previous = attempt.value?.previous ?? parseLocalSaveWriterLease(await readCoordinationValue(database, LOCAL_SAVE_WRITER_LEASE_KEY));
    const current = parseLocalSaveWriterLease(await readCoordinationValue(database, LOCAL_SAVE_WRITER_LEASE_KEY));
    publishWriterStatus({
      role: "secondary",
      writerId,
      fencingToken: current?.fencingToken ?? previous?.fencingToken ?? 0,
      leaseExpiresAt: current?.expiresAt ?? previous?.expiresAt ?? 0,
      reason: "另一个标签页已取得本地存档写入权，当前页面为只读",
    });
    return false;
  }
  const lease = attempt.value.lease;
  await reloadLocalSaveCache();
  publishWriterStatus({ role: "primary", writerId, fencingToken: lease.fencingToken, leaseExpiresAt: lease.expiresAt, reason: "当前标签页负责本地存档" });
  postCoordinationMessage({ schemaVersion: 1, type: "lease", writerId, sentAt: now, fencingToken: lease.fencingToken, leaseExpiresAt: lease.expiresAt });
  return true;
}

async function releaseWriterLeaseForReload(): Promise<void> {
  if (backend !== "indexeddb" || !database) {
    publishWriterStatus({ ...writerStatus, role: "initializing", reason: "正在重新载入最新持久存档" });
    return;
  }
  const now = Date.now();
  const transaction = database.transaction(RECORD_STORE, "readwrite");
  const done = transactionDone(transaction);
  const store = transaction.objectStore(RECORD_STORE);
  const current = parseLocalSaveWriterLease((await requestResult(store.get(LOCAL_SAVE_WRITER_LEASE_KEY) as IDBRequest<StoredSaveRecord | undefined>))?.value);
  if (current?.ownerId === writerId && current.fencingToken === writerStatus.fencingToken) {
    putStoredValue(store, LOCAL_SAVE_WRITER_LEASE_KEY, JSON.stringify({ ...current, heartbeatAt: now, expiresAt: now }), now);
    await done;
  } else {
    transaction.abort();
    void done.catch(() => undefined);
  }
  publishWriterStatus({ ...writerStatus, role: "initializing", leaseExpiresAt: now, reason: "正在重新载入最新持久存档" });
}

async function renewWriterLease(): Promise<void> {
  if (writerStatus.role !== "primary" || backend !== "indexeddb" || !database) return;
  const now = Date.now();
  const renewed = await withBrowserCoordinationLock(async () => {
    const transaction = database!.transaction(RECORD_STORE, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(RECORD_STORE);
    const current = parseLocalSaveWriterLease((await requestResult(store.get(LOCAL_SAVE_WRITER_LEASE_KEY) as IDBRequest<StoredSaveRecord | undefined>))?.value);
    if (!current || current.ownerId !== writerId || current.fencingToken !== writerStatus.fencingToken) {
      transaction.abort();
      void done.catch(() => undefined);
      return { ok: false as const, current };
    }
    const next = { ...current, heartbeatAt: now, expiresAt: now + LOCAL_SAVE_LEASE_DURATION_MS } satisfies LocalSaveWriterLease;
    putStoredValue(store, LOCAL_SAVE_WRITER_LEASE_KEY, JSON.stringify(next), now);
    await done;
    return { ok: true as const, current: next };
  });
  if (!renewed.acquired) return;
  if (!renewed.value?.ok) {
    const current = renewed.value?.current;
    publishWriterStatus({ role: "secondary", writerId, fencingToken: current?.fencingToken ?? writerStatus.fencingToken, leaseExpiresAt: current?.expiresAt ?? 0, reason: "本地存档写入权已由另一个标签页接管" });
    return;
  }
  publishWriterStatus({ ...writerStatus, leaseExpiresAt: renewed.value.current.expiresAt });
}

function preserveWriteConflict(
  store: IDBObjectStore,
  key: string,
  candidate: string | null,
  persisted: string | null,
  fencingToken: number,
  now: number,
): string {
  const conflictId = createLocalSaveConflictId(now, writerId);
  const keys = localSaveConflictKeys(conflictId);
  if (candidate !== null) putStoredValue(store, keys.candidate, candidate, now);
  if (persisted !== null) putStoredValue(store, keys.persisted, persisted, now);
  const metadata = {
    schemaVersion: 1,
    conflictId,
    saveKey: key,
    candidateKey: keys.candidate,
    persistedKey: keys.persisted,
    candidateDeleted: candidate === null,
    persistedMissing: persisted === null,
    writerId,
    fencingToken,
    createdAt: now,
  } satisfies LocalSaveConflictRecord;
  putStoredValue(store, localSaveConflictMetadataKey(conflictId), JSON.stringify(metadata), now);
  return conflictId;
}

async function commitCoordinatedRecord(
  db: IDBDatabase,
  key: string,
  value: string | null,
  baseValue: string | null,
  expectedRevision: number,
): Promise<LocalSaveRevision> {
  if (writerStatus.role !== "primary") throw new LocalSaveReadOnlyError(writerStatus.reason);
  const now = Date.now();
  const transaction = db.transaction(RECORD_STORE, "readwrite");
  const done = transactionDone(transaction);
  const store = transaction.objectStore(RECORD_STORE);
  const leaseRecord = await requestResult(store.get(LOCAL_SAVE_WRITER_LEASE_KEY) as IDBRequest<StoredSaveRecord | undefined>);
  const lease = parseLocalSaveWriterLease(leaseRecord?.value);
  const revisionRecord = await requestResult(store.get(localSaveRevisionKey(key)) as IDBRequest<StoredSaveRecord | undefined>);
  const revision = parseLocalSaveRevision(revisionRecord?.value);
  const currentRecord = await requestResult(store.get(key) as IDBRequest<StoredSaveRecord | undefined>);
  const persisted = currentRecord?.value ?? null;
  const baseIdentity = inspectLocalSaveIdentity(baseValue);
  const revisionMatches = (revision?.revision ?? 0) === expectedRevision &&
    (!revision || revision.saveKey === key && revision.deleted === (baseValue === null) &&
      revision.savedAt === baseIdentity.savedAt && revision.checksum === baseIdentity.checksum);
  const leaseMatches = lease?.ownerId === writerId && lease.fencingToken === writerStatus.fencingToken && lease.expiresAt > now;
  const legacyBaseMatches = !revision && expectedRevision === 0 && persisted === baseValue;
  const persistedMatches = persisted === baseValue;
  if (!leaseMatches || !persistedMatches || !(revisionMatches && (revision !== null || legacyBaseMatches))) {
    const conflictId = preserveWriteConflict(store, key, value, persisted, writerStatus.fencingToken, now);
    await done;
    cache.delete(key);
    removeStorageEntry(key);
    if (persisted !== null) putCacheValue(key, persisted, currentRecord?.updatedAt ?? now);
    revisionCache.set(key, revision?.revision ?? 0);
    publishWriterStatus({
      role: "conflict",
      writerId,
      fencingToken: lease?.fencingToken ?? writerStatus.fencingToken,
      leaseExpiresAt: lease?.expiresAt ?? 0,
      reason: "检测到另一个标签页已更新存档，已停止覆盖并保留双方版本",
      conflictId,
    });
    postCoordinationMessage({ schemaVersion: 1, type: "conflict", writerId, sentAt: now, key, conflictId, fencingToken: lease?.fencingToken });
    throw new LocalSaveConflictError(conflictId);
  }
  const nextRevision = createLocalSaveRevision({
    saveKey: key,
    previousRevision: expectedRevision,
    value,
    writerId,
    fencingToken: lease!.fencingToken,
    now,
  });
  if (value === null) store.delete(key);
  else putStoredValue(store, key, value, now);
  putStoredValue(store, localSaveRevisionKey(key), JSON.stringify(nextRevision), now);
  await done;
  const stored = await readRecord(db, key);
  if ((stored?.value ?? null) !== value) throw new DOMException("IndexedDB coordinated read-back verification failed", "DataError");
  if (stored) updateStorageEntry(stored);
  else removeStorageEntry(key);
  notifyStorageStatus();
  revisionCache.set(key, Math.max(revisionCache.get(key) ?? 0, nextRevision.revision));
  postCoordinationMessage({
    schemaVersion: 1,
    type: value === null ? "deleted" : "saved",
    writerId,
    sentAt: now,
    key,
    revision: nextRevision.revision,
    fencingToken: nextRevision.fencingToken,
  });
  return nextRevision;
}

async function refreshAfterRemoteChange(message: LocalSaveBroadcastMessage): Promise<void> {
  if (message.writerId === writerId || backend !== "indexeddb" || !database) return;
  try {
    await reloadLocalSaveCache();
    const lease = parseLocalSaveWriterLease(await readCoordinationValue(database, LOCAL_SAVE_WRITER_LEASE_KEY));
    if (lease && lease.ownerId !== writerId && lease.expiresAt > Date.now() && lease.fencingToken >= writerStatus.fencingToken) {
      publishWriterStatus({ role: "secondary", writerId, fencingToken: lease.fencingToken, leaseExpiresAt: lease.expiresAt, reason: "另一个标签页已更新本地存档，当前页面已切换为只读" });
    }
    if (message.key) {
      const revision = parseLocalSaveRevision(await readCoordinationValue(database, localSaveRevisionKey(message.key)));
      if (revision) revisionCache.set(message.key, revision.revision);
    }
    if (message.type === "conflict" && message.conflictId) {
      const conflict = parseLocalSaveConflictRecord(await readCoordinationValue(database, localSaveConflictMetadataKey(message.conflictId)));
      if (conflict && conflict.resolvedAt === undefined) {
        publishWriterStatus({ role: "conflict", writerId, fencingToken: lease?.fencingToken ?? writerStatus.fencingToken, leaseExpiresAt: lease?.expiresAt ?? writerStatus.leaseExpiresAt, reason: "另一个标签页检测到存档分叉，双方版本均已保留", conflictId: conflict.conflictId });
      }
    }
    saveChangeListeners.forEach((listener) => listener(message));
  } catch {
    // A subsequent read or write performs the durable revision check again.
  }
}

function installCoordinationListeners(): void {
  if (typeof window === "undefined") return;
  if (typeof BroadcastChannel !== "undefined" && !broadcastChannel) {
    try {
      broadcastChannel = new BroadcastChannel(LOCAL_SAVE_BROADCAST_CHANNEL);
      broadcastChannel.onmessage = (event: MessageEvent<LocalSaveBroadcastMessage>) => {
        if (event.data?.schemaVersion === 1) void refreshAfterRemoteChange(event.data);
      };
    } catch { broadcastChannel = null; }
  }
  window.addEventListener("storage", (event) => {
    if (event.key !== LOCAL_SAVE_STORAGE_EVENT_KEY || !event.newValue) return;
    try {
      const message = JSON.parse(event.newValue) as LocalSaveBroadcastMessage;
      if (message.schemaVersion === 1) void refreshAfterRemoteChange(message);
    } catch { /* Ignore unrelated/malformed storage events. */ }
  });
}

function startWriterCoordinationTimers(): void {
  if (typeof window === "undefined") return;
  if (writerHeartbeat === null) writerHeartbeat = window.setInterval(() => void renewWriterLease().catch(() => undefined), LOCAL_SAVE_HEARTBEAT_INTERVAL_MS);
}

function legacyEntries(): Array<[string, string]> {
  try {
    return Object.keys(window.localStorage).filter(isSaveKey).flatMap((key) => {
      const value = window.localStorage.getItem(key);
      return value === null ? [] : [[key, value] as [string, string]];
    });
  } catch {
    return [];
  }
}

function preserveDevelopmentMirror(): boolean {
  return import.meta.env.DEV && (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") &&
    new URLSearchParams(window.location.search).get("storageMigration") !== "production";
}

async function initializeIndexedDb(): Promise<void> {
  const db = await openDatabase();
  database = db;
  backend = "indexeddb";
  const records = await readAllStoredRecords(db);
  for (const record of records) {
    if (isSaveKey(record.key)) {
      cache.set(record.key, record.value);
      updateStorageEntry(record);
    }
    if (record.key.startsWith(LOCAL_SAVE_REVISION_KEY_PREFIX)) {
      const revision = parseLocalSaveRevision(record.value);
      if (revision) revisionCache.set(revision.saveKey, revision.revision);
    }
    if (record.key.startsWith(`${LOCAL_SAVE_COORDINATION_PREFIX}.conflict.`)) {
      const conflict = parseLocalSaveConflictRecord(record.value);
      if (conflict && conflict.resolvedAt === undefined && conflict.createdAt >= startupConflictCreatedAt) {
        startupConflictId = conflict.conflictId;
        startupConflictCreatedAt = conflict.createdAt;
      }
    }
  }

  const legacy = legacyEntries();
  for (const [key, value] of legacy) {
    const existing = cache.get(key) ?? null;
    const revision = parseLocalSaveRevision(await readCoordinationValue(db, localSaveRevisionKey(key)));
    let selected: string | null = existing && savedAt(existing) >= savedAt(value) ? existing : value;
    if (revision && existing !== value) {
      // Once coordinated revisions exist, a localStorage emergency mirror may
      // have come from a stale pagehide handler. Preserve both copies instead
      // of letting wall-clock savedAt choose a winner.
      const now = Date.now();
      const transaction = db.transaction(RECORD_STORE, "readwrite");
      const done = transactionDone(transaction);
      const store = transaction.objectStore(RECORD_STORE);
      const conflictId = preserveWriteConflict(store, key, value, existing, revision.fencingToken, now);
      await done;
      selected = existing;
      startupConflictId = conflictId;
      startupConflictCreatedAt = now;
    } else if (existing !== selected) {
      await writeRecord(db, key, selected);
    }
    if (selected === null) {
      cache.delete(key);
      removeStorageEntry(key);
    } else putCacheValue(key, selected);
    const verified = await readRecord(db, key);
    if (!preserveDevelopmentMirror() && (verified?.value ?? null) === selected) {
      try {
        if (window.localStorage.getItem(key) === value) window.localStorage.removeItem(key);
      } catch {
        // The verified IndexedDB copy remains authoritative.
      }
    }
  }
}

function initializeFallback(): void {
  const entries = legacyEntries();
  for (const [key, value] of entries) putCacheValue(key, value);
  try {
    const probe = `${SAVE_KEY}.storage-probe`;
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    backend = "local-storage";
  } catch {
    backend = "memory";
  }
  publishWriterStatus({ role: "primary", writerId, fencingToken: 1, leaseExpiresAt: Number.MAX_SAFE_INTEGER, reason: "当前环境使用兼容存储后端" });
}

export function initializeLocalSaveStore(): Promise<void> {
  if (initialization) return initialization;
  initialization = (async () => {
    if (typeof window === "undefined" || !window.indexedDB) {
      initializeFallback();
      return;
    }
    try {
      await initializeIndexedDb();
    } catch {
      database?.close();
      database = null;
      initializeFallback();
    }
    installCoordinationListeners();
    await claimWriterLease();
    if (startupConflictId) {
      publishWriterStatus({ ...writerStatus, role: "conflict", reason: "检测到旧标签页留下的急救存档，已保留双方版本", conflictId: startupConflictId });
    }
    startWriterCoordinationTimers();
  })();
  return initialization;
}

export function getLocalSaveWriterStatus(): LocalSaveWriterStatus {
  return { ...writerStatus };
}

export function subscribeLocalSaveWriterStatus(listener: (status: LocalSaveWriterStatus) => void): () => void {
  writerStatusListeners.add(listener);
  listener({ ...writerStatus });
  return () => writerStatusListeners.delete(listener);
}

export function subscribeLocalSaveChanges(listener: (message: LocalSaveBroadcastMessage) => void): () => void {
  saveChangeListeners.add(listener);
  return () => saveChangeListeners.delete(listener);
}

export async function takeOverLocalSaveWriter(): Promise<boolean> {
  if (writerStatus.role === "primary") return true;
  if (writerStatus.role === "conflict") return false;
  if (backend === "indexeddb" && database) {
    const durable = parseLocalSaveWriterLease(await readCoordinationValue(database, LOCAL_SAVE_WRITER_LEASE_KEY));
    return !durable || durable.expiresAt <= Date.now();
  }
  return writerStatus.leaseExpiresAt <= Date.now();
}

export function canWriteLocalSaves(): boolean {
  return writerStatus.role === "primary";
}

export async function getLocalSaveConflicts(): Promise<LocalSaveConflictSummary[]> {
  await initializeLocalSaveStore();
  if (backend !== "indexeddb" || !database) return [];
  const records = await readAllStoredRecords(database);
  const byKey = new Map(records.map((record) => [record.key, record.value]));
  return records
    .filter((record) => record.key.startsWith(`${LOCAL_SAVE_COORDINATION_PREFIX}.conflict.`))
    .flatMap((record) => {
      const conflict = parseLocalSaveConflictRecord(record.value);
      if (!conflict || conflict.resolvedAt !== undefined) return [];
      const candidate = byKey.get(conflict.candidateKey) ?? null;
      const persisted = byKey.get(conflict.persistedKey) ?? null;
      const candidateIdentity = inspectLocalSaveIdentity(candidate);
      const persistedIdentity = inspectLocalSaveIdentity(persisted);
      return [{
        conflictId: conflict.conflictId,
        saveKey: conflict.saveKey,
        createdAt: conflict.createdAt,
        candidate: { available: candidate !== null, deleted: conflict.candidateDeleted, ...candidateIdentity },
        persisted: { available: persisted !== null, missing: conflict.persistedMissing, ...persistedIdentity },
      } satisfies LocalSaveConflictSummary];
    })
    .sort((left, right) => right.createdAt - left.createdAt);
}

export async function resolveLocalSaveConflict(
  conflictId: string,
  resolution: "candidate" | "persisted",
): Promise<boolean> {
  await initializeLocalSaveStore();
  if (backend !== "indexeddb" || !database) return false;
  if (writerStatus.role !== "primary" && !await claimWriterLease()) return false;
  const now = Date.now();
  const transaction = database.transaction(RECORD_STORE, "readwrite");
  const done = transactionDone(transaction);
  const store = transaction.objectStore(RECORD_STORE);
  try {
    const conflictRecord = await requestResult(store.get(localSaveConflictMetadataKey(conflictId)) as IDBRequest<StoredSaveRecord | undefined>);
    const conflict = parseLocalSaveConflictRecord(conflictRecord?.value);
    if (!conflict || conflict.resolvedAt !== undefined) throw new Error("冲突记录不存在或已经处理");
    const leaseRecord = await requestResult(store.get(LOCAL_SAVE_WRITER_LEASE_KEY) as IDBRequest<StoredSaveRecord | undefined>);
    const lease = parseLocalSaveWriterLease(leaseRecord?.value);
    if (!lease || lease.ownerId !== writerId || lease.fencingToken !== writerStatus.fencingToken || lease.expiresAt <= now) {
      throw new LocalSaveReadOnlyError();
    }
    const candidateRecord = conflict.candidateDeleted
      ? undefined
      : await requestResult(store.get(conflict.candidateKey) as IDBRequest<StoredSaveRecord | undefined>);
    const persistedRecord = conflict.persistedMissing
      ? undefined
      : await requestResult(store.get(conflict.persistedKey) as IDBRequest<StoredSaveRecord | undefined>);
    const currentRecord = await requestResult(store.get(conflict.saveKey) as IDBRequest<StoredSaveRecord | undefined>);
    const candidate = conflict.candidateDeleted ? null : candidateRecord?.value ?? null;
    const persistedAtConflict = conflict.persistedMissing ? null : persistedRecord?.value ?? null;
    const current = currentRecord?.value ?? null;
    if (!conflict.candidateDeleted && candidate === null) throw new Error("冲突候选副本缺失");
    if (!conflict.persistedMissing && persistedAtConflict === null) throw new Error("冲突持久副本缺失");
    if (current !== persistedAtConflict) throw new Error("当前存档在确认期间再次发生变化");
    const selected = resolution === "candidate" ? candidate : current;
    const revisionRecord = await requestResult(store.get(localSaveRevisionKey(conflict.saveKey)) as IDBRequest<StoredSaveRecord | undefined>);
    const revision = parseLocalSaveRevision(revisionRecord?.value);
    const nextRevision = createLocalSaveRevision({
      saveKey: conflict.saveKey,
      previousRevision: revision?.revision ?? 0,
      value: selected,
      writerId,
      fencingToken: lease.fencingToken,
      now,
    });
    if (selected === null) store.delete(conflict.saveKey);
    else putStoredValue(store, conflict.saveKey, selected, now);
    putStoredValue(store, localSaveRevisionKey(conflict.saveKey), JSON.stringify(nextRevision), now);
    putStoredValue(store, localSaveConflictMetadataKey(conflictId), JSON.stringify({ ...conflict, resolvedAt: now, resolution }), now);
    await done;
    revisionCache.set(conflict.saveKey, nextRevision.revision);
    if (selected === null) {
      cache.delete(conflict.saveKey);
      removeStorageEntry(conflict.saveKey);
    } else putCacheValue(conflict.saveKey, selected, now);
    postCoordinationMessage({ schemaVersion: 1, type: selected === null ? "deleted" : "saved", writerId, sentAt: now, key: conflict.saveKey, revision: nextRevision.revision, fencingToken: nextRevision.fencingToken });
  } catch {
    try { transaction.abort(); } catch { /* transaction may already be complete */ }
    void done.catch(() => undefined);
    return false;
  }
  startupConflictId = null;
  startupConflictCreatedAt = -1;
  await reloadLocalSaveCache();
  publishWriterStatus({ role: "primary", writerId, fencingToken: writerStatus.fencingToken, leaseExpiresAt: writerStatus.leaseExpiresAt, reason: resolution === "candidate" ? "已采用本标签页的冲突候选存档" : "已保留当前持久存档" });
  await releaseWriterLeaseForReload();
  return true;
}

export function getLocalSaveBackend(): LocalSaveBackend {
  return backend;
}

export function getLocalSaveValue(key: string): string | null {
  ensureSynchronousFallback();
  if (backend === "local-storage") return window.localStorage.getItem(key);
  return cache.get(key) ?? null;
}

export function listLocalSaveKeys(): string[] {
  ensureSynchronousFallback();
  if (backend === "local-storage") return Object.keys(window.localStorage).filter(isSaveKey);
  return [...cache.keys()].filter(isSaveKey);
}

function enqueue(operation: () => Promise<void>, key?: string): void {
  writeQueue = writeQueue.catch(() => undefined).then(operation).catch((error) => {
    pendingWriteError ??= error;
    if (key && isQuotaExceededError(error)) recordQuotaRecoveryPrompt(key);
  });
}

export function setLocalSaveValue(key: string, value: string): void {
  if (!isSaveKey(key)) throw new Error(`Unsupported local save key: ${key}`);
  ensureSynchronousFallback();
  if (writerStatus.role !== "primary") throw new LocalSaveReadOnlyError(writerStatus.reason);
  if (backend === "indexeddb" && database) {
    const baseValue = cache.get(key) ?? null;
    const expectedRevision = revisionCache.get(key) ?? 0;
    cache.set(key, value);
    revisionCache.set(key, expectedRevision + 1);
    enqueue(() => commitCoordinatedRecord(database!, key, value, baseValue, expectedRevision).then(() => {
      clearRecoveredQuotaPrompt(key);
      const summary = classifySaveRecord(key, value);
      if (summary.category === "automatic-snapshot") enforceAutomaticSnapshotLimit(summary.mode);
    }).catch((error) => {
      if (!(error instanceof LocalSaveConflictError)) restoreCachedValueAfterFailedCommit(key, baseValue, expectedRevision);
      throw error;
    }), key);
    if (preserveDevelopmentMirror()) {
      try { window.localStorage.setItem(key, value); } catch { /* test-only mirror */ }
    }
    return;
  }
  if (backend === "local-storage") {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      if (isQuotaExceededError(error)) recordQuotaRecoveryPrompt(key);
      throw error;
    }
  }
  putCacheValue(key, value);
  const summary = classifySaveRecord(key, value);
  if (summary.category === "automatic-snapshot") enforceAutomaticSnapshotLimit(summary.mode);
  clearRecoveredQuotaPrompt(key);
}

export function removeLocalSaveValue(key: string): void {
  if (!isSaveKey(key)) return;
  ensureSynchronousFallback();
  if (writerStatus.role !== "primary") throw new LocalSaveReadOnlyError(writerStatus.reason);
  if (backend === "indexeddb" && database) {
    const baseValue = cache.get(key) ?? null;
    const expectedRevision = revisionCache.get(key) ?? 0;
    cache.delete(key);
    revisionCache.set(key, expectedRevision + 1);
    enqueue(() => commitCoordinatedRecord(database!, key, null, baseValue, expectedRevision).then(() => undefined).catch((error) => {
      if (!(error instanceof LocalSaveConflictError)) restoreCachedValueAfterFailedCommit(key, baseValue, expectedRevision);
      throw error;
    }), key);
    if (preserveDevelopmentMirror()) {
      try { window.localStorage.removeItem(key); } catch { /* test-only mirror */ }
    }
    return;
  }
  cache.delete(key);
  removeStorageEntry(key);
  if (backend === "local-storage") window.localStorage.removeItem(key);
}

export function writePrimarySaveEmergencyMirror(value: string): boolean {
  ensureSynchronousFallback();
  if (backend !== "indexeddb" || writerStatus.role !== "primary") return false;
  try {
    let mode = "normal";
    try {
      const parsed = JSON.parse(value) as { mode?: unknown; state?: { mode?: unknown } };
      mode = parsed.mode === "speedrun" || parsed.state?.mode === "speedrun" ? "speedrun" : "normal";
    } catch { /* checksum validation happens at commit */ }
    const key = mode === "normal" ? SAVE_KEY : `${SAVE_KEY}.${mode}.emergency`;
    window.localStorage.setItem(key, value);
    return window.localStorage.getItem(key) === value;
  } catch {
    return false;
  }
}

export function clearPrimarySaveEmergencyMirror(committedValue: string): void {
  ensureSynchronousFallback();
  if (backend !== "indexeddb" || preserveDevelopmentMirror()) return;
  try {
    let mode = "normal";
    try {
      const parsed = JSON.parse(committedValue) as { mode?: unknown; state?: { mode?: unknown } };
      mode = parsed.mode === "speedrun" || parsed.state?.mode === "speedrun" ? "speedrun" : "normal";
    } catch { /* keep normal fallback */ }
    const key = mode === "normal" ? SAVE_KEY : `${SAVE_KEY}.${mode}.emergency`;
    if (mode === "speedrun") {
      const cached = getLocalSaveValue(key);
      if (cached !== null && savedAt(cached) <= savedAt(committedValue)) removeLocalSaveValue(key);
    }
    const mirrored = window.localStorage.getItem(key);
    if (mirrored !== null && savedAt(mirrored) <= savedAt(committedValue)) window.localStorage.removeItem(key);
  } catch {
    // A stale mirror is harmless and will be reconciled on the next startup.
  }
}

export async function flushLocalSaveWrites(): Promise<void> {
  await writeQueue;
  const error = pendingWriteError;
  pendingWriteError = null;
  if (error) {
    if (isQuotaExceededError(error)) {
      if (!recoveryPrompt) recordQuotaRecoveryPrompt(primaryKeyForMode("normal"));
    }
    throw error;
  }
}

export async function readPersistedLocalSaveValue(key: string): Promise<string | null> {
  await initializeLocalSaveStore();
  if (backend === "indexeddb" && database) return (await readRecord(database, key))?.value ?? null;
  if (backend === "local-storage") return window.localStorage.getItem(key);
  return cache.get(key) ?? null;
}

export async function reloadLocalSaveCache(): Promise<void> {
  if (backend !== "indexeddb" || !database) return;
  cache.clear();
  revisionCache.clear();
  storageEntryCache.clear();
  for (const record of await readAllStoredRecords(database)) {
    if (isSaveKey(record.key)) {
      cache.set(record.key, record.value);
      updateStorageEntry(record);
    }
    if (record.key.startsWith(LOCAL_SAVE_REVISION_KEY_PREFIX)) {
      const revision = parseLocalSaveRevision(record.value);
      if (revision) revisionCache.set(revision.saveKey, revision.revision);
    }
  }
  notifyStorageStatus();
}

function entryLabel(key: string, summary: StoredSaveSummary): string {
  const modeLabel = summary.mode === "speedrun" ? "速通模式" : "普通模式";
  if (key.startsWith(LOCAL_SAVE_CONFLICT_KEY_PREFIX)) return key.endsWith(".candidate") ? `${modeLabel}跨标签冲突：本页候选` : `${modeLabel}跨标签冲突：原持久版本`;
  if (key === SAVE_KEY || key === `${SAVE_KEY}.normal` || key === `${SAVE_KEY}.speedrun`) return `${modeLabel}主存档`;
  if (key === `${SAVE_KEY}.backup` || key === `${SAVE_KEY}.backup.speedrun`) return `${modeLabel}上一版本备份`;
  if (key.startsWith(`${SAVE_KEY}.migration-backup.`)) return "普通模式迁移前原始备份";
  if (key.startsWith(IMPORT_CACHE_KEY_PREFIX)) return `${modeLabel}导入缓存`;
  if (key.startsWith(SLOT_KEY_PREFIX)) {
    return `${modeLabel}手动槽位 ${summary.slot ?? "--"}`;
  }
  if (key.includes(".snapshot.")) {
    if (summary.category === "protected") return `${modeLabel}保护快照：${summary.reason ?? "来源无法识别"}`;
    return `${modeLabel}${summary.automatic ? "自动恢复快照" : `手动快照：${summary.reason ?? "未命名"}`}`;
  }
  return key;
}

function emptyModeUsage(mode: LocalSaveMode): LocalSaveModeStorageUsage {
  return {
    mode,
    totalBytes: 0,
    primaryBytes: 0,
    backupBytes: 0,
    slotBytes: 0,
    automaticSnapshotBytes: 0,
    manualSnapshotBytes: 0,
    protectedBytes: 0,
    importCacheBytes: 0,
    slotCount: 0,
    automaticSnapshotCount: 0,
    manualSnapshotCount: 0,
    protectedCount: 0,
    importCacheCount: 0,
  };
}

function summarizeModes(entries: LocalSaveStorageEntry[]): LocalSaveModeStorageUsage[] {
  const modes = new Map<LocalSaveMode, LocalSaveModeStorageUsage>([
    ["normal", emptyModeUsage("normal")],
    ["speedrun", emptyModeUsage("speedrun")],
  ]);
  for (const entry of entries) {
    const usage = modes.get(entry.mode)!;
    usage.totalBytes += entry.bytes;
    if (entry.category === "primary") usage.primaryBytes += entry.bytes;
    else if (entry.category === "backup") usage.backupBytes += entry.bytes;
    else if (entry.category === "slot") { usage.slotBytes += entry.bytes; usage.slotCount += 1; }
    else if (entry.category === "automatic-snapshot") { usage.automaticSnapshotBytes += entry.bytes; usage.automaticSnapshotCount += 1; }
    else if (entry.category === "manual-snapshot") { usage.manualSnapshotBytes += entry.bytes; usage.manualSnapshotCount += 1; }
    else if (entry.category === "protected") { usage.protectedBytes += entry.bytes; usage.protectedCount += 1; }
    else if (entry.category === "import-cache") { usage.importCacheBytes += entry.bytes; usage.importCacheCount += 1; }
  }
  return [...modes.values()];
}

async function inspectPersistenceStatus(): Promise<{ status: LocalSavePersistenceStatus; requestSupported: boolean }> {
  const storage = typeof navigator === "undefined" ? undefined : navigator.storage;
  if (!storage || typeof storage.persisted !== "function") {
    lastPersistenceStatus = "unsupported";
    return { status: "unsupported", requestSupported: false };
  }
  try {
    const granted = await storage.persisted();
    if (granted) lastPersistenceStatus = "granted";
    return {
      status: granted ? "granted" : lastPersistenceStatus === "denied" ? "denied" : "not-granted",
      requestSupported: typeof storage.persist === "function",
    };
  } catch {
    lastPersistenceStatus = "unsupported";
    return { status: "unsupported", requestSupported: false };
  }
}

function pressureFor(usage: number | null, quota: number | null): LocalSaveStoragePressure {
  if (usage === null || quota === null || quota <= 0) return "unknown";
  const ratio = usage / quota;
  return ratio >= 0.95 ? "critical" : ratio >= 0.8 ? "high" : "normal";
}

export function subscribeLocalSaveStorageStatus(listener: () => void): () => void {
  storageStatusListeners.add(listener);
  return () => storageStatusListeners.delete(listener);
}

export async function requestLocalSavePersistentStorage(): Promise<LocalSavePersistenceStatus> {
  await initializeLocalSaveStore();
  if (backend === "memory") {
    lastPersistenceStatus = "unsupported";
    return "unsupported";
  }
  const storage = typeof navigator === "undefined" ? undefined : navigator.storage;
  if (!storage || typeof storage.persist !== "function") {
    lastPersistenceStatus = "unsupported";
    return "unsupported";
  }
  try {
    const granted = await storage.persist();
    lastPersistenceStatus = granted ? "granted" : "denied";
    notifyStorageStatus();
    return granted ? "granted" : "denied";
  } catch {
    lastPersistenceStatus = "denied";
    notifyStorageStatus();
    return "denied";
  }
}

export function dismissLocalSaveRecoveryPrompt(): void {
  recoveryPrompt = null;
  notifyStorageStatus();
}

export async function deleteLocalSaveManagedEntries(keys: string[]): Promise<{ removed: string[]; failed: string[]; blocked: string[] }> {
  await initializeLocalSaveStore();
  const removed: string[] = [];
  const failed: string[] = [];
  const blocked: string[] = [];
  const uniqueKeys = [...new Set(keys)];
  for (const key of uniqueKeys) {
    const entry = storageEntryCache.get(key);
    const deletable = entry?.category === "manual-snapshot" || entry?.category === "import-cache" ||
      entry?.category === "protected" && entry.key.includes(".snapshot.");
    if (!entry || !deletable) {
      blocked.push(key);
      continue;
    }
    try {
      removeLocalSaveValue(key);
    } catch {
      failed.push(key);
    }
  }
  try {
    await flushLocalSaveWrites();
  } catch {
    // Exact per-key persistence checks below determine the result.
  }
  for (const key of uniqueKeys) {
    if (blocked.includes(key) || failed.includes(key)) continue;
    if (await readPersistedLocalSaveValue(key) === null) removed.push(key);
    else failed.push(key);
  }
  if (failed.length > 0) await reloadLocalSaveCache().catch(() => undefined);
  notifyStorageStatus();
  return { removed, failed, blocked };
}

export async function getLocalSaveStorageEstimate(): Promise<LocalSaveStorageEstimate> {
  await initializeLocalSaveStore();
  let browserUsageBytes: number | null = null;
  let browserQuotaBytes: number | null = null;
  try {
    const estimate = await navigator.storage?.estimate?.();
    browserUsageBytes = typeof estimate?.usage === "number" ? estimate.usage : null;
    browserQuotaBytes = typeof estimate?.quota === "number" ? estimate.quota : null;
  } catch {
    // Some embedded browsers do not expose quota estimates.
  }
  const persistence = backend === "memory"
    ? { status: "unsupported" as const, requestSupported: false }
    : await inspectPersistenceStatus();
  const entries = [...storageEntryCache.values()]
    .map(({ checksum: _checksum, ...entry }) => entry)
    .sort((left, right) => left.mode.localeCompare(right.mode) || Number(right.protected) - Number(left.protected) || right.savedAt - left.savedAt || left.key.localeCompare(right.key));
  const modes = summarizeModes(entries);
  const warnings: string[] = [];
  for (const usage of modes) {
    const managedCount = usage.manualSnapshotCount + usage.protectedCount;
    const managedBytes = usage.manualSnapshotBytes + usage.protectedBytes;
    if (managedCount >= MANAGED_SNAPSHOT_WARNING_COUNT || managedBytes >= MANAGED_SNAPSHOT_WARNING_BYTES) {
      warnings.push(`${usage.mode === "speedrun" ? "速通" : "普通"}模式有 ${managedCount} 份手动/保护快照（${Math.ceil(managedBytes / 1024 / 1024)} MiB），请由玩家选择是否清理；系统不会自动删除。`);
    }
    if (usage.automaticSnapshotCount > LOCAL_AUTOMATIC_SNAPSHOT_LIMIT) {
      warnings.push(`${usage.mode === "speedrun" ? "速通" : "普通"}模式自动快照超过 ${LOCAL_AUTOMATIC_SNAPSHOT_LIMIT} 份，下一次写入会只清理该模式的旧自动快照。`);
    }
  }
  const pressure = pressureFor(browserUsageBytes, browserQuotaBytes);
  if (pressure === "high") warnings.push("浏览器存储占用已超过 80%，建议导出存档并检查快照占用。");
  if (pressure === "critical") warnings.push("浏览器存储占用已超过 95%，请立即导出存档并释放空间。");
  return {
    backend,
    payloadBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    browserUsageBytes,
    browserQuotaBytes,
    persistenceStatus: persistence.status,
    persistenceRequestSupported: persistence.requestSupported,
    pressure,
    modes,
    warnings,
    recoveryPrompt,
    entries,
  };
}

export async function hasLocalSaveCapacity(key: string, nextValue: string): Promise<{ ok: boolean; requiredBytes: number; availableBytes: number | null }> {
  const requiredBytes = Math.max(0, byteLength(nextValue) - (storageEntryCache.get(key)?.bytes ?? 0));
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (typeof estimate?.quota !== "number" || typeof estimate.usage !== "number") return { ok: true, requiredBytes, availableBytes: null };
    const availableBytes = Math.max(0, estimate.quota - estimate.usage);
    return { ok: requiredBytes + 256 * 1024 <= availableBytes, requiredBytes, availableBytes };
  } catch {
    return { ok: true, requiredBytes, availableBytes: null };
  }
}
