import { createHash } from "node:crypto";
import { createReadStream, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { createCloudPayloadAlias, parseCloudPayloadAlias } from "./cloud-payload-store.mjs";
import { inspectSavePayloadIntegrity } from "./save-integrity.mjs";

export const CLOUD_PAYLOAD_ALIAS_RECOVERY_CONFIRMATION_PREFIX = "RELINK_CLOUD_PAYLOAD_ALIASES";

export class CloudPayloadRecoveryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CloudPayloadRecoveryError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new CloudPayloadRecoveryError(code, message);
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function objectOrEmpty(value) {
  return isPlainObject(value) ? value : {};
}

function metadataValid(entry) {
  return Number.isSafeInteger(entry?.revision) && entry.revision > 0 &&
    typeof entry?.checksum === "string" && /^[0-9a-f]{64}$/.test(entry.checksum) &&
    Number.isSafeInteger(entry?.size) && entry.size >= 0;
}

function recordKey(userId, revision) {
  return `${userId}\u0000${revision}`;
}

function sameMetadata(left, right) {
  return left?.checksum === right?.checksum && left?.sizeBytes === right?.sizeBytes;
}

function quickCheck(database, label) {
  const rows = database.pragma("quick_check");
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.quick_check !== "ok") {
    fail("CLOUD_PAYLOAD_RECOVERY_QUICK_CHECK_FAILED", `${label} SQLite quick_check 未通过`);
  }
}

function requirePayloadTables(database) {
  const tables = database.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name IN ('app_state', 'cloud_save_payloads', 'cloud_save_payload_blobs')
  `).all();
  if (tables.length !== 3) {
    fail("CLOUD_PAYLOAD_RECOVERY_SCHEMA_INVALID", "云正文恢复要求完整的 SQLite 正文表结构");
  }
}

function readState(database) {
  const row = database.prepare("SELECT payload, updated_at AS updatedAt FROM app_state WHERE id = 1").get();
  if (typeof row?.payload !== "string" || !Number.isSafeInteger(row?.updatedAt) || row.updatedAt < 0) {
    fail("CLOUD_PAYLOAD_RECOVERY_APP_STATE_INVALID", "app_state 不存在或不可读");
  }
  try {
    return { raw: row.payload, updatedAt: row.updatedAt, data: JSON.parse(row.payload) };
  } catch {
    fail("CLOUD_PAYLOAD_RECOVERY_APP_STATE_INVALID", "app_state JSON 无法解析");
  }
}

function createSummary() {
  return {
    currentMain: {
      checked: 0,
      matchingHistory: 0,
      existingRows: 0,
      relinkCandidates: 0,
      bodyRestoreCandidates: 0,
      unrecoverable: 0,
      invalidMetadata: 0,
      missingMatchingHistory: 0,
    },
    history: {
      uniqueMetadataRows: 0,
      existingRows: 0,
      relinkCandidates: 0,
      bodyRestoreCandidates: 0,
      invalidMetadata: 0,
      unknownUser: 0,
      conflictingMetadata: 0,
    },
    rejected: {
      missingBlob: 0,
      blobMetadataMismatch: 0,
      checksumMismatch: 0,
      envelopeInvalid: 0,
      envelopeVersionUnsupported: 0,
      nonNormalMode: 0,
    },
  };
}

function collectNormalMainHistory(data) {
  const summary = createSummary();
  const users = objectOrEmpty(data?.users);
  const histories = objectOrEmpty(data?.cloudSaveHistory);
  const mains = objectOrEmpty(data?.cloudSaves);
  const records = new Map();

  for (const [userId, history] of Object.entries(histories)) {
    if (!users[userId]) {
      if (Array.isArray(history)) summary.history.unknownUser += history.length;
      continue;
    }
    if (!Array.isArray(history)) continue;
    for (const entry of history) {
      if (!metadataValid(entry)) {
        summary.history.invalidMetadata += 1;
        continue;
      }
      const key = recordKey(userId, entry.revision);
      const next = {
        userId,
        revision: entry.revision,
        checksum: entry.checksum,
        sizeBytes: entry.size,
        current: false,
        conflicted: false,
      };
      const previous = records.get(key);
      if (!previous) {
        records.set(key, next);
        continue;
      }
      if (!sameMetadata(previous, next)) {
        previous.conflicted = true;
        summary.history.conflictingMetadata += 1;
      }
    }
  }

  summary.history.uniqueMetadataRows = records.size;
  for (const [userId, current] of Object.entries(mains)) {
    summary.currentMain.checked += 1;
    if (!users[userId] || !metadataValid(current)) {
      summary.currentMain.invalidMetadata += 1;
      continue;
    }
    const record = records.get(recordKey(userId, current.revision));
    if (!record || record.conflicted || record.checksum !== current.checksum || record.sizeBytes !== current.size) {
      summary.currentMain.missingMatchingHistory += 1;
      continue;
    }
    record.current = true;
    summary.currentMain.matchingHistory += 1;
  }

  return { records: [...records.values()], summary };
}

function validateBlob(database, record, cache) {
  const cacheKey = `${record.checksum}\u0000${record.sizeBytes}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const row = database.prepare(`
    SELECT size_bytes AS sizeBytes, payload
    FROM cloud_save_payload_blobs
    WHERE checksum = ?
  `).get(record.checksum);
  const result = !row
    ? { ok: false, code: "missingBlob" }
    : validatePayloadText(row.payload, record, row.sizeBytes);
  cache.set(cacheKey, result);
  return result;
}

function payloadMode(parsed) {
  const state = parsed?.state ?? parsed;
  const envelopeMode = parsed?.mode;
  const stateMode = state?.mode;
  const allowed = new Set(["normal", "speedrun"]);
  if (envelopeMode !== undefined && !allowed.has(envelopeMode)) return null;
  if (stateMode !== undefined && !allowed.has(stateMode)) return null;
  if (envelopeMode !== undefined && stateMode !== undefined && envelopeMode !== stateMode) return null;
  if (envelopeMode !== undefined || stateMode !== undefined) return envelopeMode ?? stateMode;
  const legacySpeedrun = state?.speedrun;
  if (legacySpeedrun?.enabled === true && legacySpeedrun.mode === "speedrun" &&
    typeof legacySpeedrun.factoryId === "string" && legacySpeedrun.factoryId.length > 0) return "speedrun";
  return "normal";
}

function validatePayloadText(payload, record, storedSizeBytes = record.sizeBytes) {
  if (typeof payload !== "string") return { ok: false, code: "missingBlob" };
  if (Buffer.from(payload, "utf8").toString("utf8") !== payload) {
    return { ok: false, code: "blobMetadataMismatch" };
  }
  if (!Number.isSafeInteger(storedSizeBytes) || storedSizeBytes !== record.sizeBytes ||
    Buffer.byteLength(payload, "utf8") !== record.sizeBytes) {
    return { ok: false, code: "blobMetadataMismatch" };
  }
  if (sha256(payload) !== record.checksum) return { ok: false, code: "checksumMismatch" };
  const integrity = inspectSavePayloadIntegrity(payload);
  if (!integrity.valid) return { ok: false, code: "envelopeInvalid" };
  if (integrity.formatVersion !== 2) return { ok: false, code: "envelopeVersionUnsupported" };
  if (payloadMode(integrity.parsed) !== "normal") return { ok: false, code: "nonNormalMode" };
  return { ok: true, payload };
}

function appendRejected(summary, record, code) {
  summary.rejected[code] += 1;
  if (record.current) summary.currentMain.unrecoverable += 1;
}

function previewIdFor(state, candidates) {
  const hash = createHash("sha256");
  hash.update("dsp-cloud-payload-alias-recovery-v1\n");
  hash.update(sha256(state.raw));
  hash.update(`\n${state.updatedAt}\n`);
  for (const candidate of [...candidates].sort((left, right) =>
    left.userId.localeCompare(right.userId) || left.revision - right.revision,
  )) {
    hash.update(candidate.userId);
    hash.update("\u0000");
    hash.update(String(candidate.revision));
    hash.update("\u0000");
    hash.update(candidate.checksum);
    hash.update("\u0000");
    hash.update(String(candidate.sizeBytes));
    hash.update("\n");
  }
  return hash.digest("hex");
}

function buildRecoveryPlan(database) {
  requirePayloadTables(database);
  quickCheck(database, "恢复源库");
  const state = readState(database);
  const { records, summary } = collectNormalMainHistory(state.data);
  const existing = database.prepare(`
    SELECT 1 AS present
    FROM cloud_save_payloads
    WHERE user_id = ? AND slot = 'main' AND revision = ?
  `);
  const validationCache = new Map();
  const candidates = [];

  for (const record of records) {
    if (record.conflicted) continue;
    if (existing.get(record.userId, record.revision)?.present) {
      summary.history.existingRows += 1;
      if (record.current) summary.currentMain.existingRows += 1;
      continue;
    }
    const validation = validateBlob(database, record, validationCache);
    if (!validation.ok) {
      appendRejected(summary, record, validation.code);
      continue;
    }
    candidates.push(record);
    summary.history.relinkCandidates += 1;
    if (record.current) summary.currentMain.relinkCandidates += 1;
  }

  return {
    state,
    candidates,
    summary,
    previewId: previewIdFor(state, candidates),
  };
}

function publicPreview(plan) {
  const candidateCount = plan.candidates.length;
  return {
    dryRun: true,
    eligible: candidateCount > 0,
    idempotent: candidateCount === 0,
    code: candidateCount > 0 ? "RECOVERY_READY" : "NO_RELINK_CANDIDATES",
    candidateAliases: candidateCount,
    currentMainCandidateAliases: plan.summary.currentMain.relinkCandidates,
    summary: plan.summary,
    previewId: plan.previewId,
    confirmation: `${CLOUD_PAYLOAD_ALIAS_RECOVERY_CONFIRMATION_PREFIX}:${plan.previewId}`,
  };
}

function verifyMatchingBackup(backupDatabase, plan) {
  const backupPlan = buildRecoveryPlan(backupDatabase);
  if (backupPlan.state.updatedAt !== plan.state.updatedAt || sha256(backupPlan.state.raw) !== sha256(plan.state.raw) || backupPlan.previewId !== plan.previewId) {
    fail("CLOUD_PAYLOAD_RECOVERY_BACKUP_MISMATCH", "备份库与待恢复快照不一致");
  }
}

export function previewCloudPayloadAliasRecovery(database) {
  return publicPreview(buildRecoveryPlan(database));
}

export function applyCloudPayloadAliasRecovery(productionDatabase, backupDatabase, {
  confirmation,
  serviceStopped = false,
} = {}) {
  if (serviceStopped !== true) {
    fail("CLOUD_PAYLOAD_RECOVERY_SERVICE_RUNNING", "应用恢复前必须停止云服务并显式传入 serviceStopped=true");
  }
  const plan = buildRecoveryPlan(productionDatabase);
  if (plan.candidates.length === 0) {
    return { applied: false, idempotent: true, candidateAliases: 0, summary: plan.summary };
  }
  const expectedConfirmation = `${CLOUD_PAYLOAD_ALIAS_RECOVERY_CONFIRMATION_PREFIX}:${plan.previewId}`;
  if (confirmation !== expectedConfirmation) {
    fail("CLOUD_PAYLOAD_RECOVERY_CONFIRMATION_INVALID", "恢复二次确认文字不匹配");
  }
  if (!backupDatabase) {
    fail("CLOUD_PAYLOAD_RECOVERY_BACKUP_REQUIRED", "应用恢复必须提供已验证的备份库");
  }
  verifyMatchingBackup(backupDatabase, plan);

  const insertAlias = productionDatabase.prepare(`
    INSERT INTO cloud_save_payloads (user_id, slot, revision, payload)
    VALUES (?, 'main', ?, ?)
  `);
  productionDatabase.transaction(() => {
    const currentPlan = buildRecoveryPlan(productionDatabase);
    if (currentPlan.previewId !== plan.previewId || currentPlan.candidates.length !== plan.candidates.length) {
      fail("CLOUD_PAYLOAD_RECOVERY_PREVIEW_STALE", "应用前恢复预览已变化，请重新执行只读预览");
    }
    for (const candidate of plan.candidates) {
      const result = insertAlias.run(
        candidate.userId,
        candidate.revision,
        createCloudPayloadAlias(candidate.checksum, candidate.sizeBytes),
      );
      if (result.changes !== 1) {
        fail("CLOUD_PAYLOAD_RECOVERY_INSERT_FAILED", "恢复别名写入未产生预期变更");
      }
    }
    const afterState = readState(productionDatabase);
    if (afterState.updatedAt !== plan.state.updatedAt || afterState.raw !== plan.state.raw) {
      fail("CLOUD_PAYLOAD_RECOVERY_APP_STATE_CHANGED", "恢复过程中 app_state 发生意外变化");
    }
  })();
  quickCheck(productionDatabase, "恢复后的生产库");
  const after = buildRecoveryPlan(productionDatabase);
  if (after.candidates.length !== 0) {
    fail("CLOUD_PAYLOAD_RECOVERY_POSTCONDITION_FAILED", "恢复后仍存在可重建的正文别名");
  }
  return {
    applied: true,
    idempotent: false,
    insertedAliases: plan.candidates.length,
    currentMainAliases: plan.summary.currentMain.relinkCandidates,
    summary: after.summary,
  };
}

function sourcePayloadForRecord(database, record) {
  const row = database.prepare(`
    SELECT payload
    FROM cloud_save_payloads
    WHERE user_id = ? AND slot = 'main' AND revision = ?
  `).get(record.userId, record.revision);
  if (!row || typeof row.payload !== "string") return { ok: false, code: "missingBlob" };
  let payload = row.payload;
  if (payload.charCodeAt(0) === 0x1e) {
    let alias;
    try {
      alias = parseCloudPayloadAlias(payload);
    } catch {
      return { ok: false, code: "blobMetadataMismatch" };
    }
    if (!alias || alias.checksum !== record.checksum || alias.sizeBytes !== record.sizeBytes) {
      return { ok: false, code: "blobMetadataMismatch" };
    }
    const blob = database.prepare(`
      SELECT size_bytes AS sizeBytes, payload
      FROM cloud_save_payload_blobs
      WHERE checksum = ?
    `).get(alias.checksum);
    if (!blob) return { ok: false, code: "missingBlob" };
    payload = blob.payload;
    const validation = validatePayloadText(payload, record, blob.sizeBytes);
    return validation.ok ? validation : { ok: false, code: validation.code };
  }
  const validation = validatePayloadText(payload, record, Buffer.byteLength(payload, "utf8"));
  return validation.ok ? validation : { ok: false, code: validation.code };
}

function bodySourceIdentity(database, bodySourceSha256 = null) {
  const state = readState(database);
  return {
    updatedAt: state.updatedAt,
    stateSha256: sha256(state.raw),
    fileSha256: bodySourceSha256,
  };
}

function bodyPreviewId(state, sourceIdentity, candidates, currentOnly) {
  const hash = createHash("sha256");
  hash.update("dsp-cloud-payload-body-recovery-v1\n");
  hash.update(sha256(state.raw));
  hash.update(`\n${state.updatedAt}\n${currentOnly ? "current-only" : "history"}\n`);
  hash.update(JSON.stringify(sourceIdentity));
  hash.update("\n");
  for (const candidate of [...candidates].sort((left, right) =>
    left.userId.localeCompare(right.userId) || left.revision - right.revision,
  )) {
    hash.update(candidate.userId);
    hash.update("\u0000");
    hash.update(String(candidate.revision));
    hash.update("\u0000");
    hash.update(candidate.checksum);
    hash.update("\u0000");
    hash.update(String(candidate.sizeBytes));
    hash.update("\u0000");
    hash.update(candidate.source);
    hash.update("\n");
  }
  return hash.digest("hex");
}

function addBodyCandidate(summary, record, source) {
  summary.history.relinkCandidates += 1;
  if (source === "backupBody") summary.history.bodyRestoreCandidates += 1;
  if (record.current) {
    summary.currentMain.relinkCandidates += 1;
    if (source === "backupBody") summary.currentMain.bodyRestoreCandidates += 1;
  }
}

function buildBodyRecoveryPlan(productionDatabase, bodySourceDatabase, {
  currentOnly = true,
  includeBodies = false,
  bodySourceSha256 = null,
  skipQuickCheck = false,
} = {}) {
  requirePayloadTables(productionDatabase);
  if (!skipQuickCheck) quickCheck(productionDatabase, "恢复目标库");
  if (!bodySourceDatabase) fail("CLOUD_PAYLOAD_RECOVERY_BODY_SOURCE_REQUIRED", "正文恢复必须提供事故前快照");
  requirePayloadTables(bodySourceDatabase);
  const state = readState(productionDatabase);
  const sourceIdentity = bodySourceIdentity(bodySourceDatabase, bodySourceSha256);
  const { records, summary } = collectNormalMainHistory(state.data);
  const selectedRecords = currentOnly ? records.filter((record) => record.current) : records;
  const existing = productionDatabase.prepare(`
    SELECT 1 AS present
    FROM cloud_save_payloads
    WHERE user_id = ? AND slot = 'main' AND revision = ?
  `);
  const validationCache = new Map();
  const candidates = [];

  for (const record of selectedRecords) {
    if (record.conflicted) continue;
    if (existing.get(record.userId, record.revision)?.present) {
      summary.history.existingRows += 1;
      if (record.current) summary.currentMain.existingRows += 1;
      continue;
    }
    const localValidation = validateBlob(productionDatabase, record, validationCache);
    if (localValidation.ok) {
      const candidate = { ...record, source: "existingBlob" };
      candidates.push(candidate);
      addBodyCandidate(summary, record, candidate.source);
      continue;
    }
    const sourceValidation = sourcePayloadForRecord(bodySourceDatabase, record);
    if (!sourceValidation.ok) {
      appendRejected(summary, record, sourceValidation.code);
      continue;
    }
    const candidate = {
      ...record,
      source: "backupBody",
      ...(includeBodies ? { payload: sourceValidation.payload } : {}),
    };
    candidates.push(candidate);
    addBodyCandidate(summary, record, candidate.source);
  }

  return {
    state,
    sourceIdentity,
    candidates,
    currentOnly,
    summary,
    previewId: bodyPreviewId(state, sourceIdentity, candidates, currentOnly),
  };
}

function publicBodyPreview(plan) {
  const candidateCount = plan.candidates.length;
  return {
    dryRun: true,
    recovery: "body-and-alias",
    currentOnly: plan.currentOnly,
    eligible: candidateCount > 0,
    idempotent: candidateCount === 0,
    code: candidateCount > 0 ? "RECOVERY_READY" : "NO_BODY_RECOVERY_CANDIDATES",
    candidateRows: candidateCount,
    currentMainCandidateRows: plan.summary.currentMain.relinkCandidates,
    currentMainBodyRestoreRows: plan.summary.currentMain.bodyRestoreCandidates,
    sourceIdentity: plan.sourceIdentity,
    summary: plan.summary,
    previewId: plan.previewId,
    confirmation: `${CLOUD_PAYLOAD_ALIAS_RECOVERY_CONFIRMATION_PREFIX}:${plan.previewId}`,
  };
}

export function previewCloudPayloadBodyRecovery(productionDatabase, bodySourceDatabase, options = {}) {
  quickCheck(bodySourceDatabase, "正文来源库");
  return publicBodyPreview(buildBodyRecoveryPlan(productionDatabase, bodySourceDatabase, {
    ...options,
    skipQuickCheck: false,
  }));
}

function verifyProductionBackupState(backupDatabase, plan) {
  requirePayloadTables(backupDatabase);
  quickCheck(backupDatabase, "停写生产备份");
  const backupState = readState(backupDatabase);
  if (backupState.updatedAt !== plan.state.updatedAt || sha256(backupState.raw) !== sha256(plan.state.raw)) {
    fail("CLOUD_PAYLOAD_RECOVERY_BACKUP_MISMATCH", "停写生产备份与恢复目标的 app_state 不一致");
  }
}

function insertRecoveredBodyAndAlias(database, candidate) {
  if (candidate.source === "backupBody") {
    if (typeof candidate.payload !== "string") {
      fail("CLOUD_PAYLOAD_RECOVERY_SOURCE_BODY_MISSING", "恢复候选缺少已验证正文");
    }
    const existingBlob = database.prepare(`
      SELECT size_bytes AS sizeBytes, payload
      FROM cloud_save_payload_blobs
      WHERE checksum = ?
    `).get(candidate.checksum);
    if (existingBlob) {
      if (existingBlob.sizeBytes !== candidate.sizeBytes || existingBlob.payload !== candidate.payload) {
        fail("CLOUD_PAYLOAD_RECOVERY_BLOB_COLLISION", "目标库已有同 checksum 但内容不同的 Blob，已拒绝覆盖");
      }
    } else {
      database.prepare(`
        INSERT INTO cloud_save_payload_blobs (checksum, size_bytes, payload)
        VALUES (?, ?, ?)
      `).run(candidate.checksum, candidate.sizeBytes, candidate.payload);
    }
  }
  const result = database.prepare(`
    INSERT INTO cloud_save_payloads (user_id, slot, revision, payload)
    VALUES (?, 'main', ?, ?)
  `).run(
    candidate.userId,
    candidate.revision,
    createCloudPayloadAlias(candidate.checksum, candidate.sizeBytes),
  );
  if (result.changes !== 1) {
    fail("CLOUD_PAYLOAD_RECOVERY_INSERT_FAILED", "恢复行写入未产生预期变更");
  }
}

export function applyCloudPayloadBodyRecovery(
  productionDatabase,
  productionBackupDatabase,
  bodySourceDatabase,
  {
    confirmation,
    serviceStopped = false,
    currentOnly = true,
    bodySourceSha256 = null,
  } = {},
) {
  if (serviceStopped !== true) {
    fail("CLOUD_PAYLOAD_RECOVERY_SERVICE_RUNNING", "应用恢复前必须停止云服务并显式传入 serviceStopped=true");
  }
  if (!bodySourceDatabase) fail("CLOUD_PAYLOAD_RECOVERY_BODY_SOURCE_REQUIRED", "正文恢复必须提供事故前快照");
  quickCheck(bodySourceDatabase, "正文来源库");
  quickCheck(productionDatabase, "恢复目标库");
  const plan = buildBodyRecoveryPlan(productionDatabase, bodySourceDatabase, {
    currentOnly,
    bodySourceSha256,
    skipQuickCheck: true,
  });
  const expectedConfirmation = `${CLOUD_PAYLOAD_ALIAS_RECOVERY_CONFIRMATION_PREFIX}:${plan.previewId}`;
  if (confirmation !== undefined && confirmation !== expectedConfirmation) {
    fail("CLOUD_PAYLOAD_RECOVERY_CONFIRMATION_INVALID", "恢复二次确认文字不匹配");
  }
  if (plan.candidates.length === 0) {
    return { applied: false, idempotent: true, insertedRows: 0, insertedBlobs: 0, summary: plan.summary };
  }
  if (confirmation !== expectedConfirmation) {
    fail("CLOUD_PAYLOAD_RECOVERY_CONFIRMATION_INVALID", "恢复二次确认文字不匹配");
  }
  if (!productionBackupDatabase) fail("CLOUD_PAYLOAD_RECOVERY_BACKUP_REQUIRED", "应用恢复必须提供停写生产备份");
  verifyProductionBackupState(productionBackupDatabase, plan);
  const materialized = buildBodyRecoveryPlan(productionDatabase, bodySourceDatabase, {
    currentOnly,
    includeBodies: true,
    bodySourceSha256,
    skipQuickCheck: true,
  });
  if (materialized.previewId !== plan.previewId || materialized.candidates.length !== plan.candidates.length) {
    fail("CLOUD_PAYLOAD_RECOVERY_PREVIEW_STALE", "恢复正文来源或候选清单已变化，请重新执行只读预览");
  }
  const insertExisting = productionDatabase.prepare(`
    SELECT 1 AS present
    FROM cloud_save_payloads
    WHERE user_id = ? AND slot = 'main' AND revision = ?
  `);
  let insertedBlobs = 0;
  productionDatabase.transaction(() => {
    const currentState = readState(productionDatabase);
    if (currentState.updatedAt !== plan.state.updatedAt || currentState.raw !== plan.state.raw) {
      fail("CLOUD_PAYLOAD_RECOVERY_APP_STATE_CHANGED", "恢复过程中 app_state 发生变化，请重新预览");
    }
    for (const candidate of materialized.candidates) {
      if (insertExisting.get(candidate.userId, candidate.revision)?.present) {
        fail("CLOUD_PAYLOAD_RECOVERY_PREVIEW_STALE", "恢复候选行已被新上传占用，请重新预览");
      }
      const beforeBlob = productionDatabase.prepare("SELECT 1 AS present FROM cloud_save_payload_blobs WHERE checksum = ?").get(candidate.checksum);
      insertRecoveredBodyAndAlias(productionDatabase, candidate);
      if (candidate.source === "backupBody" && !beforeBlob) insertedBlobs += 1;
    }
    const afterState = readState(productionDatabase);
    if (afterState.updatedAt !== plan.state.updatedAt || afterState.raw !== plan.state.raw) {
      fail("CLOUD_PAYLOAD_RECOVERY_APP_STATE_CHANGED", "恢复事务中 app_state 发生意外变化");
    }
  })();
  quickCheck(productionDatabase, "恢复后的生产库");
  const after = buildBodyRecoveryPlan(productionDatabase, bodySourceDatabase, {
    currentOnly,
    bodySourceSha256,
    skipQuickCheck: true,
  });
  if (after.candidates.length !== 0) {
    fail("CLOUD_PAYLOAD_RECOVERY_POSTCONDITION_FAILED", "恢复后仍存在可重建的正文行");
  }
  return {
    applied: true,
    idempotent: false,
    insertedRows: materialized.candidates.length,
    insertedBlobs,
    currentMainRows: plan.summary.currentMain.relinkCandidates,
    currentMainBodyRestoreRows: plan.summary.currentMain.bodyRestoreCandidates,
    summary: after.summary,
  };
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolve(hash.digest("hex")));
  });
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function runCli() {
  const databasePath = argument("--database");
  const apply = process.argv.includes("--apply");
  const bodySourcePath = argument("--body-source");
  const bodySourceSha256 = argument("--body-source-sha256");
  const currentOnly = process.argv.includes("--current-only");
  if (!databasePath) {
    fail("CLOUD_PAYLOAD_RECOVERY_DATABASE_REQUIRED", "用法：node cloud-payload-recovery.mjs --database <cloud.sqlite> [--body-source <事故前快照> --current-only] [--apply --backup <停写备份> --confirmation <文字> --service-stopped]");
  }
  const database = new Database(path.resolve(databasePath), apply ? undefined : { readonly: true, fileMustExist: true });
  let bodySource = null;
  try {
    if (bodySourcePath) {
      if (!currentOnly) {
        fail("CLOUD_PAYLOAD_RECOVERY_SCOPE_REQUIRED", "从事故前快照恢复必须显式传入 --current-only；历史正文需要单独预览和授权");
      }
      if (bodySourceSha256 !== null && !/^[0-9a-f]{64}$/.test(bodySourceSha256)) {
        fail("CLOUD_PAYLOAD_RECOVERY_SOURCE_HASH_INVALID", "正文来源 SHA-256 格式无效");
      }
      const sourcePath = path.resolve(bodySourcePath);
      if (apply && !bodySourceSha256) {
        fail("CLOUD_PAYLOAD_RECOVERY_SOURCE_HASH_REQUIRED", "应用正文恢复必须提供 --body-source-sha256");
      }
      if (bodySourceSha256) {
        const actualSourceSha256 = await sha256File(sourcePath);
        if (actualSourceSha256 !== bodySourceSha256) {
          fail("CLOUD_PAYLOAD_RECOVERY_SOURCE_HASH_MISMATCH", "正文来源文件 SHA-256 与确认值不一致");
        }
      }
      bodySource = new Database(sourcePath, { readonly: true, fileMustExist: true });
      bodySource.pragma("query_only = ON");
      if (!apply) {
        database.pragma("query_only = ON");
        console.log(JSON.stringify(previewCloudPayloadBodyRecovery(database, bodySource, {
          currentOnly,
          bodySourceSha256,
        }), null, 2));
        return;
      }
      const backupPath = argument("--backup");
      if (!backupPath) fail("CLOUD_PAYLOAD_RECOVERY_BACKUP_REQUIRED", "应用恢复必须指定停写生产备份");
      const backup = new Database(path.resolve(backupPath), { readonly: true, fileMustExist: true });
      try {
        backup.pragma("query_only = ON");
        console.log(JSON.stringify(applyCloudPayloadBodyRecovery(database, backup, bodySource, {
          confirmation: argument("--confirmation"),
          serviceStopped: process.argv.includes("--service-stopped"),
          currentOnly,
          bodySourceSha256,
        }), null, 2));
        return;
      } finally {
        backup.close();
      }
    }
    if (!apply) {
      database.pragma("query_only = ON");
      console.log(JSON.stringify(previewCloudPayloadAliasRecovery(database), null, 2));
      return;
    }
    const backupPath = argument("--backup");
    if (!backupPath) fail("CLOUD_PAYLOAD_RECOVERY_BACKUP_REQUIRED", "应用恢复必须指定 --backup");
    const backup = new Database(path.resolve(backupPath), { readonly: true, fileMustExist: true });
    try {
      backup.pragma("query_only = ON");
      console.log(JSON.stringify(applyCloudPayloadAliasRecovery(database, backup, {
        confirmation: argument("--confirmation"),
        serviceStopped: process.argv.includes("--service-stopped"),
      }), null, 2));
    } finally {
      backup.close();
    }
  } finally {
    bodySource?.close();
    database.close();
  }
}

let isCli = false;
try {
  isCli = Boolean(process.argv[1]) && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
} catch {
  isCli = false;
}
if (isCli) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
