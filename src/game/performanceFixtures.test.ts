import { describe, expect, it } from "vitest";
import {
  createSyntheticPerformanceFixture,
  runSyntheticPerformanceBenchmark,
  type PerformanceFixtureProfile,
} from "./performanceFixtures";

describe("synthetic endgame performance fixtures", () => {
  it.each([
    ["p50", 300, 300, 45],
    ["p95", 380, 500, 80],
    ["max", 569, 1_160, 128],
  ] as const)("builds the %s scale without player data", (profile, entityCount, beltCount, stationCount) => {
    const state = createSyntheticPerformanceFixture(profile as PerformanceFixtureProfile);
    expect(state.entities).toHaveLength(entityCount);
    expect(state.belts).toHaveLength(beltCount);
    expect(state.entities.filter((entity) => entity.kind === "station")).toHaveLength(stationCount);
    expect(state.entities.some((entity) => entity.id.includes("fixture"))).toBe(true);
  });

  it.each(["p50", "p95", "max"] as const)("keeps %s legacy and indexed hashes identical", (profile) => {
    const report = runSyntheticPerformanceBenchmark(profile, { seconds: 1, warmupRuns: 0 });
    expect(report.hashesMatch).toBe(true);
    expect(report.legacy.stateHash).toBe(report.indexed.stateHash);
    expect(report.legacy.pendingSimulationSeconds).toBe(0);
    expect(report.indexed.pendingSimulationSeconds).toBe(0);
    expect(report.indexed.profiler.peerCandidateChecks).toBeLessThanOrEqual(report.legacy.profiler.peerCandidateChecks);
  }, 60_000);
});
