import { CLOUD_TRANSFER_CONTRACT, cloudRequestTimeoutMs } from "./cloudTransferContract";

const ANDROID_SECURE_SESSION_PLUGIN = "DspSecureSession";
const ANDROID_SECURE_SESSION_PREFIX = "dsp_android_session_v1_";
const CLOUD_TOKEN_STORAGE_KEY = "dsp-idle-network.cloud-token.v1";

interface AndroidSecureSessionPlugin {
  request(options: {
    url: string;
    method: string;
    headers: Record<string, string>;
    data?: unknown;
    dataType?: "file";
    connectTimeout: number;
    readTimeout: number;
    disableRedirects: boolean;
    responseType: "text";
    requestId: string;
  }): Promise<{
    status: number;
    headers?: Record<string, string>;
    data?: unknown;
    dspSessionHandle?: string;
    dspSessionCleared?: boolean;
    dspSessionClearedHandle?: string;
    dspSecureSessionVolatile?: boolean;
  }>;
  cancel(options: { requestId: string }): Promise<{ cancelled: boolean }>;
}

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

export function shouldClearAndroidSessionResponse(
  status: number,
  code: unknown,
  currentSessionRevoked = false,
): boolean {
  return currentSessionRevoked || (
    status === 401
    && (code === "SESSION_EXPIRED" || code === "SESSION_REVOKED" || code === "AUTH_REQUIRED")
  );
}

function authorizationToken(headers: Record<string, string>): string | null {
  const authorization = Object.entries(headers).find(([key]) => key.toLowerCase() === "authorization")?.[1];
  const match = /^Bearer\s+(.+)$/i.exec(authorization?.trim() ?? "");
  return match?.[1]?.trim() || null;
}

export function isAndroidSecureSessionHandle(value: string | null | undefined): boolean {
  return typeof value === "string"
    && new RegExp(`^${ANDROID_SECURE_SESSION_PREFIX}[A-Za-z0-9_-]{32,96}$`).test(value);
}

export function needsAndroidSecureSessionBridge(input: string, headers: Record<string, string>): boolean {
  let path = "";
  try { path = new URL(input).pathname; } catch { return false; }
  const createsSession = /\/api\/auth\/(?:register|login|reset-password)$/.test(path);
  return createsSession || authorizationToken(headers) !== null;
}

function synchronizeAndroidSessionMetadata(
  suppliedToken: string | null,
  result: unknown,
): void {
  const metadata = result && typeof result === "object"
    ? result as { dspSessionHandle?: unknown; dspSessionCleared?: unknown; dspSessionClearedHandle?: unknown }
    : {};
  try {
    const stored = globalThis.localStorage?.getItem(CLOUD_TOKEN_STORAGE_KEY) ?? null;
    const update = androidSessionStorageUpdate(stored, suppliedToken, metadata);
    if (update === null) {
      globalThis.localStorage?.removeItem(CLOUD_TOKEN_STORAGE_KEY);
      return;
    }
    if (typeof update === "string") globalThis.localStorage?.setItem(CLOUD_TOKEN_STORAGE_KEY, update);
  } catch {
    // Storage denial leaves the current in-memory legacy session usable. A
    // later authenticated request retries the native migration.
  }
}

export function androidSessionStorageUpdate(
  storedToken: string | null,
  suppliedToken: string | null,
  metadata: { dspSessionHandle?: unknown; dspSessionCleared?: unknown; dspSessionClearedHandle?: unknown },
): string | null | undefined {
  if (
    metadata.dspSessionCleared === true
    && suppliedToken
    && storedToken === suppliedToken
    && (metadata.dspSessionClearedHandle === undefined || metadata.dspSessionClearedHandle === suppliedToken)
  ) return null;
  if (
    typeof metadata.dspSessionHandle === "string"
    && isAndroidSecureSessionHandle(metadata.dspSessionHandle)
    && suppliedToken
    && storedToken === suppliedToken
  ) return metadata.dspSessionHandle;
  return undefined;
}

function androidRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `android_${crypto.randomUUID().replaceAll("-", "")}`;
  }
  return `android_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkBytes = 32 * 1024;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkBytes) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.byteLength, offset + chunkBytes)));
  }
  return btoa(binary);
}

export async function androidBlobToBase64(blob: Blob, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw new DOMException("云存档上传已取消", "AbortError");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (signal?.aborted) throw new DOMException("云存档上传已取消", "AbortError");
  return bytesToBase64(bytes);
}

/**
 * Android keeps JSON/text on the native bridge, but may send gzip as base64 so
 * no Blob or ArrayBuffer crosses the Capacitor bridge. Web and Electron return
 * null and stay on their established transports.
 */
export async function androidApiFetch(input: string, init: RequestInit): Promise<Response | null> {
  const gzipBlob = typeof Blob !== "undefined" && init.body instanceof Blob && new Headers(init.headers).get("content-encoding") === "gzip";
  if (!isAndroidNativeRuntime() || !/^https:\/\//i.test(input)) return null;
  const headers = normalizedHeaders(init.headers);
  const useSecureSessionBridge = needsAndroidSecureSessionBridge(input, headers);
  if (!useSecureSessionBridge && (!gzipBlob || !androidBase64FileSupported())) return null;
  const { Capacitor, CapacitorHttp, registerPlugin } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return null;
  const requestId = androidRequestId();
  let secureSessionPlugin: AndroidSecureSessionPlugin | null = null;
  let aborted = init.signal?.aborted === true;
  let resolveAbort: (() => void) | null = null;
  const abortSignal = new Promise<void>((resolve) => { resolveAbort = resolve; });
  const abortError = () => new DOMException("云存档上传已取消", "AbortError");
  const cancelNativeRequest = () => {
    aborted = true;
    resolveAbort?.();
    if (secureSessionPlugin) void secureSessionPlugin.cancel({ requestId }).catch(() => undefined);
  };
  init.signal?.addEventListener("abort", cancelNativeRequest, { once: true });
  if (aborted) {
    init.signal?.removeEventListener("abort", cancelNativeRequest);
    throw abortError();
  }
  let data: unknown = init.body;
  try {
    if (typeof Blob !== "undefined" && init.body instanceof Blob) {
      data = await androidBlobToBase64(init.body, init.signal ?? undefined);
      if (aborted) throw abortError();
    }
    if (aborted) throw abortError();
    const transferBytes = typeof data === "string" ? new TextEncoder().encode(data).byteLength : 0;
    const timeoutMs = cloudRequestTimeoutMs(transferBytes);
    const requestOptions = {
      url: input,
      method: init.method ?? "GET",
      headers,
      data,
      ...(gzipBlob ? { dataType: "file" as const } : {}),
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
      disableRedirects: true,
      responseType: "text" as const,
      requestId,
    };
    const suppliedToken = authorizationToken(headers);
    const request = useSecureSessionBridge
      ? (() => {
          if (!Capacitor.isPluginAvailable(ANDROID_SECURE_SESSION_PLUGIN)) {
            if (isAndroidSecureSessionHandle(suppliedToken)) {
              return Promise.resolve({
                status: 401,
                headers: { "content-type": "application/json; charset=utf-8" },
                data: { error: "Android 安全会话组件不可用，请重新登录", code: "ANDROID_SECURE_SESSION_BRIDGE_UNAVAILABLE" },
                dspSessionCleared: true,
                dspSessionClearedHandle: suppliedToken,
              });
            }
            return CapacitorHttp.request(requestOptions);
          }
          secureSessionPlugin = registerPlugin<AndroidSecureSessionPlugin>(ANDROID_SECURE_SESSION_PLUGIN);
          if (aborted) throw abortError();
          return secureSessionPlugin.request(requestOptions);
        })()
      : CapacitorHttp.request(requestOptions);
    const abort = abortSignal.then(() => { throw abortError(); });
    const response = await Promise.race([request, abort]);
    if (aborted) throw abortError();
    synchronizeAndroidSessionMetadata(suppliedToken, response);
    return new Response(response.status === 204 || response.status === 205 ? null : responseBody(response.data), {
      status: response.status,
      headers: response.headers,
    });
  } finally {
    init.signal?.removeEventListener("abort", cancelNativeRequest);
  }
}

export function androidBase64RequestSupported(): boolean {
  return isAndroidNativeRuntime() && androidBase64FileSupported() && CLOUD_TRANSFER_CONTRACT.requestCompressedLimitBytes > 0;
}
