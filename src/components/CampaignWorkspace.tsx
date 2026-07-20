import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Flag,
  FlaskConical,
  Factory,
  LockKeyhole,
  MapPin,
  Orbit,
  PackageCheck,
  Route,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { getConstructionDefinition, getItem } from "../game/content";
import {
  getCampaignNavigationLabel,
  getCampaignSnapshot,
  getCampaignTaskDeficits,
  type CampaignReward,
  type CampaignNavigation,
} from "../game/campaign";
import type { CampaignTaskId, GameState, ItemId } from "../game/types";
import { ItemGlyph, ItemHoverCard } from "./ItemReference";

function formatAmount(value: number): string {
  return Math.floor(value).toLocaleString("zh-CN");
}

function ItemMark({ itemId }: { itemId: ItemId }) {
  return (
    <ItemHoverCard itemId={itemId}>
      <ItemGlyph itemId={itemId} className="item-mark" />
    </ItemHoverCard>
  );
}

function rewardLabel(reward: CampaignReward): string {
  if (reward.constructionId) return `${getConstructionDefinition(reward.constructionId)?.name ?? reward.constructionId} ×${formatAmount(reward.amount)}`;
  if (reward.itemId) return `${getItem(reward.itemId).name} ×${formatAmount(reward.amount)}`;
  return "奖励";
}

function navigationIcon(navigation: CampaignNavigation | undefined) {
  if (!navigation) return <Flag size={13} />;
  if (navigation.kind === "recipe") return <Factory size={13} />;
  if (navigation.kind === "technology") return <FlaskConical size={13} />;
  if (navigation.kind === "planet" || navigation.kind === "system") return <MapPin size={13} />;
  if (navigation.kind === "dyson") return <Orbit size={13} />;
  return <Route size={13} />;
}

export function CampaignWorkspace({
  open,
  game,
  onClose,
  onNavigate,
  onSelectTask,
}: {
  open: boolean;
  game: GameState;
  onClose: () => void;
  onNavigate: (navigation: CampaignNavigation, taskId: CampaignTaskId) => void;
  onSelectTask: (taskId: CampaignTaskId) => void;
}) {
  const snapshot = getCampaignSnapshot(game);
  const [collapsedChapterIds, setCollapsedChapterIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!open || !game.campaign.activeChapterId) return;
    setCollapsedChapterIds((current) => {
      if (!current.has(game.campaign.activeChapterId!)) return current;
      const next = new Set(current);
      next.delete(game.campaign.activeChapterId!);
      return next;
    });
  }, [game.campaign.activeChapterId, open]);
  if (!open) return null;
  const activeChapter = snapshot.chapters.find((chapter) => chapter.id === game.campaign.activeChapterId) ?? snapshot.chapters[0];
  const completion = snapshot.totalCount > 0 ? snapshot.completedCount / snapshot.totalCount * 100 : 0;

  return (
    <section className="campaign-workspace" role="dialog" aria-modal="true" aria-label="主线任务中心">
      <header className="campaign-header">
        <div className="campaign-title">
          <i><Flag size={20} /></i>
          <div><span>星系扩张协议</span><strong>主线任务中心</strong></div>
        </div>
        <div className="campaign-headline">
          <span>章节 <strong>{snapshot.chapters.filter((chapter) => chapter.complete).length}/{snapshot.chapters.length}</strong></span>
          <span>任务 <strong>{snapshot.completedCount}/{snapshot.totalCount}</strong></span>
        </div>
        <button className="campaign-close" type="button" onClick={onClose} title="关闭任务中心" aria-label="关闭任务中心"><X size={18} /></button>
      </header>

      <div className="campaign-progress-overview">
        <div>
          <span>当前章节</span>
          <strong>{activeChapter?.name ?? "全部完成"}</strong>
          <small>{activeChapter?.summary ?? "恒星工程已完成，生产网络可以继续自由扩展。"}</small>
        </div>
        <div className="campaign-progress-meter" role="progressbar" aria-label="主线任务完成度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(completion)}>
          <i><b style={{ width: `${completion}%` }} /></i>
          <span>{Math.round(completion)}% 主线完成</span>
        </div>
        {snapshot.activeTask ? (
          <div className="campaign-now">
            <small>当前目标</small>
            <strong>{snapshot.activeTask.title}</strong>
            <span>{snapshot.activeTask.description}</span>
          </div>
        ) : <div className="campaign-now campaign-now--complete"><Check size={15} /><span>全部主线任务已完成</span></div>}
      </div>

      <div className="campaign-chapter-list">
        {snapshot.chapters.map((chapter, chapterIndex) => (
          <section className={`campaign-chapter${chapter.id === game.campaign.activeChapterId ? " campaign-chapter--active" : ""}${chapter.complete ? " campaign-chapter--complete" : ""}${collapsedChapterIds.has(chapter.id) ? " campaign-chapter--collapsed" : ""}`} key={chapter.id}>
            <button className="campaign-chapter-header" type="button" aria-expanded={!collapsedChapterIds.has(chapter.id)} onClick={() => setCollapsedChapterIds((current) => {
              const next = new Set(current);
              if (next.has(chapter.id)) next.delete(chapter.id);
              else next.add(chapter.id);
              return next;
            })}>
              <div className="campaign-chapter-index">{chapter.complete ? <Check size={15} /> : String(chapterIndex + 1).padStart(2, "0")}</div>
              <div><strong>{chapter.name}</strong><small>{chapter.summary}</small></div>
              <em>{chapter.completedCount}/{chapter.tasks.length}</em>
              <i className="campaign-chapter-chevron">{collapsedChapterIds.has(chapter.id) ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</i>
            </button>
            {!collapsedChapterIds.has(chapter.id) ? <div className="campaign-task-list">
              {chapter.tasks.map((task) => {
                const deficits = getCampaignTaskDeficits(game, task);
                const rewardText = (task.rewards ?? []).map(rewardLabel).join("、");
                return (
                  <article className={`campaign-task campaign-task--${task.status}`} key={task.id}>
                    <button className="campaign-task-select" type="button" onClick={() => onSelectTask(task.id)} disabled={task.status === "locked" || task.status === "complete"}>
                      <i>{task.status === "complete" ? <Check size={14} /> : task.status === "locked" ? <LockKeyhole size={13} /> : task.status === "active" ? <Flag size={13} /> : <span />}</i>
                      <span><strong>{task.title}</strong><small>{task.description}</small></span>
                      <em>{task.track === "main" ? "主线" : "支线"}</em>
                    </button>
                    <div className="campaign-task-detail">
                      <div className="campaign-task-progress">
                        <i><b style={{ width: `${task.progress.target > 0 ? task.progress.current / task.progress.target * 100 : 0}%` }} /></i>
                        <span>{formatAmount(task.progress.current)} / {formatAmount(task.progress.target)}</span>
                      </div>
                      <div className="campaign-task-meta">
                        {task.navigation ? <button className="campaign-route-command" type="button" onClick={() => onNavigate(task.navigation!, task.id)} title={getCampaignNavigationLabel(task.navigation)}>{navigationIcon(task.navigation)}{getCampaignNavigationLabel(task.navigation)}</button> : null}
                        {rewardText ? <span className="campaign-reward"><PackageCheck size={13} />{rewardText}</span> : null}
                      </div>
                      {task.status !== "complete" && deficits.length > 0 ? (
                        <div className="campaign-deficits"><CircleAlert size={12} /><span>缺少</span>{deficits.slice(0, 4).map((deficit) => <span className="campaign-deficit" key={deficit.itemId}><ItemMark itemId={deficit.itemId} />×{formatAmount(deficit.amount)}</span>)}{deficits.length > 4 ? <small>+{deficits.length - 4}</small> : null}</div>
                      ) : task.status === "complete" ? <div className="campaign-complete-label"><Check size={12} />已完成</div> : null}
                    </div>
                  </article>
                );
              })}
            </div> : null}
          </section>
        ))}
      </div>
    </section>
  );
}
