import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const fixturePath = process.env.DSP_REAL_OFFLINE_TIME_WARP_FIXTURE;
const fixtureRoute = "**/__dsp_real_offline_timewarp_fixture.json";
const harnessPath = "/__dsp_worker_harness.html";

test.describe("1.0.30 real-save offline and pure-idle workers", () => {
  test.skip(!fixturePath, "set DSP_REAL_OFFLINE_TIME_WARP_FIXTURE to a read-only save path");

  test.beforeEach(async ({ page }) => {
    const raw = readFileSync(fixturePath!, "utf8");
    await page.route(fixtureRoute, (route) => route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: raw,
    }));
    await page.route(`**${harnessPath}`, (route) => route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<!doctype html><html><body><main>DSP worker test harness</main></body></html>",
    }));
  });

  test("30-day fast offline completes through the browser Worker without changing the source", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(harnessPath);
    const result = await page.evaluate(async () => {
      const loadModule = new Function("specifier", "return import(specifier)") as
        (specifier: string) => Promise<Record<string, (...args: never[]) => unknown>>;
      const storage = await loadModule("/src/game/storage.ts");
      const contentPacks = await loadModule("/src/game/contentPacks.ts");
      const parsed = await fetch("/__dsp_real_offline_timewarp_fixture.json").then((response) => response.json());
      const state = storage.migrateGame(parsed.state ?? parsed) as Record<string, any> | null;
      if (!state) throw new Error("fixture migration failed");
      state.paused = false;
      state.timeWarp.pendingSimulationSeconds = 0;
      state.timeWarp.pendingWallSeconds = 0;
      const source = JSON.stringify({
        elapsedSeconds: state.elapsedSeconds,
        savedAt: state.savedAt,
        totalProduced: state.totalProduced,
        dysonSphere: state.dysonSphere,
      });
      const registry = contentPacks.createContentPackRuntimeSnapshot(contentPacks.loadContentPackRegistry()) as Record<string, unknown>;
      const worker = new Worker(new URL("/src/game/offlineSimulation.worker.ts", window.location.href), {
        type: "module",
        name: "real-save-offline-e2e",
      });
      const startedAt = performance.now();
      const response = await new Promise<Record<string, any>>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("offline Worker exceeded 45 seconds")), 45_000);
        worker.onerror = () => {
          window.clearTimeout(timeout);
          reject(new Error("offline Worker failed"));
        };
        worker.onmessage = (event: MessageEvent<Record<string, any>>) => {
          if (event.data.type === "progress") return;
          window.clearTimeout(timeout);
          if (event.data.type === "complete") resolve(event.data);
          else reject(new Error(event.data.message ?? event.data.type ?? "offline Worker returned an unknown result"));
        };
        worker.postMessage({
          type: "start",
          id: 1,
          state,
          seconds: 30 * 24 * 60 * 60,
          registry,
          approximate: true,
        });
      });
      const roundTripMs = performance.now() - startedAt;
      worker.terminate();
      const output = response.state as Record<string, any>;
      return {
        roundTripMs,
        approximation: response.approximation,
        sourceUnchanged: source === JSON.stringify({
          elapsedSeconds: state.elapsedSeconds,
          savedAt: state.savedAt,
          totalProduced: state.totalProduced,
          dysonSphere: state.dysonSphere,
        }),
        elapsedAdvance: output.elapsedSeconds - state.elapsedSeconds,
        criticalFinite: [
          output.totalProduced?.universe_matrix ?? 0,
          output.dysonSphere?.totalRocketsLaunched ?? 0,
          output.dysonSphere?.structurePoints ?? 0,
          output.dysonSphere?.generationKw ?? 0,
          output.dysonSwarm?.generationKw ?? 0,
        ].every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0),
      };
    });

    expect(result.sourceUnchanged).toBe(true);
    expect(result.criticalFinite).toBe(true);
    expect(result.elapsedAdvance).toBeCloseTo(30 * 24 * 60 * 60, 3);
    expect(result.approximation).toMatchObject({ mode: "approximate", algorithmVersion: "fast-30s-v1" });
    expect(result.roundTripMs).toBeLessThan(30_000);
    console.log(`BROWSER_FAST_OFFLINE ${JSON.stringify(result)}`);
  });

  test("8x, 12x and 16x slices stay under the browser safety timeout and terminate promptly", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(harnessPath);
    const result = await page.evaluate(async () => {
      const loadModule = new Function("specifier", "return import(specifier)") as
        (specifier: string) => Promise<Record<string, (...args: never[]) => unknown>>;
      const storage = await loadModule("/src/game/storage.ts");
      const contentPacks = await loadModule("/src/game/contentPacks.ts");
      const parsed = await fetch("/__dsp_real_offline_timewarp_fixture.json").then((response) => response.json());
      const state = storage.migrateGame(parsed.state ?? parsed) as Record<string, any> | null;
      if (!state) throw new Error("fixture migration failed");
      state.paused = false;
      state.timeWarp.enabled = true;
      state.timeWarp.pendingSimulationSeconds = 0;
      state.timeWarp.pendingWallSeconds = 0;
      const controller = state.entities.find((entity: Record<string, unknown>) => entity.buildingId === "time_warp_device");
      if (controller) state.timeWarp.controllerEntityId = controller.id;
      const sourceCritical = JSON.stringify({
        elapsedSeconds: state.elapsedSeconds,
        totalProduced: state.totalProduced,
        dysonSphere: state.dysonSphere,
      });
      const registry = contentPacks.createContentPackRuntimeSnapshot(contentPacks.loadContentPackRegistry()) as Record<string, unknown>;
      const worker = new Worker(new URL("/src/game/simulation.worker.ts", window.location.href), {
        type: "module",
        name: "real-save-time-warp-e2e",
      });
      const slices = [
        { multiplier: 8, simulationSeconds: 64 },
        { multiplier: 12, simulationSeconds: 96 },
        { multiplier: 16, simulationSeconds: 128 },
      ];
      const reports: Array<Record<string, any>> = [];
      for (let index = 0; index < slices.length; index += 1) {
        const slice = slices[index];
        const startedAt = performance.now();
        const response = await new Promise<Record<string, any>>((resolve, reject) => {
          const timeout = window.setTimeout(() => reject(new Error(`${slice.multiplier}x Worker exceeded 8 seconds`)), 8_000);
          worker.onerror = () => {
            window.clearTimeout(timeout);
            reject(new Error(`${slice.multiplier}x Worker failed`));
          };
          worker.onmessage = (event: MessageEvent<Record<string, any>>) => {
            if (event.data.id !== index + 1) return;
            window.clearTimeout(timeout);
            resolve(event.data);
          };
          worker.postMessage({
            id: index + 1,
            ...(index === 0 ? { state, registry } : {}),
            simulationSeconds: slice.simulationSeconds,
            wallSeconds: slice.simulationSeconds / slice.multiplier,
            registryFingerprint: registry.fingerprint,
            protocol: "full",
            approximate: true,
          });
        });
        reports.push({
          multiplier: slice.multiplier,
          roundTripMs: performance.now() - startedAt,
          durationMs: response.durationMs,
          approximation: response.timeWarpApproximation,
          criticalFinite: [
            response.state?.totalProduced?.universe_matrix ?? 0,
            response.state?.dysonSphere?.totalRocketsLaunched ?? 0,
            response.state?.dysonSphere?.structurePoints ?? 0,
            response.state?.dysonSphere?.generationKw ?? 0,
            response.state?.dysonSwarm?.generationKw ?? 0,
          ].every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0),
        });
      }
      let lateMessage = false;
      worker.onmessage = () => { lateMessage = true; };
      worker.postMessage({
        id: 99,
        simulationSeconds: 128,
        wallSeconds: 8,
        registryFingerprint: registry.fingerprint,
        protocol: "full",
        approximate: true,
      });
      const terminateStartedAt = performance.now();
      worker.terminate();
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      return {
        reports,
        terminateMs: performance.now() - terminateStartedAt,
        lateMessage,
        sourceUnchanged: sourceCritical === JSON.stringify({
          elapsedSeconds: state.elapsedSeconds,
          totalProduced: state.totalProduced,
          dysonSphere: state.dysonSphere,
        }),
      };
    });

    expect(result.sourceUnchanged).toBe(true);
    expect(result.lateMessage).toBe(false);
    expect(result.terminateMs).toBeLessThan(1_000);
    expect(result.reports).toHaveLength(3);
    for (const report of result.reports) {
      expect(report.criticalFinite).toBe(true);
      expect(report.approximation).toMatchObject({ mode: "approximate", algorithmVersion: "time-warp-short-calibration-v2" });
      expect(report.durationMs).toBeLessThan(5_000);
      expect(report.roundTripMs).toBeLessThan(5_000);
    }
    console.log(`BROWSER_TIME_WARP ${JSON.stringify(result)}`);
  });
});
