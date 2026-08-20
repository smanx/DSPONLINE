export type CanvasLod = "compact" | "medium" | "full";

export const CANVAS_ENTITY_VIRTUALIZATION_THRESHOLD = 300;
export const CANVAS_BELT_VIRTUALIZATION_THRESHOLD = 450;
export const DENSE_CANVAS_AUTO_ENTITY_THRESHOLD = 700;
export const DENSE_CANVAS_AUTO_BELT_THRESHOLD = 1_500;

export function getCanvasLod(zoom: number): CanvasLod {
  const normalized = Number.isFinite(zoom) ? zoom : 0.84;
  return normalized < 0.55 ? "compact" : normalized < 0.86 ? "medium" : "full";
}

/**
 * Large line graphs can be more expensive than a large node count. React
 * Flow's visible-elements culling should engage for either kind of density.
 */
export function shouldVirtualizeCanvas(entityCount: number, beltCount: number): boolean {
  return Math.max(0, Math.floor(entityCount)) >= CANVAS_ENTITY_VIRTUALIZATION_THRESHOLD ||
    Math.max(0, Math.floor(beltCount)) >= CANVAS_BELT_VIRTUALIZATION_THRESHOLD;
}

/** Safe device-only light mode for factories whose ordinary SVG graph is no longer economical. */
export function shouldAutoOptimizeDenseCanvas(entityCount: number, beltCount: number): boolean {
  return Math.max(0, Math.floor(entityCount)) >= DENSE_CANVAS_AUTO_ENTITY_THRESHOLD ||
    Math.max(0, Math.floor(beltCount)) >= DENSE_CANVAS_AUTO_BELT_THRESHOLD;
}
