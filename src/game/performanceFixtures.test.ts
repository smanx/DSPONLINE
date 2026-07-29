import { describe, expect, it } from "vitest";
import {
  createSyntheticPerformanceFixture,
  runSyntheticPerformanceBenchmark,
  type PerformanceFixtureProfile,
} from "./performanceFixtures";

const benchmarkEnvironment = (globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
}).process?.env;

describe("synthetic endgame performance fixtures", () => {
  it.each([
    ["p50", 300, 300, 45, 300],
    ["p95", 380, 500, 80, 500],
    ["max", 569, 1_160, 128, 1_160],
    ["player", 600, 1_250, 100, 1_500_000],
    ["terminal2x", 1_200, 2_500, 256, 3_000_000],
  ] as const)("builds the %s scale without player data", (profile, entityCount, beltCount, stationCount, totalLanes) => {
    const state = createSyntheticPerformanceFixture(profile as PerformanceFixtureProfile);
    expect(state.entities).toHaveLength(entityCount);
    expect(state.belts).toHaveLength(beltCount);
    expect(state.entities.filter((entity) => entity.kind === "station")).toHaveLength(stationCount);
    expect(state.belts.reduce((sum, belt) => sum + belt.lanes, 0)).toBe(totalLanes);
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

  it.skipIf(benchmarkEnvironment?.DSP_RUN_TERMINAL_BENCHMARK !== "1")(
    "profiles the player-shaped and 2x terminal fixtures",
    () => {
      const reports = (["player", "terminal2x"] as const).flatMap((profile) =>
        ([1, 4, 11] as const).map((multiplier) => ({
          multiplier,
          report: runSyntheticPerformanceBenchmark(profile, { seconds: multiplier, warmupRuns: 1 }),
        })));
      expect(reports.every(({ report }) => report.hashesMatch)).toBe(true);
      expect(reports.every(({ report }) => report.indexed.pendingSimulationSeconds === 0)).toBe(true);
      console.log(`TERMINAL_BENCHMARK ${JSON.stringify({ generatedAt: new Date().toISOString(), reports })}`);
    },
    300_000,
  );
});
