import { TECHNOLOGY_LIST, isDeprecatedTechnology } from "./content";
import type { GameState, SpeedrunMilestone, SpeedrunState, SpeedrunTargetId, TechId } from "./types";

/** The first ruleset is intentionally pinned so new technologies start a new season. */
export const SPEEDRUN_RULESET_VERSION = "speedrun-v1";
export const SPEEDRUN_SEASON_ID = "season_01";
export const SPEEDRUN_TARGET_IDS: readonly SpeedrunTargetId[] = [
  "all_technologies",
  "dyson_rockets_10000",
  "white_matrix_1m",
];
export const SPEEDRUN_TARGETS: Readonly<Record<SpeedrunTargetId, {
  id: SpeedrunTargetId;
  label: string;
  description: string;
  target: number;
  unit: string;
}>> = {
  all_technologies: {
    id: "all_technologies",
    label: "全科技速通",
    description: "完成本规则版本的全部有限科技（不含无限科技）。",
    target: 0,
    unit: "项",
  },
  dyson_rockets_10000: {
    id: "dyson_rockets_10000",
    label: "戴森火箭速通",
    description: "实际成功发射 10,000 枚戴森球小型运载火箭。",
    target: 10_000,
    unit: "枚",
  },
  white_matrix_1m: {
    id: "white_matrix_1m",
    label: "百万白糖速通",
    description: "累计生产 1,000,000 个宇宙矩阵，不是库存或上传量。",
    target: 1_000_000,
    unit: "个",
  },
};

export interface SpeedrunProgress {
  targetId: SpeedrunTargetId;
  current: number;
  target: number;
  completed: boolean;
  completedAtSeconds?: number;
}
function createFactoryId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // Fall through to a non-cryptographic local identity. The server still
    // requires the corresponding cloud-save revision and checksum.
  }
  return `speedrun_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function nonNegativeSafeInteger(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function nonNegativeNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function roundedSeconds(value: number): number {
  return Math.round(Math.max(0, value) * 1_000_000) / 1_000_000;
}

export function getFiniteTechnologyIds(): TechId[] {
  return TECHNOLOGY_LIST
    .filter((technology) => !isDeprecatedTechnology(technology.id))
    .map((technology) => technology.id);
}

function emptyMilestones(): Record<SpeedrunTargetId, SpeedrunMilestone> {
  return {
    all_technologies: { completed: false },
    dyson_rockets_10000: { completed: false },
    white_matrix_1m: { completed: false },
  };
}

export function createSpeedrunState(
  state: Pick<GameState, "research" | "dysonSphere" | "totalProduced">,
  startedAt = Date.now(),
  factoryId = createFactoryId(),
): SpeedrunState {
  const finiteIds = new Set(getFiniteTechnologyIds());
  const completedTechIds = state.research.completedTechIds.filter((id) => finiteIds.has(id));
  const speedrun: SpeedrunState = {
    enabled: true,
    mode: "speedrun",
    rulesetVersion: SPEEDRUN_RULESET_VERSION,
    seasonId: SPEEDRUN_SEASON_ID,
    startedAt: Math.max(0, Math.floor(startedAt)),
    elapsedActiveSeconds: 0,
    baseline: {
      completedTechIds: [...completedTechIds],
      rocketsLaunched: nonNegativeSafeInteger(state.dysonSphere.totalRocketsLaunched),
      whiteMatrixProduced: nonNegativeSafeInteger(state.totalProduced.universe_matrix),
    },
    milestones: emptyMilestones(),
    eligible: true,
    factoryId,
  };
  return evaluateSpeedrunMilestones({ ...state, speedrun } as GameState).speedrun!;
}

/**
 * Normalize untrusted save data without silently turning an ordinary save
 * into a ranked run. Missing factory identity or malformed counters make a
 * run local-only/ineligible while preserving the rest of the data.
 */
export function normalizeSpeedrunState(raw: unknown): SpeedrunState | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!raw || typeof raw !== "object") {
    return {
      enabled: false,
      mode: "speedrun",
      rulesetVersion: SPEEDRUN_RULESET_VERSION,
      seasonId: SPEEDRUN_SEASON_ID,
      startedAt: 0,
      elapsedActiveSeconds: 0,
      baseline: { completedTechIds: [], rocketsLaunched: 0, whiteMatrixProduced: 0 },
      milestones: emptyMilestones(),
      eligible: false,
      invalidReason: "速通字段格式无效，成绩只能作为本地记录",
    };
  }
  const source = raw as Record<string, unknown>;
  const invalid: string[] = [];
  if (source.enabled !== true) invalid.push("速通模式未启用");
  if (source.mode !== "speedrun") invalid.push("速通模式标记无效");
  if (source.rulesetVersion !== SPEEDRUN_RULESET_VERSION) invalid.push("规则版本不受支持");
  if (source.seasonId !== SPEEDRUN_SEASON_ID) invalid.push("速通赛季不受支持");
  const startedAt = nonNegativeSafeInteger(source.startedAt);
  if (startedAt < 1) invalid.push("缺少有效开始时间");
  const elapsedActiveSeconds = nonNegativeNumber(source.elapsedActiveSeconds);
  if (!Number.isSafeInteger(Math.floor(elapsedActiveSeconds))) invalid.push("有效计时超出安全范围");
  const baselineSource = source.baseline && typeof source.baseline === "object" ? source.baseline as Record<string, unknown> : {};
  const finite = new Set(getFiniteTechnologyIds());
  const completedTechIds = Array.isArray(baselineSource.completedTechIds)
    ? [...new Set(baselineSource.completedTechIds.filter((id): id is TechId => typeof id === "string" && finite.has(id as TechId)))]
    : [];
  if (!Array.isArray(baselineSource.completedTechIds)) invalid.push("科技基线格式无效");
  const rocketsLaunched = nonNegativeSafeInteger(baselineSource.rocketsLaunched);
  const whiteMatrixProduced = nonNegativeSafeInteger(baselineSource.whiteMatrixProduced);
  if (baselineSource.rocketsLaunched !== undefined && rocketsLaunched !== baselineSource.rocketsLaunched) invalid.push("火箭基线不是安全整数");
  if (baselineSource.whiteMatrixProduced !== undefined && whiteMatrixProduced !== baselineSource.whiteMatrixProduced) invalid.push("白糖基线不是安全整数");
  const milestones = emptyMilestones();
  const rawMilestones = source.milestones && typeof source.milestones === "object" ? source.milestones as Record<string, unknown> : {};
  for (const targetId of SPEEDRUN_TARGET_IDS) {
    const candidate = rawMilestones[targetId];
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as Record<string, unknown>;
    const completed = record.completed === true;
    const completedAtSeconds = nonNegativeNumber(record.completedAtSeconds);
    milestones[targetId] = {
      completed,
      ...(completed && completedAtSeconds > 0 ? { completedAtSeconds: roundedSeconds(completedAtSeconds) } : {}),
    };
  }
  const factoryId = typeof source.factoryId === "string" && /^[A-Za-z0-9_-]{16,96}$/.test(source.factoryId)
    ? source.factoryId
    : undefined;
  if (!factoryId) invalid.push("缺少速通工厂身份，无法验证成绩");
  const eligible = source.eligible === true && invalid.length === 0;
  return {
    enabled: source.enabled === true,
    mode: "speedrun",
    rulesetVersion: typeof source.rulesetVersion === "string" ? source.rulesetVersion : SPEEDRUN_RULESET_VERSION,
    seasonId: typeof source.seasonId === "string" ? source.seasonId : SPEEDRUN_SEASON_ID,
    startedAt,
    elapsedActiveSeconds: roundedSeconds(elapsedActiveSeconds),
    baseline: { completedTechIds, rocketsLaunched, whiteMatrixProduced },
    milestones,
    eligible,
    ...(eligible ? {} : { invalidReason: invalid.join("；") || "速通数据尚未通过完整性验证" }),
    ...(typeof source.lastValidatedRevision === "string" ? { lastValidatedRevision: source.lastValidatedRevision.slice(0, 160) } : {}),
    ...(factoryId ? { factoryId } : {}),
  };
}

function milestoneFor(speedrun: SpeedrunState, targetId: SpeedrunTargetId): SpeedrunMilestone {
  return speedrun.milestones[targetId] ?? { completed: false };
}

export function getSpeedrunTargetProgress(state: GameState, targetId: SpeedrunTargetId): SpeedrunProgress {
  const speedrun = state.speedrun;
  const baseline = speedrun?.baseline ?? { completedTechIds: [], rocketsLaunched: 0, whiteMatrixProduced: 0 };
  let current = 0;
  let target = SPEEDRUN_TARGETS[targetId].target;
  if (targetId === "all_technologies") {
    const finite = new Set(getFiniteTechnologyIds());
    const baselineIds = new Set(baseline.completedTechIds);
    const completed = new Set(state.research.completedTechIds);
    current = [...completed].filter((id) => finite.has(id) && !baselineIds.has(id)).length;
    target = Math.max(0, getFiniteTechnologyIds().filter((id) => !baselineIds.has(id)).length);
  } else if (targetId === "dyson_rockets_10000") {
    current = Math.max(0, Math.floor(state.dysonSphere.totalRocketsLaunched - baseline.rocketsLaunched));
  } else {
    current = Math.max(0, Math.floor((state.totalProduced.universe_matrix ?? 0) - baseline.whiteMatrixProduced));
  }
  const milestone = speedrun ? milestoneFor(speedrun, targetId) : { completed: false };
  return { targetId, current, target, completed: milestone.completed || current >= target, ...(milestone.completedAtSeconds ? { completedAtSeconds: milestone.completedAtSeconds } : {}) };
}

export function evaluateSpeedrunMilestones(state: GameState): GameState {
  const speedrun = state.speedrun;
  if (!speedrun?.enabled) return state;
  const nextMilestones = { ...speedrun.milestones };
  let changed = false;
  for (const targetId of SPEEDRUN_TARGET_IDS) {
    const current = milestoneFor(speedrun, targetId);
    if (current.completed) continue;
    const progress = getSpeedrunTargetProgress(state, targetId);
    if (!progress.completed) continue;
    nextMilestones[targetId] = { completed: true, completedAtSeconds: roundedSeconds(speedrun.elapsedActiveSeconds) };
    changed = true;
  }
  return changed ? { ...state, speedrun: { ...speedrun, milestones: nextMilestones } } : state;
}

export function advanceSpeedrunClock(state: GameState, wallSeconds: number): GameState {
  const speedrun = state.speedrun;
  if (!speedrun?.enabled || state.paused || !Number.isFinite(wallSeconds) || wallSeconds <= 0) return state;
  const elapsedActiveSeconds = roundedSeconds(speedrun.elapsedActiveSeconds + Math.min(wallSeconds, 30 * 24 * 60 * 60));
  return evaluateSpeedrunMilestones({ ...state, speedrun: { ...speedrun, elapsedActiveSeconds } });
}

export function markSpeedrunIneligible(state: GameState, reason: string): GameState {
  if (!state.speedrun || (!state.speedrun.eligible && state.speedrun.invalidReason === reason)) return state;
  return { ...state, speedrun: { ...state.speedrun, eligible: false, invalidReason: reason.slice(0, 240) } };
}

export function getSpeedrunSummary(state: GameState): {
  enabled: boolean;
  elapsedActiveSeconds: number;
  eligible: boolean;
  invalidReason?: string;
  progress: Record<SpeedrunTargetId, SpeedrunProgress>;
} | null {
  if (!state.speedrun?.enabled) return null;
  return {
    enabled: true,
    elapsedActiveSeconds: state.speedrun.elapsedActiveSeconds,
    eligible: state.speedrun.eligible,
    ...(state.speedrun.invalidReason ? { invalidReason: state.speedrun.invalidReason } : {}),
    progress: Object.fromEntries(SPEEDRUN_TARGET_IDS.map((id) => [id, getSpeedrunTargetProgress(state, id)])) as Record<SpeedrunTargetId, SpeedrunProgress>,
  };
}

export function formatSpeedrunDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const remaining = total % 60;
  return hours > 0
    ? `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${remaining.toString().padStart(2, "0")}`
    : `${minutes.toString().padStart(2, "0")}:${remaining.toString().padStart(2, "0")}`;
}
