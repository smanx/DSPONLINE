import { describe, expect, it } from "vitest";
import { auditFactoryBalance, runIdleBalanceSuite, runLongIdleStressTest } from "./benchmark";
import { createInitialState } from "./engine";

describe("idle performance reports", () => {
  it("keeps a long idle simulation numerically integral", () => {
    const state = createInitialState();
    const report = runLongIdleStressTest(state, 1);
    expect(report.completed).toBe(true);
    expect(report.integrityPassed).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("produces actionable balance data for a fresh factory", () => {
    const audit = auditFactoryBalance(createInitialState());
    expect(audit.powerEfficiency).toBeGreaterThanOrEqual(0);
    expect(audit.recommendations.length).toBeGreaterThan(0);
  });

  it("reports 2/8/24/72 hour checkpoints without truncating the final run", () => {
    const report = runIdleBalanceSuite(createInitialState());
    expect(report.checkpoints.map((checkpoint) => checkpoint.hours)).toEqual([2, 8, 24, 72]);
    expect(report.completed).toBe(true);
    expect(report.integrityPassed).toBe(true);
    expect(report.tuning.fullFidelitySimulation).toBe(true);
  });
});
