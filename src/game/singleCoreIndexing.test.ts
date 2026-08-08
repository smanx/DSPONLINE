import { describe, expect, it } from "vitest";
import { hashGameState } from "./benchmark";
import {
  advancePersistentSimulationRuntime,
  createPersistentSimulationRuntime,
  createSimulationProfiler,
} from "./engine";
import { createSyntheticPerformanceFixture } from "./performanceFixtures";
import type { GameState } from "./types";

function authoritativeHash(state: GameState): string {
  return hashGameState({ ...state, productionHistory: [] });
}

describe("single-core indexed hot paths", () => {
  it("keeps whole and one-second segmented advancement identical at 1/4/12/60/600 seconds", () => {
    const source = createSyntheticPerformanceFixture("p50");
    // Terminal saves have already claimed one-time campaign construction
    // rewards. Excluding that early-game UI reward boundary keeps this test
    // focused on production, belts, logistics, quantum and persistent indexes.
    if (!source.campaign.completedTaskIds.includes("side_stable_power")) source.campaign.completedTaskIds.push("side_stable_power");
    if (!source.campaign.rewardedTaskIds.includes("side_stable_power")) source.campaign.rewardedTaskIds.push("side_stable_power");
    for (const seconds of [1, 4, 12, 60, 600]) {
      const whole = createPersistentSimulationRuntime(structuredClone(source));
      const segmented = createPersistentSimulationRuntime(structuredClone(source));
      advancePersistentSimulationRuntime(whole, seconds, seconds);
      for (let step = 0; step < seconds; step += 1) advancePersistentSimulationRuntime(segmented, 1, 1);
      expect(authoritativeHash(segmented.state), `${seconds} 秒分段哈希`).toBe(authoritativeHash(whole.state));
      expect(segmented.state.elapsedSeconds).toBe(whole.state.elapsedSeconds);
    }
  }, 120_000);

  it("reuses one runtime index across consecutive requests without rebuilding gameplay state", () => {
    const runtime = createPersistentSimulationRuntime(createSyntheticPerformanceFixture("p50"));
    const profiler = createSimulationProfiler();
    const lookup = runtime.lookup;
    const first = advancePersistentSimulationRuntime(runtime, 1, 1, profiler);
    const second = advancePersistentSimulationRuntime(runtime, 1, 1, profiler);
    expect(first.cacheRebuilt).toBe(false);
    expect(second.cacheRebuilt).toBe(false);
    expect(runtime.lookup).toBe(lookup);
    expect(runtime.state.entities).toHaveLength(300);
    expect(runtime.state.belts).toHaveLength(300);
  });
});
