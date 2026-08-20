import { describe, expect, it } from "vitest";
import { advanceSimulationBudget, createPlayerInitialState, createSpeedrunInitialState } from "./engine";
import { migrateGame, serializeEnvelope } from "./storage";
import {
  SPEEDRUN_RULESET_VERSION,
  SPEEDRUN_SEASON_ID,
  advanceSpeedrunClock,
  getFiniteTechnologyIds,
  getSpeedrunTargetProgress,
  markSpeedrunIneligible,
  normalizeSpeedrunState,
} from "./speedrun";

describe("speedrun state", () => {
  it("does not add speedrun metadata to ordinary factories", () => {
    expect(createPlayerInitialState().speedrun).toBeUndefined();
  });

  it("initializes an isolated run with a baseline and pinned ruleset", () => {
    const state = createSpeedrunInitialState(1_700_000_000_000, "speedrun_test_factory_001");
    expect(state.speedrun?.enabled).toBe(true);
    expect(state.speedrun?.mode).toBe("speedrun");
    expect(state.speedrun?.rulesetVersion).toBe(SPEEDRUN_RULESET_VERSION);
    expect(state.speedrun?.seasonId).toBe(SPEEDRUN_SEASON_ID);
    expect(state.speedrun?.baseline.completedTechIds).toEqual([]);
    expect(state.speedrun?.factoryId).toBe("speedrun_test_factory_001");
    expect(getFiniteTechnologyIds().length).toBeGreaterThan(0);
  });

  it("counts targets from authoritative production and launch counters", () => {
    const state = createSpeedrunInitialState(1_700_000_000_000, "speedrun_test_factory_002");
    state.dysonSphere.totalRocketsLaunched = 9_999;
    state.totalProduced.universe_matrix = 999_999;
    expect(getSpeedrunTargetProgress(state, "dyson_rockets_10000").completed).toBe(false);
    expect(getSpeedrunTargetProgress(state, "white_matrix_1m").completed).toBe(false);
    state.dysonSphere.totalRocketsLaunched = 10_000;
    state.totalProduced.universe_matrix = 1_000_000;
    const next = advanceSpeedrunClock(state, 1);
    expect(next.speedrun?.milestones.dyson_rockets_10000.completed).toBe(true);
    expect(next.speedrun?.milestones.white_matrix_1m.completed).toBe(true);
    const completedAt = next.speedrun?.milestones.white_matrix_1m.completedAtSeconds;
    expect(advanceSpeedrunClock(next, 100).speedrun?.milestones.white_matrix_1m.completedAtSeconds).toBe(completedAt);
  });

  it("counts every finite technology while excluding repeatable research", () => {
    const state = createSpeedrunInitialState(1_700_000_000_000, "speedrun_test_factory_002b");
    state.research.completedTechIds = [...getFiniteTechnologyIds()];
    state.endgame.infiniteResearch.matrix_compression.level = 999;
    const next = advanceSpeedrunClock(state, 1);
    expect(next.speedrun?.milestones.all_technologies.completed).toBe(true);
    expect(getSpeedrunTargetProgress(next, "all_technologies").current).toBe(getFiniteTechnologyIds().length);
  });

  it("uses wall seconds for the timer and does not count paused time warp simulation", () => {
    const state = createSpeedrunInitialState(1_700_000_000_000, "speedrun_test_factory_003");
    const warped = advanceSimulationBudget(state, 100, 10);
    expect(warped.speedrun?.elapsedActiveSeconds).toBe(10);
    const paused = { ...warped, paused: true };
    expect(advanceSimulationBudget(paused, 100, 100).speedrun?.elapsedActiveSeconds).toBe(10);
  });

  it("rejects ordinary-save conversion and malformed run identities", () => {
    const ordinary = createPlayerInitialState();
    const converted = migrateGame({ ...ordinary, speedrun: { enabled: true, mode: "speedrun", rulesetVersion: SPEEDRUN_RULESET_VERSION, seasonId: SPEEDRUN_SEASON_ID, startedAt: 1, elapsedActiveSeconds: 0, baseline: { completedTechIds: [], rocketsLaunched: 0, whiteMatrixProduced: 0 }, milestones: {}, eligible: true } });
    expect(converted?.speedrun?.eligible).toBe(false);
    expect(converted?.speedrun?.invalidReason).toContain("工厂身份");
    expect(normalizeSpeedrunState({ enabled: true, mode: "speedrun" })?.eligible).toBe(false);
  });

  it("preserves speedrun state through v46 envelope round trips", () => {
    const state = createSpeedrunInitialState(1_700_000_000_000, "speedrun_test_factory_004");
    const raw = serializeEnvelope(state, 1_700_000_000_100);
    const parsed = JSON.parse(raw) as { state: Record<string, unknown> };
    const loaded = migrateGame(parsed.state);
    expect(loaded?.version).toBe(47);
    expect(loaded?.speedrun?.factoryId).toBe("speedrun_test_factory_004");
    expect(loaded?.speedrun?.eligible).toBe(true);
  });

  it("repairs a missing million-white-matrix milestone from the authoritative cumulative counter", () => {
    const state = createSpeedrunInitialState(1_700_000_000_000, "speedrun_test_factory_recovery");
    state.speedrun!.elapsedActiveSeconds = 12_345;
    state.totalProduced.universe_matrix = 1_000_000;
    state.speedrun!.milestones.white_matrix_1m = { completed: false };

    const raw = serializeEnvelope(state, 1_700_000_012_345);
    const parsed = JSON.parse(raw) as { state: Record<string, unknown> };
    const repaired = migrateGame(parsed.state);
    expect(repaired?.speedrun?.milestones.white_matrix_1m).toEqual({
      completed: true,
      completedAtSeconds: 12_345,
    });
    expect(repaired?.totalProduced.universe_matrix).toBe(1_000_000);

    const secondPass = migrateGame(repaired);
    expect(secondPass?.speedrun?.milestones.white_matrix_1m).toEqual(
      repaired?.speedrun?.milestones.white_matrix_1m,
    );
    expect(migrateGame(createPlayerInitialState())?.speedrun).toBeUndefined();
  });

  it("marks imported rollback data ineligible without discarding it", () => {
    const state = createSpeedrunInitialState(1_700_000_000_000, "speedrun_test_factory_005");
    const invalid = markSpeedrunIneligible(state, "检测到导入回滚");
    expect(invalid.speedrun?.eligible).toBe(false);
    expect(invalid.speedrun?.factoryId).toBe(state.speedrun?.factoryId);
    expect(invalid.speedrun?.invalidReason).toBe("检测到导入回滚");
  });
});
