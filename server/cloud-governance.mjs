import { createHash } from "node:crypto";

export const CLOUD_HISTORY_LIMIT = 20;
export const CLOUD_HISTORY_PRUNE_CONFIRMATION = "PRUNE_CLOUD_HISTORY";

const CLOUD_SLOTS = ["main", "1", "2", "3"];
const SAVE_MODES = ["normal", "speedrun"];

function storageSlot(mode, slot) {
  return mode === "normal" ? slot : `${mode}:${slot}`;
}

function historyFor(data, userId, slot, mode) {
  if (mode === "normal") {
    if (slot === "main") return Array.isArray(data?.cloudSaveHistory?.[userId]) ? data.cloudSaveHistory[userId] : [];
    return Array.isArray(data?.cloudSaveSlotHistory?.[userId]?.[slot]) ? data.cloudSaveSlotHistory[userId][slot] : [];
  }
  if (slot === "main") return Array.isArray(data?.cloudSaveHistoryByMode?.[userId]?.[mode]) ? data.cloudSaveHistoryByMode[userId][mode] : [];
  return Array.isArray(data?.cloudSaveSlotHistoryByMode?.[userId]?.[mode]?.[slot]) ? data.cloudSaveSlotHistoryByMode[userId][mode][slot] : [];
}

function currentFor(data, userId, slot, mode) {
  if (mode === "normal") return slot === "main" ? data?.cloudSaves?.[userId] : data?.cloudSaveSlots?.[userId]?.[slot];
  return slot === "main" ? data?.cloudSavesByMode?.[userId]?.[mode] : data?.cloudSaveSlotsByMode?.[userId]?.[mode]?.[slot];
}

function revisionKey(userId, slot, revision) {
  return `${userId}\u0000${slot}\u0000${revision}`;
}

function retainedRevisionKeys(data, limit = CLOUD_HISTORY_LIMIT) {
  const retained = new Set();
  for (const userId of Object.keys(data?.users ?? {})) {
    for (const mode of SAVE_MODES) {
      for (const slot of CLOUD_SLOTS) {
        const persistedSlot = storageSlot(mode, slot);
        const history = historyFor(data, userId, slot, mode)
          .filter((entry) => Number.isInteger(entry?.revision) && entry.revision > 0)
          .sort((left, right) => left.revision - right.revision)
          .slice(-limit);
        for (const entry of history) retained.add(revisionKey(userId, persistedSlot, entry.revision));
        const current = currentFor(data, userId, slot, mode);
        if (Number.isInteger(current?.revision) && current.revision > 0) retained.add(revisionKey(userId, persistedSlot, current.revision));
      }
    }
  }
  return retained;
}

export function trimCloudHistoryMetadataInPlace(data, limit = CLOUD_HISTORY_LIMIT) {
  let removed = 0;
  for (const [userId, history] of Object.entries(data?.cloudSaveHistory ?? {})) {
    if (!Array.isArray(history)) continue;
    const normalized = [...history].sort((left, right) => left.revision - right.revision).slice(-limit);
    removed += Math.max(0, history.length - normalized.length);
    data.cloudSaveHistory[userId] = normalized;
  }
  for (const [userId, slots] of Object.entries(data?.cloudSaveSlotHistory ?? {})) {
    if (!slots || typeof slots !== "object") continue;
    for (const slot of CLOUD_SLOTS.slice(1)) {
      const history = slots[slot];
      if (!Array.isArray(history)) continue;
      const normalized = [...history].sort((left, right) => left.revision - right.revision).slice(-limit);
      removed += Math.max(0, history.length - normalized.length);
      slots[slot] = normalized;
    }
    if (!data.users?.[userId]) delete data.cloudSaveSlotHistory[userId];
  }
  for (const [userId, modes] of Object.entries(data?.cloudSaveHistoryByMode ?? {})) {
    if (!modes || typeof modes !== "object") continue;
    for (const mode of SAVE_MODES) {
      const history = modes[mode];
      if (!Array.isArray(history)) continue;
      const normalized = [...history].sort((left, right) => left.revision - right.revision).slice(-limit);
      removed += Math.max(0, history.length - normalized.length);
      modes[mode] = normalized;
    }
    if (!data.users?.[userId]) delete data.cloudSaveHistoryByMode[userId];
  }
  for (const [userId, modes] of Object.entries(data?.cloudSaveSlotHistoryByMode ?? {})) {
    if (!modes || typeof modes !== "object") continue;
    for (const mode of SAVE_MODES) {
      const slots = modes[mode];
      if (!slots || typeof slots !== "object") continue;
      for (const slot of CLOUD_SLOTS.slice(1)) {
        const history = slots[slot];
        if (!Array.isArray(history)) continue;
        const normalized = [...history].sort((left, right) => left.revision - right.revision).slice(-limit);
        removed += Math.max(0, history.length - normalized.length);
        slots[slot] = normalized;
      }
    }
    if (!data.users?.[userId]) delete data.cloudSaveSlotHistoryByMode[userId];
  }
  return removed;
}

export function buildCloudHistoryPrunePlan(data, payloadRows, limit = CLOUD_HISTORY_LIMIT) {
  const retained = retainedRevisionKeys(data, limit);
  const users = data?.users ?? {};
  const deletions = [];
  const reasons = { orphanAccount: 0, invalidSlot: 0, expiredRevision: 0 };
  for (const row of payloadRows ?? []) {
    const userId = typeof row?.userId === "string" ? row.userId : "";
    const slot = typeof row?.slot === "string" ? row.slot : "";
    const revision = Number(row?.revision);
    const key = revisionKey(userId, slot, revision);
    let reason = null;
    if (!users[userId]) reason = "orphanAccount";
    else if (!SAVE_MODES.some((mode) => CLOUD_SLOTS.some((candidate) => storageSlot(mode, candidate) === slot)) || !Number.isInteger(revision) || revision < 1) reason = "invalidSlot";
    else if (!retained.has(key)) reason = "expiredRevision";
    if (!reason) continue;
    reasons[reason] += 1;
    deletions.push({ userId, slot, revision, reason });
  }
  deletions.sort((left, right) => left.userId.localeCompare(right.userId) || left.slot.localeCompare(right.slot) || left.revision - right.revision);
  const digest = createHash("sha256");
  for (const entry of deletions) digest.update(`${entry.userId}\u0000${entry.slot}\u0000${entry.revision}\u0000${entry.reason}\n`);
  return {
    previewId: digest.digest("hex"),
    generatedAt: Date.now(),
    limit,
    deletionCount: deletions.length,
    reasons,
    deletions,
  };
}

export function publicCloudHistoryPrunePlan(plan) {
  return {
    previewId: plan.previewId,
    generatedAt: plan.generatedAt,
    limit: plan.limit,
    deletionCount: plan.deletionCount,
    reasons: { ...plan.reasons },
    confirmation: CLOUD_HISTORY_PRUNE_CONFIRMATION,
  };
}

function pragmaNumber(database, name) {
  try {
    const row = database.pragma(name, { simple: true });
    return Number.isFinite(Number(row)) ? Number(row) : 0;
  } catch {
    return 0;
  }
}

function scalar(database, sql, fallback = 0) {
  try {
    const row = database.prepare(sql).get();
    const value = row ? Object.values(row)[0] : fallback;
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  } catch {
    return fallback;
  }
}

export function collectSqliteGovernanceMetrics(database, data, { databaseBytes = 0, walBytes = 0, shmBytes = 0 } = {}) {
  const pageSize = pragmaNumber(database, "page_size");
  const pageCount = pragmaNumber(database, "page_count");
  const freePages = pragmaNumber(database, "freelist_count");
  const payloadRows = scalar(database, "SELECT count(*) AS value FROM cloud_save_payloads");
  const payloadBytes = scalar(database, "SELECT coalesce(sum(length(payload)), 0) AS value FROM cloud_save_payloads");
  const appStateBytes = scalar(database, "SELECT coalesce(length(payload), 0) AS value FROM app_state WHERE id = 1");
  const users = Math.max(0, Object.keys(data?.users ?? {}).length);
  const slotsWithHistory = new Set();
  for (const [userId, history] of Object.entries(data?.cloudSaveHistory ?? {})) if (Array.isArray(history) && history.length) slotsWithHistory.add(`${userId}:main`);
  for (const [userId, slots] of Object.entries(data?.cloudSaveSlotHistory ?? {})) {
    for (const slot of CLOUD_SLOTS.slice(1)) if (Array.isArray(slots?.[slot]) && slots[slot].length) slotsWithHistory.add(`${userId}:${slot}`);
  }
  for (const [userId, modes] of Object.entries(data?.cloudSaveHistoryByMode ?? {})) {
    for (const mode of SAVE_MODES) if (Array.isArray(modes?.[mode]) && modes[mode].length) slotsWithHistory.add(`${userId}:${storageSlot(mode, "main")}`);
  }
  for (const [userId, modes] of Object.entries(data?.cloudSaveSlotHistoryByMode ?? {})) {
    for (const mode of SAVE_MODES) {
      for (const slot of CLOUD_SLOTS.slice(1)) {
        if (Array.isArray(modes?.[mode]?.[slot]) && modes[mode][slot].length) slotsWithHistory.add(`${userId}:${storageSlot(mode, slot)}`);
      }
    }
  }
  return {
    layoutVersion: data?.storageLayoutVersion ?? 1,
    databaseBytes: Math.max(0, databaseBytes),
    walBytes: Math.max(0, walBytes),
    shmBytes: Math.max(0, shmBytes),
    pageSize,
    pageCount,
    freePages,
    allocatedPageBytes: pageSize * pageCount,
    reclaimablePageBytes: pageSize * freePages,
    appStateBytes,
    cloudPayloadBytes: payloadBytes,
    cloudPayloadRows: payloadRows,
    averagePayloadBytes: payloadRows > 0 ? Math.round(payloadBytes / payloadRows) : 0,
    averageRevisionsPerAccount: users > 0 ? Math.round(payloadRows / users * 100) / 100 : 0,
    averageRevisionsPerActiveSlot: slotsWithHistory.size > 0 ? Math.round(payloadRows / slotsWithHistory.size * 100) / 100 : 0,
  };
}

export function parseDailyBackupWindow(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const match = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  if (Number(match[1]) > 23 || Number(match[3]) > 23 || Number(match[2]) > 59 || Number(match[4]) > 59 || start === end) return null;
  return { source: value.trim(), startMinute: start, endMinute: end };
}

export function backupWindowState(window, date = new Date()) {
  if (!window) return { configured: false, withinWindow: true, dayKey: null };
  const minute = date.getHours() * 60 + date.getMinutes();
  const withinWindow = window.startMinute < window.endMinute
    ? minute >= window.startMinute && minute < window.endMinute
    : minute >= window.startMinute || minute < window.endMinute;
  const day = new Date(date);
  if (window.startMinute > window.endMinute && minute < window.endMinute) day.setDate(day.getDate() - 1);
  const dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  return { configured: true, withinWindow, dayKey };
}
