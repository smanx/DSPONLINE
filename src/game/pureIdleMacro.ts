import type { ContentPackRegistry } from "./contentPacks";
import { getEffectiveSimulationMultiplier, hasActiveResearch, refreshDysonGenerationSnapshot } from "./engine";
import {
  applyPureIdleAffineContract,
  createPureIdleAffineCalibration,
  type PureIdleAffineContract,
} from "./offlineApproximation";
import { inspectSave, serializeEnvelope } from "./storage";
import type { GameState, ItemId } from "./types";

export const PURE_IDLE_MACRO_ALGORITHM_VERSION = "pure-idle-macro-v2";
export const PURE_IDLE_MACRO_BUCKET_WALL_SECONDS = 30;
export const PURE_IDLE_MACRO_VALIDATION_WALL_SECONDS = 10 * 60;
export const PURE_IDLE_MACRO_CALIBRATION_SECONDS = 30;

export type PureIdleMacroMode = "stable" | "extreme";
export type PureIdleMacroPhase = "calibrating" | "running" | "validating" | "finalizing" | "failed";

export interface PureIdleTerminalSnapshot {
  dysonGenerationKw: number;
  whiteMatrixProduced: number;
  rocketsLaunched: number;
  sailsAbsorbed: number;
  structurePoints: number;
  shellSails: number;
  sailsInOrbit: number;
  activityDelivered: Record<string, number>;
}

export interface PureIdleRateSnapshot {
  dysonGenerationKw: number;
  whiteMatrixProduced: number;
  rocketsLaunched: number;
  sailsAbsorbed: number;
  structurePoints: number;
  shellSails: number;
  sailsInOrbit: number;
  activityDelivered: Record<string, number>;
}

export interface PureIdleLineStatus {
  id: string;
  label: string;
  itemId?: ItemId;
  calibrationRatePerMinute: number;
  sustainableRatePerMinute: number;
  efficiency: number | null;
  reason: string;
}

export interface PureIdleMacroSummary {
  phase: PureIdleMacroPhase;
  mode: PureIdleMacroMode;
  algorithmVersion: string;
  settledWallSeconds: number;
  settledSimulationSeconds: number;
  actualMultiplier: number;
  calibrationWindowsCompleted: number;
  contractVersion: number;
  validationCount: number;
  validationFailures: number;
  lastValidationDurationMs: number;
  lastValidationDeviation: number;
  lastValidationReason?: string;
  nextValidationAtWallSeconds: number | null;
  boundaryCorrections: number;
  baseline: PureIdleTerminalSnapshot;
  current: PureIdleTerminalSnapshot;
  ratePerSimulationSecond: PureIdleRateSnapshot;
  terminalLines: PureIdleLineStatus[];
  minimumEfficiency: number | null;
  limitingReason: string;
}

export interface PureIdleMacroSession {
  mode: PureIdleMacroMode;
  phase: PureIdleMacroPhase;
  candidate: GameState;
  contract: PureIdleAffineContract;
  baseline: PureIdleTerminalSnapshot;
  calibrationRate: PureIdleRateSnapshot;
  /** Latest measured rate used for interpolation and efficiency display. */
  currentRate: PureIdleRateSnapshot;
  settledWallSeconds: number;
  settledSimulationSeconds: number;
  contractVersion: number;
  validationCount: number;
  validationFailures: number;
  lastValidationDurationMs: number;
  lastValidationDeviation: number;
  lastValidationReason?: string;
  nextValidationAtWallSeconds: number | null;
  boundaryCorrections: number;
  calibrationWindowsCompleted: number;
}

export type PureIdleCandidateValidation =
  | { ok: true; state: GameState; rawBytes: number }
  | { ok: false; failure: string };

function finite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nonNegative(value: unknown): number {
  return Math.max(0, finite(value));
}

export function capturePureIdleTerminalSnapshot(state: GameState): PureIdleTerminalSnapshot {
  const activityDelivered: Record<string, number> = {};
  for (const [itemId, amount] of Object.entries(state.endgame.constructionActivity.personalDelivered)) {
    activityDelivered[itemId] = Math.max(0, Math.floor(finite(amount)));
  }
  return {
    dysonGenerationKw: nonNegative(state.dysonSphere.generationKw) + nonNegative(state.dysonSwarm.generationKw),
    whiteMatrixProduced: Math.max(0, Math.floor(finite(state.totalProduced.universe_matrix))),
    rocketsLaunched: Math.max(0, Math.floor(finite(state.dysonSphere.totalRocketsLaunched))),
    sailsAbsorbed: Math.max(0, Math.floor(finite(state.dysonSphere.totalSailsAbsorbed))),
    structurePoints: Math.max(0, Math.floor(finite(state.dysonSphere.structurePoints))),
    shellSails: Math.max(0, Math.floor(finite(state.dysonSphere.shellSails))),
    sailsInOrbit: Math.max(0, Math.floor(finite(state.dysonSwarm.sailsInOrbit))),
    activityDelivered,
  };
}

function rateBetween(
  start: PureIdleTerminalSnapshot,
  end: PureIdleTerminalSnapshot,
  seconds: number,
): PureIdleRateSnapshot {
  const divisor = Math.max(1e-9, seconds);
  const activityDelivered: Record<string, number> = {};
  const activityIds = new Set([...Object.keys(start.activityDelivered), ...Object.keys(end.activityDelivered)]);
  for (const itemId of activityIds) {
    activityDelivered[itemId] = (finite(end.activityDelivered[itemId]) - finite(start.activityDelivered[itemId])) / divisor;
  }
  return {
    dysonGenerationKw: (end.dysonGenerationKw - start.dysonGenerationKw) / divisor,
    whiteMatrixProduced: (end.whiteMatrixProduced - start.whiteMatrixProduced) / divisor,
    rocketsLaunched: (end.rocketsLaunched - start.rocketsLaunched) / divisor,
    sailsAbsorbed: (end.sailsAbsorbed - start.sailsAbsorbed) / divisor,
    structurePoints: (end.structurePoints - start.structurePoints) / divisor,
    shellSails: (end.shellSails - start.shellSails) / divisor,
    sailsInOrbit: (end.sailsInOrbit - start.sailsInOrbit) / divisor,
    activityDelivered,
  };
}

function cloneRate(rate: PureIdleRateSnapshot): PureIdleRateSnapshot {
  return { ...rate, activityDelivered: { ...rate.activityDelivered } };
}

function relativeDifference(left: number, right: number): number {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) / scale;
}

function maximumRateDeviation(left: PureIdleRateSnapshot, right: PureIdleRateSnapshot): number {
  let maximum = Math.max(
    relativeDifference(left.dysonGenerationKw, right.dysonGenerationKw),
    relativeDifference(left.whiteMatrixProduced, right.whiteMatrixProduced),
    relativeDifference(left.rocketsLaunched, right.rocketsLaunched),
    relativeDifference(left.sailsAbsorbed, right.sailsAbsorbed),
    relativeDifference(left.structurePoints, right.structurePoints),
    relativeDifference(left.shellSails, right.shellSails),
    relativeDifference(left.sailsInOrbit, right.sailsInOrbit),
  );
  const ids = new Set([...Object.keys(left.activityDelivered), ...Object.keys(right.activityDelivered)]);
  for (const id of ids) maximum = Math.max(maximum, relativeDifference(finite(left.activityDelivered[id]), finite(right.activityDelivered[id])));
  return maximum;
}

function line(
  id: string,
  label: string,
  rate: number,
  currentRate: number,
  boundaryCorrections: number,
  itemId?: ItemId,
): PureIdleLineStatus {
  const calibrationRatePerMinute = Math.max(0, rate * 60);
  const sustainableRatePerMinute = Math.max(0, currentRate * 60);
  const efficiency = calibrationRatePerMinute <= 1e-9
    ? null
    : Math.max(0, Math.min(1, sustainableRatePerMinute / calibrationRatePerMinute));
  return {
    id,
    label,
    ...(itemId ? { itemId } : {}),
    calibrationRatePerMinute,
    sustainableRatePerMinute,
    efficiency,
    reason: efficiency === null
      ? "启动校准期间未运行"
      : boundaryCorrections > 0
        ? "库存或容量边界已执行安全修正"
        : efficiency >= 0.9
          ? "供给稳定"
          : "影子校准检测到产线速率下降",
  };
}

function terminalLines(session: PureIdleMacroSession): PureIdleLineStatus[] {
  const currentRate = session.currentRate;
  return [
    line("white-matrix", "白矩阵", session.calibrationRate.whiteMatrixProduced, currentRate.whiteMatrixProduced, session.boundaryCorrections, "universe_matrix"),
    line("dyson-rockets", "小型运载火箭", session.calibrationRate.rocketsLaunched, currentRate.rocketsLaunched, session.boundaryCorrections, "small_carrier_rocket"),
    line("solar-sails", "太阳帆吸收", session.calibrationRate.sailsAbsorbed, currentRate.sailsAbsorbed, session.boundaryCorrections, "solar_sail"),
    line("dyson-structure", "戴森结构点", session.calibrationRate.structurePoints, currentRate.structurePoints, session.boundaryCorrections),
  ];
}

export function summarizePureIdleMacroSession(session: PureIdleMacroSession): PureIdleMacroSummary {
  const lines = terminalLines(session);
  const running = lines.filter((entry): entry is PureIdleLineStatus & { efficiency: number } => entry.efficiency !== null);
  const minimum = running.length > 0 ? Math.min(...running.map((entry) => entry.efficiency)) : null;
  const limiting = minimum === null
    ? "终局产线尚未在校准窗口运行"
    : lines.find((entry) => entry.efficiency === minimum)?.reason ?? "供给稳定";
  return {
    phase: session.phase,
    mode: session.mode,
    algorithmVersion: PURE_IDLE_MACRO_ALGORITHM_VERSION,
    settledWallSeconds: session.settledWallSeconds,
    settledSimulationSeconds: session.settledSimulationSeconds,
    actualMultiplier: getEffectiveSimulationMultiplier(session.candidate),
    calibrationWindowsCompleted: session.calibrationWindowsCompleted,
    contractVersion: session.contractVersion,
    validationCount: session.validationCount,
    validationFailures: session.validationFailures,
    lastValidationDurationMs: session.lastValidationDurationMs,
    lastValidationDeviation: session.lastValidationDeviation,
    ...(session.lastValidationReason ? { lastValidationReason: session.lastValidationReason } : {}),
    nextValidationAtWallSeconds: session.nextValidationAtWallSeconds,
    boundaryCorrections: session.boundaryCorrections,
    baseline: session.baseline,
    current: capturePureIdleTerminalSnapshot(session.candidate),
    ratePerSimulationSecond: session.currentRate,
    terminalLines: lines,
    minimumEfficiency: minimum,
    limitingReason: limiting,
  };
}

function calibrate(state: GameState): {
  contract: PureIdleAffineContract;
  rate: PureIdleRateSnapshot;
} {
  const multiplier = Math.max(1, getEffectiveSimulationMultiplier(state));
  const result = createPureIdleAffineCalibration(state, PURE_IDLE_MACRO_CALIBRATION_SECONDS / multiplier);
  if (!result) throw new Error("30 秒校准没有形成可用的守恒合同");
  refreshDysonGenerationSnapshot(result.calibratedState);
  return {
    contract: result.contract,
    rate: rateBetween(
      capturePureIdleTerminalSnapshot(state),
      capturePureIdleTerminalSnapshot(result.calibratedState),
      PURE_IDLE_MACRO_CALIBRATION_SECONDS,
    ),
  };
}

/** Consumes an isolated Worker-owned state. The main-thread source is never mutated. */
export function createPureIdleMacroSession(state: GameState, mode: PureIdleMacroMode): PureIdleMacroSession {
  if (!state.timeWarp.enabled || state.paused) throw new Error("纯挂机校准要求已启用且未暂停的时间扭曲状态");
  if (state.speedrun?.enabled) throw new Error("速通工厂必须继续使用独立的精确时间规则");
  if (hasActiveResearch(state)) throw new Error("存在进行中的科研，纯挂机宏观模式已安全回退精确模拟");
  if (state.timeWarp.pendingSimulationSeconds > 1e-6 || state.timeWarp.pendingWallSeconds > 1e-6) {
    throw new Error("纯挂机检查点仍包含未提交模拟预算");
  }
  const baseline = capturePureIdleTerminalSnapshot(state);
  const calibrated = calibrate(state);
  return {
    mode,
    phase: "running",
    candidate: state,
    contract: calibrated.contract,
    baseline,
    calibrationRate: cloneRate(calibrated.rate),
    currentRate: cloneRate(calibrated.rate),
    settledWallSeconds: 0,
    settledSimulationSeconds: 0,
    contractVersion: 1,
    validationCount: 0,
    validationFailures: 0,
    lastValidationDurationMs: 0,
    lastValidationDeviation: 0,
    nextValidationAtWallSeconds: mode === "stable" ? PURE_IDLE_MACRO_VALIDATION_WALL_SECONDS : null,
    boundaryCorrections: 0,
    calibrationWindowsCompleted: 3,
  };
}

function runShadowValidation(session: PureIdleMacroSession): void {
  const startedAt = performance.now();
  session.phase = "validating";
  try {
    const next = calibrate(session.candidate);
    const deviation = maximumRateDeviation(session.currentRate, next.rate);
    session.currentRate = next.rate;
    session.lastValidationDeviation = deviation;
    session.validationCount += 1;
    if (deviation >= 0.15) {
      session.contract = next.contract;
      session.contractVersion += 1;
      session.lastValidationReason = deviation >= 0.3
        ? "产线变化超过 30%，未来宏观合同已替换"
        : "产线变化超过 15%，未来宏观合同已校正";
    } else {
      session.lastValidationReason = "产线偏差低于 15%，继续使用当前合同";
    }
  } catch (error) {
    session.validationFailures += 1;
    session.lastValidationReason = error instanceof Error ? error.message : "影子校验失败，继续使用上一份合同";
  } finally {
    session.lastValidationDurationMs = Math.max(0, performance.now() - startedAt);
    session.phase = "running";
  }
}

export function advancePureIdleMacroSession(
  session: PureIdleMacroSession,
  targetWallSeconds: number,
): PureIdleMacroSummary {
  if (!Number.isFinite(targetWallSeconds) || targetWallSeconds < session.settledWallSeconds) {
    throw new Error("纯挂机目标墙钟时间无效或发生倒退");
  }
  if (session.settledWallSeconds + 1e-9 < targetWallSeconds) {
    // Live orchestration calls this at each 30-second boundary. A tab that
    // slept or reloaded can arrive with days of debt; applying one equivalent
    // affine window keeps recovery cost independent of wall-clock duration.
    const wallSeconds = targetWallSeconds - session.settledWallSeconds;
    const multiplier = Math.max(1, getEffectiveSimulationMultiplier(session.candidate));
    const simulationSeconds = wallSeconds * multiplier;
    const applied = applyPureIdleAffineContract(session.candidate, session.contract, simulationSeconds, wallSeconds);
    if (!applied.ok) {
      session.phase = "failed";
      throw new Error(applied.failure ?? "宏观守恒桶未通过安全校验");
    }
    session.boundaryCorrections += applied.boundaryCorrections;
    session.settledWallSeconds += wallSeconds;
    session.settledSimulationSeconds += simulationSeconds;
    refreshDysonGenerationSnapshot(session.candidate);
    if (session.mode === "stable" && session.nextValidationAtWallSeconds !== null &&
      session.settledWallSeconds + 1e-9 >= session.nextValidationAtWallSeconds) {
      const crossedValidations = Math.floor(
        (session.settledWallSeconds - session.nextValidationAtWallSeconds) /
        PURE_IDLE_MACRO_VALIDATION_WALL_SECONDS,
      ) + 1;
      runShadowValidation(session);
      if (crossedValidations > 1) {
        session.lastValidationReason = `${session.lastValidationReason ?? "影子校验已完成"}；休眠期间 ${crossedValidations - 1} 次历史校验已合并`;
      }
      session.nextValidationAtWallSeconds += crossedValidations * PURE_IDLE_MACRO_VALIDATION_WALL_SECONDS;
    }
  }
  return summarizePureIdleMacroSession(session);
}

function rawByteLength(raw: string): number {
  try {
    return new TextEncoder().encode(raw).byteLength;
  } catch {
    return raw.length;
  }
}

export function validatePureIdleCandidate(
  candidate: GameState,
  contentPackRegistry: ContentPackRegistry,
): PureIdleCandidateValidation {
  try {
    const raw = serializeEnvelope(candidate, Date.now(), "primary", undefined, contentPackRegistry);
    const inspection = inspectSave(raw, contentPackRegistry);
    if (!inspection.valid || !inspection.state) {
      return { ok: false, failure: inspection.issues[0] ?? "候选存档无法通过正式重载校验" };
    }
    return { ok: true, state: inspection.state, rawBytes: rawByteLength(raw) };
  } catch (error) {
    return { ok: false, failure: error instanceof Error ? error.message : "候选存档序列化失败" };
  }
}

export function finalizePureIdleMacroSession(
  session: PureIdleMacroSession,
  targetWallSeconds: number,
  contentPackRegistry: ContentPackRegistry,
): { state: GameState; summary: PureIdleMacroSummary; rawBytes: number } {
  advancePureIdleMacroSession(session, targetWallSeconds);
  session.phase = "finalizing";
  session.candidate.timeWarp = {
    ...session.candidate.timeWarp,
    enabled: false,
    pendingSimulationSeconds: 0,
    pendingWallSeconds: 0,
    effectiveMultiplier: session.candidate.settings.simulationSpeed,
    requiredPowerKw: 0,
    allocatedPowerKw: 0,
  };
  const validation = validatePureIdleCandidate(session.candidate, contentPackRegistry);
  if (!validation.ok) {
    session.phase = "failed";
    throw new Error(`纯挂机候选存档未通过重载校验：${validation.failure}`);
  }
  session.candidate = validation.state;
  const summary = summarizePureIdleMacroSession(session);
  return { state: validation.state, summary, rawBytes: validation.rawBytes };
}
