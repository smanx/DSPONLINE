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
  id: "2026-07-22-v0.4.0",
  date: "2026年7月22日",
  version: "0.4.0",
  title: "生产网络与云存档更新",
  summary: "本次更新强化生产网络操作、科研控制、画布整理和行星库存，并上线四槽云存档与十分钟自动同步。现有本地与云端工厂存档会原样迁移，不会被重置。",
  items: [
    {
      id: "power-routing",
      title: "准确供电与分流优先级",
      description: "供电效率与生产利用率分开显示；四向分流器严格按高、标准、低分配，同级线路轮流均分，高等级堵塞后再向下回退。",
    },
    {
      id: "belt-automation",
      title: "自动传送带等级",
      description: "拉线时自动锁定已解锁且有库存的最高等级，高级库存耗尽后自动降级；并行线路优先沿用原等级，同时保留手动指定。",
    },
    {
      id: "research-control",
      title: "科研暂停与横向科技树",
      description: "当前研究可以暂停或取消，已经投入的矩阵与进度完整保留；依赖队列等待前置完成，科技树滚轮固定用于横向浏览。",
    },
    {
      id: "canvas-regions",
      title: "自定义生产区域",
      description: "画布可框选持久化生产区域并设置名称、背景色和边框色；区域位于工厂下层，不阻挡建筑、线路或正常操作。",
    },
    {
      id: "inventory-progression",
      title: "行星库存与巨构规则",
      description: "每颗行星可独立设置 1,000 至 1,000,000 的单种物资上限，满仓不吞物品；巨构不再作为普通科技奖励免费赠送。",
    },
    {
      id: "responsive-workspaces",
      title: "界面、字体与移动端修复",
      description: "修复 80% 至 200% 字号溢出、小型储物仓端口重叠和星图遮挡其他页面；手机边缘拖动松手后不再持续漂移。",
    },
    {
      id: "cloud-slots",
      title: "四份独立云存档",
      description: "云端分别保存当前主存档与手动槽位 1、2、3，每份显示保存时间和进度摘要，手动槽位不会被主存档自动上传覆盖。",
    },
    {
      id: "cloud-sync",
      title: "十分钟自动同步与冲突保护",
      description: "已验证账号每十分钟检查并同步主存档；网络失败不影响本地保存，多设备分叉时暂停自动上传并要求玩家明确选择版本。",
    },
    {
      id: "mail-status",
      title: "邮件功能状态提示",
      description: "邮件模板审核期间，注册、邮箱绑定、验证重发和找回密码会标注正在开发中；现有账号登录、改密和云存档继续正常使用。",
    },
    {
      id: "save-migration",
      title: "无损存档迁移",
      description: "游戏状态升级至 v28、云服务升级至 schema v6；旧库存、设备、线路、科研投入、原主云存档和历史修订全部保留。",
    },
  ],
} as const;

const RELEASE_NOTE_ICONS: Record<(typeof CURRENT_RELEASE_NOTES.items)[number]["id"], LucideIcon> = {
  "power-routing": Gauge,
  "belt-automation": Route,
  "research-control": Factory,
  "canvas-regions": Orbit,
  "inventory-progression": Database,
  "responsive-workspaces": Smartphone,
  "cloud-slots": Cloud,
  "cloud-sync": ShieldCheck,
  "mail-status": Info,
  "save-migration": Check,
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
