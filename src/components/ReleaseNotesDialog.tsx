import { Activity, Check, FlaskConical, Gauge, Info, MessageCircle, Orbit, Route, Trash2, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";

export const RELEASE_NOTES_SEEN_KEY = "dsp-idle-network.release-notes.seen.v1";

export const CURRENT_RELEASE_NOTES = {
  id: "2026-07-24-v0.9.0",
  date: "2026年7月24日",
  version: "0.9.0",
  title: "长期生产与银河工程更新",
  summary: "本次更新让生产画面流畅度可按设备选择，并完成物流、增产剂、戴森工程、无限科研和银河出口的长期运行升级。旧存档会无损迁移到 GameState v33；活动服务保持关闭，不会自动上传贡献或发放奖励。",
  items: [
    {
      id: "production-refresh",
      title: "生产画面刷新频率",
      description: "新增自动调节、经典流畅、高流畅、均衡、省电、低配置和极限省电七档。固定档不会被自动系统覆盖，绿色生产进度在真实库存快照之间继续平滑推进。",
    },
    {
      id: "production-correctness",
      title: "生产与物流正确性",
      description: "增产剂耗尽后自动回到基础倍率，供应塔与需求塔分别使用自身起送比例；增产剂缓存上限可独立设置，手机边缘拖动与普通点击放置不再互相干扰。",
    },
    {
      id: "dyson-upgrade",
      title: "戴森工程升级",
      description: "在轨太阳帆与壳面太阳帆统一为每帆 88 kW，结构点保持 960 kW；球壳设计可复制到其他恒星系，几何参数保留但施工进度不会复制。",
    },
    {
      id: "tray-and-quantity",
      title: "托盘管理与超大数量",
      description: "当前行星物资托盘支持筛选、全选、删除一半和二次确认。大数量统一使用万、亿和科学计数显示，悬停、键盘聚焦或手机点击可查看完整精确值。",
    },
    {
      id: "logistics-performance",
      title: "大规模物流性能",
      description: "物流塔匹配改用会话级索引和路线经济缓存。10、50、100、500 塔对比保持状态哈希一致，500 塔测量中位耗时下降约 80%。",
    },
    {
      id: "infinite-research",
      title: "无限科研长期曲线",
      description: "四项长期科技扩展到 Lv.1000，连续体演算封顶 Lv.23。超大宇宙矩阵成本使用精确整数结算，旧投入会守恒结转并保留历史等级。",
    },
    {
      id: "galactic-project",
      title: "银河终局工程预览",
      description: "新增四输入银河物资出口建筑、本地个人交付记录和宇宙联合空间站活动界面。服务器贡献确认、奖励与空间站本体仍在后续版本，当前活动开关保持关闭。",
    },
  ],
} as const;

const RELEASE_NOTE_ICONS: Record<(typeof CURRENT_RELEASE_NOTES.items)[number]["id"], LucideIcon> = {
  "production-refresh": Gauge,
  "production-correctness": Check,
  "dyson-upgrade": Orbit,
  "tray-and-quantity": Trash2,
  "logistics-performance": Route,
  "infinite-research": FlaskConical,
  "galactic-project": Activity,
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
