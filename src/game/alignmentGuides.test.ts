import { describe, expect, it } from "vitest";
import { buildAlignmentSpatialIndex, findAlignmentGuides } from "./alignmentGuides";

describe("alignment guides", () => {
  it("matches centers and all horizontal and vertical edges from nearby index buckets", () => {
    const index = buildAlignmentSpatialIndex([{ id: "fixed", x: 300, y: 200, width: 100, height: 80 }]);
    expect(findAlignmentGuides(index, [{ id: "moving", x: 198, y: 122, width: 100, height: 80 }], 4)).toEqual({ x: 300, y: 200 });
    expect(findAlignmentGuides(index, [{ id: "moving", x: 302, y: 202, width: 40, height: 30 }], 4)).toEqual({ x: 300, y: 200 });
  });

  it("supports multi-selection and ignores every selected source rectangle", () => {
    const index = buildAlignmentSpatialIndex([
      { id: "selected-a", x: 0, y: 0, width: 80, height: 80, selected: true },
      { id: "selected-b", x: 100, y: 0, width: 80, height: 80, selected: true },
      { id: "fixed", x: 300, y: 160, width: 80, height: 80 },
    ]);
    const guides = findAlignmentGuides(index, [
      { id: "selected-a", x: 218, y: 80, width: 80, height: 80 },
      { id: "selected-b", x: 318, y: 80, width: 80, height: 80 },
    ], 3);
    expect(guides).toEqual({ x: 300, y: 160 });
  });
});
