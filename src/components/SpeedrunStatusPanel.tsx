import { Flag, ShieldAlert, Timer, Trophy } from "lucide-react";
import type { GameState, SpeedrunTargetId } from "../game/types";
import { formatSpeedrunDuration, getSpeedrunSummary, SPEEDRUN_TARGETS } from "../game/speedrun";

function progressLabel(targetId: SpeedrunTargetId, current: number, target: number): string {
  if (targetId === "all_technologies") return `${current}/${target} 项`;
  return `${Math.min(current, target).toLocaleString("zh-CN")}/${target.toLocaleString("zh-CN")}`;
}
export function SpeedrunStatusPanel({ game }: { game: GameState }) {
  const summary = getSpeedrunSummary(game);
  if (!summary) return null;
  return (
    <aside className="speedrun-status-panel" aria-label="速通状态">
      <header><span><Flag size={15} />速通工厂</span><strong><Timer size={14} />{formatSpeedrunDuration(summary.elapsedActiveSeconds)}</strong></header>
      <div className="speedrun-status-targets">
        {(Object.keys(SPEEDRUN_TARGETS) as SpeedrunTargetId[]).map((targetId) => {
          const target = SPEEDRUN_TARGETS[targetId];
          const progress = summary.progress[targetId];
          return <article className={progress.completed ? "completed" : ""} key={targetId}>
            <span><strong>{target.label}</strong><small>{progress.completed ? `完成 · ${formatSpeedrunDuration(progress.completedAtSeconds ?? summary.elapsedActiveSeconds)}` : progressLabel(targetId, progress.current, progress.target)}</small></span>
            {progress.completed ? <Trophy size={14} /> : <progress max={Math.max(1, progress.target)} value={Math.min(progress.current, progress.target)} />}
          </article>;
        })}
      </div>
      <footer className={summary.eligible ? "eligible" : "ineligible"}>
        {summary.eligible ? <span>当前具备上榜资格，提交后由服务端验证</span> : <span><ShieldAlert size={14} />不可上榜：{summary.invalidReason ?? "速通数据待验证"}</span>}
      </footer>
    </aside>
  );
}
