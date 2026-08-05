import { describe, expect, it } from "vitest";
import { accumulateSimulationBudget, NORMAL_SIMULATION_SLICE_SECONDS, takeSimulationBudgetSlice } from "./simulationBudget";

describe("time-warp simulation budget slicing", () => {
  it("caps one worker request while preserving the clock ratio", () => {
    const first = takeSimulationBudgetSlice(1_000, 10, 120);
    expect(first).toMatchObject({
      simulationSeconds: 120,
      wallSeconds: 1.2,
      remainingSimulationSeconds: 880,
      remainingWallSeconds: 8.8,
    });
  });

  it("does not lose the final remainder", () => {
    let simulation = 1_001;
    let wall = 10.01;
    let slices = 0;
    while (simulation > 0) {
      const slice = takeSimulationBudgetSlice(simulation, wall, 120);
      simulation = slice.remainingSimulationSeconds;
      wall = slice.remainingWallSeconds;
      slices += 1;
      expect(slice.simulationSeconds).toBeGreaterThan(0);
    }
    expect(slices).toBe(9);
    expect(simulation).toBe(0);
    expect(wall).toBe(0);
  });

  it("returns small budgets unchanged", () => {
    expect(takeSimulationBudgetSlice(5, 0.5, 120)).toEqual({
      simulationSeconds: 5,
      wallSeconds: 0.5,
      remainingSimulationSeconds: 0,
      remainingWallSeconds: 0,
    });
  });

  it("bounds normal-play catch-up requests without dropping accumulated time", () => {
    const slice = takeSimulationBudgetSlice(12, 6, NORMAL_SIMULATION_SLICE_SECONDS);
    expect(slice).toEqual({
      simulationSeconds: 2,
      wallSeconds: 1,
      remainingSimulationSeconds: 10,
      remainingWallSeconds: 5,
    });
  });

  it("preserves backlog above a governor threshold until bounded slices commit it", () => {
    const accumulated = accumulateSimulationBudget(30, 3.75, 12, 1.5);
    expect(accumulated).toEqual({ simulationSeconds: 42, wallSeconds: 5.25 });
    const slice = takeSimulationBudgetSlice(accumulated.simulationSeconds, accumulated.wallSeconds, 12);
    expect(slice).toEqual({
      simulationSeconds: 12,
      wallSeconds: 1.5,
      remainingSimulationSeconds: 30,
      remainingWallSeconds: 3.75,
    });
  });
});
