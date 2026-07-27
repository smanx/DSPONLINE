import { Check, Factory, FlaskConical, Info, MessageCircle, MonitorDown, Pickaxe, Route, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { NATIVE_BACK_EVENT } from "../nativeApp";

export const RELEASE_NOTES_SEEN_KEY = "dsp-idle-network.release-notes.seen.v1";

export const CURRENT_RELEASE_NOTES = {
  id: "2026-07-28-v1.0.6",
  date: "2026年7月28日",
  version: "1.0.6",
  title: "高容量产线与采矿蓝图",
  summary: "1.0.6 校正紫色矩阵配方，将传送带并联上限提高到 4096，修复建筑制造中心副产物卡死，并增加批量减堆和矿脉唯一的采矿布局蓝图。GameState 升级至 v38，旧存档会守恒迁移。",
  items: [
    {
      id: "purple-matrix",
      title: "紫色矩阵配方校正",
      description: "信息矩阵每周期现在统一消耗 1 个粒子宽带和 2 个处理器。制造面板、图鉴、缺料分析、递归制造、规划、统计与真实模拟全部读取同一配方目录。",
    },
    {
      id: "belt-capacity",
      title: "传送带并联上限提高",
      description: "单条线路并联上限从 64 提高至 4096，检查器继续支持直接输入、增减、整网同步和蓝图参数。增加会原子消耗同级传送带，减少完整返还，线路设置与在途物资不变。",
    },
    {
      id: "byproduct-settlement",
      title: "制造中心副产物不再卡死",
      description: "递归制造会保留后续步骤必需的 WIP，额外产物优先进入当前行星托盘；托盘已满时只销毁任务不再需要的副产物，并显示当前 WIP 与累计销毁量。",
    },
    {
      id: "batch-unstack",
      title: "建筑批量减少堆叠",
      description: "建筑检查器增加目标数量、-1、-10、-100 和减至 1。减少的建筑返还施工托盘，输入输出、燃料、进度、物流槽、载具、线路和在途物资均保持不变。",
    },
    {
      id: "mining-blueprints",
      title: "采矿布局进入蓝图库",
      description: "已安装采集设备的资源点可以作为不可建造锚点收录。部署时只匹配附近同类型现有矿脉并补齐矿机及线路，不复制、移动、补充或修改矿脉储量；重复粘贴不会重复生成矿脉或采集设备。",
    },
    {
      id: "native-downloads",
      title: "Windows 与 Android 同步更新",
      description: "Windows 与 Android 应用同步升级至 1.0.6。Android 保持包名和长期签名，Windows 保持应用标识；覆盖安装、网页升级和 v37→v38 迁移均不会主动删除本地存档。",
    },
  ],
} as const;

const RELEASE_NOTE_ICONS: Record<(typeof CURRENT_RELEASE_NOTES.items)[number]["id"], LucideIcon> = {
  "purple-matrix": FlaskConical,
  "belt-capacity": Route,
  "byproduct-settlement": Factory,
  "batch-unstack": Factory,
  "mining-blueprints": Pickaxe,
  "native-downloads": MonitorDown,
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
