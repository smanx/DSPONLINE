import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import {
  advanceSimulationSession,
  createSimulationAdvanceSession,
  createSimulationProfiler,
} from "../src/game/engine";
import { hashGameState } from "../src/game/benchmark";
import { migrateGame } from "../src/game/storage";
import type { FactoryEntity, GameState, ItemId, PlanetId } from "../src/game/types";

type NumericRecord = Record<string, number>;

interface PlanetAggregate {
  internalInputs: NumericRecord;
  internalOutputs: NumericRecord;
  stationInputs: NumericRecord;
  stationOutputs: NumericRecord;
  tray: NumericRecord;
  reserves: NumericRecord;
  beltTransferred: NumericRecord;
  boundaryBeltTransferred: NumericRecord;
  internalBeltTransferred: NumericRecord;
  beltCredits: NumericRecord;
  beltFlow: NumericRecord;
  scalar: NumericRecord;
}

interface WindowComparison {
  normalizedError: number;
  maxSignificantError: number;
  exact: boolean;
}

function readArgument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function readPositiveInteger(name: string, fallback: number): number {
  const value = Number(readArgument(name));
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function readNonNegativeInteger(name: string, fallback: number): number {
  const value = Number(readArgument(name));
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function roundReport(value: number, digits = 3): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function add(record: NumericRecord, key: string, amount: number): void {
  if (!Number.isFinite(amount) || Math.abs(amount) < 1e-12) return;
  record[key] = (record[key] ?? 0) + amount;
}

function addInventory(record: NumericRecord, inventory: Partial<Record<ItemId, number>>): void {
  for (const [itemId, amount] of Object.entries(inventory)) add(record, itemId, Number(amount ?? 0));
}

function aggregatePlanet(state: GameState, planetId: PlanetId): PlanetAggregate {
  const aggregate: PlanetAggregate = {
    internalInputs: {},
    internalOutputs: {},
    stationInputs: {},
    stationOutputs: {},
    tray: {},
    reserves: {},
    beltTransferred: {},
    boundaryBeltTransferred: {},
    internalBeltTransferred: {},
    beltCredits: {},
    beltFlow: {},
    scalar: {},
  };
  const entities = state.entities.filter((entity) => entity.planetId === planetId);
  const stations = entities.filter((entity) => entity.kind === "station");
  const internal = entities.filter((entity) => entity.kind !== "station");
  for (const entity of internal) {
    addInventory(aggregate.internalInputs, entity.inputs);
    addInventory(aggregate.internalOutputs, entity.outputs);
    if (entity.resourceId) add(aggregate.reserves, entity.resourceId, entity.resourceRemaining ?? 0);
    add(aggregate.scalar, "internalProgress", entity.progress ?? 0);
    add(aggregate.scalar, "internalProductionRate", entity.productionRate ?? 0);
    add(aggregate.scalar, "internalUtilization", entity.utilization ?? 0);
  }
  for (const station of stations) {
    addInventory(aggregate.stationInputs, station.inputs);
    addInventory(aggregate.stationOutputs, station.outputs);
    add(aggregate.scalar, "routeCount", station.stationRoutes?.length ?? 0);
    add(aggregate.scalar, "routeCargo", (station.stationRoutes ?? []).reduce((sum, route) => sum + route.cargo, 0));
    add(aggregate.scalar, "routeVehicles", (station.stationRoutes ?? []).reduce((sum, route) => sum + route.vehicleCount, 0));
  }
  addInventory(aggregate.tray, planetId === state.activePlanetId ? state.tray : state.planetTrays[planetId]);
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  for (const belt of state.belts) {
    if (belt.planetId !== planetId) continue;
    add(aggregate.beltTransferred, belt.itemId, belt.totalTransferred ?? 0);
    const source = entityById.get(belt.source);
    const target = entityById.get(belt.target);
    if (source?.kind === "station" || target?.kind === "station") {
      const direction = source?.kind === "station" ? "station-out" : "station-in";
      add(aggregate.boundaryBeltTransferred, `${direction}:${belt.itemId}`, belt.totalTransferred ?? 0);
    } else {
      add(aggregate.internalBeltTransferred, belt.itemId, belt.totalTransferred ?? 0);
    }
    add(aggregate.beltCredits, belt.itemId, belt.progress ?? 0);
    add(aggregate.beltFlow, belt.itemId, belt.lastFlow ?? 0);
  }
  const metrics = state.planetMetrics[planetId];
  if (metrics) {
    add(aggregate.scalar, "generationKw", metrics.generationKw);
    add(aggregate.scalar, "demandKw", metrics.demandKw);
    add(aggregate.scalar, "powerFactor", metrics.powerFactor);
    add(aggregate.scalar, "storedEnergyMj", metrics.storedEnergyMj);
  }
  add(aggregate.scalar, "entityCount", entities.length);
  add(aggregate.scalar, "stationCount", stations.length);
  add(aggregate.scalar, "beltCount", state.belts.filter((belt) => belt.planetId === planetId).length);
  return aggregate;
}

function flattenAggregate(aggregate: PlanetAggregate): NumericRecord {
  const flattened: NumericRecord = {};
  for (const [section, values] of Object.entries(aggregate)) {
    for (const [key, value] of Object.entries(values)) flattened[`${section}.${key}`] = value;
  }
  return flattened;
}

function deltaBetween(before: PlanetAggregate, after: PlanetAggregate): NumericRecord {
  const left = flattenAggregate(before);
  const right = flattenAggregate(after);
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return Object.fromEntries([...keys].map((key) => [key, (right[key] ?? 0) - (left[key] ?? 0)]));
}

function compareWindows(
  reference: NumericRecord,
  candidate: NumericRecord,
  prefixes?: readonly string[],
): WindowComparison {
  const keys = new Set([...Object.keys(reference), ...Object.keys(candidate)].filter((key) =>
    !prefixes || prefixes.some((prefix) => key.startsWith(prefix))));
  let differenceMagnitude = 0;
  let referenceMagnitude = 0;
  let maxSignificantError = 0;
  let exact = true;
  for (const key of keys) {
    const expected = reference[key] ?? 0;
    const actual = candidate[key] ?? 0;
    const difference = Math.abs(actual - expected);
    if (difference > 1e-6) exact = false;
    differenceMagnitude += difference;
    referenceMagnitude += Math.abs(expected);
    if (Math.abs(expected) >= 10 || Math.abs(actual) >= 10) {
      maxSignificantError = Math.max(maxSignificantError, difference / Math.max(1, Math.abs(expected)));
    }
  }
  return {
    normalizedError: differenceMagnitude / Math.max(1, referenceMagnitude),
    maxSignificantError,
    exact,
  };
}

function ordinaryProductionEntity(entity: FactoryEntity): boolean {
  return entity.kind === "vein" || (entity.kind === "machine" &&
    entity.recipeId !== "matrix_research" && entity.recipeId !== "solar_sail_launch" && entity.recipeId !== "carrier_rocket_launch" &&
    entity.buildingId !== "construction_center" && entity.buildingId !== "time_warp_device" &&
    entity.buildingId !== "galactic_material_exporter" && entity.buildingId !== "ray_receiver");
}

const saveArgument = readArgument("save");
if (!saveArgument) {
  throw new Error("Usage: vite-node scripts/analyze-planet-contracts.ts --save=<path> [--window=60] [--windows=6] [--output=<path>]");
}
const windowSeconds = readPositiveInteger("window", 60);
const windowCount = Math.max(2, readPositiveInteger("windows", 6));
const warmupSeconds = readNonNegativeInteger("warmup", 0);
const totalSeconds = windowSeconds * windowCount;
const savePath = resolve(saveArgument);
const raw = readFileSync(savePath, "utf8");
const parsed = JSON.parse(raw) as { state?: unknown };
const migrated = migrateGame(parsed.state ?? parsed);
if (!migrated) throw new Error("The save could not be migrated by the current engine");
const originalState = migrated;
const originalHash = hashGameState(originalState);
const state = structuredClone(originalState);
state.paused = false;
state.timeWarp.pendingSimulationSeconds = 0;
state.timeWarp.pendingWallSeconds = 0;
const planetIds = [...new Set(state.entities.map((entity) => entity.planetId))];
if (warmupSeconds > 0) {
  const warmupSession = createSimulationAdvanceSession(state, warmupSeconds, { mutateState: true });
  advanceSimulationSession(warmupSession, Number.MAX_SAFE_INTEGER);
}
const snapshots = new Map<PlanetId, PlanetAggregate[]>();
for (const planetId of planetIds) snapshots.set(planetId, [aggregatePlanet(state, planetId)]);

const profiler = createSimulationProfiler();
const session = createSimulationAdvanceSession(state, totalSeconds, { mutateState: true, profiler });
const durations: number[] = [];
for (let second = 1; second <= totalSeconds; second += 1) {
  const startedAt = performance.now();
  advanceSimulationSession(session, 1);
  durations.push(performance.now() - startedAt);
  if (second % windowSeconds === 0) {
    for (const planetId of planetIds) snapshots.get(planetId)!.push(aggregatePlanet(session.state, planetId));
  }
}

const planetResults = planetIds.map((planetId) => {
  const values = snapshots.get(planetId)!;
  const reference = deltaBetween(values[0], values[1]);
  const comparisons = values.slice(1, -1).map((value, index) =>
    compareWindows(reference, deltaBetween(value, values[index + 2])));
  const boundaryComparisons = values.slice(1, -1).map((value, index) =>
    compareWindows(reference, deltaBetween(value, values[index + 2]), [
      "stationInputs.",
      "stationOutputs.",
      "tray.",
      "reserves.",
    ]));
  const boundaryFlowComparisons = values.slice(1, -1).map((value, index) =>
    compareWindows(reference, deltaBetween(value, values[index + 2]), ["boundaryBeltTransferred."]));
  const materialComparisons = values.slice(1, -1).map((value, index) =>
    compareWindows(reference, deltaBetween(value, values[index + 2]), [
      "internalInputs.",
      "internalOutputs.",
      "stationInputs.",
      "stationOutputs.",
      "tray.",
      "reserves.",
      "beltTransferred.",
    ]));
  const maxNormalizedError = Math.max(...comparisons.map((comparison) => comparison.normalizedError));
  const maxSignificantError = Math.max(...comparisons.map((comparison) => comparison.maxSignificantError));
  const entities = originalState.entities.filter((entity) => entity.planetId === planetId);
  return {
    exact: comparisons.every((comparison) => comparison.exact),
    maxNormalizedError,
    maxSignificantError,
    boundaryExact: boundaryComparisons.every((comparison) => comparison.exact),
    boundaryNormalizedError: Math.max(...boundaryComparisons.map((comparison) => comparison.normalizedError)),
    boundarySignificantError: Math.max(...boundaryComparisons.map((comparison) => comparison.maxSignificantError)),
    boundaryFlowExact: boundaryFlowComparisons.every((comparison) => comparison.exact),
    boundaryFlowNormalizedError: Math.max(...boundaryFlowComparisons.map((comparison) => comparison.normalizedError)),
    boundaryFlowSignificantError: Math.max(...boundaryFlowComparisons.map((comparison) => comparison.maxSignificantError)),
    materialExact: materialComparisons.every((comparison) => comparison.exact),
    materialNormalizedError: Math.max(...materialComparisons.map((comparison) => comparison.normalizedError)),
    materialSignificantError: Math.max(...materialComparisons.map((comparison) => comparison.maxSignificantError)),
    entityCount: entities.length,
    productionEntityCount: entities.filter(ordinaryProductionEntity).length,
    stationCount: entities.filter((entity) => entity.kind === "station").length,
    beltCount: originalState.belts.filter((belt) => belt.planetId === planetId).length,
  };
});

const totals = {
  production: planetResults.reduce((sum, planet) => sum + planet.productionEntityCount, 0),
  belts: planetResults.reduce((sum, planet) => sum + planet.beltCount, 0),
  stations: planetResults.reduce((sum, planet) => sum + planet.stationCount, 0),
};
const summarizeTolerance = (
  tolerance: number,
  scope: "full" | "boundary" | "boundary-flow" | "material" = "full",
) => {
  const stable = planetResults.filter((planet) =>
    scope === "boundary-flow"
      ? planet.boundaryFlowNormalizedError <= tolerance && planet.boundaryFlowSignificantError <= tolerance * 2
      : scope === "boundary"
      ? planet.boundaryNormalizedError <= tolerance && planet.boundarySignificantError <= tolerance * 2
      : scope === "material"
        ? planet.materialNormalizedError <= tolerance && planet.materialSignificantError <= tolerance * 2
        : planet.maxNormalizedError <= tolerance && planet.maxSignificantError <= tolerance * 2);
  const productionCoverage = stable.reduce((sum, planet) => sum + planet.productionEntityCount, 0) / Math.max(1, totals.production);
  const beltCoverage = stable.reduce((sum, planet) => sum + planet.beltCount, 0) / Math.max(1, totals.belts);
  const stationCoverage = stable.reduce((sum, planet) => sum + planet.stationCount, 0) / Math.max(1, totals.stations);
  const localIdealSavedMs = profiler.productionMs * productionCoverage + profiler.beltsMs * beltCoverage;
  const localConservativeSavedMs = localIdealSavedMs * 0.8;
  const totalMs = durations.reduce((sum, value) => sum + value, 0);
  return {
    stablePlanetCount: stable.length,
    productionCoverage: roundReport(productionCoverage, 6),
    beltCoverage: roundReport(beltCoverage, 6),
    stationCoverage: roundReport(stationCoverage, 6),
    conservativeLocalTimeReduction: roundReport(localConservativeSavedMs / Math.max(1, totalMs), 6),
    idealLocalTimeReduction: roundReport(localIdealSavedMs / Math.max(1, totalMs), 6),
  };
};

const summarizeErrors = (scope: "full" | "boundary" | "boundary-flow" | "material") => {
  const values = planetResults.map((planet) => scope === "boundary-flow"
    ? planet.boundaryFlowNormalizedError
    : scope === "boundary"
    ? planet.boundaryNormalizedError
    : scope === "material"
      ? planet.materialNormalizedError
      : planet.maxNormalizedError).sort((left, right) => left - right);
  const at = (ratio: number) => values[Math.min(values.length - 1, Math.max(0, Math.floor(values.length * ratio)))] ?? 0;
  return {
    minimum: roundReport(values[0] ?? 0, 6),
    median: roundReport(at(0.5), 6),
    p75: roundReport(at(0.75), 6),
    maximum: roundReport(values[values.length - 1] ?? 0, 6),
  };
};

const totalMs = durations.reduce((sum, value) => sum + value, 0);
const result = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  fixture: {
    bytes: statSync(savePath).size,
    stateVersion: originalState.version,
    entityCount: originalState.entities.length,
    beltCount: originalState.belts.length,
    stationCount: originalState.entities.filter((entity) => entity.kind === "station").length,
    populatedPlanetCount: planetIds.length,
    originalStateUnchanged: hashGameState(originalState) === originalHash,
  },
  experiment: {
    windowSeconds,
    windowCount,
    warmupSeconds,
    exactSimulationSeconds: totalSeconds,
    model: "planet internal net flow with logistics stations kept as live boundaries",
  },
  baseline: {
    totalMs: roundReport(totalMs),
    meanStepMs: roundReport(totalMs / durations.length),
    p95StepMs: roundReport([...durations].sort((left, right) => left - right)[Math.ceil(durations.length * 0.95) - 1]),
    productionMs: roundReport(profiler.productionMs),
    beltsMs: roundReport(profiler.beltsMs),
    logisticsMs: roundReport(profiler.logisticsMs),
    powerMs: roundReport(profiler.powerMs),
    localPhaseMaximumTimeReduction: roundReport((profiler.productionMs + profiler.beltsMs) / Math.max(1, totalMs), 6),
  },
  stability: {
    fullAggregate: {
      exact: summarizeTolerance(0),
      onePercent: summarizeTolerance(0.01),
      fivePercent: summarizeTolerance(0.05),
      tenPercent: summarizeTolerance(0.1),
      twentyFivePercent: summarizeTolerance(0.25),
      errors: summarizeErrors("full"),
    },
    materialAggregate: {
      exact: summarizeTolerance(0, "material"),
      onePercent: summarizeTolerance(0.01, "material"),
      fivePercent: summarizeTolerance(0.05, "material"),
      tenPercent: summarizeTolerance(0.1, "material"),
      twentyFivePercent: summarizeTolerance(0.25, "material"),
      errors: summarizeErrors("material"),
    },
    externalBoundary: {
      exact: summarizeTolerance(0, "boundary"),
      onePercent: summarizeTolerance(0.01, "boundary"),
      fivePercent: summarizeTolerance(0.05, "boundary"),
      tenPercent: summarizeTolerance(0.1, "boundary"),
      twentyFivePercent: summarizeTolerance(0.25, "boundary"),
      errors: summarizeErrors("boundary"),
    },
    stationBeltBoundaryFlow: {
      exact: summarizeTolerance(0, "boundary-flow"),
      onePercent: summarizeTolerance(0.01, "boundary-flow"),
      fivePercent: summarizeTolerance(0.05, "boundary-flow"),
      tenPercent: summarizeTolerance(0.1, "boundary-flow"),
      twentyFivePercent: summarizeTolerance(0.25, "boundary-flow"),
      errors: summarizeErrors("boundary-flow"),
    },
    medianNormalizedError: roundReport([...planetResults].sort((left, right) => left.maxNormalizedError - right.maxNormalizedError)[Math.floor(planetResults.length / 2)]?.maxNormalizedError ?? 0, 6),
    worstNormalizedError: roundReport(Math.max(...planetResults.map((planet) => planet.maxNormalizedError)), 6),
  },
  limitation: "Tolerance projections are not deterministic A/B results; station dispatch and routes remain live and an event scheduler is still required.",
  privacy: {
    savePathIncluded: false,
    planetIdsIncluded: false,
    itemDetailsIncluded: false,
    playerIdentityIncluded: false,
    stateHashIncluded: false,
  },
};

const outputArgument = readArgument("output");
if (outputArgument) {
  const outputPath = resolve(outputArgument);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
