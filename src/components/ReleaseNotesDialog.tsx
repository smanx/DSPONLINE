import { Check, Database, Infinity as InfinityIcon, Info, Languages, MessageCircle, PackageOpen, Route, ScanText, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { NATIVE_BACK_EVENT } from "../nativeApp";

export const RELEASE_NOTES_SEEN_KEY = "dsp-idle-network.release-notes.seen.v1";

export const CURRENT_RELEASE_NOTES = {
  id: "2026-07-29-v1.0.9",
  date: "2026年7月29日",
  version: "1.0.9",
  title: "跨端存档与高吞吐稳定性更新",
  summary: "1.0.9 将本地存档迁移到 IndexedDB，修复多线路高吞吐分配和移动端组合输入，并升级声明式内容包。空间站收集任务改为长期开放，主页可直接切换中英文。GameState 升级至 v40。",
  items: [
    {
      id: "indexeddb-save-resilience",
      title: "IndexedDB 可靠存档",
      description: "主档、备份、快照和三个槽位迁入大容量存储，写入后必须读回校验。旧 localStorage 副本验证迁移后才删除，并新增占用明细与快照批量管理。",
    },
    {
      id: "belt-fairness-capacity",
      title: "高吞吐线路公平分配",
      description: "同优先级输出按确定性轮询公平分配，高、标准、低优先级继续生效。矿源和生产输出不再被单步缓存误限流，线路转运额度可配置到 1 亿。",
    },
    {
      id: "content-pack-v2",
      title: "声明式内容包 v2",
      description: "内容包可新增物品、建筑、配方、科技和 4～32 级传送带，并通过白名单调整核心建筑数值。存档记录精确包版本，缺包会阻止加载，Mod 主档不进入官方排行。",
    },
    {
      id: "mobile-input-clarity",
      title: "移动输入与文字清晰度",
      description: "注册输入框正确保留中文输入法组合态和其他字段；静止抽屉移除长期 transform，拖动与画布视口按设备像素对齐，减少偶发文字模糊。",
    },
    {
      id: "permanent-galactic-activity",
      title: "空间站收集任务长期开放",
      description: "取消活动结束倒计时。原截止点之后仍可放置超大型物资出口并继续提交四项物资，本地贡献记录完整保留。",
    },
    {
      id: "prominent-language-switch",
      title: "主页语言切换",
      description: "主菜单首屏顶部常驻中文与 English 切换，无需进入设置；语言仍只保存在当前设备，不写入本地或云端游戏存档。",
    },
  ],
} as const;

const RELEASE_NOTE_ICONS: Record<(typeof CURRENT_RELEASE_NOTES.items)[number]["id"], LucideIcon> = {
  "indexeddb-save-resilience": Database,
  "belt-fairness-capacity": Route,
  "content-pack-v2": PackageOpen,
  "mobile-input-clarity": ScanText,
  "permanent-galactic-activity": InfinityIcon,
  "prominent-language-switch": Languages,
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
