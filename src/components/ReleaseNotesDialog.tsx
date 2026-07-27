import { Check, Factory, FlaskConical, Info, MessageCircle, MonitorDown, Pickaxe, Route, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { NATIVE_BACK_EVENT } from "../nativeApp";

export const RELEASE_NOTES_SEEN_KEY = "dsp-idle-network.release-notes.seen.v1";

export const CURRENT_RELEASE_NOTES = {
  id: "2026-07-27-v1.0.5",
  date: "2026年7月27日",
  version: "1.0.5",
  title: "星际物流、戴森扩容与矿脉科技",
  summary: "1.0.5 增加绿糖 1:8 翘曲器配方、物流塔载具目标与蓝图自动装载，修复配送枢纽、线路并联同步、缺料导航和建筑位置漂移，扩充戴森容量，并让矿脉极限利用逐级降低采矿消耗。GameState 升级至 v37，旧存档会守恒迁移。",
  items: [
    {
      id: "green-warper",
      title: "绿糖精简制造翘曲器",
      description: "空间翘曲科技解锁后开放原版高级配方：1 个引力矩阵制造 8 个空间翘曲器。原有引力透镜配方继续保留；递归制造优先尝试绿糖路线，不可完成时自动回退基础路线。",
    },
    {
      id: "station-fleet",
      title: "物流塔载具目标与蓝图装载",
      description: "物流运输机和运输船支持直接输入目标数量及一键填满，返还时不会卸载正在执行任务的载具。蓝图会记录每座物流塔的载具目标，部署后从随身载具栏自动装载；库存不足时部分装载并显示缺口。",
    },
    {
      id: "logistics-fixes",
      title: "物流容量与线路同步修复",
      description: "物资配送枢纽改为以行星托盘剩余容量持续接收，不再被 900 个建筑缓存卡住；“同步首条设置”和整网同步现在包含并联数量，并先原子校验同级传送带库存。同恒星系运输明确不预留或消耗翘曲器。",
    },
    {
      id: "production-diagnostics",
      title: "产量来源与缺料导航校正",
      description: "玻璃产量面板会明确显示行星冶炼专精等合法加成，统计口径与真实模拟一致。灰色锤子改用完整递归材料规划，原始矿物会打开对应资料而不会跳到无关中间材料。",
    },
    {
      id: "dyson-capacity",
      title: "恒星燃料与球壳容量扩充",
      description: "人造恒星备用反物质燃料棒容量调整为每台 30 个，旧存档超额燃料优先退回所在行星托盘，放不下的完整保留。戴森球壳太阳帆容量翻倍，旧壳层会按几何结构重算并继续吸附。",
    },
    {
      id: "vein-utilization",
      title: "矿脉极限利用升级",
      description: "无限科技“矿脉极限利用”保留每级固体采矿速度 +10%，并新增每级矿脉消耗 -10%。达到 Lv.10 后固体矿脉不再消耗储量；小数消耗使用存档内整数余数结算，在线、离线和分段模拟结果一致。",
    },
    {
      id: "position-persistence",
      title: "建筑位置不再刷新漂移",
      description: "拖动结束会立即提交世界坐标，页面隐藏或刷新前无需等待下一帧；加载、切换行星、字号和主题变化均以存档坐标为唯一来源，连续刷新不会累计偏移。",
    },
    {
      id: "native-downloads",
      title: "Windows 与 Android 同步更新",
      description: "Windows 与 Android 应用同步升级至 1.0.5。Android 保持包名和长期签名，Windows 保持应用标识；覆盖安装、网页升级和 v36→v37 迁移均不会主动删除本地存档。",
    },
  ],
} as const;

const RELEASE_NOTE_ICONS: Record<(typeof CURRENT_RELEASE_NOTES.items)[number]["id"], LucideIcon> = {
  "green-warper": FlaskConical,
  "station-fleet": Route,
  "logistics-fixes": Route,
  "production-diagnostics": Factory,
  "dyson-capacity": Factory,
  "vein-utilization": Pickaxe,
  "position-persistence": Info,
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
