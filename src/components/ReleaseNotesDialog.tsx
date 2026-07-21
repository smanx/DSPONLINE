import {
  Activity,
  ChartColumn,
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
  id: "2026-07-22",
  date: "2026年7月22日",
  version: "0.2.0",
  title: "公开测试版系统强化更新",
  summary: "本次更新补齐运营、账号与云存档安全，并强化手机交互、行星规划、渐进教学和全星球生产管理。现有本地与云端工厂存档不会被重置。",
  items: [
    {
      id: "operations-analytics",
      title: "运营数据与受保护后台",
      description: "新增累计、今日、在线玩家、访问漏斗、关键操作、页面加载、API 延迟、错误、磁盘、证书和备份状态汇总；详细数据仅管理员可见。",
    },
    {
      id: "account-security",
      title: "云账号正式化",
      description: "加入邮箱验证、忘记与修改密码、设备会话管理、账号注销、数据导出，以及本地身份与云账号的显式绑定。",
    },
    {
      id: "cloud-save-safety",
      title: "云存档冲突与历史保护",
      description: "本地和云端同时变化时必须由玩家选择保留版本；支持修订摘要、历史预览、恢复新修订和跨设备同步提示。",
    },
    {
      id: "mobile-third-wave",
      title: "手机端第三轮交互",
      description: "优化双指缩放、触摸连线吸附、长按快捷菜单、逐点多选和横竖屏状态保持；低性能手机会自动使用轻量渲染。",
    },
    {
      id: "planet-specialization",
      title: "行星差异化规划",
      description: "六颗行星拥有可持久化的资源丰度、能源环境、运输距离与工业专长，采矿、发电和跨星球物流会真实受到环境影响。",
    },
    {
      id: "progressive-onboarding",
      title: "完整渐进教学",
      description: "教学从手动采矿延伸到蓝糖、红糖石油链、黄糖、星际物流、戴森云、临界光子和白糖，并可定位卡住的设备或线路。",
    },
    {
      id: "production-management",
      title: "全星球生产管理",
      description: "新增产能总览、缺料来源和堵塞追踪、设备与线路跳转、目标产量反推，以及跨星球批量改配方和物流槽。",
    },
    {
      id: "performance-stability",
      title: "首屏性能与运行稳定性",
      description: "主菜单不再提前下载工厂画布和模拟器，静态资源启用版本化缓存与 gzip；后台新增真实浏览器性能分桶和节点健康指标。",
    },
    {
      id: "release-data-protection",
      title: "可复现发布与数据保护",
      description: "建立正式版本、Git 标签、发布清单、原子切换和独立代码回滚，并加入认证加密异地备份与隔离恢复演练工具。",
    },
  ],
} as const;

const RELEASE_NOTE_ICONS: Record<(typeof CURRENT_RELEASE_NOTES.items)[number]["id"], LucideIcon> = {
  "operations-analytics": ChartColumn,
  "account-security": ShieldCheck,
  "cloud-save-safety": Cloud,
  "mobile-third-wave": Smartphone,
  "planet-specialization": Orbit,
  "progressive-onboarding": Route,
  "production-management": Factory,
  "performance-stability": Gauge,
  "release-data-protection": Activity,
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
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
      previousFocusRef.current?.focus({ preventScroll: true });
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="release-notes-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
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
