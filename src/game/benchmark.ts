import { advanceSimulation } from "./engine";
import { calculateFactoryStatistics } from "./statistics";
import { auditProgressionToWhiteMatrix, type ProgressionAuditReport } from "./progressionAudit";
import type { GameState } from "./types";

export interface DeterminismReport {
  deterministic: boolean;
  simulatedSeconds: number;
  runs: number;
  durationMs: number;
  stateHash: string;
  entityCount: number;
  beltCount: number;
}

export interface SimulationBenchmarkReport extends DeterminismReport {
  steps: number;
  stepsPerSecond: number;
}

export interface IdleStressReport {
  simulatedHours: number;
  durationMs: number;
  completed: boolean;
  integrityPassed: boolean;
  issues: string[];
  entityCount: number;
  beltCount: number;
  totalProduced: number;
}

export interface BalanceAuditReport {
  machineEfficiency: number;
  logisticsEfficiency: number;
  powerEfficiency: number;
  powerMarginKw: number;
  deficitItems: Array<{ itemId: string; deficitPerMinute: number }>;
  blockedEquipment: number;
  recommendations: string[];
}

export interface IdleBalanceCheckpoint {
  hours: number;
  durationMs: number;
  stateHash: string;
  integrityPassed: boolean;
  issues: string[];
  totalProduced: number;
  producedDelta: number;
  producedPerHour: number;
  totalInventory: number;
  machineEfficiency: number;
  logisticsEfficiency: number;
  powerEfficiency: number;
  blockedEquipment: number;
}

export interface OfflineRewardTuning {
  fullFidelitySimulation: boolean;
  plateauDetected: boolean;
  recommendedClaimIntervalHours: number;
  yieldRetention72h: number;
  summary: string;
}

export interface IdleBalanceSuiteReport {
  checkpoints: IdleBalanceCheckpoint[];
  durationMs: number;
  completed: boolean;
  integrityPassed: boolean;
  issues: string[];
  tuning: OfflineRewardTuning;
}

export interface AutomaticPerformanceReport {
  generatedAt: number;
  benchmark: SimulationBenchmarkReport;
  idleStress: IdleStressReport;
  idleSuite: IdleBalanceSuiteReport;
  balance: BalanceAuditReport;
  progression: ProgressionAuditReport;
  recommendedPerformanceMode: boolean;
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function hashGameState(state: GameState): string {
  return hashText(stableSerialize(state));
}

export function runDeterminismCheck(state: GameState, seconds = 30): DeterminismReport {
  const duration = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const startedAt = Date.now();
  const first = advanceSimulation(state, duration);
  const second = advanceSimulation(state, duration);
  const firstHash = hashGameState(first);
  const secondHash = hashGameState(second);
  return {
    deterministic: firstHash === secondHash,
    simulatedSeconds: duration,
    runs: 2,
    durationMs: Math.max(0, Date.now() - startedAt),
    stateHash: firstHash,
    entityCount: first.entities.length,
    beltCount: first.belts.length,
  };
}

export function runSimulationBenchmark(state: GameState, seconds = 60, steps = 60): SimulationBenchmarkReport {
  const duration = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const stepCount = Math.max(1, Math.floor(Number.isFinite(steps) ? steps : 1));
  const stepSeconds = duration / stepCount;
  const startedAt = Date.now();
  let current = state;
  for (let index = 0; index < stepCount; index += 1) current = advanceSimulation(current, stepSeconds);
  const durationMs = Math.max(0, Date.now() - startedAt);
  const deterministic = runDeterminismCheck(state, duration);
  return {
    ...deterministic,
    deterministic: deterministic.deterministic,
    durationMs: durationMs + deterministic.durationMs,
    steps: stepCount,
    stepsPerSecond: durationMs > 0 ? stepCount / (durationMs / 1000) : stepCount,
  };
}

function integerRecordIssues(label: string, record: Record<string, number | undefined>, issues: string[]): void {
  for (const [id, amount] of Object.entries(record)) {
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < -0.0001 || !Number.isInteger(amount)) {
      issues.push(`${label}.${id} 不是非负整数`);
      if (issues.length >= 12) return;
    }
  }
}

function stateIntegrityIssues(state: GameState): string[] {
  const issues: string[] = [];
  integerRecordIssues("托盘", state.tray, issues);
  for (const [planetId, tray] of Object.entries(state.planetTrays)) integerRecordIssues(`${planetId}托盘`, tray, issues);
  integerRecordIssues("累计产出", state.totalProduced, issues);
  for (const entity of state.entities) {
    integerRecordIssues(`${entity.id}.输入`, entity.inputs, issues);
    integerRecordIssues(`${entity.id}.输出`, entity.outputs, issues);
    if (!Number.isFinite(entity.progress) || entity.progress < -0.0001 || entity.progress > 1.0001) issues.push(`${entity.id}.生产进度异常`);
    if (!Number.isFinite(entity.utilization) || entity.utilization < -0.0001 || entity.utilization > 1.0001) issues.push(`${entity.id}.设备效率异常`);
    if (issues.length >= 12) break;
  }
  for (const belt of state.belts) {
    if (!Number.isFinite(belt.progress) || belt.progress < -0.0001 || belt.progress > 1.0001 || !Number.isFinite(belt.lastFlow) || belt.lastFlow < -0.0001) {
      issues.push(`${belt.id}.运输状态异常`);
      if (issues.length >= 12) break;
    }
  }
  return issues;
}

export function runLongIdleStressTest(state: GameState, hours = 24): IdleStressReport {
  const simulatedHours = Math.max(1, Math.min(30 * 24, Math.round(Number.isFinite(hours) ? hours : 24)));
  const startedAt = Date.now();
  const result = advanceSimulation(state, simulatedHours * 60 * 60);
  const issues = stateIntegrityIssues(result);
  return {
    simulatedHours,
    durationMs: Math.max(0, Date.now() - startedAt),
    completed: result.elapsedSeconds >= state.elapsedSeconds + simulatedHours * 60 * 60 - 0.01,
    integrityPassed: issues.length === 0,
    issues,
    entityCount: result.entities.length,
    beltCount: result.belts.length,
    totalProduced: Object.values(result.totalProduced).reduce((sum, amount) => sum + Math.max(0, Math.floor(amount ?? 0)), 0),
  };
}

function totalProduced(state: GameState): number {
  return Object.values(state.totalProduced).reduce((sum, amount) => sum + Math.max(0, Math.floor(amount ?? 0)), 0);
}

function totalInventory(state: GameState): number {
  const records = [state.tray, ...Object.values(state.planetTrays), ...state.entities.flatMap((entity) => [entity.inputs, entity.outputs])];
  return records.reduce((sum, record) => sum + Object.values(record).reduce((recordSum, amount) => recordSum + Math.max(0, Math.floor(amount ?? 0)), 0), 0);
}

export function runIdleBalanceSuite(state: GameState, requestedHours: readonly number[] = [2, 8, 24, 72]): IdleBalanceSuiteReport {
  const hours = [...new Set(requestedHours.map((value) => Math.max(1, Math.min(30 * 24, Math.round(value)))))].sort((left, right) => left - right);
  const startedAt = Date.now();
  const baselineProduced = totalProduced(state);
  let current = state;
  let previousHour = 0;
  let previousProduced = baselineProduced;
  const checkpoints: IdleBalanceCheckpoint[] = [];
  for (const hour of hours) {
    const checkpointStartedAt = Date.now();
    current = advanceSimulation(current, (hour - previousHour) * 60 * 60);
    const issues = stateIntegrityIssues(current);
    const balance = auditFactoryBalance(current);
    const produced = totalProduced(current);
    const segmentHours = Math.max(1, hour - previousHour);
    checkpoints.push({
      hours: hour,
      durationMs: Math.max(0, Date.now() - checkpointStartedAt),
      stateHash: hashGameState(current),
      integrityPassed: issues.length === 0,
      issues,
      totalProduced: produced,
      producedDelta: produced - baselineProduced,
      producedPerHour: Math.max(0, (produced - previousProduced) / segmentHours),
      totalInventory: totalInventory(current),
      machineEfficiency: balance.machineEfficiency,
      logisticsEfficiency: balance.logisticsEfficiency,
      powerEfficiency: balance.powerEfficiency,
      blockedEquipment: balance.blockedEquipment,
    });
    previousProduced = produced;
    previousHour = hour;
  }
  const firstYield = checkpoints.find((checkpoint) => checkpoint.producedPerHour > 0)?.producedPerHour ?? 0;
  const finalYield = checkpoints.at(-1)?.producedPerHour ?? 0;
  const yieldRetention72h = firstYield > 0 ? Math.max(0, Math.min(1, finalYield / firstYield)) : 1;
  const plateauDetected = firstYield > 0 && yieldRetention72h < 0.35;
  const stableCheckpoint = [...checkpoints].reverse().find((checkpoint) => checkpoint.integrityPassed && checkpoint.producedPerHour >= firstYield * 0.65);
  const recommendedClaimIntervalHours = stableCheckpoint?.hours ?? checkpoints.find((checkpoint) => checkpoint.producedPerHour > 0)?.hours ?? 24;
  const issues = checkpoints.flatMap((checkpoint) => checkpoint.issues.map((issue) => `${checkpoint.hours}h：${issue}`)).slice(0, 20);
  return {
    checkpoints,
    durationMs: Math.max(0, Date.now() - startedAt),
    completed: checkpoints.length === hours.length && current.elapsedSeconds >= state.elapsedSeconds + (hours.at(-1) ?? 0) * 60 * 60 - 0.01,
    integrityPassed: issues.length === 0,
    issues,
    tuning: {
      fullFidelitySimulation: true,
      plateauDetected,
      recommendedClaimIntervalHours,
      yieldRetention72h,
      summary: plateauDetected
        ? `72 小时边际产出保留 ${Math.round(yieldRetention72h * 100)}%，建议检查缓存上限与长时供料。`
        : `72 小时边际产出保留 ${Math.round(yieldRetention72h * 100)}%，无需额外削减离线收益。`,
    },
  };
}

export function auditFactoryBalance(state: GameState): BalanceAuditReport {
  const statistics = calculateFactoryStatistics(state);
  const sample = state.productionHistory.at(-1);
  const machineEfficiency = sample?.machineEfficiency ?? (state.entities.length > 0
    ? state.entities.filter((entity) => entity.kind === "machine").reduce((sum, entity) => sum + entity.utilization, 0) /
      Math.max(1, state.entities.filter((entity) => entity.kind === "machine").length)
    : 0);
  const logisticsEfficiency = sample?.logisticsEfficiency ?? 0;
  const powerEfficiency = sample?.powerEfficiency ?? (state.metrics.demandKw > 0 ? state.metrics.powerFactor : 1);
  const deficitItems = statistics.items
    .filter((item) => item.netPerMinute < -0.01)
    .sort((left, right) => left.netPerMinute - right.netPerMinute)
    .slice(0, 5)
    .map((item) => ({ itemId: item.itemId, deficitPerMinute: Math.abs(Math.round(item.netPerMinute * 100) / 100) }));
  const recommendations: string[] = [];
  if (powerEfficiency < 0.99) recommendations.push("电网存在供电缺口，先补足发电或储能后再扩产。");
  if (machineEfficiency < 0.45 && statistics.issues.length > 0) recommendations.push("设备有效产能偏低，优先处理缺料、输出堵塞和停机设备。");
  if (logisticsEfficiency > 0.9) recommendations.push("传送带接近满载，建议升级线路、提高堆叠或并行铺设。");
  if (deficitItems.length > 0) recommendations.push(`净消耗最高的是 ${deficitItems.map((item) => item.itemId).join("、")}，应补充上游产能。`);
  if (recommendations.length === 0) recommendations.push("当前产能、电力和物流处于平衡区间，可继续提高目标产量。");
  return {
    machineEfficiency: Math.max(0, Math.min(1, machineEfficiency)),
    logisticsEfficiency: Math.max(0, Math.min(1, logisticsEfficiency)),
    powerEfficiency: Math.max(0, Math.min(1, powerEfficiency)),
    powerMarginKw: Math.round((state.metrics.generationKw - state.metrics.demandKw) * 100) / 100,
    deficitItems,
    blockedEquipment: statistics.issues.length,
    recommendations,
  };
}

export function runAutomaticPerformanceReport(state: GameState): AutomaticPerformanceReport {
  const benchmark = runSimulationBenchmark(state, 60, 60);
  const idleSuite = runIdleBalanceSuite(state);
  const checkpoint24 = idleSuite.checkpoints.find((checkpoint) => checkpoint.hours === 24) ?? idleSuite.checkpoints.at(-1)!;
  const idleStress: IdleStressReport = {
    simulatedHours: checkpoint24.hours,
    durationMs: checkpoint24.durationMs,
    completed: idleSuite.completed,
    integrityPassed: checkpoint24.integrityPassed,
    issues: checkpoint24.issues,
    entityCount: state.entities.length,
    beltCount: state.belts.length,
    totalProduced: checkpoint24.totalProduced,
  };
  const balance = auditFactoryBalance(state);
  const progression = auditProgressionToWhiteMatrix(state);
  const recommendedPerformanceMode = state.entities.length > 240 || state.belts.length > 480 || benchmark.stepsPerSecond < 45 || idleSuite.durationMs > 4_500;
  return {
    generatedAt: Date.now(),
    benchmark,
    idleStress,
    idleSuite,
    balance,
    progression,
    recommendedPerformanceMode,
  };
}
