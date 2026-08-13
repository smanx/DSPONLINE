import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { mkdir, mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";

import { AccountArchiveError } from "./account-archive.mjs";
import { inspectAccountArchiveFile } from "./account-archive-file.mjs";
import { normalizeCloudQuotaPolicy } from "./cloud-quota.mjs";

export const ACCOUNT_ARCHIVE_IMPORT_CONTENT_TYPE = "application/vnd.dspidle.account-archive+zip";
export const ACCOUNT_ARCHIVE_IMPORT_GUARD_VERSION = "cloud-account-import-guard-v1";
export const ACCOUNT_ARCHIVE_IMPORT_GUARD_HEADER = "x-dsp-account-import-guard";
export const ACCOUNT_ARCHIVE_IMPORT_CONFIRMATION_HEADER = "x-dsp-account-import-confirmation";

const SAVE_MODES = ["normal", "speedrun"];
const SAVE_SLOTS = ["main", "1", "2", "3"];
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAXIMUM_ARCHIVE_BYTES = 0xffff_fffe;
const DEFAULT_ARCHIVE_OVERHEAD_BYTES = 24 * 1024 * 1024;

export class AccountArchiveImportError extends Error {
  constructor(code, message, statusCode = 400, options = undefined) {
    super(message, options);
    this.name = "AccountArchiveImportError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function fail(code, message, statusCode = 400, options = undefined) {
  throw new AccountArchiveImportError(code, message, statusCode, options);
}

function throwIfAborted(signal) {
  if (signal?.aborted) fail("ACCOUNT_ARCHIVE_IMPORT_ABORTED", "账号归档导入已取消，现有云存档未修改", 499);
}

function safeInteger(value, minimum, maximum, label, code = "ACCOUNT_ARCHIVE_IMPORT_INVALID") {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(code, `${label} 超出支持范围`);
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function compareRecords(left, right) {
  return SAVE_MODES.indexOf(left.mode) - SAVE_MODES.indexOf(right.mode)
    || SAVE_SLOTS.indexOf(left.slot) - SAVE_SLOTS.indexOf(right.slot)
    || left.revision - right.revision
    || left.checksum.localeCompare(right.checksum);
}

function normalizedGuardRecord(value) {
  if (!value || typeof value !== "object" || !SAVE_MODES.includes(value.mode) || !SAVE_SLOTS.includes(value.slot)) {
    fail("ACCOUNT_ARCHIVE_IMPORT_GUARD_INVALID", "云存档状态 guard 包含非法模式或槽位");
  }
  const revision = safeInteger(value.revision, 1, Number.MAX_SAFE_INTEGER, "云存档修订", "ACCOUNT_ARCHIVE_IMPORT_GUARD_INVALID");
  const updatedAt = safeInteger(value.updatedAt ?? 0, 0, Number.MAX_SAFE_INTEGER, "云存档更新时间", "ACCOUNT_ARCHIVE_IMPORT_GUARD_INVALID");
  const size = safeInteger(value.size, 1, Number.MAX_SAFE_INTEGER, "云存档正文大小", "ACCOUNT_ARCHIVE_IMPORT_GUARD_INVALID");
  if (typeof value.checksum !== "string" || !SHA256_PATTERN.test(value.checksum)) {
    fail("ACCOUNT_ARCHIVE_IMPORT_GUARD_INVALID", "云存档状态 guard 包含非法 checksum");
  }
  return { mode: value.mode, slot: value.slot, revision, updatedAt, size, checksum: value.checksum };
}

/**
 * Hash only public cloud-save metadata. The guard deliberately excludes user
 * identity, sessions, leaderboard rows and payload bytes.
 */
export function accountArchiveImportGuard(records) {
  if (!Array.isArray(records)) fail("ACCOUNT_ARCHIVE_IMPORT_GUARD_INVALID", "云存档状态 guard 必须由修订列表生成");
  const normalized = records.map(normalizedGuardRecord).sort(compareRecords);
  const identities = new Set();
  for (const record of normalized) {
    const identity = `${record.mode}\u0000${record.slot}\u0000${record.revision}`;
    if (identities.has(identity)) fail("ACCOUNT_ARCHIVE_IMPORT_GUARD_INVALID", "云存档状态 guard 包含重复修订");
    identities.add(identity);
  }
  return sha256(JSON.stringify({ version: ACCOUNT_ARCHIVE_IMPORT_GUARD_VERSION, records: normalized }));
}

export function accountArchiveImportConfirmation(guard) {
  if (typeof guard !== "string" || !SHA256_PATTERN.test(guard)) {
    fail("ACCOUNT_ARCHIVE_IMPORT_GUARD_INVALID", "账号归档导入 guard 无效");
  }
  return `REPLACE_CLOUD_SAVES:${guard}`;
}

function requestContentType(request) {
  return String(request?.headers?.["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase();
}

function requestContentLength(request, maximumBytes) {
  const raw = request?.headers?.["content-length"];
  if (typeof raw !== "string" || !/^[1-9][0-9]*$/.test(raw)) {
    fail("ACCOUNT_ARCHIVE_IMPORT_LENGTH_REQUIRED", "账号归档导入必须提供有效的 Content-Length", 411);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail("ACCOUNT_ARCHIVE_IMPORT_LENGTH_INVALID", "账号归档导入长度无效", 400);
  }
  if (value > maximumBytes) {
    fail("ACCOUNT_ARCHIVE_IMPORT_TOO_LARGE", "账号归档超过当前账号容量上限，现有云存档未修改", 413);
  }
  return value;
}

async function writeAll(handle, bytes, position) {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const result = await handle.write(bytes, offset, bytes.byteLength - offset, position + offset);
    if (!Number.isSafeInteger(result?.bytesWritten) || result.bytesWritten <= 0) {
      fail("ACCOUNT_ARCHIVE_IMPORT_WRITE_FAILED", "账号归档临时文件写入中断，现有云存档未修改", 507);
    }
    offset += result.bytesWritten;
  }
  return position + bytes.byteLength;
}

/**
 * Stream one HTTP request into a private temporary directory. Call cleanup in
 * every outcome; no response or diagnostic contains the absolute path.
 */
export async function receiveAccountArchiveRequest(request, options = {}) {
  if (requestContentType(request) !== ACCOUNT_ARCHIVE_IMPORT_CONTENT_TYPE) {
    fail("ACCOUNT_ARCHIVE_IMPORT_CONTENT_TYPE_INVALID", "账号归档导入文件类型无效", 415);
  }
  const maximumBytes = safeInteger(
    options.maximumBytes ?? MAXIMUM_ARCHIVE_BYTES,
    1,
    MAXIMUM_ARCHIVE_BYTES,
    "账号归档导入上限",
    "ACCOUNT_ARCHIVE_IMPORT_LIMIT_INVALID",
  );
  const declaredBytes = requestContentLength(request, maximumBytes);
  const root = path.resolve(options.temporaryRoot || tmpdir());
  await mkdir(root, { recursive: true, mode: 0o700 });
  throwIfAborted(options.signal);
  const directory = await mkdtemp(path.join(root, "dspidle-account-import-"));
  const archiveFile = path.join(directory, "account.dspaccount.zip");
  let handle = null;
  let complete = false;
  try {
    handle = await open(archiveFile, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, 0o600);
    let receivedBytes = 0;
    for await (const value of request) {
      throwIfAborted(options.signal);
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      if (receivedBytes + chunk.byteLength > declaredBytes || receivedBytes + chunk.byteLength > maximumBytes) {
        fail("ACCOUNT_ARCHIVE_IMPORT_LENGTH_MISMATCH", "账号归档正文超过声明长度，现有云存档未修改", 400);
      }
      receivedBytes = await writeAll(handle, chunk, receivedBytes);
    }
    throwIfAborted(options.signal);
    if (receivedBytes !== declaredBytes) {
      fail("ACCOUNT_ARCHIVE_IMPORT_LENGTH_MISMATCH", "账号归档正文长度不足，现有云存档未修改", 400);
    }
    await handle.sync();
    await handle.close();
    handle = null;
    complete = true;
    return {
      directory,
      archiveFile,
      byteLength: receivedBytes,
      async cleanup() {
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    if (error instanceof AccountArchiveImportError) throw error;
    if (options.signal?.aborted) fail("ACCOUNT_ARCHIVE_IMPORT_ABORTED", "账号归档导入已取消，现有云存档未修改", 499, { cause: error });
    fail("ACCOUNT_ARCHIVE_IMPORT_RECEIVE_FAILED", "账号归档接收失败，现有云存档未修改", 500, { cause: error });
  } finally {
    if (!complete && handle) await handle.close().catch(() => undefined);
  }
}

function validateAccountDescriptor(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.format !== "dspidle-account-data" || value.version !== 2) {
    fail("ACCOUNT_ARCHIVE_ACCOUNT_INVALID", "账号归档 account.json 版本或格式无效");
  }
  if (!Number.isSafeInteger(value.exportedAt) || value.exportedAt < 0 || typeof value.accountId !== "string" || value.accountId.length < 1) {
    fail("ACCOUNT_ARCHIVE_ACCOUNT_INVALID", "账号归档 account.json 元数据无效");
  }
  if (!value.user || typeof value.user !== "object" || Array.isArray(value.user) || typeof value.user.id !== "string") {
    fail("ACCOUNT_ARCHIVE_ACCOUNT_INVALID", "账号归档 account.json 用户摘要无效");
  }
  if (value.user.id !== value.accountId) fail("ACCOUNT_ARCHIVE_ACCOUNT_INVALID", "账号归档 account.json 账号标识不一致");
  // Identity, sessions, moderation and submissions are intentionally ignored.
  return { exportedAt: value.exportedAt, accountId: value.accountId };
}

function validateImportQuota(refs, policyValue) {
  const policy = normalizeCloudQuotaPolicy(policyValue);
  const byMode = new Map(SAVE_MODES.map((mode) => [mode, 0]));
  const bySlot = new Map();
  const counts = new Map();
  let accountBytes = 0;
  for (const ref of refs) {
    if (ref.size > policy.revisionBytes) {
      fail("CLOUD_REVISION_QUOTA_EXCEEDED", "归档中单个云存档修订超过容量上限", 413);
    }
    const key = `${ref.mode}:${ref.slot}`;
    const slotBytes = (bySlot.get(key) ?? 0) + ref.size;
    const count = (counts.get(key) ?? 0) + 1;
    bySlot.set(key, slotBytes);
    counts.set(key, count);
    byMode.set(ref.mode, (byMode.get(ref.mode) ?? 0) + ref.size);
    accountBytes += ref.size;
    if (!Number.isSafeInteger(accountBytes)) fail("CLOUD_ACCOUNT_BYTES_QUOTA_EXCEEDED", "归档逻辑容量超出安全范围", 507);
    if (count > policy.historyRevisions) fail("CLOUD_HISTORY_REVISIONS_QUOTA_EXCEEDED", "归档中单槽历史修订过多", 507);
    if (slotBytes > policy.slotBytes) fail("CLOUD_SLOT_BYTES_QUOTA_EXCEEDED", "归档中单槽云存档超过容量上限", 507);
    if (byMode.get(ref.mode) > policy.modeBytes) fail("CLOUD_MODE_BYTES_QUOTA_EXCEEDED", "归档中单模式云存档超过容量上限", 507);
    if (accountBytes > policy.accountBytes) fail("CLOUD_ACCOUNT_BYTES_QUOTA_EXCEEDED", "归档账号云存档超过容量上限", 507);
  }
  return { policy, logicalBytes: accountBytes, revisionCount: refs.length };
}

async function copyValidatedPayload(inspection, blob, destination, signal) {
  const handle = await open(destination, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, 0o600);
  let position = 0;
  try {
    const iterator = inspection.openPayload(blob.checksum, { signal })[Symbol.asyncIterator]();
    let validation;
    while (true) {
      throwIfAborted(signal);
      const next = await iterator.next();
      if (next.done) {
        validation = next.value;
        break;
      }
      position = await writeAll(handle, next.value, position);
    }
    if (position !== blob.size || validation?.checksum !== blob.checksum || validation?.size !== blob.size) {
      fail("ACCOUNT_ARCHIVE_PAYLOAD_SIZE_MISMATCH", "账号归档正文与清单大小不一致");
    }
    await handle.sync();
    return validation;
  } finally {
    await handle.close().catch(() => undefined);
  }
}

function importFailure(error) {
  if (error instanceof AccountArchiveImportError) return error;
  if (error instanceof AccountArchiveError) {
    const statusCode = error.code?.includes("LIMIT") || error.code?.includes("TOO_LARGE") ? 413 : 400;
    return new AccountArchiveImportError(error.code, error.message, statusCode, { cause: error });
  }
  return new AccountArchiveImportError(
    "ACCOUNT_ARCHIVE_IMPORT_VALIDATION_FAILED",
    "账号归档完整校验失败，现有云存档未修改",
    400,
    { cause: error },
  );
}

/**
 * Extract and validate one unique payload at a time. inspectPayload must run
 * the authoritative envelope/GameState validator and return no payload body.
 */
export async function prepareAccountArchiveImport(archiveFile, options = {}) {
  if (typeof options.inspectPayload !== "function") {
    fail("ACCOUNT_ARCHIVE_IMPORT_CONFIGURATION_INVALID", "账号归档导入缺少存档检查器", 500);
  }
  const workspaceDirectory = path.resolve(options.workspaceDirectory || path.dirname(archiveFile));
  let inspection;
  const createdPayloadFiles = [];
  let preparedSuccessfully = false;
  try {
    throwIfAborted(options.signal);
    inspection = await inspectAccountArchiveFile(archiveFile, {
      signal: options.signal,
      limits: {
        ...(options.maximumArchiveBytes === undefined ? {} : { maxArchiveBytes: options.maximumArchiveBytes }),
        ...(options.maximumPayloadBytes === undefined ? {} : { maxPayloadBytes: options.maximumPayloadBytes }),
      },
    });
    const account = validateAccountDescriptor(inspection.accountData);
    if (inspection.manifest.schemaVersion !== 7) {
      fail("ACCOUNT_ARCHIVE_SCHEMA_UNSUPPORTED", "账号归档云 schema 版本不受支持");
    }
    const quota = validateImportQuota(inspection.manifest.refs, options.quotaPolicy);
    const payloads = new Map();
    for (const blob of inspection.manifest.blobs) {
      throwIfAborted(options.signal);
      const payloadFile = path.join(workspaceDirectory, `${blob.checksum}.payload.json`);
      createdPayloadFiles.push(payloadFile);
      const streamed = await copyValidatedPayload(inspection, blob, payloadFile, options.signal);
      const inspected = await options.inspectPayload({
        file: payloadFile,
        checksum: blob.checksum,
        size: blob.size,
        mode: streamed.mode,
        signal: options.signal,
      });
      if (!inspected?.validPayload || inspected.payloadChecksum !== blob.checksum || inspected.payloadSize !== blob.size || inspected.payloadMode !== streamed.mode) {
        fail("ACCOUNT_ARCHIVE_SAVE_FORMAT_INVALID", "归档内云存档未通过完整性、结构或模式校验");
      }
      payloads.set(blob.checksum, {
        file: payloadFile,
        checksum: blob.checksum,
        size: blob.size,
        mode: streamed.mode,
        summary: inspected.summary,
        legacyImplicitSpeedrun: inspected.legacyImplicitSpeedrun === true,
      });
    }
    const refs = inspection.manifest.refs.map((ref) => {
      const payload = payloads.get(ref.checksum);
      if (!payload || payload.mode !== ref.mode) fail("ACCOUNT_ARCHIVE_MODE_MISMATCH", "归档修订模式与正文模式不一致");
      return {
        mode: ref.mode,
        slot: ref.slot,
        revision: ref.revision,
        updatedAt: ref.updatedAt,
        size: ref.size,
        checksum: ref.checksum,
        payloadFile: payload.file,
        summary: payload.summary,
        ...(payload.legacyImplicitSpeedrun ? { legacyMode: true } : {}),
      };
    }).sort(compareRecords);
    const prepared = {
      format: "dspidle-account-archive-import",
      version: 1,
      source: {
        accountId: account.accountId,
        exportedAt: account.exportedAt,
        archiveExportedAt: inspection.manifest.exportedAt,
        schemaVersion: inspection.manifest.schemaVersion,
      },
      refs,
      quota,
    };
    preparedSuccessfully = true;
    return prepared;
  } catch (error) {
    throw importFailure(error);
  } finally {
    await inspection?.close().catch(() => undefined);
    if (!preparedSuccessfully) {
      await Promise.all(createdPayloadFiles.map((file) => rm(file, { force: true }).catch(() => undefined)));
    }
  }
}

function payloadWorkerError(value) {
  const error = new AccountArchiveImportError(
    typeof value?.code === "string" ? value.code : "ACCOUNT_ARCHIVE_SAVE_FORMAT_INVALID",
    typeof value?.message === "string" ? value.message : "归档内云存档未通过权威检查",
    Number.isInteger(value?.statusCode) ? value.statusCode : 400,
  );
  return error;
}

/** Run the existing authoritative save parser in an isolated worker. */
export function inspectAccountArchivePayloadFile(input) {
  return new Promise((resolve, reject) => {
    if (!input || typeof input.file !== "string") {
      reject(new AccountArchiveImportError("ACCOUNT_ARCHIVE_IMPORT_CONFIGURATION_INVALID", "账号归档正文检查参数无效", 500));
      return;
    }
    if (input.signal?.aborted) {
      reject(new AccountArchiveImportError("ACCOUNT_ARCHIVE_IMPORT_ABORTED", "账号归档导入已取消，现有云存档未修改", 499));
      return;
    }
    const worker = new Worker(new URL("./account-archive-import-worker.mjs", import.meta.url));
    let settled = false;
    const finish = (operation) => {
      if (settled) return;
      settled = true;
      input.signal?.removeEventListener("abort", onAbort);
      operation();
    };
    const onAbort = () => finish(() => {
      void worker.terminate();
      reject(new AccountArchiveImportError("ACCOUNT_ARCHIVE_IMPORT_ABORTED", "账号归档导入已取消，现有云存档未修改", 499));
    });
    input.signal?.addEventListener("abort", onAbort, { once: true });
    worker.once("message", (message) => finish(() => {
      void worker.terminate();
      if (!message?.ok) reject(payloadWorkerError(message?.error));
      else resolve(message.result);
    }));
    worker.once("error", (error) => finish(() => {
      reject(new AccountArchiveImportError(
        "ACCOUNT_ARCHIVE_IMPORT_INSPECTION_FAILED",
        "账号归档正文后台检查失败，现有云存档未修改",
        500,
        { cause: error },
      ));
    }));
    worker.once("exit", (code) => {
      if (!settled) finish(() => reject(new AccountArchiveImportError(
        "ACCOUNT_ARCHIVE_IMPORT_INSPECTION_FAILED",
        `账号归档正文后台检查在返回结果前退出（${code}）`,
        500,
      )));
    });
    worker.postMessage({
      file: input.file,
      checksum: input.checksum,
      size: input.size,
      mode: input.mode,
    });
  });
}

export function maximumAccountArchiveImportBytes(policyValue) {
  const policy = normalizeCloudQuotaPolicy(policyValue);
  return Math.min(MAXIMUM_ARCHIVE_BYTES, policy.accountBytes + DEFAULT_ARCHIVE_OVERHEAD_BYTES);
}
