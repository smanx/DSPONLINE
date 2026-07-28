const DATABASE_NAME = "dsp-idle-network.local-saves";
const DATABASE_VERSION = 1;
const RECORD_STORE = "records";
const SAVE_KEY = "dsp-idle-network.save.v1";
const SLOT_KEY_PREFIX = "dsp-idle-network.slot.";

interface StoredSaveRecord {
  key: string;
  value: string;
  updatedAt: number;
  bytes: number;
}

export type LocalSaveBackend = "indexeddb" | "local-storage" | "memory";

export interface LocalSaveStorageEntry {
  key: string;
  label: string;
  bytes: number;
}

export interface LocalSaveStorageEstimate {
  backend: LocalSaveBackend;
  payloadBytes: number;
  browserUsageBytes: number | null;
  browserQuotaBytes: number | null;
  entries: LocalSaveStorageEntry[];
}

const cache = new Map<string, string>();
let backend: LocalSaveBackend = "memory";
let database: IDBDatabase | null = null;
let initialization: Promise<void> | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let pendingWriteError: unknown = null;

function ensureSynchronousFallback(): void {
  if (initialization || backend !== "memory" || typeof window === "undefined") return;
  initializeFallback();
}

function isSaveKey(key: string): boolean {
  return key === SAVE_KEY || key === `${SAVE_KEY}.backup` || key.startsWith(`${SAVE_KEY}.snapshot.`) || key.startsWith(SLOT_KEY_PREFIX);
}

function byteLength(value: string): number {
  try {
    return new TextEncoder().encode(value).byteLength;
  } catch {
    return value.length;
  }
}

function savedAt(value: string): number {
  try {
    const parsed = JSON.parse(value) as { savedAt?: unknown };
    return typeof parsed.savedAt === "number" && Number.isFinite(parsed.savedAt) ? parsed.savedAt : 0;
  } catch {
    return 0;
  }
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
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error("IndexedDB unavailable"));
    request.onblocked = () => reject(new Error("IndexedDB upgrade blocked"));
  });
}

async function readAllRecords(db: IDBDatabase): Promise<StoredSaveRecord[]> {
  const transaction = db.transaction(RECORD_STORE, "readonly");
  const done = transactionDone(transaction);
  const records = await requestResult(transaction.objectStore(RECORD_STORE).getAll() as IDBRequest<StoredSaveRecord[]>);
  await done;
  return records.filter((record) => record && typeof record.key === "string" && typeof record.value === "string" && isSaveKey(record.key));
}

async function readRecord(db: IDBDatabase, key: string): Promise<StoredSaveRecord | undefined> {
  const transaction = db.transaction(RECORD_STORE, "readonly");
  const done = transactionDone(transaction);
  const record = await requestResult(transaction.objectStore(RECORD_STORE).get(key) as IDBRequest<StoredSaveRecord | undefined>);
  await done;
  return record;
}

async function writeRecord(db: IDBDatabase, key: string, value: string): Promise<void> {
  const transaction = db.transaction(RECORD_STORE, "readwrite");
  const done = transactionDone(transaction);
  transaction.objectStore(RECORD_STORE).put({ key, value, updatedAt: Date.now(), bytes: byteLength(value) } satisfies StoredSaveRecord);
  await done;
  const stored = await readRecord(db, key);
  if (!stored || stored.value !== value) throw new DOMException("IndexedDB read-back verification failed", "DataError");
}

async function deleteRecord(db: IDBDatabase, key: string): Promise<void> {
  const transaction = db.transaction(RECORD_STORE, "readwrite");
  const done = transactionDone(transaction);
  transaction.objectStore(RECORD_STORE).delete(key);
  await done;
  if (await readRecord(db, key)) throw new DOMException("IndexedDB delete verification failed", "DataError");
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
  const records = await readAllRecords(db);
  for (const record of records) cache.set(record.key, record.value);

  const legacy = legacyEntries();
  for (const [key, value] of legacy) {
    const existing = cache.get(key);
    const selected = existing && savedAt(existing) >= savedAt(value) ? existing : value;
    if (existing !== selected) await writeRecord(db, key, selected);
    cache.set(key, selected);
    const verified = await readRecord(db, key);
    if (!preserveDevelopmentMirror() && verified?.value === selected) {
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
  for (const [key, value] of entries) cache.set(key, value);
  try {
    const probe = `${SAVE_KEY}.storage-probe`;
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    backend = "local-storage";
  } catch {
    backend = "memory";
  }
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
  })();
  return initialization;
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

function enqueue(operation: () => Promise<void>): void {
  writeQueue = writeQueue.catch(() => undefined).then(operation).catch((error) => {
    pendingWriteError = error;
  });
}

export function setLocalSaveValue(key: string, value: string): void {
  if (!isSaveKey(key)) throw new Error(`Unsupported local save key: ${key}`);
  ensureSynchronousFallback();
  cache.set(key, value);
  if (backend === "indexeddb" && database) {
    enqueue(() => writeRecord(database!, key, value));
    if (preserveDevelopmentMirror()) {
      try { window.localStorage.setItem(key, value); } catch { /* test-only mirror */ }
    }
    return;
  }
  if (backend === "local-storage") window.localStorage.setItem(key, value);
}

export function removeLocalSaveValue(key: string): void {
  if (!isSaveKey(key)) return;
  ensureSynchronousFallback();
  cache.delete(key);
  if (backend === "indexeddb" && database) {
    enqueue(() => deleteRecord(database!, key));
    if (preserveDevelopmentMirror()) {
      try { window.localStorage.removeItem(key); } catch { /* test-only mirror */ }
    }
    return;
  }
  if (backend === "local-storage") window.localStorage.removeItem(key);
}

export function writePrimarySaveEmergencyMirror(value: string): boolean {
  ensureSynchronousFallback();
  if (backend !== "indexeddb") return false;
  try {
    window.localStorage.setItem(SAVE_KEY, value);
    return window.localStorage.getItem(SAVE_KEY) === value;
  } catch {
    return false;
  }
}

export function clearPrimarySaveEmergencyMirror(committedValue: string): void {
  ensureSynchronousFallback();
  if (backend !== "indexeddb" || preserveDevelopmentMirror()) return;
  try {
    const mirrored = window.localStorage.getItem(SAVE_KEY);
    if (mirrored !== null && savedAt(mirrored) <= savedAt(committedValue)) window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // A stale mirror is harmless and will be reconciled on the next startup.
  }
}

export async function flushLocalSaveWrites(): Promise<void> {
  await writeQueue;
  const error = pendingWriteError;
  pendingWriteError = null;
  if (error) throw error;
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
  for (const record of await readAllRecords(database)) cache.set(record.key, record.value);
}

function entryLabel(key: string, value: string): string {
  if (key === SAVE_KEY) return "主存档";
  if (key === `${SAVE_KEY}.backup`) return "上一版本备份";
  if (key.startsWith(SLOT_KEY_PREFIX)) return `手动槽位 ${key.slice(SLOT_KEY_PREFIX.length)}`;
  if (key.includes(".snapshot.")) {
    try {
      const parsed = JSON.parse(value) as { reason?: unknown };
      return typeof parsed.reason === "string" && parsed.reason ? `快照：${parsed.reason}` : "自动恢复快照";
    } catch {
      return "恢复快照（无法解析）";
    }
  }
  return key;
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
  const entries = [...cache.entries()].filter(([key]) => isSaveKey(key)).map(([key, value]) => ({
    key,
    label: entryLabel(key, value),
    bytes: byteLength(value),
  })).sort((left, right) => right.bytes - left.bytes || left.key.localeCompare(right.key));
  return {
    backend,
    payloadBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    browserUsageBytes,
    browserQuotaBytes,
    entries,
  };
}

export async function hasLocalSaveCapacity(key: string, nextValue: string): Promise<{ ok: boolean; requiredBytes: number; availableBytes: number | null }> {
  const requiredBytes = Math.max(0, byteLength(nextValue) - byteLength(cache.get(key) ?? ""));
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (typeof estimate?.quota !== "number" || typeof estimate.usage !== "number") return { ok: true, requiredBytes, availableBytes: null };
    const availableBytes = Math.max(0, estimate.quota - estimate.usage);
    return { ok: requiredBytes + 256 * 1024 <= availableBytes, requiredBytes, availableBytes };
  } catch {
    return { ok: true, requiredBytes, availableBytes: null };
  }
}
