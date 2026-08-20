import { expect, test } from "@playwright/test";

test("durable Worker replay keeps RLE boundaries, commands and pending intent exact", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const benchmark = await import("/src/game/benchmark.ts");
    const engine = await import("/src/game/engine.ts");
    const packs = await import("/src/game/contentPacks.ts");
    const projectionModule = await import("/src/game/simulationProjection.ts");
    const protocol = await import("/src/game/simulationRuntimeProtocol.ts");
    const durable = await import("/src/game/simulationRuntimeDurableRecovery.ts");
    type Intent = import("../../src/game/simulationRuntimeDurableRecovery").SimulationRuntimeDurableOperationIntent;
    type Entry = import("../../src/game/simulationRuntimeDurableRecovery").SimulationRuntimeDurableJournalEntry;
    const registry = packs.createContentPackRuntimeSnapshot(packs.createContentPackRegistry());
    const source = engine.createInitialState(44_144);
    source.paused = false;
    source.research.completedTechIds.push("dyson_sphere_program");
    source.dysonSphere.structurePoints = 137;
    source.entities.push({
      ...structuredClone(source.entities[0]),
      id: "durable-frost-node",
      planetId: "frost",
      progress: 0,
    });
    const canonicalSource = JSON.parse(JSON.stringify(source)) as typeof source;
    const oracle = engine.createPersistentSimulationRuntime(structuredClone(canonicalSource));
    let revision = 1;
    let sequence = 0;
    let entries: Entry[] = [];
    const createIntent = async (
      options: { command?: import("../../src/game/simulationRuntimeProtocol").SimulationCommandPatch | null; simulationSeconds: number; wallSeconds: number },
    ): Promise<Intent> => {
      const unsigned: Omit<Intent, "intentSha256"> = {
        schemaVersion: 1,
        sessionId: "durable-worker-exact",
        generation: 1,
        sequence: ++sequence,
        baseStateRevision: revision,
        command: options.command ?? null,
        simulationSeconds: options.simulationSeconds,
        wallSeconds: options.wallSeconds,
        multicore: undefined,
        approximate: false,
        registry,
        committedAtMs: 1_786_377_600_000 + sequence * 1_000,
      };
      return { ...unsigned, intentSha256: await durable.computeSimulationRuntimeDurableIntentSha256(unsigned) };
    };

    const passive = await createIntent({ simulationSeconds: 61, wallSeconds: 61 });
    const passiveAdvance = engine.advancePersistentSimulationRuntime(oracle, passive.simulationSeconds, passive.wallSeconds);
    if (passiveAdvance.changed) revision += 1;
    entries = await durable.finalizeSimulationRuntimeDurableRecoveryIntent(entries, passive, revision);

    const commandView = engine.addDysonLayer(structuredClone(oracle.state), "helios");
    commandView.activePlanetId = "frost";
    const commandPatch = protocol.createSimulationCommandPatch(oracle.state, commandView, revision)!;
    const atomic = await createIntent({ command: commandPatch, simulationSeconds: 1, wallSeconds: 1 });
    engine.replacePersistentSimulationRuntimeState(oracle, protocol.applySimulationCommandPatch(oracle.state, commandPatch));
    revision += 1;
    const atomicAdvance = engine.advancePersistentSimulationRuntime(oracle, atomic.simulationSeconds, atomic.wallSeconds);
    if (atomicAdvance.changed) revision += 1;
    entries = await durable.finalizeSimulationRuntimeDurableRecoveryIntent(entries, atomic, revision);

    const pending = await createIntent({ simulationSeconds: 2, wallSeconds: 2 });
    const pendingAdvance = engine.advancePersistentSimulationRuntime(oracle, pending.simulationSeconds, pending.wallSeconds);
    if (pendingAdvance.changed) revision += 1;
    const expected = JSON.parse(JSON.stringify(oracle.state)) as typeof oracle.state;
    const worker = new Worker(new URL("/src/game/simulation.worker.ts", location.origin), { type: "module" });
    let progressMessages = 0;
    let allMessages = 0;
    const transfer = protocol.serializeSimulationStateForTransfer(canonicalSource);
    const replayResponse = await new Promise<Record<string, any>>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("durable replay timed out")), 30_000);
      worker.addEventListener("message", function listener(event: MessageEvent<Record<string, any>>) {
        if (event.data.id !== 1) return;
        allMessages += 1;
        if (event.data.durableReplayProgress) {
          progressMessages += 1;
          if (JSON.stringify(event.data).length >= 2_048) reject(new Error("durable progress message is not small"));
          return;
        }
        worker.removeEventListener("message", listener);
        window.clearTimeout(timeout);
        resolve(event.data);
      });
      worker.postMessage({
        id: 1,
        kind: "replay-durable",
        stateTransfer: transfer,
        stateRevision: 1,
        simulationSeconds: 0,
        wallSeconds: 0,
        registryFingerprint: registry.fingerprint,
        registry,
        protocol: "projection",
        durableReplay: {
          sessionId: "durable-worker-exact",
          generation: 1,
          checkpointLastSequence: 0,
          checkpointStateRevision: 1,
          entries,
          pendingIntent: pending,
        },
      }, [transfer.buffer]);
    });
    const projection = replayResponse.projection as import("../../src/game/simulationProjection").SimulationProjection;
    const projected = projectionModule.applySimulationProjectionToState(canonicalSource, projection).state;
    const checkpointResponse = await new Promise<Record<string, any>>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("post-replay checkpoint timed out")), 15_000);
      worker.addEventListener("message", function listener(event: MessageEvent<Record<string, any>>) {
        if (event.data.id !== 2) return;
        worker.removeEventListener("message", listener);
        window.clearTimeout(timeout);
        resolve(event.data);
      });
      worker.postMessage({
        id: 2,
        kind: "checkpoint",
        simulationSeconds: 0,
        wallSeconds: 0,
        registryFingerprint: registry.fingerprint,
        protocol: "projection",
        stateRevision: replayResponse.stateRevision,
      });
    });
    worker.terminate();
    const checkpoint = protocol.deserializeSimulationStateTransfer(checkpointResponse.checkpoint);
    const activeExact = expected.entities.filter((entity) => entity.planetId === expected.activePlanetId);
    const projectedActive = projected.entities.filter((entity) => entity.planetId === expected.activePlanetId);
    const originalHome = canonicalSource.entities.filter((entity) => entity.planetId === "home");
    const projectedHome = projected.entities.filter((entity) => entity.planetId === "home");
    return {
      responseHasState: "state" in replayResponse,
      responseHasCheckpoint: "checkpoint" in replayResponse,
      sourceCheckpointBytes: replayResponse.sourceCheckpointTransfer?.byteLength ?? 0,
      requiresFullSnapshot: projection.requiresFullSnapshot,
      activeExact: JSON.stringify(activeExact) === JSON.stringify(projectedActive),
      offPlanetStayedProjected: JSON.stringify(originalHome) === JSON.stringify(projectedHome),
      historyExact: JSON.stringify(projected.productionHistory) === JSON.stringify(expected.productionHistory),
      dysonExact: JSON.stringify(projected.dysonPlans) === JSON.stringify(expected.dysonPlans),
      seedExact: projected.seed === expected.seed,
      dysonConserved: Object.values(checkpoint.dysonPlans).reduce((sum, plan) => sum + plan.structurePoints, 0) === checkpoint.dysonSphere.structurePoints,
      checkpointHash: benchmark.hashGameState(checkpoint),
      expectedHash: benchmark.hashGameState(expected),
      pendingIntentSha256: replayResponse.durableReplayResult?.pendingIntentSha256,
      expectedPendingSha256: pending.intentSha256,
      pendingResultStateRevision: replayResponse.durableReplayResult?.pendingResultStateRevision,
      expectedRevision: revision,
      progressMessages,
      allMessages,
    };
  });
  expect(result).toMatchObject({
    responseHasState: false,
    responseHasCheckpoint: false,
    requiresFullSnapshot: true,
    activeExact: true,
    offPlanetStayedProjected: true,
    historyExact: true,
    dysonExact: true,
    seedExact: true,
    dysonConserved: true,
    pendingIntentSha256: result.expectedPendingSha256,
    pendingResultStateRevision: result.expectedRevision,
  });
  expect(result.sourceCheckpointBytes).toBeGreaterThan(0);
  expect(result.checkpointHash).toBe(result.expectedHash);
  expect(result.allMessages).toBeLessThanOrEqual(result.progressMessages + 1);
});

test("failed partial durable replay invalidates Worker until an exact bootstrap", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const engine = await import("/src/game/engine.ts");
    const packs = await import("/src/game/contentPacks.ts");
    const protocol = await import("/src/game/simulationRuntimeProtocol.ts");
    const durable = await import("/src/game/simulationRuntimeDurableRecovery.ts");
    const registry = packs.createContentPackRuntimeSnapshot(packs.createContentPackRegistry());
    const source = engine.createInitialState(44_145);
    source.paused = false;
    const transfer = protocol.serializeSimulationStateForTransfer(source);
    const unsignedSegment: Omit<import("../../src/game/simulationRuntimeDurableRecovery").SimulationRuntimeDurablePassiveSegment, "segmentSha256"> = {
      kind: "passive-segment",
      schemaVersion: 1,
      sessionId: "durable-worker-partial",
      generation: 1,
      firstSequence: 1,
      lastSequence: 3,
      baseStateRevision: 1,
      // Three real engine steps finish at revision 4. This mismatch is only
      // observable after partial mutation and must invalidate the runtime.
      nextStateRevision: 99,
      operationCount: 3,
      replay: { kind: "rle", steps: [{ simulationSeconds: 1, wallSeconds: 1, count: 3 }] },
      multicore: undefined,
      approximate: false,
      registry,
      digestChainSha256: "a".repeat(64),
      tailIntentSha256: "b".repeat(64),
      committedAtMs: 1_786_377_600_000,
    };
    const segment = {
      ...unsignedSegment,
      segmentSha256: await durable.computeSimulationRuntimeDurablePassiveSegmentSha256(unsignedSegment),
    };
    const worker = new Worker(new URL("/src/game/simulation.worker.ts", location.origin), { type: "module" });
    const request = (id: number, payload: Record<string, unknown>, transferables: Transferable[] = []) =>
      new Promise<Record<string, any>>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error(`durable failure request ${id} timed out`)), 15_000);
        worker.addEventListener("message", function listener(event: MessageEvent<Record<string, any>>) {
          if (event.data.id !== id || event.data.durableReplayProgress) return;
          worker.removeEventListener("message", listener);
          window.clearTimeout(timeout);
          resolve(event.data);
        });
        worker.postMessage({ id, ...payload }, transferables);
      });
    const failed = await request(1, {
      kind: "replay-durable",
      stateTransfer: transfer,
      stateRevision: 1,
      simulationSeconds: 0,
      wallSeconds: 0,
      registryFingerprint: registry.fingerprint,
      registry,
      protocol: "projection",
      durableReplay: {
        sessionId: unsignedSegment.sessionId,
        generation: 1,
        checkpointLastSequence: 0,
        checkpointStateRevision: 1,
        entries: [segment],
        pendingIntent: null,
      },
    }, [transfer.buffer]);
    const afterFailure = await request(2, {
      kind: "advance",
      simulationSeconds: 1,
      wallSeconds: 1,
      registryFingerprint: registry.fingerprint,
      protocol: "projection",
      stateRevision: 4,
    });
    worker.terminate();
    return {
      failureCode: failed.durableReplayError?.code,
      failureHasProjection: Boolean(failed.projection),
      sourceReturnedBytes: failed.sourceCheckpointTransfer?.byteLength ?? 0,
      nextNeedsState: afterFailure.needsState === true,
      nextHasState: Boolean(afterFailure.state),
      nextHasProjection: Boolean(afterFailure.projection),
    };
  });
  expect(result).toEqual({
    failureCode: "revision-mismatch",
    failureHasProjection: false,
    sourceReturnedBytes: expect.any(Number),
    nextNeedsState: true,
    nextHasState: false,
    nextHasProjection: false,
  });
  expect(result.sourceReturnedBytes).toBeGreaterThan(0);
});

test("durable replay cancellation and Worker crash never publish a partial state", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const engine = await import("/src/game/engine.ts");
    const packs = await import("/src/game/contentPacks.ts");
    const protocol = await import("/src/game/simulationRuntimeProtocol.ts");
    const durable = await import("/src/game/simulationRuntimeDurableRecovery.ts");
    const registry = packs.createContentPackRuntimeSnapshot(packs.createContentPackRegistry());
    const source = engine.createInitialState(44_146);
    source.paused = false;
    const segmentFor = async (sessionId: string, count: number, seconds: number, nextStateRevision: number) => {
      const unsigned: Omit<import("../../src/game/simulationRuntimeDurableRecovery").SimulationRuntimeDurablePassiveSegment, "segmentSha256"> = {
        kind: "passive-segment",
        schemaVersion: 1,
        sessionId,
        generation: 1,
        firstSequence: 1,
        lastSequence: count,
        baseStateRevision: 1,
        nextStateRevision,
        operationCount: count,
        replay: { kind: "rle", steps: [{ simulationSeconds: seconds, wallSeconds: seconds, count }] },
        multicore: undefined,
        approximate: false,
        registry,
        digestChainSha256: "c".repeat(64),
        tailIntentSha256: "d".repeat(64),
        committedAtMs: 1_786_377_600_000,
      };
      return { ...unsigned, segmentSha256: await durable.computeSimulationRuntimeDurablePassiveSegmentSha256(unsigned) };
    };

    const cancelWorker = new Worker(new URL("/src/game/simulation.worker.ts", location.origin), { type: "module" });
    const cancelTransfer = protocol.serializeSimulationStateForTransfer(source);
    const cancelChannel = new MessageChannel();
    const cancelSegment = await segmentFor("durable-worker-cancel", 64, 1, 65);
    const cancelledResponse = new Promise<Record<string, any>>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("durable cancellation timed out")), 15_000);
      cancelWorker.addEventListener("message", function listener(event: MessageEvent<Record<string, any>>) {
        if (event.data.id !== 1 || event.data.durableReplayProgress) return;
        cancelWorker.removeEventListener("message", listener);
        window.clearTimeout(timeout);
        resolve(event.data);
      });
    });
    cancelWorker.postMessage({
      id: 1,
      kind: "replay-durable",
      stateTransfer: cancelTransfer,
      stateRevision: 1,
      simulationSeconds: 0,
      wallSeconds: 0,
      registryFingerprint: registry.fingerprint,
      registry,
      protocol: "projection",
      durableReplayCancelPort: cancelChannel.port2,
      durableReplay: {
        sessionId: "durable-worker-cancel",
        generation: 1,
        checkpointLastSequence: 0,
        checkpointStateRevision: 1,
        entries: [cancelSegment],
        pendingIntent: null,
      },
    }, [cancelTransfer.buffer, cancelChannel.port2]);
    cancelChannel.port1.postMessage("cancel");
    const cancelled = await cancelledResponse;
    cancelWorker.terminate();

    const crashWorker = new Worker(new URL("/src/game/simulation.worker.ts", location.origin), { type: "module" });
    const crashTransfer = protocol.serializeSimulationStateForTransfer(source);
    const crashSegment = await segmentFor("durable-worker-crash", 450, 0, 1);
    let crashPublished = false;
    crashWorker.addEventListener("message", (event: MessageEvent<Record<string, any>>) => {
      if (event.data.durableReplayResult || event.data.projection) crashPublished = true;
    });
    crashWorker.postMessage({
      id: 2,
      kind: "replay-durable",
      stateTransfer: crashTransfer,
      stateRevision: 1,
      simulationSeconds: 0,
      wallSeconds: 0,
      registryFingerprint: registry.fingerprint,
      registry,
      protocol: "projection",
      durableReplay: {
        sessionId: "durable-worker-crash",
        generation: 1,
        checkpointLastSequence: 0,
        checkpointStateRevision: 1,
        entries: [crashSegment],
        pendingIntent: null,
      },
    }, [crashTransfer.buffer]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    crashWorker.terminate();
    await new Promise((resolve) => setTimeout(resolve, 50));
    return {
      cancelledCode: cancelled.durableReplayError?.code,
      cancelledHasProjection: Boolean(cancelled.projection),
      cancelledSourceBytes: cancelled.sourceCheckpointTransfer?.byteLength ?? 0,
      crashSourceDetached: crashTransfer.buffer.byteLength === 0,
      crashPublished,
    };
  });
  expect(result).toMatchObject({
    cancelledCode: "cancelled",
    cancelledHasProjection: false,
    crashSourceDetached: true,
    crashPublished: false,
  });
  expect(result.cancelledSourceBytes).toBeGreaterThan(0);
});
