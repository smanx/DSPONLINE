export interface AlignmentRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  selected?: boolean;
}

export interface AlignmentSpatialIndex {
  cellSize: number;
  buckets: Map<string, AlignmentRect[]>;
}

export interface AlignmentGuideResult {
  x: number | null;
  y: number | null;
}

export function buildAlignmentSpatialIndex(rects: readonly AlignmentRect[], cellSize = 96): AlignmentSpatialIndex {
  const safeCellSize = Math.max(32, Math.floor(cellSize));
  const buckets = new Map<string, AlignmentRect[]>();
  for (const rect of rects) {
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    const key = `${Math.floor(centerX / safeCellSize)}:${Math.floor(centerY / safeCellSize)}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push({ ...rect });
    buckets.set(key, bucket);
  }
  return { cellSize: safeCellSize, buckets };
}

function anchors(start: number, size: number): [number, number, number] {
  return [start, start + size / 2, start + size];
}

export function findAlignmentGuides(index: AlignmentSpatialIndex, moving: readonly AlignmentRect[], threshold: number): AlignmentGuideResult {
  if (moving.length === 0) return { x: null, y: null };
  const movingIds = new Set(moving.map((rect) => rect.id));
  const nearby = new Map<string, AlignmentRect>();
  const searchRadius = Math.max(2, Math.ceil(320 / index.cellSize));
  for (const rect of moving) {
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    const cellX = Math.floor(centerX / index.cellSize);
    const cellY = Math.floor(centerY / index.cellSize);
    for (let x = cellX - searchRadius; x <= cellX + searchRadius; x += 1) {
      for (let y = cellY - searchRadius; y <= cellY + searchRadius; y += 1) {
        for (const candidate of index.buckets.get(`${x}:${y}`) ?? []) {
          if (!movingIds.has(candidate.id) && !candidate.selected) nearby.set(candidate.id, candidate);
        }
      }
    }
  }

  let guideX: number | null = null;
  let guideY: number | null = null;
  let nearestX = Number.POSITIVE_INFINITY;
  let nearestY = Number.POSITIVE_INFINITY;
  const limit = Math.max(0, threshold);
  for (const rect of moving) {
    const movingX = anchors(rect.x, rect.width);
    const movingY = anchors(rect.y, rect.height);
    for (const candidate of nearby.values()) {
      const candidateX = anchors(candidate.x, candidate.width);
      const candidateY = anchors(candidate.y, candidate.height);
      for (const source of movingX) for (const target of candidateX) {
        const distance = Math.abs(source - target);
        if (distance <= limit && distance < nearestX) { nearestX = distance; guideX = target; }
      }
      for (const source of movingY) for (const target of candidateY) {
        const distance = Math.abs(source - target);
        if (distance <= limit && distance < nearestY) { nearestY = distance; guideY = target; }
      }
    }
  }
  return { x: guideX, y: guideY };
}
