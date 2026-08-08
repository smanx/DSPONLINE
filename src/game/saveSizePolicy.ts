export const MIB_BYTES = 1024 * 1024;
export const CLOUD_SAVE_RAW_SAFE_LIMIT_BYTES = 30 * MIB_BYTES;
export const CLOUD_SAVE_NEAR_LIMIT_BYTES = 28 * MIB_BYTES;
export const CLOUD_SAVE_ENDGAME_WARNING_BYTES = 20 * MIB_BYTES;

export type SavePayloadSizeTier = "small" | "medium" | "large" | "endgame" | "near-limit" | "over-raw-limit";

export interface SavePayloadSizeAssessment {
  bytes: number;
  mebibytes: number;
  tier: SavePayloadSizeTier;
  warning: string | null;
  rawFallbackAllowed: boolean;
}

export function assessSavePayloadSize(bytes: number): SavePayloadSizeAssessment {
  const normalized = Number.isFinite(bytes) ? Math.max(0, Math.floor(bytes)) : 0;
  const tier: SavePayloadSizeTier = normalized > CLOUD_SAVE_RAW_SAFE_LIMIT_BYTES
    ? "over-raw-limit"
    : normalized >= CLOUD_SAVE_NEAR_LIMIT_BYTES
      ? "near-limit"
      : normalized >= CLOUD_SAVE_ENDGAME_WARNING_BYTES
        ? "endgame"
        : normalized >= 7 * MIB_BYTES
          ? "large"
          : normalized >= MIB_BYTES ? "medium" : "small";
  const warning = tier === "over-raw-limit"
    ? "存档原始请求已超过 30 MiB 安全回退上限；浏览器 gzip 失败时无法改用明文上传，请先导出本地备份"
    : tier === "near-limit"
      ? "存档已接近 30 MiB 云上传安全边界；建议立即导出备份，并关注后续建筑与蓝图增长"
      : tier === "endgame"
        ? "这是 20 MiB 级终局存档；保存和上传会在 Worker 中执行并支持取消，但低内存设备可能自动降级"
        : null;
  return {
    bytes: normalized,
    mebibytes: normalized / MIB_BYTES,
    tier,
    warning,
    rawFallbackAllowed: normalized <= CLOUD_SAVE_RAW_SAFE_LIMIT_BYTES,
  };
}

export function utf8Bytes(value: string): number {
  try {
    return new TextEncoder().encode(value).byteLength;
  } catch {
    return value.length;
  }
}
