import type { CloudSaveMetadata, CloudSaveMode, CloudSaveSlot, CloudSyncState, CloudUploadDiagnostics } from "./cloud";
import type { CloudSaveCapacityDetails } from "./cloudSaveCapacity";

export type CloudSyncOperationState =
  | "idle"
  | "preparing"
  | "compressing"
  | "uploading"
  | "confirming"
  | "success"
  | "conflict"
  | "failed"
  | "cancelled"
  | "restored";

export interface CloudSyncStatusSnapshot {
  mode: CloudSaveMode;
  slot: CloudSaveSlot;
  state: CloudSyncOperationState;
  comparison: CloudSyncState | null;
  localRevision: number | null;
  cloudRevision: number | null;
  lastSuccessfulSyncAt: number | null;
  message: string;
  errorCode: string | null;
  sizes: CloudSaveCapacityDetails | null;
  updatedAt: number;
}

const STORAGE_KEY = "dsp-idle-network.cloud-sync-status.v1";

function targetKey(mode: CloudSaveMode, slot: CloudSaveSlot): string {
  return `${mode}:${slot}`;
}

function readAll(): Record<string, CloudSyncStatusSnapshot> {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, CloudSyncStatusSnapshot>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function readCloudSyncStatus(mode: CloudSaveMode, slot: CloudSaveSlot): CloudSyncStatusSnapshot | null {
  return readAll()[targetKey(mode, slot)] ?? null;
}

export function writeCloudSyncStatus(snapshot: CloudSyncStatusSnapshot): void {
  try {
    const values = readAll();
    values[targetKey(snapshot.mode, snapshot.slot)] = snapshot;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    window.dispatchEvent(new CustomEvent("dsp:cloud-sync-status", { detail: snapshot }));
  } catch { /* transient diagnostics are optional */ }
}

export function cloudSyncStatusFromUpload(
  mode: CloudSaveMode,
  slot: CloudSaveSlot,
  state: CloudSyncOperationState,
  input: {
    comparison?: CloudSyncState | null;
    localRevision?: number | null;
    cloud?: CloudSaveMetadata | null;
    lastSuccessfulSyncAt?: number | null;
    message: string;
    errorCode?: string | null;
    diagnostics?: CloudUploadDiagnostics | null;
    sizes?: CloudSaveCapacityDetails | null;
  },
): CloudSyncStatusSnapshot {
  const previous = readCloudSyncStatus(mode, slot);
  return {
    mode,
    slot,
    state,
    comparison: input.comparison ?? previous?.comparison ?? null,
    localRevision: input.localRevision ?? previous?.localRevision ?? null,
    cloudRevision: input.cloud?.revision ?? previous?.cloudRevision ?? null,
    lastSuccessfulSyncAt: input.lastSuccessfulSyncAt ?? (state === "success" ? Date.now() : previous?.lastSuccessfulSyncAt ?? null),
    message: input.message,
    errorCode: input.errorCode ?? null,
    sizes: input.sizes ?? input.diagnostics?.capacity ?? previous?.sizes ?? null,
    updatedAt: Date.now(),
  };
}
