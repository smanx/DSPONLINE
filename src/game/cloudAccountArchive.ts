export const CLOUD_QUOTA_VERSION = "cloud-quota-v1" as const;
export const CLOUD_ACCOUNT_ARCHIVE_VERSION = 2 as const;
export const CLOUD_ACCOUNT_ARCHIVE_CONTENT_TYPE = "application/vnd.dspidle.account-archive+zip";
export const DEFAULT_ARCHIVE_BLOB_FALLBACK_LIMIT_BYTES = 128 * 1024 * 1024;

const ERROR_BODY_LIMIT_BYTES = 64 * 1024;
const ARCHIVE_SUFFIX = ".dspaccount.zip";
const CLOUD_SAVE_MODES = ["normal", "speedrun"] as const;
const CLOUD_SAVE_SLOTS = ["main", "1", "2", "3"] as const;

export type CloudQuotaMode = typeof CLOUD_SAVE_MODES[number];
export type CloudQuotaSlot = typeof CLOUD_SAVE_SLOTS[number];

export interface CloudQuotaLimits {
  revisionBytes: number;
  slotBytes: number;
  modeBytes: number;
  accountBytes: number;
  historyRevisions: number;
}

export interface CloudQuotaUsage {
  logicalBytes: number;
  uniquePayloadBytes: number;
  revisionCount: number;
  remainingBytes: number;
}

export interface CloudQuotaModeUsage extends CloudQuotaUsage {
  slots: Record<CloudQuotaSlot, CloudQuotaUsage>;
}

export interface CloudQuotaSnapshot {
  version: typeof CLOUD_QUOTA_VERSION;
  limits: CloudQuotaLimits;
  usage: CloudQuotaUsage & {
    modes: Record<CloudQuotaMode, CloudQuotaModeUsage>;
  };
}

export type CloudQuotaPlanReason =
  | "revisionBytes"
  | "historyRevisions"
  | "slotBytes"
  | "modeBytes"
  | "accountBytes"
  | "invalidTarget"
  | null;

export interface CloudQuotaPlan {
  accepted: boolean;
  reason: CloudQuotaPlanReason;
  code: string | null;
  target: { mode: CloudQuotaMode; slot: CloudQuotaSlot } | null;
  limits: CloudQuotaLimits;
  usage: CloudQuotaSnapshot["usage"];
  incoming: { bytes: number; checksum: string | null };
  prune: { revisionCount: number; logicalBytes: number; revisions: number[] };
  projected: {
    accountLogicalBytes: number;
    modeLogicalBytes: number;
    slotLogicalBytes: number;
    slotRevisionCount: number;
    accountRemainingBytes: number;
    modeRemainingBytes: number;
    slotRemainingBytes: number;
  } | null;
}

export interface CloudQuotaPreflightInput {
  mode: CloudQuotaMode;
  slot: CloudQuotaSlot;
  size: number;
  checksum?: string | null;
}

export interface CloudAccountClientOptions {
  apiBase: string;
  authToken?: string | null;
  getAuthToken?: () => string | null | Promise<string | null>;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}

interface FileSystemWritableFileStreamLike extends WritableStream<Uint8Array> {
  abort(reason?: unknown): Promise<void>;
}

interface FileSystemFileHandleLike {
  createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStreamLike>;
}

type ShowSaveFilePickerLike = (options: {
  suggestedName: string;
  types: Array<{ description: string; accept: Record<string, string[]> }>;
  excludeAcceptAllOption?: boolean;
}) => Promise<FileSystemFileHandleLike>;

export interface CloudAccountArchiveDownloadOptions extends CloudAccountClientOptions {
  showSaveFilePicker?: ShowSaveFilePickerLike | null;
  blobFallbackLimitBytes?: number;
  saveBlob?: (blob: Blob, fileName: string) => void | Promise<void>;
}

export interface CloudAccountArchiveDownloadResult {
  method: "file-system" | "blob";
  fileName: string;
  bytesWritten: number;
  archiveVersion: typeof CLOUD_ACCOUNT_ARCHIVE_VERSION;
}

export class CloudAccountArchiveError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 0,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "CloudAccountArchiveError";
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidResponse(`${label} 必须是对象`);
  }
  return value as Record<string, unknown>;
}

function safeInteger(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw invalidResponse(`${label} 必须是大于等于 ${minimum} 的安全整数`);
  }
  return value as number;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 160) {
    throw invalidResponse(`${label} 必须是非空短字符串`);
  }
  return value;
}

function invalidResponse(message: string): CloudAccountArchiveError {
  return new CloudAccountArchiveError(message, "CLOUD_RESPONSE_INVALID");
}

function normalizeLimits(value: unknown): CloudQuotaLimits {
  const source = record(value, "云容量限制");
  const limits = {
    revisionBytes: safeInteger(source.revisionBytes, "revisionBytes", 1),
    slotBytes: safeInteger(source.slotBytes, "slotBytes", 1),
    modeBytes: safeInteger(source.modeBytes, "modeBytes", 1),
    accountBytes: safeInteger(source.accountBytes, "accountBytes", 1),
    historyRevisions: safeInteger(source.historyRevisions, "historyRevisions", 1),
  };
  if (limits.slotBytes < limits.revisionBytes
    || limits.modeBytes < limits.slotBytes
    || limits.accountBytes < limits.modeBytes) {
    throw invalidResponse("云容量限制层级无效");
  }
  return limits;
}

function normalizeUsage(value: unknown, label: string): CloudQuotaUsage {
  const source = record(value, label);
  return {
    logicalBytes: safeInteger(source.logicalBytes, `${label}.logicalBytes`),
    uniquePayloadBytes: safeInteger(source.uniquePayloadBytes, `${label}.uniquePayloadBytes`),
    revisionCount: safeInteger(source.revisionCount, `${label}.revisionCount`),
    remainingBytes: safeInteger(source.remainingBytes, `${label}.remainingBytes`),
  };
}

function normalizeQuotaUsage(value: unknown): CloudQuotaSnapshot["usage"] {
  const source = record(value, "云容量用量");
  const base = normalizeUsage(source, "云容量用量");
  const modesSource = record(source.modes, "云容量模式用量");
  const modes = Object.fromEntries(CLOUD_SAVE_MODES.map((mode) => {
    const modeSource = record(modesSource[mode], `${mode} 模式用量`);
    const slotsSource = record(modeSource.slots, `${mode} 模式槽位用量`);
    const slots = Object.fromEntries(CLOUD_SAVE_SLOTS.map((slot) => [
      slot,
      normalizeUsage(slotsSource[slot], `${mode}/${slot} 槽位用量`),
    ])) as Record<CloudQuotaSlot, CloudQuotaUsage>;
    return [mode, { ...normalizeUsage(modeSource, `${mode} 模式用量`), slots }];
  })) as Record<CloudQuotaMode, CloudQuotaModeUsage>;
  return { ...base, modes };
}

export function normalizeCloudQuotaSnapshot(value: unknown): CloudQuotaSnapshot {
  const source = record(value, "云容量快照");
  if (source.version !== CLOUD_QUOTA_VERSION) throw invalidResponse("云容量快照版本无效");
  return {
    version: CLOUD_QUOTA_VERSION,
    limits: normalizeLimits(source.limits),
    usage: normalizeQuotaUsage(source.usage),
  };
}

function normalizeMode(value: unknown, label: string): CloudQuotaMode {
  if (value !== "normal" && value !== "speedrun") throw invalidResponse(`${label} 无效`);
  return value;
}

function normalizeSlot(value: unknown, label: string): CloudQuotaSlot {
  if (value !== "main" && value !== "1" && value !== "2" && value !== "3") throw invalidResponse(`${label} 无效`);
  return value;
}

function normalizeChecksum(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw invalidResponse(`${label} 无效`);
  return value;
}

export function normalizeCloudQuotaPlan(value: unknown): CloudQuotaPlan {
  const source = record(value, "云容量预检");
  if (typeof source.accepted !== "boolean") throw invalidResponse("云容量预检 accepted 无效");
  const allowedReasons: CloudQuotaPlanReason[] = [
    null, "revisionBytes", "historyRevisions", "slotBytes", "modeBytes", "accountBytes", "invalidTarget",
  ];
  if (!allowedReasons.includes(source.reason as CloudQuotaPlanReason)) throw invalidResponse("云容量预检 reason 无效");
  const code = source.code === null ? null : nonEmptyString(source.code, "云容量预检 code");
  const incomingSource = record(source.incoming, "云容量预检 incoming");
  const pruneSource = record(source.prune, "云容量预检 prune");
  if (!Array.isArray(pruneSource.revisions)) throw invalidResponse("云容量预检 prune.revisions 无效");
  const revisions = pruneSource.revisions.map((revision, index) => safeInteger(revision, `prune.revisions[${index}]`, 1));
  const targetSource = source.target == null ? null : record(source.target, "云容量预检 target");
  const projectedSource = source.projected == null ? null : record(source.projected, "云容量预检 projected");
  const target = targetSource ? {
    mode: normalizeMode(targetSource.mode, "云容量预检模式"),
    slot: normalizeSlot(targetSource.slot, "云容量预检槽位"),
  } : null;
  const projected = projectedSource ? {
    accountLogicalBytes: safeInteger(projectedSource.accountLogicalBytes, "projected.accountLogicalBytes"),
    modeLogicalBytes: safeInteger(projectedSource.modeLogicalBytes, "projected.modeLogicalBytes"),
    slotLogicalBytes: safeInteger(projectedSource.slotLogicalBytes, "projected.slotLogicalBytes"),
    slotRevisionCount: safeInteger(projectedSource.slotRevisionCount, "projected.slotRevisionCount"),
    accountRemainingBytes: safeInteger(projectedSource.accountRemainingBytes, "projected.accountRemainingBytes"),
    modeRemainingBytes: safeInteger(projectedSource.modeRemainingBytes, "projected.modeRemainingBytes"),
    slotRemainingBytes: safeInteger(projectedSource.slotRemainingBytes, "projected.slotRemainingBytes"),
  } : null;
  if (source.accepted && (!target || !projected || source.reason !== null || code !== null)) {
    throw invalidResponse("已接受的云容量预检缺少目标或预计用量");
  }
  return {
    accepted: source.accepted,
    reason: source.reason as CloudQuotaPlanReason,
    code,
    target,
    limits: normalizeLimits(source.limits),
    usage: normalizeQuotaUsage(source.usage),
    incoming: {
      bytes: safeInteger(incomingSource.bytes, "incoming.bytes"),
      checksum: incomingSource.checksum == null ? null : normalizeChecksum(incomingSource.checksum, "incoming.checksum"),
    },
    prune: {
      revisionCount: safeInteger(pruneSource.revisionCount, "prune.revisionCount"),
      logicalBytes: safeInteger(pruneSource.logicalBytes, "prune.logicalBytes"),
      revisions,
    },
    projected,
  };
}

function normalizeApiBase(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "");
  if (!normalized || /[\r\n]/.test(normalized)) {
    throw new CloudAccountArchiveError("云服务地址无效", "CLOUD_CLIENT_CONFIGURATION_INVALID");
  }
  return normalized;
}

async function requestContext(options: CloudAccountClientOptions): Promise<{
  base: string;
  token: string;
  fetch: typeof globalThis.fetch;
}> {
  const token = options.getAuthToken ? await options.getAuthToken() : options.authToken;
  if (typeof token !== "string" || token.length === 0 || token.length > 4096 || /[\r\n]/.test(token)) {
    throw new CloudAccountArchiveError("请先登录云账户", "CLOUD_AUTH_REQUIRED", 401);
  }
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (typeof fetchImplementation !== "function") {
    throw new CloudAccountArchiveError("当前环境不支持云服务请求", "CLOUD_FETCH_UNAVAILABLE");
  }
  return { base: normalizeApiBase(options.apiBase), token, fetch: fetchImplementation };
}

function abortError(message = "账号归档下载已取消"): DOMException {
  return new DOMException(message, "AbortError");
}

async function readErrorBody(response: Response): Promise<{ message: string | null; code: string | null; truncated: boolean }> {
  if (!response.body) return { message: null, code: null, truncated: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      const remaining = ERROR_BODY_LIMIT_BYTES - total;
      if (remaining <= 0) {
        truncated = true;
        await reader.cancel("error response limit reached").catch(() => undefined);
        break;
      }
      const chunk = result.value.subarray(0, remaining);
      chunks.push(chunk);
      total += chunk.byteLength;
      if (chunk.byteLength < result.value.byteLength || total >= ERROR_BODY_LIMIT_BYTES) {
        truncated = true;
        await reader.cancel("error response limit reached").catch(() => undefined);
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  try {
    const parsed = JSON.parse(text) as unknown;
    const body = record(parsed, "云服务错误响应");
    return {
      message: typeof body.error === "string" ? body.error.slice(0, ERROR_BODY_LIMIT_BYTES) : null,
      code: typeof body.code === "string" ? body.code.slice(0, 160) : null,
      truncated,
    };
  } catch {
    return { message: text ? text.slice(0, 1024) : null, code: null, truncated };
  }
}

async function throwHttpError(response: Response, unsupportedArchive = false): Promise<never> {
  const errorBody = await readErrorBody(response);
  if (unsupportedArchive && (response.status === 404 || response.status === 501)) {
    throw new CloudAccountArchiveError(
      "当前云服务不支持流式账号归档；可由界面明确选择旧版 JSON 导出",
      "ARCHIVE_UNSUPPORTED",
      response.status,
      { serverCode: errorBody.code, truncated: errorBody.truncated },
    );
  }
  throw new CloudAccountArchiveError(
    errorBody.message ?? `云服务返回 ${response.status}`,
    errorBody.code ?? "CLOUD_HTTP_ERROR",
    response.status,
    { truncated: errorBody.truncated },
  );
}

async function fetchJson(options: CloudAccountClientOptions, path: string, init: RequestInit): Promise<unknown> {
  const context = await requestContext(options);
  if (options.signal?.aborted) throw abortError("云容量请求已取消");
  let response: Response;
  try {
    response = await context.fetch(`${context.base}${path}`, {
      ...init,
      signal: options.signal,
      headers: {
        authorization: `Bearer ${context.token}`,
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    if (options.signal?.aborted || error instanceof DOMException && error.name === "AbortError") throw abortError("云容量请求已取消");
    throw new CloudAccountArchiveError("无法连接云服务", "CLOUD_NETWORK_ERROR");
  }
  if (!response.ok) return throwHttpError(response);
  try {
    return await response.json();
  } catch {
    throw invalidResponse("云服务返回的 JSON 无效");
  }
}

export async function fetchCloudQuota(options: CloudAccountClientOptions): Promise<CloudQuotaSnapshot> {
  const payload = record(await fetchJson(options, "/cloud-save/quota", { method: "GET" }), "云容量响应");
  return normalizeCloudQuotaSnapshot(payload.cloudQuota);
}

export async function preflightCloudQuota(
  input: CloudQuotaPreflightInput,
  options: CloudAccountClientOptions,
): Promise<CloudQuotaPlan> {
  const mode = normalizeMode(input.mode, "云存档模式");
  const slot = normalizeSlot(input.slot, "云存档槽位");
  const size = safeInteger(input.size, "云存档大小");
  const checksum = input.checksum == null ? null : normalizeChecksum(input.checksum, "云存档 checksum");
  const payload = record(await fetchJson(options, "/cloud-save/quota", {
    method: "POST",
    body: JSON.stringify({ mode, slot, size, ...(checksum ? { checksum } : {}) }),
  }), "云容量预检响应");
  return normalizeCloudQuotaPlan(payload.plan);
}

function positiveContentLength(response: Response): number {
  const value = response.headers.get("content-length");
  if (!value || !/^[1-9][0-9]*$/.test(value)) {
    throw new CloudAccountArchiveError("账号归档缺少有效的 Content-Length", "ARCHIVE_LENGTH_INVALID");
  }
  const length = Number(value);
  if (!Number.isSafeInteger(length) || length <= 0) {
    throw new CloudAccountArchiveError("账号归档体积超出浏览器安全范围", "ARCHIVE_LENGTH_INVALID");
  }
  return length;
}

function validateArchiveResponse(response: Response): number {
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== CLOUD_ACCOUNT_ARCHIVE_CONTENT_TYPE) {
    throw new CloudAccountArchiveError("云服务返回了错误的账号归档格式", "ARCHIVE_CONTENT_TYPE_INVALID");
  }
  if (response.headers.get("x-dsp-account-archive-version")?.trim() !== String(CLOUD_ACCOUNT_ARCHIVE_VERSION)) {
    throw new CloudAccountArchiveError("账号归档版本不受支持", "ARCHIVE_VERSION_UNSUPPORTED");
  }
  if (!response.body) throw new CloudAccountArchiveError("账号归档响应没有正文", "ARCHIVE_BODY_MISSING");
  return positiveContentLength(response);
}

function contentDispositionFileName(value: string | null): string | null {
  if (!value) return null;
  const extended = /(?:^|;)\s*filename\*=UTF-8''([^;]*)/i.exec(value)?.[1];
  if (extended) {
    try { return decodeURIComponent(extended.trim()); } catch { return null; }
  }
  const quoted = /(?:^|;)\s*filename="([^"]*)"/i.exec(value)?.[1];
  if (quoted) return quoted;
  return /(?:^|;)\s*filename=([^;]*)/i.exec(value)?.[1]?.trim() ?? null;
}

export function safeAccountArchiveFileName(contentDisposition: string | null): string {
  const candidate = contentDispositionFileName(contentDisposition)?.trim();
  if (!candidate
    || candidate === "."
    || candidate === ".."
    || candidate.includes("..")
    || /[\\/\u0000-\u001f\u007f<>:"|?*]/.test(candidate)) {
    return `dsp-account-export${ARCHIVE_SUFFIX}`;
  }
  const withoutTrailingDots = candidate.replace(/[. ]+$/, "");
  const withSuffix = withoutTrailingDots.toLowerCase().endsWith(ARCHIVE_SUFFIX)
    ? `${withoutTrailingDots.slice(0, -ARCHIVE_SUFFIX.length)}${ARCHIVE_SUFFIX}`
    : `${withoutTrailingDots}${ARCHIVE_SUFFIX}`;
  const maximumStemLength = 180 - ARCHIVE_SUFFIX.length;
  const stem = withSuffix.slice(0, -ARCHIVE_SUFFIX.length).slice(0, maximumStemLength).replace(/[. ]+$/, "");
  return `${stem || "dsp-account-export"}${ARCHIVE_SUFFIX}`;
}

function countedArchiveStream(body: ReadableStream<Uint8Array>, expectedBytes: number): {
  stream: ReadableStream<Uint8Array>;
  bytesRead: () => number;
} {
  let bytesRead = 0;
  const stream = body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytesRead += chunk.byteLength;
      if (!Number.isSafeInteger(bytesRead) || bytesRead > expectedBytes) {
        throw new CloudAccountArchiveError("账号归档实际字节超过 Content-Length", "ARCHIVE_LENGTH_MISMATCH", 0, {
          expectedBytes,
          actualBytes: bytesRead,
        });
      }
      controller.enqueue(chunk);
    },
    flush() {
      if (bytesRead !== expectedBytes) {
        throw new CloudAccountArchiveError("账号归档实际字节与 Content-Length 不一致", "ARCHIVE_LENGTH_MISMATCH", 0, {
          expectedBytes,
          actualBytes: bytesRead,
        });
      }
    },
  }));
  return { stream, bytesRead: () => bytesRead };
}

function detectedFilePicker(): ShowSaveFilePickerLike | null {
  const candidate = (globalThis as typeof globalThis & { showSaveFilePicker?: ShowSaveFilePickerLike }).showSaveFilePicker;
  return typeof candidate === "function" ? candidate.bind(globalThis) : null;
}

async function saveBlobInBrowser(blob: Blob, fileName: string): Promise<void> {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new CloudAccountArchiveError("当前环境无法保存账号归档文件", "ARCHIVE_BLOB_SAVE_UNAVAILABLE");
  }
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

async function abortWritableQuietly(writable: FileSystemWritableFileStreamLike | null, reason: unknown): Promise<void> {
  if (!writable) return;
  try { await writable.abort(reason); } catch { /* pipeTo may already have aborted and unlocked it */ }
}

export async function downloadCloudAccountArchive(
  options: CloudAccountArchiveDownloadOptions,
): Promise<CloudAccountArchiveDownloadResult> {
  const context = await requestContext(options);
  if (options.signal?.aborted) throw abortError();
  const requestController = new AbortController();
  const cancelRequest = () => requestController.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", cancelRequest, { once: true });
  let writable: FileSystemWritableFileStreamLike | null = null;
  let completed = false;
  try {
    let response: Response;
    try {
      response = await context.fetch(`${context.base}/account/export/archive`, {
        method: "GET",
        signal: requestController.signal,
        headers: {
          authorization: `Bearer ${context.token}`,
          accept: CLOUD_ACCOUNT_ARCHIVE_CONTENT_TYPE,
        },
      });
    } catch (error) {
      if (options.signal?.aborted || requestController.signal.aborted || error instanceof DOMException && error.name === "AbortError") {
        throw abortError();
      }
      throw new CloudAccountArchiveError("无法连接云服务", "ARCHIVE_NETWORK_ERROR");
    }
    if (!response.ok) return await throwHttpError(response, true);
    const expectedBytes = validateArchiveResponse(response);
    const fileName = safeAccountArchiveFileName(response.headers.get("content-disposition"));
    const picker = options.showSaveFilePicker === undefined ? detectedFilePicker() : options.showSaveFilePicker;
    if (picker) {
      const handle = await picker({
        suggestedName: fileName,
        excludeAcceptAllOption: true,
        types: [{
          description: "DSP极简网络账号归档",
          accept: { [CLOUD_ACCOUNT_ARCHIVE_CONTENT_TYPE]: [ARCHIVE_SUFFIX] },
        }],
      });
      if (options.signal?.aborted) throw abortError();
      // Chromium writes through a temporary file and publishes it on close.
      // keepExistingData=false avoids copying an existing destination. Browser
      // implementations ultimately control replacement semantics, so callers
      // should still avoid selecting their only irreplaceable backup copy.
      writable = await handle.createWritable({ keepExistingData: false });
      const abortDestination = () => { void abortWritableQuietly(writable, abortError()); };
      options.signal?.addEventListener("abort", abortDestination, { once: true });
      try {
        if (options.signal?.aborted) throw abortError();
        const counted = countedArchiveStream(response.body!, expectedBytes);
        await counted.stream.pipeTo(writable, { signal: requestController.signal });
        completed = true;
        return {
          method: "file-system",
          fileName,
          bytesWritten: counted.bytesRead(),
          archiveVersion: CLOUD_ACCOUNT_ARCHIVE_VERSION,
        };
      } catch (error) {
        await abortWritableQuietly(writable, error);
        if (options.signal?.aborted || requestController.signal.aborted && error instanceof DOMException && error.name === "AbortError") {
          throw abortError();
        }
        throw error;
      } finally {
        options.signal?.removeEventListener("abort", abortDestination);
      }
    }

    const configuredLimit = options.blobFallbackLimitBytes ?? DEFAULT_ARCHIVE_BLOB_FALLBACK_LIMIT_BYTES;
    const fallbackLimit = Number.isSafeInteger(configuredLimit) && configuredLimit > 0
      ? configuredLimit
      : DEFAULT_ARCHIVE_BLOB_FALLBACK_LIMIT_BYTES;
    if (expectedBytes > fallbackLimit) {
      await response.body!.cancel("blob fallback size limit").catch(() => undefined);
      throw new CloudAccountArchiveError(
        "账号归档超过浏览器 128 MiB 保守内存上限，请使用 Windows 或 Android 客户端流式导出",
        "ARCHIVE_BLOB_FALLBACK_TOO_LARGE",
        0,
        { expectedBytes, fallbackLimitBytes: fallbackLimit },
      );
    }
    const counted = countedArchiveStream(response.body!, expectedBytes);
    const blob = await new Response(counted.stream, {
      headers: { "content-type": CLOUD_ACCOUNT_ARCHIVE_CONTENT_TYPE },
    }).blob();
    if (options.signal?.aborted) throw abortError();
    if (blob.size !== expectedBytes || counted.bytesRead() !== expectedBytes) {
      throw new CloudAccountArchiveError("账号归档实际字节与 Content-Length 不一致", "ARCHIVE_LENGTH_MISMATCH", 0, {
        expectedBytes,
        actualBytes: counted.bytesRead(),
      });
    }
    await (options.saveBlob ?? saveBlobInBrowser)(blob, fileName);
    completed = true;
    return {
      method: "blob",
      fileName,
      bytesWritten: counted.bytesRead(),
      archiveVersion: CLOUD_ACCOUNT_ARCHIVE_VERSION,
    };
  } catch (error) {
    requestController.abort(error);
    await abortWritableQuietly(writable, error);
    if (options.signal?.aborted) throw abortError();
    throw error;
  } finally {
    if (!completed) requestController.abort();
    options.signal?.removeEventListener("abort", cancelRequest);
  }
}
