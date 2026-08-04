import { describe, expect, it } from "vitest";
import { advanceSimulation, createInitialState, createPlayerInitialState } from "./engine";
import { hashGameState } from "./benchmark";
import {
  getOfflineApproximationBlocker,
  runOfflineApproximation,
  runOfflineApproximationAsync,
} from "./offlineApproximation";

function stableEmptyState() {
  const state = createInitialState(undefined, false);
  state.entities = [];
  state.constructionAutomation.enabled = false;
  state.paused = false;
  return state;
}

describe("offline macro contract experiment", () => {
  it("uses two exact calibration windows and keeps the result deterministic", () => {
    const source = stableEmptyState();
    const before = hashGameState(source);
    const first = runOfflineApproximation(source, 24 * 60 * 60);
    const second = runOfflineApproximation(source, 24 * 60 * 60);

    expect(first.status).toBe("approximate");
    expect(second.status).toBe("approximate");
    if (first.status !== "approximate" || second.status !== "approximate") return;
    expect(first.report.calibrationWindowSeconds).toBeGreaterThanOrEqual(5);
    expect(first.report.approximatedSeconds).toBeGreaterThan(24 * 60 * 60 - 30);
    expect(first.report.maxEstimatedError).toBeLessThanOrEqual(0.2);
    expect(first.state.elapsedSeconds).toBe(24 * 60 * 60);
    expect(hashGameState(first.state)).toBe(hashGameState(second.state));
    expect(hashGameState(source)).toBe(before);
  });

  it("keeps dynamic logistics on the exact path", () => {
    const state = stableEmptyState();
    state.entities.push({
      id: "station",
      kind: "station",
      planetId: "home",
      position: { x: 0, y: 0 },
      interactionLocked: false,
      buildingId: "planetary_logistics_station",
      machineCount: 1,
      minerCount: 0,
      inputs: {},
      outputs: {},
      progress: 0,
      routingCursor: 0,
      utilization: 0,
      productionRate: 0,
      stationRoutes: [],
    });
    const result = runOfflineApproximation(state, 3_600);
    expect(getOfflineApproximationBlocker(state, 3_600)).toContain("物流站");
    expect(result.status).toBe("ineligible");
    if (result.status === "ineligible") expect(result.report.fellBack).toBe(true);
  });

  it("falls back when calibration is not stable instead of committing a partial state", () => {
    const state = stableEmptyState();
    state.entities.push({
      id: "research",
      kind: "machine",
      planetId: "home",
      position: { x: 0, y: 0 },
      interactionLocked: false,
      buildingId: "matrix_lab",
      machineCount: 1,
      minerCount: 0,
      inputs: { electromagnetic_matrix: 10 },
      outputs: {},
      progress: 0,
      routingCursor: 0,
      utilization: 0,
      productionRate: 0,
      recipeId: "matrix_research",
    });
    const result = runOfflineApproximation(state, 3_600);
    expect(result.status).not.toBe("approximate");
    expect(hashGameState(state)).toBe(hashGameState(state));
  });

  it("matches exact elapsed time for a short exact fallback", () => {
    const state = stableEmptyState();
    const exact = advanceSimulation(state, 30);
    const result = runOfflineApproximation(state, 30);
    expect(result.status).not.toBe("approximate");
    expect(exact.elapsedSeconds).toBe(30);
    expect(state.elapsedSeconds).toBe(0);
  });

  it("can be requested by a time-warp-sized budget without changing persisted flags", () => {
    const state = stableEmptyState();
    state.timeWarp.enabled = true;
    state.timeWarp.requestedMultiplier = 64;
    state.entities.push({
      id: "warp",
      kind: "machine",
      planetId: "home",
      position: { x: 0, y: 0 },
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
    state.timeWarp.controllerEntityId = "warp";
    const result = runOfflineApproximation(state, 3_600);
    expect(result.status).toBe("approximate");
    expect(state.timeWarp.enabled).toBe(true);
    if (result.status === "approximate") expect(result.state.timeWarp.enabled).toBe(true);
  });

  it("can qualify a steady quantum flow with the generic affine contract", () => {
    const state = stableEmptyState();
    state.paused = false;
    state.quantumLogisticsNetwork.enabled = true;
    state.quantumLogisticsNetwork.itemCapacities.iron_ore = "1000000";
    state.entities.push({
      id: "affine-quantum", kind: "station", planetId: "home", position: { x: 0, y: 0 }, interactionLocked: false,
      buildingId: "interstellar_logistics_station", stationTier: 2, quantumMode: "quantum", machineCount: 1, minerCount: 0,
      stationSlots: [{ itemId: "iron_ore", localMode: "storage", remoteMode: "supply", minimumLoad: 0.1, minStock: 0, maxStock: 0, priority: 1, routePolicy: "direct", warperBudget: 2 }],
      stationRoutes: [], stationDrones: 0, stationVessels: 0, inputs: {}, outputs: {}, progress: 0, utilization: 0, productionRate: 0, routingCursor: 0,
    });
    state.entities.push({
      id: "affine-source", kind: "storage", planetId: "home", position: { x: -100, y: 0 }, interactionLocked: false,
      buildingId: "storage_mk1", storedItemId: "iron_ore", machineCount: 1_000, minerCount: 0, inputs: {}, outputs: { iron_ore: 100_000 }, progress: 0, utilization: 0, productionRate: 0, routingCursor: 0,
    });
    state.belts.push({ id: "affine-belt", planetId: "home", source: "affine-source", target: "affine-quantum", itemId: "iron_ore", lanes: 1, tier: 1, sorterTier: 1, progress: 0, priority: 1, lastFlow: 0, congestion: 0, totalTransferred: 0 });
    const warmedState = advanceSimulation(state, 10);
    warmedState.elapsedSeconds = 0;
    const result = runOfflineApproximation(warmedState, 3_600);
    expect(result.status).toBe("approximate");
    if (result.status === "approximate") {
      expect(result.report.approximatedSeconds).toBeGreaterThan(3_500);
      expect(result.state.quantumLogisticsNetwork.inventory.iron_ore).toBeDefined();
    }
    expect(state.elapsedSeconds).toBe(0);
    expect(warmedState.elapsedSeconds).toBe(0);
  });

  it("keeps the async Worker contract deterministic and cancellable", async () => {
    const source = stableEmptyState();
    const synchronous = runOfflineApproximation(source, 24 * 60 * 60);
    const asynchronous = await runOfflineApproximationAsync(source, 24 * 60 * 60);
    expect(asynchronous.status).toBe(synchronous.status);
    if (synchronous.status === "approximate" && asynchronous.status === "approximate") {
      expect(hashGameState(asynchronous.state)).toBe(hashGameState(synchronous.state));
      expect(asynchronous.report).toEqual(synchronous.report);
    }

    await expect(runOfflineApproximationAsync(source, 24 * 60 * 60, {
      shouldCancel: () => true,
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(source.elapsedSeconds).toBe(0);
  });

});
