import type { BeltConnection, FactoryEntity, GameState, PlanetId } from "./types";

/** Versioned, UI-only projection carried alongside the authoritative state. */
export interface SimulationProjection {
  protocolVersion: 2;
  elapsedSeconds: number;
  activePlanetId: PlanetId;
  /** Current-planet records only. They are a UI projection, never persisted. */
  changedEntityIds: string[];
  changedBeltIds: string[];
  changedEntities: FactoryEntity[];
  changedBelts: BeltConnection[];
  removedEntityIds: string[];
  removedBeltIds: string[];
  topologyChangedEntityIds: string[];
  topologyChangedBeltIds: string[];
  /** A planet switch cannot be represented by an incremental render merge. */
  requiresFullSnapshot: boolean;
  entityCount: number;
  beltCount: number;
  inFlightRouteCount: number;
  totalProduced: number;
}

export interface SimulationProjectionBaseline {
  kind: "simulation-projection-baseline";
  activePlanetId: PlanetId;
  entitySignatures: ReadonlyMap<string, string>;
  beltSignatures: ReadonlyMap<string, string>;
  entityTopologySignatures: ReadonlyMap<string, string>;
  beltTopologySignatures: ReadonlyMap<string, string>;
}

function isSimulationProjectionBaseline(value: GameState | SimulationProjectionBaseline): value is SimulationProjectionBaseline {
  return "kind" in value && value.kind === "simulation-projection-baseline";
}

function entityTopologySignature(entity: FactoryEntity): string {
  return [entity.planetId, entity.kind, entity.buildingId ?? "", entity.resourceId ?? "", entity.position.x, entity.position.y].join("|");
}

function beltTopologySignature(belt: BeltConnection): string {
  return [
    belt.planetId,
    belt.source,
    belt.target,
    belt.itemId,
    belt.tier,
    belt.lanes,
    belt.stackSize ?? 1,
    belt.priority,
    belt.targetPortIndex ?? "",
    belt.routeMode ?? "auto",
    belt.routeOffsetY ?? 0,
  ].join("|");
}

function entitySignature(entity: GameState["entities"][number]): string {
  return JSON.stringify(entity);
}

function beltSignature(belt: GameState["belts"][number]): string {
  return JSON.stringify(belt);
}

export function captureSimulationProjectionBaseline(state: GameState): SimulationProjectionBaseline {
  const entities = state.entities.filter((entity) => entity.planetId === state.activePlanetId);
  const belts = state.belts.filter((belt) => belt.planetId === state.activePlanetId);
  return {
    kind: "simulation-projection-baseline",
    activePlanetId: state.activePlanetId,
    entitySignatures: new Map(entities.map((entity) => [entity.id, entitySignature(entity)])),
    beltSignatures: new Map(belts.map((belt) => [belt.id, beltSignature(belt)])),
    entityTopologySignatures: new Map(entities.map((entity) => [entity.id, entityTopologySignature(entity)])),
    beltTopologySignatures: new Map(belts.map((belt) => [belt.id, beltTopologySignature(belt)])),
  };
}

export function createSimulationProjection(previous: GameState | SimulationProjectionBaseline | null, current: GameState): SimulationProjection {
  // Projection work is bounded by the visible planet. Other planets remain in
  // the authoritative state and are rebuilt once if the player switches to them.
  const baseline = previous ? isSimulationProjectionBaseline(previous) ? previous : captureSimulationProjectionBaseline(previous) : null;
  const previousEntities = baseline?.entitySignatures ?? new Map<string, string>();
  const previousBelts = baseline?.beltSignatures ?? new Map<string, string>();
  const currentPlanetEntities = current.entities.filter((entity) => entity.planetId === current.activePlanetId);
  const currentPlanetBelts = current.belts.filter((belt) => belt.planetId === current.activePlanetId);
  const changedEntities = currentPlanetEntities.filter((entity) => previousEntities.get(entity.id) !== entitySignature(entity));
  const changedBelts = currentPlanetBelts.filter((belt) => previousBelts.get(belt.id) !== beltSignature(belt));
  const currentEntityIds = new Set(currentPlanetEntities.map((entity) => entity.id));
  const currentBeltIds = new Set(currentPlanetBelts.map((belt) => belt.id));
  const removedEntityIds = [...previousEntities.keys()].filter((id) => !currentEntityIds.has(id));
  const removedBeltIds = [...previousBelts.keys()].filter((id) => !currentBeltIds.has(id));
  const topologyChangedEntityIds = changedEntities
    .filter((entity) => baseline?.entityTopologySignatures.get(entity.id) !== entityTopologySignature(entity))
    .map((entity) => entity.id);
  const topologyChangedBeltIds = changedBelts
    .filter((belt) => baseline?.beltTopologySignatures.get(belt.id) !== beltTopologySignature(belt))
    .map((belt) => belt.id);
  const totalProduced = Object.values(current.totalProduced ?? {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  return {
    protocolVersion: 2,
    elapsedSeconds: current.elapsedSeconds,
    activePlanetId: current.activePlanetId,
    changedEntityIds: changedEntities.map((entity) => entity.id),
    changedBeltIds: changedBelts.map((belt) => belt.id),
    changedEntities,
    changedBelts,
    removedEntityIds,
    removedBeltIds,
    topologyChangedEntityIds: [...topologyChangedEntityIds, ...removedEntityIds],
    topologyChangedBeltIds: [...topologyChangedBeltIds, ...removedBeltIds],
    requiresFullSnapshot: Boolean(previous && previous.activePlanetId !== current.activePlanetId),
    entityCount: current.entities.length,
    beltCount: current.belts.length,
    inFlightRouteCount: current.entities.reduce((sum, entity) => sum + (entity.stationRoutes?.length ?? 0), 0),
    totalProduced,
  };
}

function mergeRecords<T extends { id: string }>(
  previous: readonly T[],
  next: readonly T[],
  removedIds: readonly string[],
): T[] {
  const records = new Map(previous.map((record) => [record.id, record]));
  for (const id of removedIds) records.delete(id);
  for (const record of next) records.set(record.id, record);
  return [...records.values()];
}

function mergeIds(previous: readonly string[], next: readonly string[], removedIds: readonly string[] = []): string[] {
  const ids = new Set(previous);
  for (const id of removedIds) ids.delete(id);
  for (const id of next) ids.add(id);
  return [...ids];
}

/** Accumulates low-frequency canvas publications without dropping intermediate Worker changes. */
export function mergeSimulationProjections(
  previous: SimulationProjection | null,
  next: SimulationProjection,
): SimulationProjection {
  if (!previous || previous.activePlanetId !== next.activePlanetId || previous.protocolVersion !== next.protocolVersion) {
    return { ...next, requiresFullSnapshot: next.requiresFullSnapshot || Boolean(previous && previous.activePlanetId !== next.activePlanetId) };
  }
  const changedEntities = mergeRecords(previous.changedEntities, next.changedEntities, next.removedEntityIds);
  const changedBelts = mergeRecords(previous.changedBelts, next.changedBelts, next.removedBeltIds);
  return {
    ...next,
    changedEntities,
    changedBelts,
    changedEntityIds: changedEntities.map((entity) => entity.id),
    changedBeltIds: changedBelts.map((belt) => belt.id),
    removedEntityIds: mergeIds(previous.removedEntityIds, next.removedEntityIds, next.changedEntityIds),
    removedBeltIds: mergeIds(previous.removedBeltIds, next.removedBeltIds, next.changedBeltIds),
    topologyChangedEntityIds: mergeIds(previous.topologyChangedEntityIds, next.topologyChangedEntityIds),
    topologyChangedBeltIds: mergeIds(previous.topologyChangedBeltIds, next.topologyChangedBeltIds),
    requiresFullSnapshot: previous.requiresFullSnapshot || next.requiresFullSnapshot,
  };
}
