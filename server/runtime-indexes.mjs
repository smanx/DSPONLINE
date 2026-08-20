import { metricDay, DEFAULT_METRIC_TIME_ZONE } from "./analytics.mjs";

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LEADERBOARD_SEPARATOR = "\u0000";
const DEFAULT_LATENCY_BUCKETS_MS = Object.freeze([5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 30_000]);
const SQLITE_ERROR_CATEGORIES = new Set(["capacity", "busy", "read-only", "io", "unknown"]);
const UPLOAD_REJECTION_CATEGORIES = new Set([
  "requestBodyTooLarge",
  "expandedBodyTooLarge",
  "encodingUnsupported",
  "encodingInvalid",
  "requestFormatInvalid",
  "declaredSizeInvalid",
  "expectedRevisionInvalid",
  "operationIdInvalid",
  "saveSizeTooLarge",
  "saveIntegrityInvalid",
  "saveFormatInvalid",
  "saveModeMismatch",
  "busy",
  "inspectionFailed",
  "cancelled",
  "shutdown",
  "other",
]);
const ARCHIVE_OPERATIONS = new Set(["export", "import"]);
const ARCHIVE_STATUSES = new Set(["completed", "cancelled", "failed"]);
const CACHE_INVALIDATION_REASONS = new Set(["submission", "visibility", "restriction", "revalidation", "account", "rebuild", "other"]);

export const DEFAULT_RUNTIME_RETENTION_POLICY = Object.freeze({
  dailyMetricsDays: 400,
  analyticsDailyDays: 400,
  visitorIdentityDays: 180,
  analyticsSessionDays: 30,
  errorRawDays: 30,
  errorSummaryDays: 400,
  errorRawLimit: 1_000,
  ordinaryAuditDays: 180,
  ordinaryAuditLimit: 2_000,
  securityAuditDays: 730,
  securityAuditLimit: 20_000,
});

function nonNegativeFinite(value, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : fallback;
}

function nonNegativeInteger(value, fallback = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(0, Math.floor(value)));
}

function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(1, Math.floor(value)));
}

function safeRatio(numerator, denominator) {
  return denominator > 0 ? Math.round(numerator / denominator * 10_000) / 10_000 : 0;
}

function validTimestamp(value, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function validRecordDay(value, timestamp, timeZone) {
  return typeof value === "string" && DAY_PATTERN.test(value) ? value : metricDay(timestamp, timeZone);
}

class IndexedExpiryHeap {
  constructor() {
    this.nodes = [];
    this.positions = new Map();
  }

  get size() {
    return this.nodes.length;
  }

  clear() {
    this.nodes.length = 0;
    this.positions.clear();
  }

  peek() {
    return this.nodes[0] ?? null;
  }

  set(key, expiresAt) {
    const existingIndex = this.positions.get(key);
    if (existingIndex === undefined) {
      const index = this.nodes.length;
      this.nodes.push({ key, expiresAt });
      this.positions.set(key, index);
      this.#bubbleUp(index);
      return;
    }
    const previous = this.nodes[existingIndex].expiresAt;
    this.nodes[existingIndex].expiresAt = expiresAt;
    if (expiresAt < previous) this.#bubbleUp(existingIndex);
    else if (expiresAt > previous) this.#bubbleDown(existingIndex);
  }

  delete(key) {
    const index = this.positions.get(key);
    if (index === undefined) return false;
    const lastIndex = this.nodes.length - 1;
    this.positions.delete(key);
    if (index === lastIndex) {
      this.nodes.pop();
      return true;
    }
    const replacement = this.nodes.pop();
    this.nodes[index] = replacement;
    this.positions.set(replacement.key, index);
    const parentIndex = Math.floor((index - 1) / 2);
    if (index > 0 && this.#less(index, parentIndex)) this.#bubbleUp(index);
    else this.#bubbleDown(index);
    return true;
  }

  pop() {
    const first = this.peek();
    if (!first) return null;
    this.delete(first.key);
    return first;
  }

  #less(leftIndex, rightIndex) {
    const left = this.nodes[leftIndex];
    const right = this.nodes[rightIndex];
    return left.expiresAt < right.expiresAt || left.expiresAt === right.expiresAt && left.key < right.key;
  }

  #swap(leftIndex, rightIndex) {
    const left = this.nodes[leftIndex];
    this.nodes[leftIndex] = this.nodes[rightIndex];
    this.nodes[rightIndex] = left;
    this.positions.set(this.nodes[leftIndex].key, leftIndex);
    this.positions.set(this.nodes[rightIndex].key, rightIndex);
  }

  #bubbleUp(initialIndex) {
    let index = initialIndex;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!this.#less(index, parent)) break;
      this.#swap(index, parent);
      index = parent;
    }
  }

  #bubbleDown(initialIndex) {
    let index = initialIndex;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < this.nodes.length && this.#less(left, smallest)) smallest = left;
      if (right < this.nodes.length && this.#less(right, smallest)) smallest = right;
      if (smallest === index) break;
      this.#swap(index, smallest);
      index = smallest;
    }
  }
}

/**
 * Incremental index for the existing players map. A heartbeat is O(log n), a
 * metrics read is O(k log n) for the players that expired since the previous
 * read, and a full O(n) scan occurs only during an explicit cold rebuild.
 */
export class PresenceIndex {
  constructor({
    onlineWindowMs = 120_000,
    timeZone = DEFAULT_METRIC_TIME_ZONE,
  } = {}) {
    this.onlineWindowMs = positiveInteger(onlineWindowMs, 120_000);
    this.timeZone = timeZone;
    // Validate the time zone before any records are accepted.
    metricDay(Date.now(), this.timeZone);
    this.records = new Map();
    this.dayCounts = new Map();
    this.expirations = new IndexedExpiryHeap();
    this.counters = {
      rebuilds: 0,
      rebuildRecordsVisited: 0,
      heartbeats: 0,
      created: 0,
      dailyUniqueIncrements: 0,
      expired: 0,
    };
  }

  rebuild(players, now = Date.now()) {
    const effectiveNow = validTimestamp(now);
    this.records.clear();
    this.dayCounts.clear();
    this.expirations.clear();
    let visited = 0;
    for (const [playerKey, rawRecord] of Object.entries(players && typeof players === "object" ? players : {})) {
      visited += 1;
      if (!rawRecord || typeof rawRecord !== "object") continue;
      const firstSeenAt = validTimestamp(rawRecord.firstSeenAt);
      const lastSeenAt = Math.max(firstSeenAt, validTimestamp(rawRecord.lastSeenAt, firstSeenAt));
      const lastActiveDay = validRecordDay(rawRecord.lastActiveDay, lastSeenAt, this.timeZone);
      const record = { firstSeenAt, lastSeenAt, lastActiveDay };
      this.records.set(playerKey, record);
      this.dayCounts.set(lastActiveDay, (this.dayCounts.get(lastActiveDay) ?? 0) + 1);
      if (lastSeenAt >= effectiveNow - this.onlineWindowMs) {
        this.expirations.set(playerKey, lastSeenAt + this.onlineWindowMs);
      }
    }
    this.counters.rebuilds += 1;
    this.counters.rebuildRecordsVisited += visited;
    this.#expire(effectiveNow);
    return this.metrics(effectiveNow);
  }

  heartbeat(playerKey, now = Date.now()) {
    if (typeof playerKey !== "string" || playerKey.length === 0) throw new TypeError("playerKey is required");
    const requestedNow = validTimestamp(now);
    this.#expire(requestedNow);
    const previous = this.records.get(playerKey);
    const effectiveNow = Math.max(requestedNow, previous?.lastSeenAt ?? 0);
    const activeDay = metricDay(effectiveNow, this.timeZone);
    const created = !previous;
    const dayChanged = Boolean(previous && previous.lastActiveDay !== activeDay);
    if (previous && dayChanged) this.#changeDayCount(previous.lastActiveDay, -1);
    if (created || dayChanged) {
      this.#changeDayCount(activeDay, 1);
      this.counters.dailyUniqueIncrements += 1;
    }
    const record = {
      firstSeenAt: previous?.firstSeenAt ?? effectiveNow,
      lastSeenAt: effectiveNow,
      lastActiveDay: activeDay,
    };
    this.records.set(playerKey, record);
    this.expirations.set(playerKey, effectiveNow + this.onlineWindowMs);
    this.counters.heartbeats += 1;
    if (created) this.counters.created += 1;
    return {
      record: { ...record },
      created,
      dayChanged,
      dailyUniqueIncrement: created || dayChanged ? 1 : 0,
      metrics: this.metrics(effectiveNow),
    };
  }

  metrics(now = Date.now()) {
    const effectiveNow = validTimestamp(now);
    this.#expire(effectiveNow);
    const today = metricDay(effectiveNow, this.timeZone);
    return {
      total: this.records.size,
      today: this.dayCounts.get(today) ?? 0,
      online: this.expirations.size,
      onlineWindowSeconds: Math.floor(this.onlineWindowMs / 1_000),
    };
  }

  diagnostics() {
    return {
      records: this.records.size,
      activeExpiryEntries: this.expirations.size,
      trackedDays: this.dayCounts.size,
      ...this.counters,
    };
  }

  #changeDayCount(day, delta) {
    const next = (this.dayCounts.get(day) ?? 0) + delta;
    if (next > 0) this.dayCounts.set(day, next);
    else this.dayCounts.delete(day);
  }

  #expire(now) {
    // Existing public semantics count lastSeenAt === now - window as online.
    while (this.expirations.peek() && this.expirations.peek().expiresAt < now) {
      this.expirations.pop();
      this.counters.expired += 1;
    }
  }
}

function leaderboardCacheKey(category, seasonId) {
  return `${seasonId}${LEADERBOARD_SEPARATOR}${category}`;
}

function defaultNormalizeMetrics(metrics) {
  return metrics && typeof metrics === "object" ? { ...metrics } : {};
}

function defaultCategoryValue(metrics, category) {
  const direct = metrics?.[category];
  return Number.isFinite(direct) ? direct : 0;
}

function freezeLeaderboardEntry(entry) {
  if (entry.metrics && typeof entry.metrics === "object") Object.freeze(entry.metrics);
  return Object.freeze(entry);
}

/**
 * Category/season leaderboard cache. The caller supplies the existing metric
 * normalizer/category accessor so integration preserves the current server's
 * exact scoring contract. Reads never expire snapshots; only explicit writes
 * or account-state changes advance a season generation.
 */
export class LeaderboardSnapshotIndex {
  constructor({
    getAuthoritativeData,
    categories = [],
    normalizeMetrics = defaultNormalizeMetrics,
    categoryValue = defaultCategoryValue,
    isRestricted = () => false,
  } = {}) {
    if (typeof getAuthoritativeData !== "function") throw new TypeError("getAuthoritativeData is required");
    if (typeof normalizeMetrics !== "function" || typeof categoryValue !== "function" || typeof isRestricted !== "function") {
      throw new TypeError("leaderboard adapters must be functions");
    }
    this.getAuthoritativeData = getAuthoritativeData;
    this.categories = new Set(categories);
    this.normalizeMetrics = normalizeMetrics;
    this.categoryValue = categoryValue;
    this.isRestricted = isRestricted;
    this.snapshots = new Map();
    this.seasonGenerations = new Map();
    this.seasonsByUser = new Map();
    this.counters = {
      hits: 0,
      misses: 0,
      snapshotBuilds: 0,
      sortedEntries: 0,
      coldRebuilds: 0,
      authoritativeEntriesVisited: 0,
      invalidations: 0,
      invalidationsByReason: Object.fromEntries([...CACHE_INVALIDATION_REASONS].map((reason) => [reason, 0])),
    };
    this.rebuild();
  }

  rebuild() {
    this.snapshots.clear();
    this.seasonGenerations.clear();
    this.seasonsByUser.clear();
    let visited = 0;
    for (const entry of Object.values(this.#data().submissions ?? {})) {
      visited += 1;
      if (typeof entry?.userId !== "string" || typeof entry?.seasonId !== "string") continue;
      let seasons = this.seasonsByUser.get(entry.userId);
      if (!seasons) {
        seasons = new Set();
        this.seasonsByUser.set(entry.userId, seasons);
      }
      seasons.add(entry.seasonId);
      if (!this.seasonGenerations.has(entry.seasonId)) this.seasonGenerations.set(entry.seasonId, 0);
    }
    this.counters.coldRebuilds += 1;
    this.counters.authoritativeEntriesVisited += visited;
    return { entriesVisited: visited, users: this.seasonsByUser.size, seasons: this.seasonGenerations.size };
  }

  getSnapshot(category, seasonId) {
    this.#validateKey(category, seasonId);
    const key = leaderboardCacheKey(category, seasonId);
    const generation = this.seasonGenerations.get(seasonId) ?? 0;
    const cached = this.snapshots.get(key);
    if (cached?.generation === generation) {
      this.counters.hits += 1;
      return cached.public;
    }
    this.counters.misses += 1;
    const built = this.#buildSnapshot(category, seasonId, generation);
    this.snapshots.set(key, built);
    return built.public;
  }

  getUserEntry(category, seasonId, userId) {
    this.getSnapshot(category, seasonId);
    const cached = this.snapshots.get(leaderboardCacheKey(category, seasonId));
    const rank = cached.rankByUser.get(userId);
    return rank ? { ...cached.entries[rank - 1], rank } : null;
  }

  getUserRank(category, seasonId, userId) {
    this.getSnapshot(category, seasonId);
    return this.snapshots.get(leaderboardCacheKey(category, seasonId)).rankByUser.get(userId) ?? null;
  }

  getPublicPage(category, seasonId, { limit = 100, project } = {}) {
    if (typeof project !== "function") throw new TypeError("a privacy-safe public leaderboard projector is required");
    const snapshot = this.getSnapshot(category, seasonId);
    const safeLimit = Math.min(10_000, nonNegativeInteger(limit, 100));
    return {
      category,
      seasonId,
      totalEntries: snapshot.totalEntries,
      entries: snapshot.entries.slice(0, safeLimit).map((entry, index) => project(entry, index + 1)),
      generation: snapshot.generation,
    };
  }

  markSubmissionChanged({ userId, seasonId }) {
    if (typeof seasonId !== "string" || seasonId.length === 0) throw new TypeError("seasonId is required");
    if (typeof userId === "string" && userId.length > 0) {
      let seasons = this.seasonsByUser.get(userId);
      if (!seasons) {
        seasons = new Set();
        this.seasonsByUser.set(userId, seasons);
      }
      seasons.add(seasonId);
    }
    this.#invalidateSeason(seasonId, "submission");
  }

  markVisibilityChanged(userId) {
    this.#invalidateUser(userId, "visibility");
  }

  markRestrictionChanged(userId) {
    this.#invalidateUser(userId, "restriction");
  }

  markRevalidationChanged(userId) {
    this.#invalidateUser(userId, "revalidation");
  }

  markAccountChanged(userId) {
    this.#invalidateUser(userId, "account");
  }

  metrics() {
    const builtSnapshots = [...this.snapshots.values()].filter((snapshot) => snapshot.generation === (this.seasonGenerations.get(snapshot.seasonId) ?? 0));
    const entries = builtSnapshots.reduce((sum, snapshot) => sum + snapshot.entries.length, 0);
    const reads = this.counters.hits + this.counters.misses;
    return {
      ...this.counters,
      invalidationsByReason: { ...this.counters.invalidationsByReason },
      liveSnapshots: builtSnapshots.length,
      indexedEntries: entries,
      indexedUsers: this.seasonsByUser.size,
      cacheHitRatio: safeRatio(this.counters.hits, reads),
    };
  }

  #data() {
    const value = this.getAuthoritativeData();
    return value && typeof value === "object" ? value : {};
  }

  #validateKey(category, seasonId) {
    if (typeof category !== "string" || category.length === 0 || this.categories.size > 0 && !this.categories.has(category)) {
      throw new TypeError("leaderboard category is invalid");
    }
    if (typeof seasonId !== "string" || seasonId.length === 0) throw new TypeError("leaderboard season is invalid");
  }

  #buildSnapshot(category, seasonId, generation) {
    const data = this.#data();
    const entries = [];
    for (const entry of Object.values(data.submissions ?? {})) {
      this.counters.authoritativeEntriesVisited += 1;
      if (entry?.seasonId !== seasonId || entry.visible === false || typeof entry?.userId !== "string") continue;
      if (data.users?.[entry.userId]?.leaderboardVisible === false || this.isRestricted(data, entry.userId)) continue;
      const metrics = this.normalizeMetrics(entry.metrics);
      const rawValue = this.categoryValue(metrics, category);
      const value = Number.isFinite(rawValue) ? rawValue : 0;
      entries.push(freezeLeaderboardEntry({
        ...entry,
        metrics: metrics && typeof metrics === "object" ? { ...metrics } : {},
        value,
        verified: Boolean(entry.verification?.cloudRevision),
      }));
    }
    entries.sort((left, right) => right.value - left.value || left.userId.localeCompare(right.userId));
    const rankByUser = new Map();
    for (let index = 0; index < entries.length; index += 1) {
      if (!rankByUser.has(entries[index].userId)) rankByUser.set(entries[index].userId, index + 1);
    }
    Object.freeze(entries);
    this.counters.snapshotBuilds += 1;
    this.counters.sortedEntries += entries.length;
    const publicSnapshot = Object.freeze({ category, seasonId, generation, totalEntries: entries.length, entries });
    return { category, seasonId, generation, entries, rankByUser, public: publicSnapshot };
  }

  #invalidateUser(userId, reason) {
    if (typeof userId !== "string" || userId.length === 0) throw new TypeError("userId is required");
    for (const seasonId of this.seasonsByUser.get(userId) ?? []) this.#invalidateSeason(seasonId, reason);
  }

  #invalidateSeason(seasonId, reason) {
    const category = CACHE_INVALIDATION_REASONS.has(reason) ? reason : "other";
    this.seasonGenerations.set(seasonId, (this.seasonGenerations.get(seasonId) ?? 0) + 1);
    this.counters.invalidations += 1;
    this.counters.invalidationsByReason[category] += 1;
  }
}

function dayOrdinal(day) {
  if (typeof day !== "string" || !DAY_PATTERN.test(day)) return null;
  const [year, month, date] = day.split("-").map(Number);
  const timestamp = Date.UTC(year, month - 1, date);
  const parsed = new Date(timestamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== date) return null;
  return Math.floor(timestamp / 86_400_000);
}

function retainedDay(day, currentOrdinal, days) {
  const ordinal = dayOrdinal(day);
  return ordinal !== null && ordinal >= currentOrdinal - days + 1 && ordinal <= currentOrdinal;
}

function normalizeRetentionPolicy(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(Object.entries(DEFAULT_RUNTIME_RETENTION_POLICY).map(([key, fallback]) => [
    key,
    positiveInteger(source[key], fallback, 100_000),
  ]));
}

function retainDayMap(value, currentOrdinal, days) {
  return Object.fromEntries(Object.entries(value && typeof value === "object" ? value : {})
    .filter(([day]) => retainedDay(day, currentOrdinal, days))
    .sort(([left], [right]) => left.localeCompare(right)));
}

function retainIdentityMap(value, cutoff) {
  return Object.fromEntries(Object.entries(value && typeof value === "object" ? value : {})
    .filter(([, record]) => record && typeof record === "object" && validTimestamp(record.lastSeenAt) >= cutoff));
}

function errorKindCategory(value) {
  const kind = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (kind.includes("save")) return "save";
  if (kind.includes("cloud") || kind.includes("upload") || kind.includes("download")) return "cloud";
  if (kind.includes("network") || kind.includes("fetch") || kind.includes("http")) return "network";
  if (kind.includes("worker")) return "worker";
  if (kind.includes("render") || kind.includes("react") || kind.includes("canvas")) return "render";
  if (kind === "client-error" || kind.includes("runtime")) return "runtime";
  return "other";
}

function normalizeErrorSummaries(value, currentOrdinal, days) {
  const summaries = {};
  for (const [day, raw] of Object.entries(value && typeof value === "object" ? value : {})) {
    if (!retainedDay(day, currentOrdinal, days) || !raw || typeof raw !== "object") continue;
    const kinds = {};
    for (const [kind, count] of Object.entries(raw.kinds && typeof raw.kinds === "object" ? raw.kinds : {})) {
      const category = errorKindCategory(kind);
      kinds[category] = (kinds[category] ?? 0) + nonNegativeInteger(count);
    }
    summaries[day] = {
      total: Math.max(nonNegativeInteger(raw.total), Object.values(kinds).reduce((sum, count) => sum + count, 0)),
      kinds,
    };
  }
  return summaries;
}

function addErrorSummary(summaries, day, kind) {
  const summary = summaries[day] ?? { total: 0, kinds: {} };
  summary.total += 1;
  summary.kinds[kind] = (summary.kinds[kind] ?? 0) + 1;
  summaries[day] = summary;
}

export function auditRetentionClass(action) {
  const normalized = typeof action === "string" ? action.trim().toLowerCase() : "";
  if (/^(security\.|auth\.|admin\.)/.test(normalized)) return "security";
  if (/^account\.(register|login|logout|password|email|verification|session|deleted|login_disabled)/.test(normalized)) return "security";
  if (/^leaderboard\.(integrity|restricted|restriction|moderation|review|revalidation)/.test(normalized)) return "security";
  if (/^(backup\.|restore\.|speedrun\.recovery)/.test(normalized)) return "security";
  return "ordinary";
}

function retainAuditClass(entries, { now, days, limit }) {
  const cutoff = now - days * 86_400_000;
  return entries
    .filter(({ entry }) => validTimestamp(entry.occurredAt) >= cutoff)
    .sort((left, right) => validTimestamp(right.entry.occurredAt) - validTimestamp(left.entry.occurredAt) || right.index - left.index)
    .slice(0, limit);
}

/**
 * Pure retention/aggregation plan. It returns replacement collections without
 * mutating the source. Security audits have their own age and count budget and
 * are never removed merely because the ordinary-audit budget is exhausted.
 */
export function applyRuntimeRetentionPolicy(data, {
  now = Date.now(),
  timeZone = DEFAULT_METRIC_TIME_ZONE,
  policy: policyInput = DEFAULT_RUNTIME_RETENTION_POLICY,
  classifyAudit = (entry) => auditRetentionClass(entry?.action),
} = {}) {
  const effectiveNow = validTimestamp(now);
  const today = metricDay(effectiveNow, timeZone);
  const currentOrdinal = dayOrdinal(today);
  const policy = normalizeRetentionPolicy(policyInput);
  const source = data && typeof data === "object" ? data : {};
  const analytics = source.analytics && typeof source.analytics === "object" ? source.analytics : {};
  const dailyMetrics = retainDayMap(source.dailyMetrics, currentOrdinal, policy.dailyMetricsDays);
  const analyticsDaily = retainDayMap(analytics.daily, currentOrdinal, policy.analyticsDailyDays);
  const visitors = retainIdentityMap(analytics.visitors, effectiveNow - policy.visitorIdentityDays * 86_400_000);
  const sessions = retainIdentityMap(analytics.sessions, effectiveNow - policy.analyticsSessionDays * 86_400_000);

  const rawErrorCutoffOrdinal = currentOrdinal - policy.errorRawDays + 1;
  const summaryCutoffOrdinal = currentOrdinal - policy.errorSummaryDays + 1;
  const errorCandidates = (Array.isArray(source.errors) ? source.errors : [])
    .map((entry, index) => ({ entry, index, timestamp: validTimestamp(entry?.receivedAt) }))
    .filter(({ entry }) => entry && typeof entry === "object")
    .sort((left, right) => right.timestamp - left.timestamp || right.index - left.index);
  const retainedErrorIndexes = new Set(errorCandidates
    .filter(({ timestamp }) => {
      const ordinal = dayOrdinal(metricDay(timestamp, timeZone));
      return ordinal !== null && ordinal >= rawErrorCutoffOrdinal && ordinal <= currentOrdinal;
    })
    .slice(0, policy.errorRawLimit)
    .map(({ index }) => index));
  const errors = errorCandidates
    .filter(({ index }) => retainedErrorIndexes.has(index))
    .sort((left, right) => left.index - right.index)
    .map(({ entry }) => entry);
  const errorSummaries = normalizeErrorSummaries(source.errorSummaries, currentOrdinal, policy.errorSummaryDays);
  for (const candidate of errorCandidates) {
    if (retainedErrorIndexes.has(candidate.index)) continue;
    const day = metricDay(candidate.timestamp, timeZone);
    const ordinal = dayOrdinal(day);
    if (ordinal !== null && ordinal >= summaryCutoffOrdinal && ordinal <= currentOrdinal) {
      addErrorSummary(errorSummaries, day, errorKindCategory(candidate.entry.kind));
    }
  }

  const auditEntries = (Array.isArray(source.auditLog) ? source.auditLog : [])
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry && typeof entry === "object");
  const ordinaryCandidates = [];
  const securityCandidates = [];
  for (const candidate of auditEntries) {
    const classification = classifyAudit(candidate.entry) === "security" ? "security" : "ordinary";
    (classification === "security" ? securityCandidates : ordinaryCandidates).push(candidate);
  }
  const ordinaryAudit = retainAuditClass(ordinaryCandidates, {
    now: effectiveNow,
    days: policy.ordinaryAuditDays,
    limit: policy.ordinaryAuditLimit,
  });
  const securityAudit = retainAuditClass(securityCandidates, {
    now: effectiveNow,
    days: policy.securityAuditDays,
    limit: policy.securityAuditLimit,
  });
  const auditLog = [...ordinaryAudit, ...securityAudit]
    .sort((left, right) => validTimestamp(left.entry.occurredAt) - validTimestamp(right.entry.occurredAt) || left.index - right.index)
    .map(({ entry }) => entry);

  const counts = (value) => Object.keys(value && typeof value === "object" ? value : {}).length;
  return {
    retained: {
      dailyMetrics,
      analytics: { ...analytics, visitors, sessions, daily: analyticsDaily },
      errors,
      errorSummaries: Object.fromEntries(Object.entries(errorSummaries).sort(([left], [right]) => left.localeCompare(right))),
      auditLog,
    },
    report: {
      today,
      policy,
      removed: {
        dailyMetrics: counts(source.dailyMetrics) - counts(dailyMetrics),
        analyticsDaily: counts(analytics.daily) - counts(analyticsDaily),
        visitors: counts(analytics.visitors) - counts(visitors),
        sessions: counts(analytics.sessions) - counts(sessions),
        rawErrors: errorCandidates.length - errors.length,
        ordinaryAudit: ordinaryCandidates.length - ordinaryAudit.length,
        securityAudit: securityCandidates.length - securityAudit.length,
      },
      retained: {
        dailyMetrics: counts(dailyMetrics),
        analyticsDaily: counts(analyticsDaily),
        visitors: counts(visitors),
        sessions: counts(sessions),
        rawErrors: errors.length,
        errorSummaryDays: counts(errorSummaries),
        ordinaryAudit: ordinaryAudit.length,
        securityAudit: securityAudit.length,
      },
    },
  };
}

class BoundedHistogram {
  constructor(boundaries = DEFAULT_LATENCY_BUCKETS_MS) {
    this.boundaries = [...boundaries];
    this.counts = new Array(this.boundaries.length + 1).fill(0);
    this.count = 0;
    this.sum = 0;
    this.max = 0;
  }

  observe(value) {
    if (!Number.isFinite(value) || value < 0) return false;
    const numeric = Number(value);
    let index = this.boundaries.findIndex((boundary) => numeric <= boundary);
    if (index < 0) index = this.boundaries.length;
    this.counts[index] += 1;
    this.count += 1;
    this.sum += numeric;
    this.max = Math.max(this.max, numeric);
    return true;
  }

  percentile(fraction) {
    if (this.count === 0) return 0;
    const target = Math.max(1, Math.ceil(this.count * fraction));
    let cumulative = 0;
    for (let index = 0; index < this.counts.length; index += 1) {
      cumulative += this.counts[index];
      if (cumulative >= target) return index < this.boundaries.length ? this.boundaries[index] : this.max;
    }
    return this.max;
  }

  snapshot() {
    return {
      count: this.count,
      average: this.count > 0 ? Math.round(this.sum / this.count * 100) / 100 : 0,
      p50: this.percentile(0.5),
      p95: this.percentile(0.95),
      p99: this.percentile(0.99),
      max: Math.round(this.max * 100) / 100,
      buckets: this.counts.map((count, index) => ({ le: index < this.boundaries.length ? this.boundaries[index] : null, count })),
    };
  }
}

function emptyArchiveMetric() {
  return { started: 0, completed: 0, cancelled: 0, failed: 0, bytes: 0, active: 0, peakActive: 0 };
}

/**
 * Fixed-cardinality, privacy-minimized operational metrics. Unknown object
 * fields, route strings, account identifiers, tokens, checksums, filenames and
 * error messages are never copied into the snapshot.
 */
export class RuntimeMetricsAggregator {
  constructor() {
    this.requestLatency = new BoundedHistogram();
    this.eventLoopDelay = new BoundedHistogram();
    this.sqliteDuration = new BoundedHistogram();
    this.archiveDuration = {
      export: new BoundedHistogram(),
      import: new BoundedHistogram(),
    };
    this.requests = { total: 0, errors: 0, rateLimited: 0, status: { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0, other: 0 } };
    this.memory = {
      samples: 0,
      latest: { rssBytes: 0, heapUsedBytes: 0, heapTotalBytes: 0, externalBytes: 0, arrayBuffersBytes: 0 },
      peak: { rssBytes: 0, heapUsedBytes: 0, heapTotalBytes: 0, externalBytes: 0, arrayBuffersBytes: 0 },
    };
    this.sqlite = { commits: 0, failures: 0, queueDepth: 0, maxQueueDepth: 0, errors: Object.fromEntries([...SQLITE_ERROR_CATEGORIES].map((key) => [key, 0])) };
    this.upload = {
      active: 0,
      queued: 0,
      maxQueued: 0,
      completed: 0,
      cancelled: 0,
      failed: 0,
      rejectedBusy: 0,
      workerRuns: 0,
      inlineRuns: 0,
      maxExpandedBytes: 0,
      maxWorkerHeapBytes: 0,
      rejectionReasons: Object.fromEntries([...UPLOAD_REJECTION_CATEGORIES].map((key) => [key, 0])),
    };
    this.archive = { export: emptyArchiveMetric(), import: emptyArchiveMetric() };
    this.cache = { leaderboard: { hits: 0, misses: 0, snapshotBuilds: 0, invalidations: 0, liveSnapshots: 0, indexedEntries: 0 } };
  }

  observeRequest({ durationMs, statusCode } = {}) {
    this.requestLatency.observe(durationMs);
    this.requests.total += 1;
    const status = Number(statusCode);
    const family = Number.isInteger(status) && status >= 200 && status < 600 ? `${Math.floor(status / 100)}xx` : "other";
    this.requests.status[family] = (this.requests.status[family] ?? 0) + 1;
    if (status >= 500 && status < 600) this.requests.errors += 1;
    if (status === 429) this.requests.rateLimited += 1;
  }

  observeEventLoopDelay(durationMs) {
    this.eventLoopDelay.observe(durationMs);
  }

  sampleMemory(value = {}) {
    const next = {
      rssBytes: nonNegativeInteger(value.rss),
      heapUsedBytes: nonNegativeInteger(value.heapUsed),
      heapTotalBytes: nonNegativeInteger(value.heapTotal),
      externalBytes: nonNegativeInteger(value.external),
      arrayBuffersBytes: nonNegativeInteger(value.arrayBuffers),
    };
    this.memory.samples += 1;
    this.memory.latest = next;
    for (const key of Object.keys(next)) this.memory.peak[key] = Math.max(this.memory.peak[key], next[key]);
  }

  observeSqliteCommit({ durationMs, ok = true, errorCategory = "unknown", queueDepth = 0 } = {}) {
    this.sqliteDuration.observe(durationMs);
    this.sqlite.queueDepth = nonNegativeInteger(queueDepth);
    this.sqlite.maxQueueDepth = Math.max(this.sqlite.maxQueueDepth, this.sqlite.queueDepth);
    if (ok) this.sqlite.commits += 1;
    else {
      this.sqlite.failures += 1;
      const category = SQLITE_ERROR_CATEGORIES.has(errorCategory) ? errorCategory : "unknown";
      this.sqlite.errors[category] += 1;
    }
  }

  observeUploadSnapshot(value = {}) {
    for (const key of [
      "active", "queued", "maxQueued", "completed", "cancelled", "failed", "rejectedBusy",
      "workerRuns", "inlineRuns", "maxExpandedBytes", "maxWorkerHeapBytes",
    ]) this.upload[key] = nonNegativeInteger(value[key], this.upload[key]);
    const rejectionReasons = {};
    for (const [reason, count] of Object.entries(value.rejectionReasons && typeof value.rejectionReasons === "object" ? value.rejectionReasons : {})) {
      const category = UPLOAD_REJECTION_CATEGORIES.has(reason) ? reason : "other";
      rejectionReasons[category] = (rejectionReasons[category] ?? 0) + nonNegativeInteger(count);
    }
    for (const [category, count] of Object.entries(rejectionReasons)) {
      this.upload.rejectionReasons[category] = Math.max(this.upload.rejectionReasons[category], count);
    }
  }

  observeArchiveTask({ operation, status, durationMs = 0, bytes = 0, active = null } = {}) {
    if (!ARCHIVE_OPERATIONS.has(operation) || !ARCHIVE_STATUSES.has(status)) return false;
    const target = this.archive[operation];
    target.started += 1;
    target[status] += 1;
    target.bytes += nonNegativeInteger(bytes);
    if (Number.isFinite(active)) target.active = nonNegativeInteger(active);
    target.peakActive = Math.max(target.peakActive, target.active);
    this.archiveDuration[operation].observe(durationMs);
    return true;
  }

  observeLeaderboardCache(value = {}) {
    for (const key of ["hits", "misses", "snapshotBuilds", "invalidations", "liveSnapshots", "indexedEntries"]) {
      this.cache.leaderboard[key] = nonNegativeInteger(value[key], this.cache.leaderboard[key]);
    }
  }

  snapshot() {
    const cacheReads = this.cache.leaderboard.hits + this.cache.leaderboard.misses;
    return {
      version: 1,
      requests: { ...this.requests, status: { ...this.requests.status }, latencyMs: this.requestLatency.snapshot() },
      eventLoop: { delayMs: this.eventLoopDelay.snapshot() },
      memory: {
        samples: this.memory.samples,
        latest: { ...this.memory.latest },
        peak: { ...this.memory.peak },
      },
      sqlite: {
        ...this.sqlite,
        errors: { ...this.sqlite.errors },
        commitDurationMs: this.sqliteDuration.snapshot(),
      },
      upload: { ...this.upload, rejectionReasons: { ...this.upload.rejectionReasons } },
      archive: Object.fromEntries([...ARCHIVE_OPERATIONS].map((operation) => [operation, {
        ...this.archive[operation],
        durationMs: this.archiveDuration[operation].snapshot(),
      }])),
      cache: {
        leaderboard: {
          ...this.cache.leaderboard,
          hitRatio: safeRatio(this.cache.leaderboard.hits, cacheReads),
        },
      },
    };
  }
}
