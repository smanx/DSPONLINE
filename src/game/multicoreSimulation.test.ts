import { describe, expect, it } from "vitest";
import { createInitialState } from "./engine";
import { planMulticoreSimulation } from "./multicoreSimulation";

describe("multicore simulation guardrail", () => {
  it("keeps the production path on one worker unless explicitly approved", () => {
    const state = createInitialState();
    expect(planMulticoreSimulation(state, { enabled: true, requestedWorkers: 8, benchmarkSpeedup: 2 })).toMatchObject({ workerCount: 1, enabled: false });
  });

  it("caps approved desktop experiments and rejects low measured speedups", () => {
    const state = createInitialState();
    state.entities = Array.from({ length: 600 }, (_, index) => ({ ...state.entities[0], id: `e-${index}` }));
    const plan = planMulticoreSimulation(state, { enabled: true, requestedWorkers: 8, benchmarkSpeedup: 1.5 });
    expect(plan).toMatchObject({ workerCount: 4, enabled: true, reason: "approved" });
    expect(planMulticoreSimulation(state, { enabled: true, requestedWorkers: 4, benchmarkSpeedup: 1.01 }).reason).toBe("transfer-cost");
  });
});
