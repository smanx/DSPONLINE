import { describe, expect, it } from "vitest";
import { createInitialState, placeBuilding } from "./engine";
import { hashGameState, runDeterminismCheck, runSimulationBenchmark } from "./benchmark";

describe("simulation benchmark", () => {
  it("produces the same hash for repeated deterministic runs", () => {
    let state = createInitialState();
    state = placeBuilding(state, "wind_turbine", { x: 0, y: 0 });
    const report = runDeterminismCheck(state, 5);
    expect(report.deterministic).toBe(true);
    expect(report.runs).toBe(2);
    expect(report.stateHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("runs a bounded benchmark without mutating the input state", () => {
    const state = createInitialState();
    const before = hashGameState(state);
    const report = runSimulationBenchmark(state, 2, 4);
    expect(report.deterministic).toBe(true);
    expect(report.steps).toBe(4);
    expect(report.stepsPerSecond).toBeGreaterThan(0);
    expect(hashGameState(state)).toBe(before);
  });
});
