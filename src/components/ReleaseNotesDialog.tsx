import { Activity, Check, Gauge, Info, Layers, MessageCircle, RefreshCw, Route, Shield, ShieldCheck, SkipForward, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { NATIVE_BACK_EVENT } from "../nativeApp";

export const RELEASE_NOTES_SEEN_KEY = "dsp-idle-network.release-notes.seen.v1";

export const CURRENT_RELEASE_NOTES = {
  id: "2026-08-02-v1.0.23",
  date: "2026年8月2日",
  version: "1.0.23",
  title: "云存档上传热修与取消保护",
  summary: "1.0.23 修复安卓和桌面浏览器云存档压缩死锁、上传卡住和误报成功；离线结算、存档内容和云端冲突保护保持兼容。GameState v46、存档 envelope v2 与云 schema v7 不变。",
  items: [
    {
      id: "cloud-compression-stream",
      title: "修复压缩流死锁",
      description: "云存档改为边读取边压缩并持续消费 gzip 流，1 MB、2 MB 和 7 MB 级别的存档不会再因为先写后读形成永久等待。",
    },
    {
      id: "cloud-raw-fallback",
      title: "压缩失败安全回退",
      description: "浏览器不支持压缩、压缩异常或压缩阶段超时时，只在原始请求不超过 30 MiB 时发送一次明文 JSON；超限会明确报错，不改本地存档。",
    },
    {
      id: "cloud-timeout-confirm",
      title: "网络超时先核对云端",
      description: "网络请求超时后先读取远端修订号、校验值、时间和摘要；已提交才判定成功，未提交才允许同一 expectedRevision 的一次明文重试。",
    },
    {
      id: "cloud-cancel",
      title: "取消上传立即生效",
      description: "压缩、离线结算和上传都接入 AbortController；玩家主动取消后不发送明文回退请求，本地有效存档、备份和快照保持不变。",
    },
    {
      id: "cloud-stage-status",
      title: "上传阶段状态真实反馈",
      description: "准备、离线结算、生成校验、压缩、发送和等待确认阶段统一显示进行中状态，只有服务器确认新修订后才显示绿色成功。",
    },
    {
      id: "cloud-metadata-refresh",
      title: "成功后刷新云端摘要",
      description: "上传成功后立即刷新云端时间、运行时长、科技数量和修订号，避免页面继续显示旧的云存档状态。",
    },
    {
      id: "offline-skip",
      title: "离线结算可以跳过",
      description: "进入游戏或上传云存档时可以放弃过长的离线运算并继续；跳过不会发放离线收益，也不会在下次加载重复结算。",
    },
    {
      id: "local-save-protection",
      title: "失败不覆盖本地存档",
      description: "云端确认前不写回主存档；上传失败、取消或状态未知时保留本地有效版本，冲突仍进入明确的选择流程。",
    },
    {
      id: "cloud-entry-points",
      title: "所有上传入口统一保护",
      description: "主存档手动上传、十分钟自动同步、手动槽位 1–3、银河页面和冲突覆盖上传共用同一压缩、重试、取消和修订保护。",
    },
    {
      id: "cloud-compatibility",
      title: "存档和云协议保持兼容",
      description: "不升级 GameState v46、存档 envelope v2、云 schema v7 或 SQLite layout v2，不改变生产、物流、库存、离线收益和排行榜规则。",
    },
    {
      id: "cloud-revision-safety",
      title: "避免重复创建云端修订",
      description: "相同状态不会重复创建云端修订；请求超时、409 冲突、格式错误、完整性错误、体积错误和网络错误继续分别提示。",
    },
  ],
} as const;

const RELEASE_NOTE_ICONS: Record<(typeof CURRENT_RELEASE_NOTES.items)[number]["id"], LucideIcon> = {
  "cloud-compression-stream": Route,
  "cloud-raw-fallback": Shield,
  "cloud-timeout-confirm": RefreshCw,
  "cloud-cancel": X,
  "cloud-stage-status": Activity,
  "cloud-metadata-refresh": Info,
  "offline-skip": SkipForward,
  "local-save-protection": ShieldCheck,
  "cloud-entry-points": Layers,
  "cloud-compatibility": Check,
  "cloud-revision-safety": Gauge,
};

export function hasSeenCurrentReleaseNotes(): boolean {
  try {
    if (window.localStorage.getItem(RELEASE_NOTES_SEEN_KEY) === CURRENT_RELEASE_NOTES.id) return true;
    // Isolated browser fixtures intentionally bypass first-run chrome. This
    // keeps older release fixtures deterministic without hiding new notes for
    // real players who have already seen a previous version.
    const isReleaseNotesTest = new URLSearchParams(window.location.search).get("releaseNotesTest") === "1";
    return !isReleaseNotesTest && window.sessionStorage.getItem("dsp-idle-network.test-bypass-menu") === "1";
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
