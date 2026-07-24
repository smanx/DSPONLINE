import { Clock3, RadioTower } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ITEMS } from "../game/content";
import { activityCountdownLabel, activityOverallProgress, type GalacticActivityPublicStatus } from "../game/galacticActivity";
import type { GameState } from "../game/types";
import { ACTIVITY_MATERIAL_IDS } from "../game/activity";
import { ItemGlyph } from "./ItemReference";
import { QuantityValue } from "./QuantityValue";

export function GalacticActivityPanel({ game, status, compact = false }: { game: GameState; status: GalacticActivityPublicStatus | null; compact?: boolean }) {
  const [tick, setTick] = useState(0);
  const anchorRef = useRef({ status, clientAt: Date.now() });
  if (anchorRef.current.status !== status) anchorRef.current = { status, clientAt: Date.now() };
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  void tick;
  const activity = game.endgame.constructionActivity;
  if (!status?.enabled || !status.personalTargets || !status.globalTargets || !status.globalDelivered) {
    return <section className={`galactic-activity galactic-activity--disabled${compact ? " galactic-activity--compact" : ""}`}>
      <header><span><RadioTower size={16} />宇宙联合空间站巨构建设任务</span><strong>活动未开放</strong></header>
      <p>{status?.reason ?? "等待服务器活动配置。活动贡献只保存在本地存档，不会上传或发放奖励。"}</p>
    </section>;
  }
  const serverNow = status.serverNow + (Date.now() - anchorRef.current.clientAt);
  const personalOverall = activityOverallProgress(activity.personalDelivered, activity.personalTargets);
  const globalOverall = activityOverallProgress(status.globalDelivered, status.globalTargets);
  const pending = Object.values(activity.pendingBatches).reduce((sum, batch) => sum + (batch?.amount ?? 0), 0);
  return <section className={`galactic-activity${compact ? " galactic-activity--compact" : ""}`}>
    <header><span><RadioTower size={16} />宇宙联合空间站巨构建设任务</span><strong><Clock3 size={14} />{activityCountdownLabel(status, serverNow)}</strong></header>
    <div className="galactic-activity__summary">
      <span>个人任务<strong>{Math.floor(personalOverall * 100)}%</strong></span>
      <span>全服模拟<strong>{Math.floor(globalOverall * 100)}%</strong></span>
      <span>本地已记录<strong><QuantityValue value={pending} /></strong></span>
      <span>活动奖励<strong>后续开放</strong></span>
    </div>
    <div className="galactic-activity__materials">
      {ACTIVITY_MATERIAL_IDS.map((itemId) => {
        const personal = activity.personalDelivered[itemId] ?? 0;
        const personalTarget = activity.personalTargets[itemId] || status.personalTargets![itemId];
        const global = status.globalDelivered![itemId];
        const globalTarget = status.globalTargets![itemId];
        return <div key={itemId}>
          <ItemGlyph itemId={itemId} />
          <span><strong>{ITEMS[itemId].name}</strong><small>个人 <QuantityValue value={personal} /> / <QuantityValue value={personalTarget} /></small><small>全服 <QuantityValue value={global} /> / <QuantityValue value={globalTarget} /></small></span>
          <b>{Math.floor(Math.min(1, personal / Math.max(1, personalTarget)) * 100)}%</b>
        </div>;
      })}
    </div>
    <p>{personalOverall >= 1 ? "个人任务已完成，继续交付仍会保留在本地记录中。" : "四项物资全部达到目标后，个人任务才算完成。"} 本版无需登录且不会上传贡献；全服进度按服务器时间模拟，活动奖励将在后续版本开放。</p>
  </section>;
}
