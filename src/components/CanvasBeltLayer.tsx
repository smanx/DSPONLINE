import { useEffect, useMemo, useRef } from "react";
import { ITEMS } from "../game/content";
import { buildCanvasLineBatch } from "../game/canvasLineBatch";
import type { CanvasViewport, GameState, PlanetId } from "../game/types";

interface CanvasBeltLayerProps {
  state: Pick<GameState, "entities" | "belts">;
  planetId: PlanetId;
  viewport: CanvasViewport;
  width: number;
  height: number;
  selectedBeltIds: ReadonlySet<string>;
}

/** Optional P5 renderer. DOM edges remain the hit-test layer underneath. */
export function CanvasBeltLayer({ state, planetId, viewport, width, height, selectedBeltIds }: CanvasBeltLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bounds = useMemo(() => ({
    left: -viewport.x / Math.max(0.25, viewport.zoom) - 64,
    top: -viewport.y / Math.max(0.25, viewport.zoom) - 64,
    right: (width - viewport.x) / Math.max(0.25, viewport.zoom) + 64,
    bottom: (height - viewport.y) / Math.max(0.25, viewport.zoom) + 64,
  }), [height, viewport.x, viewport.y, viewport.zoom, width]);
  const batch = useMemo(() => buildCanvasLineBatch(state, planetId, bounds), [bounds, planetId, state]);
  const beltById = useMemo(() => new Map(state.belts.map((belt) => [belt.id, belt])), [state.belts]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.ceil(width * dpr);
    canvas.height = Math.ceil(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    for (let index = 0; index < batch.beltIds.length; index += 1) {
      const belt = beltById.get(batch.beltIds[index]);
      if (!belt) continue;
      const offset = index * 4;
      const sourceX = viewport.x + batch.positions[offset] * viewport.zoom;
      const sourceY = viewport.y + batch.positions[offset + 1] * viewport.zoom;
      const targetX = viewport.x + batch.positions[offset + 2] * viewport.zoom;
      const targetY = viewport.y + batch.positions[offset + 3] * viewport.zoom;
      const selected = selectedBeltIds.has(belt.id);
      context.strokeStyle = selected ? "#f3d27b" : ITEMS[belt.itemId]?.color ?? "#6da8a0";
      context.globalAlpha = selected ? 0.95 : 0.68;
      context.lineWidth = selected ? 3 : 1.5;
      context.beginPath();
      context.moveTo(sourceX, sourceY);
      context.lineTo(targetX, targetY);
      context.stroke();
    }
    context.globalAlpha = 1;
  }, [batch, beltById, height, selectedBeltIds, viewport.x, viewport.y, viewport.zoom, width]);

  return <canvas ref={canvasRef} className="canvas-belt-layer" aria-hidden="true" data-segments={batch.segments} />;
}
