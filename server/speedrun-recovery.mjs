import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { inspectSavePayloadIntegrity } from "./save-integrity.mjs";

export const SPEEDRUN_RECOVERY_CONFIRMATION_PREFIX = "RECOVER_SPEEDRUN";
const TARGET_ID = "white_matrix_1m";
const SEASON_ID = "season_01";
const RULESET_VERSION = "speedrun-v1";
const TARGET_AMOUNT = 1_000_000;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readState(database) {
  const row = database.prepare("SELECT payload FROM app_state WHERE id = 1").get();
  if (typeof row?.payload !== "string") throw new Error("app_state 不存在或不可读");
  const data = JSON.parse(row.payload);
  return { data, raw: row.payload };
}

function quickCheck(database, label) {
  const rows = database.pragma("quick_check");
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0].quick_check !== "ok") throw new Error(`${label} SQLite quick_check 未通过`);
}

function currentMainSave(data, accountId) {
  const save = data?.cloudSaves?.[accountId];
  if (!save || !Number.isInteger(save.revision) || save.revision < 1 || typeof save.checksum !== "string") return null;
  return save;
}

function readMainPayload(database, accountId, revision) {
  const row = database.prepare("SELECT payload FROM cloud_save_payloads WHERE user_id = ? AND slot = 'main' AND revision = ?").get(accountId, revision);
  return typeof row?.payload === "string" ? row.payload : null;
}

function validateCandidate(database, accountId, now = Date.now()) {
  quickCheck(database, "生产库");
  const { data } = readState(database);
  const user = data?.users?.[accountId];
  if (!user) return { eligible: false, code: "ACCOUNT_NOT_FOUND", reason: "账号不存在" };
  const save = currentMainSave(data, accountId);
  if (!save) return { eligible: false, code: "MAIN_SAVE_MISSING", reason: "账号没有主云存档" };
  const payload = readMainPayload(database, accountId, save.revision);
  if (!payload) return { eligible: false, code: "MAIN_PAYLOAD_MISSING", reason: "主云存档正文不存在" };
  if (sha256(payload) !== save.checksum) return { eligible: false, code: "CLOUD_CHECKSUM_MISMATCH", reason: "主云存档正文与元数据校验不一致" };
  const integrity = inspectSavePayloadIntegrity(payload);
  if (!integrity.valid || integrity.formatVersion !== 2) return { eligible: false, code: "SAVE_INTEGRITY_INVALID", reason: "主云存档 envelope v2 完整性校验失败" };
  const state = integrity.state;
  const speedrun = state?.speedrun;
  if (state?.version !== 46) return { eligible: false, code: "STATE_VERSION_UNSUPPORTED", reason: "恢复工具仅接受 GameState v46" };
  if (!speedrun || speedrun.enabled !== true || speedrun.mode !== "speedrun" || speedrun.eligible !== true) return { eligible: false, code: "SPEEDRUN_INELIGIBLE", reason: "主云存档不是合格速通工厂" };
  if (speedrun.rulesetVersion !== RULESET_VERSION || speedrun.seasonId !== SEASON_ID) return { eligible: false, code: "RULESET_UNSUPPORTED", reason: "速通规则或赛季不匹配" };
  if (Array.isArray(state.contentPacks) && state.contentPacks.length > 0) return { eligible: false, code: "CONTENT_PACKS_ENABLED", reason: "启用内容包的存档不能恢复正式成绩" };
  const factoryId = typeof speedrun.factoryId === "string" && speedrun.factoryId.trim() ? speedrun.factoryId.trim() : null;
  const startedAt = Number(speedrun.startedAt);
  const elapsedActiveSeconds = Number(speedrun.elapsedActiveSeconds);
  if (!factoryId || !Number.isSafeInteger(startedAt) || startedAt <= 0 || !Number.isFinite(elapsedActiveSeconds) || elapsedActiveSeconds <= 0 || startedAt > now + 300_000 || elapsedActiveSeconds > Math.max(0, (now - startedAt) / 1_000) + 300) {
    return { eligible: false, code: "SPEEDRUN_CLOCK_INVALID", reason: "速通身份或有效计时字段异常" };
  }
  const produced = Math.max(0, Math.floor(Number(state?.totalProduced?.universe_matrix) || 0));
  const baseline = Math.max(0, Math.floor(Number(speedrun?.baseline?.whiteMatrixProduced) || 0));
  const progress = Math.max(0, produced - baseline);
  if (progress < TARGET_AMOUNT) return { eligible: false, code: "TARGET_INCOMPLETE", reason: `累计白糖净增量仅 ${progress}/${TARGET_AMOUNT}` };
  const milestone = speedrun?.milestones?.[TARGET_ID];
  const milestoneSeconds = Number(milestone?.completedAtSeconds);
  const elapsedSeconds = milestone?.completed === true && Number.isFinite(milestoneSeconds) && milestoneSeconds > 0 && milestoneSeconds <= elapsedActiveSeconds
    ? milestoneSeconds
    : elapsedActiveSeconds;
  const key = `${SEASON_ID}:${TARGET_ID}:${accountId}:${factoryId}`;
  const existing = data?.speedrunSubmissions?.[key] ?? null;
  return {
    eligible: true,
    code: existing ? "ALREADY_RECORDED" : "RECOVERY_READY",
    reason: existing ? "该工厂已有成绩，恢复保持幂等且不会覆盖" : "权威主云档已达到百万白糖目标",
    accountId,
    factoryId,
    revision: save.revision,
    saveHash: save.checksum,
    progress,
    elapsedSeconds,
    milestoneRecovered: milestone?.completed !== true,
    existing,
    data,
    user,
    key,
  };
}

export function previewSpeedrunRecovery(database, accountId, now = Date.now()) {
  const candidate = validateCandidate(database, accountId, now);
  return {
    eligible: candidate.eligible && !candidate.existing,
    idempotent: Boolean(candidate.existing),
    code: candidate.code,
    reason: candidate.reason,
    accountId,
    ...(candidate.eligible ? {
      factoryId: candidate.factoryId,
      revision: candidate.revision,
      saveHash: candidate.saveHash,
      progress: candidate.progress,
      elapsedSeconds: candidate.existing?.elapsedSeconds ?? candidate.elapsedSeconds,
      milestoneRecovered: candidate.milestoneRecovered,
      confirmation: `${SPEEDRUN_RECOVERY_CONFIRMATION_PREFIX}:${accountId}:${candidate.revision}`,
    } : {}),
  };
}

function verifyMatchingBackup(productionDatabase, backupDatabase, accountId, candidate) {
  quickCheck(backupDatabase, "备份库");
  const { data: backupData } = readState(backupDatabase);
  const backupSave = currentMainSave(backupData, accountId);
  if (!backupSave || backupSave.revision !== candidate.revision || backupSave.checksum !== candidate.saveHash) throw new Error("备份库不包含当前生产主云档修订与校验值");
  const backupPayload = readMainPayload(backupDatabase, accountId, backupSave.revision);
  if (!backupPayload || sha256(backupPayload) !== candidate.saveHash) throw new Error("备份库主云档正文缺失或校验失败");
  const productionPayload = readMainPayload(productionDatabase, accountId, candidate.revision);
  if (productionPayload !== backupPayload) throw new Error("备份库与生产库主云档正文不一致");
}

export function applySpeedrunRecovery(productionDatabase, backupDatabase, {
  accountId,
  confirmation,
  serviceStopped = false,
  now = Date.now(),
} = {}) {
  if (serviceStopped !== true) throw new Error("应用恢复前必须停止云服务并显式传入 serviceStopped=true");
  const candidate = validateCandidate(productionDatabase, accountId, now);
  if (!candidate.eligible) throw new Error(candidate.reason);
  if (candidate.existing) return { applied: false, idempotent: true, preview: previewSpeedrunRecovery(productionDatabase, accountId, now) };
  const expectedConfirmation = `${SPEEDRUN_RECOVERY_CONFIRMATION_PREFIX}:${accountId}:${candidate.revision}`;
  if (confirmation !== expectedConfirmation) throw new Error("恢复二次确认文字不匹配");
  verifyMatchingBackup(productionDatabase, backupDatabase, accountId, candidate);
  const entry = {
    submissionId: `speedrun_recovery_${randomUUID()}`,
    userId: accountId,
    displayName: candidate.user.displayName,
    avatar: String(candidate.user.displayName ?? "A").trim().slice(0, 1).toUpperCase() || "A",
    targetId: TARGET_ID,
    seasonId: SEASON_ID,
    rulesetVersion: RULESET_VERSION,
    factoryId: candidate.factoryId,
    elapsedSeconds: candidate.elapsedSeconds,
    completedAtSeconds: candidate.elapsedSeconds,
    completedAt: now,
    receivedAt: now,
    saveRevision: candidate.revision,
    saveHash: candidate.saveHash,
    verified: true,
    recovery: { source: "offline-authoritative-cloud-v1", milestoneRecovered: candidate.milestoneRecovered },
  };
  productionDatabase.transaction(() => {
    const current = validateCandidate(productionDatabase, accountId, now);
    if (!current.eligible || current.existing || current.revision !== candidate.revision || current.saveHash !== candidate.saveHash) throw new Error("应用前权威主云档或现有成绩已变化，请重新预览");
    current.data.speedrunSubmissions ??= {};
    current.data.speedrunSubmissions[current.key] = entry;
    current.data.auditLog ??= [];
    current.data.auditLog.push({ action: "speedrun.manual_recovery", occurredAt: now, actorHash: null, ipHash: null, clientType: "offline-recovery" });
    current.data.auditLog = current.data.auditLog.slice(-2000);
    productionDatabase.prepare("UPDATE app_state SET payload = ?, updated_at = ? WHERE id = 1").run(JSON.stringify(current.data), now);
  })();
  return { applied: true, idempotent: false, accountId, factoryId: candidate.factoryId, revision: candidate.revision, elapsedSeconds: candidate.elapsedSeconds };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function runCli() {
  const databasePath = argument("--database");
  const accountId = argument("--account");
  const apply = process.argv.includes("--apply");
  if (!databasePath || !accountId) throw new Error("用法：node speedrun-recovery.mjs --database <cloud.sqlite> --account <accountId> [--apply --backup <backup.sqlite> --confirmation <文字> --service-stopped]");
  const production = new Database(path.resolve(databasePath), apply ? undefined : { readonly: true, fileMustExist: true });
  try {
    if (!apply) return console.log(JSON.stringify(previewSpeedrunRecovery(production, accountId), null, 2));
    const backupPath = argument("--backup");
    if (!backupPath) throw new Error("应用恢复必须指定 --backup");
    const backup = new Database(path.resolve(backupPath), { readonly: true, fileMustExist: true });
    try {
      console.log(JSON.stringify(applySpeedrunRecovery(production, backup, {
        accountId,
        confirmation: argument("--confirmation"),
        serviceStopped: process.argv.includes("--service-stopped"),
      }), null, 2));
    } finally {
      backup.close();
    }
  } finally {
    production.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
