export type CanvasLod = "compact" | "medium" | "full";

export const CANVAS_ENTITY_VIRTUALIZATION_THRESHOLD = 300;
export const CANVAS_BELT_VIRTUALIZATION_THRESHOLD = 450;

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
