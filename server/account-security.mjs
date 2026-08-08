import { createHash } from "node:crypto";

const HASH_PATTERN = /^[a-f0-9]{16}$/;
const SOURCE_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,79}$/;

function hash16(namespace, value) {
  return createHash("sha256").update(`${namespace}:${String(value)}`).digest("hex").slice(0, 16);
}

function boundedTimestamp(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value))) : 0;
}

function normalizedSource(value) {
  if (typeof value !== "string") return null;
  const source = value.trim().toLowerCase();
  return SOURCE_PATTERN.test(source) ? source : null;
}

export function anonymousLoginContext(request, { deviceName = "", deviceId = "" } = {}) {
  const headers = request?.headers ?? {};
  const userAgent = typeof headers["user-agent"] === "string" ? headers["user-agent"].slice(0, 240) : "unknown";
  const region = [headers["cf-ipcountry"], headers["x-country-code"], headers["x-region"]]
    .find((value) => typeof value === "string" && value.trim()) ?? "unknown";
  const normalizedDeviceId = typeof deviceId === "string" && /^[A-Za-z0-9_-]{16,96}$/.test(deviceId) ? deviceId : "unavailable";
  return {
    deviceHash: hash16("login-device", `${normalizedDeviceId}|${String(deviceName).slice(0, 80)}|${userAgent}`),
    regionHash: hash16("login-region", String(region).trim().toUpperCase()),
  };
}

export function normalizeAccountSecurity(value, users) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([userId, record]) => {
    if (!users?.[userId] || !record || typeof record !== "object") return [];
    const recentLogins = Array.isArray(record.recentLogins) ? record.recentLogins.flatMap((entry) => (
      entry && HASH_PATTERN.test(entry.deviceHash) && HASH_PATTERN.test(entry.regionHash) && Number.isFinite(entry.occurredAt)
        ? [{ deviceHash: entry.deviceHash, regionHash: entry.regionHash, occurredAt: boundedTimestamp(entry.occurredAt), clientType: typeof entry.clientType === "string" ? entry.clientType.slice(0, 32) : "unknown" }]
        : []
    )).sort((left, right) => left.occurredAt - right.occurredAt).slice(-20) : [];
    return [[userId, { recentLogins }]];
  }));
}

export function normalizeAccountControls(value, users) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([userId, record]) => {
    if (!users?.[userId] || !record || typeof record !== "object") return [];
    const source = normalizedSource(record.source);
    if (!source) return [];
    const loginDisabledUntil = boundedTimestamp(record.loginDisabledUntil);
    const leaderboardResumeAfterRevision = Number.isInteger(record.leaderboardResumeAfterRevision) && record.leaderboardResumeAfterRevision >= 0
      ? record.leaderboardResumeAfterRevision
      : 0;
    if (loginDisabledUntil <= 0 && leaderboardResumeAfterRevision <= 0) return [];
    return [[userId, {
      source,
      createdAt: boundedTimestamp(record.createdAt),
      ...(loginDisabledUntil > 0 ? { loginDisabledUntil } : {}),
      ...(leaderboardResumeAfterRevision > 0 ? { leaderboardResumeAfterRevision } : {}),
    }]];
  }));
}

export function recordSuccessfulLogin(data, userId, context, { clientType = "unknown", now = Date.now() } = {}) {
  data.accountSecurity ??= {};
  const current = data.accountSecurity[userId] ?? { recentLogins: [] };
  const previous = Array.isArray(current.recentLogins) ? current.recentLogins : [];
  const newDevice = previous.length > 0 && !previous.some((entry) => entry.deviceHash === context.deviceHash);
  const newRegion = previous.length > 0 && !previous.some((entry) => entry.regionHash === context.regionHash);
  current.recentLogins = [...previous, {
    deviceHash: context.deviceHash,
    regionHash: context.regionHash,
    occurredAt: boundedTimestamp(now),
    clientType: String(clientType).slice(0, 32),
  }].slice(-20);
  data.accountSecurity[userId] = current;
  return {
    newDevice,
    newRegion,
    message: newDevice || newRegion
      ? `检测到${newDevice ? "新设备" : ""}${newDevice && newRegion ? "和" : ""}${newRegion ? "新的匿名网络区域" : ""}登录；如非本人操作，请立即修改密码并撤销其他会话`
      : null,
  };
}

export function publicLoginSecurityEvents(data, userId) {
  const events = data?.accountSecurity?.[userId]?.recentLogins ?? [];
  return [...events].sort((left, right) => right.occurredAt - left.occurredAt).slice(0, 20).map((entry) => ({ ...entry }));
}

export function createLoginFailureGuard(nowProvider = Date.now, { maximumFailures = 5, windowMs = 10 * 60_000, lockMs = 10 * 60_000 } = {}) {
  const attempts = new Map();
  const locks = new Map();
  let failures = 0;
  const keyFor = (identifier, network) => hash16("login-failure", `${String(identifier).trim().toLowerCase()}|${network}`);
  const cleanup = (now = nowProvider()) => {
    for (const [key, entry] of attempts) if (entry.resetAt <= now) attempts.delete(key);
    for (const [key, until] of locks) if (until <= now) locks.delete(key);
  };
  return {
    check(identifier, network) {
      const now = nowProvider();
      cleanup(now);
      const key = keyFor(identifier, network);
      const until = locks.get(key) ?? 0;
      return { locked: until > now, retryAfterSeconds: until > now ? Math.max(1, Math.ceil((until - now) / 1000)) : 0 };
    },
    fail(identifier, network) {
      const now = nowProvider();
      cleanup(now);
      const key = keyFor(identifier, network);
      const current = attempts.get(key);
      const next = !current || current.resetAt <= now ? { count: 1, resetAt: now + windowMs } : { ...current, count: current.count + 1 };
      attempts.set(key, next);
      failures += 1;
      if (next.count >= maximumFailures) locks.set(key, now + lockMs);
      return { count: next.count, locked: next.count >= maximumFailures, retryAfterSeconds: next.count >= maximumFailures ? Math.ceil(lockMs / 1000) : 0 };
    },
    success(identifier, network) {
      const key = keyFor(identifier, network);
      attempts.delete(key);
      locks.delete(key);
    },
    cleanup,
    metrics() { return { failures, activeBuckets: attempts.size, activeLocks: locks.size }; },
  };
}

export function loginDisabled(data, userId, now = Date.now()) {
  return Number(data?.accountControls?.[userId]?.loginDisabledUntil ?? 0) > now;
}

export function leaderboardRevalidationRequired(data, userId, revision) {
  const threshold = Number(data?.accountControls?.[userId]?.leaderboardResumeAfterRevision ?? 0);
  return threshold > 0 && (!Number.isInteger(revision) || revision <= threshold);
}

export function clearLeaderboardRevalidationIfSatisfied(data, userId, revision) {
  if (leaderboardRevalidationRequired(data, userId, revision)) return false;
  const control = data?.accountControls?.[userId];
  if (!control?.leaderboardResumeAfterRevision) return false;
  delete control.leaderboardResumeAfterRevision;
  if (!control.loginDisabledUntil) delete data.accountControls[userId];
  return true;
}
