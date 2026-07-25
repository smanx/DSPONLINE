import { Check, ClipboardCopy, Gauge, Info, MessageCircle, MonitorDown, Orbit, RadioTower, Route, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { NATIVE_BACK_EVENT } from "../nativeApp";

export const RELEASE_NOTES_SEEN_KEY = "dsp-idle-network.release-notes.seen.v1";

export const CURRENT_RELEASE_NOTES = {
  id: "2026-07-26-v1.0.3",
  date: "2026年7月26日",
  version: "1.0.3",
  title: "递归制造与生产定位",
  summary: "1.0.3 打通物流运输船与建筑制造中心的多级递归制造，增加物品产线定位，并修复高运输量诊断、枯竭矿脉、喷涂拆卸及手机输入和弹窗适配问题。GameState 升级至 v36，旧存档会无损迁移。",
  items: [
    {
      id: "recursive-crafting",
      title: "递归制造完整打通",
      description: "物流运输船现在支持一键递归制造；建筑制造中心会先规划完整材料链，优先尝试已解锁的高级精简配方，无法完成时再回退基础配方。铁矿石可继续加工为铁块和钢材，不再误报缺少中间材料。",
    },
    {
      id: "production-locator",
      title: "物品图鉴定位产线",
      description: "物品详情可定位当前行星的全部生产设备并高亮完整上游网络；多个目标可逐个切换，其他行星的结果可直接跳转，定位高亮可随时清除。",
    },
    {
      id: "logistics-diagnostics",
      title: "物流与时间倍率诊断",
      description: "轨道采集器不再被误判为航线断电；运输船全部执行任务时明确显示舰队容量瓶颈。时间扭曲界面新增请求倍率、实际倍率、供电需求、获得功率和自动降档原因。",
    },
    {
      id: "mobile-input-layout",
      title: "手机输入与弹窗适配",
      description: "修复鸿蒙 App 搜索文字被状态刷新清空的问题，并兼容中文输入法组合过程。储物仓与储液罐端口在 80% 至 200% 字号下保持可连接，托盘删除操作在手机横竖屏始终固定可见。",
    },
    {
      id: "resource-recovery",
      title: "枯竭资源提醒与恢复",
      description: "有限矿脉枯竭后会显示醒目的节点提示和设置快捷入口；切换有限或无限资源前需要主动确认，矿机、线路和已有缓存均会保留。枯竭状态在保存重载后不再错误恢复储量。",
    },
    {
      id: "spray-sidebar",
      title: "喷涂拆卸与侧栏修复",
      description: "建筑检查器新增喷涂模块拆卸，返还模块、缓存中的增产剂和尚未用完的喷涂点折算物；物资侧栏折叠后会完整退出，不再残留黑色容器。",
    },
  ],
} as const;

const RELEASE_NOTE_ICONS: Record<(typeof CURRENT_RELEASE_NOTES.items)[number]["id"], LucideIcon> = {
  "recursive-crafting": Route,
  "production-locator": Orbit,
  "logistics-diagnostics": RadioTower,
  "mobile-input-layout": MonitorDown,
  "resource-recovery": Gauge,
  "spray-sidebar": ClipboardCopy,
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
