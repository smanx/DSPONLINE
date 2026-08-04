import { describe, expect, it } from "vitest";
import {
  addHubInteger,
  allocateHubBudget,
  compareHubInteger,
  createHubPrototypeFixture,
  normalizeHubInteger,
  settleHubPrototype,
  subtractHubInteger,
  sumEscalatingModuleCost,
} from "./systemHubLogistics";

describe("system hub decimal arithmetic", () => {
  it("normalizes and clamps canonical decimal values", () => {
    expect(normalizeHubInteger("0000012")).toBe("12");
    expect(normalizeHubInteger("1e3", "7")).toBe("7");
    expect(normalizeHubInteger("9".repeat(257), "5")).toBe("5");
    expect(addHubInteger("9007199254740993", "7")).toBe("9007199254741000");
    expect(subtractHubInteger("2", "9")).toBe("0");
    expect(compareHubInteger("100000000000000000000", "99")).toBe(1);
  });

  it("allocates proportionally with stable keys and a persisted remainder cursor", () => {
    const first = allocateHubBudget("10", [
      { key: "b", amount: "1" },
      { key: "a", amount: "2" },
    ], 0);
    const reversed = allocateHubBudget("10", [
      { key: "a", amount: "2" },
      { key: "b", amount: "1" },
    ], 0);
    expect(first.allocations).toEqual(reversed.allocations);
    expect(first.totalAllocated).toBe("3");
    expect(first.nextCursor).toBeGreaterThanOrEqual(0);
  });

  it("calculates escalating module costs by ten-module tiers", () => {
    expect(sumEscalatingModuleCost("100", 0, 10)).toBe("1000");
    expect(sumEscalatingModuleCost("100", 0, 11)).toBe("1200");
    expect(sumEscalatingModuleCost("100", 10, 10)).toBe("2000");
  });
});

describe("stage 0 hub prototype", () => {
  it("reduces pair checks to a bounded contract set and conserves moved cargo", () => {
    const fixture = createHubPrototypeFixture(416, 8);
    const report = settleHubPrototype(fixture);
    console.log(`STAGE0_HUB_PROTOTYPE ${JSON.stringify({
      contractCount: report.contractCount,
      legacyPairChecks: report.legacyPairChecks,
      logisticsReduction: 1 - report.contractCount / report.legacyPairChecks,
      totalMoved: report.totalMoved,
      stateBytes: report.stateBytes,
      durationMs: report.durationMs,
    })}`);
    expect(report.contractCount).toBe(35);
    expect(report.legacyPairChecks).toBe(416 * 416 * 5);
    expect(report.contractCount).toBeLessThan(report.legacyPairChecks);
    expect(report.totalMoved).toBe("3500000000");
    expect(report.stateBytes).toBeGreaterThan(0);
  });
});
