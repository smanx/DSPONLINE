import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

const LARGE_SAVE_FIXTURE = process.env.DSP_V144_LARGE_SAVE;
const AUTHORITATIVE_LARGE_SAVE_SHA256 = "cd2356ea2b9a90a47cfa32ed9533e7056bfc4202f6af777fc4f3b98faa9a81b1";
// This file can receive the private 35 MiB acceptance fixture through a page
// argument. Never let Playwright copy that payload into diagnostics artifacts.
test.use({ trace: "off", screenshot: "off", video: "off" });

function outputFiles(root: string): Array<{ path: string; bytes: number }> {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = `${root}/${entry.name}`;
    return entry.isDirectory() ? outputFiles(path) : [{ path, bytes: statSync(path).size }];
  });
}

test("authoritative Worker uses projection-only steady responses and exact ordered checkpoints", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const benchmark = await import("/src/game/benchmark.ts");
    const engine = await import("/src/game/engine.ts");
    const packs = await import("/src/game/contentPacks.ts");
    const projectionModule = await import("/src/game/simulationProjection.ts");
    const protocol = await import("/src/game/simulationRuntimeProtocol.ts");
    const registry = packs.createContentPackRuntimeSnapshot(packs.createContentPackRegistry());
    const source = engine.createInitialState(14_044);
    source.paused = false;
    source.entities[0].inputs.iron_ore = 20;
    source.research.completedTechIds.push("dyson_sphere_program");
    source.dysonSphere.structurePoints = 137;
    const canonicalSource = JSON.parse(JSON.stringify(source)) as typeof source;
    const oracle = engine.createPersistentSimulationRuntime(structuredClone(canonicalSource));
    const worker = new Worker(new URL("/src/game/simulation.worker.ts", location.origin), { type: "module" });
    const request = (payload: Record<string, unknown>, transfer: Transferable[] = []) => new Promise<Record<string, unknown>>((resolve, reject) => {
      const id = payload.id as number;
      const timeout = window.setTimeout(() => reject(new Error(`runtime request ${id} timed out`)), 15_000);
      const listener = (event: MessageEvent<Record<string, unknown>>) => {
        if (event.data.id !== id) return;
        worker.removeEventListener("message", listener);
        window.clearTimeout(timeout);
        resolve(event.data);
      };
      worker.addEventListener("message", listener);
      worker.postMessage(payload, transfer);
    });

    const stateTransfer = protocol.serializeSimulationStateForTransfer(canonicalSource);
    const initialized = await request({
      id: 1,
      kind: "advance",
      stateTransfer,
      simulationSeconds: 0,
      wallSeconds: 0,
      registryFingerprint: registry.fingerprint,
      registry,
      protocol: "projection",
      stateRevision: 0,
    }, [stateTransfer.buffer]);

    engine.advancePersistentSimulationRuntime(oracle, 1, 1);
    const advanced = await request({
      id: 2,
      kind: "advance",
      simulationSeconds: 1,
      wallSeconds: 1,
      registryFingerprint: registry.fingerprint,
      protocol: "projection",
      stateRevision: initialized.stateRevision,
      profile: true,
    });
    const projection = advanced.projection as import("../../src/game/simulationProjection").SimulationProjection;
    const projected = projectionModule.applySimulationProjectionToState(canonicalSource, projection).state;
    const checkpointResponse = await request({
      id: 3,
      kind: "checkpoint",
      simulationSeconds: 0,
      wallSeconds: 0,
      registryFingerprint: registry.fingerprint,
      protocol: "projection",
      stateRevision: advanced.stateRevision,
    });
    const checkpoint = protocol.deserializeSimulationStateTransfer(
      checkpointResponse.checkpoint as import("../../src/game/simulationRuntimeProtocol").SimulationStateTransfer,
    );

    const commandView = structuredClone(projected);
    commandView.entities[0].interactionLocked = true;
    commandView.settings.reducedMotion = !commandView.settings.reducedMotion;
    const command = protocol.createSimulationCommandPatch(projected, commandView, advanced.stateRevision as number)!;
    const commandCheckpointResponse = await request({
      id: 4,
      kind: "checkpoint",
      command,
      simulationSeconds: 0,
      wallSeconds: 0,
      registryFingerprint: registry.fingerprint,
      protocol: "projection",
      stateRevision: advanced.stateRevision,
    });
    const commandedCheckpoint = protocol.deserializeSimulationStateTransfer(
      commandCheckpointResponse.checkpoint as import("../../src/game/simulationRuntimeProtocol").SimulationStateTransfer,
    );
    const dysonEdited = engine.addDysonLayer(commandedCheckpoint, "helios");
    const dysonCommand = protocol.createSimulationCommandPatch(
      commandedCheckpoint,
      dysonEdited,
      commandCheckpointResponse.stateRevision as number,
    )!;
    const dysonProjectionResponse = await request({
      id: 5,
      kind: "sync-projection",
      command: dysonCommand,
      simulationSeconds: 0,
      wallSeconds: 0,
      registryFingerprint: registry.fingerprint,
      protocol: "projection",
      stateRevision: commandCheckpointResponse.stateRevision,
    });
    const dysonProjection = dysonProjectionResponse.projection as import("../../src/game/simulationProjection").SimulationProjection;
    const dysonProjected = projectionModule.applySimulationProjectionToState(commandedCheckpoint, dysonProjection).state;
    const dysonCheckpointResponse = await request({
      id: 6,
      kind: "checkpoint",
      simulationSeconds: 0,
      wallSeconds: 0,
      registryFingerprint: registry.fingerprint,
      protocol: "projection",
      stateRevision: dysonProjectionResponse.stateRevision,
    });
    const dysonCheckpoint = protocol.deserializeSimulationStateTransfer(
      dysonCheckpointResponse.checkpoint as import("../../src/game/simulationRuntimeProtocol").SimulationStateTransfer,
    );
    const staleCommand = { ...dysonCommand, baseRevision: 0 };
    const rejected = await request({
      id: 7,
      kind: "advance",
      command: staleCommand,
      simulationSeconds: 1,
      wallSeconds: 1,
      registryFingerprint: registry.fingerprint,
      protocol: "projection",
      stateRevision: dysonCheckpointResponse.stateRevision,
    });
    const resyncCheckpoint = protocol.deserializeSimulationStateTransfer(
      rejected.checkpoint as import("../../src/game/simulationRuntimeProtocol").SimulationStateTransfer,
    );
    // Checkpoints use the persisted JSON contract, which intentionally drops
    // optional properties whose value is undefined (for example speedrun).
    const canonicalDysonEdited = JSON.parse(JSON.stringify(dysonEdited)) as typeof dysonEdited;
    const unexpectedDysonPatch = protocol.createSimulationCommandPatch(canonicalDysonEdited, dysonCheckpoint, 0);
    worker.terminate();

    const canonicalOracle = JSON.parse(JSON.stringify(oracle.state)) as typeof oracle.state;
    return {
      initializedHasState: "state" in initialized,
      steadyHasState: "state" in advanced,
      steadyHasDelta: "delta" in advanced,
      responseBytes: advanced.transferBytes as number,
      projectedElapsedSeconds: projected.elapsedSeconds,
      oracleElapsedSeconds: canonicalOracle.elapsedSeconds,
      checkpointHash: benchmark.hashGameState(checkpoint),
      oracleHash: benchmark.hashGameState(canonicalOracle),
      commandRevision: commandCheckpointResponse.stateRevision as number,
      commandLocked: commandedCheckpoint.entities[0].interactionLocked,
      commandReducedMotion: commandedCheckpoint.settings.reducedMotion,
      dysonRevision: dysonCheckpointResponse.stateRevision as number,
      dysonProjectionHasState: "state" in dysonProjectionResponse,
      dysonProjectionHasCheckpoint: "checkpoint" in dysonProjectionResponse,
      dysonProjectionEntityCount: dysonProjection.changedEntities.length,
      dysonProjectionTopLevelKeys: Object.keys(dysonProjection.topLevel).sort(),
      dysonProjectedLayerCount: dysonProjected.dysonPlans.helios.layers.length,
      dysonLayerCount: dysonCheckpoint.dysonPlans.helios.layers.length,
      dysonStructurePoints: dysonCheckpoint.dysonPlans.helios.structurePoints,
      dysonStructureConserved: Object.values(dysonCheckpoint.dysonPlans).reduce((sum, plan) => sum + plan.structurePoints, 0) === dysonCheckpoint.dysonSphere.structurePoints,
      dysonHash: benchmark.hashGameState(dysonCheckpoint),
      expectedDysonHash: benchmark.hashGameState(canonicalDysonEdited),
      dysonMismatchPaths: unexpectedDysonPatch?.topLevelChanges.map((change) => change.path.join(".")) ?? [],
      dysonMismatchEntityIds: unexpectedDysonPatch?.changedEntities.map((entity) => entity.id) ?? [],
      dysonMismatchBeltIds: unexpectedDysonPatch?.changedBelts.map((belt) => belt.id) ?? [],
      staleRejected: rejected.needsResync === true,
      resyncHash: benchmark.hashGameState(resyncCheckpoint),
      rejectedElapsedSeconds: resyncCheckpoint.elapsedSeconds,
      dysonElapsedSeconds: dysonCheckpoint.elapsedSeconds,
    };
  });

  expect(result.initializedHasState).toBe(false);
  expect(result.steadyHasState).toBe(false);
  expect(result.steadyHasDelta).toBe(false);
  expect(result.responseBytes).toBeGreaterThan(0);
  expect(result.responseBytes).toBeLessThanOrEqual(1024 * 1024);
  expect(result.projectedElapsedSeconds).toBeCloseTo(result.oracleElapsedSeconds, 8);
  expect(result.checkpointHash).toBe(result.oracleHash);
  expect(result.commandRevision).toBe(3);
  expect(result.commandLocked).toBe(true);
  expect(result.commandReducedMotion).toBe(true);
  expect(result.dysonRevision).toBe(4);
  expect(result.dysonProjectionHasState).toBe(false);
  expect(result.dysonProjectionHasCheckpoint).toBe(false);
  expect(result.dysonProjectionEntityCount).toBe(0);
  expect(result.dysonProjectionTopLevelKeys).toEqual(["dysonPlans", "productionHistory"]);
  expect(result.dysonProjectedLayerCount).toBe(1);
  expect(result.dysonLayerCount).toBe(1);
  expect(result.dysonStructurePoints).toBe(137);
  expect(result.dysonStructureConserved).toBe(true);
  expect(result.dysonMismatchPaths).toEqual([]);
  expect(result.dysonMismatchEntityIds).toEqual([]);
  expect(result.dysonMismatchBeltIds).toEqual([]);
  expect(result.dysonHash).toBe(result.expectedDysonHash);
  expect(result.staleRejected).toBe(true);
  expect(result.rejectedElapsedSeconds).toBe(result.dysonElapsedSeconds);
  expect(result.resyncHash).toBe(result.dysonHash);
});

test("active-planet command publishes a full exact snapshot for unchanged records", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const engine = await import("/src/game/engine.ts");
    const packs = await import("/src/game/contentPacks.ts");
    const projectionModule = await import("/src/game/simulationProjection.ts");
    const protocol = await import("/src/game/simulationRuntimeProtocol.ts");
    const registry = packs.createContentPackRuntimeSnapshot(packs.createContentPackRegistry());
    const source = engine.createInitialState(44_002);
    source.paused = false;
    const staticEntity = {
      ...structuredClone(source.entities[0]),
      id: "frost-unchanged-runtime-record",
      planetId: "frost" as const,
      machineCount: 0,
    };
    source.entities.push(staticEntity);
    const canonical = JSON.parse(JSON.stringify(source)) as typeof source;
    const switchedView = { ...structuredClone(canonical), activePlanetId: "frost" as const };
    const worker = new Worker(new URL("/src/game/simulation.worker.ts", location.origin), { type: "module" });
    const request = (payload: Record<string, unknown>, transfer: Transferable[] = []) => new Promise<Record<string, unknown>>((resolve, reject) => {
      const id = payload.id as number;
      const timeout = window.setTimeout(() => reject(new Error(`planet request ${id} timed out`)), 15_000);
      const listener = (event: MessageEvent<Record<string, unknown>>) => {
        if (event.data.id !== id) return;
        worker.removeEventListener("message", listener);
        window.clearTimeout(timeout);
        resolve(event.data);
      };
      worker.addEventListener("message", listener);
      worker.postMessage(payload, transfer);
    });
    const transfer = protocol.serializeSimulationStateForTransfer(canonical);
    const initialized = await request({
      id: 1,
      kind: "advance",
      stateTransfer: transfer,
      simulationSeconds: 0,
      wallSeconds: 0,
      registryFingerprint: registry.fingerprint,
      registry,
      protocol: "projection",
    }, [transfer.buffer]);
    const command = protocol.createSimulationCommandPatch(canonical, switchedView, initialized.stateRevision as number)!;
    const advanced = await request({
      id: 2,
      kind: "advance",
      command,
      simulationSeconds: 1,
      wallSeconds: 1,
      registryFingerprint: registry.fingerprint,
      protocol: "projection",
    });
    const projection = advanced.projection as import("../../src/game/simulationProjection").SimulationProjection;
    const applied = projectionModule.applySimulationProjectionToState(switchedView, projection).state;
    const checkpointResponse = await request({
      id: 3,
      kind: "checkpoint",
      simulationSeconds: 0,
      wallSeconds: 0,
      registryFingerprint: registry.fingerprint,
      protocol: "projection",
    });
    const checkpoint = protocol.deserializeSimulationStateTransfer(
      checkpointResponse.checkpoint as import("../../src/game/simulationRuntimeProtocol").SimulationStateTransfer,
    );
    worker.terminate();
    const projectedFrost = applied.entities.filter((entity) => entity.planetId === "frost");
    const exactFrost = checkpoint.entities.filter((entity) => entity.planetId === "frost");
    return {
      requiresFullSnapshot: projection.requiresFullSnapshot,
      changedIds: projection.changedEntityIds,
      fullRecordIds: projection.changedEntities.map((entity) => entity.id),
      projectedFrost,
      exactFrost,
    };
  });
  expect(result.requiresFullSnapshot).toBe(true);
  expect(result.changedIds).toContain("frost-unchanged-runtime-record");
  expect(result.fullRecordIds).toContain("frost-unchanged-runtime-record");
  expect(result.projectedFrost).toEqual(result.exactFrost);
});

test("game runtime requeues a rejected slice exactly once across Pause and resume", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("dsp-idle-network.test-bypass-menu", "1");
    localStorage.setItem("dsp-idle-network.release-notes.seen.v1", "2026-08-14-v1.0.43");
    localStorage.setItem("dsp-idle-network.onboarding.v1", "dismissed");
    const tracker = {
      armed: false,
      injected: false,
      rejectedId: 0,
      rejectedSeconds: 0,
      rejectedWallSeconds: 0,
      resyncSeen: false,
      resyncElapsedSeconds: 0,
      resumeAttempt: 0,
      retryIds: [] as number[],
      retrySeconds: [] as number[],
      retryWallSeconds: [] as number[],
      retryElapsedSeconds: [] as number[],
    };
    (window as typeof window & { __v144ResyncTracker?: typeof tracker }).__v144ResyncTracker = tracker;
    const pauseSoon = () => window.setTimeout(() => {
      const button = document.querySelector<HTMLButtonElement>('[aria-label="暂停模拟"]');
      button?.click();
    }, 0);
    const NativeWorker = window.Worker;
    const WrappedWorker = new Proxy(NativeWorker, {
      construct(target, args) {
        const worker = Reflect.construct(target, args) as Worker;
        const isSimulation = String(args[0]).includes("simulation.worker") && (args[1] as WorkerOptions | undefined)?.name === "factory-simulation";
        if (!isSimulation) return worker;
        worker.addEventListener("message", (event: MessageEvent<Record<string, unknown>>) => {
          if (event.data.needsResync && Number(event.data.id) === tracker.rejectedId) {
            const checkpoint = event.data.checkpoint as { buffer?: ArrayBuffer } | undefined;
            if (checkpoint?.buffer) {
              const state = JSON.parse(new TextDecoder().decode(new Uint8Array(checkpoint.buffer))) as { elapsedSeconds: number };
              tracker.resyncElapsedSeconds = state.elapsedSeconds;
            }
            tracker.resyncSeen = true;
            pauseSoon();
            return;
          }
          const retryIndex = tracker.retryIds.indexOf(Number(event.data.id));
          if (retryIndex < 0 || event.data.needsResync) return;
          const projection = event.data.projection as { topLevel?: { elapsedSeconds?: number } } | undefined;
          if (typeof projection?.topLevel?.elapsedSeconds === "number") {
            tracker.retryElapsedSeconds[retryIndex] = projection.topLevel.elapsedSeconds;
          }
          pauseSoon();
        });
        const nativePostMessage = worker.postMessage.bind(worker);
        worker.postMessage = ((message: Record<string, unknown>, transferOrOptions?: Transferable[] | StructuredSerializeOptions) => {
          const steadyAdvance = message.kind === "advance" && !message.stateTransfer && Number(message.simulationSeconds) > 0;
          let outgoing = message;
          if (tracker.armed && !tracker.injected && steadyAdvance) {
            tracker.injected = true;
            tracker.rejectedId = Number(message.id);
            tracker.rejectedSeconds = Number(message.simulationSeconds);
            tracker.rejectedWallSeconds = Number(message.wallSeconds);
            outgoing = {
              ...message,
              command: {
                protocolVersion: 1,
                baseRevision: -1,
                topLevelChanges: [],
                changedEntities: [],
                addedEntities: [],
                removedEntityIds: [],
                changedBelts: [],
                addedBelts: [],
                removedBeltIds: [],
              },
            };
          } else if (tracker.resyncSeen && tracker.resumeAttempt > 0 && steadyAdvance && tracker.retryIds.length < tracker.resumeAttempt) {
            tracker.retryIds.push(Number(message.id));
            tracker.retrySeconds.push(Number(message.simulationSeconds));
            tracker.retryWallSeconds.push(Number(message.wallSeconds));
          }
          if (transferOrOptions === undefined) nativePostMessage(outgoing);
          else nativePostMessage(outgoing, transferOrOptions);
        }) as typeof worker.postMessage;
        return worker;
      },
    });
    Object.defineProperty(window, "Worker", { configurable: true, writable: true, value: WrappedWorker });
  });

  await page.goto("/");
  const shell = page.locator(".game-shell");
  await expect(shell).toBeVisible({ timeout: 15_000 });
  await expect(shell).toHaveAttribute("data-simulation-worker", "active");
  await expect(page.getByLabel("暂停模拟")).toBeVisible();
  await page.evaluate(() => {
    const tracker = (window as typeof window & { __v144ResyncTracker?: { armed: boolean } }).__v144ResyncTracker!;
    tracker.armed = true;
    const until = performance.now() + 2_250;
    while (performance.now() < until) { /* force one bounded two-second scheduler slice */ }
  });
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __v144ResyncTracker?: { resyncSeen: boolean } }
  ).__v144ResyncTracker?.resyncSeen ?? false), { timeout: 15_000 }).toBe(true);
  await expect(page.getByLabel("继续模拟")).toBeVisible();

  await page.evaluate(() => {
    (window as typeof window & { __v144ResyncTracker?: { resumeAttempt: number } }).__v144ResyncTracker!.resumeAttempt = 1;
  });
  await page.getByLabel("继续模拟").click();
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __v144ResyncTracker?: { retryElapsedSeconds: number[] } }
  ).__v144ResyncTracker?.retryElapsedSeconds.length ?? 0), { timeout: 15_000 }).toBe(1);
  await expect(page.getByLabel("继续模拟")).toBeVisible();
  // Let one paused scheduler tick discard only the fresh wall-clock remainder
  // accumulated after the retried two-second slice was taken.
  await page.waitForTimeout(1_100);

  await page.evaluate(() => {
    (window as typeof window & { __v144ResyncTracker?: { resumeAttempt: number } }).__v144ResyncTracker!.resumeAttempt = 2;
  });
  await page.getByLabel("继续模拟").click();
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __v144ResyncTracker?: { retryElapsedSeconds: number[] } }
  ).__v144ResyncTracker?.retryElapsedSeconds.length ?? 0), { timeout: 15_000 }).toBe(2);
  await expect(page.getByLabel("继续模拟")).toBeVisible();

  const result = await page.evaluate(() => (
    window as typeof window & {
      __v144ResyncTracker?: {
        rejectedSeconds: number;
        rejectedWallSeconds: number;
        resyncElapsedSeconds: number;
        retrySeconds: number[];
        retryWallSeconds: number[];
        retryElapsedSeconds: number[];
      };
    }
  ).__v144ResyncTracker!);
  expect(result.rejectedSeconds).toBeCloseTo(2, 6);
  expect(result.rejectedWallSeconds).toBeCloseTo(result.rejectedSeconds, 6);
  expect(result.retrySeconds[0]).toBeCloseTo(result.rejectedSeconds, 6);
  expect(result.retryWallSeconds[0]).toBeCloseTo(result.rejectedWallSeconds, 6);
  expect(result.retryElapsedSeconds[0] - result.resyncElapsedSeconds).toBeCloseTo(result.retrySeconds[0], 6);
  expect(result.retrySeconds[1]).toBeGreaterThan(0);
  expect(result.retrySeconds[1]).toBeLessThan(result.rejectedSeconds * 0.75);
  expect(result.retryElapsedSeconds[1] - result.retryElapsedSeconds[0]).toBeCloseTo(result.retrySeconds[1], 6);
});

test("game runtime replays acknowledged slices after a Worker crash and remains saveable", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("dsp-idle-network.test-bypass-menu", "1");
    localStorage.setItem("dsp-idle-network.release-notes.seen.v1", "2026-08-14-v1.0.43");
    localStorage.setItem("dsp-idle-network.onboarding.v1", "dismissed");
    const tracker = { simulationWorkers: 0, steadyAdvances: 0, injectedCrashes: 0 };
    (window as typeof window & { __v144CrashTracker?: typeof tracker }).__v144CrashTracker = tracker;
    const NativeWorker = window.Worker;
    const WrappedWorker = new Proxy(NativeWorker, {
      construct(target, args) {
        const worker = Reflect.construct(target, args) as Worker;
        const isSimulation = String(args[0]).includes("simulation.worker") && (args[1] as WorkerOptions | undefined)?.name === "factory-simulation";
        if (!isSimulation) return worker;
        tracker.simulationWorkers += 1;
        const nativePostMessage = worker.postMessage.bind(worker);
        worker.postMessage = ((message: Record<string, unknown>, transferOrOptions?: Transferable[] | StructuredSerializeOptions) => {
          const steadyAdvance = message.kind === "advance" && !message.stateTransfer && Number(message.simulationSeconds) > 0;
          if (tracker.injectedCrashes === 0 && steadyAdvance) {
            tracker.steadyAdvances += 1;
            if (tracker.steadyAdvances === 3) {
              tracker.injectedCrashes += 1;
              window.setTimeout(() => {
                worker.terminate();
                worker.dispatchEvent(new ErrorEvent("error", { message: "injected v144 runtime crash" }));
              }, 0);
              return;
            }
          }
          if (transferOrOptions === undefined) nativePostMessage(message);
          else nativePostMessage(message, transferOrOptions);
        }) as typeof worker.postMessage;
        return worker;
      },
    });
    Object.defineProperty(window, "Worker", { configurable: true, writable: true, value: WrappedWorker });
  });

  await page.goto("/");
  const shell = page.locator(".game-shell");
  await expect(shell).toBeVisible({ timeout: 15_000 });
  await expect(shell).toHaveAttribute("data-simulation-worker", "active");
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __v144CrashTracker?: { injectedCrashes: number } }
  ).__v144CrashTracker?.injectedCrashes ?? 0), { timeout: 20_000 }).toBe(1);
  await expect(page.locator(".game-notice")).toContainText("已从精确检查点恢复", { timeout: 20_000 });
  await expect(shell).toHaveAttribute("data-simulation-worker", "active");

  await page.getByLabel("暂停模拟").click();
  await page.getByLabel("打开设置").click();
  const operations = page.getByRole("dialog", { name: "运营中心" });
  await operations.locator(".operations-tabs").getByRole("tab", { name: "存档" }).click();
  await operations.getByRole("button", { name: "立即保存" }).click();
  await expect(page.locator(".game-notice")).toContainText("主存档已保存", { timeout: 15_000 });
  const saved = await page.evaluate(async () => {
    const store = await import("/src/game/localSaveStore.ts");
    await store.flushLocalSaveWrites();
    const raw = await store.readPersistedLocalSaveValue("dsp-idle-network.save.v1");
    if (!raw) throw new Error("recovery save missing");
    const state = JSON.parse(raw).state as { elapsedSeconds: number; paused: boolean; entities: unknown[]; belts: unknown[] };
    const tracker = (window as typeof window & { __v144CrashTracker?: { injectedCrashes: number } }).__v144CrashTracker;
    return { ...state, injectedCrashes: tracker?.injectedCrashes ?? 0 };
  });
  expect(saved.injectedCrashes).toBe(1);
  expect(saved.elapsedSeconds).toBeGreaterThan(1);
  expect(saved.paused).toBe(true);
  expect(saved.entities.length).toBeGreaterThan(0);
});

test("real large save keeps running interactions and steady Worker payloads bounded", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  test.skip(!LARGE_SAVE_FIXTURE, "Set DSP_V144_LARGE_SAVE to run the read-only 1.0.44 acceptance fixture.");
  // Keep the attachment read-only while resetting only the envelope timestamp
  // in the in-memory browser fixture. This isolates realtime simulation from
  // the separate one-day offline-settlement path.
  const sourceRaw = readFileSync(LARGE_SAVE_FIXTURE!, "utf8");
  expect(createHash("sha256").update(sourceRaw).digest("hex")).toBe(AUTHORITATIVE_LARGE_SAVE_SHA256);
  const sourceEnvelope = JSON.parse(sourceRaw) as {
    state?: { activePlanetId?: string; entities?: Array<{ planetId?: string }>; belts?: unknown[] };
    activePlanetId?: string;
    entities?: Array<{ planetId?: string }>;
    belts?: unknown[];
  };
  const sourceState = sourceEnvelope.state ?? sourceEnvelope;
  const expectedActivePlanetId = sourceState.activePlanetId ?? "home";
  const expectedActiveEntityCount = sourceState.entities?.filter((entity) => entity.planetId === expectedActivePlanetId).length ?? 0;
  const expectedEntityCount = sourceState.entities?.length ?? 0;
  const expectedBeltCount = sourceState.belts?.length ?? 0;
  expect(expectedActiveEntityCount).toBe(4_213);
  const raw = JSON.stringify({ savedAt: Date.now(), state: sourceState });

  await page.addInitScript(() => {
    (window as typeof window & { __DSP_RUNTIME_TRANSITIONS__?: unknown }).__DSP_RUNTIME_TRANSITIONS__ = {
      enabled: true,
      events: [],
      active: {},
      counters: {},
    };
    localStorage.setItem("dsp-idle-network.release-notes.seen.v1", "2026-08-14-v1.0.43");
    localStorage.setItem("dsp-idle-network.basic-onboarding.v1", JSON.stringify({ version: 1, skipped: true, stepIndex: 5 }));
    localStorage.setItem("dsp-idle-network.canvas-performance-features.v1", JSON.stringify({
      renderProjection: true,
      topologyCache: true,
      extremeVisuals: true,
      nodeLod: true,
      canvasBelts: true,
      viewportCulling: true,
      spatialIndexes: true,
      minimapThrottle: true,
    }));
    const tracker: {
      projectionResponses: number;
      fullStateResponses: number;
      lastProjectionResponse: unknown;
    } = { projectionResponses: 0, fullStateResponses: 0, lastProjectionResponse: null };
    (window as typeof window & { __v144LargeRuntime?: typeof tracker }).__v144LargeRuntime = tracker;
    const NativeWorker = window.Worker;
    const WrappedWorker = new Proxy(NativeWorker, {
      construct(target, args) {
        const worker = Reflect.construct(target, args) as Worker;
        if (String(args[0]).includes("simulation.worker") && (args[1] as WorkerOptions | undefined)?.name === "factory-simulation") {
          worker.addEventListener("message", (event: MessageEvent<Record<string, unknown>>) => {
            if (event.data.protocol !== "projection") return;
            if (event.data.projection) {
              tracker.projectionResponses += 1;
              tracker.lastProjectionResponse = event.data;
            }
            if (event.data.state) tracker.fullStateResponses += 1;
          });
        }
        return worker;
      },
    });
    Object.defineProperty(window, "Worker", { configurable: true, writable: true, value: WrappedWorker });
  });
  await page.goto("/?storageMigration=production");
  const seeded = await page.evaluate(async (saveRaw) => {
    const store = await import("/src/game/localSaveStore.ts");
    await store.initializeLocalSaveStore();
    store.setLocalSaveValue("dsp-idle-network.save.v1", saveRaw);
    await store.flushLocalSaveWrites();
    const persisted = await store.readPersistedLocalSaveValue("dsp-idle-network.save.v1");
    if (persisted !== saveRaw) throw new Error("large runtime fixture exact read-back failed");
    const storage = await import("/src/game/storage.ts");
    const loaded = storage.loadGame();
    return { entities: loaded.state.entities.length, belts: loaded.state.belts.length, source: loaded.recovery?.source ?? "primary" };
  }, raw);
  expect(seeded).toMatchObject({ entities: expectedEntityCount, belts: expectedBeltCount, source: "primary" });
  // The menu summary is snapshotted during its initial render. Reloading this
  // menu-only page is safe and lets startup consume the verified IDB record.
  await page.reload();
  const continueGame = page.getByRole("button", { name: /继续游戏/ });
  await expect(continueGame).toBeVisible({ timeout: 30_000 });
  await continueGame.click();
  const shell = page.locator(".game-shell");
  await expect(shell).toBeVisible({ timeout: 120_000 });
  await expect(shell).toHaveAttribute("data-simulation-worker", "active");
  const storageProbe = await page.evaluate(async () => {
    const store = await import("/src/game/localSaveStore.ts");
    const cached = store.getLocalSaveValue("dsp-idle-network.save.v1");
    const persisted = await store.readPersistedLocalSaveValue("dsp-idle-network.save.v1");
    return {
      backend: store.getLocalSaveBackend(),
      writer: store.getLocalSaveWriterStatus(),
      cachedBytes: cached ? new TextEncoder().encode(cached).byteLength : 0,
      persistedBytes: persisted ? new TextEncoder().encode(persisted).byteLength : 0,
    };
  });
  console.info("V144_LARGE_STORAGE", JSON.stringify(storageProbe));
  expect(storageProbe.backend).toBe("indexeddb");
  expect(storageProbe.cachedBytes).toBeGreaterThan(30 * 1024 * 1024);
  expect(storageProbe.persistedBytes).toBe(storageProbe.cachedBytes);
  await expect(shell).toHaveAttribute("data-active-planet-node-count", String(expectedActiveEntityCount));
  expect(expectedEntityCount).toBeGreaterThan(0);
  expect(expectedBeltCount).toBeGreaterThan(0);
  const continueStartedAt = Date.now();
  const continueButton = page.getByLabel("继续模拟");
  if (await continueButton.isVisible()) await continueButton.click({ timeout: 30_000 });
  await expect(page.getByLabel("暂停模拟")).toBeVisible();
  const continueLatencyMs = Date.now() - continueStartedAt;
  await page.evaluate(() => {
    const probe = new Promise<{ p95Ms: number; maxMs: number; longTaskMaxMs: number }>((resolve) => {
      const frames: number[] = [];
      const longTasks: number[] = [];
      const observer = new PerformanceObserver((entries) => entries.getEntries().forEach((entry) => longTasks.push(entry.duration)));
      try { observer.observe({ type: "longtask" }); } catch { /* optional metric */ }
      const startedAt = performance.now();
      let previousAt = startedAt;
      const sample = (now: number) => {
        frames.push(now - previousAt);
        previousAt = now;
        if (now - startedAt < 6_000) {
          requestAnimationFrame(sample);
          return;
        }
        observer.disconnect();
        const sorted = [...frames].sort((left, right) => left - right);
        resolve({
          p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0,
          maxMs: sorted.at(-1) ?? 0,
          longTaskMaxMs: Math.max(0, ...longTasks),
        });
      };
      requestAnimationFrame(sample);
    });
    Object.assign(window, { __v144RunningInteractionProbe: probe });
  });
  const pane = page.locator(".react-flow__pane");
  const paneBox = await pane.boundingBox();
  if (!paneBox) throw new Error("large-save canvas pane is not measurable");
  const center = { x: paneBox.x + paneBox.width / 2, y: paneBox.y + paneBox.height / 2 };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 140, center.y + 90, { steps: 12 });
  await page.mouse.up();
  await page.mouse.wheel(0, -420);
  await page.mouse.wheel(0, 280);
  const frameMetrics = await page.evaluate(() => (
    window as typeof window & { __v144RunningInteractionProbe: Promise<{ p95Ms: number; maxMs: number; longTaskMaxMs: number }> }
  ).__v144RunningInteractionProbe);
  const pauseStartedAt = Date.now();
  await page.getByLabel("暂停模拟").click();
  await expect(page.getByLabel("继续模拟")).toBeVisible();
  const pauseLatencyMs = Date.now() - pauseStartedAt;
  const workerMetrics = await page.evaluate(() => {
    const tracker = (window as typeof window & {
      __v144LargeRuntime?: { projectionResponses: number; fullStateResponses: number; lastProjectionResponse: unknown };
    }).__v144LargeRuntime!;
    return {
      projectionResponses: tracker.projectionResponses,
      fullStateResponses: tracker.fullStateResponses,
      lastProjectionBytes: new TextEncoder().encode(JSON.stringify(tracker.lastProjectionResponse)).byteLength,
    };
  });
  const transitionMetrics = await page.evaluate(() => {
    const diagnostics = (window as typeof window & {
      __DSP_RUNTIME_TRANSITIONS__?: {
        events: Array<{ phase: string; durationMs: number; transition?: string }>;
        counters?: Record<string, { count: number; totalMs: number; maxMs: number }>;
      };
    }).__DSP_RUNTIME_TRANSITIONS__;
    const phases: Record<string, { count: number; totalMs: number; maxMs: number }> = {};
    for (const event of diagnostics?.events ?? []) {
      const current = phases[event.phase] ?? { count: 0, totalMs: 0, maxMs: 0 };
      current.count += 1;
      current.totalMs += event.durationMs;
      current.maxMs = Math.max(current.maxMs, event.durationMs);
      phases[event.phase] = current;
    }
    const secondPainted = (diagnostics?.events ?? [])
      .filter((event) => event.phase === "second-painted-frame" && (event.transition === "resume" || event.transition === "pause"))
      .map((event) => ({ transition: event.transition!, durationMs: event.durationMs }));
    return { phases, counters: diagnostics?.counters ?? {}, secondPainted };
  });
  console.info("V144_LARGE_RUNTIME", JSON.stringify({ continueLatencyMs, pauseLatencyMs, ...frameMetrics, ...workerMetrics, transitionMetrics }));
  expect(continueLatencyMs).toBeLessThanOrEqual(100);
  expect(pauseLatencyMs).toBeLessThanOrEqual(100);
  expect(transitionMetrics.secondPainted.find((entry) => entry.transition === "resume")?.durationMs).toBeLessThanOrEqual(100);
  expect(transitionMetrics.secondPainted.find((entry) => entry.transition === "pause")?.durationMs).toBeLessThanOrEqual(100);
  expect(frameMetrics.p95Ms).toBeLessThanOrEqual(20);
  expect(frameMetrics.longTaskMaxMs).toBeLessThanOrEqual(100);
  expect(workerMetrics.projectionResponses).toBeGreaterThanOrEqual(2);
  expect(workerMetrics.fullStateResponses).toBe(0);
  expect(workerMetrics.lastProjectionBytes).toBeLessThanOrEqual(1024 * 1024);
  expect(createHash("sha256").update(readFileSync(LARGE_SAVE_FIXTURE!, "utf8")).digest("hex")).toBe(AUTHORITATIVE_LARGE_SAVE_SHA256);
  const leakedArtifacts = outputFiles(testInfo.outputDir).filter((artifact) =>
    artifact.bytes >= sourceRaw.length || /\.(?:zip|webm|png|jpe?g)$/i.test(artifact.path));
  expect(leakedArtifacts).toEqual([]);
});
