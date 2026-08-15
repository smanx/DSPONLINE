import { describe, expect, it } from "vitest";
import { buildCanvasBeltHitIndex, collectCanvasBeltIndicesInBounds, findNearestCanvasBelt } from "./canvasBeltSpatialIndex";
import type { CanvasLineBatch } from "./canvasLineBatch";

function batch(): CanvasLineBatch {
  return {
    planetId: "home",
    beltIds: ["straight", "routed"],
    positions: Float32Array.from([0, 0, 300, 0, 0, 100, 300, 100]),
    routeCenters: Float32Array.from([Number.NaN, 200]),
    routeModes: Uint8Array.from([0, 1]),
    segments: 2,
  };
}

describe("canvas belt spatial hit index", () => {
  it("finds bezier and routed lines without a DOM edge", () => {
    const index = buildCanvasBeltHitIndex(batch(), 128);
    expect(findNearestCanvasBelt(index, { x: 150, y: 2 }, 12)?.beltId).toBe("straight");
    expect(findNearestCanvasBelt(index, { x: 150, y: 201 }, 12)?.beltId).toBe("routed");
  });

  it("returns null outside the interaction radius and keeps ties stable", () => {
    const index = buildCanvasBeltHitIndex(batch(), 128);
    expect(findNearestCanvasBelt(index, { x: 150, y: 50 }, 10)).toBeNull();
    expect(findNearestCanvasBelt(index, { x: 0, y: 50 }, 60)?.beltId).toBe("routed");
  });

  it("collects stable conservative candidates for the visible world rectangle", () => {
    const index = buildCanvasBeltHitIndex(batch(), 128);
    // Buckets intentionally admit nearby routes; the renderer applies its
    // exact screen-space intersection check before drawing.
    expect(collectCanvasBeltIndicesInBounds(index, { left: 120, top: -8, right: 180, bottom: 8 }))
      .toEqual([0, 1]);
    expect(collectCanvasBeltIndicesInBounds(index, { left: 120, top: 192, right: 180, bottom: 208 }))
      .toContain(1);
    expect(collectCanvasBeltIndicesInBounds(index, { left: 8_000, top: 8_000, right: 8_100, bottom: 8_100 }))
      .toEqual([]);
  });
});
