import { createLogisticsBenchmarkState } from "./logisticsBenchmark";
import {
  advanceSimulationSession,
  completeSimulationAdvanceSession,
  createSimulationAdvanceSession,
  createSimulationProfiler,
  type SimulationProfiler,
} from "./engine";
import { hashGameState } from "./benchmark";
import type { BeltConnection, FactoryEntity, GameState, ItemId } from "./types";

export type PerformanceFixtureProfile = "p50" | "p95" | "max";

export interface PerformanceFixtureSpec {
  profile: PerformanceFixtureProfile;
  entityCount: number;
  beltCount: number;
  stationCount: number;
}
const FIXTURE_SPECS: Record<PerformanceFixtureProfile, PerformanceFixtureSpec> = {
  p50: { profile: "p50", entityCount: 300, beltCount: 300, stationCount: 45 },
  p95: { profile: "p95", entityCount: 380, beltCount: 500, stationCount: 80 },
  max: { profile: "max", entityCount: 569, beltCount: 1_160, stationCount: 128 },
};

const FIXTURE_ITEM: ItemId = "iron_ingot";

function fixtureEntity(id: string, kind: FactoryEntity["kind"], index: number): FactoryEntity {
  return {
    id,
    kind,
    planetId: "home",
    position: { x: (index % 32) * 260, y: Math.floor(index / 32) * 180 },
    interactionLocked: false,
    buildingId: kind === "storage" ? "storage_mk1" : "arc_smelter",
    machineCount: 1,
    minerCount: 0,
    inputs: kind === "storage" ? {} : { iron_ore: 10_000 },
    outputs: kind === "storage" ? {} : { [FIXTURE_ITEM]: 0 },
    recipeId: kind === "storage" ? undefined : "iron_ingot",
    progress: 0,
    routingCursor: 0,
    utilization: 0,
    productionRate: 0,
    storedItemId: kind === "storage" ? FIXTURE_ITEM : undefined,
  };
}

function fixtureBelt(id: string, index: number, source: string, target: string): BeltConnection {
  return {
    id,
    planetId: "home",
    source,
    target,
    itemId: FIXTURE_ITEM,
    lanes: 1,
    tier: 3,
    sorterTier: 3,
    stackSize: 4,
    progress: 0,
    priority: (index % 3) as 0 | 1 | 2,
    lastFlow: 0,
    congestion: 0,
    totalTransferred: 0,
  };
}

/**
 * Builds a deterministic endgame-shaped state from public catalog data only.
 * This intentionally does not load, embed, or snapshot a player save.
 */
export function createSyntheticPerformanceFixture(profile: PerformanceFixtureProfile): GameState {
  const spec = FIXTURE_SPECS[profile];
  const state = createLogisticsBenchmarkState(spec.stationCount);
  const source = fixtureEntity("fixture_source", "storage", state.entities.length);
  source.outputs[FIXTURE_ITEM] = 900_000;
  const target = fixtureEntity("fixture_target", "storage", state.entities.length + 1);
  target.inputs[FIXTURE_ITEM] = 0;
  state.entities.push(source, target);

  let index = state.entities.length;
  while (state.entities.length < spec.entityCount) {
    state.entities.push(fixtureEntity(`fixture_machine_${index.toString().padStart(4, "0")}`, "machine", index));
    index += 1;
  }

  state.belts = Array.from({ length: spec.beltCount }, (_, beltIndex) =>
    fixtureBelt(`fixture_belt_${beltIndex.toString().padStart(4, "0")}`, beltIndex, source.id, target.id));
  state.nextId = state.entities.length + state.belts.length + 1;
  state.paused = false;
  return state;
}

export interface PerformanceFixtureSample {
  profile: PerformanceFixtureProfile;
  indexed: boolean;
  durationMs: number;
  stateBytes: number;
  stateHash: string;
  entityCount: number;
  beltCount: number;
  stationCount: number;
  pendingSimulationSeconds: number;
  profiler: SimulationProfiler;
}

export interface PerformanceFixtureComparison {
  spec: PerformanceFixtureSpec;
  simulatedSeconds: number;
  legacy: PerformanceFixtureSample;
  indexed: PerformanceFixtureSample;
  hashesMatch: boolean;
  durationImprovement: number;
}

function runSample(profile: PerformanceFixtureProfile, indexed: boolean, seconds: number): PerformanceFixtureSample {
  const initial = createSyntheticPerformanceFixture(profile);
  const profiler = createSimulationProfiler();
  const startedAt = performance.now();
  const session = createSimulationAdvanceSession(initial, seconds, { indexedLogistics: indexed, profiler });
  advanceSimulationSession(session, Number.MAX_SAFE_INTEGER);
  const result = completeSimulationAdvanceSession(session);
  const stationCount = result.entities.filter((entity) => entity.kind === "station").length;
  return {
    profile,
    indexed,
    durationMs: performance.now() - startedAt,
    stateBytes: JSON.stringify(result).length,
    stateHash: hashGameState(result),
    entityCount: result.entities.length,
    beltCount: result.belts.length,
    stationCount,
    pendingSimulationSeconds: session.remainingSeconds,
    profiler,
  };
}

export function runSyntheticPerformanceBenchmark(
  profile: PerformanceFixtureProfile,
  options: { seconds?: number; warmupRuns?: number } = {},
): PerformanceFixtureComparison {
  const seconds = Math.max(1, Math.floor(options.seconds ?? 4));
  const warmupRuns = Math.max(0, Math.floor(options.warmupRuns ?? 1));
  for (let index = 0; index < warmupRuns; index += 1) {
    runSample(profile, false, seconds);
    runSample(profile, true, seconds);
  }
  const legacy = runSample(profile, false, seconds);
  const indexed = runSample(profile, true, seconds);
  return {
    spec: FIXTURE_SPECS[profile],
    simulatedSeconds: seconds,
    legacy,
    indexed,
    hashesMatch: legacy.stateHash === indexed.stateHash,
    durationImprovement: legacy.durationMs > 0 ? 1 - indexed.durationMs / legacy.durationMs : 0,
  };
}
