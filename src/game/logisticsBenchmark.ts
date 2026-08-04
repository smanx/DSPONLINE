import { PLANET_LIST } from "./content";
import {
  advanceSimulationSession,
  completeSimulationAdvanceSession,
  createInitialState,
  createSimulationAdvanceSession,
  createSimulationProfiler,
  type SimulationProfiler,
} from "./engine";
import { hashGameState } from "./benchmark";
import type { FactoryEntity, GameState, ItemId, PlanetId, StationSlot } from "./types";

const BENCHMARK_ITEMS: ItemId[] = ["iron_ingot", "copper_ingot", "stone_brick", "gear", "circuit_board"];

function stationSlot(itemId: ItemId, mode: "supply" | "demand", remote: boolean, index: number): StationSlot {
  return {
    itemId,
    localMode: remote ? "storage" : mode,
    remoteMode: remote ? mode : "storage",
    minimumLoad: index % 2 === 0 ? 0.5 : 0.25,
    minStock: mode === "supply" ? 100 : 0,
    maxStock: 100_000_000,
    priority: (index % 3) as 0 | 1 | 2,
    routePolicy: index % 3 === 0 ? "direct" : "relay-preferred",
    warperBudget: (index % 4) + 1,
  };
}

function baseEntity(id: string, planetId: PlanetId, index: number): Omit<FactoryEntity, "kind" | "buildingId"> {
  return {
    id,
    planetId,
    position: { x: index % 20 * 280, y: Math.floor(index / 20) * 180 },
    interactionLocked: false,
    routingCursor: 0,
    machineCount: 10,
    minerCount: 0,
    inputs: {},
    outputs: {},
    progress: 0,
    utilization: 0,
    productionRate: 0,
  };
}

export function createLogisticsBenchmarkState(stationCount: number): GameState {
  const count = Math.max(2, Math.floor(stationCount));
  const state = createInitialState(9_090_090, false);
  const planets = PLANET_LIST.filter((planet) => planet.kind !== "gas-giant").map((planet) => planet.id).slice(0, 8);
  state.entities = [];
  state.belts = [];
  state.research.completedTechIds = ["interstellar_logistics", "space_warp", "universe_matrix"];
  state.exploration.unlockedSystemIds = [...new Set(PLANET_LIST.map((planet) => planet.systemId))];
  state.exploration.colonizedPlanetIds = [...planets];

  for (let index = 0; index < planets.length; index += 1) {
    const planetId = planets[index];
    state.entities.push({
      ...baseEntity(`benchmark_power_${planetId}`, planetId, index),
      kind: "power",
      buildingId: "artificial_star",
      machineCount: 200,
      fuelItemId: "antimatter_fuel_rod",
      inputs: { antimatter_fuel_rod: 1_000_000 },
      generationPriority: 3,
    });
  }

  for (let index = 0; index < count; index += 1) {
    const remote = index % 2 === 1;
    const mode = Math.floor(index / 2) % 2 === 0 ? "supply" : "demand";
    const planetId = remote
      ? mode === "supply" ? planets[0] : planets[1 + (Math.floor(index / 4) % Math.max(1, planets.length - 1))]
      : planets[Math.floor(index / 4) % planets.length];
    const outputs = mode === "supply"
      ? Object.fromEntries(BENCHMARK_ITEMS.map((itemId) => [itemId, 50_000_000])) as Partial<Record<ItemId, number>>
      : {};
    state.entities.push({
      ...baseEntity(`benchmark_station_${index.toString().padStart(4, "0")}`, planetId, index),
      kind: "station",
      buildingId: remote ? "interstellar_logistics_station" : "planetary_logistics_station",
      stationMode: mode,
      stationProgress: 0,
      stationTrips: 0,
      stationDrones: 500,
      stationVessels: remote ? 100 : undefined,
      stationWarpers: remote ? 20_000 : undefined,
      stationWarpEnabled: remote || undefined,
      stationSlots: BENCHMARK_ITEMS.map((itemId, slotIndex) => stationSlot(itemId, mode, remote, slotIndex)),
      stationRoutes: [],
      stationDispatchCursor: 0,
      stationCongestion: 0,
      outputs,
    });
  }
  state.nextId = count + planets.length + 1;
  return state;
}

export interface LogisticsBenchmarkSample {
  durationMs: number;
  stateHash: string;
  routeCount: number;
  profiler: SimulationProfiler;
}

export interface LogisticsBenchmarkModeReport {
  medianMs: number;
  p95Ms: number;
  stateHash: string;
  routeCount: number;
  medianPeerCandidateChecks: number;
  medianPeerMatchCacheHits: number;
  medianRouteEconomicsCalls: number;
  medianRouteEconomicsCacheHits: number;
  medianRoutePathPlans: number;
  medianRoutePathCacheHits: number;
  medianCongestionDispatchReuseHits: number;
  medianCopyStateMs: number;
  medianDispatchMs: number;
}

export interface LogisticsBenchmarkComparison {
  stationCount: number;
  simulatedSeconds: number;
  legacy: LogisticsBenchmarkModeReport;
  indexed: LogisticsBenchmarkModeReport;
  hashesMatch: boolean;
  medianImprovement: number;
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileValue) - 1))];
}

function runSample(state: GameState, seconds: number, indexedLogistics: boolean): LogisticsBenchmarkSample {
  const profiler = createSimulationProfiler();
  const startedAt = performance.now();
  const session = createSimulationAdvanceSession(state, seconds, { indexedLogistics, profiler });
  advanceSimulationSession(session, Number.MAX_SAFE_INTEGER);
  const result = completeSimulationAdvanceSession(session);
  return {
    durationMs: performance.now() - startedAt,
    stateHash: hashGameState(result),
    routeCount: result.entities.reduce((sum, entity) => sum + (entity.stationRoutes?.length ?? 0), 0),
    profiler,
  };
}

function summarize(samples: LogisticsBenchmarkSample[]): LogisticsBenchmarkModeReport {
  return {
    medianMs: percentile(samples.map((sample) => sample.durationMs), 0.5),
    p95Ms: percentile(samples.map((sample) => sample.durationMs), 0.95),
    stateHash: samples[0]?.stateHash ?? "",
    routeCount: samples[0]?.routeCount ?? 0,
    medianPeerCandidateChecks: percentile(samples.map((sample) => sample.profiler.peerCandidateChecks), 0.5),
    medianPeerMatchCacheHits: percentile(samples.map((sample) => sample.profiler.peerMatchCacheHits), 0.5),
    medianRouteEconomicsCalls: percentile(samples.map((sample) => sample.profiler.routeEconomicsCalls), 0.5),
    medianRouteEconomicsCacheHits: percentile(samples.map((sample) => sample.profiler.routeEconomicsCacheHits), 0.5),
    medianRoutePathPlans: percentile(samples.map((sample) => sample.profiler.routePathPlans), 0.5),
    medianRoutePathCacheHits: percentile(samples.map((sample) => sample.profiler.routePathCacheHits), 0.5),
    medianCongestionDispatchReuseHits: percentile(samples.map((sample) => sample.profiler.congestionDispatchReuseHits), 0.5),
    medianCopyStateMs: percentile(samples.map((sample) => sample.profiler.copyStateMs), 0.5),
    medianDispatchMs: percentile(samples.map((sample) => sample.profiler.dispatchMs), 0.5),
  };
}

export function runLogisticsBenchmarkComparison(
  stationCount: number,
  options: { seconds?: number; warmupRuns?: number; measuredRuns?: number } = {},
): LogisticsBenchmarkComparison {
  const state = createLogisticsBenchmarkState(stationCount);
  const seconds = Math.max(1, Math.floor(options.seconds ?? 3));
  const warmupRuns = Math.max(0, Math.floor(options.warmupRuns ?? 3));
  const measuredRuns = Math.max(1, Math.floor(options.measuredRuns ?? 10));
  for (let index = 0; index < warmupRuns; index += 1) {
    runSample(state, seconds, false);
    runSample(state, seconds, true);
  }
  const legacySamples: LogisticsBenchmarkSample[] = [];
  const indexedSamples: LogisticsBenchmarkSample[] = [];
  for (let index = 0; index < measuredRuns; index += 1) {
    legacySamples.push(runSample(state, seconds, false));
    indexedSamples.push(runSample(state, seconds, true));
  }
  const legacy = summarize(legacySamples);
  const indexed = summarize(indexedSamples);
  return {
    stationCount: Math.max(2, Math.floor(stationCount)),
    simulatedSeconds: seconds,
    legacy,
    indexed,
    hashesMatch: legacySamples.every((sample) => sample.stateHash === legacy.stateHash) &&
      indexedSamples.every((sample) => sample.stateHash === indexed.stateHash) && legacy.stateHash === indexed.stateHash,
    medianImprovement: legacy.medianMs > 0 ? 1 - indexed.medianMs / legacy.medianMs : 0,
  };
}
