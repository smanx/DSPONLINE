import { describe, expect, it } from "vitest";
import { getTechnologyTierGrid } from "./technologyTreeLayout";

describe("technology tier horizontal layout", () => {
  it("splits dense standard tiers into horizontal sub-columns", () => {
    expect(getTechnologyTierGrid(8, "standard", 1, 560)).toMatchObject({ rows: 2, columns: 4, columnWidth: 250 });
    expect(getTechnologyTierGrid(8, "standard", 2, 560)).toMatchObject({ rows: 1, columns: 8, columnWidth: 500 });
  });

  it("keeps compact mode denser without requiring vertical scrolling", () => {
    expect(getTechnologyTierGrid(8, "compact", 1, 560)).toMatchObject({ rows: 2, columns: 4, columnWidth: 190 });
    expect(getTechnologyTierGrid(8, "compact", 2, 560)).toMatchObject({ rows: 2, columns: 4, columnWidth: 380 });
  });

  it("never produces an empty or zero-width grid", () => {
    expect(getTechnologyTierGrid(0, "standard", 1.5, 0)).toMatchObject({ rows: 1, columns: 1, columnWidth: 375 });
  });
});
