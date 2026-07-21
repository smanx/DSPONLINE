import { describe, expect, it } from "vitest";
import { createInitialState } from "./engine";
import { auditProgressionToWhiteMatrix } from "./progressionAudit";

describe("progression audit", () => {
  it("builds an ordered fresh-save route from blue to white matrix", () => {
    const report = auditProgressionToWhiteMatrix(createInitialState());
    expect(report.milestones.map((milestone) => milestone.itemId)).toEqual([
      "electromagnetic_matrix", "energy_matrix", "structure_matrix", "information_matrix", "gravity_matrix", "universe_matrix",
    ]);
    expect(report.milestones.map((milestone) => milestone.estimatedFromFreshMinutes)).toEqual(
      [...report.milestones.map((milestone) => milestone.estimatedFromFreshMinutes)].sort((left, right) => left - right),
    );
    expect(report.nextMilestone?.itemId).toBe("electromagnetic_matrix");
    expect(report.estimatedWhiteMatrixHours).toBeGreaterThan(1);
  });

  it("reports observed completion time after white matrix production", () => {
    const state = createInitialState();
    state.elapsedSeconds = 100 * 60 * 60;
    for (const itemId of ["electromagnetic_matrix", "energy_matrix", "structure_matrix", "information_matrix", "gravity_matrix", "universe_matrix"] as const) state.totalProduced[itemId] = 1;
    const report = auditProgressionToWhiteMatrix(state);
    expect(report.completedMilestones).toBe(6);
    expect(report.nextMilestone).toBeNull();
    expect(report.observedWhiteMatrixHours).toBe(100);
  });
});
