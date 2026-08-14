import { expect, test } from "@playwright/test";

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
    const staleCommand = { ...command, baseRevision: 0 };
    const rejected = await request({
      id: 5,
      kind: "checkpoint",
      command: staleCommand,
      simulationSeconds: 0,
      wallSeconds: 0,
      registryFingerprint: registry.fingerprint,
      protocol: "projection",
      stateRevision: commandCheckpointResponse.stateRevision,
    });
    const resyncCheckpoint = protocol.deserializeSimulationStateTransfer(
      rejected.checkpoint as import("../../src/game/simulationRuntimeProtocol").SimulationStateTransfer,
    );
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
      staleRejected: rejected.needsResync === true,
      resyncHash: benchmark.hashGameState(resyncCheckpoint),
      commandedHash: benchmark.hashGameState(commandedCheckpoint),
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
  expect(result.staleRejected).toBe(true);
  expect(result.resyncHash).toBe(result.commandedHash);
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
