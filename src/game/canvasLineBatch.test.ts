import { describe, expect, it } from "vitest";
import { buildCanvasLineBatch, buildCanvasLineBatchFromGeometry, canvasLineBatchBytes } from "./canvasLineBatch";
import { createInitialState } from "./engine";

describe("canvas line batch prototype", () => {
  it("packs current-planet line endpoints without changing the game state", () => {
    const state = createInitialState();
    const batch = buildCanvasLineBatch(state, state.activePlanetId);
    expect(batch.segments).toBe(batch.beltIds.length);
    expect(batch.positions.length).toBe(batch.segments * 4);
    expect(canvasLineBatchBytes(batch)).toBeGreaterThanOrEqual(batch.positions.byteLength);
  });

  it("packs routed node geometry and omits lines restored to detailed SVG", () => {
    const state = createInitialState();
    const [source, target] = state.entities;
    const belt = {
      id: "canvas-routed-belt",
      planetId: state.activePlanetId,
      source: source.id,
      target: target.id,
      itemId: source.resourceId ?? "iron_ore",
      tier: 1 as const,
      sorterTier: 1 as const,
      lanes: 1,
      stackSize: 1 as const,
      priority: 1 as const,
      progress: 0,
      totalTransferred: 0,
      lastFlow: 0,
      congestion: 0,
    };
    const batch = buildCanvasLineBatchFromGeometry([belt], state.activePlanetId, [
      { id: source.id, x: source.position.x, y: source.position.y, width: 200, height: 100 },
      { id: target.id, x: target.position.x, y: target.position.y, width: 200, height: 100 },
    ], new Map([[belt.id, 123]]));
    expect(batch.segments).toBe(1);
    expect(batch.positions[0]).toBe(source.position.x + 200);
    expect(batch.routeCenters[0]).toBe(123);
    expect(buildCanvasLineBatchFromGeometry([belt], state.activePlanetId, [], new Map(), new Set([belt.id])).segments).toBe(0);
  });
});
