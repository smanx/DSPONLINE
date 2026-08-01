import { Check, Focus, Gauge, Info, Layers, MessageCircle, Route, Sparkles, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { NATIVE_BACK_EVENT } from "../nativeApp";

export const RELEASE_NOTES_SEEN_KEY = "dsp-idle-network.release-notes.seen.v1";

export const CURRENT_RELEASE_NOTES = {
  id: "2026-08-02-v1.0.21",
  date: "2026年8月2日",
  version: "1.0.21",
  title: "紧急稳定性、云存档与蓝图界面更新",
  summary: "1.0.21 针对大存档云上传、终局工厂卡顿和蓝图界面进行了稳定性修复；默认模拟结果、产量、库存、线路和在途物资不变。GameState v46、存档 envelope v2 与云 schema v7 保持兼容。",
  items: [
    {
      id: "cloud-save-boundary",
      title: "大存档云上传边界",
      description: "云存档原始请求上限由 8 MiB 提高至 32 MiB，并限制压缩与解压后的大小；格式、完整性、压缩和体积错误分别提示，失败请求不会覆盖上一份有效云档。",
    },
    {
      id: "service-worker-cache",
      title: "修复 PWA 缓存响应错误",
      description: "Service Worker 在页面读取响应前同步创建缓存副本，避免更新或离线启动时出现“响应正文已使用”的错误。",
    },
    {
      id: "endgame-extreme",
      title: "终局优化·极限模式",
      description: "设置中新增设备级极限模式，降低非关键画面、线路动画、粒子和普通读数刷新；模拟时间、产量、物流、库存和存档结果不变。",
    },
    {
      id: "belt-observation",
      title: "终局线路观测降负",
      description: "传送带流量观测优先处理当前行星、可见或选中的线路，减少全星区复制和扫描，视口外线路仍保留生产与运输结果。",
    },
    {
      id: "react-flow-incremental",
      title: "画布增量渲染与更新保护",
      description: "拓扑、运行数据和选择状态分开更新；未变化的节点和线路复用对象，减少重复 setNodes/setEdges、节点测量和 React 更新循环。",
    },
    {
      id: "blueprint-compact",
      title: "蓝图精简与详细模式",
      description: "蓝图库默认使用稳定高度的精简卡片，部署和排队部署按钮保持可见；需要时可打开单个蓝图的完整参数，不改变蓝图、材料和施工规则。",
    },
    {
      id: "black-hole-blueprint",
      title: "巨构蓝图记忆启用意图",
      description: "微型黑洞连接装置蓝图可以记住部署后启用或停用意图；自动启用仍需危险确认，运行计数和临时缓存不会从来源建筑复制。",
    },
    {
      id: "save-short-circuit",
      title: "保存重复短路",
      description: "最近一次已验证的不可变存档状态未变化时，自动保存跳过重复序列化和写入；状态变化、写入失败或主键变化会自动回到完整保存路径。",
    },
    {
      id: "simulation-delta-experiment",
      title: "增量 Worker 协议（实验）",
      description: "新增带 revision 边界的增量状态协议，但默认仍使用完整状态；仅本地开发开关开启时试用，首次加载、命令边界和不匹配会回退安全路径。",
    },
    {
      id: "canvas-batch-experiment",
      title: "批量传送带绘制层（实验）",
      description: "新增可选的批量线路绘制层，仅在极限模式、线路达到阈值且开发开关开启时使用；建筑、选中线路、命中和连接预览继续使用原交互路径。",
    },
    {
      id: "multicore-guardrail",
      title: "多 Worker 安全门槛（实验）",
      description: "新增多 Worker 实验规划器，只有工作量足够且基准提升超过 15% 才允许规划，正式模拟默认保持单权威 Worker，手机不强制多核。",
    },
  ],
} as const;

const RELEASE_NOTE_ICONS: Record<(typeof CURRENT_RELEASE_NOTES.items)[number]["id"], LucideIcon> = {
  "cloud-save-boundary": Info,
  "service-worker-cache": Route,
  "endgame-extreme": Gauge,
  "belt-observation": Focus,
  "react-flow-incremental": Layers,
  "blueprint-compact": Layers,
  "black-hole-blueprint": Sparkles,
  "save-short-circuit": Check,
  "simulation-delta-experiment": Route,
  "canvas-batch-experiment": Layers,
  "multicore-guardrail": Gauge,
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
