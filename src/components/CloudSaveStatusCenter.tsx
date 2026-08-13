import { Activity, Check, ClipboardCopy, Cloud, CloudOff, Download, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getCloudSyncMarker, type CloudSaveMetadata, type CloudSaveMode, type CloudSaveSlot, type CloudSyncState } from "../game/cloud";
import { cloudSaveDiagnosticText, formatMebibytes, type CloudSaveCapacityDetails } from "../game/cloudSaveCapacity";
import { readCloudSyncStatus, type CloudSyncOperationState, type CloudSyncStatusSnapshot } from "../game/cloudSyncStatus";

interface CloudSaveStatusCenterProps {
  userId: string;
  mode: CloudSaveMode;
  slot: CloudSaveSlot;
  localRevision?: number | null;
  cloud: CloudSaveMetadata | null;
  comparison: CloudSyncState | null;
  active?: boolean;
  message?: string | null;
  errorCode?: string | null;
  capacity?: CloudSaveCapacityDetails | null;
  onRetry?: () => void;
  onCancel?: () => void;
  onExportLocal?: () => void;
  onExportCloud?: () => void;
}

function statusLabel(state: CloudSyncOperationState): string {
  if (state === "preparing") return "准备存档";
  if (state === "compressing") return "正在压缩";
  if (state === "uploading") return "正在上传";
  if (state === "confirming") return "等待精确确认";
  if (state === "success") return "同步成功";
  if (state === "conflict") return "版本冲突";
  if (state === "failed") return "同步失败";
  if (state === "cancelled") return "已取消";
  if (state === "restored") return "已恢复";
  return "等待操作";
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function CloudSaveStatusCenter(props: CloudSaveStatusCenterProps) {
  const marker = getCloudSyncMarker(props.userId, props.slot, props.mode);
  const [snapshot, setSnapshot] = useState<CloudSyncStatusSnapshot | null>(() => readCloudSyncStatus(props.mode, props.slot));
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setSnapshot(readCloudSyncStatus(props.mode, props.slot));
    const listener = (event: Event) => {
      const value = (event as CustomEvent<CloudSyncStatusSnapshot>).detail;
      if (value?.mode === props.mode && value.slot === props.slot) setSnapshot(value);
    };
    window.addEventListener("dsp:cloud-sync-status", listener);
    return () => window.removeEventListener("dsp:cloud-sync-status", listener);
  }, [props.mode, props.slot]);
  const state: CloudSyncOperationState = props.active
    ? snapshot?.state === "confirming" ? "confirming" : snapshot?.state === "compressing" ? "compressing" : "uploading"
    : snapshot?.state ?? (props.comparison === "conflict" ? "conflict" : "idle");
  // Capacity diagnostics are scoped to mode + slot. Do not surface the last
  // global upload here because it may belong to the other save mode or slot.
  const sizes = props.capacity ?? snapshot?.sizes ?? null;
  const effectiveMessage = props.message ?? snapshot?.message ?? "本地和云端修订会在提交成功后更新；失败不会覆盖旧云存档。";
  const lastSuccessfulSyncAt = marker?.syncedAt ?? snapshot?.lastSuccessfulSyncAt ?? null;
  const diagnosticText = useMemo(() => cloudSaveDiagnosticText({
    mode: props.mode,
    slot: props.slot,
    localRevision: props.localRevision ?? snapshot?.localRevision,
    cloudRevision: props.cloud?.revision ?? snapshot?.cloudRevision,
    lastSuccessfulSyncAt,
    status: `${state}/${props.comparison ?? snapshot?.comparison ?? "unknown"}`,
    errorCode: props.errorCode ?? snapshot?.errorCode,
    sizes,
  }), [lastSuccessfulSyncAt, props.cloud?.revision, props.comparison, props.errorCode, props.localRevision, props.mode, props.slot, sizes, snapshot, state]);
  return <section className={`cloud-save-status-center cloud-save-status-center--${state}`} aria-label="云存档状态中心">
    <header>{state === "success" ? <Check size={18} /> : state === "failed" || state === "conflict" ? <CloudOff size={18} /> : state === "idle" ? <Cloud size={18} /> : <Activity size={18} />}<span><small>{props.mode === "speedrun" ? "速通模式" : "普通模式"} · {props.slot === "main" ? "主存档" : `槽位 ${props.slot}`}</small><strong>{statusLabel(state)}</strong></span><em>{props.comparison ?? snapshot?.comparison ?? "未比较"}</em></header>
    <dl>
      <div><dt>本地修订</dt><dd>{props.localRevision ?? snapshot?.localRevision ?? "--"}</dd></div>
      <div><dt>云端修订</dt><dd>{props.cloud?.revision ?? snapshot?.cloudRevision ?? "--"}</dd></div>
      <div><dt>最近成功</dt><dd>{lastSuccessfulSyncAt ? new Date(lastSuccessfulSyncAt).toLocaleString("zh-CN") : "尚未同步"}</dd></div>
      <div><dt>提交状态</dt><dd>{state === "confirming" ? "服务器可能已收到，正在按修订与 SHA-256 核对" : statusLabel(state)}</dd></div>
    </dl>
    {sizes ? <div className="cloud-save-status-center__sizes"><span>原始 <strong>{formatMebibytes(sizes.originalBytes)}</strong></span><span>压缩 <strong>{sizes.compressedBytes === null ? "--" : formatMebibytes(sizes.compressedBytes)}</strong></span><span>解压 <strong>{formatMebibytes(sizes.expandedBytes)}</strong></span><span>上限 <strong>{formatMebibytes(sizes.payloadLimitBytes)}</strong></span><span>{sizes.overPayloadBytes > 0 ? "超出" : "剩余"} <strong>{formatMebibytes(sizes.overPayloadBytes || sizes.remainingPayloadBytes)}</strong></span></div> : null}
    {sizes ? <div className="cloud-save-status-center__capabilities" aria-label="云存档传输能力"><span>gzip：{sizes.compressedBytes === null ? "等待预检" : sizes.compressionAvailable ? "可用" : "压缩后仍超限"}</span><span>分块上传：未启用</span><span>存档瘦身：{sizes.overPayloadBytes > 0 ? "需要" : "当前无需"}</span></div> : null}
    <p>{effectiveMessage}</p>
    <footer>
      {props.onRetry && !props.active ? <button type="button" onClick={props.onRetry}><RefreshCw size={14} />安全重试</button> : null}
      {props.onCancel && props.active ? <button type="button" onClick={props.onCancel}><X size={14} />取消</button> : null}
      {props.onExportLocal ? <button type="button" onClick={props.onExportLocal}><Download size={14} />导出本地副本</button> : null}
      {props.onExportCloud && props.cloud ? <button type="button" onClick={props.onExportCloud}><ShieldCheck size={14} />导出云端副本</button> : null}
      <button type="button" onClick={() => void copyText(diagnosticText).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1_500); })}><ClipboardCopy size={14} />{copied ? "已复制" : "复制脱敏诊断"}</button>
    </footer>
  </section>;
}
