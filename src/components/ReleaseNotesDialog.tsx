import {
  Building2,
  Check,
  Info,
  MessageCircle,
  MousePointerClick,
  Rows3,
  Search,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";

export const RELEASE_NOTES_SEEN_KEY = "dsp-idle-network.release-notes.seen.v1";

export const CURRENT_RELEASE_NOTES = {
  id: "2026-07-21",
  date: "2026年7月21日",
  version: "2026.07.21",
  title: "建造与操作体验更新",
  summary: "本次更新聚焦建造效率、制造导航与画布整理，并补齐交流入口和项目说明。现有游戏存档不会被重置。",
  items: [
    {
      id: "group-expansion",
      title: "已放置设备快速扩建",
      description: "从施工托盘选择同类设备后，可直接点击已放置节点继续增加数量。按住 Ctrl 连点时每次固定 +1；检查器新增“快速增加建筑/采矿机”按钮。",
    },
    {
      id: "sticky-fabrication-search",
      title: "制造目录更易浏览",
      description: "建筑制造与物品手工制造的模式和搜索栏固定在面板顶部，滚动长列表时始终保持可用。",
    },
    {
      id: "compact-construction",
      title: "施工托盘精简模式",
      description: "新增可记忆的两行精简模式，在保留图标、完整名称和制造按钮的同时，一屏展示更多建筑。",
    },
    {
      id: "missing-item-jump",
      title: "缺料直达手工制造",
      description: "建筑制造中的缺失材料文字与图标现在可以点击，并自动切换、搜索和定位对应手工配方。",
    },
    {
      id: "qq-community",
      title: "QQ 交流群入口",
      description: "首页、主菜单设置与游戏内设置均展示 QQ 交流群 1076757280，方便集中反馈问题和建议。",
    },
    {
      id: "project-notice",
      title: "补充项目说明",
      description: "首页新增免费个人作品说明，并推荐玩家在体验本项目之前购买并游玩《戴森球计划》。",
    },
    {
      id: "layout-undo",
      title: "自动整理可撤销",
      description: "自动整理旁新增专用撤销按钮，可恢复最近一次整理前的节点位置，不回退库存、生产进度或游戏时间。",
    },
  ],
} as const;

const RELEASE_NOTE_ICONS: Record<(typeof CURRENT_RELEASE_NOTES.items)[number]["id"], LucideIcon> = {
  "group-expansion": Building2,
  "sticky-fabrication-search": Search,
  "compact-construction": Rows3,
  "missing-item-jump": MousePointerClick,
  "qq-community": MessageCircle,
  "project-notice": Info,
  "layout-undo": Undo2,
};

export function hasSeenCurrentReleaseNotes(): boolean {
  try {
    return window.localStorage.getItem(RELEASE_NOTES_SEEN_KEY) === CURRENT_RELEASE_NOTES.id;
  } catch {
    try { return window.sessionStorage.getItem(RELEASE_NOTES_SEEN_KEY) === CURRENT_RELEASE_NOTES.id; } catch { return false; }
  }
}

export function markCurrentReleaseNotesSeen(): void {
  try {
    window.localStorage.setItem(RELEASE_NOTES_SEEN_KEY, CURRENT_RELEASE_NOTES.id);
  } catch {
    try { window.sessionStorage.setItem(RELEASE_NOTES_SEEN_KEY, CURRENT_RELEASE_NOTES.id); } catch { /* optional preference */ }
  }
}

export function ReleaseNotesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus({ preventScroll: true }));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown, true);
      previousFocusRef.current?.focus({ preventScroll: true });
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="release-notes-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="release-notes-dialog" role="dialog" aria-modal="true" aria-labelledby="release-notes-title">
        <header className="release-notes-header">
          <span className="release-notes-version"><small>VERSION</small><strong>{CURRENT_RELEASE_NOTES.version}</strong></span>
          <div><small>{CURRENT_RELEASE_NOTES.date} · 公开测试版</small><h2 id="release-notes-title">{CURRENT_RELEASE_NOTES.title}</h2></div>
          <button ref={closeButtonRef} type="button" onClick={onClose} title="关闭版本更新记录" aria-label="关闭版本更新记录"><X size={18} /></button>
        </header>
        <p className="release-notes-summary"><Info size={16} /><span>{CURRENT_RELEASE_NOTES.summary}</span></p>
        <div className="release-notes-scroll">
          <ol>
            {CURRENT_RELEASE_NOTES.items.map((item, index) => {
              const Icon = RELEASE_NOTE_ICONS[item.id];
              return (
                <li key={item.id}>
                  <i><Icon size={18} /><em>{String(index + 1).padStart(2, "0")}</em></i>
                  <span><strong>{item.title}</strong><p>{item.description}</p></span>
                </li>
              );
            })}
          </ol>
        </div>
        <footer className="release-notes-footer">
          <span><MessageCircle size={15} /><small>QQ 交流群</small><strong>1076757280</strong></span>
          <button type="button" onClick={onClose}><Check size={16} />我知道了</button>
        </footer>
      </section>
    </div>
  );
}
