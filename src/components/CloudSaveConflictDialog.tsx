import { CloudDownload, CloudUpload, GitCompareArrows, LoaderCircle, X } from "lucide-react";
import type { CloudSaveMetadata, CloudSaveSummary } from "../game/cloud";

interface CloudSaveConflictDialogProps {
  local: CloudSaveSummary | null;
  cloud: CloudSaveMetadata;
  busy?: boolean;
  onUseCloud: () => void;
  onKeepLocal: () => void;
  onCancel: () => void;
}

function formatRuntime(seconds: number | undefined): string {
  const hours = Math.floor(Math.max(0, seconds ?? 0) / 3600);
  const minutes = Math.floor((Math.max(0, seconds ?? 0) % 3600) / 60);
  return hours > 0 ? `${hours} 小时 ${minutes} 分` : `${minutes} 分钟`;
}

function formatTime(value: number | undefined): string {
  return value ? new Date(value).toLocaleString("zh-CN") : "未知";
}

function Summary({ title, summary, revision }: { title: string; summary: CloudSaveSummary | null; revision?: number }) {
  return <section>
    <header><strong>{title}</strong><small>{revision ? `修订 ${revision}` : "本地"}</small></header>
    <dl>
      <div><dt>保存时间</dt><dd>{formatTime(summary?.savedAt)}</dd></div>
      <div><dt>运行时间</dt><dd>{formatRuntime(summary?.elapsedSeconds)}</dd></div>
      <div><dt>设备</dt><dd>{summary?.entityCount ?? "--"}</dd></div>
      <div><dt>科技</dt><dd>{summary?.completedTechCount ?? "--"}</dd></div>
    </dl>
  </section>;
}

export function CloudSaveConflictDialog({ local, cloud, busy = false, onUseCloud, onKeepLocal, onCancel }: CloudSaveConflictDialogProps) {
  return <div className="cloud-save-conflict" role="presentation">
    <section role="alertdialog" aria-modal="true" aria-label="云存档冲突">
      <header><GitCompareArrows size={19} /><span><strong>本地与云端都有不同进度</strong><small>请选择本次保留方向，另一份会保留为恢复点</small></span><button type="button" title="稍后处理" aria-label="稍后处理" onClick={onCancel} disabled={busy}><X size={15} /></button></header>
      <div className="cloud-save-conflict-comparison"><Summary title="当前本地工厂" summary={local} /><Summary title="云端工厂" summary={cloud.summary} revision={cloud.revision} /></div>
      <footer>
        <button type="button" disabled={busy} onClick={onCancel}>稍后处理</button>
        <button type="button" disabled={busy} onClick={onUseCloud}>{busy ? <LoaderCircle size={14} /> : <CloudDownload size={14} />}使用云端版本</button>
        <button className="primary" type="button" disabled={busy} onClick={onKeepLocal}>{busy ? <LoaderCircle size={14} /> : <CloudUpload size={14} />}保留本地并新建云修订</button>
      </footer>
    </section>
  </div>;
}
