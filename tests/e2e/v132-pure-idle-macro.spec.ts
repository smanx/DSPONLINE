import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const fixturePath = process.env.DSP_PURE_IDLE_MACRO_FIXTURE;
const fixtureRoute = "**/__dsp_pure_idle_macro_fixture.json";
const harnessPath = "/__dsp_pure_idle_macro_harness.html";

async function resetPureIdleRecoveryDatabase(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("dsp-idle-network.pure-idle-recovery");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("could not clear pure-idle recovery database"));
    request.onblocked = () => reject(new Error("pure-idle recovery database remained blocked"));
  }));
}

test.describe("1.0.32 pure-idle macro recovery", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`**${harnessPath}`, (route) => route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<!doctype html><html><body><main>DSP pure idle macro harness</main></body></html>",
    }));
    await page.goto(harnessPath);
    await resetPureIdleRecoveryDatabase(page);
  });

  test("keeps a durable checkpoint, rejects a second owner, and restores the starting pause state", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const engine = await import("/src/game/engine.ts");
      const recovery = await import("/src/game/pureIdleRecovery.ts");
      const state = engine.createInitialState(20_260_806, false);
      const created = await recovery.createPureIdleRecovery(state, "stable", 900, "owner-a", 1_000, true);
      if (!created.ok) throw new Error(created.message);
      const competing = await recovery.claimPureIdleRecovery("owner-b", 1_001);
      const persisted = await recovery.readPureIdleRecovery();
      await recovery.releasePureIdleRecoveryLease(created.record.sessionId, "owner-a", 1_002);
      const reclaimed = await recovery.claimPureIdleRecovery("owner-b", 1_003);
      if (!reclaimed.ok) throw new Error(reclaimed.message);
      const cleared = await recovery.clearPureIdleRecovery(reclaimed.record.sessionId, "owner-b");
      return {
        competing,
        startedPaused: persisted?.startedPaused,
        restoredOwner: reclaimed.record.ownerToken,
        cleared,
        remaining: await recovery.readPureIdleRecovery(),
      };
    });

    expect(result.competing).toMatchObject({ ok: false, reason: "owned" });
    expect(result.startedPaused).toBe(true);
    expect(result.restoredOwner).toBe("owner-b");
    expect(result.cleared).toBe(true);
    expect(result.remaining).toBeNull();
  });

  test("limits closed-page high-multiplier settlement to five minutes before ordinary offline time", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const engine = await import("/src/game/engine.ts");
      const recovery = await import("/src/game/pureIdleRecovery.ts");
      const startedAtMs = 1_000_000;
      const backgroundStartedAtMs = startedAtMs + 60_000;
      const created = await recovery.createPureIdleRecovery(
        engine.createInitialState(20_260_806, false),
        "stable",
        startedAtMs,
        "owner-a",
        startedAtMs,
      );
      if (!created.ok) throw new Error(created.message);
      await recovery.markPureIdleBackground(created.record.sessionId, "owner-a", backgroundStartedAtMs);
      const persisted = await recovery.readPureIdleRecovery();
      if (!persisted) throw new Error("background marker was not persisted");
      const plan = recovery.getPureIdleBackgroundPlan(
        persisted,
        backgroundStartedAtMs + (recovery.PURE_IDLE_BACKGROUND_GRACE_SECONDS + 600) * 1_000,
      );
      await recovery.clearPureIdleRecovery(created.record.sessionId, "owner-a");
      return plan;
    });

    expect(result.highWallSeconds).toBe(60 + 5 * 60);
    expect(result.normalOfflineSeconds).toBe(600);
    expect(result.graceExpired).toBe(true);
  });

  test("commits a grace-limited macro candidate before settling the ordinary offline remainder", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const contentPacks = await import("/src/game/contentPacks.ts");
      const engine = await import("/src/game/engine.ts");
      const offline = await import("/src/game/offlineSimulation.ts");
      const storage = await import("/src/game/storage.ts");
      const macro = await import("/src/game/pureIdleMacroClient.ts");
      const state = engine.createInitialState(20_260_806, false);
      state.entities = [{
        id: "macro-controller",
        kind: "machine",
        planetId: "home",
        position: { x: 0, y: 0 },
        interactionLocked: false,
        buildingId: "time_warp_device",
        machineCount: 1,
        minerCount: 0,
        inputs: {},
        outputs: {},
        progress: 0,
        routingCursor: 0,
        utilization: 0,
        productionRate: 0,
      }];
      state.belts = [];
      state.paused = false;
      state.timeWarp = { ...state.timeWarp, controllerEntityId: "macro-controller", enabled: true };
      const registry = contentPacks.createContentPackRuntimeSnapshot(contentPacks.createContentPackRegistry());
      const client = new macro.PureIdleMacroClient();
      await client.initialize(state, "stable", registry);
      const grace = await client.finalize(5 * 60);
      client.close();
      const ordinary = await offline.runOfflineSimulationInWorkerDetailed(grace.state, 600);
      const inspection = storage.inspectSave(storage.serializeEnvelope(ordinary.state));
      return {
        highWallSeconds: grace.summary.settledWallSeconds,
        timeWarpEnabled: ordinary.state.timeWarp.enabled,
        valid: inspection.valid,
      };
    });

    expect(result.highWallSeconds).toBe(5 * 60);
    expect(result.timeWarpEnabled).toBe(false);
    expect(result.valid).toBe(true);
  });

  test("rebuilds a killed macro Worker from its unchanged checkpoint and finalizes a valid save", async ({ page }) => {
    test.setTimeout(90_000);
    const result = await page.evaluate(async () => {
      const benchmark = await import("/src/game/benchmark.ts");
      const contentPacks = await import("/src/game/contentPacks.ts");
      const engine = await import("/src/game/engine.ts");
      const storage = await import("/src/game/storage.ts");
      const macro = await import("/src/game/pureIdleMacroClient.ts");
      let state = engine.createInitialState(20_260_806, false);
      state.entities = [{
        id: "macro-controller",
        kind: "machine",
        planetId: "home",
        position: { x: 0, y: 0 },
        interactionLocked: false,
        buildingId: "time_warp_device",
        machineCount: 1,
        minerCount: 0,
        inputs: {},
        outputs: {},
        progress: 0,
        routingCursor: 0,
        utilization: 0,
        productionRate: 0,
      }];
      state.belts = [];
      state.paused = false;
      state.timeWarp = {
        ...state.timeWarp,
        controllerEntityId: "macro-controller",
        enabled: true,
        pendingSimulationSeconds: 0,
        pendingWallSeconds: 0,
      };
      const sourceHash = benchmark.hashGameState(state);
      const registry = contentPacks.createContentPackRuntimeSnapshot(contentPacks.createContentPackRegistry());
      const first = new macro.PureIdleMacroClient();
      await first.initialize(state, "stable", registry);
      await first.advance(30);
      first.close();

      const recovery = new macro.PureIdleMacroClient();
      const startedAt = performance.now();
      await recovery.initialize(state, "stable", registry);
      const finalized = await recovery.finalize(24 * 60 * 60);
      const durationMs = performance.now() - startedAt;
      recovery.close();
      const raw = storage.serializeEnvelope(finalized.state);
      const inspection = storage.inspectSave(raw);
      return {
        durationMs,
        sourceHash,
        sourceHashAfter: benchmark.hashGameState(state),
        finalizedEnabled: finalized.state.timeWarp.enabled,
        valid: inspection.valid,
        settledWallSeconds: finalized.summary.settledWallSeconds,
      };
    });

    expect(result.sourceHashAfter).toBe(result.sourceHash);
    expect(result.finalizedEnabled).toBe(false);
    expect(result.valid).toBe(true);
    expect(result.settledWallSeconds).toBe(24 * 60 * 60);
    expect(result.durationMs).toBeLessThan(30_000);
  });

  test("30-day macro settlement of the configured real endgame save remains reloadable", async ({ page }) => {
    test.skip(!fixturePath, "set DSP_PURE_IDLE_MACRO_FIXTURE to a read-only endgame save");
    test.setTimeout(120_000);
    const raw = readFileSync(fixturePath!, "utf8");
    await page.route(fixtureRoute, (route) => route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: raw,
    }));
    const result = await page.evaluate(async () => {
      const benchmark = await import("/src/game/benchmark.ts");
      const contentPacks = await import("/src/game/contentPacks.ts");
      const storage = await import("/src/game/storage.ts");
      const macro = await import("/src/game/pureIdleMacroClient.ts");
      const parsed = await fetch("/__dsp_pure_idle_macro_fixture.json").then((response) => response.json());
      const state = storage.migrateGame(parsed.state ?? parsed) as Record<string, any> | null;
      if (!state) throw new Error("fixture migration failed");
      const controller = state.entities.find((entity: Record<string, unknown>) => entity.buildingId === "time_warp_device");
      if (!controller?.id) throw new Error("fixture has no time-warp controller");
      state.paused = false;
      state.speedrun = undefined;
      state.research.selectedTechId = null;
      state.endgame.activeInfiniteResearchId = null;
      state.timeWarp.controllerEntityId = controller.id;
      state.timeWarp.enabled = true;
      state.timeWarp.pendingSimulationSeconds = 0;
      state.timeWarp.pendingWallSeconds = 0;
      const sourceHash = benchmark.hashGameState(state);
      const entities = state.entities.length;
      const belts = state.belts.length;
      const registry = contentPacks.createContentPackRuntimeSnapshot(contentPacks.createContentPackRegistry());
      const client = new macro.PureIdleMacroClient();
      const startedAt = performance.now();
      await client.initialize(state, "extreme", registry);
      const finalized = await client.finalize(30 * 24 * 60 * 60);
      const durationMs = performance.now() - startedAt;
      client.close();
      const raw = storage.serializeEnvelope(finalized.state);
      const inspection = storage.inspectSave(raw);
      const routesValid = finalized.state.entities.every((entity: Record<string, any>) =>
        (entity.stationRoutes ?? []).every((route: Record<string, unknown>) =>
          Number.isSafeInteger(route.cargo) && Number(route.cargo) >= 0 &&
          typeof route.progress === "number" && route.progress >= 0 && route.progress <= 1));
      return {
        durationMs,
        sourceUnchanged: benchmark.hashGameState(state) === sourceHash,
        valid: inspection.valid,
        routesValid,
        entityCountPreserved: finalized.state.entities.length === entities,
        beltCountPreserved: finalized.state.belts.length === belts,
        settledWallSeconds: finalized.summary.settledWallSeconds,
      };
    });

    expect(result.sourceUnchanged).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.routesValid).toBe(true);
    expect(result.entityCountPreserved).toBe(true);
    expect(result.beltCountPreserved).toBe(true);
    expect(result.settledWallSeconds).toBe(30 * 24 * 60 * 60);
    expect(result.durationMs).toBeLessThan(30_000);
    console.log(`PURE_IDLE_MACRO_REAL_SAVE ${JSON.stringify(result)}`);
  });
});
