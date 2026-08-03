import type { SimulationProjection } from "./simulationProjection";
import type { BeltConnection, FactoryEntity, GameState, PlanetId } from "./types";

export interface CanvasRenderSnapshot {
  /** A shallow, read-only GameState view whose entity/belt arrays contain only the active planet. */
  game: GameState;
  planetId: PlanetId;
  entityById: ReadonlyMap<string, FactoryEntity>;
  beltById: ReadonlyMap<string, BeltConnection>;
  topologyRevision: number;
  runtimeRevision: number;
}

export interface CanvasRenderSnapshotResult {
  snapshot: CanvasRenderSnapshot;
  fullRebuild: boolean;
  topologyChanged: boolean;
  changedEntityCount: number;
  changedBeltCount: number;
}

function activeEntities(state: GameState, planetId: PlanetId): FactoryEntity[] {
  return state.entities.filter((entity) => entity.planetId === planetId);
}

function activeBelts(state: GameState, planetId: PlanetId): BeltConnection[] {
  return state.belts.filter((belt) => belt.planetId === planetId);
}

function createScopedGame(state: GameState, planetId: PlanetId, entities: FactoryEntity[], belts: BeltConnection[]): GameState {
  return { ...state, activePlanetId: planetId, entities, belts };
}

function sameEntityTopology(previous: readonly FactoryEntity[], next: readonly FactoryEntity[]): boolean {
  if (previous.length !== next.length) return false;
  const byId = new Map(previous.map((entity) => [entity.id, entity]));
  return next.every((entity) => {
    const before = byId.get(entity.id);
    return Boolean(before && before.planetId === entity.planetId && before.kind === entity.kind &&
      before.buildingId === entity.buildingId && before.resourceId === entity.resourceId &&
      before.position.x === entity.position.x && before.position.y === entity.position.y);
  });
}

function sameBeltTopology(previous: readonly BeltConnection[], next: readonly BeltConnection[]): boolean {
  if (previous.length !== next.length) return false;
  const byId = new Map(previous.map((belt) => [belt.id, belt]));
  return next.every((belt) => {
    const before = byId.get(belt.id);
    return Boolean(before && before.planetId === belt.planetId && before.source === belt.source && before.target === belt.target &&
      before.itemId === belt.itemId && before.tier === belt.tier && before.lanes === belt.lanes &&
      (before.stackSize ?? 1) === (belt.stackSize ?? 1) && before.priority === belt.priority &&
      before.targetPortIndex === belt.targetPortIndex && (before.routeMode ?? "auto") === (belt.routeMode ?? "auto") &&
      (before.routeOffsetY ?? 0) === (belt.routeOffsetY ?? 0));
  });
}

export function createCanvasRenderSnapshot(state: GameState, planetId: PlanetId = state.activePlanetId): CanvasRenderSnapshot {
  const entities = activeEntities(state, planetId);
  const belts = activeBelts(state, planetId);
  return {
    game: createScopedGame(state, planetId, entities, belts),
    planetId,
    entityById: new Map(entities.map((entity) => [entity.id, entity])),
    beltById: new Map(belts.map((belt) => [belt.id, belt])),
    topologyRevision: 1,
    runtimeRevision: 1,
  };
}

function replaceRuntimeRecords<T extends { id: string }>(
  previous: readonly T[],
  changed: readonly T[],
  removedIds: readonly string[],
): T[] {
  if (changed.length === 0 && removedIds.length === 0) return previous as T[];
  const changedById = new Map(changed.map((record) => [record.id, record]));
  const removed = new Set(removedIds);
  const next = previous.flatMap((record) => removed.has(record.id) ? [] : [changedById.get(record.id) ?? record]);
  const existing = new Set(previous.map((record) => record.id));
  for (const record of changed) if (!existing.has(record.id)) next.push(record);
  return next;
}

/**
 * Publishes a lightweight render-only view. Incremental projection records are
 * never used as gameplay input and cannot be written back to the authoritative state.
 */
export function reconcileCanvasRenderSnapshot(
  previous: CanvasRenderSnapshot | null,
  state: GameState,
  projection: SimulationProjection | null,
  options: { force?: boolean; enabled?: boolean } = {},
): CanvasRenderSnapshotResult {
  const enabled = options.enabled !== false;
  const planetId = state.activePlanetId;
  const mustRebuild = !previous || options.force || !enabled || !projection || projection.protocolVersion !== 2 ||
    projection.requiresFullSnapshot || previous.planetId !== planetId || projection.activePlanetId !== planetId;
  if (mustRebuild) {
    if (!enabled) {
      const entities = activeEntities(state, planetId);
      const belts = activeBelts(state, planetId);
      return {
        snapshot: {
          game: state,
          planetId,
          entityById: new Map(entities.map((entity) => [entity.id, entity])),
          beltById: new Map(belts.map((belt) => [belt.id, belt])),
          topologyRevision: (previous?.topologyRevision ?? 0) + 1,
          runtimeRevision: (previous?.runtimeRevision ?? 0) + 1,
        },
        fullRebuild: true,
        topologyChanged: true,
        changedEntityCount: entities.length,
        changedBeltCount: belts.length,
      };
    }
    const next = createCanvasRenderSnapshot(state, planetId);
    const topologyChanged = !previous || previous.planetId !== planetId ||
      !sameEntityTopology(previous.game.entities, next.game.entities) || !sameBeltTopology(previous.game.belts, next.game.belts);
    if (previous) {
      next.topologyRevision = previous.topologyRevision + (topologyChanged ? 1 : 0);
      next.runtimeRevision = previous.runtimeRevision + 1;
    }
    return {
      snapshot: next,
      fullRebuild: true,
      topologyChanged,
      changedEntityCount: next.game.entities.length,
      changedBeltCount: next.game.belts.length,
    };
  }

  const topologyChanged = projection.topologyChangedEntityIds.length > 0 || projection.topologyChangedBeltIds.length > 0;
  const entities = topologyChanged
    ? activeEntities(state, planetId)
    : replaceRuntimeRecords(previous.game.entities, projection.changedEntities, projection.removedEntityIds);
  const belts = topologyChanged
    ? activeBelts(state, planetId)
    : replaceRuntimeRecords(previous.game.belts, projection.changedBelts, projection.removedBeltIds);
  const entityById = entities === previous.game.entities
    ? previous.entityById
    : new Map(entities.map((entity) => [entity.id, entity]));
  const beltById = belts === previous.game.belts
    ? previous.beltById
    : new Map(belts.map((belt) => [belt.id, belt]));
  return {
    snapshot: {
      game: createScopedGame(state, planetId, entities, belts),
      planetId,
      entityById,
      beltById,
      topologyRevision: previous.topologyRevision + (topologyChanged ? 1 : 0),
      runtimeRevision: previous.runtimeRevision + 1,
    },
    fullRebuild: false,
    topologyChanged,
    changedEntityCount: projection.changedEntities.length + projection.removedEntityIds.length,
    changedBeltCount: projection.changedBelts.length + projection.removedBeltIds.length,
  };
}
