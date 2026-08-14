import type { SaveTransferVerification } from "./saveTransfer";

export const DEFAULT_SAVE_TRANSFER_DECODE_CHUNK_BYTES = 512 * 1024;

export interface SaveTransferDecodeProgress {
  processedBytes: number;
  totalBytes: number;
}

export interface SaveTransferDecodeOptions {
  chunkBytes?: number;
  yieldControl?: () => Promise<void>;
  onProgress?: (progress: SaveTransferDecodeProgress) => void;
}

function defaultYieldControl(): Promise<void> {
  const scheduler = (globalThis as typeof globalThis & { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (typeof scheduler?.yield === "function") return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Verify and decode a large Worker-produced save without one monolithic hash
 * loop or TextDecoder call on the UI thread. Streaming TextDecoder preserves
 * UTF-8 code points split across chunk boundaries; the completed string is not
 * returned until every byte has passed the original FNV-1a payload proof.
 */
export async function decodeVerifiedSaveTransferChunked(
  bytes: ArrayBuffer,
  verification: SaveTransferVerification,
  options: SaveTransferDecodeOptions = {},
): Promise<string> {
  if (verification.integrity !== "valid" || bytes.byteLength !== verification.byteLength) {
    throw new Error("后台存档传输长度校验失败");
  }
  const requestedChunkBytes = options.chunkBytes ?? DEFAULT_SAVE_TRANSFER_DECODE_CHUNK_BYTES;
  const chunkBytes = Math.max(16 * 1024, Math.floor(requestedChunkBytes));
  const yieldControl = options.yieldControl ?? defaultYieldControl;
  const source = new Uint8Array(bytes);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const decoded: string[] = [];
  let hash = 0x811c9dc5;
  for (let offset = 0; offset < source.byteLength; offset += chunkBytes) {
    const chunk = source.subarray(offset, Math.min(source.byteLength, offset + chunkBytes));
    for (let index = 0; index < chunk.byteLength; index += 1) {
      hash ^= chunk[index];
      hash = Math.imul(hash, 0x01000193);
    }
    decoded.push(decoder.decode(chunk, { stream: offset + chunk.byteLength < source.byteLength }));
    const processedBytes = offset + chunk.byteLength;
    options.onProgress?.({ processedBytes, totalBytes: source.byteLength });
    if (processedBytes < source.byteLength) await yieldControl();
  }
  decoded.push(decoder.decode());
  if ((hash >>> 0).toString(16).padStart(8, "0") !== verification.payloadChecksum) {
    throw new Error("后台存档传输哈希校验失败");
  }
  return decoded.join("");
}
