import type { Plugin } from "@capacitor/core";

const ANDROID_ACCOUNT_ARCHIVE_PLUGIN = "DspAccountArchive";
const ANDROID_SECURE_SESSION_PREFIX = "dsp_android_session_v1_";
const ARCHIVE_SUFFIX = ".dspaccount.zip";

export interface AndroidAccountArchiveBridge extends Plugin {
  downloadAndShare(options: {
    apiBase: string;
    sessionHandle: string;
    requestId: string;
    suggestedName?: string;
  }): Promise<{
    requestId: string;
    fileName: string;
    byteLength: number;
    archiveVersion: number;
    chooserOpened: boolean;
  }>;
  cancel(options: { requestId: string }): Promise<{ cancelled: boolean; tooLate?: boolean }>;
}

export interface AndroidAccountArchiveOptions {
  apiBase: string;
  sessionHandle: string;
  suggestedName?: string;
  signal?: AbortSignal;
}

export interface AndroidAccountArchiveResult {
  requestId: string;
  fileName: string;
  byteLength: number;
  archiveVersion: 2;
  chooserOpened: true;
}

export class AndroidAccountArchiveError extends Error {
  constructor(message: string, readonly code: string, readonly details: Readonly<Record<string, unknown>> = {}) {
    super(message);
    this.name = "AndroidAccountArchiveError";
  }
}

function androidRuntime(): boolean {
  return typeof __APP_PLATFORM__ !== "undefined" && __APP_PLATFORM__ === "android";
}

function normalizeApiBase(value: string): string {
  let target: URL;
  try {
    target = new URL(value.trim());
  } catch {
    throw new AndroidAccountArchiveError("Android 账号归档云服务地址无效", "ACCOUNT_ARCHIVE_API_BASE_INVALID");
  }
  if (target.protocol !== "https:" || target.username || target.password || target.pathname.replace(/\/+$/, "") !== "/api" || target.search || target.hash) {
    throw new AndroidAccountArchiveError("Android 账号归档必须使用 HTTPS /api 入口", "ACCOUNT_ARCHIVE_API_BASE_INVALID");
  }
  return `${target.origin}/api`;
}

function normalizeSessionHandle(value: string): string {
  if (!new RegExp(`^${ANDROID_SECURE_SESSION_PREFIX}[A-Za-z0-9_-]{32,96}$`).test(value)) {
    throw new AndroidAccountArchiveError("请重新登录以启用 Android 安全账号归档", "ACCOUNT_ARCHIVE_SECURE_SESSION_REQUIRED");
  }
  return value;
}

function normalizeSuggestedName(value?: string): string | undefined {
  if (value == null) return undefined;
  const leaf = value.split(/[\\/]+/).pop()?.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "_").trim() ?? "";
  if (!leaf) return undefined;
  const lower = leaf.toLowerCase();
  const stem = lower.endsWith(ARCHIVE_SUFFIX)
    ? leaf.slice(0, -ARCHIVE_SUFFIX.length)
    : lower.endsWith(".zip") ? leaf.slice(0, -4) : leaf;
  const normalized = stem.replace(/[. ]+$/g, "").slice(0, 96);
  return normalized ? `${normalized}${ARCHIVE_SUFFIX}` : undefined;
}

function requestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `archive_${crypto.randomUUID().replaceAll("-", "")}`;
  }
  const random = Math.random().toString(36).slice(2).padEnd(16, "0");
  return `archive_${Date.now().toString(36)}_${random}`;
}

function abortError(): DOMException {
  return new DOMException("账号归档下载已取消", "AbortError");
}

function pluginError(error: unknown): AndroidAccountArchiveError {
  const source = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const data = source.data && typeof source.data === "object" ? source.data as Record<string, unknown> : {};
  const code = typeof source.code === "string" && /^[A-Z0-9_]{1,100}$/.test(source.code)
    ? source.code
    : "ACCOUNT_ARCHIVE_DOWNLOAD_FAILED";
  const message = typeof source.message === "string" && source.message.length <= 500
    ? source.message
    : "Android 账号归档下载失败";
  return new AndroidAccountArchiveError(message, code, {
    ...(Number.isSafeInteger(data.status) ? { status: data.status } : {}),
    ...(typeof data.serverCode === "string" && /^[A-Z0-9_]{1,80}$/.test(data.serverCode) ? { serverCode: data.serverCode } : {}),
  });
}

function validateResult(value: unknown, expectedRequestId: string): AndroidAccountArchiveResult {
  if (!value || typeof value !== "object") {
    throw new AndroidAccountArchiveError("Android 账号归档返回无效", "ACCOUNT_ARCHIVE_RESPONSE_INVALID");
  }
  const result = value as Record<string, unknown>;
  if (
    result.requestId !== expectedRequestId
    || typeof result.fileName !== "string"
    || !result.fileName.toLowerCase().endsWith(ARCHIVE_SUFFIX)
    || !Number.isSafeInteger(result.byteLength)
    || Number(result.byteLength) <= 0
    || result.archiveVersion !== 2
    || result.chooserOpened !== true
  ) {
    throw new AndroidAccountArchiveError("Android 账号归档返回无效", "ACCOUNT_ARCHIVE_RESPONSE_INVALID");
  }
  return result as unknown as AndroidAccountArchiveResult;
}

export async function runAndroidAccountArchiveDownload(
  plugin: AndroidAccountArchiveBridge,
  options: AndroidAccountArchiveOptions,
  id = requestId(),
): Promise<AndroidAccountArchiveResult> {
  if (options.signal?.aborted) throw abortError();
  const suggestedName = normalizeSuggestedName(options.suggestedName);
  let rejectAbort: ((reason: DOMException) => void) | null = null;
  const abort = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const cancel = () => {
    void plugin.cancel({ requestId: id })
      .then((result) => {
        // Once native code has atomically crossed into the system chooser it
        // is too late to claim cancellation. Let the original result resolve
        // so the UI reports that the chooser opened instead of a false cancel.
        if (result.cancelled) rejectAbort?.(abortError());
      })
      .catch(() => undefined);
  };
  try {
    const pending = plugin.downloadAndShare({
      apiBase: normalizeApiBase(options.apiBase),
      sessionHandle: normalizeSessionHandle(options.sessionHandle),
      requestId: id,
      ...(suggestedName ? { suggestedName } : {}),
    });
    options.signal?.addEventListener("abort", cancel, { once: true });
    if (options.signal?.aborted) cancel();
    const result = await Promise.race([pending, abort]);
    return validateResult(result, id);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw abortError();
    const normalized = pluginError(error);
    if (normalized.code === "ACCOUNT_ARCHIVE_CANCELLED") throw abortError();
    throw normalized;
  } finally {
    options.signal?.removeEventListener("abort", cancel);
  }
}

export async function downloadAndroidAccountArchive(
  options: AndroidAccountArchiveOptions,
): Promise<AndroidAccountArchiveResult | null> {
  if (!androidRuntime()) return null;
  const { Capacitor, registerPlugin } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return null;
  if (!Capacitor.isPluginAvailable(ANDROID_ACCOUNT_ARCHIVE_PLUGIN)) {
    throw new AndroidAccountArchiveError("当前 Android 版本不支持原生账号归档", "ACCOUNT_ARCHIVE_UNSUPPORTED");
  }
  return runAndroidAccountArchiveDownload(
    registerPlugin<AndroidAccountArchiveBridge>(ANDROID_ACCOUNT_ARCHIVE_PLUGIN),
    options,
  );
}
