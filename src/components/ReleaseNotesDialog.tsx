import { BookOpen, Check, Focus, Gauge, Info, Layers, MessageCircle, Route, Sparkles, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { NATIVE_BACK_EVENT } from "../nativeApp";

export const RELEASE_NOTES_SEEN_KEY = "dsp-idle-network.release-notes.seen.v1";

export const CURRENT_RELEASE_NOTES = {
  id: "2026-08-01-v1.0.19",
  date: "2026年8月1日",
  version: "1.0.19",
  title: "蓝图施工与模拟一致性更新",
  summary: "1.0.19 修复内容包 Worker、超大蓝图和递归制造问题，加入待建补料、统计窗口与游戏内确认框，并把量子基础吞吐提高到 5000 件/分钟。GameState 升至 v46，旧存档和旧蓝图守恒迁移。",
  items: [
    {
      id: "content-pack-worker-registry",
      title: "内容包同步到模拟 Worker",
      description: "实时、纯挂机和离线模拟使用同一份内容包注册表；启用、更新或关闭内容包后无需刷新页面，配方和建筑规则不会在 Worker 中失效。",
    },
    {
      id: "large-blueprint-roundtrip",
      title: "超大蓝图完整往返",
      description: "单个建筑堆叠最高支持 1 亿，导入不再把超过 1 万的合法数量误判为损坏，也不会静默截断或免费建造。",
    },
    {
      id: "alignment-guides",
      title: "建筑拖动对齐辅助线",
      description: "单选和多选建筑接近其他建筑的中心或边缘时显示水平、垂直辅助线；松开后立即清除，不写入存档。",
    },
    {
      id: "quantum-blueprint-target",
      title: "蓝图记忆量子网络目标",
      description: "复制量子物流塔时保留计划接入状态；科技和 Mk.II 条件满足后自动接入，同时保留本地运输机、槽位、缓存和载具。",
    },
    {
      id: "recursive-overflow",
      title: "递归制造不再被副产物卡死",
      description: "轨道采集器等递归手搓在氢满仓时仍能原子完成，真实副产物允许暂时超过托盘软上限且不会被删除。",
    },
    {
      id: "in-game-dialogs",
      title: "统一游戏内确认框",
      description: "回收、拆卸和重置等确认不再调用原生阻塞弹窗；确认或取消后，数字输入、中文输入法、指针和键盘焦点均可继续使用。",
    },
    {
      id: "production-statistics-windows",
      title: "生产统计排序与时间窗口",
      description: "新增每秒、每分钟、每十分钟和每小时窗口，生产与消耗列可稳定排序，大数量统一使用万、亿及更高单位并保留精确值。",
    },
    {
      id: "pending-blueprint-construction",
      title: "蓝图缺料预建设与多次补足",
      description: "缺少建筑时仍可连续放置灰色待建蓝图，之后分批投入建筑、线路和载具；材料齐备后原子建成，取消会完整返还预留物资。",
    },
    {
      id: "quantum-bandwidth-5000",
      title: "量子网络基础吞吐提高",
      description: "全局上传和下载基础值从 400 提高到 5000 件/分钟，再乘银河物流无限科技倍率平方与全部量子塔堆叠总数。",
    },
  ],
} as const;

const RELEASE_NOTE_ICONS: Record<(typeof CURRENT_RELEASE_NOTES.items)[number]["id"], LucideIcon> = {
  "content-pack-worker-registry": Route,
  "large-blueprint-roundtrip": Layers,
  "alignment-guides": Focus,
  "quantum-blueprint-target": Sparkles,
  "recursive-overflow": BookOpen,
  "in-game-dialogs": Check,
  "production-statistics-windows": Gauge,
  "pending-blueprint-construction": Layers,
  "quantum-bandwidth-5000": Info,
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
