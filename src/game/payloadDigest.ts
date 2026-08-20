/** Compute the server-compatible SHA-256 of the exact UTF-8 upload text. */
export async function sha256Text(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle || typeof TextEncoder === "undefined") {
    throw new Error("当前环境不支持云存档 SHA-256 校验");
  }
  return sha256Bytes(new TextEncoder().encode(value));
}

export async function sha256Bytes(value: BufferSource): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("当前环境不支持云存档 SHA-256 校验");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
