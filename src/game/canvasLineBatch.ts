import type { BeltConnection, FactoryEntity, GameState, PlanetId } from "./types";

export interface CanvasLineBatch {
  planetId: PlanetId;
  beltIds: string[];
  positions: Float32Array;
  segments: number;
}

/**
 * Benchmark/experimental renderer input. It intentionally does not replace
 * React Flow: selection and hit testing still use the existing belt objects.
 * The packed positions let a future Canvas/WebGL layer draw all visible lines
 * without allocating one React edge object per line.
 */
export function buildCanvasLineBatch(
  state: Pick<GameState, "entities" | "belts">,
  planetId: PlanetId,
  bounds?: { left: number; top: number; right: number; bottom: number },
): CanvasLineBatch {
  const entities = new Map<string, FactoryEntity>(state.entities.filter((entity) => entity.planetId === planetId).map((entity) => [entity.id, entity]));
  const beltIds: string[] = [];
  const positions: number[] = [];
  const visible = (x: number, y: number) => !bounds || (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom);
  for (const belt of state.belts) {
    if (belt.planetId !== planetId) continue;
    const source = entities.get(belt.source);
    const target = entities.get(belt.target);
    if (!source || !target) continue;
    const sourceX = source.position.x;
    const sourceY = source.position.y;
    const targetX = target.position.x;
    const targetY = target.position.y;
    if (!visible(Math.max(sourceX, targetX), Math.max(sourceY, targetY)) &&
      !visible(Math.min(sourceX, targetX), Math.min(sourceY, targetY))) continue;
    beltIds.push(belt.id);
    positions.push(sourceX, sourceY, targetX, targetY);
  }
  return { planetId, beltIds, positions: Float32Array.from(positions), segments: beltIds.length };
}

export function canvasLineBatchBytes(batch: CanvasLineBatch): number {
  return batch.positions.byteLength + batch.beltIds.reduce((total, id) => total + id.length * 2, 0);
}

export function canvasLineBatchIncludes(batch: CanvasLineBatch, belt: BeltConnection): boolean {
  return batch.beltIds.includes(belt.id);
}
