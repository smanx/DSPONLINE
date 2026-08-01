import { describe, expect, it } from "vitest";
import { getCanvasLod, shouldVirtualizeCanvas } from "./canvasPerformance";

describe("canvas performance thresholds", () => {
  it("uses stable LOD bands", () => {
    expect(getCanvasLod(0.54)).toBe("compact");
    expect(getCanvasLod(0.55)).toBe("medium");
    expect(getCanvasLod(0.85)).toBe("medium");
    expect(getCanvasLod(0.86)).toBe("full");
  });

  it("culls dense line graphs even when the node count is small", () => {
    expect(shouldVirtualizeCanvas(299, 449)).toBe(false);
    expect(shouldVirtualizeCanvas(299, 450)).toBe(true);
    expect(shouldVirtualizeCanvas(300, 0)).toBe(true);
  });
});
