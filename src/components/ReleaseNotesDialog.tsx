import { Check, ClipboardCopy, Gauge, Info, MessageCircle, MonitorDown, Orbit, RadioTower, Route, X, Zap, type LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { NATIVE_BACK_EVENT } from "../nativeApp";

export const RELEASE_NOTES_SEEN_KEY = "dsp-idle-network.release-notes.seen.v1";

export const CURRENT_RELEASE_NOTES = {
  id: "2026-07-24-v1.0.0",
  date: "2026年7月24日",
  version: "1.0.0",
  title: "恒星巨构与物流调度",
  summary: "1.0.0 完成戴森工程、终局巨构、活动物资输入和星际物流调度升级。旧存档会自动迁移，现有建筑、线路、库存、科研、物流航线和戴森建设进度保持不变。",
  items: [
    {
      id: "dyson-copy",
      title: "戴森球壳层复制",
      description: "建设中或已完成的壳层都可复制到本恒星系或其他已解锁恒星系。副本保留设计拓扑但从零建设，不继承目标系统已有火箭、结构点或壳面帆。",
    },
    {
      id: "activity-input",
      title: "活动出口传送带输入",
      description: "超大型物资出口的四个专用接口现可正确接收宇宙矩阵、太阳帆、小型运载火箭和反物质燃料棒。活动倒计时改用真实墙钟，不再受暂停或模拟倍率影响。",
    },
    {
      id: "dyson-layout",
      title: "戴森规划界面重整",
      description: "复制、粘贴、保存和关闭命令始终保持可见；在 1080p、紧凑桌面、手机横竖屏和 80% 至 200% 字体下，规划区拥有独立滚动边界。",
    },
    {
      id: "black-hole",
      title: "微型黑洞连接装置",
      description: "新增三输入终局巨构，可永久销毁传送带送达的任意物资并精确记录每个接口的累计数量。放置后默认暂停，首次启动和回收均有明确安全确认。",
    },
    {
      id: "time-warp",
      title: "时间扭曲装置",
      description: "新增以十倍功耗逐档提升实时模拟倍率的终局巨构。主控只使用所在电网剩余功率，供电不足时自动降档，离线收益和活动时钟保持真实时间。",
    },
    {
      id: "power-units",
      title: "功率单位自动换算",
      description: "功率统一按 kW、MW、GW、TW、PW 自动换算。桌面悬停或聚焦、手机点击功率数值时可查看精确 kW，不再出现手工除以 1000 的显示差异。",
    },
    {
      id: "logistics-dispatch",
      title: "多供应源物流调度",
      description: "需求站会跳过缺货、断电或不可达的供应塔，并在同一步从多个来源补足。相同优先级按公平游标轮换，舰队诊断会明确显示载具、翘曲器和路线限制。",
    },
  ],
} as const;

const RELEASE_NOTE_ICONS: Record<(typeof CURRENT_RELEASE_NOTES.items)[number]["id"], LucideIcon> = {
  "dyson-copy": ClipboardCopy,
  "activity-input": Route,
  "dyson-layout": MonitorDown,
  "black-hole": Orbit,
  "time-warp": Gauge,
  "power-units": Zap,
  "logistics-dispatch": RadioTower,
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
