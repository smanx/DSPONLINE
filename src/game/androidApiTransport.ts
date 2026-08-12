import { CLOUD_TRANSFER_CONTRACT, cloudRequestTimeoutMs } from "./cloudTransferContract";

function isAndroidNativeRuntime(): boolean {
  return typeof __APP_PLATFORM__ !== "undefined" && __APP_PLATFORM__ === "android";
}

export function androidBase64FileSupported(userAgent = globalThis.navigator?.userAgent ?? ""): boolean {
  const match = /Android\s+(\d+)/i.exec(userAgent);
  return Boolean(match && Number(match[1]) >= 8);
}

function normalizedHeaders(headers?: HeadersInit): Record<string, string> {
  const result: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => { result[key] = value; });
  return result;
}

function responseBody(data: unknown): BodyInit | null {
  if (data == null) return null;
  return typeof data === "string" ? data : JSON.stringify(data);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkBytes = 32 * 1024;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkBytes) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.byteLength, offset + chunkBytes)));
  }
  return btoa(binary);
}

/**
 * Android keeps JSON/text on the native bridge, but may send gzip as base64 so
 * no Blob or ArrayBuffer crosses the Capacitor bridge. Web and Electron return
 * null and stay on their established transports.
 */
export async function androidApiFetch(input: string, init: RequestInit): Promise<Response | null> {
  const gzipBlob = typeof Blob !== "undefined" && init.body instanceof Blob && new Headers(init.headers).get("content-encoding") === "gzip";
  if (!isAndroidNativeRuntime() || !androidBase64FileSupported() || !/^https:\/\//i.test(input) || !gzipBlob) return null;
  const { Capacitor, CapacitorHttp } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return null;
  if (init.signal?.aborted) throw new DOMException("云存档上传已取消", "AbortError");
  const headers = normalizedHeaders(init.headers);
  let data: unknown = init.body;
  if (typeof Blob !== "undefined" && init.body instanceof Blob) {
    const bytes = new Uint8Array(await init.body.arrayBuffer());
    data = bytesToBase64(bytes);
  }
  const transferBytes = typeof data === "string" ? new TextEncoder().encode(data).byteLength : 0;
  const timeoutMs = cloudRequestTimeoutMs(transferBytes);
  const request = CapacitorHttp.request({
    url: input,
    method: init.method ?? "GET",
    headers,
    data,
    dataType: "file",
    connectTimeout: timeoutMs,
    readTimeout: timeoutMs,
    disableRedirects: true,
    responseType: "text",
  });
  const abort = new Promise<never>((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(new DOMException("云存档上传已取消", "AbortError")), { once: true });
  });
  const response = await Promise.race([request, abort]);
  return new Response(response.status === 204 || response.status === 205 ? null : responseBody(response.data), {
    status: response.status,
    headers: response.headers,
  });
}

export function androidBase64RequestSupported(): boolean {
  return isAndroidNativeRuntime() && androidBase64FileSupported() && CLOUD_TRANSFER_CONTRACT.requestCompressedLimitBytes > 0;
}
