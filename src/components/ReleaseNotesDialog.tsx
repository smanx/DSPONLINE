import { Check, Cpu, Database, Gauge, Info, Layers, MessageCircle, Route, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { NATIVE_BACK_EVENT } from "../nativeApp";

export const RELEASE_NOTES_SEEN_KEY = "dsp-idle-network.release-notes.seen.v1";

export const CURRENT_RELEASE_NOTES = {
  id: "2026-07-30-v1.0.11",
  date: "2026年7月30日",
  version: "1.0.11",
  title: "终局性能与数据完整性更新",
  summary: "1.0.11 为终局物流和建筑制造中心增加确定性批量结算，降低大型工厂 Worker 积压。玩法数值、离线收益和存档格式保持不变，GameState 继续为 v40。",
  items: [
    {
      id: "logistics-dispatch-cache",
      title: "物流调度复用",
      description: "物流伙伴、路线经济、活动载具负载和拥堵诊断在同一模拟会话内复用，减少高密度物流站重复匹配。",
    },
    {
      id: "construction-batch-settlement",
      title: "递归制造批量结算",
      description: "复杂递归链、副产物、多目标和多制造中心保持原有轮询与物资守恒，同时避免按成品重复规划整条材料链。",
    },
    {
      id: "power-storage-batches",
      title: "燃料与蓄电批次处理",
      description: "大堆叠发电燃料和能量枢纽改用等价闭式结算，不再按每个燃料棒或蓄电单元循环。",
    },
    {
      id: "terminal-performance-fixtures",
      title: "终局规模性能门禁",
      description: "新增玩家同形和 2 倍终局匿名夹具，覆盖 300 万并联线路、256 座物流站及 1x、4x、11x 状态哈希。",
    },
    {
      id: "leaderboard-integrity",
      title: "排行榜数据完整性",
      description: "检测数据修改异常",
    },
    {
      id: "no-gameplay-tradeoff",
      title: "玩法与存档保持不变",
      description: "本次不降低刷新档位、产量、物流速度、离线收益、堆叠或线路上限，也不升级 GameState、存档 envelope 或云存档 schema。",
    },
  ],
} as const;

const RELEASE_NOTE_ICONS: Record<(typeof CURRENT_RELEASE_NOTES.items)[number]["id"], LucideIcon> = {
  "logistics-dispatch-cache": Route,
  "construction-batch-settlement": Cpu,
  "power-storage-batches": Gauge,
  "terminal-performance-fixtures": Database,
  "leaderboard-integrity": Layers,
  "no-gameplay-tradeoff": Check,
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
