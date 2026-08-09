import type { CanvasLineBatch } from "./canvasLineBatch";

export interface CanvasBeltHitIndex {
  batch: CanvasLineBatch;
  cellSize: number;
  buckets: ReadonlyMap<string, readonly number[]>;
}

export interface CanvasBeltHit {
  beltId: string;
  distance: number;
}

interface Point { x: number; y: number }

function cellKey(x: number, y: number): string {
  return `${x}:${y}`;
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0.000001) return Math.hypot(point.x - start.x, point.y - start.y);
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy));
}

function routePoints(batch: CanvasLineBatch, index: number): Point[] {
  const offset = index * 4;
  const source = { x: batch.positions[offset], y: batch.positions[offset + 1] };
  const target = { x: batch.positions[offset + 2], y: batch.positions[offset + 3] };
  const centerY = batch.routeCenters[index];
  if (batch.routeModes[index] !== 0 && Number.isFinite(centerY)) {
    const direction = target.x >= source.x ? 1 : -1;
    const lead = Math.min(34, Math.max(18, Math.abs(target.x - source.x) / 4));
    return [
      source,
      { x: source.x + lead * direction, y: source.y },
      { x: source.x + lead * direction, y: centerY },
      { x: target.x - lead * direction, y: centerY },
      { x: target.x - lead * direction, y: target.y },
      target,
    ];
  }
  const direction = target.x >= source.x ? 1 : -1;
  const control = Math.max(42, Math.abs(target.x - source.x) * 0.45);
  const firstControl = { x: source.x + control * direction, y: source.y };
  const secondControl = { x: target.x - control * direction, y: target.y };
  const points: Point[] = [];
  for (let step = 0; step <= 10; step += 1) {
    const t = step / 10;
    const inverse = 1 - t;
    points.push({
      x: inverse ** 3 * source.x + 3 * inverse ** 2 * t * firstControl.x + 3 * inverse * t ** 2 * secondControl.x + t ** 3 * target.x,
      y: inverse ** 3 * source.y + 3 * inverse ** 2 * t * firstControl.y + 3 * inverse * t ** 2 * secondControl.y + t ** 3 * target.y,
    });
  }
  return points;
}

function cellsForSegment(start: Point, end: Point, cellSize: number, output: Set<string>): void {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / cellSize));
  for (let step = 0; step <= steps; step += 1) {
    const ratio = step / steps;
    output.add(cellKey(Math.floor((start.x + dx * ratio) / cellSize), Math.floor((start.y + dy * ratio) / cellSize)));
  }
}

export function buildCanvasBeltHitIndex(batch: CanvasLineBatch, requestedCellSize = 256): CanvasBeltHitIndex {
  const cellSize = Math.max(64, Math.min(1_024, Math.floor(requestedCellSize)));
  const buckets = new Map<string, number[]>();
  for (let index = 0; index < batch.beltIds.length; index += 1) {
    const points = routePoints(batch, index);
    const cells = new Set<string>();
    for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
      cellsForSegment(points[pointIndex - 1], points[pointIndex], cellSize, cells);
    }
    for (const key of cells) {
      const bucket = buckets.get(key);
      if (bucket) bucket.push(index);
      else buckets.set(key, [index]);
    }
  }
  return { batch, cellSize, buckets };
}

export function findNearestCanvasBelt(
  index: CanvasBeltHitIndex,
  point: Point,
  maximumDistance: number,
): CanvasBeltHit | null {
  const limit = Math.max(0, maximumDistance);
  const radius = Math.max(1, Math.ceil(limit / index.cellSize));
  const centerX = Math.floor(point.x / index.cellSize);
  const centerY = Math.floor(point.y / index.cellSize);
  const candidates = new Set<number>();
  for (let x = centerX - radius; x <= centerX + radius; x += 1) {
    for (let y = centerY - radius; y <= centerY + radius; y += 1) {
      for (const candidate of index.buckets.get(cellKey(x, y)) ?? []) candidates.add(candidate);
    }
  }
  let nearest: CanvasBeltHit | null = null;
  for (const candidate of candidates) {
    const points = routePoints(index.batch, candidate);
    let distance = Number.POSITIVE_INFINITY;
    for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
      distance = Math.min(distance, distanceToSegment(point, points[pointIndex - 1], points[pointIndex]));
    }
    if (distance <= limit && (!nearest || distance < nearest.distance ||
      (distance === nearest.distance && index.batch.beltIds[candidate].localeCompare(nearest.beltId) < 0))) {
      nearest = { beltId: index.batch.beltIds[candidate], distance };
    }
  }
  return nearest;
}
