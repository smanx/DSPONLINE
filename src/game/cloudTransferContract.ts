import contract from "../../cloud-transfer-contract.json";

function assertCloudTransferContract(value: typeof contract): void {
  const positiveIntegers = [
    value.version,
    value.mibBytes,
    value.guaranteedSavePayloadBytes,
    value.savePayloadLimitBytes,
    value.rawFallbackSafeLimitBytes,
    value.requestCompressedLimitBytes,
    value.requestExpandedLimitBytes,
    value.legacyJsonRequestLimitBytes,
    value.singleSaveResponseLimitBytes,
    value.baseTimeoutMs,
    value.timeoutPerMibMs,
    value.maximumTimeoutMs,
    value.compressionTimeoutMs,
    value.ipcChunkBytes,
  ];
  if (!positiveIntegers.every((entry) => Number.isSafeInteger(entry) && entry > 0) ||
    value.guaranteedSavePayloadBytes > value.savePayloadLimitBytes ||
    value.savePayloadLimitBytes > value.requestExpandedLimitBytes ||
    value.rawFallbackSafeLimitBytes > value.savePayloadLimitBytes ||
    value.baseTimeoutMs > value.maximumTimeoutMs ||
    ![value.directPayloadContentType, value.expectedRevisionHeader, value.requestIdHeader, value.originalBytesHeader, value.compressedBytesHeader]
      .every((entry) => typeof entry === "string" && entry.length > 0)) {
    throw new Error("云存档传输契约无效");
  }
}

assertCloudTransferContract(contract);
export const CLOUD_TRANSFER_CONTRACT = Object.freeze(contract);

export function cloudRequestTimeoutMs(requestBytes = 0, responseBytes = 0): number {
  const transferBytes = Math.max(0, Number.isFinite(requestBytes) ? requestBytes : 0) +
    Math.max(0, Number.isFinite(responseBytes) ? responseBytes : 0);
  const mebibytes = Math.ceil(transferBytes / contract.mibBytes);
  return Math.min(contract.maximumTimeoutMs, contract.baseTimeoutMs + mebibytes * contract.timeoutPerMibMs);
}

export function createCloudRequestId(): string {
  try { return `cloud_${crypto.randomUUID()}`; } catch { return `cloud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`; }
}

export function validCloudExpectedRevision(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
