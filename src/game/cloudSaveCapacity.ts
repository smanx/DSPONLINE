import { CLOUD_TRANSFER_CONTRACT } from "./cloudTransferContract";

export const MIB_BYTES = CLOUD_TRANSFER_CONTRACT.mibBytes;

export interface CloudSaveCapacityDetails {
  originalBytes: number;
  compressedBytes: number | null;
  expandedBytes: number;
  payloadLimitBytes: number;
  compressedRequestLimitBytes: number;
  expandedRequestLimitBytes: number;
  remainingPayloadBytes: number;
  overPayloadBytes: number;
  compressionAvailable: boolean;
  rawFallbackAvailable: boolean;
}

function nonNegativeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

export function cloudSaveCapacityDetails(
  originalBytes: number,
  compressedBytes: number | null = null,
): CloudSaveCapacityDetails {
  const normalizedOriginal = nonNegativeInteger(originalBytes) ?? 0;
  const normalizedCompressed = compressedBytes === null ? null : nonNegativeInteger(compressedBytes);
  const payloadLimitBytes = CLOUD_TRANSFER_CONTRACT.savePayloadLimitBytes;
  return {
    originalBytes: normalizedOriginal,
    compressedBytes: normalizedCompressed,
    expandedBytes: normalizedOriginal,
    payloadLimitBytes,
    compressedRequestLimitBytes: CLOUD_TRANSFER_CONTRACT.requestCompressedLimitBytes,
    expandedRequestLimitBytes: CLOUD_TRANSFER_CONTRACT.requestExpandedLimitBytes,
    remainingPayloadBytes: Math.max(0, payloadLimitBytes - normalizedOriginal),
    overPayloadBytes: Math.max(0, normalizedOriginal - payloadLimitBytes),
    compressionAvailable: normalizedCompressed !== null && normalizedCompressed <= CLOUD_TRANSFER_CONTRACT.requestCompressedLimitBytes,
    rawFallbackAvailable: normalizedOriginal <= CLOUD_TRANSFER_CONTRACT.rawFallbackSafeLimitBytes,
  };
}

export function formatMebibytes(bytes: number): string {
  return `${(Math.max(0, bytes) / MIB_BYTES).toFixed(2)} MiB`;
}

export function cloudSaveSizeErrorMessage(details: CloudSaveCapacityDetails): string {
  const compressed = details.compressedBytes === null ? "尚未生成" : formatMebibytes(details.compressedBytes);
  const delta = details.overPayloadBytes > 0
    ? `超出 ${formatMebibytes(details.overPayloadBytes)}`
    : `剩余 ${formatMebibytes(details.remainingPayloadBytes)}`;
  return `云存档体积不符合当前服务端边界：原始 ${formatMebibytes(details.originalBytes)}，压缩后 ${compressed}，解压后 ${formatMebibytes(details.expandedBytes)}，单修订上限 ${formatMebibytes(details.payloadLimitBytes)}（${delta}）。本地存档和云端旧修订均未修改。`;
}

export function capacityDetailsFromCloudError(
  payload: Record<string, unknown>,
  fallbackOriginalBytes: number,
  fallbackCompressedBytes: number | null = null,
): CloudSaveCapacityDetails {
  const originalBytes = nonNegativeInteger(payload.originalBytes)
    ?? nonNegativeInteger(payload.payloadBytes)
    ?? fallbackOriginalBytes;
  const compressedBytes = nonNegativeInteger(payload.compressedBytes) ?? fallbackCompressedBytes;
  const expandedBytes = nonNegativeInteger(payload.expandedBytes) ?? originalBytes;
  const payloadLimitBytes = nonNegativeInteger(payload.payloadLimitBytes) ?? CLOUD_TRANSFER_CONTRACT.savePayloadLimitBytes;
  const expandedRequestLimitBytes = nonNegativeInteger(payload.expandedLimitBytes) ?? CLOUD_TRANSFER_CONTRACT.requestExpandedLimitBytes;
  const compressedRequestLimitBytes = nonNegativeInteger(payload.compressedLimitBytes) ?? CLOUD_TRANSFER_CONTRACT.requestCompressedLimitBytes;
  return {
    originalBytes,
    compressedBytes,
    expandedBytes,
    payloadLimitBytes,
    compressedRequestLimitBytes,
    expandedRequestLimitBytes,
    remainingPayloadBytes: Math.max(0, payloadLimitBytes - expandedBytes),
    overPayloadBytes: Math.max(0, expandedBytes - payloadLimitBytes),
    compressionAvailable: compressedBytes !== null && compressedBytes <= compressedRequestLimitBytes,
    rawFallbackAvailable: originalBytes <= CLOUD_TRANSFER_CONTRACT.rawFallbackSafeLimitBytes,
  };
}

export function cloudSaveDiagnosticText(input: {
  mode: "normal" | "speedrun";
  slot: "main" | "1" | "2" | "3";
  localRevision?: number | null;
  cloudRevision?: number | null;
  lastSuccessfulSyncAt?: number | null;
  status: string;
  errorCode?: string | null;
  sizes?: CloudSaveCapacityDetails | null;
}): string {
  const lines = [
    "DSPidle2 云存档诊断（不含存档正文与账号凭据）",
    `模式: ${input.mode}`,
    `槽位: ${input.slot}`,
    `本地修订: ${input.localRevision ?? "unknown"}`,
    `云端修订: ${input.cloudRevision ?? "none"}`,
    `最近成功同步: ${input.lastSuccessfulSyncAt ? new Date(input.lastSuccessfulSyncAt).toISOString() : "none"}`,
    `状态: ${input.status}`,
    `错误码: ${input.errorCode ?? "none"}`,
  ];
  if (input.sizes) {
    lines.push(
      `原始大小: ${input.sizes.originalBytes}`,
      `压缩大小: ${input.sizes.compressedBytes ?? "unknown"}`,
      `解压大小: ${input.sizes.expandedBytes}`,
      `单修订上限: ${input.sizes.payloadLimitBytes}`,
      `压缩请求上限: ${input.sizes.compressedRequestLimitBytes}`,
      `解压请求上限: ${input.sizes.expandedRequestLimitBytes}`,
    );
  }
  return lines.join("\n");
}
