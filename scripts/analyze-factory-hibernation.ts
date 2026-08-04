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
import type { BeltConnection, FactoryEntity, GameState } from "../src/game/types";

type RecordKind = "entity" | "belt";
type PathPart = string | number;

interface TransitionOperation {
  kind: "add" | "set";
  path: PathPart[];
  value: number | string | boolean | null | undefined;
}

interface Transition {
  signature: string;
  operations: TransitionOperation[];
  structural: boolean;
}

interface RecordTracker {
  kind: RecordKind;
  previous: unknown;
  observation: Transition[];
  period: number | null;
  pattern: Transition[];
  predicted: unknown;
  wokeAtSecond: number | null;
  wakeReason: "structural" | "transition" | null;
  predictionMatched: boolean;
}

interface EntityMetadata {
  kind: FactoryEntity["kind"];
  buildingId: FactoryEntity["buildingId"];
  active: boolean;
}

interface AggregateCounts {
  total: number;
  observedStable: number;
  validatedStable: number;
  woke: number;
  predictionMismatch: number;
}

const SPECIAL_BUILDINGS = new Set([
  "construction_center",
  "time_warp_device",
  "micro_black_hole_connector",
  "galactic_material_exporter",
  "em_rail_ejector",
  "vertical_launching_silo",
  "ray_receiver",
]);

function readArgument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function readPositiveInteger(name: string, fallback: number): number {
  const value = Number(readArgument(name));
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function normalizedNumber(value: number): number {
  if (!Number.isFinite(value)) return value;
  if (Math.abs(value) < 1e-12) return 0;
  return Number(value.toPrecision(12));
}

function pathLabel(path: readonly PathPart[]): string {
  return path.map((part) => typeof part === "number" ? `[${part}]` : part).join(".");
}

function transitionBetween(previous: unknown, current: unknown): Transition {
  const operations: TransitionOperation[] = [];
  const signatureParts: string[] = [];
  let structural = false;

  const visit = (before: unknown, after: unknown, path: PathPart[]) => {
    if (typeof before === "number" && typeof after === "number") {
      const delta = normalizedNumber(after - before);
      if (delta !== 0 || !Object.is(before, after)) {
        operations.push({ kind: "add", path, value: after - before });
        signatureParts.push(`${pathLabel(path)}:+${String(delta)}`);
      }
      return;
    }
    if (before === after) return;
    if (Array.isArray(before) || Array.isArray(after)) {
      if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length) {
        structural = true;
        signatureParts.push(`${pathLabel(path)}:!array-shape`);
        return;
      }
      for (let index = 0; index < before.length; index += 1) visit(before[index], after[index], [...path, index]);
      return;
    }
    const beforeObject = before !== null && typeof before === "object";
    const afterObject = after !== null && typeof after === "object";
    if (beforeObject || afterObject) {
      if (!beforeObject || !afterObject) {
        structural = true;
        signatureParts.push(`${pathLabel(path)}:!object-shape`);
        return;
      }
      const beforeKeys = Object.keys(before as Record<string, unknown>).sort();
      const afterKeys = Object.keys(after as Record<string, unknown>).sort();
      if (beforeKeys.length !== afterKeys.length || beforeKeys.some((key, index) => key !== afterKeys[index])) {
        structural = true;
        signatureParts.push(`${pathLabel(path)}:!object-keys`);
        return;
      }
      for (const key of beforeKeys) {
        visit(
          (before as Record<string, unknown>)[key],
          (after as Record<string, unknown>)[key],
          [...path, key],
        );
      }
      return;
    }
    if ((typeof after === "string" || typeof after === "boolean" || after === null || after === undefined) &&
      (typeof before === "string" || typeof before === "boolean" || before === null || before === undefined)) {
      operations.push({ kind: "set", path, value: after });
      signatureParts.push(`${pathLabel(path)}:=${JSON.stringify(after)}`);
      return;
    }
    structural = true;
    signatureParts.push(`${pathLabel(path)}:!type`);
  };

  visit(previous, current, []);
  return {
    signature: structural ? `!|${signatureParts.join("|")}` : signatureParts.join("|") || "=",
    operations,
    structural,
  };
}

function findPeriod(transitions: readonly Transition[], maximumPeriod: number): number | null {
  const maximum = Math.min(maximumPeriod, Math.floor(transitions.length / 3));
  for (let period = 1; period <= maximum; period += 1) {
    const start = transitions.length - period * 3;
    let matches = true;
    for (let offset = 0; offset < period; offset += 1) {
      const first = transitions[start + offset];
      const second = transitions[start + period + offset];
      const third = transitions[start + period * 2 + offset];
      if (first.structural || second.structural || third.structural ||
        first.signature !== second.signature || second.signature !== third.signature) {
        matches = false;
        break;
      }
    }
    if (matches) return period;
  }
  return null;
}

function applyTransition(target: unknown, transition: Transition): void {
  for (const operation of transition.operations) {
    if (operation.path.length === 0) throw new Error("Root-level hibernation operations are not supported");
    let parent = target as Record<string | number, unknown>;
    for (let index = 0; index < operation.path.length - 1; index += 1) {
      parent = parent[operation.path[index]] as Record<string | number, unknown>;
    }
    const key = operation.path[operation.path.length - 1];
    if (operation.kind === "add") {
      parent[key] = (parent[key] as number) + (operation.value as number);
    } else {
      parent[key] = operation.value;
    }
  }
}

function approximatelyEqual(left: unknown, right: unknown): boolean {
  if (typeof left === "number" && typeof right === "number") {
    if (!Number.isFinite(left) || !Number.isFinite(right)) return Object.is(left, right);
    return Math.abs(left - right) <= 1e-6;
  }
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((value, index) => approximatelyEqual(value, right[index]));
  }
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  const leftKeys = Object.keys(left as Record<string, unknown>).sort();
  const rightKeys = Object.keys(right as Record<string, unknown>).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) =>
    key === rightKeys[index] && approximatelyEqual(
      (left as Record<string, unknown>)[key],
      (right as Record<string, unknown>)[key],
    ));
}

function createTrackers<T extends { id: string }>(records: readonly T[], kind: RecordKind): Map<string, RecordTracker> {
  return new Map(records.map((record) => [record.id, {
    kind,
    previous: cloneValue(record),
    observation: [],
    period: null,
    pattern: [],
    predicted: cloneValue(record),
    wokeAtSecond: null,
    wakeReason: null,
    predictionMatched: false,
  }]));
}

function observeRecords<T extends { id: string }>(trackers: Map<string, RecordTracker>, records: readonly T[]): void {
  const currentIds = new Set(records.map((record) => record.id));
  for (const [id, tracker] of trackers) {
    const current = records.find((record) => record.id === id);
    if (!current || !currentIds.has(id)) {
      tracker.observation.push({ signature: "!missing", operations: [], structural: true });
      continue;
    }
    const snapshot = cloneValue(current);
    tracker.observation.push(transitionBetween(tracker.previous, snapshot));
    tracker.previous = snapshot;
  }
}

function finalizeObservation(trackers: Map<string, RecordTracker>, maximumPeriod: number): void {
  for (const tracker of trackers.values()) {
    tracker.period = findPeriod(tracker.observation, maximumPeriod);
    if (tracker.period === null) continue;
    tracker.pattern = tracker.observation.slice(-tracker.period);
    tracker.predicted = cloneValue(tracker.previous);
  }
}

function validateRecords<T extends { id: string }>(
  trackers: Map<string, RecordTracker>,
  records: readonly T[],
  validationSecond: number,
): number {
  const byId = new Map(records.map((record) => [record.id, record]));
  let replayOperations = 0;
  for (const [id, tracker] of trackers) {
    const current = byId.get(id);
    if (!current || tracker.period === null || tracker.wokeAtSecond !== null) continue;
    const snapshot = cloneValue(current);
    const actual = transitionBetween(tracker.previous, snapshot);
    const expected = tracker.pattern[(validationSecond - 1) % tracker.period];
    if (actual.structural || actual.signature !== expected.signature) {
      tracker.wokeAtSecond = validationSecond;
      tracker.wakeReason = actual.structural ? "structural" : "transition";
      tracker.previous = snapshot;
      continue;
    }
    applyTransition(tracker.predicted, expected);
    replayOperations += expected.operations.length;
    tracker.previous = snapshot;
  }
  return replayOperations;
}

function finishValidation(trackers: Map<string, RecordTracker>): void {
  for (const tracker of trackers.values()) {
    tracker.predictionMatched = tracker.period !== null && tracker.wokeAtSecond === null &&
      approximatelyEqual(tracker.predicted, tracker.previous);
  }
}

function summarizeTrackers(trackers: Map<string, RecordTracker>): AggregateCounts {
  const values = [...trackers.values()];
  return {
    total: values.length,
    observedStable: values.filter((tracker) => tracker.period !== null).length,
    validatedStable: values.filter((tracker) => tracker.predictionMatched).length,
    woke: values.filter((tracker) => tracker.wokeAtSecond !== null).length,
    predictionMismatch: values.filter((tracker) =>
      tracker.period !== null && tracker.wokeAtSecond === null && !tracker.predictionMatched).length,
  };
}

function percentile(values: readonly number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileValue) - 1))];
}

function average(values: readonly number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function groupEntities(
  entities: readonly FactoryEntity[],
  trackers: Map<string, RecordTracker>,
): Record<string, { total: number; observedStable: number; validatedStable: number; activeValidated: number }> {
  const result: Record<string, { total: number; observedStable: number; validatedStable: number; activeValidated: number }> = {};
  for (const entity of entities) {
    const key = entity.kind;
    result[key] ??= { total: 0, observedStable: 0, validatedStable: 0, activeValidated: 0 };
    result[key].total += 1;
    const tracker = trackers.get(entity.id);
    if (tracker?.period !== null) result[key].observedStable += 1;
    if (tracker?.predictionMatched) {
      result[key].validatedStable += 1;
      if (entity.productionRate > 0 || entity.utilization > 0 || (entity.stationRoutes?.length ?? 0) > 0) {
        result[key].activeValidated += 1;
      }
    }
  }
  return result;
}

function stableRatio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function roundReport(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function eligibleOrdinaryMachine(entity: FactoryEntity): boolean {
  return entity.kind === "machine" && entity.recipeId !== "matrix_research" &&
    !SPECIAL_BUILDINGS.has(entity.buildingId ?? "");
}

const saveArgument = readArgument("save");
if (!saveArgument) throw new Error("Usage: vite-node scripts/analyze-factory-hibernation.ts --save=<path> [--observe=60] [--validate=60] [--output=<path>]");
const observationSeconds = readPositiveInteger("observe", 60);
const validationSeconds = readPositiveInteger("validate", 60);
const maximumPeriod = Math.min(20, Math.max(1, Math.floor(observationSeconds / 3)));
const savePath = resolve(saveArgument);
const raw = readFileSync(savePath, "utf8");
const parsed = JSON.parse(raw) as { state?: unknown };
const migrated = migrateGame(parsed.state ?? parsed);
if (!migrated) throw new Error("The save could not be migrated by the current engine");

const originalState = migrated;
const originalHash = hashGameState(originalState);
const simulationState = cloneValue(originalState);
const wasPaused = simulationState.paused;
simulationState.paused = false;
simulationState.timeWarp.pendingSimulationSeconds = 0;
simulationState.timeWarp.pendingWallSeconds = 0;

const initialEntities = cloneValue(simulationState.entities);
const initialBelts = cloneValue(simulationState.belts);
const entityTrackers = createTrackers(simulationState.entities, "entity");
const beltTrackers = createTrackers(simulationState.belts, "belt");
const profiler = createSimulationProfiler();
const session = createSimulationAdvanceSession(simulationState, observationSeconds + validationSeconds, { profiler });
const engineStepDurations: number[] = [];
let shadowAnalysisMs = 0;
let contractReplayMs = 0;
let replayOperations = 0;

for (let second = 1; second <= observationSeconds + validationSeconds; second += 1) {
  const engineStartedAt = performance.now();
  advanceSimulationSession(session, 1);
  engineStepDurations.push(performance.now() - engineStartedAt);

  const analysisStartedAt = performance.now();
  if (second <= observationSeconds) {
    observeRecords(entityTrackers, session.state.entities);
    observeRecords(beltTrackers, session.state.belts);
    if (second === observationSeconds) {
      finalizeObservation(entityTrackers, maximumPeriod);
      finalizeObservation(beltTrackers, maximumPeriod);
    }
  } else {
    const validationSecond = second - observationSeconds;
    const replayStartedAt = performance.now();
    replayOperations += validateRecords(entityTrackers, session.state.entities, validationSecond);
    replayOperations += validateRecords(beltTrackers, session.state.belts, validationSecond);
    contractReplayMs += performance.now() - replayStartedAt;
  }
  shadowAnalysisMs += performance.now() - analysisStartedAt;
}

finishValidation(entityTrackers);
finishValidation(beltTrackers);

const finalEntities = session.state.entities;
const finalBelts = session.state.belts;
const entityCounts = summarizeTrackers(entityTrackers);
const beltCounts = summarizeTrackers(beltTrackers);
const entityGroups = groupEntities(finalEntities, entityTrackers);
const validatedEntityIds = new Set([...entityTrackers].filter(([, tracker]) => tracker.predictionMatched).map(([id]) => id));
const validatedBeltIds = new Set([...beltTrackers].filter(([, tracker]) => tracker.predictionMatched).map(([id]) => id));
const observedEntityIds = new Set([...entityTrackers].filter(([, tracker]) => tracker.period !== null).map(([id]) => id));
const observedBeltIds = new Set([...beltTrackers].filter(([, tracker]) => tracker.period !== null).map(([id]) => id));
const finalEntityById = new Map(finalEntities.map((entity) => [entity.id, entity]));

const ordinaryMachines = finalEntities.filter(eligibleOrdinaryMachine);
const productionEntities = finalEntities.filter((entity) => entity.kind === "machine" || entity.kind === "vein");
const stationEntities = finalEntities.filter((entity) => entity.kind === "station");
const powerEntities = finalEntities.filter((entity) => entity.kind === "power");
const incidentBelts = new Map<string, BeltConnection[]>();
for (const belt of finalBelts) {
  for (const entityId of [belt.source, belt.target]) {
    const list = incidentBelts.get(entityId);
    if (list) list.push(belt);
    else incidentBelts.set(entityId, [belt]);
  }
}
const observedV1Eligible = ordinaryMachines.filter((entity) => observedEntityIds.has(entity.id) &&
  (incidentBelts.get(entity.id) ?? []).every((belt) => observedBeltIds.has(belt.id)));
const validatedV1Eligible = ordinaryMachines.filter((entity) => validatedEntityIds.has(entity.id) &&
  (incidentBelts.get(entity.id) ?? []).every((belt) => validatedBeltIds.has(belt.id)));
const validatedProduction = productionEntities.filter((entity) => validatedEntityIds.has(entity.id));
const validatedStations = stationEntities.filter((entity) => validatedEntityIds.has(entity.id));
const validatedPower = powerEntities.filter((entity) => validatedEntityIds.has(entity.id));

const productionRatio = stableRatio(validatedProduction.length, productionEntities.length);
const beltRatio = stableRatio(validatedBeltIds.size, finalBelts.length);
const stationRatio = stableRatio(validatedStations.length, stationEntities.length);
const powerRatio = stableRatio(validatedPower.length, powerEntities.length);
const engineTotalMs = engineStepDurations.reduce((sum, value) => sum + value, 0);
const estimatedReduction = (factors: { production: number; belts: number; logistics: number; power: number }) => {
  const savedMs = profiler.productionMs * productionRatio * factors.production +
    profiler.beltsMs * beltRatio * factors.belts +
    profiler.logisticsMs * stationRatio * factors.logistics +
    profiler.powerMs * powerRatio * factors.power;
  return Math.max(0, Math.min(0.95, savedMs / Math.max(1, engineTotalMs)));
};
const conservativeReduction = estimatedReduction({ production: 0.7, belts: 0.7, logistics: 0.45, power: 0.35 });
const optimisticReduction = estimatedReduction({ production: 0.9, belts: 0.9, logistics: 0.8, power: 0.65 });

const result = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  fixture: {
    bytes: statSync(savePath).size,
    stateVersion: originalState.version,
    entityCount: initialEntities.length,
    beltCount: initialBelts.length,
    stationCount: initialEntities.filter((entity) => entity.kind === "station").length,
    wasPaused,
    originalStateUnchanged: hashGameState(originalState) === originalHash,
  },
  experiment: {
    observationSeconds,
    validationSeconds,
    maximumDetectedPeriodSeconds: maximumPeriod,
    exactSimulationSeconds: observationSeconds + validationSeconds,
  },
  baseline: {
    totalEngineMs: roundReport(engineTotalMs),
    meanStepMs: roundReport(average(engineStepDurations)),
    medianStepMs: roundReport(percentile(engineStepDurations, 0.5)),
    p95StepMs: roundReport(percentile(engineStepDurations, 0.95)),
    maxStepMs: roundReport(Math.max(...engineStepDurations)),
    profiler: Object.fromEntries(Object.entries(profiler).map(([key, value]) => [key, roundReport(value)])),
  },
  shadowOverhead: {
    genericAnalysisMs: roundReport(shadowAnalysisMs),
    contractReplayMs: roundReport(contractReplayMs),
    replayOperations,
    note: "Generic JSON-tree analysis is a benchmark tool, not the intended runtime guard implementation.",
  },
  stability: {
    entities: entityCounts,
    belts: beltCounts,
    entityGroups,
    observedV1EligibleMachines: observedV1Eligible.length,
    validatedV1EligibleMachines: validatedV1Eligible.length,
    validatedStableActiveEntities: finalEntities.filter((entity) => validatedEntityIds.has(entity.id) &&
      (entity.productionRate > 0 || entity.utilization > 0 || (entity.stationRoutes?.length ?? 0) > 0)).length,
    observedWakeRate: roundReport(stableRatio(entityCounts.woke, entityCounts.observedStable), 6),
    beltWakeRate: roundReport(stableRatio(beltCounts.woke, beltCounts.observedStable), 6),
    periodDistribution: [...entityTrackers.values()].filter((tracker) => tracker.period !== null).reduce<Record<string, number>>((counts, tracker) => {
      const key = String(tracker.period);
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {}),
  },
  projectedRuntime: {
    productionCoverage: roundReport(productionRatio, 6),
    beltCoverage: roundReport(beltRatio, 6),
    stationCoverage: roundReport(stationRatio, 6),
    powerCoverage: roundReport(powerRatio, 6),
    conservativeTimeReduction: roundReport(conservativeReduction, 6),
    optimisticTimeReduction: roundReport(optimisticReduction, 6),
    conservativeMeanStepMs: roundReport(average(engineStepDurations) * (1 - conservativeReduction)),
    optimisticMeanStepMs: roundReport(average(engineStepDurations) * (1 - optimisticReduction)),
    caveat: "Projected from measured subsystem time and validated coverage; no approximate state was committed.",
  },
  privacy: {
    savePathIncluded: false,
    entityIdsIncluded: false,
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
