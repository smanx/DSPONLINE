/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from "vitest";
import { createInitialState, createSpeedrunInitialState } from "./engine";
import { setLocalSaveValue } from "./localSaveStore";
import { getMenuContinueSave } from "./savePreview";
import {
  clearGameSlot,
  copySpeedrunPrimaryToNormalSlot,
  copySpeedrunSlotToNormalSlot,
  exportGame,
  exportGameSlot,
  getLocalSaveSummaryMetrics,
  getSaveSlotSummaries,
  getSaveSnapshotSummaries,
  importGame,
  inspectSave,
  loadGame,
  loadGameSlot,
  migrateGame,
  saveGame,
  saveGameVerified,
  saveGameSlot,
  saveGameSnapshot,
  saveVerifiedPayload,
} from "./storage";

describe("普通/速通存档隔离", () => {
  beforeEach(() => window.localStorage.clear());

  it("同一自动保存入口与同一槽位可以同时存在且互不覆盖", () => {
    const normal = createInitialState();
    normal.elapsedSeconds = 11;
    const speedrun = createSpeedrunInitialState(1_700_000_000_000, "mode_test_factory_001");
    speedrun.elapsedSeconds = 22;
    expect(saveGame(normal).success).toBe(true);
    expect(saveGame(speedrun).success).toBe(true);
    saveGameSlot(1, normal);
    saveGameSlot(1, speedrun);
    saveGameSnapshot(normal, "普通快照");
    saveGameSnapshot(speedrun, "速通快照");

    expect(loadGame("normal").state.elapsedSeconds).toBe(11);
    expect(loadGame("speedrun").state.elapsedSeconds).toBe(22);
    expect(getSaveSlotSummaries("normal").map((slot) => slot.mode)).toEqual(["normal"]);
    expect(getSaveSlotSummaries("speedrun").map((slot) => slot.mode)).toEqual(["speedrun"]);
    expect(getSaveSnapshotSummaries("normal").every((snapshot) => snapshot.mode === "normal")).toBe(true);
    expect(getSaveSnapshotSummaries("speedrun").every((snapshot) => snapshot.mode === "speedrun")).toBe(true);
    expect(getLocalSaveSummaryMetrics()).toMatchObject({ slotCount: 2, snapshotCount: 4 });

    clearGameSlot(1, "normal");
    expect(loadGameSlot(1, "normal")).toBeNull();
    expect(loadGameSlot(1, "speedrun")?.state.mode).toBe("speedrun");
  });

  it("导出携带模式，导入校验拒绝静默跨模式写入", () => {
    const normalRaw = exportGame(createInitialState());
    const speedrunRaw = exportGame(createSpeedrunInitialState(1_700_000_000_000, "mode_test_factory_002"));
    expect(JSON.parse(normalRaw).mode).toBe("normal");
    saveGameSlot(1, createInitialState());
    expect(JSON.parse(exportGameSlot(1, "normal")!).slot).toBe(1);
    expect(JSON.parse(speedrunRaw).mode).toBe("speedrun");
    expect(importGame(normalRaw, "normal")?.mode).toBe("normal");
    expect(importGame(normalRaw, "speedrun")).toBeNull();
    expect(importGame(speedrunRaw, "speedrun")?.mode).toBe("speedrun");
    expect(importGame(speedrunRaw, "normal")).toBeNull();
  });

  it("拒绝 envelope 与 state 模式不一致或只在外层伪造速通标记", () => {
    const speedrunEnvelope = JSON.parse(exportGame(createSpeedrunInitialState(1_700_000_000_000, "mode_test_factory_tamper")));
    speedrunEnvelope.state.mode = "normal";
    expect(inspectSave(JSON.stringify(speedrunEnvelope))).toMatchObject({ valid: false, mode: "normal" });
    expect(inspectSave(JSON.stringify(speedrunEnvelope)).issues[0]).toContain("不一致");

    const normalEnvelope = JSON.parse(exportGame(createInitialState()));
    normalEnvelope.mode = "speedrun";
    expect(inspectSave(JSON.stringify(normalEnvelope))).toMatchObject({ valid: false, mode: "normal" });
    expect(inspectSave(JSON.stringify(normalEnvelope)).issues[0]).toContain("不一致");

    normalEnvelope.mode = "ranked";
    expect(inspectSave(JSON.stringify(normalEnvelope)).issues[0]).toContain("模式标记无效");
  });

  it("改名或写入错误命名空间不能把普通存档伪装为速通存档", () => {
    const normalRaw = exportGame(createInitialState());
    setLocalSaveValue("dsp-idle-network.save.v1.speedrun", normalRaw);
    setLocalSaveValue("dsp-idle-network.slot.speedrun.1", normalRaw);

    expect(getMenuContinueSave("speedrun")).toBeNull();
    expect(loadGame("speedrun").recovery?.source).toBe("fresh");
    expect(loadGameSlot(1, "speedrun")).toBeNull();
    expect(getSaveSlotSummaries("speedrun")).toEqual([
      expect.objectContaining({ slotId: 1, mode: "speedrun", valid: false }),
    ]);
  });

  it("缺少模式字段的旧存档安全迁移为普通模式且不激活速通资格", () => {
    const legacy = JSON.parse(JSON.stringify(createInitialState())) as Record<string, any>;
    delete legacy.mode;
    legacy.speedrun = { enabled: true, mode: "speedrun", eligible: true };
    const migrated = migrateGame(legacy);
    expect(migrated?.mode).toBe("normal");
    expect(migrated?.speedrun?.eligible).toBe(false);
    expect(migrateGame(JSON.parse(JSON.stringify(migrated)))?.mode).toBe("normal");
  });

  it("首次持久化旧存档前保留一次原始模式迁移备份且重复保存不覆盖", () => {
    const legacy = JSON.parse(JSON.stringify(createInitialState())) as Record<string, any>;
    delete legacy.mode;
    delete legacy.idleSettlement;
    legacy.version = 45;
    const originalRaw = JSON.stringify(legacy);
    window.localStorage.setItem("dsp-idle-network.save.v1", originalRaw);
    const loaded = loadGame("normal");
    expect(loaded.state.mode).toBe("normal");
    expect(saveGame(loaded.state).success).toBe(true);
    const migrationBackupKey = "dsp-idle-network.save.v1.migration-backup.v46";
    expect(window.localStorage.getItem(migrationBackupKey)).toBe(originalRaw);

    const next = structuredClone(loaded.state);
    next.elapsedSeconds += 10;
    expect(saveGame(next).success).toBe(true);
    expect(window.localStorage.getItem(migrationBackupKey)).toBe(originalRaw);
  });

  it("速通槽位可以复制为普通副本，但普通副本不能反向升级", async () => {
    const speedrun = createSpeedrunInitialState(1_700_000_000_000, "mode_test_factory_003");
    saveGameSlot(2, speedrun);
    const copied = await copySpeedrunSlotToNormalSlot(2, 3);
    expect(copied.success).toBe(true);
    const normalCopy = loadGameSlot(3, "normal")?.state;
    expect(normalCopy?.mode).toBe("normal");
    expect(normalCopy?.speedrun).toBeUndefined();
    expect(loadGameSlot(2, "speedrun")?.state.speedrun?.factoryId).toBe("mode_test_factory_003");
    expect(getSaveSlotSummaries("speedrun").map((slot) => slot.slotId)).toEqual([2]);
    expect(getSaveSlotSummaries("normal").map((slot) => slot.slotId)).toEqual([3]);
  });

  it("速通主档和上一版本备份都使用独立键且损坏时可以回退", () => {
    const first = createSpeedrunInitialState(1_700_000_000_000, "mode_test_factory_backup");
    first.paused = true;
    first.elapsedSeconds = 101;
    expect(saveGame(first).success).toBe(true);
    const second = structuredClone(first);
    second.elapsedSeconds = 202;
    expect(saveGame(second).success).toBe(true);
    const backupRaw = window.localStorage.getItem("dsp-idle-network.save.v1.backup.speedrun");
    expect(backupRaw).not.toBeNull();
    expect(inspectSave(backupRaw!)).toMatchObject({ valid: true, mode: "speedrun" });

    window.localStorage.setItem("dsp-idle-network.save.v1.speedrun", "{corrupt");
    const recovered = loadGame("speedrun");
    expect(recovered.recovery?.source).toBe("backup");
    expect(recovered.state).toMatchObject({ mode: "speedrun", elapsedSeconds: 101 });
  });

  it("速通生命周期紧急镜像较新时优先于旧主档恢复", () => {
    const primary = createSpeedrunInitialState(1_700_000_000_000, "mode_test_factory_emergency");
    primary.paused = true;
    primary.elapsedSeconds = 10;
    const emergency = structuredClone(primary);
    emergency.elapsedSeconds = 20;
    const rawAt = (state: typeof primary, savedAt: number) => {
      const envelope = JSON.parse(exportGame(state));
      envelope.savedAt = savedAt;
      return JSON.stringify(envelope);
    };
    setLocalSaveValue("dsp-idle-network.save.v1.speedrun", rawAt(primary, 100));
    setLocalSaveValue("dsp-idle-network.save.v1.speedrun.emergency", rawAt(emergency, 200));

    expect(loadGame("speedrun").state).toMatchObject({ mode: "speedrun", elapsedSeconds: 20 });
  });

  it("速通主档只能复制到空普通槽位且不会覆盖已有普通存档", async () => {
    const speedrun = createSpeedrunInitialState(1_700_000_000_000, "mode_test_factory_primary_copy");
    speedrun.elapsedSeconds = 333;
    expect(saveGame(speedrun).success).toBe(true);
    expect((await copySpeedrunPrimaryToNormalSlot(1)).success).toBe(true);
    expect(loadGameSlot(1, "normal")?.state).toMatchObject({ mode: "normal", elapsedSeconds: 333 });
    expect(loadGame("speedrun").state.speedrun?.factoryId).toBe("mode_test_factory_primary_copy");

    const rejected = await copySpeedrunPrimaryToNormalSlot(1);
    expect(rejected).toMatchObject({ success: false, code: "unavailable" });
    expect(rejected.message).toContain("未执行覆盖");
  });

  it("普通与速通自动保存并发合并时不会互相顶掉", async () => {
    const normalFirst = createInitialState();
    normalFirst.elapsedSeconds = 1;
    const speedrun = createSpeedrunInitialState(1_700_000_000_000, "mode_test_factory_concurrent");
    speedrun.elapsedSeconds = 2;
    const normalLatest = structuredClone(normalFirst);
    normalLatest.elapsedSeconds = 3;

    const results = await Promise.all([
      saveGameVerified(normalFirst),
      saveGameVerified(speedrun),
      saveGameVerified(normalLatest),
    ]);

    expect(results.every((result) => result.success)).toBe(true);
    expect(loadGame("normal").state.elapsedSeconds).toBe(3);
    expect(loadGame("speedrun").state).toMatchObject({ mode: "speedrun", elapsedSeconds: 2 });
  });

  it("已校验载荷仍不能通过目标参数跨模式写入主档", async () => {
    const speedrunRaw = exportGame(createSpeedrunInitialState(1_700_000_000_000, "mode_test_factory_verified_payload"));
    const rejected = await saveVerifiedPayload(speedrunRaw, { verified: true, mode: "normal" });

    expect(rejected).toMatchObject({ success: false, code: "verification" });
    expect(rejected.message).toContain("模式不匹配");
    expect(loadGame("normal").recovery?.source).toBe("fresh");
    expect(loadGame("speedrun").recovery?.source).toBe("fresh");
  });
});
