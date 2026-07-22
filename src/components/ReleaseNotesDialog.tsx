import {
  Check,
  Cloud,
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
  id: "2026-07-22-v0.3.0",
  date: "2026年7月22日",
  version: "0.3.0",
  title: "星区生态与自动建造更新",
  summary: "本次更新扩展完整星区生态，并加入建筑自动补给、物资直送、全域供电、行星解锁、存档保护和移动端兼容改进。现有本地与云端工厂存档不会被重置。",
  items: [
    {
      id: "stellar-ecology",
      title: "八恒星系与十六种行星生态",
      description: "星图扩展到 8 个恒星系、22 颗行星和 16 种生态模板；资源、稀有矿、海洋、潮汐锁定、能源环境、殖民成本与工业专长由存档种子确定。",
    },
    {
      id: "stellar-industry",
      title: "恒星亮度与跨恒星工业",
      description: "恒星参数真实影响太阳能、射线接收和各星系独立戴森系统；跨恒星物流支持中转枢纽、航线优先级、真实距离与每船翘曲预算。",
    },
    {
      id: "construction-center",
      title: "巨构建筑制造中心",
      description: "紫糖科技解锁独立建筑补给页面，可从所在行星物资托盘取料并按目标库存自动补足建筑；绿糖与白糖科技继续提升上限和制造速度。",
    },
    {
      id: "material-delivery",
      title: "三路物资配送枢纽",
      description: "黄糖科技新增物资配送枢纽，三个输入接口可由线路自动匹配，送达物品会直接进入建筑所在行星的物资托盘。",
    },
    {
      id: "power-and-research",
      title: "全行星供电与科研预接线",
      description: "移除发电设施覆盖半径，同一行星同一电网全域供电；研究站未选择项目时可提前连接任意矩阵线路，切换科研不会拆线。",
    },
    {
      id: "planet-access",
      title: "母恒星系行星解锁",
      description: "新工厂只开放母星，完成“星际物流系统”后解锁烬原与气态巨星，并可在恒星系内携带一组光标载荷跳转。",
    },
    {
      id: "selection-and-upgrade",
      title: "线路框选与一键升级",
      description: "框选设备会同步选中范围内的传送带，工具栏可一次升级全部选中线路并保持原连接；科技树滚动加入方向锁定，触控板操作更稳定。",
    },
    {
      id: "crafting-convenience",
      title: "科技赠礼与递归快速建造",
      description: "每项科技完成时赠送其解锁建筑各 2 个；施工托盘小锤子可自动合成已解锁的上游手工材料，并短暂显示本次实际消耗。新工厂另带铁、铜、石矿各 100。",
    },
    {
      id: "save-and-account-safety",
      title: "存档删除保护与密码重置",
      description: "手动槽位和快照删除增加两次明确确认，并始终展示删除目标；登录入口继续支持忘记密码与安全重置流程。右上角工厂重置入口已移除。",
    },
    {
      id: "mobile-accessibility",
      title: "移动公告、载荷提示与 200% 字号",
      description: "修复小屏与横屏公告无法关闭的问题，增加 200% 字号适配；拿起物品时桌面放下区域与手机物资按钮会高亮提示。",
    },
  ],
} as const;

const RELEASE_NOTE_ICONS: Record<(typeof CURRENT_RELEASE_NOTES.items)[number]["id"], LucideIcon> = {
  "stellar-ecology": Orbit,
  "stellar-industry": Route,
  "construction-center": Factory,
  "material-delivery": Cloud,
  "power-and-research": Gauge,
  "planet-access": Orbit,
  "selection-and-upgrade": Route,
  "crafting-convenience": Factory,
  "save-and-account-safety": ShieldCheck,
  "mobile-accessibility": Smartphone,
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
