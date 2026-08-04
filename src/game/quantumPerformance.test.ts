import { describe, expect, it } from "vitest";
import { hashGameState } from "./benchmark";
import { advanceSimulation, attachAllInterstellarStationsToQuantumNetwork, createPlayerInitialState } from "./engine";
import {
  beginQuantumAttachment,
  normalizeQuantumInteger,
  settleQuantumAttachment,
  settleQuantumAttachments,
} from "./quantumLogisticsNetwork";
import type { FactoryEntity, GameState, ItemId, StationSlot } from "./types";

const QUANTUM_BENCHMARK_TOWERS = 402;
const QUANTUM_SLOT_ITEMS = ["iron_ore", "copper_ore", "silicon_ore", "titanium_ore", "stone"] as const satisfies readonly ItemId[];

const benchmarkEnvironment = (globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
}).process?.env;

function quantumSlot(itemId: ItemId, remoteMode: "supply" | "demand", priority: 0 | 1 | 2): StationSlot {
  return {
    itemId,
    localMode: "storage",
    remoteMode,
    minimumLoad: 1,
    minStock: 0,
    maxStock: 0,
    priority,
    routePolicy: "direct",
    warperBudget: 2,
  };
}

function quantumTower(index: number): FactoryEntity {
  const supply = index < QUANTUM_BENCHMARK_TOWERS / 2;
  const outputs = Object.fromEntries(QUANTUM_SLOT_ITEMS.map((itemId) => [itemId, supply ? 1_000_000 : 0])) as Partial<Record<ItemId, number>>;
  return {
    id: `quantum-benchmark-${index.toString().padStart(3, "0")}`,
    kind: "station",
    planetId: "home",
    position: { x: (index % 32) * 260, y: Math.floor(index / 32) * 180 },
    interactionLocked: false,
    buildingId: "interstellar_logistics_station",
    stationTier: 2,
    quantumMode: "quantum",
    quantumTransition: null,
    stationSlots: QUANTUM_SLOT_ITEMS.map((itemId, slotIndex) => quantumSlot(
      itemId,
      supply ? "supply" : "demand",
      (slotIndex % 3) as 0 | 1 | 2,
    )),
    stationRoutes: [],
    stationDrones: 0,
    stationVessels: 0,
    stationWarpers: 0,
    inputs: {},
    outputs,
    progress: 0,
    utilization: 0,
    productionRate: 0,
    routingCursor: 0,
    machineCount: 1,
    minerCount: 0,
  };
}

function createQuantumPerformanceFixture(): GameState {
  const state = createPlayerInitialState();
  state.quantumLogisticsNetwork.enabled = true;
  state.research.completedTechIds = [...new Set([
    ...state.research.completedTechIds,
    "interstellar_logistics",
    "quantum_logistics_network",
  ])] as typeof state.research.completedTechIds;
  state.entities.push(...Array.from({ length: QUANTUM_BENCHMARK_TOWERS }, (_, index) => quantumTower(index)));
  state.entities.push({
    id: "quantum-benchmark-power",
    kind: "power",
    planetId: "home",
    position: { x: -400, y: -400 },
    interactionLocked: false,
    buildingId: "wind_turbine",
    inputs: {},
    outputs: {},
    progress: 0,
    utilization: 0,
    productionRate: 0,
    routingCursor: 0,
    machineCount: 1_000_000,
    minerCount: 0,
  });
  state.paused = false;
  return state;
}

function createQuantumAttachmentFixture(): GameState {
  const state = createQuantumPerformanceFixture();
  state.quantumLogisticsNetwork.enabled = false;
  for (const entity of state.entities) {
    if (entity.buildingId !== "interstellar_logistics_station" || !entity.id.startsWith("quantum-benchmark-")) continue;
    entity.quantumMode = "legacy";
    entity.quantumTransition = null;
  }
  return state;
}

function quantumTowerIds(state: GameState): string[] {
  return state.entities
    .filter((entity) => entity.buildingId === "interstellar_logistics_station" && entity.id.startsWith("quantum-benchmark-"))
    .map((entity) => entity.id)
    .sort((left, right) => left.localeCompare(right));
}

function beginAttachmentsSequentially(state: GameState): GameState {
  let next = state;
  for (const stationId of quantumTowerIds(state)) {
    const result = beginQuantumAttachment(next, stationId);
    if (result.changed) next = result.state;
  }
  return next;
}

function settleAttachmentsSequentially(state: GameState): GameState {
  let next = state;
  for (const stationId of quantumTowerIds(state)) {
    const result = settleQuantumAttachment(next, stationId);
    if (result.changed) next = result.state;
  }
  return next;
}

function countQuantumFixtureInventory(state: GameState): bigint {
  let total = 0n;
  for (const entity of state.entities) {
    if (!entity.id.startsWith("quantum-benchmark-")) continue;
    for (const amount of Object.values(entity.inputs)) total += BigInt(Math.max(0, Math.floor(amount ?? 0)));
    for (const amount of Object.values(entity.outputs)) total += BigInt(Math.max(0, Math.floor(amount ?? 0)));
  }
  for (const amount of Object.values(state.quantumLogisticsNetwork.inventory)) {
    total += BigInt(normalizeQuantumInteger(amount));
  }
  return total;
}

function median(values: number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)] ?? 0;
}

function hashAuthoritativeSimulationState(state: GameState): string {
  // Production history is runtime UI telemetry sampled at Worker publication
  // boundaries and is intentionally removed from persisted saves.
  return hashGameState({ ...state, productionHistory: [] });
}

describe("quantum logistics performance fixture", () => {
  it("keeps 2,010 slot requests deterministic and conserves every item", () => {
    const initial = createQuantumPerformanceFixture();
    const initialInventory = countQuantumFixtureInventory(initial);
    const whole = advanceSimulation(initial, 5);
    let segmented = initial;
    for (let second = 0; second < 5; second += 1) segmented = advanceSimulation(segmented, 1);
    expect(hashAuthoritativeSimulationState(whole)).toBe(hashAuthoritativeSimulationState(segmented));
    expect(countQuantumFixtureInventory(whole)).toBe(initialInventory);
    expect(whole.entities.filter((entity) => entity.quantumMode === "quantum")).toHaveLength(QUANTUM_BENCHMARK_TOWERS);
    expect(whole.entities.reduce((sum, entity) => sum + (entity.stationRoutes?.length ?? 0), 0)).toBe(0);
  }, 30_000);

  it("batches 402 attachment starts and settlements without changing the serial oracle", () => {
    const source = createQuantumAttachmentFixture();
    const serialStarted = beginAttachmentsSequentially(structuredClone(source));
    const batchStarted = attachAllInterstellarStationsToQuantumNetwork(structuredClone(source)).state;
    expect(hashGameState(batchStarted)).toBe(hashGameState(serialStarted));

    const serialSettled = settleAttachmentsSequentially({ ...serialStarted, elapsedSeconds: 5 });
    const batchSettled = settleQuantumAttachments({ ...batchStarted, elapsedSeconds: 5 }).state;
    expect(hashGameState(batchSettled)).toBe(hashGameState(serialSettled));
    expect(batchSettled.entities.filter((entity) => entity.quantumMode === "quantum")).toHaveLength(QUANTUM_BENCHMARK_TOWERS);
    expect(countQuantumFixtureInventory(batchSettled)).toBe(countQuantumFixtureInventory(source));
  }, 30_000);

  it.skipIf(benchmarkEnvironment?.DSP_RUN_QUANTUM_BENCHMARK !== "1")(
    "profiles the 402-tower boundary without player data",
    () => {
      const source = createQuantumPerformanceFixture();
      for (let warmup = 0; warmup < 2; warmup += 1) advanceSimulation(structuredClone(source), 5);
      const durations = Array.from({ length: 7 }, () => {
        const startedAt = performance.now();
        const result = advanceSimulation(structuredClone(source), 5);
        expect(countQuantumFixtureInventory(result)).toBe(countQuantumFixtureInventory(source));
        return performance.now() - startedAt;
      });
      console.log(`QUANTUM_BOUNDARY_BENCHMARK ${JSON.stringify({
        generatedAt: new Date().toISOString(),
        towers: QUANTUM_BENCHMARK_TOWERS,
        slots: QUANTUM_BENCHMARK_TOWERS * QUANTUM_SLOT_ITEMS.length,
        samplesMs: durations.map((duration) => Number(duration.toFixed(2))),
        medianMs: Number(median(durations).toFixed(2)),
      })}`);
    },
    60_000,
  );

  it.skipIf(benchmarkEnvironment?.DSP_RUN_QUANTUM_BENCHMARK !== "1")(
    "profiles serial and batched 402-tower handoffs",
    () => {
      const source = createQuantumAttachmentFixture();
      const sample = (operation: (state: GameState) => GameState, input: GameState, runs = 5) => {
        const durations = Array.from({ length: runs }, () => {
          const state = structuredClone(input);
          const startedAt = performance.now();
          operation(state);
          return performance.now() - startedAt;
        });
        return {
          samplesMs: durations.map((duration) => Number(duration.toFixed(2))),
          medianMs: Number(median(durations).toFixed(2)),
        };
      };
      const serialStart = sample(beginAttachmentsSequentially, source);
      const batchStart = sample((state) => attachAllInterstellarStationsToQuantumNetwork(state).state, source);
      const started = attachAllInterstellarStationsToQuantumNetwork(structuredClone(source)).state;
      const boundaryState = { ...started, elapsedSeconds: 5 };
      const serialSettlement = sample(settleAttachmentsSequentially, boundaryState);
      const batchSettlement = sample((state) => settleQuantumAttachments(state).state, boundaryState);
      console.log(`QUANTUM_ATTACHMENT_BENCHMARK ${JSON.stringify({
        generatedAt: new Date().toISOString(),
        towers: QUANTUM_BENCHMARK_TOWERS,
        serialStart,
        batchStart,
        serialSettlement,
        batchSettlement,
      })}`);
    },
    60_000,
  );
});
