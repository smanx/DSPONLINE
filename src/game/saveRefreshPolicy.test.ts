import { describe, expect, it } from "vitest";
import { getSaveSummaryRefreshIntervalMs, shouldRefreshSaveSummaries } from "./saveRefreshPolicy";

describe("save summary refresh policy", () => {
  it("does not poll while the save workspace is hidden", () => {
    expect(shouldRefreshSaveSummaries(false, "saves")).toBe(false);
    expect(shouldRefreshSaveSummaries(true, "alerts")).toBe(false);
    expect(shouldRefreshSaveSummaries(true, "performance")).toBe(false);
  });

  it("refreshes only when the save workspace is visible", () => {
    expect(shouldRefreshSaveSummaries(true, "saves")).toBe(true);
  });

  it("keeps the coarse pointer interval for touch-oriented layouts", () => {
    expect(getSaveSummaryRefreshIntervalMs(false)).toBe(5_000);
    expect(getSaveSummaryRefreshIntervalMs(true)).toBe(30_000);
  });
});
