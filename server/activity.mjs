import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";

export const ACTIVITY_MATERIAL_IDS = ["universe_matrix", "solar_sail", "small_carrier_rocket", "antimatter_fuel_rod"];
export const ACTIVITY_DURATION_MS = 3 * 24 * 60 * 60 * 1000;

const CURVE = {
  universe_matrix: { completion: 0.82, ending: 1.18 },
  solar_sail: { completion: 0.86, ending: 1.14 },
  small_carrier_rocket: { completion: 0.90, ending: 1.10 },
  antimatter_fuel_rod: { completion: 0.94, ending: 1.06 },
};

function disabled(reason = "活动配置未启用") {
  return { enabled: false, valid: false, reason, revision: null };
}

function exactAmountRecord(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== ACTIVITY_MATERIAL_IDS.length) return null;
  const result = {};
  for (const itemId of ACTIVITY_MATERIAL_IDS) {
    const amount = value[itemId];
    if (!Number.isSafeInteger(amount) || amount <= 0 || (expected != null && amount !== expected)) return null;
    result[itemId] = amount;
  }
  return result;
}

export function normalizeActivityConfig(raw) {
  if (!raw || typeof raw !== "object" || raw.enabled !== true) return disabled();
  if (typeof raw.id !== "string" || !raw.id.trim() || raw.id.length > 120) return disabled("活动 ID 无效");
  const startsAtMs = Date.parse(raw.startsAt);
  const endsAtMs = Date.parse(raw.endsAt);
  if (!Number.isFinite(startsAtMs) || !Number.isFinite(endsAtMs) || endsAtMs - startsAtMs !== ACTIVITY_DURATION_MS) {
    return disabled("活动时间必须精确为 3 天");
  }
  const personalTargets = exactAmountRecord(raw.personalTargets, 1_000_000);
  const globalTargets = exactAmountRecord(raw.globalTargets, null);
  if (!personalTargets || !globalTargets) return disabled("活动四项目标无效");
  const canonical = { id: raw.id.trim(), startsAt: new Date(startsAtMs).toISOString(), endsAt: new Date(endsAtMs).toISOString(), personalTargets, globalTargets };
  return {
    enabled: true,
    valid: true,
    reason: null,
    ...canonical,
    startsAtMs,
    endsAtMs,
    revision: createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 24),
  };
}

export async function loadActivityConfig(file) {
  if (!file) return disabled();
  try {
    return normalizeActivityConfig(JSON.parse(await fs.readFile(file, "utf8")));
  } catch (error) {
    return disabled(error?.code === "ENOENT" ? "活动配置文件不存在" : "活动配置无法读取");
  }
}

function phase(activityId, itemId, offset) {
  const digest = createHash("sha256").update(`${activityId}:${itemId}:${offset}`).digest();
  return digest.readUInt32BE(0) / 0xffffffff * Math.PI * 2;
}

function integratedRate(activityId, itemId, x) {
  const safeX = Math.max(0, Math.min(1, x));
  const phaseA = phase(activityId, itemId, "a");
  const phaseB = phase(activityId, itemId, "b");
  const harmonic = (amplitude, cycles, phaseValue) => amplitude *
    (Math.cos(phaseValue) - Math.cos(2 * Math.PI * cycles * safeX + phaseValue)) / (2 * Math.PI * cycles);
  return safeX + harmonic(0.24, 3, phaseA) + harmonic(0.10, 7, phaseB);
}

export function simulatedActivityProgress(activityId, itemId, normalizedTime) {
  const u = Math.max(0, Math.min(1, normalizedTime));
  const curve = CURVE[itemId];
  if (!curve) return 0;
  const atCompletion = integratedRate(activityId, itemId, curve.completion);
  if (u <= curve.completion) return Math.max(0, Math.min(1, integratedRate(activityId, itemId, u) / atCompletion));
  const atEnd = integratedRate(activityId, itemId, 1);
  const tail = (integratedRate(activityId, itemId, u) - atCompletion) / Math.max(Number.EPSILON, atEnd - atCompletion);
  return 1 + (curve.ending - 1) * Math.max(0, Math.min(1, tail));
}

export function getActivityPublicStatus(config, now = Date.now()) {
  const serverNow = Math.max(0, Math.floor(now));
  if (!config?.enabled || !config.valid) {
    return { enabled: false, status: "disabled", serverNow, reason: config?.reason ?? "活动配置未启用", revision: null };
  }
  const status = serverNow < config.startsAtMs ? "scheduled" : serverNow >= config.endsAtMs ? "ended" : "active";
  const sampleNow = Math.min(config.endsAtMs, Math.max(config.startsAtMs, serverNow));
  const u = (sampleNow - config.startsAtMs) / ACTIVITY_DURATION_MS;
  const globalDelivered = Object.fromEntries(ACTIVITY_MATERIAL_IDS.map((itemId) => [
    itemId,
    Math.floor(config.globalTargets[itemId] * simulatedActivityProgress(config.id, itemId, u)),
  ]));
  return {
    enabled: true,
    status,
    serverNow,
    id: config.id,
    revision: config.revision,
    startsAt: config.startsAt,
    endsAt: config.endsAt,
    startsAtMs: config.startsAtMs,
    endsAtMs: config.endsAtMs,
    personalTargets: { ...config.personalTargets },
    globalTargets: { ...config.globalTargets },
    globalDelivered,
  };
}
