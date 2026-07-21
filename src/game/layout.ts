import type { FactoryEntity, GameState, PlanetId } from "./types";

export interface FactoryLayoutMove {
  id: string;
  position: { x: number; y: number };
}

function entityOrder(left: FactoryEntity, right: FactoryEntity): number {
  const kindRank = (entity: FactoryEntity) => entity.kind === "vein" ? 0 : entity.kind === "storage" || entity.kind === "station" ? 1 : 2;
  return kindRank(left) - kindRank(right) || (left.buildingId ?? left.resourceId ?? "").localeCompare(right.buildingId ?? right.resourceId ?? "") || left.id.localeCompare(right.id);
}

/** Produces a stable left-to-right layout without mutating resource deposits. */
export function planFactoryAutoLayout(state: GameState, planetId: PlanetId, entityIds?: readonly string[]): FactoryLayoutMove[] {
  const requested = entityIds?.length ? new Set(entityIds) : null;
  const movable = state.entities
    .filter((entity) => entity.planetId === planetId && entity.kind !== "vein" && (!requested || requested.has(entity.id)))
    .sort(entityOrder);
  if (movable.length === 0) return [];

  const movableIds = new Set(movable.map((entity) => entity.id));
  const incoming = new Map(movable.map((entity) => [entity.id, [] as string[]]));
  const outgoing = new Map(movable.map((entity) => [entity.id, [] as string[]]));
  for (const belt of state.belts) {
    if (belt.planetId !== planetId || !movableIds.has(belt.target)) continue;
    incoming.get(belt.target)!.push(belt.source);
    if (movableIds.has(belt.source)) outgoing.get(belt.source)!.push(belt.target);
  }

  const indegree = new Map(movable.map((entity) => [entity.id, incoming.get(entity.id)!.filter((id) => movableIds.has(id)).length]));
  const byId = new Map(movable.map((entity) => [entity.id, entity]));
  const layer = new Map<string, number>();
  const queue = movable.filter((entity) => indegree.get(entity.id) === 0);
  while (queue.length > 0) {
    queue.sort(entityOrder);
    const entity = queue.shift()!;
    const predecessorLayers = incoming.get(entity.id)!.map((id) => layer.get(id) ?? -1);
    layer.set(entity.id, Math.max(0, ...predecessorLayers.map((value) => value + 1)));
    for (const targetId of outgoing.get(entity.id)!) {
      const next = Math.max(0, (indegree.get(targetId) ?? 1) - 1);
      indegree.set(targetId, next);
      if (next === 0) queue.push(byId.get(targetId)!);
    }
  }

  // Cycles (for example fractionator loops) receive deterministic trailing layers.
  const unresolved = movable.filter((entity) => !layer.has(entity.id));
  const resolvedMax = Math.max(0, ...layer.values());
  unresolved.forEach((entity, index) => layer.set(entity.id, resolvedMax + 1 + Math.floor(index / 4)));

  const originX = Math.round(Math.min(...movable.map((entity) => entity.position.x)) / 20) * 20;
  const originY = Math.round(Math.min(...movable.map((entity) => entity.position.y)) / 20) * 20;
  const columns = new Map<number, FactoryEntity[]>();
  for (const entity of movable) {
    const column = layer.get(entity.id) ?? 0;
    const entries = columns.get(column) ?? [];
    entries.push(entity);
    columns.set(column, entries);
  }

  const moves: FactoryLayoutMove[] = [];
  for (const [column, entries] of [...columns].sort(([left], [right]) => left - right)) {
    entries.sort(entityOrder);
    entries.forEach((entity, row) => moves.push({
      id: entity.id,
      position: { x: originX + column * 340, y: originY + row * 240 },
    }));
  }
  return moves;
}
