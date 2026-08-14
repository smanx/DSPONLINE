import { describe, expect, it, vi } from "vitest";
import { computeSavePayloadChecksum, type SaveTransferVerification } from "./saveTransfer";
import { decodeVerifiedSaveTransferChunked } from "./saveTransferDecode";

function fixture(text: string): { bytes: ArrayBuffer; verification: SaveTransferVerification } {
  const encoded = new TextEncoder().encode(text);
  const bytes = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
  return {
    bytes,
    verification: {
      integrity: "valid",
      stateChecksum: "state-proof",
      payloadChecksum: computeSavePayloadChecksum(bytes),
      byteLength: bytes.byteLength,
    },
  };
}

describe("chunked verified save transfer decode", () => {
  it("preserves exact UTF-8 text across chunk boundaries while yielding", async () => {
    const text = `${"工厂🌌".repeat(12_000)}-exact-tail`;
    const { bytes, verification } = fixture(text);
    const yieldControl = vi.fn(async () => undefined);
    const progress: number[] = [];
    await expect(decodeVerifiedSaveTransferChunked(bytes, verification, {
      chunkBytes: 16 * 1024,
      yieldControl,
      onProgress: (entry) => progress.push(entry.processedBytes),
    })).resolves.toBe(text);
    expect(yieldControl).toHaveBeenCalled();
    expect(progress.at(-1)).toBe(bytes.byteLength);
  });

  it("rejects length and byte corruption before returning a payload", async () => {
    const source = fixture("verified payload");
    await expect(decodeVerifiedSaveTransferChunked(source.bytes, { ...source.verification, byteLength: source.bytes.byteLength + 1 }))
      .rejects.toThrow("长度");
    const corrupted = source.bytes.slice(0);
    new Uint8Array(corrupted)[0] ^= 1;
    await expect(decodeVerifiedSaveTransferChunked(corrupted, source.verification, { yieldControl: async () => undefined }))
      .rejects.toThrow("哈希");
  });
});
