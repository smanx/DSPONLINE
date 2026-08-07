import { createHash } from "node:crypto";
import { inspectSavePayloadIntegrity } from "./save-integrity.mjs";

export const LEADERBOARD_RESTRICTED_CODE = "LEADERBOARD_RESTRICTED";
export const LEADERBOARD_MODERATION_REASON = "SAVE_DATA_INTEGRITY";
export const LEADERBOARD_MODERATION_STATUS = "blocked";

const ACTIVE_SEASON_ID = "season_01";
const SOURCE_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,79}$/;

function normalizedSource(value) {
  if (typeof value !== "string") return null;
  const source = value.trim().toLowerCase();
  return SOURCE_PATTERN.test(source) ? source : null;
}

function normalizedTimestamp(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value))) : 0;
}

export function normalizeLeaderboardModeration(value, users) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const knownUsers = users && typeof users === "object" ? users : {};
  return Object.fromEntries(Object.entries(value).flatMap(([userId, record]) => {
    if (!knownUsers[userId] || knownUsers[userId]?.id !== userId || !record || typeof record !== "object") return [];
    if (record.status !== LEADERBOARD_MODERATION_STATUS || record.reasonCode !== LEADERBOARD_MODERATION_REASON) return [];
    const source = normalizedSource(record.source);
    if (!source) return [];
    return [[userId, {
      status: LEADERBOARD_MODERATION_STATUS,
      reasonCode: LEADERBOARD_MODERATION_REASON,
      source,
      createdAt: normalizedTimestamp(record.createdAt),
    }]];
  }));
}

export function isLeaderboardRestricted(data, userId) {
  const record = data?.leaderboardModeration?.[userId];
  return record?.status === LEADERBOARD_MODERATION_STATUS && record?.reasonCode === LEADERBOARD_MODERATION_REASON;
}

function categoryValue(submission) {
  const value = submission?.metrics?.galaxyScore;
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function visibleSeasonSubmissions(data) {
  return Object.values(data?.submissions ?? {})
    .filter((submission) => submission?.seasonId === ACTIVE_SEASON_ID && submission.visible !== false &&
      data?.users?.[submission.userId]?.leaderboardVisible !== false && !isLeaderboardRestricted(data, submission.userId))
    .sort((left, right) => categoryValue(right) - categoryValue(left) || String(left.userId).localeCompare(String(right.userId)));
}

function payloadForCurrentMainSave(data, userId, loadMainPayload) {
  const save = data?.cloudSaves?.[userId];
  if (!save) return { save: null, payload: null };
  const payload = typeof save.payload === "string" ? save.payload : loadMainPayload?.(userId, save.revision) ?? null;
  return { save, payload: typeof payload === "string" ? payload : null };
}

function isMainCloudSaveVerification(value) {
  return typeof value === "string" && /^main-cloud-save-v[12]$/.test(value);
}

function validateCandidateData(data, userId, submission, loadMainPayload) {
  const { save, payload } = payloadForCurrentMainSave(data, userId, loadMainPayload);
  const verification = submission?.verification;
  const integrity = payload ? inspectSavePayloadIntegrity(payload) : null;
  const payloadChecksum = payload ? createHash("sha256").update(payload).digest("hex") : null;
  const abnormalVeinMachineCount = Boolean(integrity?.valid && Array.isArray(integrity.state?.entities) &&
    integrity.state.entities.some((entity) => entity?.kind === "vein" && Number.isFinite(entity.machineCount) && entity.machineCount !== 0));
  return {
    save,
    payloadAvailable: Boolean(payload),
    envelopeIntegrityValid: integrity?.valid === true,
    payloadChecksumMatches: Boolean(payloadChecksum && save?.checksum === payloadChecksum),
    verificationStrategyMatches: isMainCloudSaveVerification(verification?.strategy),
    revisionMatches: Number.isInteger(save?.revision) && verification?.cloudRevision === save.revision,
    verificationChecksumMatches: typeof save?.checksum === "string" && verification?.checksum === save.checksum,
    abnormalVeinMachineCount,
  };
}

function resolutionSummary(status, details) {
  return {
    status,
    candidateCount: details.candidateCount,
    cloudRevision: details.cloudRevision ?? null,
    submissionRevision: details.submissionRevision ?? null,
    verificationStrategyMatches: details.verificationStrategyMatches === true,
    revisionMatches: details.revisionMatches === true,
    checksumMatches: details.checksumMatches === true,
    payloadChecksumMatches: details.payloadChecksumMatches === true,
    envelopeIntegrityValid: details.envelopeIntegrityValid === true,
    invariantViolationConfirmed: details.invariantViolationConfirmed === true,
    submissionsToRemove: details.submissionsToRemove ?? 0,
    alreadyModerated: status === "already-moderated",
  };
}

export function publicLeaderboardModerationResolution(resolution) {
  return resolutionSummary(resolution.status, resolution);
}

export function resolveLeaderboardModerationTarget(data, { displayName, loadMainPayload } = {}) {
  if (typeof displayName !== "string" || !displayName.trim()) {
    throw new Error("A non-empty display name is required for target resolution");
  }
  const expectedName = displayName.trim();
  const moderatedMatches = Object.keys(data?.leaderboardModeration ?? {}).filter((userId) =>
    isLeaderboardRestricted(data, userId) && data?.users?.[userId]?.displayName === expectedName);
  if (moderatedMatches.length === 1) {
    const userId = moderatedMatches[0];
    const submission = Object.values(data?.submissions ?? {}).find((entry) => entry?.userId === userId) ?? null;
    const currentSave = payloadForCurrentMainSave(data, userId, loadMainPayload);
    const integrity = currentSave.payload ? inspectSavePayloadIntegrity(currentSave.payload) : null;
    const payloadChecksum = currentSave.payload ? createHash("sha256").update(currentSave.payload).digest("hex") : null;
    const abnormalVeinMachineCount = Boolean(integrity?.valid && Array.isArray(integrity.state?.entities) &&
      integrity.state.entities.some((entity) => entity?.kind === "vein" && Number.isFinite(entity.machineCount) && entity.machineCount !== 0));
    return {
      ...resolutionSummary("already-moderated", {
        candidateCount: 1,
        cloudRevision: currentSave.save?.revision,
        submissionRevision: submission?.verification?.cloudRevision,
        verificationStrategyMatches: submission ? isMainCloudSaveVerification(submission.verification?.strategy) : true,
        revisionMatches: submission ? submission.verification?.cloudRevision === currentSave.save?.revision : true,
        checksumMatches: submission ? submission.verification?.checksum === currentSave.save?.checksum : true,
        payloadChecksumMatches: Boolean(payloadChecksum && payloadChecksum === currentSave.save?.checksum),
        envelopeIntegrityValid: integrity?.valid === true,
        invariantViolationConfirmed: abnormalVeinMachineCount,
        submissionsToRemove: Object.values(data?.submissions ?? {}).filter((entry) => entry?.userId === userId || entry?.accountId === userId).length,
      }),
      userId,
    };
  }
  if (moderatedMatches.length > 1) return resolutionSummary("ambiguous", { candidateCount: moderatedMatches.length });

  const ranked = visibleSeasonSubmissions(data);
  const submission = ranked[0];
  if (!submission || submission.displayName !== expectedName) {
    return resolutionSummary("not-found", { candidateCount: 0 });
  }
  const userId = submission.userId;
  const validation = validateCandidateData(data, userId, submission, loadMainPayload);
  const valid = validation.payloadAvailable && validation.envelopeIntegrityValid && validation.payloadChecksumMatches &&
    validation.verificationStrategyMatches && validation.revisionMatches && validation.verificationChecksumMatches &&
    validation.abnormalVeinMachineCount;
  const details = {
    candidateCount: 1,
    cloudRevision: validation.save?.revision,
    submissionRevision: submission.verification?.cloudRevision,
    verificationStrategyMatches: validation.verificationStrategyMatches,
    revisionMatches: validation.revisionMatches,
    checksumMatches: validation.verificationChecksumMatches,
    payloadChecksumMatches: validation.payloadChecksumMatches,
    envelopeIntegrityValid: validation.envelopeIntegrityValid,
    invariantViolationConfirmed: validation.abnormalVeinMachineCount,
    submissionsToRemove: Object.values(data?.submissions ?? {}).filter((entry) => entry?.userId === userId || entry?.accountId === userId).length,
  };
  return { ...resolutionSummary(valid ? "ready" : "verification-failed", details), userId };
}

export function applyLeaderboardModerationToData(data, resolution, { source, now = Date.now() } = {}) {
  if (!resolution || !["ready", "already-moderated"].includes(resolution.status) || !resolution.userId) {
    throw new Error("Leaderboard moderation target was not uniquely verified");
  }
  const normalized = normalizedSource(source);
  if (!normalized) throw new Error("Leaderboard moderation source is invalid");
  const userId = resolution.userId;
  if (!data?.users?.[userId]) throw new Error("Leaderboard moderation target no longer exists");
  data.leaderboardModeration ??= {};
  const previouslyRestricted = isLeaderboardRestricted(data, userId);
  if (!previouslyRestricted) {
    data.leaderboardModeration[userId] = {
      status: LEADERBOARD_MODERATION_STATUS,
      reasonCode: LEADERBOARD_MODERATION_REASON,
      source: normalized,
      createdAt: normalizedTimestamp(now),
    };
  }
  let removed = 0;
  for (const [key, submission] of Object.entries(data.submissions ?? {})) {
    if (submission?.userId !== userId && submission?.accountId !== userId) continue;
    delete data.submissions[key];
    removed += 1;
  }
  if (!previouslyRestricted) {
    data.auditLog ??= [];
    data.auditLog.push({
      action: "leaderboard.moderation_blocked",
      occurredAt: normalizedTimestamp(now),
      actorHash: null,
      ipHash: null,
      clientType: "operations",
    });
    data.auditLog = data.auditLog.slice(-2000);
  }
  return {
    changed: !previouslyRestricted || removed > 0,
    alreadyModerated: previouslyRestricted,
    submissionsRemoved: removed,
  };
}
