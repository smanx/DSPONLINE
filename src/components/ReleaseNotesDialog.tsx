import {
  BookOpen,
  Check,
  Database,
  Factory,
  Gauge,
  Info,
  MessageCircle,
  Orbit,
  Route,
  Smartphone,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";

export const RELEASE_NOTES_SEEN_KEY = "dsp-idle-network.release-notes.seen.v1";

export const CURRENT_RELEASE_NOTES = {
  id: "2026-07-23-v0.6.0",
  date: "2026年7月23日",
  version: "0.6.0",
  title: "新版手机界面与生产资料库更新",
  summary: "本次更新开放可回退的新版手机界面试用，并把配方图鉴扩展为完整生产资料库，同时修复殖民载具、满仓手持载荷、有限资源显示和移动端软键盘等问题。存档格式与玩法进度保持不变。",
  items: [
    {
      id: "mobile-shell-preview",
      title: "新版手机界面试用",
      description: "新增当前行星、供电、暂停和警报顶栏，以及工厂、建造、物资、科研、更多五项底部导航。新版通过独立界面偏好启用，经典手机界面仍可随时回退，不写入游戏或云存档。",
    },
    {
      id: "mobile-factory-workspaces",
      title: "手机工厂与工作区重排",
      description: "建造、物资和设备检查器改为三档抽屉，画布增加显式浏览、放置、连线、多选、布局和区域模式；科技、资料库、统计、星图和蓝图使用列表到详情的移动路由。",
    },
    {
      id: "production-codex",
      title: "生产资料库与建筑图鉴",
      description: "原配方图鉴扩展为物品与配方、建筑设施、物流运输、电力与能源、星球与资源、戴森工程、科研与机制七个分区。建筑功率、缓存、速度、材料、科技和每分钟产量均直接读取当前游戏数据。",
    },
    {
      id: "colonization-fleet",
      title: "殖民前哨识别随身载具",
      description: "殖民普通材料继续从当前行星物资托盘统计，物流运输机和运输船改从全局随身载具栏统计。系统会先验证全部条件再统一扣除，并在星图中分别标明库存来源。",
    },
    {
      id: "cursor-overflow",
      title: "满仓时仍可放下手持物品",
      description: "玩家主动把光标载荷或手提星际载荷放回当前行星时，会完整存入并清空手持状态，即使结果暂时超过单种物资上限；配送枢纽和设备自动入库仍严格遵守上限。",
    },
    {
      id: "finite-resources",
      title: "有限资源储量统一显示",
      description: "矿脉节点、设备检查器和资源统计共用同一储量判定。有限矿脉显示剩余量、初始总量和比例，归零后显示资源已枯竭；只有规则上真实无限的资源才显示无限。",
    },
    {
      id: "mobile-picker-focus",
      title: "手机选择配方不再弹键盘",
      description: "手机打开配方或物流槽物品选择器时只展示目录，不再自动聚焦搜索框；玩家主动点击搜索后才弹出软键盘。桌面端仍保持打开即聚焦。",
    },
    {
      id: "storage-layout",
      title: "小型储物仓文字与端口布局",
      description: "小型储物仓完整显示建筑名、缓存物品、输入输出标签和库存数量；桌面、手机抽屉及 80% 至 200% 字体下会重排空间，不再用缩小文字掩盖截断。",
    },
  ],
} as const;

const RELEASE_NOTE_ICONS: Record<(typeof CURRENT_RELEASE_NOTES.items)[number]["id"], LucideIcon> = {
  "mobile-shell-preview": Smartphone,
  "mobile-factory-workspaces": Route,
  "production-codex": BookOpen,
  "colonization-fleet": Orbit,
  "cursor-overflow": Database,
  "finite-resources": Gauge,
  "mobile-picker-focus": Check,
  "storage-layout": Factory,
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
  const backdropRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const syncVisualViewport = () => {
      const viewport = window.visualViewport;
      const height = Math.max(240, viewport?.height ?? window.innerHeight);
      backdropRef.current?.style.setProperty("--release-notes-viewport-height", `${Math.round(height)}px`);
    };
    syncVisualViewport();
    window.addEventListener("resize", syncVisualViewport);
    window.visualViewport?.addEventListener("resize", syncVisualViewport);
    window.visualViewport?.addEventListener("scroll", syncVisualViewport);
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
      window.removeEventListener("resize", syncVisualViewport);
      window.visualViewport?.removeEventListener("resize", syncVisualViewport);
      window.visualViewport?.removeEventListener("scroll", syncVisualViewport);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      previousFocusRef.current?.focus({ preventScroll: true });
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div ref={backdropRef} className="release-notes-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
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
