import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  advanceSimulationSession,
  completeSimulationAdvanceSession,
  createSimulationAdvanceSession,
  createSimulationProfiler,
} from "./engine";
import { migrateGame } from "./storage";
import { getNextOfflineCriticalEvent } from "./offlineCriticalEvents";
import { advanceOfflineSimulationChunk } from "./offlineSimulation";
import { hashGameState } from "./benchmark";

const environment = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env;

describe("offline exact scheduler benchmark", () => {
  it.skipIf(!environment?.DSP_OFFLINE_BENCHMARK || !environment.DSP_REAL_FIXTURE)(
    "compares legacy critical scans with the five-second batched scheduler",
    () => {
      const raw = readFileSync(environment!.DSP_REAL_FIXTURE!, "utf8");
      const parsed = JSON.parse(raw);
      const migrated = migrateGame(parsed.state ?? parsed);
      expect(migrated).not.toBeNull();
      const source = migrated!;
      source.paused = false;
      source.timeWarp.pendingSimulationSeconds = 0;
      source.timeWarp.pendingWallSeconds = 0;
      const run = (seconds: number, optimized: boolean) => {
        const session = createSimulationAdvanceSession(structuredClone(source), seconds);
        const startedAt = performance.now();
        while (session.remainingSeconds > 0) {
          if (optimized) {
            advanceOfflineSimulationChunk(session, { maximumWindowSeconds: 256 });
          } else {
            const event = getNextOfflineCriticalEvent(session.state, session.remainingSeconds, 256);
            advanceSimulationSession(session, event?.seconds ?? 256);
          }
        }
        const result = completeSimulationAdvanceSession(session);
        return { durationMs: performance.now() - startedAt, hash: hashGameState(result) };
      };
      const reports = [5, 10, 60, 600].map((seconds) => ({
        seconds,
        legacy: run(seconds, false),
        optimized: run(seconds, true),
      }));
      expect(reports.every((report) => report.legacy.hash === report.optimized.hash)).toBe(true);
      console.log(`OFFLINE_SCHEDULER_BENCHMARK ${JSON.stringify({ reports })}`);
    },
    180_000,
  );

  it.skipIf(!environment?.DSP_OFFLINE_PROFILE || !environment.DSP_REAL_FIXTURE)(
    "profiles the indexed exact path",
    () => {
      const raw = readFileSync(environment!.DSP_REAL_FIXTURE!, "utf8");
      const parsed = JSON.parse(raw);
      const migrated = migrateGame(parsed.state ?? parsed);
      expect(migrated).not.toBeNull();
      if (!migrated) return;
      migrated.paused = false;
      migrated.timeWarp.pendingSimulationSeconds = 0;
      migrated.timeWarp.pendingWallSeconds = 0;
      const profiler = createSimulationProfiler();
      const session = createSimulationAdvanceSession(structuredClone(migrated), 60, { profiler });
      const startingElapsed = session.state.elapsedSeconds;
      const startedAt = performance.now();
      while (session.remainingSeconds > 0) advanceOfflineSimulationChunk(session, { maximumWindowSeconds: 256 });
      const result = completeSimulationAdvanceSession(session);
      console.log(`OFFLINE_EXACT_PROFILE ${JSON.stringify({ durationMs: performance.now() - startedAt, hash: hashGameState(result), profiler })}`);
      expect(result.elapsedSeconds).toBeCloseTo(startingElapsed + 60, 6);
    },
    120_000,
  );
});
