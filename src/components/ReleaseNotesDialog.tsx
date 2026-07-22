import {
  Check,
  Cloud,
  Database,
  Factory,
  Gauge,
  Info,
  MessageCircle,
  Orbit,
  Route,
  ShieldCheck,
  Smartphone,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";

export const RELEASE_NOTES_SEEN_KEY = "dsp-idle-network.release-notes.seen.v1";

export const CURRENT_RELEASE_NOTES = {
  id: "2026-07-23-v0.5.0",
  date: "2026年7月23日",
  version: "0.5.0",
  title: "移动操作、物流与存档急救更新",
  summary: "本次更新强化手机操作、设备回收、星际物流和生产区域编辑，并加入本地存档急救保护。现有工厂会无损迁移，不会被重置；生产统计曲线将在刷新后重新积累。",
  items: [
    {
      id: "save-rescue",
      title: "本地存档急救",
      description: "生产统计曲线不再写入主存档、槽位或快照；自动快照调整为最近 2 份、间隔 5 分钟。主存档必须写入并读回校验成功才会显示保存成功，空间不足时会保留红色告警并提供立即导出。",
    },
    {
      id: "mobile-gesture",
      title: "手机双指接管与性能模式",
      description: "双指可从建筑、传送带或密集区域直接接管为画布平移缩放；第二根手指会取消未提交操作。移动端降低常驻画面更新与特效负担，后台和全屏工作区停止底层画布刷新。",
    },
    {
      id: "quick-craft",
      title: "灰锤单击补料定位",
      description: "施工托盘灰色小锤子改为单击，自动递归定位第一个可手搓的上游缺料；绿色、可上游合成和不可制造三种状态与实际制造使用同一套检查逻辑。",
    },
    {
      id: "recovery-controls",
      title: "采集与堆叠设备回收",
      description: "矿脉、油井和抽水节点上的采集设备支持按数量回收；普通堆叠设备新增 -1 操作，最后一台仍走完整拆除流程，输入、输出、进度和线路物资不会丢失。",
    },
    {
      id: "station-warpers",
      title: "星际站翘曲器自动补充",
      description: "星际物流站可从所在行星物资托盘自动补充空间翘曲器，并设置目标库存；多个站点按确定性顺序竞争库存，托盘不足或站内满仓会明确显示原因。",
    },
    {
      id: "hub-priority",
      title: "配送枢纽溢出收纳",
      description: "新建至物资配送枢纽的输入线默认低优先级，普通和高优先级生产线会优先获得产物；玩家手动修改过的旧线路优先级不会被覆盖。",
    },
    {
      id: "canvas-resize",
      title: "生产区域八向缩放",
      description: "选中生产区域后可拖动四边和四角调整大小，适配画布缩放与手机触摸；区域名称、颜色和内部设备位置保持不变。",
    },
    {
      id: "megastructure-oil",
      title: "巨构卡片与外星原油",
      description: "建筑制造中心以真实约 2 倍画布尺寸显示独立边框、状态和效果；澜渊 II、赤砂 I、牧云 II 的原油供应得到确定性补充，旧工厂只会补缺失节点。",
    },
    {
      id: "colonization-guidance",
      title: "殖民前哨与科技树操作",
      description: "殖民卡片会固定展示完整物资条件与当前数量；科技树滚轮、触控板斜向手势只驱动横向浏览，右键横向拖拽继续可用。",
    },
    {
      id: "interaction-boundaries",
      title: "操作边界与恢复点整理",
      description: "游戏画面拦截浏览器原生右键与长按菜单，不影响输入框、右键拖动画布和游戏内长按菜单；自动快照与手动快照分开计数，手动恢复点不会被自动清理。",
    },
  ],
} as const;

const RELEASE_NOTE_ICONS: Record<(typeof CURRENT_RELEASE_NOTES.items)[number]["id"], LucideIcon> = {
  "save-rescue": ShieldCheck,
  "mobile-gesture": Smartphone,
  "quick-craft": Factory,
  "recovery-controls": Check,
  "station-warpers": Route,
  "hub-priority": Database,
  "canvas-resize": Orbit,
  "megastructure-oil": Cloud,
  "colonization-guidance": Gauge,
  "interaction-boundaries": Info,
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
