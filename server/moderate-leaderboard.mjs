import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import {
  applyLeaderboardModerationToData,
  publicLeaderboardModerationResolution,
  resolveLeaderboardModerationTarget,
} from "./leaderboard-moderation.mjs";

function parseArguments(values) {
  const options = { apply: false, confirmServiceStopped: false };
  for (const value of values) {
    if (value === "--apply") options.apply = true;
    else if (value === "--confirm-service-stopped") options.confirmServiceStopped = true;
    else if (value.startsWith("--database=")) options.database = value.slice("--database=".length);
    else if (value.startsWith("--backup=")) options.backup = value.slice("--backup=".length);
    else if (value.startsWith("--display-name=")) options.displayName = value.slice("--display-name=".length);
    else if (value.startsWith("--source=")) options.source = value.slice("--source=".length);
    else throw new Error("Unknown leaderboard moderation argument");
  }
  if (!options.database || !options.displayName) throw new Error("Database and display name are required");
  if (options.apply && (!options.backup || !options.source || !options.confirmServiceStopped)) {
    throw new Error("Apply requires a verified backup, source, and explicit stopped-service confirmation");
  }
  if (options.backup && path.resolve(options.backup) === path.resolve(options.database)) {
    throw new Error("Backup and production database paths must differ");
  }
  return options;
}

function quickCheck(database) {
  return database.pragma("quick_check").every((row) => row.quick_check === "ok");
}

function readState(database) {
  const row = database.prepare("SELECT payload, updated_at AS updatedAt FROM app_state WHERE id = 1").get();
  if (typeof row?.payload !== "string") throw new Error("Cloud app_state is missing");
  return { ...row, data: JSON.parse(row.payload) };
}

function payloadLoader(database) {
  const query = database.prepare("SELECT payload FROM cloud_save_payloads WHERE user_id = ? AND slot = 'main' AND revision = ?");
  return (userId, revision) => query.get(userId, revision)?.payload ?? null;
}

function resolveDatabase(database, displayName) {
  const { data } = readState(database);
  return { data, resolution: resolveLeaderboardModerationTarget(data, {
    displayName,
    loadMainPayload: payloadLoader(database),
  }) };
}

function protectedCounts(database, data, userId) {
  return {
    cloudRevision: data.cloudSaves?.[userId]?.revision ?? null,
    historyCount: Array.isArray(data.cloudSaveHistory?.[userId]) ? data.cloudSaveHistory[userId].length : 0,
    payloadCount: database.prepare("SELECT count(*) AS count FROM cloud_save_payloads WHERE user_id = ?").get(userId).count,
  };
}

export function runLeaderboardModeration(options) {
  const database = new Database(options.database, options.apply
    ? { fileMustExist: true }
    : { readonly: true, fileMustExist: true });
  try {
    if (!quickCheck(database)) throw new Error("Production database quick_check failed");
    if (!options.apply) {
      database.pragma("query_only = ON");
      const { resolution } = resolveDatabase(database, options.displayName);
      return { mode: "dry-run", quickCheck: true, ...publicLeaderboardModerationResolution(resolution) };
    }

    const backup = new Database(options.backup, { readonly: true, fileMustExist: true });
    let backupResolution;
    try {
      backup.pragma("query_only = ON");
      if (!quickCheck(backup)) throw new Error("Backup database quick_check failed");
      backupResolution = resolveDatabase(backup, options.displayName).resolution;
      if (!["ready", "already-moderated"].includes(backupResolution.status)) {
        throw new Error("Backup target resolution is not uniquely verified");
      }
    } finally {
      backup.close();
    }

    database.pragma("busy_timeout = 5000");
    const beforeRow = readState(database);
    const resolution = resolveLeaderboardModerationTarget(beforeRow.data, {
      displayName: options.displayName,
      loadMainPayload: payloadLoader(database),
    });
    if (!["ready", "already-moderated"].includes(resolution.status)) {
      throw new Error("Production target resolution is not uniquely verified");
    }
    const backupPublic = publicLeaderboardModerationResolution(backupResolution);
    const productionPublic = publicLeaderboardModerationResolution(resolution);
    for (const key of ["cloudRevision", "envelopeIntegrityValid", "payloadChecksumMatches", "invariantViolationConfirmed"]) {
      if (backupPublic[key] !== productionPublic[key]) throw new Error("Production state changed after the verified backup");
    }
    const beforeCounts = protectedCounts(database, beforeRow.data, resolution.userId);
    const result = applyLeaderboardModerationToData(beforeRow.data, resolution, {
      source: options.source,
      now: Date.now(),
    });
    const nextPayload = JSON.stringify(beforeRow.data);
    database.transaction(() => {
      const changed = database.prepare(
        "UPDATE app_state SET payload = ?, updated_at = ? WHERE id = 1 AND payload = ? AND updated_at = ?",
      ).run(nextPayload, Date.now(), beforeRow.payload, beforeRow.updatedAt);
      if (changed.changes !== 1) throw new Error("Cloud app_state changed during moderation");
    })();

    if (!quickCheck(database)) throw new Error("Post-remediation database quick_check failed");
    const after = resolveDatabase(database, options.displayName);
    if (after.resolution.status !== "already-moderated" || after.resolution.submissionsToRemove !== 0) {
      throw new Error("Post-remediation verification failed");
    }
    const afterCounts = protectedCounts(database, after.data, after.resolution.userId);
    return {
      mode: "apply",
      quickCheck: true,
      changed: result.changed,
      alreadyModerated: result.alreadyModerated,
      submissionsRemoved: result.submissionsRemoved,
      cloudRevisionUnchanged: beforeCounts.cloudRevision === afterCounts.cloudRevision,
      historyCountUnchanged: beforeCounts.historyCount === afterCounts.historyCount,
      payloadCountUnchanged: beforeCounts.payloadCount === afterCounts.payloadCount,
      ...publicLeaderboardModerationResolution(after.resolution),
    };
  } finally {
    database.close();
  }
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    console.log(JSON.stringify(runLeaderboardModeration(parseArguments(process.argv.slice(2)))));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Leaderboard moderation failed");
    process.exitCode = 1;
  }
}
