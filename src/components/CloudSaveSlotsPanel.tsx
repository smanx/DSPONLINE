import { CloudDownload, CloudUpload, HardDrive } from "lucide-react";
import type { CloudSaveMetadata, CloudSaveSlot } from "../game/cloud";
import type { SaveSlotId } from "../game/storage";

interface LocalCloudSlotSummary {
  slotId: SaveSlotId;
  valid: boolean;
  savedAt: number;
  elapsedSeconds: number;
  completedTechCount: number;
}

interface CloudSaveSlotsPanelProps {
  cloudSaves?: Partial<Record<CloudSaveSlot, CloudSaveMetadata | null>>;
  localSlots: LocalCloudSlotSummary[];
  busySlot?: CloudSaveSlot | null;
  uploadDisabled?: boolean;
  onUpload: (slot: Exclude<CloudSaveSlot, "main">) => void;
  onDownload: (slot: Exclude<CloudSaveSlot, "main">) => void;
}

const MANUAL_SLOTS = ["1", "2", "3"] as const;

function formatTime(value: number | undefined): string {
  return value ? new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "尚未保存";
}

function formatProgress(seconds: number | undefined, completedTechCount: number | undefined): string {
  if (seconds == null) return "无进度摘要";
  const hours = Math.floor(Math.max(0, seconds) / 3600);
  const minutes = Math.floor((Math.max(0, seconds) % 3600) / 60);
  return `${hours > 0 ? `${hours}小时${minutes}分` : `${minutes}分钟`} · 科技 ${completedTechCount ?? 0}`;
}

export function CloudSaveSlotsPanel({ cloudSaves, localSlots, busySlot = null, uploadDisabled = false, onUpload, onDownload }: CloudSaveSlotsPanelProps) {
  return <section className="cloud-manual-slots" aria-label="云端手动存档槽位">
    <header><HardDrive size={16} /><span><strong>手动云存档</strong><small>槽位 1–3 与主存档完全独立，自动同步不会覆盖</small></span></header>
    <div>
      {MANUAL_SLOTS.map((slot) => {
        const local = localSlots.find((candidate) => candidate.slotId === Number(slot) as SaveSlotId);
        const cloud = cloudSaves?.[slot] ?? null;
        return <article className={!local && !cloud ? "empty" : ""} key={slot} data-cloud-slot={slot}>
          <header><i>{slot}</i><span><strong>云端槽位 {slot}</strong><small>{formatTime(cloud?.updatedAt)}</small></span><em>{cloud ? `修订 ${cloud.revision}` : "空"}</em></header>
          <dl>
            <div><dt>本地槽位</dt><dd>{local ? `${formatTime(local.savedAt)} · ${formatProgress(local.elapsedSeconds, local.completedTechCount)}` : "空槽位"}</dd></div>
            <div><dt>云端进度</dt><dd>{cloud?.summary ? formatProgress(cloud.summary.elapsedSeconds, cloud.summary.completedTechCount) : cloud ? "旧存档摘要待刷新" : "空槽位"}</dd></div>
          </dl>
          <footer>
            <button type="button" disabled={Boolean(busySlot) || uploadDisabled || !local?.valid} onClick={() => onUpload(slot)} title={!local ? `本地槽位 ${slot} 为空` : `上传本地槽位 ${slot}`}><CloudUpload size={13} />上传</button>
            <button type="button" disabled={Boolean(busySlot) || !cloud} onClick={() => onDownload(slot)} title={`下载到本地槽位 ${slot}`}><CloudDownload size={13} />下载</button>
          </footer>
        </article>;
      })}
    </div>
  </section>;
}
