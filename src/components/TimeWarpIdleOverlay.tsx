import { CheckCircle2, Clock3, Gauge, HardDrive, Pause, ShieldCheck, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ITEMS } from "../game/content";
import type { GameState, ItemId } from "../game/types";
import type { SaveGameResult } from "../game/storage";
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

export function TimeWarpIdleOverlay({
  game,
  startedAt,
  saveFailure,
  workerActive,
  computeLimits,
  computeState,
  pendingSimulationSeconds,
  onStop,
}: {
  game: GameState;
  startedAt: number | null;
  saveFailure: SaveGameResult | null;
  workerActive: boolean;
  computeLimits: TimeWarpComputeLimits;
  computeState: TimeWarpComputeGovernorState;
  pendingSimulationSeconds: number;
  onStop: () => Promise<void>;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [stopping, setStopping] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const produced = useMemo(() => Object.entries(game.totalProduced)
    .filter((entry): entry is [ItemId, number] => entry[1] != null && entry[1] > 0 && entry[0] in ITEMS)
    .sort((left, right) => (right[1] ?? 0) - (left[1] ?? 0))
    .slice(0, 4), [game.totalProduced]);
  const elapsed = startedAt ? (now - startedAt) / 1_000 : 0;
  const stop = async () => {
    if (stopping) return;
    setStopping(true);
    try {
      await onStop();
    } finally {
      setStopping(false);
    }
  };
  return (
    <div className="time-warp-idle-overlay" role="dialog" aria-modal="true" aria-label="纯挂机">
      <div className="time-warp-idle-panel">
        <header>
          <div className="time-warp-idle-title"><i><Gauge size={22} /></i><span><small>时间扭曲装置</small><strong>纯挂机运行中</strong></span></div>
          <span className="time-warp-idle-lock"><ShieldCheck size={15} />画布已冻结</span>
        </header>
        <p className="time-warp-idle-lead">供电决定实际倍率；设备计算不足时会使用短精确校准与宏观推进。停止时会丢弃未提交切片并校验主存档。</p>
        <section className="time-warp-idle-metrics">
          <div><Gauge size={17} /><span>实际倍率</span><strong>{computeLimits.actualMultiplier}x</strong></div>
          <div><Clock3 size={17} /><span>本次挂机</span><strong>{formatDuration(elapsed)}</strong></div>
          <div><Pause size={17} /><span>模拟积压</span><strong>{pendingSimulationSeconds.toFixed(1)} 秒</strong></div>
          <div><HardDrive size={17} /><span>保存状态</span><strong className={saveFailure ? "warning" : "ready"}>{saveFailure ? "需要导出" : "最近保存正常"}</strong></div>
        </section>
        <section className="time-warp-idle-status">
          <div><span>请求倍率</span><strong>{game.timeWarp.requestedMultiplier}x</strong></div>
          <div><span>供电上限</span><strong>{computeLimits.powerLimitedMultiplier}x</strong></div>
          <div><span>精确计算能力</span><strong>约 {computeLimits.computeLimitedMultiplier}x</strong></div>
          <div><span>获得功率</span><strong>{formatPowerKw(game.timeWarp.allocatedPowerKw)}</strong></div>
          <div><span>Worker 最近耗时</span><strong>{computeState.sampleCount > 0 ? `${Math.round(computeState.recentWorkerDurationMs)} ms` : "测量中"}</strong></div>
          <div><span>计算模式</span><strong>{computeLimits.computeMode === "approximate" ? "短校准 + 宏观推进" : "精确推进"}</strong></div>
          <div><span>计算状态</span><strong>{THROTTLE_REASON_LABELS[computeLimits.reason]}</strong></div>
          <div><span>关键指标尾验</span><strong>{computeState.approximationStatus === "active"
            ? `${(computeState.maxCriticalError * 100).toFixed(2)}% · 修正 ${computeState.boundaryCorrections}`
            : computeState.approximationStatus === "fallback"
              ? "已回退精确切片"
              : "无需近似"}</strong></div>
          {computeState.fallbackReason ? <div><span>精确回退原因</span><strong title={computeState.fallbackReason}>{computeState.fallbackReason}</strong></div> : null}
          <div><span>状态回传</span><strong>{workerActive ? "Worker 分段运行" : "已停止安全计算"}</strong></div>
        </section>
        <section className="time-warp-idle-output" aria-label="关键产量">
          <header><span>关键累计产量</span><small>数字以真实快照为准</small></header>
          {produced.length > 0 ? <div>{produced.map(([itemId, amount]) => <span key={itemId}><i style={{ background: ITEMS[itemId].color }} />{ITEMS[itemId].name}<strong>{Math.floor(amount).toLocaleString("zh-CN")}</strong></span>)}</div> : <p>等待第一批真实产量快照</p>}
        </section>
        <footer>
          {saveFailure ? <span className="time-warp-idle-warning" role="alert">本地存档尚未成功写入，请停止后立即导出。</span> : <span><CheckCircle2 size={15} />挂机期间可安全刷新，恢复时从最后有效存档继续</span>}
          <button className="time-warp-idle-stop" type="button" disabled={stopping} onClick={() => void stop()}><Square size={16} />{stopping ? "正在结算并保存" : "停止挂机"}</button>
        </footer>
      </div>
    </div>
  );
}
