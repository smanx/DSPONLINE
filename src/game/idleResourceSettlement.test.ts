import { describe, expect, it } from "vitest";
import {
  advanceSimulation,
  createInitialState,
  getEntityInputCapacity,
  getEntityOperatingStatus,
  getEntityOutputCapacity,
} from "./engine";
import { advancePureIdleMacroSession, createPureIdleMacroSession } from "./pureIdleMacro";
import type { FactoryEntity, GameState } from "./types";

function windEntity(machineCount: number): FactoryEntity {
  return {
    id: `settlement-wind-${machineCount}`,
    kind: "power",
    planetId: "home",
    position: { x: -100, y: 0 },
    interactionLocked: false,
    buildingId: "wind_turbine",
    machineCount,
    minerCount: 0,
    inputs: {},
    outputs: {},
    progress: 0,
    routingCursor: 0,
    utilization: 0,
    productionRate: 0,
  };
}

function minerFixture(powerStacks = 20): { state: GameState; veinId: string } {
  const state = createInitialState(12_345, false);
  state.entities = state.entities.filter((entity) => entity.kind === "vein");
  state.belts = [];
  state.constructionAutomation.enabled = false;
  state.settings.productionBufferLimit = 10_000;
  state.settings.logisticsBufferLimit = 10_000;
  state.paused = false;
  const vein = state.entities.find((entity) => entity.id === "vein_iron")!;
  vein.minerCount = 1;
  vein.outputs = { iron_ore: 0 };
  vein.progress = 0;
  vein.resourceCapacity = 1_000_000;
  vein.resourceRemaining = 1_000_000;
  vein.resourceDepletionRemainder = 0;
  state.totalProduced.iron_ore = 0;
  if (powerStacks > 0) state.entities.push(windEntity(powerStacks));
  return { state, veinId: vein.id };
}

function addTimeWarp(state: GameState, multiplier: 1 | 4 | 8 | 12, windStacks: number): GameState {
  const next = structuredClone(state);
  next.entities = next.entities.filter((entity) => entity.kind !== "power");
  next.entities.push(windEntity(windStacks), {
    id: "settlement-time-warp",
    kind: "machine",
    planetId: "home",
    position: { x: 100, y: 0 },
    interactionLocked: false,
    buildingId: "time_warp_device",
    machineCount: 1,
    minerCount: 0,
    inputs: {},
    outputs: {},
    progress: 0,
    routingCursor: 0,
    utilization: 0,
    productionRate: 0,
  });
  next.settings.simulationSpeed = multiplier === 4 ? 4 : 1;
  next.timeWarp.controllerEntityId = "settlement-time-warp";
  next.timeWarp.enabled = true;
  next.timeWarp.requestedMultiplier = multiplier;
  next.timeWarp.effectiveMultiplier = multiplier;
  next.timeWarp.pendingSimulationSeconds = 0;
  next.timeWarp.pendingWallSeconds = 0;
  return next;
}

function ironSnapshot(state: GameState, veinId: string) {
  const vein = state.entities.find((entity) => entity.id === veinId)!;
  return {
    output: vein.outputs.iron_ore ?? 0,
    produced: state.totalProduced.iron_ore ?? 0,
    remaining: vein.resourceRemaining ?? 0,
    remainder: vein.resourceDepletionRemainder ?? 0,
  };
}

describe("纯挂机资源采集守恒", () => {
  it("矿机输出缓存已满时停止生产并显示阻塞原因，不扣有限矿脉", () => {
    const fixture = minerFixture();
    const vein = fixture.state.entities.find((entity) => entity.id === fixture.veinId)!;
    const capacity = getEntityOutputCapacity(fixture.state, vein);
    vein.outputs.iron_ore = capacity;
    const before = ironSnapshot(fixture.state, fixture.veinId);

    const advanced = advanceSimulation(fixture.state, 300);

    expect(ironSnapshot(advanced, fixture.veinId)).toEqual(before);
    expect(getEntityOperatingStatus(advanced, advanced.entities.find((entity) => entity.id === fixture.veinId)!))
      .toMatchObject({ code: "output-blocked", label: "输出缓存已满" });

    const source = addTimeWarp(fixture.state, 12, 100_000_000_000);
    const session = createPureIdleMacroSession(source, "extreme");
    advancePureIdleMacroSession(session, 300);
    expect(ironSnapshot(session.candidate, fixture.veinId)).toEqual(before);
  });

  it("输出缓存接近满时只生产可容纳数量，矿脉扣除与成功产出一致", () => {
    const fixture = minerFixture();
    const vein = fixture.state.entities.find((entity) => entity.id === fixture.veinId)!;
    const capacity = getEntityOutputCapacity(fixture.state, vein);
    vein.outputs.iron_ore = capacity - 2;
    const before = ironSnapshot(fixture.state, fixture.veinId);

    const advanced = advanceSimulation(fixture.state, 300);
    const after = ironSnapshot(advanced, fixture.veinId);

    expect(after.output - before.output).toBe(2);
    expect(after.produced - before.produced).toBe(2);
    expect(before.remaining - after.remaining).toBe(2);
    expect(after.remaining).toBeGreaterThanOrEqual(0);

    const source = addTimeWarp(fixture.state, 12, 100_000_000_000);
    const session = createPureIdleMacroSession(source, "extreme");
    advancePureIdleMacroSession(session, 300);
    const macroAfter = ironSnapshot(session.candidate, fixture.veinId);
    expect(macroAfter.output - before.output).toBe(2);
    expect(macroAfter.produced - before.produced).toBe(2);
    expect(before.remaining - macroAfter.remaining).toBe(2);
  });

  it("传送带下游仓库已满时不会从满矿机缓存静默移除物资或继续扣矿", () => {
    const fixture = minerFixture();
    const vein = fixture.state.entities.find((entity) => entity.id === fixture.veinId)!;
    vein.outputs.iron_ore = getEntityOutputCapacity(fixture.state, vein);
    const storage: FactoryEntity = {
      id: "blocked-storage",
      kind: "storage",
      planetId: "home",
      position: { x: 100, y: 0 },
      interactionLocked: false,
      buildingId: "storage_mk1",
      storedItemId: "iron_ore",
      machineCount: 1,
      minerCount: 0,
      inputs: {},
      outputs: {},
      progress: 0,
      routingCursor: 0,
      utilization: 0,
      productionRate: 0,
    };
    fixture.state.entities.push(storage);
    storage.inputs.iron_ore = getEntityInputCapacity(fixture.state, storage);
    storage.outputs.iron_ore = getEntityOutputCapacity(fixture.state, storage);
    fixture.state.belts.push({
      id: "blocked-belt",
      planetId: "home",
      source: vein.id,
      target: storage.id,
      itemId: "iron_ore",
      lanes: 1,
      tier: 1,
      sorterTier: 1,
      progress: 0,
      priority: 1,
      lastFlow: 0,
      totalTransferred: 0,
    });
    const beforeMiner = ironSnapshot(fixture.state, fixture.veinId);
    const beforeStorageInput = storage.inputs.iron_ore;
    const beforeStorage = storage.outputs.iron_ore;

    const advanced = advanceSimulation(fixture.state, 300);

    expect(ironSnapshot(advanced, fixture.veinId)).toEqual(beforeMiner);
    expect(advanced.entities.find((entity) => entity.id === storage.id)?.outputs.iron_ore).toBe(beforeStorage);
    expect(advanced.entities.find((entity) => entity.id === storage.id)?.inputs.iron_ore).toBe(beforeStorageInput);
    expect(advanced.belts[0].totalTransferred).toBe(0);

    const source = addTimeWarp(fixture.state, 12, 100_000_000_000);
    const session = createPureIdleMacroSession(source, "extreme");
    advancePureIdleMacroSession(session, 300);
    expect(ironSnapshot(session.candidate, fixture.veinId)).toEqual(beforeMiner);
    expect(session.candidate.entities.find((entity) => entity.id === storage.id)?.outputs.iron_ore).toBe(beforeStorage);
    expect(session.candidate.entities.find((entity) => entity.id === storage.id)?.inputs.iron_ore).toBe(beforeStorageInput);
    expect(session.candidate.belts[0].totalTransferred).toBe(0);
  });

  it("有限矿脉经传送带在长挂机中枯竭时完整精确跨界并且科研只结算一次", () => {
    const fixture = minerFixture();
    const vein = fixture.state.entities.find((entity) => entity.id === fixture.veinId)!;
    vein.resourceCapacity = 100;
    vein.resourceRemaining = 100;
    const storage: FactoryEntity = {
      id: "finite-output-storage",
      kind: "storage",
      planetId: "home",
      position: { x: 100, y: 0 },
      interactionLocked: false,
      buildingId: "storage_mk1",
      storedItemId: "iron_ore",
      machineCount: 1,
      minerCount: 0,
      inputs: {},
      outputs: {},
      progress: 0,
      routingCursor: 0,
      utilization: 0,
      productionRate: 0,
    };
    fixture.state.entities.push(storage, {
      id: "finite-boundary-research",
      kind: "machine",
      planetId: "home",
      position: { x: 150, y: 0 },
      interactionLocked: false,
      buildingId: "matrix_lab",
      recipeId: "matrix_research",
      machineCount: 1,
      minerCount: 0,
      inputs: { electromagnetic_matrix: 100 },
      outputs: {},
      progress: 0,
      routingCursor: 0,
      utilization: 0,
      productionRate: 0,
    });
    fixture.state.research.selectedTechId = "electromagnetic_matrix";
    fixture.state.research.queuedTechIds = ["electromagnetism"];
    fixture.state.belts.push({
      id: "finite-output-belt",
      planetId: "home",
      source: vein.id,
      target: storage.id,
      itemId: "iron_ore",
      lanes: 1,
      tier: 1,
      sorterTier: 1,
      progress: 0,
      priority: 1,
      lastFlow: 0,
      totalTransferred: 0,
    });
    const source = addTimeWarp(fixture.state, 12, 100_000_000_000);
    const exact = advanceSimulation(structuredClone(source), 60 * 60 * 12);
    const session = createPureIdleMacroSession(structuredClone(source), "extreme");
    const startedAt = performance.now();

    const summary = advancePureIdleMacroSession(session, 60 * 60);
    const durationMs = performance.now() - startedAt;

    expect(summary).toMatchObject({ settledSimulationSeconds: 60 * 60 * 12, actualMultiplier: 12 });
    expect(summary.degradedReason).toBeUndefined();
    expect(summary.boundaryCorrections).toBeGreaterThan(0);
    expect(summary.contractVersion).toBeGreaterThan(1);
    expect(ironSnapshot(session.candidate, fixture.veinId)).toEqual(ironSnapshot(exact, fixture.veinId));
    expect(ironSnapshot(session.candidate, fixture.veinId)).toMatchObject({ produced: 100, remaining: 0 });
    expect(session.candidate.belts[0].totalTransferred).toBe(exact.belts[0].totalTransferred);
    expect(session.candidate.entities.find((entity) => entity.id === storage.id)?.outputs.iron_ore)
      .toBe(exact.entities.find((entity) => entity.id === storage.id)?.outputs.iron_ore);
    expect(session.candidate.research).toEqual(exact.research);
    expect(session.candidate.entities.find((entity) => entity.id === "finite-boundary-research")?.inputs)
      .toEqual(exact.entities.find((entity) => entity.id === "finite-boundary-research")?.inputs);
    expect(durationMs).toBeLessThan(2_000);
  });

  it("无供电时矿机既不产出也不扣矿脉", () => {
    const fixture = minerFixture(0);
    const before = ironSnapshot(fixture.state, fixture.veinId);
    const advanced = advanceSimulation(fixture.state, 300);
    expect(ironSnapshot(advanced, fixture.veinId)).toEqual(before);
    expect(getEntityOperatingStatus(advanced, advanced.entities.find((entity) => entity.id === fixture.veinId)!)).toMatchObject({ code: "no-power" });
  });

  it("有限矿脉不会负数或超采，无限资源模式产出时不减少储量", () => {
    const finiteFixture = minerFixture();
    const finiteVein = finiteFixture.state.entities.find((entity) => entity.id === finiteFixture.veinId)!;
    finiteVein.resourceCapacity = 3;
    finiteVein.resourceRemaining = 3;
    const finite = advanceSimulation(finiteFixture.state, 300);
    expect(ironSnapshot(finite, finiteFixture.veinId)).toMatchObject({ output: 3, produced: 3, remaining: 0 });

    const infiniteFixture = minerFixture();
    infiniteFixture.state.settings.resourceMode = "infinite";
    const infiniteVein = infiniteFixture.state.entities.find((entity) => entity.id === infiniteFixture.veinId)!;
    infiniteVein.resourceCapacity = 3;
    infiniteVein.resourceRemaining = 3;
    const infinite = advanceSimulation(infiniteFixture.state, 60);
    const snapshot = ironSnapshot(infinite, infiniteFixture.veinId);
    expect(snapshot.produced).toBeGreaterThan(0);
    expect(snapshot.remaining).toBe(3);
  });

  it.each([1, 4, 8, 12] as const)("%i 倍纯挂机与同模拟秒数普通路径的矿物、缓存和矿脉结果一致", (multiplier) => {
    const fixture = minerFixture();
    const source = addTimeWarp(fixture.state, multiplier, 100_000_000_000);
    const baseline = advanceSimulation(structuredClone(fixture.state), 30);
    const session = createPureIdleMacroSession(structuredClone(source), "stable");
    const summary = advancePureIdleMacroSession(session, 30);
    const exact = advanceSimulation(structuredClone(source), summary.settledSimulationSeconds);
    const macroSnapshot = ironSnapshot(session.candidate, fixture.veinId);
    const exactSnapshot = ironSnapshot(exact, fixture.veinId);
    const baselineProduced = ironSnapshot(baseline, fixture.veinId).produced;

    expect(summary.actualMultiplier).toBe(multiplier);
    expect(summary.settledSimulationSeconds).toBe(30 * multiplier);
    expect(macroSnapshot.output).toBe(macroSnapshot.produced);
    expect(1_000_000 - macroSnapshot.remaining).toBe(macroSnapshot.produced);
    expect(Math.abs(macroSnapshot.produced - exactSnapshot.produced) / Math.max(1, exactSnapshot.produced)).toBeLessThanOrEqual(0.2);
    expect(Math.abs(macroSnapshot.produced - baselineProduced * multiplier) / Math.max(1, baselineProduced * multiplier)).toBeLessThanOrEqual(0.2);
  });

  it("供电不足时使用实际生效倍率结算，不按请求倍率凭空增加产量", () => {
    const fixture = minerFixture();
    const source = addTimeWarp(fixture.state, 12, 4_000_000);
    const session = createPureIdleMacroSession(structuredClone(source), "stable");
    const summary = advancePureIdleMacroSession(session, 30);
    const exact = advanceSimulation(structuredClone(source), summary.settledSimulationSeconds);

    expect(summary.actualMultiplier).toBeGreaterThanOrEqual(4);
    expect(summary.actualMultiplier).toBeLessThan(12);
    const macroSnapshot = ironSnapshot(session.candidate, fixture.veinId);
    const exactSnapshot = ironSnapshot(exact, fixture.veinId);
    expect(macroSnapshot.output).toBe(macroSnapshot.produced);
    expect(1_000_000 - macroSnapshot.remaining).toBe(macroSnapshot.produced);
    expect(Math.abs(macroSnapshot.produced - exactSnapshot.produced) / Math.max(1, exactSnapshot.produced)).toBeLessThanOrEqual(0.2);
  });

  it("30 天挂机跨越无出带矿机满仓与枯竭边界时保持常数时间守恒结算", () => {
    const fixture = minerFixture();
    const vein = fixture.state.entities.find((entity) => entity.id === fixture.veinId)!;
    vein.resourceCapacity = 3;
    vein.resourceRemaining = 3;
    const source = addTimeWarp(fixture.state, 12, 100_000_000_000);
    const session = createPureIdleMacroSession(structuredClone(source), "extreme");
    const startedAt = performance.now();

    const summary = advancePureIdleMacroSession(session, 30 * 24 * 60 * 60);
    const durationMs = performance.now() - startedAt;

    expect(summary.settledSimulationSeconds).toBe(30 * 24 * 60 * 60 * 12);
    expect(ironSnapshot(session.candidate, fixture.veinId)).toMatchObject({ output: 3, produced: 3, remaining: 0 });
    expect(summary.degradedReason).toBeUndefined();
    expect(durationMs).toBeLessThan(1_000);
  });

  it("校准前缀内分段停止再继续与一次结算结果一致", () => {
    const fixture = minerFixture();
    const vein = fixture.state.entities.find((entity) => entity.id === fixture.veinId)!;
    vein.resourceCapacity = 3;
    vein.resourceRemaining = 3;
    const source = addTimeWarp(fixture.state, 12, 100_000_000_000);
    const incremental = createPureIdleMacroSession(structuredClone(source), "extreme");
    const single = createPureIdleMacroSession(structuredClone(source), "extreme");

    advancePureIdleMacroSession(incremental, 1);
    const resumed = advancePureIdleMacroSession(incremental, 3);
    const duplicate = advancePureIdleMacroSession(incremental, 3);
    const direct = advancePureIdleMacroSession(single, 3);

    expect(ironSnapshot(incremental.candidate, fixture.veinId)).toEqual(ironSnapshot(single.candidate, fixture.veinId));
    expect(resumed.settledSimulationSeconds).toBe(36);
    expect(duplicate.settledSimulationSeconds).toBe(36);
    expect(direct.settledSimulationSeconds).toBe(36);
  });
});
