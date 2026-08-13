import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";

import { AccountArchiveImportError } from "./account-archive-import.mjs";
import { normalizeCloudQuotaPolicy } from "./cloud-quota.mjs";

const SAVE_MODES = ["normal", "speedrun"];
const SAVE_SLOTS = ["main", "1", "2", "3"];
const MANUAL_SLOTS = SAVE_SLOTS.slice(1);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const LEGACY_JSON_FORMAT = "dspidle-legacy-json-account-import";
const LEGACY_JSON_VERSION = 1;
const LEGACY_JSON_METADATA_OVERHEAD_BYTES = 24 * 1_048_576;

function fail(code, message, statusCode = 400, options = undefined) {
  throw new AccountArchiveImportError(code, message, statusCode, options);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeInteger(value, minimum, maximum, label, code = "ACCOUNT_ARCHIVE_LEGACY_JSON_INVALID") {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(code, `${label} 超出支持范围`);
  return value;
}

function strictJson(value, maximumBytes) {
  let text;
  let byteLength;
  if (typeof value === "string") text = value;
  else if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    byteLength = bytes.byteLength;
    if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
      fail("ACCOUNT_ARCHIVE_LEGACY_JSON_UTF8_INVALID", "旧版 JSON 账号导出不能包含 UTF-8 BOM");
    }
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      fail("ACCOUNT_ARCHIVE_LEGACY_JSON_UTF8_INVALID", "旧版 JSON 账号导出不是有效 UTF-8");
    }
    if (!Buffer.from(text, "utf8").equals(bytes)) {
      fail("ACCOUNT_ARCHIVE_LEGACY_JSON_UTF8_INVALID", "旧版 JSON 账号导出不能包含 UTF-8 BOM 或非规范字节");
    }
  } else {
    fail("ACCOUNT_ARCHIVE_LEGACY_JSON_INVALID", "旧版 JSON 账号导入必须是 UTF-8 JSON 文本或字节");
  }
  byteLength ??= Buffer.byteLength(text, "utf8");
  if (byteLength > maximumBytes) {
    fail("ACCOUNT_ARCHIVE_LEGACY_JSON_TOO_LARGE", "旧版 JSON 账号导出超过当前导入上限，现有云存档未修改", 413);
  }
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      fail("ACCOUNT_ARCHIVE_LEGACY_JSON_INVALID", "旧版 JSON 账号导出根节点无效");
    }
    return parsed;
  } catch (error) {
    if (error instanceof AccountArchiveImportError) throw error;
    fail("ACCOUNT_ARCHIVE_LEGACY_JSON_INVALID", "旧版 JSON 账号导出不是有效 JSON", 400, { cause: error });
  }
}

function compareRecords(left, right) {
  return SAVE_MODES.indexOf(left.mode) - SAVE_MODES.indexOf(right.mode)
    || SAVE_SLOTS.indexOf(left.slot) - SAVE_SLOTS.indexOf(right.slot)
    || left.revision - right.revision
    || left.checksum.localeCompare(right.checksum);
}

function validateSource(value, expectedAccountId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("ACCOUNT_ARCHIVE_LEGACY_JSON_INVALID", "旧版 JSON 账号导出根节点无效");
  }
  const exportedAt = safeInteger(value.exportedAt, 0, Number.MAX_SAFE_INTEGER, "旧版导出时间");
  if (value.schemaVersion !== 7) {
    fail("ACCOUNT_ARCHIVE_LEGACY_JSON_SCHEMA_UNSUPPORTED", "旧版 JSON 云 schema 版本不受支持");
  }
  if (!value.user || typeof value.user !== "object" || Array.isArray(value.user) ||
    typeof value.user.id !== "string" || value.user.id.length === 0) {
    fail("ACCOUNT_ARCHIVE_LEGACY_JSON_ACCOUNT_INVALID", "旧版 JSON 缺少有效账号标识");
  }
  if (expectedAccountId !== undefined && value.user.id !== expectedAccountId) {
    fail("ACCOUNT_ARCHIVE_ACCOUNT_MISMATCH", "旧版 JSON 属于其他账号；不能导入当前账号，现有云存档未修改", 409);
  }
  return { accountId: value.user.id, exportedAt, schemaVersion: value.schemaVersion };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateSaveRecord(value, mode, slot, source) {
  if (!isPlainObject(value)) fail("ACCOUNT_ARCHIVE_LEGACY_JSON_SAVE_INVALID", `${source} 包含无效云存档`);
  if (value.mode !== undefined && value.mode !== mode) {
    fail("ACCOUNT_ARCHIVE_MODE_MISMATCH", `${source} 的模式标记与保存位置不一致`);
  }
  if (value.slot !== undefined && value.slot !== slot) {
    fail("ACCOUNT_ARCHIVE_LEGACY_JSON_SLOT_INVALID", `${source} 的槽位标记与保存位置不一致`);
  }
  const revision = safeInteger(value.revision, 1, Number.MAX_SAFE_INTEGER, `${source} 修订`);
  const updatedAt = safeInteger(value.updatedAt, 0, Number.MAX_SAFE_INTEGER, `${source} 更新时间`);
  if (typeof value.payload !== "string") fail("ACCOUNT_ARCHIVE_LEGACY_JSON_SAVE_INVALID", `${source} 缺少可恢复云存档正文`);
  const size = Buffer.byteLength(value.payload, "utf8");
  if (!Number.isSafeInteger(value.size) || value.size !== size || size < 1) {
    fail("ACCOUNT_ARCHIVE_LEGACY_JSON_INTEGRITY_INVALID", `${source} 正文大小与元数据不一致`);
  }
  const checksum = sha256(Buffer.from(value.payload, "utf8"));
  if (typeof value.checksum !== "string" || !SHA256_PATTERN.test(value.checksum) || value.checksum !== checksum) {
    fail("ACCOUNT_ARCHIVE_LEGACY_JSON_INTEGRITY_INVALID", `${source} 正文 SHA-256 与元数据不一致`);
  }
  return { mode, slot, revision, updatedAt, size, checksum, payload: value.payload };
}

function collectSlots(records, value, mode, source) {
  if (value === undefined || value === null) return;
  if (!isPlainObject(value)) fail("ACCOUNT_ARCHIVE_LEGACY_JSON_SAVE_INVALID", `${source} 必须是槽位对象`);
  for (const key of Object.keys(value)) {
    if (!MANUAL_SLOTS.includes(key)) fail("ACCOUNT_ARCHIVE_LEGACY_JSON_SLOT_INVALID", `${source} 包含不支持的槽位`);
    if (value[key] !== null) records.push(validateSaveRecord(value[key], mode, key, `${source}.${key}`));
  }
}

function collectModeNamespace(records, value, mode) {
  if (value === undefined || value === null) return;
  if (!isPlainObject(value)) fail("ACCOUNT_ARCHIVE_LEGACY_JSON_SAVE_INVALID", `cloudSavesByMode.${mode} 必须是对象`);
  for (const key of Object.keys(value)) {
    if (key !== "main" && key !== "slots") fail("ACCOUNT_ARCHIVE_LEGACY_JSON_SAVE_INVALID", `cloudSavesByMode.${mode} 包含未知字段`);
  }
  if (value.main !== undefined && value.main !== null) {
    records.push(validateSaveRecord(value.main, mode, "main", `cloudSavesByMode.${mode}.main`));
  }
  collectSlots(records, value.slots, mode, `cloudSavesByMode.${mode}.slots`);
}

function collectRestorableRecords(value) {
  const records = [];
  if (value.cloudSave !== undefined && value.cloudSave !== null) {
    records.push(validateSaveRecord(value.cloudSave, "normal", "main", "cloudSave"));
  }
  collectSlots(records, value.cloudSaveSlots, "normal", "cloudSaveSlots");
  if (value.cloudSavesByMode !== undefined && value.cloudSavesByMode !== null) {
    if (!isPlainObject(value.cloudSavesByMode)) fail("ACCOUNT_ARCHIVE_LEGACY_JSON_SAVE_INVALID", "cloudSavesByMode 必须是对象");
    for (const mode of Object.keys(value.cloudSavesByMode)) {
      if (!SAVE_MODES.includes(mode)) fail("ACCOUNT_ARCHIVE_MODE_MISMATCH", "cloudSavesByMode 包含不支持的模式");
    }
    for (const mode of SAVE_MODES) collectModeNamespace(records, value.cloudSavesByMode[mode], mode);
  }
  const identities = new Map();
  for (const record of records) {
    const identity = `${record.mode}\u0000${record.slot}`;
    const previous = identities.get(identity);
    if (!previous) {
      identities.set(identity, record);
      continue;
    }
    if (previous.revision !== record.revision || previous.updatedAt !== record.updatedAt || previous.size !== record.size ||
      previous.checksum !== record.checksum || previous.payload !== record.payload) {
      fail("ACCOUNT_ARCHIVE_LEGACY_JSON_CONFLICT", `旧版 JSON 对同一 ${record.mode}/${record.slot} 包含相互冲突的正文`);
    }
  }
  return [...identities.values()].sort(compareRecords);
}

function validateRestorableHistory(value, records) {
  const currentByIdentity = new Map(records.map((record) => [`${record.mode}\u0000${record.slot}`, record]));
  let redundantCount = 0;
  const add = (history, mode, slot, source) => {
    if (history === undefined || history === null) return;
    if (!Array.isArray(history)) fail("ACCOUNT_ARCHIVE_LEGACY_JSON_HISTORY_INVALID", "旧版 JSON 历史修订必须是数组");
    for (const entry of history) {
      if (!isPlainObject(entry)) fail("ACCOUNT_ARCHIVE_LEGACY_JSON_HISTORY_INVALID", `${source} 包含无效历史修订`);
      const current = currentByIdentity.get(`${mode}\u0000${slot}`);
      if (!current || entry.mode !== undefined && entry.mode !== mode || entry.slot !== undefined && entry.slot !== slot ||
        entry.revision !== current.revision || entry.updatedAt !== current.updatedAt || entry.size !== current.size || entry.checksum !== current.checksum) {
        fail("ACCOUNT_ARCHIVE_LEGACY_JSON_HISTORY_UNRESTORABLE", `${source} 包含没有正文、无法安全恢复的历史修订；请使用 ZIP 账号归档`, 409);
      }
      redundantCount += 1;
    }
  };
  add(value.cloudSaveHistory, "normal", "main", "cloudSaveHistory");
  if (value.cloudSaveSlotHistory !== undefined && value.cloudSaveSlotHistory !== null) {
    if (!isPlainObject(value.cloudSaveSlotHistory)) fail("ACCOUNT_ARCHIVE_LEGACY_JSON_HISTORY_INVALID", "旧版 JSON 手动槽历史必须是对象");
    for (const [slot, history] of Object.entries(value.cloudSaveSlotHistory)) {
      if (!MANUAL_SLOTS.includes(slot)) fail("ACCOUNT_ARCHIVE_LEGACY_JSON_SLOT_INVALID", "旧版 JSON 历史包含不支持的槽位");
      add(history, "normal", slot, `cloudSaveSlotHistory.${slot}`);
    }
  }
  if (value.cloudSaveHistoriesByMode !== undefined && value.cloudSaveHistoriesByMode !== null) {
    if (!isPlainObject(value.cloudSaveHistoriesByMode)) fail("ACCOUNT_ARCHIVE_LEGACY_JSON_HISTORY_INVALID", "旧版 JSON 分模式历史必须是对象");
    for (const [mode, namespace] of Object.entries(value.cloudSaveHistoriesByMode)) {
      if (!SAVE_MODES.includes(mode) || !isPlainObject(namespace)) fail("ACCOUNT_ARCHIVE_LEGACY_JSON_HISTORY_INVALID", "旧版 JSON 分模式历史无效");
      add(namespace.main, mode, "main", `cloudSaveHistoriesByMode.${mode}.main`);
      if (namespace.slots !== undefined && namespace.slots !== null) {
        if (!isPlainObject(namespace.slots)) fail("ACCOUNT_ARCHIVE_LEGACY_JSON_HISTORY_INVALID", "旧版 JSON 分模式手动槽历史无效");
        for (const [slot, history] of Object.entries(namespace.slots)) {
          if (!MANUAL_SLOTS.includes(slot)) fail("ACCOUNT_ARCHIVE_LEGACY_JSON_SLOT_INVALID", "旧版 JSON 历史包含不支持的槽位");
          add(history, mode, slot, `cloudSaveHistoriesByMode.${mode}.slots.${slot}`);
        }
      }
    }
  }
  return redundantCount;
}

function validateQuota(records, policyValue) {
  const policy = normalizeCloudQuotaPolicy(policyValue);
  const byMode = new Map(SAVE_MODES.map((mode) => [mode, 0]));
  let accountBytes = 0;
  for (const record of records) {
    if (record.size > policy.revisionBytes) fail("CLOUD_REVISION_QUOTA_EXCEEDED", "旧版 JSON 中单个云存档超过容量上限", 413);
    byMode.set(record.mode, (byMode.get(record.mode) ?? 0) + record.size);
    accountBytes += record.size;
    if (byMode.get(record.mode) > policy.modeBytes) fail("CLOUD_MODE_BYTES_QUOTA_EXCEEDED", "旧版 JSON 中单模式云存档超过容量上限", 507);
    if (accountBytes > policy.accountBytes) fail("CLOUD_ACCOUNT_BYTES_QUOTA_EXCEEDED", "旧版 JSON 账号云存档超过容量上限", 507);
  }
  return { policy, logicalBytes: accountBytes, revisionCount: records.length };
}

/**
 * Prepare, but never install, an explicitly selected pre-archive JSON export.
 * Legacy exports only include payload bodies for current saves; metadata-only
 * histories are counted for the UI and deliberately never reconstructed.
 */
export async function prepareLegacyJsonAccountImport(input, options = {}) {
  if (typeof options.inspectPayload !== "function") {
    fail("ACCOUNT_ARCHIVE_IMPORT_CONFIGURATION_INVALID", "旧版 JSON 导入缺少存档检查器", 500);
  }
  const policy = normalizeCloudQuotaPolicy(options.quotaPolicy);
  const defaultMaximumBytes = Math.min(Number.MAX_SAFE_INTEGER, policy.accountBytes + LEGACY_JSON_METADATA_OVERHEAD_BYTES);
  const maximumBytes = safeInteger(
    options.maximumBytes ?? defaultMaximumBytes,
    1,
    Number.MAX_SAFE_INTEGER,
    "旧版 JSON 导入上限",
    "ACCOUNT_ARCHIVE_IMPORT_LIMIT_INVALID",
  );
  const value = strictJson(input, maximumBytes);
  const source = validateSource(value, options.expectedAccountId);
  const records = collectRestorableRecords(value);
  const redundantHistoryRevisions = validateRestorableHistory(value, records);
  const quota = validateQuota(records, policy);
  const refs = [];
  for (const record of records) {
    let inspected;
    try {
      inspected = await options.inspectPayload({ ...record });
    } catch (error) {
      if (error instanceof AccountArchiveImportError) throw error;
      fail("ACCOUNT_ARCHIVE_SAVE_FORMAT_INVALID", "旧版 JSON 云存档未通过权威完整性或结构检查", 400, { cause: error });
    }
    if (!inspected?.validPayload || inspected.payloadChecksum !== record.checksum ||
      inspected.payloadSize !== record.size || inspected.payloadMode !== record.mode) {
      fail("ACCOUNT_ARCHIVE_SAVE_FORMAT_INVALID", "旧版 JSON 云存档未通过权威完整性、结构或模式检查");
    }
    refs.push({
      ...record,
      summary: inspected.summary,
      ...(inspected.legacyImplicitSpeedrun === true ? { legacyMode: true } : {}),
    });
  }
  return {
    format: LEGACY_JSON_FORMAT,
    version: LEGACY_JSON_VERSION,
    source,
    refs,
    quota,
    redundantHistoryRevisions,
  };
}

export const LEGACY_JSON_ACCOUNT_IMPORT_FORMAT = LEGACY_JSON_FORMAT;
export const LEGACY_JSON_ACCOUNT_IMPORT_VERSION = LEGACY_JSON_VERSION;
