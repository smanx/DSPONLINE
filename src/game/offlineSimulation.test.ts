import { describe, expect, it } from "vitest";
import {
  advanceSimulation,
  advanceSimulationSession,
  completeSimulationAdvanceSession,
  createInitialState,
  createSimulationAdvanceSession,
} from "./engine";
import { advanceOfflineSimulationChunk } from "./offlineSimulation";
import type { BeltConnection } from "./types";

function createOfflineFixture() {
  const state = createInitialState();
  // Keep the long-duration equivalence matrix inexpensive while retaining
  // deterministic clock, galaxy and campaign settlement paths.
  state.entities = [];
  state.belts = [];
  return state;
}

describe("chunked offline simulation", () => {
  for (const [label, seconds] of [
    ["1 hour", 60 * 60],
    ["8 hours", 8 * 60 * 60],
    ["9 hours", 9 * 60 * 60],
    ["24 hours", 24 * 60 * 60],
    ["7 days", 7 * 24 * 60 * 60],
    ["30 days", 30 * 24 * 60 * 60],
  ] as const) {
    it(`matches the synchronous result after ${label}`, () => {
      const state = createOfflineFixture();
      const expected = advanceSimulation(state, seconds);
      const session = createSimulationAdvanceSession(state, seconds);
      while (session.remainingSeconds > 0) advanceSimulationSession(session, 256);
      const actual = completeSimulationAdvanceSession(session);

      expect(actual).toEqual(expected);
      expect(state.elapsedSeconds).toBe(0);
    }, 30_000);
  }

  it("does not mutate or settle a cancelled partial session", () => {
    const state = createOfflineFixture();
    state.belts = [{
      id: "cancel-boundary-belt",
      planetId: "home",
      source: "missing-source",
      target: "missing-target",
      itemId: "iron_ore",
      lanes: 1,
      tier: 1,
      sorterTier: 1,
      progress: 0,
      priority: 1,
      lastFlow: 0,
    } satisfies BeltConnection];
    const session = createSimulationAdvanceSession(state, 24 * 60 * 60);
    advanceSimulationSession(session, 256);

    expect(session.remainingSeconds).toBeGreaterThan(0);
    expect(state.elapsedSeconds).toBe(0);
    expect(state.productionHistory).toEqual([]);
  });

  it("fast-forwards a large inert save without scanning every empty record", () => {
    const state = createOfflineFixture();
    state.entities = Array.from({ length: 5_000 }, (_, index) => ({
      id: `inert_storage_${index}`,
      kind: "storage" as const,
      planetId: "home" as const,
      position: { x: index, y: 0 },
      interactionLocked: false,
      buildingId: "storage_mk1" as const,
      machineCount: 1,
      minerCount: 0,
      inputs: {},
      outputs: {},
      progress: 0,
      routingCursor: 0,
      utilization: 0,
      productionRate: 0,
    }));
    const session = createSimulationAdvanceSession(state, 30 * 24 * 60 * 60);
    const startedAt = performance.now();
    advanceSimulationSession(session, Number.MAX_SAFE_INTEGER);
    const result = completeSimulationAdvanceSession(session);
    expect(performance.now() - startedAt).toBeLessThan(500);
    expect(result.elapsedSeconds).toBe(30 * 24 * 60 * 60);
    expect(result.entities).toHaveLength(5_000);
    expect(result.belts).toHaveLength(0);
    expect(state.elapsedSeconds).toBe(0);
  });

  it("batches five-second hub sessions without changing the exact result", () => {
    const state = createOfflineFixture();
    state.construction.interstellar_logistics_station = 1;
    state.construction.assembling_machine_mk1 = 1;
    state.entities = [];
    // A boundary station forces the engine's deterministic five-second step.
    state.entities.push({
      id: "hub", kind: "station", planetId: "home", position: { x: 0, y: 0 },
      interactionLocked: false, buildingId: "interstellar_logistics_station", powerGridId: "grid-a",
      powerPriority: 2, machineCount: 1, minerCount: 0, inputs: {}, outputs: {}, progress: 0, routingCursor: 0,
      utilization: 0, productionRate: 0, stationMode: "supply", stationTier: 2,
      stationOperationMode: "legacy", stationModeTransition: null, stationSlots: [], stationRoutes: [],
      stationDrones: 0, stationVessels: 0, stationWarpers: 0, stationWarpEnabled: true,
      stationWarperAutoRefill: false, stationWarperTarget: 0, stationHubEnabled: false,
      stationHubPriority: 1, stationMinimumLoad: 1, stationProgress: 0, stationTrips: 0,
      stationLastTransfer: 0, stationDispatchCursor: 0, stationLastSupplyPeerBySlot: {}, stationCongestion: 0,
    });
    const exact = advanceSimulation(state, 300);
    const session = createSimulationAdvanceSession(state, 300);
    while (session.remainingSeconds > 0) advanceOfflineSimulationChunk(session, { scanCriticalEvents: false });
    expect(completeSimulationAdvanceSession(session)).toEqual(exact);
  });
});
