import { describe, expect, it } from "vitest";
import { buildCanvasLineBatch, canvasLineBatchBytes } from "./canvasLineBatch";
import { createInitialState } from "./engine";

describe("canvas line batch prototype", () => {
  it("packs current-planet line endpoints without changing the game state", () => {
    const state = createInitialState();
    const batch = buildCanvasLineBatch(state, state.activePlanetId);
    expect(batch.segments).toBe(batch.beltIds.length);
    expect(batch.positions.length).toBe(batch.segments * 4);
    expect(canvasLineBatchBytes(batch)).toBeGreaterThanOrEqual(batch.positions.byteLength);
  });
});
