import { Activity, Check, Gauge, Info, Layers, MessageCircle, RefreshCw, Route, Shield, ShieldCheck, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { NATIVE_BACK_EVENT } from "../nativeApp";

export const RELEASE_NOTES_SEEN_KEY = "dsp-idle-network.release-notes.seen.v1";

export const CURRENT_RELEASE_NOTES = {
  id: "2026-08-03-v1.0.24",
  date: "2026年8月3日",
  version: "1.0.24",
  title: "工厂管理与终局画布更新",
  summary: "1.0.24 增加工厂级物流管理、精确线路与回收操作，并为超大工厂加入可回退的画布性能路径；历史安全整数堆叠原样保留。GameState v46、存档 envelope v2 与云 schema v7 不变。",
  items: [
    {
      id: "stack-history-safety",
      title: "一亿新增上限与历史堆叠保护",
      description: "新增建筑堆叠统一限制为一亿；旧存档中更大但仍为安全整数的堆叠原样保留，可回收但不能继续增加，危险数值会明确拒绝。",
    },
    {
      id: "logistics-management",
      title: "跨星球物流管理",
      description: "运营中心新增按恒星系、行星和物流塔组织的物流管理页，可搜索、筛选并远程编辑槽位、供需、舰队、翘曲器和量子模式。",
    },
    {
      id: "exact-belt-selection",
      title: "连接后精确选中线路",
      description: "新建传送带或增加并联线路后会立即选中真正受影响的线路并打开检查器，不再依赖模糊的端点匹配。",
    },
    {
      id: "recycle-mode",
      title: "建筑批量回收",
      description: "施工托盘新增回收模式，支持单选、Shift 多选、框选和触摸选择；确认前显示建筑、关联线路和预计返还。",
    },
    {
      id: "item-actions",
      title: "物品定位与图鉴快捷操作",
      description: "物品悬浮卡可以直接定位生产设备或打开图鉴；移动端长按后同样可操作，没有生产来源时会说明原因。",
    },
    {
      id: "mobile-blueprint-import",
      title: "手机版蓝图导入",
      description: "新版和经典手机界面都提供可见的蓝图导入入口，支持文件和粘贴 JSON，并显示明确的成功摘要或格式错误。",
    },
    {
      id: "canvas-projection-cache",
      title: "当前星球轻量快照与拓扑缓存",
      description: "画布只消费当前星球的轻量运行快照，并复用拓扑、端口、路线和空间索引；其他星球变化不再反复重建当前画布。",
    },
    {
      id: "endgame-canvas-mode",
      title: "可选终局画布极限模式",
      description: "超大工厂可按设备开启节点 LOD、Canvas 批量线路、视口裁剪和低频小地图；普通模式与模拟结果保持不变。",
    },
    {
      id: "canvas-fallback",
      title: "画布失效自动回退",
      description: "Canvas 或小地图上下文不可用时会自动恢复完整 React Flow 线路和小地图，选中、命中、连接预览与视口保持可用。",
    },
    {
      id: "multicore-guardrail",
      title: "多 Worker 继续保持生产关闭",
      description: "多 Worker 确定性和守恒测试已通过，但真实终局模拟仍慢于单 Worker，因此正式构建继续使用单一权威 Worker。",
    },
    {
      id: "release-compatibility",
      title: "存档与在线协议保持兼容",
      description: "不升级 GameState v46、存档 envelope v2、云 schema v7 或 SQLite layout v2；库存、线路、在途物资、账号和排行榜数据无需迁移。",
    },
  ],
} as const;

const RELEASE_NOTE_ICONS: Record<(typeof CURRENT_RELEASE_NOTES.items)[number]["id"], LucideIcon> = {
  "stack-history-safety": Shield,
  "logistics-management": Route,
  "exact-belt-selection": Activity,
  "recycle-mode": RefreshCw,
  "item-actions": Info,
  "mobile-blueprint-import": Layers,
  "canvas-projection-cache": Gauge,
  "endgame-canvas-mode": Layers,
  "canvas-fallback": ShieldCheck,
  "multicore-guardrail": Gauge,
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
