import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Gauge,
  HardDrive,
  Play,
  Rocket,
  ShieldCheck,
  Square,
  Sun,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatQuantityCompact, formatQuantityExact } from "../game/quantityFormat";
import type { PureIdleMacroSummary, PureIdleTerminalSnapshot } from "../game/pureIdleMacro";
import type { SaveGameResult } from "../game/storage";
import type { GameState } from "../game/types";
import type { TimeWarpComputeGovernorState, TimeWarpComputeLimits, TimeWarpThrottleReason } from "../game/timeWarpComputeGovernor";
import { formatPowerKw } from "../game/units";
import "../styles/time-warp-idle.css";

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;
  return hours > 0 ? `${hours}小时 ${minutes}分 ${rest}秒` : `${minutes}分 ${rest}秒`;
}

function signedQuantity(value: number): string {
  const amount = Math.floor(Math.abs(value));
  return `${value >= 0 ? "+" : "-"}${formatQuantityCompact(amount)}`;
}

function signedPower(value: number): string {
  return `${value >= 0 ? "+" : "-"}${formatPowerKw(Math.abs(value))}`;
}

const THROTTLE_REASON_LABELS: Record<TimeWarpThrottleReason, string> = {
  "warming-up": "正在测量设备性能",
  "requested-limit": "已达到请求倍率",
  "power-limit": "受供电上限限制",
  "compute-limit": "受设备计算能力限制",
  "worker-slow": "Worker 单次计算过慢",
  backlog: "模拟积压，正在切换宏观计算",
  "approximation-active": "宏观近似推进中",
  "approximation-fallback": "本切片已安全回退精确计算",
  "worker-unavailable": "Worker 不可用",
};

function stateSnapshot(game: GameState): PureIdleTerminalSnapshot {
  return {
    dysonGenerationKw: Math.max(0, game.dysonSphere.generationKw) + Math.max(0, game.dysonSwarm.generationKw),
    whiteMatrixProduced: Math.max(0, Math.floor(game.totalProduced.universe_matrix ?? 0)),
    rocketsLaunched: Math.max(0, Math.floor(game.dysonSphere.totalRocketsLaunched)),
    sailsAbsorbed: Math.max(0, Math.floor(game.dysonSphere.totalSailsAbsorbed)),
    structurePoints: Math.max(0, Math.floor(game.dysonSphere.structurePoints)),
    shellSails: Math.max(0, Math.floor(game.dysonSphere.shellSails)),
    sailsInOrbit: Math.max(0, Math.floor(game.dysonSwarm.sailsInOrbit)),
    activityDelivered: Object.fromEntries(Object.entries(game.endgame.constructionActivity.personalDelivered)
      .map(([itemId, amount]) => [itemId, Math.max(0, Math.floor(amount ?? 0))])),
  };
}

function projectedSnapshot(summary: PureIdleMacroSummary | null, fallback: PureIdleTerminalSnapshot, elapsed: number): PureIdleTerminalSnapshot {
  if (!summary) return fallback;
  const interpolationWallSeconds = Math.max(0, Math.min(30, elapsed - summary.settledWallSeconds));
  const simulationSeconds = interpolationWallSeconds * Math.max(1, summary.actualMultiplier);
  const project = (value: number, rate: number) => Math.max(0, value + rate * simulationSeconds);
  const activityDelivered: Record<string, number> = { ...summary.current.activityDelivered };
  for (const [itemId, rate] of Object.entries(summary.ratePerSimulationSecond.activityDelivered)) {
    activityDelivered[itemId] = project(activityDelivered[itemId] ?? 0, rate);
  }
  return {
    dysonGenerationKw: project(summary.current.dysonGenerationKw, summary.ratePerSimulationSecond.dysonGenerationKw),
    whiteMatrixProduced: project(summary.current.whiteMatrixProduced, summary.ratePerSimulationSecond.whiteMatrixProduced),
    rocketsLaunched: project(summary.current.rocketsLaunched, summary.ratePerSimulationSecond.rocketsLaunched),
    sailsAbsorbed: project(summary.current.sailsAbsorbed, summary.ratePerSimulationSecond.sailsAbsorbed),
    structurePoints: project(summary.current.structurePoints, summary.ratePerSimulationSecond.structurePoints),
    shellSails: project(summary.current.shellSails, summary.ratePerSimulationSecond.shellSails),
    sailsInOrbit: project(summary.current.sailsInOrbit, summary.ratePerSimulationSecond.sailsInOrbit),
    activityDelivered,
  };
}

function efficiencyLabel(value: number | null): string {
  return value === null ? "未运行" : `${Math.round(value * 100)}%`;
}

function efficiencyTone(value: number | null): string {
  if (value === null) return "idle";
  if (value >= 0.9) return "healthy";
  if (value >= 0.6) return "limited";
  if (value > 0) return "critical";
  return "stopped";
}

export function TimeWarpIdleOverlay({
  game,
  startedAt,
  saveFailure,
  workerActive,
  computeLimits,
  computeState,
  pendingSimulationSeconds,
  macroSummary,
  recoveryStatus,
  onStop,
  continueAvailable,
  onContinueNormally,
}: {
  game: GameState;
  startedAt: number | null;
  saveFailure: SaveGameResult | null;
  workerActive: boolean;
  computeLimits: TimeWarpComputeLimits;
  computeState: TimeWarpComputeGovernorState;
  pendingSimulationSeconds: number;
  macroSummary: PureIdleMacroSummary | null;
  recoveryStatus: string;
  onStop: () => Promise<void>;
  continueAvailable: boolean;
  onContinueNormally: () => Promise<void>;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [stopping, setStopping] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const elapsed = startedAt ? Math.max(0, (now - startedAt) / 1_000) : 0;
  const fallback = useMemo(() => stateSnapshot(game), [game]);
  const projected = projectedSnapshot(macroSummary, fallback, elapsed);
  const baseline = macroSummary?.baseline ?? fallback;
  const modeLabel = macroSummary?.mode === "extreme" ? "终局极限模式" : "稳定宏观模式";
  const phaseLabel = macroSummary
    ? macroSummary.phase === "validating" ? "正在后台校验"
      : macroSummary.phase === "finalizing" ? "正在结算并验证存档"
        : macroSummary.phase === "failed" ? "正在等待安全恢复"
          : "纯挂机运行中"
    : continueAvailable ? "需要恢复普通模拟" : "正在校准产线";
  const nextValidationSeconds = macroSummary?.nextValidationAtWallSeconds == null
    ? null
    : Math.max(0, macroSummary.nextValidationAtWallSeconds - elapsed);
  const activityRows = Object.entries(projected.activityDelivered)
    .filter(([, amount]) => amount > 0)
    .map(([itemId, amount]) => ({ itemId, amount, delta: amount - (baseline.activityDelivered[itemId] ?? 0) }));
  const stop = async () => {
    if (stopping) return;
    setStopping(true);
    try {
      await onStop();
    } finally {
      setStopping(false);
    }
  };
  const continueNormally = async () => {
    if (stopping) return;
    setStopping(true);
    try {
      await onContinueNormally();
    } finally {
      setStopping(false);
    }
  };
  return (
    <div className="time-warp-idle-overlay" role="dialog" aria-modal="true" aria-label="纯挂机">
      <div className="time-warp-idle-panel">
        <header>
          <div className="time-warp-idle-title"><i><Gauge size={22} /></i><span><small>时间扭曲装置 · {modeLabel}</small><strong>{phaseLabel}</strong></span></div>
          <span className="time-warp-idle-lock"><ShieldCheck size={15} />画布已冻结</span>
        </header>
        <p className="time-warp-idle-lead">{continueAvailable
          ? "当前恢复检查点包含需要精确处理的科研。为保护奖励和队列，宏观结果尚未提交；可明确放弃未结算时间后回到普通模拟。"
          : "每 30 秒执行一次库存守恒宏观结算。页面进入后台后保留 5 分钟高倍率宽限，超出部分自动按普通离线规则结算。停止、刷新或 Worker 异常时会从恢复检查点重建，不改变生产规则或存档格式。"}</p>

        <section className="time-warp-idle-metrics" aria-label="运行摘要">
          <div><Gauge size={17} /><span>实际倍率</span><strong>{macroSummary?.actualMultiplier ?? computeLimits.actualMultiplier}x</strong></div>
          <div><Clock3 size={17} /><span>本次挂机</span><strong>{formatDuration(elapsed)}</strong></div>
          <div className={`efficiency-${efficiencyTone(macroSummary?.minimumEfficiency ?? null)}`}><Activity size={17} /><span>关键产线最低效率</span><strong>{efficiencyLabel(macroSummary?.minimumEfficiency ?? null)}</strong><small>{macroSummary?.limitingReason ?? "等待校准"}</small></div>
          <div><HardDrive size={17} /><span>保存与恢复</span><strong className={saveFailure ? "warning" : "ready"}>{saveFailure ? "需要处理" : "检查点正常"}</strong><small>{recoveryStatus}</small></div>
          <div><ShieldCheck size={17} /><span>下次真实校验</span><strong>{macroSummary?.mode === "extreme" ? "仅宏观结算" : nextValidationSeconds === null ? "校准后开始" : formatDuration(nextValidationSeconds)}</strong></div>
        </section>

        <section className="time-warp-idle-output" aria-label="终局产出">
          <header><span>终局产出</span><small>累计值与本次挂机增量</small></header>
          <div className="time-warp-terminal-grid">
            <article><Zap size={19} /><span>戴森总发电功率</span><strong>{formatPowerKw(projected.dysonGenerationKw)}</strong><small>本次 {signedPower(projected.dysonGenerationKw - baseline.dysonGenerationKw)}</small></article>
            <article><Activity size={19} /><span>白矩阵累计上传</span><strong title={formatQuantityExact(projected.whiteMatrixProduced)}>{formatQuantityCompact(projected.whiteMatrixProduced)}</strong><small>本次 {signedQuantity(projected.whiteMatrixProduced - baseline.whiteMatrixProduced)} · {formatQuantityCompact((macroSummary?.ratePerSimulationSecond.whiteMatrixProduced ?? 0) * (macroSummary?.actualMultiplier ?? 1) * 60)}/分钟</small></article>
            <article><Rocket size={19} /><span>小型火箭实际发射</span><strong title={formatQuantityExact(projected.rocketsLaunched)}>{formatQuantityCompact(projected.rocketsLaunched)}</strong><small>本次 {signedQuantity(projected.rocketsLaunched - baseline.rocketsLaunched)}</small></article>
            <article><Sun size={19} /><span>太阳帆吸收</span><strong title={formatQuantityExact(projected.sailsAbsorbed)}>{formatQuantityCompact(projected.sailsAbsorbed)}</strong><small>本次 {signedQuantity(projected.sailsAbsorbed - baseline.sailsAbsorbed)}</small></article>
          </div>
          <div className="time-warp-terminal-secondary">
            <span>戴森结构点<strong>{formatQuantityCompact(projected.structurePoints)}</strong><small>{signedQuantity(projected.structurePoints - baseline.structurePoints)}</small></span>
            <span>当前壳面帆<strong>{formatQuantityCompact(projected.shellSails)}</strong><small>{signedQuantity(projected.shellSails - baseline.shellSails)}</small></span>
            <span>轨道太阳帆<strong>{formatQuantityCompact(projected.sailsInOrbit)}</strong><small>{signedQuantity(projected.sailsInOrbit - baseline.sailsInOrbit)}</small></span>
          </div>
          {activityRows.length > 0 ? <div className="time-warp-activity-output"><strong>巨构活动实际交付</strong>{activityRows.map((row) => <span key={row.itemId}>{row.itemId}<b>{formatQuantityCompact(row.amount)}</b><small>{signedQuantity(row.delta)}</small></span>)}</div> : null}
        </section>

        {macroSummary?.terminalLines.length ? <section className="time-warp-limit-lines" aria-label="产线效率详情">
          <header><span>产线效率</span><small>按启动校准速率比较</small></header>
          {macroSummary.terminalLines.map((line) => <div key={line.id} className={`efficiency-${efficiencyTone(line.efficiency)}`}><span>{line.label}</span><strong>{efficiencyLabel(line.efficiency)}</strong><small>{line.reason} · {formatQuantityCompact(line.sustainableRatePerMinute)}/分钟</small></div>)}
        </section> : null}

        <details className="time-warp-idle-diagnostics">
          <summary>计算诊断</summary>
          <section className="time-warp-idle-status">
            <div><span>请求倍率</span><strong>{game.timeWarp.requestedMultiplier}x</strong></div>
            <div><span>供电上限</span><strong>{computeLimits.powerLimitedMultiplier}x</strong></div>
            <div><span>精确计算能力</span><strong>约 {computeLimits.computeLimitedMultiplier}x</strong></div>
            <div><span>宏观算法</span><strong>{macroSummary?.algorithmVersion ?? "等待初始化"}</strong></div>
            <div><span>已结算墙钟</span><strong>{formatDuration(macroSummary?.settledWallSeconds ?? 0)}</strong></div>
            <div><span>已结算模拟</span><strong>{formatDuration(macroSummary?.settledSimulationSeconds ?? 0)}</strong></div>
            <div><span>合同版本</span><strong>{macroSummary?.contractVersion ?? 0}</strong></div>
            <div><span>影子校验</span><strong>{macroSummary ? `${macroSummary.validationCount} 次 · 失败 ${macroSummary.validationFailures}` : "等待校准"}</strong></div>
            <div><span>边界修正</span><strong>{macroSummary?.boundaryCorrections ?? 0}</strong></div>
            {!macroSummary ? <><div><span>旧调度积压</span><strong>{pendingSimulationSeconds.toFixed(1)} 秒</strong></div><div><span>旧 Worker 状态</span><strong>{workerActive ? "可用" : "不可用"}</strong></div><div><span>旧调度原因</span><strong>{THROTTLE_REASON_LABELS[computeLimits.reason]}</strong></div><div><span>最近耗时</span><strong>{computeState.sampleCount > 0 ? `${Math.round(computeState.recentWorkerDurationMs)} ms` : "测量中"}</strong></div></> : null}
            {macroSummary?.lastValidationReason ? <div><span>最近校验</span><strong>{macroSummary.lastValidationReason}</strong></div> : null}
          </section>
        </details>

        <footer>
          {saveFailure ? <span className="time-warp-idle-warning" role="alert"><AlertTriangle size={15} />本地存档尚未成功写入，恢复日志仍保留。</span> : continueAvailable ? <span className="time-warp-idle-warning" role="alert"><AlertTriangle size={15} />恢复普通模拟不会发放这段未结算时间。</span> : <span><CheckCircle2 size={15} />停止成功并确认主存档后才会清理恢复日志</span>}
          <div className="time-warp-idle-actions">
            {continueAvailable ? <button className="time-warp-idle-continue" type="button" aria-label="放弃未结算并继续普通模拟" disabled={stopping} onClick={() => void continueNormally()}><Play size={16} />{stopping ? "正在恢复普通模拟" : "放弃未结算并继续模拟"}</button> : <button className="time-warp-idle-stop" type="button" aria-label="停止并结算纯挂机" disabled={stopping} onClick={() => void stop()}><Square size={16} />{stopping ? "正在结算并验证" : "停止并结算"}</button>}
          </div>
        </footer>
      </div>
    </div>
  );
}
