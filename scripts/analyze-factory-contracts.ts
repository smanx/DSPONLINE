import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import {
  advanceSimulationSession,
  completeSimulationAdvanceSession,
  createSimulationAdvanceSession,
  createSimulationProfiler,
  type SimulationContractExperiment,
  type SimulationProfiler,
} from "../src/game/engine";
import { hashGameState } from "../src/game/benchmark";
import { migrateGame } from "../src/game/storage";
import type { BeltConnection, FactoryEntity, GameState, ItemId, PlanetId } from "../src/game/types";

type PathPart = string | number;
type ContractPhase = "input" | "production" | "output";

interface TransitionOperation {
  kind: "add" | "set";
  path: PathPart[];
  value: number | string | boolean | null | undefined;
  digits?: number;
}

interface PhaseTransition {
  signature: string;
  operations: TransitionOperation[];
  structural: boolean;
  produced: Partial<Record<ItemId, number>>;
}

interface StepTransition {
  signature: string;
  structural: boolean;
  input: PhaseTransition;
  production: PhaseTransition;
  output: PhaseTransition;
}

interface ProductionComponent {
  key: number;
  planetId: PlanetId;
  entityIds: string[];
  beltIds: string[];
  productionEntityIds: string[];
}

interface ComponentTracker {
  component: ProductionComponent;
  observation: StepTransition[];
  period: number | null;
  pattern: StepTransition[];
  wokeAtSecond: number | null;
}

interface PlanetTracker {
  planetId: PlanetId;
  previous: unknown;
  observation: PhaseTransition[];
  period: number | null;
  pattern: PhaseTransition[];
  wokeAtSecond: number | null;
}

interface PhaseSnapshots {
  input?: unknown;
  production?: unknown;
  output?: unknown;
}

interface PhaseResults {
  input?: PhaseTransition;
  production?: PhaseTransition;
  output?: PhaseTransition;
}

interface TimedRun {
  state: GameState;
  durations: number[];
  totalMs: number;
  profiler: SimulationProfiler;
  replayMs: number;
  replayOperations: number;
}

const EMPTY_PHASE: PhaseTransition = {
  signature: "=",
  operations: [],
  structural: false,
  produced: {},
};

const GLOBAL_MACHINE_BUILDINGS = new Set([
  "construction_center",
  "time_warp_device",
  "micro_black_hole_connector",
  "galactic_material_exporter",
  "em_rail_ejector",
  "vertical_launching_silo",
  "ray_receiver",
]);

const GLOBAL_RECIPE_IDS = new Set([
  "matrix_research",
  "solar_sail_launch",
  "carrier_rocket_launch",
]);

function readArgument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function readPositiveInteger(name: string, fallback: number): number {
  const value = Number(readArgument(name));
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function roundReport(value: number, digits = 3): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function normalizedNumber(value: number): number {
  if (!Number.isFinite(value)) return value;
  if (Math.abs(value) < 1e-12) return 0;
  return Number(value.toPrecision(12));
}

function decimalDigits(value: number): number {
  if (!Number.isFinite(value) || Number.isInteger(value)) return 0;
  for (let digits = 1; digits <= 12; digits += 1) {
    const scale = 10 ** digits;
    if (Math.abs(Math.round(value * scale) / scale - value) <= 1e-12) return digits;
  }
  return 12;
}

function roundToDigits(value: number, digits: number): number {
  if (!Number.isFinite(value) || digits <= 0) return digits <= 0 ? Math.round(value) : value;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function pathLabel(path: readonly PathPart[]): string {
  return path.map((part) => typeof part === "number" ? `[${part}]` : part).join(".");
}

function transitionBetween(previous: unknown, current: unknown): PhaseTransition {
  const operations: TransitionOperation[] = [];
  const signatureParts: string[] = [];
  let structural = false;

  const visit = (before: unknown, after: unknown, path: PathPart[]) => {
    if (typeof before === "number" && typeof after === "number") {
      const delta = normalizedNumber(after - before);
      if (delta !== 0 || !Object.is(before, after)) {
        operations.push({
          kind: "add",
          path,
          value: after - before,
          digits: Math.max(decimalDigits(before), decimalDigits(after)),
        });
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
    produced: {},
  };
}

function combineStep(results: PhaseResults): StepTransition {
  const input = results.input ?? EMPTY_PHASE;
  const production = results.production ?? EMPTY_PHASE;
  const output = results.output ?? EMPTY_PHASE;
  const producedSignature = Object.entries(production.produced)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([itemId, amount]) => `${itemId}:${normalizedNumber(amount ?? 0)}`)
    .join(",") || "=";
  return {
    signature: `${input.signature}~${production.signature}~${output.signature}~${producedSignature}`,
    structural: input.structural || production.structural || output.structural,
    input,
    production,
    output,
  };
}

function findPeriod<T extends { signature: string; structural: boolean }>(transitions: readonly T[], maximumPeriod: number): number | null {
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

function findContractPeriod<T extends { signature: string; structural: boolean }>(
  transitions: readonly T[],
  maximumPeriod: number,
): number | null {
  const repeatedPeriod = findPeriod(transitions, maximumPeriod);
  if (repeatedPeriod !== null) return repeatedPeriod;
  // A stable factory can have a transport cycle longer than 20 seconds. Keep
  // the complete 60-second deterministic trace and prove it against the next
  // window instead of rejecting the line merely because the short cycle is
  // not visible three times during observation.
  return transitions.length > 0 && transitions.every((transition) => !transition.structural)
    ? transitions.length
    : null;
}

function percentile(values: readonly number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileValue) - 1))];
}

function average(values: readonly number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function isContractProductionEntity(entity: FactoryEntity): boolean {
  if (entity.kind === "vein") return entity.minerCount > 0 && Boolean(entity.resourceId);
  return entity.kind === "machine" && Boolean(entity.recipeId) && Boolean(entity.buildingId) &&
    !GLOBAL_MACHINE_BUILDINGS.has(entity.buildingId!) && !GLOBAL_RECIPE_IDS.has(entity.recipeId!);
}

function isAllowedComponentEntity(entity: FactoryEntity): boolean {
  return entity.kind === "vein" ? Boolean(entity.resourceId) : Boolean(entity.buildingId);
}

function buildProductionComponents(state: GameState): ProductionComponent[] {
  const entityById = new Map(state.entities.map((entity) => [entity.id, entity]));
  const parent = new Map<string, string>();
  const ensure = (entityId: string) => {
    if (!parent.has(entityId)) parent.set(entityId, entityId);
  };
  const find = (entityId: string): string => {
    ensure(entityId);
    const current = parent.get(entityId)!;
    if (current === entityId) return entityId;
    const root = find(current);
    parent.set(entityId, root);
    return root;
  };
  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };

  for (const belt of state.belts) {
    const source = entityById.get(belt.source);
    const target = entityById.get(belt.target);
    if (!source || !target) continue;
    if (source.kind !== "station") ensure(source.id);
    if (target.kind !== "station") ensure(target.id);
    if (source.kind !== "station" && target.kind !== "station") union(source.id, target.id);
  }

  // A station is a contract boundary, not a graph bridge. Only lines that
  // compete for the same station item and direction are joined together.
  const boundaryOwners = new Map<string, string>();
  for (const belt of state.belts) {
    const source = entityById.get(belt.source);
    const target = entityById.get(belt.target);
    if (!source || !target) continue;
    let boundaryKey: string | null = null;
    let internalId: string | null = null;
    if (source.kind === "station" && target.kind !== "station") {
      boundaryKey = `out|${source.id}|${belt.itemId}`;
      internalId = target.id;
    } else if (target.kind === "station" && source.kind !== "station") {
      boundaryKey = `in|${target.id}|${belt.itemId}`;
      internalId = source.id;
    }
    if (!boundaryKey || !internalId) continue;
    const owner = boundaryOwners.get(boundaryKey);
    if (owner) union(owner, internalId);
    else boundaryOwners.set(boundaryKey, internalId);
  }

  const internalGroups = new Map<string, Set<string>>();
  for (const entityId of parent.keys()) {
    const root = find(entityId);
    const group = internalGroups.get(root);
    if (group) group.add(entityId);
    else internalGroups.set(root, new Set([entityId]));
  }

  const result: ProductionComponent[] = [];
  let key = 0;
  for (const internalIds of internalGroups.values()) {
    const internalEntities = [...internalIds].map((entityId) => entityById.get(entityId))
      .filter((entity): entity is FactoryEntity => Boolean(entity));
    if (internalEntities.length !== internalIds.size || internalEntities.length === 0 ||
      internalEntities.some((entity) => !isAllowedComponentEntity(entity))) continue;
    const planetId = internalEntities[0].planetId;
    if (internalEntities.some((entity) => entity.planetId !== planetId)) continue;
    const belts = state.belts.filter((belt) => internalIds.has(belt.source) || internalIds.has(belt.target));
    if (belts.length === 0 || belts.some((belt) => belt.planetId !== planetId)) continue;
    const boundaryIds = new Set<string>();
    for (const belt of belts) {
      if (!internalIds.has(belt.source)) boundaryIds.add(belt.source);
      if (!internalIds.has(belt.target)) boundaryIds.add(belt.target);
    }
    const boundaryEntities = [...boundaryIds].map((entityId) => entityById.get(entityId))
      .filter((entity): entity is FactoryEntity => Boolean(entity));
    if (boundaryEntities.length !== boundaryIds.size || boundaryEntities.some((entity) =>
      entity.kind !== "station" || entity.planetId !== planetId)) continue;
    const productionEntityIds = internalEntities.filter(isContractProductionEntity).map((entity) => entity.id);
    result.push({
      key: key++,
      planetId,
      entityIds: [...internalIds, ...boundaryIds],
      beltIds: belts.map((belt) => belt.id),
      productionEntityIds,
    });
  }
  return result;
}

function strictWholePlanetCandidate(state: GameState, planetId: PlanetId): boolean {
  const entities = state.entities.filter((entity) => entity.planetId === planetId);
  if (entities.length === 0 || entities.some((entity) => entity.kind === "station" || entity.kind === "power")) return false;
  return entities.every(isAllowedComponentEntity) && entities.every((entity) =>
    !GLOBAL_MACHINE_BUILDINGS.has(entity.buildingId ?? "") && !GLOBAL_RECIPE_IDS.has(entity.recipeId ?? ""));
}

function snapshotComponent(
  state: GameState,
  component: ProductionComponent,
  phase: ContractPhase,
): { entities: Record<string, FactoryEntity>; belts: Record<string, BeltConnection> } {
  const entityIds = phase === "production" ? component.productionEntityIds : component.entityIds;
  const requestedEntities = new Set(entityIds);
  const requestedBelts = phase === "production" ? new Set<string>() : new Set(component.beltIds);
  return {
    entities: Object.fromEntries(state.entities.filter((entity) => requestedEntities.has(entity.id))
      .map((entity) => [entity.id, structuredClone(entity)])),
    belts: Object.fromEntries(state.belts.filter((belt) => requestedBelts.has(belt.id))
      .map((belt) => [belt.id, structuredClone(belt)])),
  };
}

function producedDuringPhase(
  before: { entities: Record<string, FactoryEntity> },
  after: { entities: Record<string, FactoryEntity> },
): Partial<Record<ItemId, number>> {
  const produced: Partial<Record<ItemId, number>> = {};
  for (const [entityId, beforeEntity] of Object.entries(before.entities)) {
    const afterEntity = after.entities[entityId];
    if (!afterEntity) continue;
    const itemIds = new Set([...Object.keys(beforeEntity.outputs), ...Object.keys(afterEntity.outputs)] as ItemId[]);
    for (const itemId of itemIds) {
      const delta = Math.floor((afterEntity.outputs[itemId] ?? 0) - (beforeEntity.outputs[itemId] ?? 0));
      if (delta > 0) produced[itemId] = Math.floor((produced[itemId] ?? 0) + delta);
    }
  }
  return produced;
}

class ComponentPhaseCollector {
  readonly hooks: SimulationContractExperiment;
  private readonly snapshots = new Map<number, PhaseSnapshots>();
  private readonly results = new Map<number, PhaseResults>();
  private readonly byPlanet = new Map<PlanetId, ProductionComponent[]>();

  constructor(private readonly components: ProductionComponent[]) {
    for (const component of components) {
      const current = this.byPlanet.get(component.planetId);
      if (current) current.push(component);
      else this.byPlanet.set(component.planetId, [component]);
    }
    this.hooks = {
      beforeInputBelts: (state) => this.captureBefore(state, this.components, "input"),
      afterInputBelts: (state) => this.captureAfter(state, this.components, "input"),
      beforePlanetProduction: (state, planetId) => this.captureBefore(state, this.byPlanet.get(planetId) ?? [], "production"),
      afterPlanetProduction: (state, planetId) => this.captureAfter(state, this.byPlanet.get(planetId) ?? [], "production"),
      beforeOutputBelts: (state) => this.captureBefore(state, this.components, "output"),
      afterOutputBelts: (state) => this.captureAfter(state, this.components, "output"),
    };
  }

  private captureBefore(state: GameState, components: readonly ProductionComponent[], phase: ContractPhase): void {
    for (const component of components) {
      const phases = this.snapshots.get(component.key) ?? {};
      phases[phase] = snapshotComponent(state, component, phase);
      this.snapshots.set(component.key, phases);
    }
  }

  private captureAfter(state: GameState, components: readonly ProductionComponent[], phase: ContractPhase): void {
    for (const component of components) {
      const before = this.snapshots.get(component.key)?.[phase] as ReturnType<typeof snapshotComponent> | undefined;
      if (!before) throw new Error(`Missing ${phase} contract snapshot`);
      const after = snapshotComponent(state, component, phase);
      const transition = transitionBetween(before, after);
      if (phase === "production") transition.produced = producedDuringPhase(before, after);
      const phases = this.results.get(component.key) ?? {};
      phases[phase] = transition;
      this.results.set(component.key, phases);
    }
  }

  finishStep(): Map<number, StepTransition> {
    const completed = new Map<number, StepTransition>();
    for (const component of this.components) completed.set(component.key, combineStep(this.results.get(component.key) ?? {}));
    this.snapshots.clear();
    this.results.clear();
    return completed;
  }
}

function snapshotPlanet(state: GameState, planetId: PlanetId): unknown {
  return {
    entities: state.entities.filter((entity) => entity.planetId === planetId),
    belts: state.belts.filter((belt) => belt.planetId === planetId),
    tray: planetId === state.activePlanetId ? state.tray : state.planetTrays[planetId],
    metrics: state.planetMetrics[planetId],
    grids: state.powerGridMetrics[planetId],
  };
}

function createPlanetTrackers(state: GameState): PlanetTracker[] {
  const planetIds = [...new Set(state.entities.map((entity) => entity.planetId))];
  return planetIds.filter((planetId) => strictWholePlanetCandidate(state, planetId)).map((planetId) => ({
    planetId,
    previous: structuredClone(snapshotPlanet(state, planetId)),
    observation: [],
    period: null,
    pattern: [],
    wokeAtSecond: null,
  }));
}

function observePlanets(state: GameState, trackers: PlanetTracker[]): void {
  for (const tracker of trackers) {
    const current = structuredClone(snapshotPlanet(state, tracker.planetId));
    tracker.observation.push(transitionBetween(tracker.previous, current));
    tracker.previous = current;
  }
}

function validatePlanets(state: GameState, trackers: PlanetTracker[], validationSecond: number): void {
  for (const tracker of trackers) {
    const current = structuredClone(snapshotPlanet(state, tracker.planetId));
    const transition = transitionBetween(tracker.previous, current);
    if (tracker.period !== null && tracker.wokeAtSecond === null) {
      const expected = tracker.pattern[(validationSecond - 1) % tracker.period];
      if (transition.structural || transition.signature !== expected.signature) tracker.wokeAtSecond = validationSecond;
    }
    tracker.previous = current;
  }
}

function finalizeTrackers(componentTrackers: ComponentTracker[], planetTrackers: PlanetTracker[], maximumPeriod: number): void {
  for (const tracker of componentTrackers) {
    tracker.period = findContractPeriod(tracker.observation, maximumPeriod);
    tracker.pattern = tracker.period === null ? [] : tracker.observation.slice(-tracker.period);
  }
  for (const tracker of planetTrackers) {
    tracker.period = findContractPeriod(tracker.observation, maximumPeriod);
    tracker.pattern = tracker.period === null ? [] : tracker.observation.slice(-tracker.period);
  }
}

function liveContractView(state: GameState): { entities: Record<string, FactoryEntity>; belts: Record<string, BeltConnection> } {
  return {
    entities: Object.fromEntries(state.entities.map((entity) => [entity.id, entity])),
    belts: Object.fromEntries(state.belts.map((belt) => [belt.id, belt])),
  };
}

function applyTransition(target: unknown, transition: PhaseTransition): number {
  let applied = 0;
  for (const operation of transition.operations) {
    if (operation.path.length === 0) throw new Error("Root-level contract operations are not supported");
    let parent = target as Record<string | number, unknown>;
    for (let index = 0; index < operation.path.length - 1; index += 1) {
      parent = parent[operation.path[index]] as Record<string | number, unknown>;
    }
    const key = operation.path[operation.path.length - 1];
    if (operation.kind === "add") {
      const next = (parent[key] as number) + (operation.value as number);
      parent[key] = roundToDigits(next, operation.digits ?? 12);
    } else {
      parent[key] = operation.value;
    }
    applied += 1;
  }
  return applied;
}

class ContractReplayer {
  readonly hooks: SimulationContractExperiment;
  readonly skippedBeltIds: ReadonlySet<string>;
  readonly skippedProductionEntityIds: ReadonlySet<string>;
  replayMs = 0;
  replayOperations = 0;
  private stepIndex = 0;
  private readonly view: ReturnType<typeof liveContractView>;
  private readonly byPlanet = new Map<PlanetId, ComponentTracker[]>();

  constructor(private readonly state: GameState, private readonly trackers: ComponentTracker[]) {
    this.view = liveContractView(state);
    this.skippedBeltIds = new Set(trackers.flatMap((tracker) => tracker.component.beltIds));
    this.skippedProductionEntityIds = new Set(trackers.flatMap((tracker) => tracker.component.productionEntityIds));
    for (const tracker of trackers) {
      const current = this.byPlanet.get(tracker.component.planetId);
      if (current) current.push(tracker);
      else this.byPlanet.set(tracker.component.planetId, [tracker]);
    }
    this.hooks = {
      skippedBeltIds: this.skippedBeltIds,
      skippedProductionEntityIds: this.skippedProductionEntityIds,
      afterInputBelts: () => this.replay(this.trackers, "input"),
      afterPlanetProduction: (_state, planetId) => this.replay(this.byPlanet.get(planetId) ?? [], "production"),
      afterOutputBelts: () => this.replay(this.trackers, "output"),
    };
  }

  setStepIndex(index: number): void {
    this.stepIndex = index;
  }

  private replay(trackers: readonly ComponentTracker[], phase: ContractPhase): void {
    const startedAt = performance.now();
    for (const tracker of trackers) {
      const transition = tracker.pattern[this.stepIndex % tracker.pattern.length][phase];
      this.replayOperations += applyTransition(this.view, transition);
      if (phase === "production") {
        for (const [itemId, amount] of Object.entries(transition.produced) as Array<[ItemId, number]>) {
          this.state.totalProduced[itemId] = Math.floor((this.state.totalProduced[itemId] ?? 0) + amount);
          this.replayOperations += 1;
        }
      }
    }
    this.replayMs += performance.now() - startedAt;
  }
}

function runTimed(
  source: GameState,
  seconds: number,
  selectedTrackers: ComponentTracker[] = [],
): TimedRun {
  const state = structuredClone(source);
  const profiler = createSimulationProfiler();
  const replayer = selectedTrackers.length > 0 ? new ContractReplayer(state, selectedTrackers) : null;
  const session = createSimulationAdvanceSession(state, seconds, {
    mutateState: true,
    profiler,
    contractExperiment: replayer?.hooks,
  });
  const durations: number[] = [];
  for (let second = 0; second < seconds; second += 1) {
    replayer?.setStepIndex(second);
    const startedAt = performance.now();
    advanceSimulationSession(session, 1);
    durations.push(performance.now() - startedAt);
  }
  const completed = completeSimulationAdvanceSession(session);
  return {
    state: completed,
    durations,
    totalMs: durations.reduce((sum, value) => sum + value, 0),
    profiler,
    replayMs: replayer?.replayMs ?? 0,
    replayOperations: replayer?.replayOperations ?? 0,
  };
}

function profileSummary(run: TimedRun) {
  return {
    totalMs: roundReport(run.totalMs),
    meanStepMs: roundReport(average(run.durations)),
    medianStepMs: roundReport(percentile(run.durations, 0.5)),
    p95StepMs: roundReport(percentile(run.durations, 0.95)),
    maxStepMs: roundReport(Math.max(...run.durations)),
    productionMs: roundReport(run.profiler.productionMs),
    beltsMs: roundReport(run.profiler.beltsMs),
    logisticsMs: roundReport(run.profiler.logisticsMs),
    powerMs: roundReport(run.profiler.powerMs),
    dispatchMs: roundReport(run.profiler.dispatchMs),
    replayMs: roundReport(run.replayMs),
    replayOperations: run.replayOperations,
  };
}

function stateDifferenceSummary(expected: GameState, actual: GameState) {
  const expectedEntities = new Map(expected.entities.map((entity) => [entity.id, entity]));
  const expectedBelts = new Map(expected.belts.map((belt) => [belt.id, belt]));
  let changedEntities = 0;
  let changedBelts = 0;
  for (const entity of actual.entities) {
    if (JSON.stringify(entity) !== JSON.stringify(expectedEntities.get(entity.id))) changedEntities += 1;
  }
  for (const belt of actual.belts) {
    if (JSON.stringify(belt) !== JSON.stringify(expectedBelts.get(belt.id))) changedBelts += 1;
  }
  const expectedWithoutFactory = { ...expected, entities: [], belts: [] };
  const actualWithoutFactory = { ...actual, entities: [], belts: [] };
  const globalTransition = transitionBetween(expectedWithoutFactory, actualWithoutFactory);
  const globalRoots = [...new Set(globalTransition.operations.map((operation) => String(operation.path[0] ?? "root")))].sort();
  return {
    changedEntities,
    changedBelts,
    changedGlobalRootCount: globalRoots.length,
    changedGlobalRoots: globalRoots,
    structuralGlobalDifference: globalTransition.structural,
  };
}

const saveArgument = readArgument("save");
if (!saveArgument) {
  throw new Error("Usage: vite-node scripts/analyze-factory-contracts.ts --save=<path> [--observe=60] [--validate=300] [--output=<path>]");
}
const observationSeconds = readPositiveInteger("observe", 60);
const validationSeconds = readPositiveInteger("validate", 300);
const maximumPeriod = Math.min(20, Math.max(1, Math.floor(observationSeconds / 3)));
const savePath = resolve(saveArgument);
const raw = readFileSync(savePath, "utf8");
const parsed = JSON.parse(raw) as { state?: unknown };
const migrated = migrateGame(parsed.state ?? parsed);
if (!migrated) throw new Error("The save could not be migrated by the current engine");

const originalState = migrated;
const originalHash = hashGameState(originalState);
const observationState = structuredClone(originalState);
observationState.paused = false;
observationState.timeWarp.pendingSimulationSeconds = 0;
observationState.timeWarp.pendingWallSeconds = 0;

const components = buildProductionComponents(observationState);
const componentTrackers: ComponentTracker[] = components.map((component) => ({
  component,
  observation: [],
  period: null,
  pattern: [],
  wokeAtSecond: null,
}));
const trackerByKey = new Map(componentTrackers.map((tracker) => [tracker.component.key, tracker]));
const planetTrackers = createPlanetTrackers(observationState);
const observationCollector = new ComponentPhaseCollector(components);
const observationSession = createSimulationAdvanceSession(observationState, observationSeconds, {
  mutateState: true,
  contractExperiment: observationCollector.hooks,
});

for (let second = 1; second <= observationSeconds; second += 1) {
  advanceSimulationSession(observationSession, 1);
  for (const [key, transition] of observationCollector.finishStep()) trackerByKey.get(key)!.observation.push(transition);
  observePlanets(observationSession.state, planetTrackers);
}
const contractStartState = structuredClone(observationSession.state);
finalizeTrackers(componentTrackers, planetTrackers, maximumPeriod);

const observedTrackers = componentTrackers.filter((tracker) => tracker.period !== null);
const validationCollector = new ComponentPhaseCollector(observedTrackers.map((tracker) => tracker.component));
const validationState = structuredClone(contractStartState);
const validationSession = createSimulationAdvanceSession(validationState, validationSeconds, {
  mutateState: true,
  contractExperiment: validationCollector.hooks,
});
const observedByKey = new Map(observedTrackers.map((tracker) => [tracker.component.key, tracker]));
for (let second = 1; second <= validationSeconds; second += 1) {
  advanceSimulationSession(validationSession, 1);
  for (const [key, transition] of validationCollector.finishStep()) {
    const tracker = observedByKey.get(key)!;
    if (tracker.wokeAtSecond !== null) continue;
    const expected = tracker.pattern[(second - 1) % tracker.period!];
    if (transition.structural || transition.signature !== expected.signature) tracker.wokeAtSecond = second;
  }
  validatePlanets(validationSession.state, planetTrackers.filter((tracker) => tracker.period !== null), second);
}

const validatedTrackers = observedTrackers.filter((tracker) => tracker.wokeAtSecond === null);
const baselineRun = runTimed(contractStartState, validationSeconds);
let optimizedRun = runTimed(contractStartState, validationSeconds, validatedTrackers);
let hashesMatch = hashGameState(baselineRun.state) === hashGameState(optimizedRun.state);
let selectedTrackers = validatedTrackers;
let fallbackTier: "none" | "period-one" | "disabled" = "none";
if (!hashesMatch) {
  const periodOne = validatedTrackers.filter((tracker) => tracker.period === 1);
  optimizedRun = runTimed(contractStartState, validationSeconds, periodOne);
  hashesMatch = hashGameState(baselineRun.state) === hashGameState(optimizedRun.state);
  selectedTrackers = periodOne;
  fallbackTier = "period-one";
}
if (!hashesMatch) {
  optimizedRun = runTimed(contractStartState, validationSeconds);
  selectedTrackers = [];
  fallbackTier = "disabled";
}

const selectedBeltIds = new Set(selectedTrackers.flatMap((tracker) => tracker.component.beltIds));
const selectedProductionIds = new Set(selectedTrackers.flatMap((tracker) => tracker.component.productionEntityIds));
const contractableProductionIds = new Set(components.flatMap((component) => component.productionEntityIds));
const componentBeltIds = new Set(components.flatMap((component) => component.beltIds));
const populatedPlanetIds = [...new Set(originalState.entities.map((entity) => entity.planetId))];
const boundaryAwareFullPlanets = populatedPlanetIds.filter((planetId) => {
  const planetProductionIds = originalState.entities.filter((entity) => entity.planetId === planetId && isContractProductionEntity(entity)).map((entity) => entity.id);
  const planetBeltIds = originalState.belts.filter((belt) => belt.planetId === planetId).map((belt) => belt.id);
  return planetProductionIds.length > 0 && planetBeltIds.length > 0 &&
    planetProductionIds.every((entityId) => selectedProductionIds.has(entityId)) &&
    planetBeltIds.every((beltId) => selectedBeltIds.has(beltId));
}).length;

const baselineSummary = profileSummary(baselineRun);
const optimizedSummary = profileSummary(optimizedRun);
const timeReduction = baselineRun.totalMs > 0 ? 1 - optimizedRun.totalMs / baselineRun.totalMs : 0;
const throughputGain = optimizedRun.totalMs > 0 ? baselineRun.totalMs / optimizedRun.totalMs - 1 : 0;
const finalHashesMatch = hashGameState(baselineRun.state) === hashGameState(optimizedRun.state);

const result = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  fixture: {
    bytes: statSync(savePath).size,
    stateVersion: originalState.version,
    entityCount: originalState.entities.length,
    beltCount: originalState.belts.length,
    stationCount: originalState.entities.filter((entity) => entity.kind === "station").length,
    activeRouteCount: originalState.entities.reduce((sum, entity) => sum + (entity.stationRoutes?.length ?? 0), 0),
    populatedPlanetCount: populatedPlanetIds.length,
    originalStateUnchanged: hashGameState(originalState) === originalHash,
  },
  experiment: {
    observationSeconds,
    validationSeconds,
    maximumDetectedPeriodSeconds: maximumPeriod,
    contractModel: "belt-connected closed line with station boundaries",
  },
  contracts: {
    topologyCandidates: components.length,
    observedStable: observedTrackers.length,
    validatedStable: validatedTrackers.length,
    wokeDuringValidation: observedTrackers.length - validatedTrackers.length,
    selectedForBenchmark: selectedTrackers.length,
    fallbackTier,
    selectedProductionEntities: selectedProductionIds.size,
    selectedBelts: selectedBeltIds.size,
    contractableProductionEntities: contractableProductionIds.size,
    componentBelts: componentBeltIds.size,
    productionCoverageOfAllEntities: roundReport(selectedProductionIds.size / Math.max(1, originalState.entities.length), 6),
    productionCoverageOfContractable: roundReport(selectedProductionIds.size / Math.max(1, contractableProductionIds.size), 6),
    beltCoverageOfAllBelts: roundReport(selectedBeltIds.size / Math.max(1, originalState.belts.length), 6),
    wakeRate: roundReport((observedTrackers.length - validatedTrackers.length) / Math.max(1, observedTrackers.length), 6),
    periodDistribution: selectedTrackers.reduce<Record<string, number>>((counts, tracker) => {
      const key = String(tracker.period);
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {}),
  },
  planets: {
    strictWholePlanetCandidates: planetTrackers.length,
    strictObservedStable: planetTrackers.filter((tracker) => tracker.period !== null).length,
    strictValidatedStable: planetTrackers.filter((tracker) => tracker.period !== null && tracker.wokeAtSecond === null).length,
    boundaryAwareFullyContracted: boundaryAwareFullPlanets,
  },
  benchmark: {
    baseline: baselineSummary,
    optimized: optimizedSummary,
    stateHashesMatch: finalHashesMatch,
    timeReduction: roundReport(timeReduction, 6),
    throughputGain: roundReport(throughputGain, 6),
    difference: finalHashesMatch ? null : stateDifferenceSummary(baselineRun.state, optimizedRun.state),
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
