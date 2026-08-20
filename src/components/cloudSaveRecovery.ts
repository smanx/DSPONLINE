import type { CloudSaveMetadata, CloudSaveMode, CloudSaveSlot } from "../game/cloud";
import type { SaveInspection } from "../game/storage";

export const CLOUD_SAVE_MODE_OPTIONS: ReadonlyArray<{
  mode: CloudSaveMode;
  label: string;
  description: string;
}> = [
  { mode: "normal", label: "普通模式", description: "普通工厂" },
  { mode: "speedrun", label: "速通模式", description: "独立排行" },
];

export function cloudSaveModeLabel(mode: CloudSaveMode): string {
  return mode === "speedrun" ? "速通模式" : "普通模式";
}

export function cloudSaveSlotLabel(mode: CloudSaveMode, slot: CloudSaveSlot): string {
  return `${cloudSaveModeLabel(mode)} · ${slot === "main" ? "主存档" : `槽位 ${slot}`}`;
}

/**
 * Cloud routing is authoritative only after the downloaded envelope agrees
 * with both the selected mode and slot. Undefined metadata remains compatible
 * with older servers; an explicit conflicting value is never accepted.
 */
export function cloudRestoreTargetIssue(
  inspection: Pick<SaveInspection, "valid" | "mode" | "slot" | "issues">,
  metadata: Pick<CloudSaveMetadata, "mode" | "slot">,
  expectedMode: CloudSaveMode,
  expectedSlot: CloudSaveSlot,
): string | null {
  const target = cloudSaveSlotLabel(expectedMode, expectedSlot);
  if (!inspection.valid) return inspection.issues[0] ?? `${target}格式无效`;
  if (metadata.mode !== undefined && metadata.mode !== expectedMode) {
    return `云端元数据属于${cloudSaveModeLabel(metadata.mode)}，已阻止写入${target}`;
  }
  if (metadata.slot !== undefined && metadata.slot !== expectedSlot) {
    return `云端元数据属于${cloudSaveSlotLabel(expectedMode, metadata.slot)}，已阻止写入${target}`;
  }
  if (inspection.mode !== expectedMode) {
    return `下载正文属于${cloudSaveModeLabel(inspection.mode)}，已阻止写入${target}`;
  }
  const inspectedSlot = String(inspection.slot) as CloudSaveSlot;
  if (inspectedSlot !== expectedSlot) {
    return `下载正文属于${cloudSaveSlotLabel(expectedMode, inspectedSlot)}，已阻止写入${target}`;
  }
  return null;
}
