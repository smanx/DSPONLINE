import { createHash } from "node:crypto";

export const DEFAULT_METRIC_TIME_ZONE = "Asia/Shanghai";
export const ANALYTICS_SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{16,96}$/;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{16,96}$/;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const VALID_CLIENTS = new Set(["desktop-web", "mobile-web", "tablet-web", "pwa", "desktop-app", "unknown"]);
const VALID_SOURCES = new Set(["direct", "search", "social", "community", "referral", "unknown"]);

export const ANALYTICS_EVENT_NAMES = [
  "page_view",
  "game_enter",
  "new_game",
  "continue_game",
  "load_save",
  "import_save",
  "cloud_register",
  "cloud_login",
  "cloud_upload",
  "cloud_download",
  "open_technology",
  "open_recipes",
  "open_statistics",
  "open_star_map",
  "open_campaign",
  "building_place",
  "belt_connect",
  "research_queue",
  "mobile_nav_open",
  "mobile_sheet_open",
  "mobile_sheet_snap",
  "mobile_build_select",
  "mobile_place_success",
  "mobile_place_cancel",
  "mobile_connect_success",
  "mobile_connect_fail",
  "mobile_inspector_expand",
  "mobile_workspace_open",
  "mobile_back_action",
  "milestone_red_matrix",
  "milestone_oil_chain",
  "milestone_yellow_matrix",
  "milestone_interstellar",
  "milestone_dyson_swarm",
  "milestone_universe_matrix",
  "perf_load_lt_1500",
  "perf_load_1500_3000",
  "perf_load_3000_8000",
  "perf_load_gte_8000",
  "perf_lcp_lt_2500",
  "perf_lcp_2500_4000",
  "perf_lcp_gte_4000",
  "perf_transfer_lt_1mb",
  "perf_transfer_1_3mb",
  "perf_transfer_gte_3mb",
];

const VALID_EVENTS = new Set(ANALYTICS_EVENT_NAMES);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function nonNegativeInteger(value, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(0, Math.floor(value))) : 0;
}

function counterMap(value, allowedValues) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, count]) => (
    (!allowedValues || allowedValues.has(key)) && Number.isFinite(count) && count >= 0
      ? [[key, nonNegativeInteger(count)]]
      : []
  )));
}

function normalizeDailyRecord(record) {
  const source = record && typeof record === "object" ? record : {};
  return {
    uniqueVisitors: nonNegativeInteger(source.uniqueVisitors),
    sessions: nonNegativeInteger(source.sessions),
    pageViews: nonNegativeInteger(source.pageViews),
    gameStarts: nonNegativeInteger(source.gameStarts),
    activeSeconds: nonNegativeInteger(source.activeSeconds),
    events: counterMap(source.events, VALID_EVENTS),
    clients: counterMap(source.clients, VALID_CLIENTS),
    sources: counterMap(source.sources, VALID_SOURCES),
  };
}

function normalizeIdentityRecords(value, type) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).flatMap(([hash, record]) => {
    if (!HASH_PATTERN.test(hash) || !record || typeof record !== "object") return [];
    const firstSeenAt = nonNegativeInteger(record.firstSeenAt);
    const lastSeenAt = Math.max(firstSeenAt, nonNegativeInteger(record.lastSeenAt));
    const lastActiveDay = typeof record.lastActiveDay === "string" && DAY_PATTERN.test(record.lastActiveDay)
      ? record.lastActiveDay
      : metricDay(lastSeenAt);
    if (type === "visitor") return [[hash, { firstSeenAt, lastSeenAt, lastActiveDay }]];
    if (!HASH_PATTERN.test(record.visitorHash)) return [];
    return [[hash, {
      visitorHash: record.visitorHash,
      firstSeenAt,
      lastSeenAt,
      lastActiveDay,
      lastSequence: nonNegativeInteger(record.lastSequence),
      client: VALID_CLIENTS.has(record.client) ? record.client : "unknown",
      source: VALID_SOURCES.has(record.source) ? record.source : "unknown",
    }]];
  }));
}

export function metricDay(now = Date.now(), timeZone = DEFAULT_METRIC_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function normalizeAnalyticsState(value) {
  const source = value && typeof value === "object" ? value : {};
  const daily = source.daily && typeof source.daily === "object"
    ? Object.fromEntries(Object.entries(source.daily).flatMap(([day, record]) => DAY_PATTERN.test(day) ? [[day, normalizeDailyRecord(record)]] : []))
    : {};
  return {
    visitors: normalizeIdentityRecords(source.visitors, "visitor"),
    sessions: normalizeIdentityRecords(source.sessions, "session"),
    daily,
  };
}

function normalizeEvents(value) {
  if (!Array.isArray(value) || value.length > 32) return null;
  const events = {};
  let total = 0;
  for (const event of value) {
    if (!event || typeof event !== "object" || !VALID_EVENTS.has(event.name)) return null;
    const count = nonNegativeInteger(event.count, 100);
    if (count < 1) return null;
    total += count;
    if (total > 1000) return null;
    events[event.name] = (events[event.name] ?? 0) + count;
  }
  return events;
}

export function recordAnalyticsBatch(analytics, value, {
  now = Date.now(),
  timeZone = DEFAULT_METRIC_TIME_ZONE,
  sessionRetentionMs = ANALYTICS_SESSION_RETENTION_MS,
} = {}) {
  const source = value && typeof value === "object" ? value : {};
  if (typeof source.playerId !== "string" || !PLAYER_ID_PATTERN.test(source.playerId) ||
      typeof source.sessionId !== "string" || !SESSION_ID_PATTERN.test(source.sessionId) ||
      !Number.isInteger(source.sequence) || source.sequence < 1 || source.sequence > 1_000_000_000) {
    return { ok: false, error: "匿名访问标识、会话或序列号格式无效" };
  }
  const events = normalizeEvents(source.events);
  const activeSeconds = nonNegativeInteger(source.activeSeconds, 300);
  if (!events || (Object.keys(events).length === 0 && activeSeconds === 0)) {
    return { ok: false, error: "统计事件格式无效或为空" };
  }

  const client = VALID_CLIENTS.has(source.client) ? source.client : "unknown";
  const sourceKind = VALID_SOURCES.has(source.source) ? source.source : "unknown";
  const visitorHash = sha256(`analytics-visitor:${source.playerId}`);
  const sessionHash = sha256(`analytics-session:${source.playerId}:${source.sessionId}`);
  const day = metricDay(now, timeZone);
  const existingSession = analytics.sessions[sessionHash];
  if (existingSession && source.sequence <= existingSession.lastSequence) {
    return { ok: true, duplicate: true, day };
  }

  const daily = analytics.daily[day] ?? normalizeDailyRecord(null);
  const existingVisitor = analytics.visitors[visitorHash];
  if (!existingVisitor) {
    analytics.visitors[visitorHash] = { firstSeenAt: now, lastSeenAt: now, lastActiveDay: day };
    daily.uniqueVisitors += 1;
  } else {
    existingVisitor.lastSeenAt = now;
    if (existingVisitor.lastActiveDay !== day) {
      existingVisitor.lastActiveDay = day;
      daily.uniqueVisitors += 1;
    }
  }

  if (!existingSession || existingSession.lastActiveDay !== day) {
    daily.sessions += 1;
    daily.clients[client] = (daily.clients[client] ?? 0) + 1;
    daily.sources[sourceKind] = (daily.sources[sourceKind] ?? 0) + 1;
  }
  analytics.sessions[sessionHash] = {
    visitorHash,
    firstSeenAt: existingSession?.firstSeenAt ?? now,
    lastSeenAt: now,
    lastActiveDay: day,
    lastSequence: source.sequence,
    client: existingSession?.client ?? client,
    source: existingSession?.source ?? sourceKind,
  };

  for (const [name, count] of Object.entries(events)) {
    daily.events[name] = (daily.events[name] ?? 0) + count;
  }
  daily.pageViews += events.page_view ?? 0;
  daily.gameStarts += events.game_enter ?? 0;
  daily.activeSeconds += activeSeconds;
  analytics.daily[day] = daily;

  const cutoff = now - Math.max(60_000, sessionRetentionMs);
  for (const [hash, session] of Object.entries(analytics.sessions)) {
    if (session.lastSeenAt < cutoff) delete analytics.sessions[hash];
  }

  return { ok: true, duplicate: false, day };
}

function sumDaily(records) {
  const summary = { uniqueVisitors: 0, sessions: 0, pageViews: 0, gameStarts: 0, activeSeconds: 0 };
  for (const record of records) {
    for (const key of Object.keys(summary)) summary[key] += record[key] ?? 0;
  }
  return summary;
}

function performanceSummary(events) {
  const pageLoad = {
    fast: events.perf_load_lt_1500 ?? 0,
    acceptable: events.perf_load_1500_3000 ?? 0,
    slow: events.perf_load_3000_8000 ?? 0,
    verySlow: events.perf_load_gte_8000 ?? 0,
  };
  const lcp = {
    good: events.perf_lcp_lt_2500 ?? 0,
    needsImprovement: events.perf_lcp_2500_4000 ?? 0,
    poor: events.perf_lcp_gte_4000 ?? 0,
  };
  const transfer = {
    light: events.perf_transfer_lt_1mb ?? 0,
    medium: events.perf_transfer_1_3mb ?? 0,
    heavy: events.perf_transfer_gte_3mb ?? 0,
  };
  const percentileBand = (buckets, labels, percentile = 0.75) => {
    const total = buckets.reduce((sum, count) => sum + count, 0);
    if (total === 0) return "暂无样本";
    const target = total * percentile;
    let cumulative = 0;
    for (let index = 0; index < buckets.length; index += 1) {
      cumulative += buckets[index];
      if (cumulative >= target) return labels[index];
    }
    return labels.at(-1);
  };
  return {
    pageLoad: {
      ...pageLoad,
      samples: Object.values(pageLoad).reduce((sum, count) => sum + count, 0),
      p75Band: percentileBand(Object.values(pageLoad), ["<1.5 秒", "1.5-3 秒", "3-8 秒", ">=8 秒"]),
    },
    lcp: {
      ...lcp,
      samples: Object.values(lcp).reduce((sum, count) => sum + count, 0),
      p75Band: percentileBand(Object.values(lcp), ["<2.5 秒", "2.5-4 秒", ">=4 秒"]),
    },
    transfer: {
      ...transfer,
      samples: Object.values(transfer).reduce((sum, count) => sum + count, 0),
      p75Band: percentileBand(Object.values(transfer), ["<1 MB", "1-3 MB", ">=3 MB"]),
    },
  };
}

export function analyticsSummary(analytics, {
  now = Date.now(),
  timeZone = DEFAULT_METRIC_TIME_ZONE,
  days = 30,
} = {}) {
  const dayEntries = Object.entries(analytics.daily).sort(([left], [right]) => left.localeCompare(right));
  const rangeEntries = dayEntries.slice(-Math.max(1, Math.min(365, Math.floor(days))));
  const daily = rangeEntries.map(([day, record]) => ({ day, ...normalizeDailyRecord(record) }));
  const events = {};
  for (const record of daily) {
    for (const [name, count] of Object.entries(record.events)) events[name] = (events[name] ?? 0) + count;
  }
  return {
    generatedAt: now,
    timeZone,
    today: metricDay(now, timeZone),
    retainedSessions: Object.keys(analytics.sessions).length,
    totalVisitors: Object.keys(analytics.visitors).length,
    range: { days: Math.max(1, Math.min(365, Math.floor(days))), ...sumDaily(daily) },
    lifetime: sumDaily(dayEntries.map(([, record]) => normalizeDailyRecord(record))),
    events: Object.entries(events).map(([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
    performance: performanceSummary(events),
    daily,
  };
}
