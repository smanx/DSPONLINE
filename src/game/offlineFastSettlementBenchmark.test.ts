import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrateGame } from "./storage";
import { runFastOfflineSettlement } from "./offlineApproximation";
import { advanceOfflineSimulationChunk } from "./offlineSimulation";
import { completeSimulationAdvanceSession, createSimulationAdvanceSession } from "./engine";

const environment = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env;
const nodeProcess = (globalThis as typeof globalThis & {
  process?: {
    cpuUsage: (previous?: { user: number; system: number }) => { user: number; system: number };
    memoryUsage: () => { heapUsed: number; rss: number };
  };
}).process;

interface NumericDifference {
  error: number;
  path: Array<string | number>;
  actual: unknown;
  expected: unknown;
}

const COMPARISON_IGNORED_KEYS = new Set([
  "productionHistory", "metrics", "planetMetrics", "powerGridMetrics", "runtimeFlow", "historyRecordedAt",
  "routingCursor", "uploadRoutingCursors", "stationDispatchCursor", "stationLastTransfer", "dispatchProgress",
  "activityClockMs", "lastFlow", "congestion", "productionRate", "utilization", "powerFactor", "powerOutputKw",
  "powerInputKw", "stationProgress", "stationCongestion", "generationKw", "demandKw", "powerEfficiency",
  "fuelGenerationKw", "recentFlowSampleSeconds", "recentFlowTransferred", "decayProgress", "sailsInOrbit",
]);

function compareNumericState(actual: unknown, expected: unknown, path: Array<string | number> = [], best: NumericDifference = {
  error: 0,
  path: [],
  actual: 0,
  expected: 0,
}): NumericDifference {
  if (path.some((part) => typeof part === "string" && COMPARISON_IGNORED_KEYS.has(part))) return best;
  if (typeof actual === "number" && typeof expected === "number" && Number.isFinite(actual) && Number.isFinite(expected)) {
    const error = Math.abs(actual - expected) / Math.max(1, Math.abs(actual), Math.abs(expected));
    return error > best.error ? { error, path, actual, expected } : best;
  }
  if (typeof actual === "string" && typeof expected === "string" && /^\d+$/.test(actual) && /^\d+$/.test(expected)) {
    try {
      const left = BigInt(actual);
      const right = BigInt(expected);
      const scale = left > right ? left : right;
      const difference = left >= right ? left - right : right - left;
      const error = scale === 0n ? 0 : Number(difference) / Math.max(1, Number(scale));
      return error > best.error ? { error, path, actual, expected } : best;
    } catch {
      return best;
    }
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    let result = best;
    const length = Math.max(actual.length, expected.length);
    for (let index = 0; index < length; index += 1) {
      if (index >= actual.length || index >= expected.length) {
        result = result.error < 1 ? { error: 1, path: [...path, index], actual: actual[index], expected: expected[index] } : result;
        continue;
      }
      result = compareNumericState(actual[index], expected[index], [...path, index], result);
    }
    return result;
  }
  if (actual && expected && typeof actual === "object" && typeof expected === "object") {
    let result = best;
    const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
    for (const key of keys) {
      if (!(key in actual) || !(key in expected)) {
        result = result.error < 1 ? { error: 1, path: [...path, key], actual: (actual as Record<string, unknown>)[key], expected: (expected as Record<string, unknown>)[key] } : result;
        continue;
      }
      result = compareNumericState((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key], [...path, key], result);
    }
    return result;
  }
  return best;
}

function runExactSettlement(state: ReturnType<typeof migrateGame>, seconds: number) {
  if (!state) throw new Error("invalid fixture");
  const session = createSimulationAdvanceSession(structuredClone(state), seconds);
  while (session.remainingSeconds > 0) advanceOfflineSimulationChunk(session, { maximumWindowSeconds: 256 });
  return completeSimulationAdvanceSession(session);
}

describe("fast offline settlement real-save benchmark", () => {
  it.skipIf(!environment?.DSP_FAST_OFFLINE_FIXTURES)("runs read-only qualification for each supplied fixture", () => {
    const fixtures = environment!.DSP_FAST_OFFLINE_FIXTURES!.split(";").map((entry) => entry.trim()).filter(Boolean);
    const durations = [600, 3_600, 7 * 86_400, 30 * 86_400];
    const reports = fixtures.map((fixture) => {
      const raw = readFileSync(fixture, "utf8");
      const parsed = JSON.parse(raw);
      const state = migrateGame(parsed.state ?? parsed);
      expect(state).not.toBeNull();
      if (!state) return { fixture, reports: [] };
      state.paused = false;
      state.timeWarp.pendingSimulationSeconds = 0;
      state.timeWarp.pendingWallSeconds = 0;
      return {
        fixture,
        reports: durations.map((seconds) => {
          const startedAt = performance.now();
          const cpuBefore = nodeProcess?.cpuUsage() ?? { user: 0, system: 0 };
          const heapBefore = nodeProcess?.memoryUsage().heapUsed ?? 0;
          const result = runFastOfflineSettlement(structuredClone(state), seconds);
          const cpuAfter = nodeProcess?.cpuUsage(cpuBefore) ?? { user: 0, system: 0 };
          const heapAfter = nodeProcess?.memoryUsage().heapUsed ?? heapBefore;
          return {
            seconds,
            status: result.status,
            elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
            cpuUserMs: Math.round(cpuAfter.user / 1_000) / 1000,
            cpuSystemMs: Math.round(cpuAfter.system / 1_000) / 1000,
            heapDeltaBytes: heapAfter - heapBefore,
            rssBytes: nodeProcess?.memoryUsage().rss ?? 0,
            rawBytes: new TextEncoder().encode(raw).byteLength,
            entityCount: state.entities.length,
            beltCount: state.belts.length,
            report: result.report,
            elapsedSeconds: result.status === "approximate" ? result.state.elapsedSeconds : null,
          };
        }),
      };
    });
    console.log(`FAST_OFFLINE_SETTLEMENT_BENCHMARK ${JSON.stringify(reports)}`);
    if (environment?.DSP_FAST_OFFLINE_EXACT_COMPARE === "1") {
        const durations = (environment.DSP_FAST_OFFLINE_EXACT_SECONDS ?? "600,3600")
          .split(",").map((value) => Number(value.trim())).filter((value) => Number.isFinite(value) && value > 0);
      const exactComparisons = fixtures.map((fixture) => {
        const parsed = JSON.parse(readFileSync(fixture, "utf8"));
        const state = migrateGame(parsed.state ?? parsed);
        expect(state).not.toBeNull();
        if (!state) return { fixture, exactReports: [] };
        state.paused = false;
        state.timeWarp.pendingSimulationSeconds = 0;
        state.timeWarp.pendingWallSeconds = 0;
        const exactReports = durations.map((seconds) => {
          const exactStartedAt = performance.now();
          const exact = runExactSettlement(state, seconds);
          const exactElapsedMs = performance.now() - exactStartedAt;
          const fastStartedAt = performance.now();
          const fast = runFastOfflineSettlement(structuredClone(state), seconds);
          const fastElapsedMs = performance.now() - fastStartedAt;
          const comparison = fast.status === "approximate"
            ? compareNumericState(fast.state, exact)
            : { error: null, path: [], actual: null, expected: null };
          return {
            seconds,
            exactElapsedMs: Math.round(exactElapsedMs * 100) / 100,
            fastElapsedMs: Math.round(fastElapsedMs * 100) / 100,
            fastStatus: fast.status,
            fastReport: fast.report,
            fullStateMaxError: comparison.error,
            fullStateMaxErrorPath: comparison.path,
            fullStateActual: comparison.actual,
            fullStateExpected: comparison.expected,
          };
        });
        return { fixture, exactReports };
      });
      console.log(`FAST_OFFLINE_EXACT_COMPARISON ${JSON.stringify(exactComparisons)}`);
    }
    expect(reports).toHaveLength(fixtures.length);
  }, 180_000);
});
