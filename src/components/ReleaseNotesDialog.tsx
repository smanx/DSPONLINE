import { Activity, Check, Gauge, Info, Layers, MessageCircle, RefreshCw, Route, Shield, ShieldCheck, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { NATIVE_BACK_EVENT } from "../nativeApp";

export const RELEASE_NOTES_SEEN_KEY = "dsp-idle-network.release-notes.seen.v1";

export const CURRENT_RELEASE_NOTES = {
  id: "2026-08-03-v1.0.25",
  date: "2026年8月3日",
  version: "1.0.25",
  title: "画布交互与设置体验更新",
  summary: "1.0.25 改进建筑选中、上下游寻线、星球统计、自动保存与侧栏布局，并补齐窄屏和大字号设置体验。GameState v46、存档 envelope v2 与云 schema v7 不变。",
  items: [
    {
      id: "stable-selection",
      title: "建筑选中稳定高亮",
      description: "模拟刷新、性能模式和 Worker 状态发布不再清空当前建筑选择；选中边框、底色和标记在缩小视图中仍保持可见。",
    },
    {
      id: "shortage-navigation",
      title: "资源不足跳转可控",
      description: "新增资源不足自动跳转开关，默认关闭；关闭时只显示缺料提示，主动点击缺料文字、图标或锤子仍可打开对应配方。",
    },
    {
      id: "planet-statistics",
      title: "生产统计按星球筛选",
      description: "生产统计可查看全部星球或指定星球，库存、生产消耗、异常和用电设备随范围过滤，搜索、排序和时间窗口保持不变。",
    },
    {
      id: "line-trace",
      title: "建筑上下游寻线",
      description: "画布可双向追踪当前星球物理传送带的上游、下游、分支、汇流与循环，并用不同颜色突出中心和关联线路。",
    },
    {
      id: "autosave-options",
      title: "自动保存增加 10 分钟与关闭",
      description: "周期自动保存新增 10 分钟和关闭选项；关闭后仍保留页面隐藏、退出、返回主菜单等紧急保存，以及手动保存和云上传。",
    },
    {
      id: "endgame-node-title",
      title: "终局节点标题更明确",
      description: "极限模式优先显示配方、主要产物或当前科技，未配置机器会明确提示；建筑类型保留为次级信息。",
    },
    {
      id: "responsive-settings",
      title: "窄屏与大字号设置布局",
      description: "设置页在窄屏、手机与 200% 字号下自动切换稳定单列布局，标题、说明、按钮和开关不再重叠或逐字断行。",
    },
    {
      id: "independent-sidebars",
      title: "左右侧栏独立收起",
      description: "物资侧栏和检查器都可从画布边缘独立收起与展开，画布会回收空间，同时保留选择、标签页、滚动位置和模拟状态。",
    },
    {
      id: "release-compatibility",
      title: "存档与在线协议保持兼容",
      description: "本版新增设置使用安全默认值或设备级偏好，不升级 GameState v46、存档 envelope v2、云 schema v7 或 SQLite layout v2。",
    },
  ],
} as const;

const RELEASE_NOTE_ICONS: Record<(typeof CURRENT_RELEASE_NOTES.items)[number]["id"], LucideIcon> = {
  "stable-selection": Activity,
  "shortage-navigation": Shield,
  "planet-statistics": Gauge,
  "line-trace": Route,
  "autosave-options": RefreshCw,
  "endgame-node-title": Info,
  "responsive-settings": ShieldCheck,
  "independent-sidebars": Layers,
  "release-compatibility": Check,
};

export function hasSeenCurrentReleaseNotes(): boolean {
  try {
    if (window.localStorage.getItem(RELEASE_NOTES_SEEN_KEY) === CURRENT_RELEASE_NOTES.id) return true;
    // Isolated browser fixtures intentionally bypass first-run chrome. This
    // keeps older release fixtures deterministic without hiding new notes for
    // real players who have already seen a previous version.
    const isReleaseNotesTest = new URLSearchParams(window.location.search).get("releaseNotesTest") === "1";
    return !isReleaseNotesTest && window.sessionStorage.getItem("dsp-idle-network.test-bypass-menu") === "1";
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
    const onNativeBack = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener(NATIVE_BACK_EVENT, onNativeBack, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener(NATIVE_BACK_EVENT, onNativeBack, true);
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
        <div className="release-notes-scroll">
          <p className="release-notes-summary"><Info size={16} /><span>{CURRENT_RELEASE_NOTES.summary}</span></p>
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
