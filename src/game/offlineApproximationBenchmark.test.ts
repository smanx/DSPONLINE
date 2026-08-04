import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrateGame } from "./storage";
import { runOfflineApproximation } from "./offlineApproximation";

const environment = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env;

describe("offline approximation real-save benchmark", () => {
  it.skipIf(!environment?.DSP_APPROX_FIXTURE)("runs read-only qualification at every requested duration", () => {
    const raw = readFileSync(environment!.DSP_APPROX_FIXTURE!, "utf8");
    const parsed = JSON.parse(raw);
    const state = migrateGame(parsed.state ?? parsed);
    expect(state).not.toBeNull();
    if (!state) return;
    state.paused = false;
    state.timeWarp.pendingSimulationSeconds = 0;
    state.timeWarp.pendingWallSeconds = 0;
    const durations = [10, 60, 600, 3_600, 86_400, 30 * 86_400];
    const reports = durations.map((seconds) => {
      const startedAt = performance.now();
      const result = runOfflineApproximation(structuredClone(state), seconds);
      return {
        seconds,
        status: result.status,
        elapsedMs: performance.now() - startedAt,
        report: result.report,
      };
    });
    console.log(`OFFLINE_APPROXIMATION_BENCHMARK ${JSON.stringify(reports)}`);
    expect(reports).toHaveLength(6);
  }, 180_000);
});

