import { createInitialState } from "./engine";
import { DEFAULT_GALAXY_SEED } from "./galaxy";
import { computeSaveStateChecksum } from "./saveEnvelopeIntegrity";
import type { FactoryEntity, GameState, PlanetId, SaveMode } from "./types";

export const CANONICAL_UNIPOLAR_PLANET_ID: PlanetId = "magnetar";
export const CANONICAL_UNIPOLAR_VEIN_ID = "ashen_unipolar";
const SAVE_FORMAT_VERSION = 2;

export interface UnipolarVeinAudit {
  expectedPlanetIds: PlanetId[];
  observedTotal: number;
  observedByPlanet: Partial<Record<PlanetId, number>>;
  canonicalCount: number;
  canonicalIdValid: boolean;
  missingExpectedPlanetIds: PlanetId[];
  duplicatePlanetIds: PlanetId[];
  issues: string[];
  healthy: boolean;
}

export interface UnipolarRepairContext {
  saveId: string;
  reason: string;
  operator: string;
  createdAt: number;
  leaderboardReview?: "not-required" | "required" | "approved" | "rejected";
}

export interface UnipolarRepairPreview {
  eligible: boolean;
  sourceChecksum: string;
  confirmationToken: string;
  sourceAudit: UnipolarVeinAudit;
  targetPlanetId: PlanetId;
  targetEntityId: string;
  mode: SaveMode;
  requiresLeaderboardReview: boolean;
  blockingReasons: string[];
}

export interface UnipolarRepairAuditRecord {
  saveId: string;
  operator: string;
  reason: string;
  createdAt: number;
  mode: SaveMode;
  sourceChecksum: string;
  candidateChecksum: string;
  confirmationToken: string;
  beforeCount: number;
  afterCount: number;
  targetPlanetId: PlanetId;
  targetEntityId: string;
  leaderboardReview: "not-required" | "required" | "approved" | "rejected";
}

export interface UnipolarRepairPackage {
  backupState: GameState;
  candidateState: GameState;
  audit: UnipolarRepairAuditRecord;
}

function checksum(state: GameState): string {
  return computeSaveStateChecksum(SAVE_FORMAT_VERSION, state);
}

function cleanAuditText(value: string, fallback: string): string {
  const normalized = value.trim().replace(/[\r\n\t]+/g, " ").slice(0, 160);
  return normalized || fallback;
}

function expectedUnipolarPlanets(state: GameState): PlanetId[] {
  return Object.values(state.galaxy.profiles)
    .filter((profile) => profile.resourceIds.includes("unipolar_magnet"))
    .map((profile) => profile.planetId)
    .sort();
}

export function auditUnipolarVeins(state: GameState): UnipolarVeinAudit {
  const expectedPlanetIds = expectedUnipolarPlanets(state);
  const observed = state.entities.filter((entity) => entity.kind === "vein" && entity.resourceId === "unipolar_magnet");
  const observedByPlanet: Partial<Record<PlanetId, number>> = {};
  for (const entity of observed) observedByPlanet[entity.planetId] = (observedByPlanet[entity.planetId] ?? 0) + 1;
  const missingExpectedPlanetIds = expectedPlanetIds.filter((planetId) => (observedByPlanet[planetId] ?? 0) === 0);
  const duplicatePlanetIds = expectedPlanetIds.filter((planetId) => (observedByPlanet[planetId] ?? 0) > 1);
  const canonicalEntities = observed.filter((entity) => entity.planetId === CANONICAL_UNIPOLAR_PLANET_ID);
  const canonicalIdEntity = state.entities.find((entity) => entity.id === CANONICAL_UNIPOLAR_VEIN_ID);
  const canonicalIdValid = Boolean(canonicalIdEntity && canonicalIdEntity.kind === "vein" &&
    canonicalIdEntity.planetId === CANONICAL_UNIPOLAR_PLANET_ID && canonicalIdEntity.resourceId === "unipolar_magnet");
  const issues: string[] = [];
  if (missingExpectedPlanetIds.length > 0) issues.push(`缺少声明资源节点：${missingExpectedPlanetIds.join("、")}`);
  if (duplicatePlanetIds.length > 0) issues.push(`同一行星存在重复单极磁石节点：${duplicatePlanetIds.join("、")}`);
  if (canonicalEntities.length > 0 && !canonicalIdValid) issues.push(`磁潮孤星单极磁石节点缺少规范 ID ${CANONICAL_UNIPOLAR_VEIN_ID}`);
  for (const entity of observed) {
    if (!expectedPlanetIds.includes(entity.planetId)) issues.push(`行星 ${entity.planetId} 存在目录未声明的单极磁石节点 ${entity.id}`);
  }
  return {
    expectedPlanetIds,
    observedTotal: observed.length,
    observedByPlanet,
    canonicalCount: canonicalEntities.length,
    canonicalIdValid,
    missingExpectedPlanetIds,
    duplicatePlanetIds,
    issues,
    healthy: issues.length === 0,
  };
}

function repairToken(sourceChecksum: string, context: UnipolarRepairContext): string {
  return computeSaveStateChecksum(SAVE_FORMAT_VERSION, {
    operation: "restore-missing-canonical-unipolar-v1",
    sourceChecksum,
    saveId: cleanAuditText(context.saveId, "unknown-save"),
    reason: cleanAuditText(context.reason, "missing canonical unipolar vein"),
    operator: cleanAuditText(context.operator, "unknown-operator"),
    createdAt: Math.max(0, Math.floor(context.createdAt)),
  });
}

export function previewUnipolarVeinRepair(state: GameState, context: UnipolarRepairContext): UnipolarRepairPreview {
  const sourceAudit = auditUnipolarVeins(state);
  const sourceChecksum = checksum(state);
  const mode: SaveMode = state.mode === "speedrun" ? "speedrun" : "normal";
  const requiresLeaderboardReview = mode === "speedrun" || state.speedrun?.enabled === true;
  const blockingReasons: string[] = [];
  const canonicalProfile = state.galaxy.profiles[CANONICAL_UNIPOLAR_PLANET_ID];
  if (!canonicalProfile?.resourceIds.includes("unipolar_magnet")) {
    blockingReasons.push("当前星系目录没有声明磁潮孤星单极磁石，不能凭空补矿");
  }
  if (sourceAudit.canonicalCount !== 0) {
    blockingReasons.push(sourceAudit.canonicalCount === 1
      ? "磁潮孤星已有一个合法单极磁石节点；单个节点是当前规则的正常结果"
      : "磁潮孤星已有重复单极磁石节点，必须先人工审计，不能继续增加");
  }
  const idCollision = state.entities.find((entity) => entity.id === CANONICAL_UNIPOLAR_VEIN_ID);
  if (idCollision) blockingReasons.push(`实体 ID ${CANONICAL_UNIPOLAR_VEIN_ID} 已被占用，不能自动改名或覆盖`);
  if (requiresLeaderboardReview && context.leaderboardReview !== "approved") {
    blockingReasons.push("速通或排行榜相关存档必须先完成独立资格复核");
  }
  return {
    eligible: blockingReasons.length === 0,
    sourceChecksum,
    confirmationToken: repairToken(sourceChecksum, context),
    sourceAudit,
    targetPlanetId: CANONICAL_UNIPOLAR_PLANET_ID,
    targetEntityId: CANONICAL_UNIPOLAR_VEIN_ID,
    mode,
    requiresLeaderboardReview,
    blockingReasons,
  };
}

function canonicalUnipolarTemplate(state: GameState): FactoryEntity {
  const baseline = createInitialState(state.galaxy.seed, state.galaxy.seed === DEFAULT_GALAXY_SEED);
  const entity = baseline.entities.find((candidate) => candidate.id === CANONICAL_UNIPOLAR_VEIN_ID);
  if (!entity || entity.kind !== "vein" || entity.resourceId !== "unipolar_magnet") {
    throw new Error("当前版本缺少规范单极磁石模板");
  }
  return structuredClone(entity);
}

/**
 * Builds an in-memory repair package only. Callers must persist the backup and
 * verify its hash before writing the candidate. Nothing invokes this during
 * migration, load, import, cloud restore, or leaderboard submission.
 */
export function createUnipolarVeinRepairPackage(
  state: GameState,
  context: UnipolarRepairContext,
  confirmationToken: string,
): UnipolarRepairPackage {
  const preview = previewUnipolarVeinRepair(state, context);
  if (!preview.eligible) throw new Error(preview.blockingReasons[0] ?? "该存档不符合单极磁石人工修复条件");
  if (preview.confirmationToken !== confirmationToken) throw new Error("人工修复确认令牌不匹配，源存档或审核信息已变化");
  if (checksum(state) !== preview.sourceChecksum) throw new Error("源存档哈希已变化，请重新预览并备份");
  const backupState = structuredClone(state);
  const candidateState = structuredClone(state);
  candidateState.entities.push(canonicalUnipolarTemplate(state));
  const candidateAudit = auditUnipolarVeins(candidateState);
  if (!candidateAudit.healthy || candidateAudit.canonicalCount !== 1) {
    throw new Error(candidateAudit.issues[0] ?? "修复候选未通过单极磁石资源校验");
  }
  const candidateChecksum = checksum(candidateState);
  return {
    backupState,
    candidateState,
    audit: {
      saveId: cleanAuditText(context.saveId, "unknown-save"),
      operator: cleanAuditText(context.operator, "unknown-operator"),
      reason: cleanAuditText(context.reason, "missing canonical unipolar vein"),
      createdAt: Math.max(0, Math.floor(context.createdAt)),
      mode: preview.mode,
      sourceChecksum: preview.sourceChecksum,
      candidateChecksum,
      confirmationToken: preview.confirmationToken,
      beforeCount: preview.sourceAudit.observedTotal,
      afterCount: candidateAudit.observedTotal,
      targetPlanetId: CANONICAL_UNIPOLAR_PLANET_ID,
      targetEntityId: CANONICAL_UNIPOLAR_VEIN_ID,
      leaderboardReview: context.leaderboardReview ?? (preview.requiresLeaderboardReview ? "required" : "not-required"),
    },
  };
}

export function rollbackUnipolarVeinRepair(repaired: GameState, repairPackage: UnipolarRepairPackage): GameState {
  if (checksum(repaired) !== repairPackage.audit.candidateChecksum) {
    throw new Error("当前状态与修复候选哈希不一致，已拒绝覆盖式回滚");
  }
  if (checksum(repairPackage.backupState) !== repairPackage.audit.sourceChecksum) {
    throw new Error("修复备份哈希不一致，已拒绝回滚");
  }
  return structuredClone(repairPackage.backupState);
}
