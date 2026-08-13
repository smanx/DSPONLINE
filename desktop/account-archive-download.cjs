const fs = require("node:fs");
const path = require("node:path");
const { randomBytes, randomUUID } = require("node:crypto");
const { Readable, Transform, Writable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { setTimeout: delay } = require("node:timers/promises");

const ACCOUNT_ARCHIVE_CONTENT_TYPE = "application/vnd.dspidle.account-archive+zip";
const ACCOUNT_ARCHIVE_EXTENSION = ".dspaccount.zip";
const MAXIMUM_ACCOUNT_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024;
const MAXIMUM_ERROR_RESPONSE_BYTES = 64 * 1024;
const MAXIMUM_SUGGESTED_NAME_LENGTH = 180;
const WINDOWS_RENAME_RETRY_CODES = new Set(["EACCES", "EBUSY", "EPERM"]);

class AccountArchiveDownloadError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = options.name || "AccountArchiveDownloadError";
    this.code = code;
    if (Number.isSafeInteger(options.status)) this.status = options.status;
    if (typeof options.serverCode === "string") this.serverCode = options.serverCode;
  }
}

function archiveError(code, message, options) {
  return new AccountArchiveDownloadError(code, message, options);
}

function isAbortError(error, signal) {
  return Boolean(signal?.aborted || error?.name === "AbortError" || error?.code === "ABORT_ERR");
}

function cancelledError(cause) {
  return archiveError("ACCOUNT_ARCHIVE_CANCELLED", "账号归档下载已取消", {
    cause,
    name: "AbortError",
  });
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw cancelledError(signal.reason);
}

function defaultArchiveFileName(now = new Date()) {
  const timestamp = Number.isFinite(now?.getTime?.()) ? now.toISOString().slice(0, 10) : "export";
  return `dsp-idle-account-${timestamp}${ACCOUNT_ARCHIVE_EXTENSION}`;
}

function sanitizeArchiveFileName(suggestedName, now = new Date()) {
  const fallback = defaultArchiveFileName(now);
  if (typeof suggestedName !== "string") return fallback;
  const leaf = suggestedName.split(/[\\/]+/).pop() || "";
  let stem = leaf
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim();
  const lower = stem.toLowerCase();
  if (lower.endsWith(ACCOUNT_ARCHIVE_EXTENSION)) {
    stem = stem.slice(0, -ACCOUNT_ARCHIVE_EXTENSION.length);
  } else if (lower.endsWith(".zip")) {
    stem = stem.slice(0, -4);
  }
  stem = stem.replace(/[. ]+$/g, "").trim();
  if (!stem || stem === "." || stem === "..") return fallback;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) stem = `_${stem}`;
  const maximumStemLength = MAXIMUM_SUGGESTED_NAME_LENGTH - ACCOUNT_ARCHIVE_EXTENSION.length;
  stem = stem.slice(0, maximumStemLength).replace(/[. ]+$/g, "");
  return stem ? `${stem}${ACCOUNT_ARCHIVE_EXTENSION}` : fallback;
}

function normalizeArchiveTargetPath(selectedPath) {
  if (typeof selectedPath !== "string" || selectedPath.length === 0 || selectedPath.includes("\0")) {
    throw archiveError("ACCOUNT_ARCHIVE_PATH_INVALID", "账号归档保存路径无效");
  }
  const resolved = path.resolve(selectedPath);
  const directory = path.dirname(resolved);
  const fileName = sanitizeArchiveFileName(path.basename(resolved), new Date(Number.NaN));
  const targetPath = path.join(directory, fileName);
  if (path.dirname(targetPath) !== directory || !targetPath.toLowerCase().endsWith(ACCOUNT_ARCHIVE_EXTENSION)) {
    throw archiveError("ACCOUNT_ARCHIVE_PATH_INVALID", "账号归档保存路径无效");
  }
  return targetPath;
}

function normalizeBearerAuthorization(value) {
  if (typeof value !== "string" || value.length > 512) {
    throw archiveError("ACCOUNT_ARCHIVE_AUTH_INVALID", "账号归档下载凭据无效");
  }
  const authorization = value.trim();
  if (!/^Bearer [^\s\u0000-\u001f\u007f]{8,480}$/i.test(authorization)) {
    throw archiveError("ACCOUNT_ARCHIVE_AUTH_INVALID", "账号归档下载凭据无效");
  }
  return authorization;
}

function normalizeRequestId(value) {
  if (value === undefined || value === null || value === "") return `archive_${randomUUID()}`;
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{8,120}$/.test(value)) {
    throw archiveError("ACCOUNT_ARCHIVE_REQUEST_ID_INVALID", "账号归档下载请求标识无效");
  }
  return value;
}

function normalizeContentLength(value, maximumBytes = MAXIMUM_ACCOUNT_ARCHIVE_BYTES) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw archiveError("ACCOUNT_ARCHIVE_LENGTH_INVALID", "云端账号归档缺少有效的文件长度");
  }
  const byteLength = Number(value);
  if (!Number.isSafeInteger(byteLength) || byteLength <= 0 || byteLength > maximumBytes) {
    throw archiveError("ACCOUNT_ARCHIVE_LENGTH_INVALID", "云端账号归档文件长度超出安全范围");
  }
  return byteLength;
}

function responseContentType(response) {
  return String(response?.headers?.get?.("content-type") || "").split(";", 1)[0].trim().toLowerCase();
}

async function cancelResponseBody(body) {
  try {
    if (typeof body?.cancel === "function") await body.cancel();
    else if (typeof body?.destroy === "function") body.destroy();
  } catch {
    // Metadata validation remains the authoritative error.
  }
}

function toNodeReadable(body) {
  if (!body) throw archiveError("ACCOUNT_ARCHIVE_BODY_MISSING", "云端账号归档响应没有文件正文");
  if (typeof body.pipe === "function" && typeof body.on === "function") return body;
  if (typeof body.getReader === "function" && typeof Readable.fromWeb === "function") return Readable.fromWeb(body);
  if (typeof body[Symbol.asyncIterator] === "function") return Readable.from(body);
  throw archiveError("ACCOUNT_ARCHIVE_BODY_INVALID", "云端账号归档响应正文无法读取");
}

async function readBoundedErrorResponse(response, signal, maximumBytes = MAXIMUM_ERROR_RESPONSE_BYTES) {
  if (!response?.body) return { message: null, serverCode: null };
  const readable = toNodeReadable(response.body);
  const chunks = [];
  let receivedBytes = 0;
  try {
    for await (const value of readable) {
      throwIfAborted(signal);
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      const remaining = maximumBytes - receivedBytes;
      if (remaining <= 0) break;
      const bounded = chunk.byteLength <= remaining ? chunk : chunk.subarray(0, remaining);
      chunks.push(bounded);
      receivedBytes += bounded.byteLength;
      if (bounded.byteLength !== chunk.byteLength || receivedBytes >= maximumBytes) break;
    }
  } catch (error) {
    if (isAbortError(error, signal)) throw cancelledError(error);
  } finally {
    if (!readable.destroyed) readable.destroy();
  }
  const text = Buffer.concat(chunks, receivedBytes).toString("utf8").trim();
  if (!text) return { message: null, serverCode: null };
  try {
    const parsed = JSON.parse(text);
    const rawMessage = typeof parsed?.message === "string"
      ? parsed.message
      : typeof parsed?.error === "string" ? parsed.error : null;
    const rawCode = typeof parsed?.code === "string" ? parsed.code : null;
    return {
      message: rawMessage && rawMessage.length <= 512 ? rawMessage : null,
      serverCode: rawCode && /^[A-Z0-9_]{1,80}$/.test(rawCode) ? rawCode : null,
    };
  } catch {
    return { message: null, serverCode: null };
  }
}

async function streamArchiveBodyToWritable(body, writable, options) {
  const expectedBytes = options?.expectedBytes;
  const maximumBytes = options?.maximumBytes ?? MAXIMUM_ACCOUNT_ARCHIVE_BYTES;
  const signal = options?.signal;
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0 || expectedBytes > maximumBytes) {
    throw archiveError("ACCOUNT_ARCHIVE_LENGTH_INVALID", "云端账号归档文件长度超出安全范围");
  }
  throwIfAborted(signal);
  const readable = toNodeReadable(body);
  let receivedBytes = 0;
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      receivedBytes += chunk.byteLength;
      if (receivedBytes > expectedBytes || receivedBytes > maximumBytes) {
        callback(archiveError("ACCOUNT_ARCHIVE_BODY_TOO_LONG", "云端账号归档正文超过声明长度"));
        return;
      }
      callback(null, chunk);
    },
  });
  try {
    await pipeline(readable, counter, writable, { signal });
  } catch (error) {
    if (error instanceof AccountArchiveDownloadError) throw error;
    if (isAbortError(error, signal)) throw cancelledError(error);
    throw archiveError("ACCOUNT_ARCHIVE_STREAM_FAILED", "云端账号归档下载中断", { cause: error });
  }
  if (receivedBytes !== expectedBytes) {
    throw archiveError("ACCOUNT_ARCHIVE_BODY_TRUNCATED", "云端账号归档正文长度不足");
  }
  return receivedBytes;
}

async function openUniquePartFile(targetPath, fsPromises = fs.promises) {
  const directory = path.dirname(targetPath);
  const fileName = path.basename(targetPath);
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const suffix = randomBytes(8).toString("hex");
    const partPath = path.join(directory, `.${fileName}.${process.pid}.${suffix}.part`);
    try {
      const handle = await fsPromises.open(partPath, "wx", 0o600);
      return { handle, partPath };
    } catch (error) {
      if (error?.code === "EEXIST") continue;
      throw archiveError("ACCOUNT_ARCHIVE_TEMP_CREATE_FAILED", "无法在所选目录创建账号归档临时文件", { cause: error });
    }
  }
  throw archiveError("ACCOUNT_ARCHIVE_TEMP_CREATE_FAILED", "无法创建唯一的账号归档临时文件");
}

async function atomicReplaceArchiveFile(partPath, targetPath, options = {}) {
  const fsPromises = options.fsPromises ?? fs.promises;
  const platform = options.platform ?? process.platform;
  const retryDelay = options.retryDelay ?? delay;
  const signal = options.signal;
  const maximumAttempts = platform === "win32" ? 5 : 1;
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    throwIfAborted(signal);
    try {
      await fsPromises.rename(partPath, targetPath);
      return;
    } catch (error) {
      const retryable = platform === "win32" && WINDOWS_RENAME_RETRY_CODES.has(error?.code) && attempt + 1 < maximumAttempts;
      if (!retryable) {
        throw archiveError("ACCOUNT_ARCHIVE_RENAME_FAILED", "账号归档无法替换所选目标文件，原文件保持不变", { cause: error });
      }
      await retryDelay(25 * (attempt + 1));
      throwIfAborted(signal);
    }
  }
}

async function removePartFile(partPath, fsPromises = fs.promises) {
  if (!partPath) return;
  try {
    await fsPromises.unlink(partPath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      // Best effort only: the primary stable error must not expose a local path.
    }
  }
}

function createFileHandleWritable(handle) {
  let position = 0;
  return new Writable({
    highWaterMark: 64 * 1024,
    write(chunk, _encoding, callback) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      void (async () => {
        let offset = 0;
        while (offset < bytes.byteLength) {
          const result = await handle.write(bytes, offset, bytes.byteLength - offset, position);
          if (!Number.isSafeInteger(result?.bytesWritten) || result.bytesWritten <= 0) {
            throw archiveError("ACCOUNT_ARCHIVE_WRITE_FAILED", "账号归档临时文件写入中断");
          }
          offset += result.bytesWritten;
          position += result.bytesWritten;
        }
      })().then(() => callback(), callback);
    },
  });
}

async function downloadAccountArchiveToFile(options) {
  const targetUrl = options?.url;
  const targetPath = normalizeArchiveTargetPath(options?.targetPath);
  const authorization = normalizeBearerAuthorization(options?.authorization);
  const signal = options?.signal;
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const fsPromises = options?.fsPromises ?? fs.promises;
  const maximumBytes = options?.maximumBytes ?? MAXIMUM_ACCOUNT_ARCHIVE_BYTES;
  if (!(targetUrl instanceof URL) || targetUrl.protocol !== "https:") {
    throw archiveError("ACCOUNT_ARCHIVE_URL_INVALID", "账号归档下载地址无效");
  }
  if (typeof fetchImpl !== "function") throw archiveError("ACCOUNT_ARCHIVE_NETWORK_UNAVAILABLE", "当前运行环境无法下载账号归档");
  throwIfAborted(signal);

  let response;
  try {
    response = await fetchImpl(targetUrl, {
      method: "GET",
      headers: {
        accept: ACCOUNT_ARCHIVE_CONTENT_TYPE,
        authorization,
      },
      redirect: "error",
      signal,
    });
  } catch (error) {
    if (isAbortError(error, signal)) throw cancelledError(error);
    throw archiveError("ACCOUNT_ARCHIVE_NETWORK_FAILED", "账号归档网络请求失败", { cause: error });
  }

  if (response?.status !== 200) {
    const detail = await readBoundedErrorResponse(response, signal);
    throw archiveError(
      "ACCOUNT_ARCHIVE_HTTP_ERROR",
      detail.message || `云服务拒绝账号归档下载（HTTP ${Number(response?.status) || 0}）`,
      { status: Number(response?.status) || 0, serverCode: detail.serverCode || undefined },
    );
  }
  if (responseContentType(response) !== ACCOUNT_ARCHIVE_CONTENT_TYPE) {
    await cancelResponseBody(response.body);
    throw archiveError("ACCOUNT_ARCHIVE_CONTENT_TYPE_INVALID", "云端返回的账号归档文件类型无效");
  }
  let expectedBytes;
  try {
    expectedBytes = normalizeContentLength(response.headers.get("content-length"), maximumBytes);
  } catch (error) {
    await cancelResponseBody(response.body);
    throw error;
  }
  if (!response.body) throw archiveError("ACCOUNT_ARCHIVE_BODY_MISSING", "云端账号归档响应没有文件正文");

  let handle = null;
  let partPath = null;
  let renamed = false;
  try {
    ({ handle, partPath } = await openUniquePartFile(targetPath, fsPromises));
    const writable = createFileHandleWritable(handle);
    const byteLength = await streamArchiveBodyToWritable(response.body, writable, {
      expectedBytes,
      maximumBytes,
      signal,
    });
    throwIfAborted(signal);
    await handle.sync();
    await handle.close();
    handle = null;
    throwIfAborted(signal);
    await atomicReplaceArchiveFile(partPath, targetPath, {
      fsPromises,
      platform: options?.platform,
      signal,
    });
    renamed = true;
    return { byteLength, fileName: path.basename(targetPath) };
  } catch (error) {
    if (error instanceof AccountArchiveDownloadError) throw error;
    if (isAbortError(error, signal)) throw cancelledError(error);
    throw archiveError("ACCOUNT_ARCHIVE_WRITE_FAILED", "账号归档未能保存到所选位置，原文件保持不变", { cause: error });
  } finally {
    if (handle) {
      try { await handle.close(); } catch { /* cleanup only */ }
    }
    if (!renamed) await removePartFile(partPath, fsPromises);
  }
}

async function runSelectedAccountArchiveDownload(options) {
  throwIfAborted(options?.signal);
  const selection = await options.selectTarget();
  if (options?.signal?.aborted || selection?.canceled || !selection?.filePath) {
    return { cancelled: true };
  }
  const targetPath = normalizeArchiveTargetPath(selection.filePath);
  const result = await options.download(targetPath);
  return { cancelled: false, targetPath, ...result };
}

class AccountArchiveDownloadRegistry {
  constructor(maximumConcurrent = 1) {
    if (!Number.isSafeInteger(maximumConcurrent) || maximumConcurrent < 1) throw new TypeError("maximumConcurrent must be positive");
    this.maximumConcurrent = maximumConcurrent;
    this.records = new Map();
  }

  begin(requestId) {
    if (this.records.has(requestId)) {
      throw archiveError("ACCOUNT_ARCHIVE_REQUEST_DUPLICATE", "账号归档下载请求标识重复");
    }
    if (this.records.size >= this.maximumConcurrent) {
      throw archiveError("ACCOUNT_ARCHIVE_DOWNLOAD_BUSY", "已有账号归档正在下载，请稍后重试");
    }
    const record = { requestId, controller: new AbortController(), cancelled: false };
    this.records.set(requestId, record);
    return record;
  }

  cancel(requestId) {
    const record = this.records.get(requestId);
    if (!record) return false;
    record.cancelled = true;
    record.controller.abort();
    return true;
  }

  finish(requestId, expectedRecord) {
    if (expectedRecord && this.records.get(requestId) !== expectedRecord) return false;
    return this.records.delete(requestId);
  }

  cancelAll() {
    for (const record of this.records.values()) {
      record.cancelled = true;
      record.controller.abort();
    }
  }

  get size() {
    return this.records.size;
  }
}

function serializeAccountArchiveDownloadError(error) {
  const normalized = error instanceof AccountArchiveDownloadError
    ? error
    : archiveError("ACCOUNT_ARCHIVE_DOWNLOAD_FAILED", "账号归档下载失败，原文件保持不变", { cause: error });
  return {
    name: normalized.name,
    code: normalized.code,
    message: normalized.message,
    ...(Number.isSafeInteger(normalized.status) ? { status: normalized.status } : {}),
    ...(typeof normalized.serverCode === "string" ? { serverCode: normalized.serverCode } : {}),
  };
}

module.exports = {
  ACCOUNT_ARCHIVE_CONTENT_TYPE,
  ACCOUNT_ARCHIVE_EXTENSION,
  MAXIMUM_ACCOUNT_ARCHIVE_BYTES,
  MAXIMUM_ERROR_RESPONSE_BYTES,
  AccountArchiveDownloadError,
  AccountArchiveDownloadRegistry,
  atomicReplaceArchiveFile,
  defaultArchiveFileName,
  downloadAccountArchiveToFile,
  normalizeArchiveTargetPath,
  normalizeBearerAuthorization,
  normalizeContentLength,
  normalizeRequestId,
  runSelectedAccountArchiveDownload,
  sanitizeArchiveFileName,
  serializeAccountArchiveDownloadError,
  streamArchiveBodyToWritable,
};
