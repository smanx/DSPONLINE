import type { FactoryEntity, GameState, PlanetId } from "./types";

export interface FactoryLayoutMove {
  id: string;
  position: { x: number; y: number };
}

export interface FactoryLayoutBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const COLUMN_GAP = 340;
const ROW_GAP = 240;
const GRID_SIZE = 20;

export function getFactoryLayoutCollisionBounds(entity: FactoryEntity, position = entity.position): FactoryLayoutBounds {
  const fixedResource = entity.kind === "vein";
  const megastructure = entity.buildingId === "construction_center";
  const width = fixedResource ? 360 : megastructure ? 620 : 300;
  const height = fixedResource ? 300 : megastructure ? 420 : 220;
  const clearance = fixedResource ? 80 : 24;
  return {
    left: position.x - clearance,
    top: position.y - clearance,
    right: position.x + width + clearance,
    bottom: position.y + height + clearance,
  };
}

function collides(left: FactoryLayoutBounds, right: FactoryLayoutBounds): boolean {
  return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
}

function findFreePosition(entity: FactoryEntity, desired: { x: number; y: number }, obstacles: FactoryLayoutBounds[]): { x: number; y: number } {
  for (let rowOffset = 0; rowOffset < 512; rowOffset += 1) {
    const position = { x: desired.x, y: desired.y + rowOffset * ROW_GAP };
    const bounds = getFactoryLayoutCollisionBounds(entity, position);
    if (!obstacles.some((obstacle) => collides(bounds, obstacle))) return position;
  }
  // The bounded scan above is deliberately deterministic. This fallback is
  // only reachable on deliberately pathological imported layouts.
  return { x: desired.x + COLUMN_GAP, y: desired.y + 512 * ROW_GAP };
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

  const originX = Math.round(Math.min(...movable.map((entity) => entity.position.x)) / GRID_SIZE) * GRID_SIZE;
  const originY = Math.round(Math.min(...movable.map((entity) => entity.position.y)) / GRID_SIZE) * GRID_SIZE;
  const columns = new Map<number, FactoryEntity[]>();
  for (const entity of movable) {
    const column = layer.get(entity.id) ?? 0;
    const entries = columns.get(column) ?? [];
    entries.push(entity);
    columns.set(column, entries);
  }

  const obstacles = state.entities
    .filter((entity) => entity.planetId === planetId && !movableIds.has(entity.id))
    .map((entity) => getFactoryLayoutCollisionBounds(entity));
  const moves: FactoryLayoutMove[] = [];
  for (const [column, entries] of [...columns].sort(([left], [right]) => left - right)) {
    entries.sort(entityOrder);
    entries.forEach((entity, row) => {
      const position = findFreePosition(entity, { x: originX + column * COLUMN_GAP, y: originY + row * ROW_GAP }, obstacles);
      moves.push({ id: entity.id, position });
      obstacles.push(getFactoryLayoutCollisionBounds(entity, position));
    });
  }
  return moves;
}
