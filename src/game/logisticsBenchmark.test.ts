import { describe, expect, it } from "vitest";
import { runLogisticsBenchmarkComparison } from "./logisticsBenchmark";

const benchmarkEnvironment = (globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
}).process?.env;

describe("logistics lookup benchmark", () => {
  it.each([10, 50, 100, 128, 300, 500])("keeps indexed and legacy results identical for %i stations", (stationCount) => {
    const report = runLogisticsBenchmarkComparison(stationCount, { seconds: 2, warmupRuns: 0, measuredRuns: 1 });
    expect(report.hashesMatch).toBe(true);
    expect(report.indexed.routeCount).toBe(report.legacy.routeCount);
    expect(report.indexed.medianPeerCandidateChecks).toBeLessThan(report.legacy.medianPeerCandidateChecks);
    expect(report.indexed.medianRouteEconomicsCalls).toBeLessThanOrEqual(report.legacy.medianRouteEconomicsCalls);
    expect(report.indexed.medianRoutePathPlans).toBeLessThanOrEqual(report.indexed.medianRouteEconomicsCalls);
    expect(report.indexed.medianRoutePathCacheHits).toBeGreaterThanOrEqual(0);
    expect(report.indexed.medianPeerMatchCacheHits).toBeGreaterThan(0);
    expect(report.indexed.medianCongestionDispatchReuseHits).toBeGreaterThan(0);
  }, 30_000);

  it.skipIf(benchmarkEnvironment?.DSP_RUN_LOGISTICS_BENCHMARK !== "1")("profiles 10/50/100/128/300/500 station factories", () => {
    const reports = [10, 50, 100, 128, 300, 500].map((stationCount) =>
      runLogisticsBenchmarkComparison(stationCount, { seconds: 3, warmupRuns: 3, measuredRuns: 10 }));
    expect(reports.every((report) => report.hashesMatch)).toBe(true);
    console.log(`LOGISTICS_BENCHMARK ${JSON.stringify({ generatedAt: new Date().toISOString(), reports })}`);
  }, 180_000);
});
