import { ChevronDown, ChevronUp, Flag, ShieldAlert, Timer, Trophy } from "lucide-react";
import { useId, useState } from "react";
import type { GameState, SpeedrunTargetId } from "../game/types";
import { formatSpeedrunDuration, getSpeedrunSummary, SPEEDRUN_TARGETS } from "../game/speedrun";
import { readSpeedrunPanelCollapsedPreference, writeSpeedrunPanelCollapsedPreference } from "../game/uiPreferences";

function progressLabel(targetId: SpeedrunTargetId, current: number, target: number): string {
  if (targetId === "all_technologies") return `${current}/${target} 项`;
  return `${Math.min(current, target).toLocaleString("zh-CN")}/${target.toLocaleString("zh-CN")}`;
}
export function SpeedrunStatusPanel({ game }: { game: GameState }) {
  const summary = getSpeedrunSummary(game);
  const [collapsed, setCollapsed] = useState(readSpeedrunPanelCollapsedPreference);
  const detailsId = useId();
  if (!summary) return null;
  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      writeSpeedrunPanelCollapsedPreference(next);
      return next;
    });
  };
  return (
    <aside className="speedrun-status-panel" data-collapsed={collapsed ? "true" : "false"} aria-label="速通状态">
      <header>
        <span className="speedrun-status-identity">
          <Flag size={15} aria-hidden="true" />
          {!collapsed ? "速通工厂" : <span className="sr-only">速通工厂</span>}
        </span>
        <strong><Timer size={14} aria-hidden="true" />{formatSpeedrunDuration(summary.elapsedActiveSeconds)}</strong>
        <button
          className="speedrun-status-toggle"
          type="button"
          aria-label={collapsed ? "展开速通状态" : "折叠速通状态"}
          aria-expanded={!collapsed}
          aria-controls={detailsId}
          title={collapsed ? "展开速通状态" : "折叠速通状态"}
          onClick={toggleCollapsed}
        >
          {collapsed ? <ChevronDown size={17} aria-hidden="true" /> : <ChevronUp size={17} aria-hidden="true" />}
        </button>
      </header>
      {!collapsed ? <div id={detailsId}>
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
      </div> : null}
    </aside>
  );
}
