import { describe, expect, it } from "vitest";
import { createInitialState, createPlayerInitialState, createSpeedrunInitialState } from "./engine";
import { DEFAULT_GALAXY_SEED } from "./galaxy";
import { inspectSave, migrateGame, serializeEnvelope } from "./storage";
import {
  CANONICAL_UNIPOLAR_VEIN_ID,
  auditUnipolarVeins,
  createUnipolarVeinRepairPackage,
  previewUnipolarVeinRepair,
  rollbackUnipolarVeinRepair,
} from "./resourceIntegrity";
import { computeSaveStateChecksum } from "./saveEnvelopeIntegrity";

const context = {
  saveId: "fixture-normal-main",
  reason: "confirmed missing canonical resource entity",
  operator: "test-operator",
  createdAt: 1_786_291_200_000,
} as const;

describe("单极磁石资源完整性审计与人工修复", () => {
  it("确认当前规则允许全星区只有一个单极磁石节点", () => {
    let state = createInitialState(1, false);
    for (let seed = 1; seed <= 512 && auditUnipolarVeins(state).observedTotal !== 1; seed += 1) {
      state = createInitialState(seed, false);
    }
    const audit = auditUnipolarVeins(state);
    expect(audit).toMatchObject({ healthy: true, observedTotal: 1, canonicalCount: 1, canonicalIdValid: true });
    expect(audit.expectedPlanetIds).toEqual(["magnetar"]);
    expect(previewUnipolarVeinRepair(state, context)).toMatchObject({ eligible: false });
  });

  it("随机新档始终保留磁潮孤星规范节点且只按星球资源目录生成额外节点", () => {
    for (let seed = 1; seed <= 128; seed += 1) {
      const state = createInitialState(seed, false);
      const audit = auditUnipolarVeins(state);
      expect(audit.healthy, `seed=${seed}: ${audit.issues.join("；")}`).toBe(true);
      expect(audit.canonicalCount).toBe(1);
      expect(audit.observedTotal).toBe(audit.expectedPlanetIds.length);
    }
  });

  it("有限/无限资源与三档难度只改变储量规则，不改变单极磁石节点目录", () => {
    const baseline = createInitialState(20_260_810, false);
    const expected = auditUnipolarVeins(baseline);
    for (const resourceMode of ["finite", "infinite"] as const) {
      for (const difficulty of ["relaxed", "standard", "hard"] as const) {
        const state = structuredClone(baseline);
        state.settings.resourceMode = resourceMode;
        state.settings.difficulty = difficulty;
        const audit = auditUnipolarVeins(state);
        expect(audit, `${resourceMode}/${difficulty}`).toEqual(expected);
      }
    }
  });

  it("缺失规范节点时只在确认令牌匹配后生成一个候选并保持其他玩法字段不变", () => {
    const source = createPlayerInitialState();
    source.entities.find((entity) => entity.id === "vein_iron")!.resourceRemaining = 123_456;
    source.totalProduced.iron_ore = 987;
    source.research.completedTechIds.push("electromagnetism");
    source.entities = source.entities.filter((entity) => entity.id !== CANONICAL_UNIPOLAR_VEIN_ID);
    const preview = previewUnipolarVeinRepair(source, context);
    expect(preview).toMatchObject({ eligible: true, sourceAudit: { canonicalCount: 0 } });
    expect(() => createUnipolarVeinRepairPackage(source, context, "wrong-token")).toThrow(/令牌/);

    const repair = createUnipolarVeinRepairPackage(source, context, preview.confirmationToken);
    expect(auditUnipolarVeins(repair.candidateState)).toMatchObject({ healthy: true, canonicalCount: 1 });
    expect(repair.candidateState.entities.find((entity) => entity.id === "vein_iron")?.resourceRemaining).toBe(123_456);
    expect(repair.candidateState.totalProduced.iron_ore).toBe(987);
    expect(repair.candidateState.research.completedTechIds).toContain("electromagnetism");
    expect(repair.candidateState.entities.length).toBe(source.entities.length + 1);
    expect(computeSaveStateChecksum(2, repair.backupState)).toBe(preview.sourceChecksum);
    expect(computeSaveStateChecksum(2, repair.candidateState)).toBe(repair.audit.candidateChecksum);
  });

  it("重复执行不会增加第二个节点且哈希校验保护回滚", () => {
    const source = createInitialState();
    source.entities = source.entities.filter((entity) => entity.id !== CANONICAL_UNIPOLAR_VEIN_ID);
    const preview = previewUnipolarVeinRepair(source, context);
    const repair = createUnipolarVeinRepairPackage(source, context, preview.confirmationToken);
    expect(previewUnipolarVeinRepair(repair.candidateState, context).eligible).toBe(false);
    expect(rollbackUnipolarVeinRepair(repair.candidateState, repair)).toEqual(source);
    const changed = structuredClone(repair.candidateState);
    changed.elapsedSeconds += 1;
    expect(() => rollbackUnipolarVeinRepair(changed, repair)).toThrow(/候选哈希/);
  });

  it("速通存档没有独立审核时不能生成修复候选", () => {
    const source = createSpeedrunInitialState();
    source.entities = source.entities.filter((entity) => entity.id !== CANONICAL_UNIPOLAR_VEIN_ID);
    expect(previewUnipolarVeinRepair(source, context)).toMatchObject({ eligible: false, requiresLeaderboardReview: true });
    const approved = { ...context, leaderboardReview: "approved" as const };
    expect(previewUnipolarVeinRepair(source, approved).eligible).toBe(true);
  });

  it("既有迁移按稳定 ID 恢复缺失规范节点且重复导入不会生成重复矿脉", () => {
    const source = createInitialState();
    source.entities = source.entities.filter((entity) => entity.id !== CANONICAL_UNIPOLAR_VEIN_ID);
    const migrated = migrateGame(JSON.parse(JSON.stringify(source)))!;
    expect(auditUnipolarVeins(migrated).canonicalCount).toBe(1);
    const inspection = inspectSave(serializeEnvelope(migrated, context.createdAt));
    expect(inspection.valid).toBe(true);
    const restoredAudit = auditUnipolarVeins(inspection.state!);
    expect(restoredAudit.issues, JSON.stringify(restoredAudit)).toEqual([]);
    expect(restoredAudit).toMatchObject({ healthy: true, canonicalCount: 1 });
    expect(migrateGame(JSON.parse(JSON.stringify(inspection.state!)))!.entities.filter((entity) => entity.id === CANONICAL_UNIPOLAR_VEIN_ID)).toHaveLength(1);
  });

  it("v20+ 迁移不会从重新生成但未被持久目录声明的资源表补入幽灵矿脉", () => {
    const persisted = createInitialState(DEFAULT_GALAXY_SEED, true);
    const regenerated = createInitialState(DEFAULT_GALAXY_SEED, false);
    const generatedOnly = regenerated.entities.find((entity) => entity.kind === "vein" && entity.resourceId !== undefined &&
      !persisted.galaxy.profiles[entity.planetId].resourceIds.includes(entity.resourceId));
    expect(generatedOnly, "默认种子的兼容目录应与重新生成目录存在至少一个差异").toBeDefined();

    const migrated = migrateGame(JSON.parse(JSON.stringify(persisted)))!;
    expect(migrated.entities.some((entity) => entity.id === generatedOnly!.id)).toBe(false);
    expect(auditUnipolarVeins(migrated).healthy).toBe(true);
  });
});
