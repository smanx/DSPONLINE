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
  id: "2026-07-23-v0.8.0",
  date: "2026年7月23日",
  version: "0.8.0",
  title: "模拟性能与缓存治理更新",
  summary: "本次更新将长时间离线运算移入 Worker，加入两类可配置建筑缓存上限、批量制造和物流操作优化，并补强移动端交互与运行稳定性。现有存档会自动迁移到 v32，库存、线路、科研、物流和戴森进度保持不变。",
  items: [
    {
      id: "offline-worker",
      title: "长时间离线运算移入 Worker",
      description: "加载长时间未游玩的存档时会显示可取消进度，完整计算成功后才一次性提交。取消、刷新或失败不会保存半成品，也不会重复结算离线收益。",
    },
    {
      id: "buffer-limits",
      title: "两类建筑缓存安全上限",
      description: "设置新增生产建筑与仓储物流建筑两项独立缓存上限，提供 1万、10万、100万及自定义值。调低或减少堆叠不会删除已有和在途物品。",
    },
    {
      id: "belt-defaults",
      title: "新建传送带默认参数",
      description: "可设置新线路默认货物堆叠和线路形状。蓝图保留自身参数，已有线路与并行线路不会被覆盖，未解锁的堆叠等级不可选择。",
    },
    {
      id: "quantity-crafting",
      title: "制造和堆叠支持输入数量",
      description: "建筑制造、手工制造和建筑堆叠统一提供减号、数字、加号与最大值。递归制造会先完整规划并原子扣料，不会加工到一半才失败。",
    },
    {
      id: "logistics-refill",
      title: "物流塔一键补满载具",
      description: "行星物流站可一键补满运输机，星际物流站可分别补满运输机和运输船。只移动随身载具栏中的空闲载具，不影响在途航线。",
    },
    {
      id: "basic-onboarding",
      title: "新增五步基础操作导览",
      description: "新玩家会先学习拿取与存放物品、制造建筑、放置与堆叠、连接传送带以及选择科研。只有真实成功操作才会推进，可跳过并在设置中重播。",
    },
    {
      id: "mobile-polish",
      title: "移动端制造与离线面板优化",
      description: "手机制造目录可以搜索喷涂模块，离线收益面板不会被新版顶栏或底栏遮挡；储物仓和储液罐在横竖屏与放大字体下保持完整可操作。",
    },
    {
      id: "layout-safety",
      title: "自动整理避开资源节点",
      description: "全星球和框选自动整理会把矿脉、原油、海洋采集点及安装空间作为障碍，避免设备覆盖固定资源；原有一步撤销继续可用。",
    },
    {
      id: "dyson-metrics",
      title: "戴森功率与射线统计统一",
      description: "戴森相关界面统一按 kW 显示，并分别说明理论接收率、接收站实际利用率和戴森功率利用率。堵塞、断电和模式变化不再伪装成效率跳变。",
    },
  ],
} as const;

const RELEASE_NOTE_ICONS: Record<(typeof CURRENT_RELEASE_NOTES.items)[number]["id"], LucideIcon> = {
  "offline-worker": Gauge,
  "buffer-limits": Database,
  "belt-defaults": Route,
  "quantity-crafting": Factory,
  "logistics-refill": Orbit,
  "basic-onboarding": BookOpen,
  "mobile-polish": Smartphone,
  "layout-safety": Check,
  "dyson-metrics": Gauge,
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
