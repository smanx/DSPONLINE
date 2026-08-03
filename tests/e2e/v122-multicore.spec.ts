import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const P6_FIXTURE = process.env.DSP_P6_FIXTURE;
const RUN_P6_BENCHMARK = process.env.DSP_RUN_P6_BENCHMARK === "1";
const P6_BENCHMARK_SECONDS = Math.max(1, Math.min(600, Number.parseInt(process.env.DSP_P6_BENCHMARK_SECONDS ?? "1", 10) || 1));
const P6_BENCHMARK_SAMPLES = Math.max(1, Math.min(30, Number.parseInt(process.env.DSP_P6_BENCHMARK_SAMPLES ?? "9", 10) || 9));
const P6_BENCHMARK_WARMUPS = Math.max(0, Math.min(5, Number.parseInt(process.env.DSP_P6_BENCHMARK_WARMUPS ?? "2", 10) || 0));

test("P6 planet-phase Workers return the serial state and report the approved path", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const engine = await import("/src/game/engine.ts");
    const packs = await import("/src/game/contentPacks.ts");
    const benchmark = await import("/src/game/benchmark.ts");
    const source = engine.createInitialState();
    source.entities = Array.from({ length: 600 }, (_, index) => ({
      ...source.entities[0],
      id: `p6-vein-${index}`,
    }));
    source.belts = [];
    const registry = packs.createContentPackRuntimeSnapshot(packs.createContentPackRegistry());
    const request = (multicore?: boolean) => new Promise<{ state: typeof source; multicore?: { enabled: boolean; workerCount: number } }>((resolve, reject) => {
      const worker = new Worker(new URL("/src/game/simulation.worker.ts", location.origin), { type: "module" });
      const timeout = window.setTimeout(() => { worker.terminate(); reject(new Error("P6 Worker 超时")); }, 20_000);
      worker.onmessage = (event) => {
        if (event.data.id !== 1) return;
        window.clearTimeout(timeout);
        worker.terminate();
        if (!event.data.state) reject(new Error(event.data.registryError ?? "P6 Worker 未返回状态"));
        else resolve({ state: event.data.state, multicore: event.data.multicore });
      };
      worker.onerror = () => { window.clearTimeout(timeout); worker.terminate(); reject(new Error("P6 Worker 错误")); };
      worker.postMessage({
        id: 1,
        state: structuredClone(source),
        simulationSeconds: 2,
        wallSeconds: 2,
        registryFingerprint: registry.fingerprint,
        registry,
        ...(multicore ? { multicore: { enabled: true, requestedWorkers: 2, benchmarkSpeedup: 2, completeSimulationProof: true } } : {}),
      });
    });
    const serial = engine.createPersistentSimulationRuntime(structuredClone(source));
    const expected = engine.advancePersistentSimulationRuntime(serial, 2, 2).state;
    const parallel = await request(true);
    const fallback = await request(false);
    return {
      parallelHash: benchmark.hashGameState(parallel.state),
      fallbackHash: benchmark.hashGameState(fallback.state),
      expectedHash: benchmark.hashGameState(expected),
      multicore: parallel.multicore,
    };
  });

  expect(result.parallelHash).toBe(result.expectedHash);
  expect(result.fallbackHash).toBe(result.expectedHash);
  expect(result.multicore).toMatchObject({ enabled: true, workerCount: 2 });
});

test("P6 restores the authoritative baseline before a failed partition falls back", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const engine = await import("/src/game/engine.ts");
    const packs = await import("/src/game/contentPacks.ts");
    const benchmark = await import("/src/game/benchmark.ts");
    const source = engine.createInitialState();
    source.entities = [
      ...Array.from({ length: 600 }, (_, index) => ({ ...source.entities[0], id: `p6-fallback-${index}` })),
      { ...source.entities[0], id: "p6-invalid-partition", planetId: "invalid-planet" as never },
    ];
    source.belts = [];
    const registry = packs.createContentPackRuntimeSnapshot(packs.createContentPackRegistry());
    const serialRuntime = engine.createPersistentSimulationRuntime(structuredClone(source));
    const expected = engine.advancePersistentSimulationRuntime(serialRuntime, 2, 2).state;
    const actual = await new Promise<{ state: typeof source; multicore?: { enabled: boolean; fallback?: boolean; workerCount: number } }>((resolve, reject) => {
      const worker = new Worker(new URL("/src/game/simulation.worker.ts", location.origin), { type: "module" });
      const timeout = window.setTimeout(() => { worker.terminate(); reject(new Error("P6 回退超时")); }, 20_000);
      worker.onmessage = (event) => {
        if (event.data.id !== 1) return;
        window.clearTimeout(timeout);
        worker.terminate();
        if (!event.data.state) reject(new Error(event.data.registryError ?? "P6 回退未返回状态"));
        else resolve({ state: event.data.state, multicore: event.data.multicore });
      };
      worker.onerror = () => { window.clearTimeout(timeout); worker.terminate(); reject(new Error("P6 回退 Worker 错误")); };
      worker.postMessage({
        id: 1,
        state: structuredClone(source),
        simulationSeconds: 2,
        wallSeconds: 2,
        registryFingerprint: registry.fingerprint,
        registry,
        multicore: { enabled: true, requestedWorkers: 2, benchmarkSpeedup: 2, completeSimulationProof: true },
      });
    });
    return {
      expectedHash: benchmark.hashGameState(expected),
      actualHash: benchmark.hashGameState(actual.state),
      elapsedSeconds: actual.state.elapsedSeconds,
      multicore: actual.multicore,
    };
  });

  expect(result.actualHash).toBe(result.expectedHash);
  expect(result.elapsedSeconds).toBe(2);
  expect(result.multicore).toMatchObject({ enabled: false, fallback: true, workerCount: 2 });
});

test("P6 rebuilds a persistent child pool when the approved Worker count changes", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const engine = await import("/src/game/engine.ts");
    const packs = await import("/src/game/contentPacks.ts");
    const benchmark = await import("/src/game/benchmark.ts");
    const source = engine.createInitialState();
    source.entities = Array.from({ length: 600 }, (_, index) => ({ ...source.entities[0], id: `p6-resize-${index}` }));
    source.belts = [];
    const registry = packs.createContentPackRuntimeSnapshot(packs.createContentPackRegistry());
    const expectedRuntime = engine.createPersistentSimulationRuntime(structuredClone(source));
    let expected = expectedRuntime.state;
    for (let index = 0; index < 3; index += 1) {
      expected = engine.advancePersistentSimulationRuntime(expectedRuntime, 1, 1).state;
    }
    const worker = new Worker(new URL("/src/game/simulation.worker.ts", location.origin), { type: "module" });
    const send = (id: number, workerCount: 0 | 2 | 4, state?: typeof source) => new Promise<{ state: typeof source; multicore?: { enabled: boolean; workerCount: number } }>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("P6 子 Worker 池切换超时")), 20_000);
      const handle = (event: MessageEvent) => {
        if (event.data.id !== id) return;
        worker.removeEventListener("message", handle);
        window.clearTimeout(timeout);
        if (!event.data.state) reject(new Error(event.data.registryError ?? "P6 子 Worker 池切换未返回状态"));
        else resolve({ state: event.data.state, multicore: event.data.multicore });
      };
      worker.addEventListener("message", handle);
      worker.postMessage({
        id,
        ...(state ? { state, registry } : {}),
        simulationSeconds: 1,
        wallSeconds: 1,
        registryFingerprint: registry.fingerprint,
        multicore: workerCount > 0
          ? { enabled: true, requestedWorkers: workerCount, benchmarkSpeedup: 2, completeSimulationProof: true }
          : { enabled: false },
      });
    });
    try {
      const two = await send(1, 2, structuredClone(source));
      const four = await send(2, 4);
      const single = await send(3, 0);
      return {
        expectedHash: benchmark.hashGameState(expected),
        actualHash: benchmark.hashGameState(single.state),
        two: two.multicore,
        four: four.multicore,
        single: single.multicore,
      };
    } finally {
      worker.terminate();
    }
  });

  expect(result.actualHash).toBe(result.expectedHash);
  expect(result.two).toMatchObject({ enabled: true, workerCount: 2 });
  expect(result.four).toMatchObject({ enabled: true, workerCount: 4 });
  expect(result.single).toMatchObject({ enabled: false, workerCount: 1 });
});

test("P6 child Workers receive the same content-pack registry as the coordinator", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const engine = await import("/src/game/engine.ts");
    const packs = await import("/src/game/contentPacks.ts");
    const mods = await import("/src/game/mods.ts");
    const benchmark = await import("/src/game/benchmark.ts");
    const validation = mods.validateContentPack({
      formatVersion: 2,
      id: "p6_registry_boundary",
      name: "P6 Registry Boundary",
      version: "1.0.0",
      recipes: [{
        id: "p6_registry_recipe",
        name: "P6 Registry Recipe",
        buildingId: "assembling_machine_mk1",
        duration: 1,
        inputs: [{ itemId: "iron_ingot", amount: 1 }],
        outputs: [{ itemId: "space_warper", amount: 2 }],
      }],
    });
    if (!validation.valid) throw new Error("P6 内容包夹具无效");
    const snapshot = packs.createContentPackRuntimeSnapshot(packs.registerContentPack(packs.createContentPackRegistry(), validation).registry);
    packs.applyContentPackRuntimeSnapshot(snapshot);
    let source = engine.createInitialState();
    source.construction.wind_turbine = 100;
    source.construction.assembling_machine_mk1 = 1;
    source = engine.placeBuilding(source, "wind_turbine", { x: -250, y: 0 }, 100);
    source = engine.placeBuilding(source, "assembling_machine_mk1", { x: 0, y: 0 });
    const machine = source.entities.find((entity) => entity.buildingId === "assembling_machine_mk1")!;
    source = engine.setEntityRecipe(source, machine.id, "p6_registry_recipe" as never);
    source.entities.find((entity) => entity.id === machine.id)!.inputs.iron_ingot = 1;
    source.entities = [
      ...source.entities,
      ...Array.from({ length: 600 }, (_, index) => ({ ...source.entities[0], id: `p6-registry-${index}` })),
    ];
    const expectedRuntime = engine.createPersistentSimulationRuntime(structuredClone(source));
    const expected = engine.advancePersistentSimulationRuntime(expectedRuntime, 2, 2).state;
    const actual = await new Promise<{ state: typeof source; multicore?: { enabled: boolean } }>((resolve, reject) => {
      const worker = new Worker(new URL("/src/game/simulation.worker.ts", location.origin), { type: "module" });
      const timeout = window.setTimeout(() => { worker.terminate(); reject(new Error("P6 内容包 Worker 超时")); }, 20_000);
      worker.onmessage = (event) => {
        if (event.data.id !== 1) return;
        window.clearTimeout(timeout);
        worker.terminate();
        if (!event.data.state) reject(new Error(event.data.registryError ?? "P6 内容包 Worker 失败"));
        else resolve({ state: event.data.state, multicore: event.data.multicore });
      };
      worker.postMessage({
        id: 1,
        state: structuredClone(source),
      simulationSeconds: 2,
      wallSeconds: 2,
        registryFingerprint: snapshot.fingerprint,
        registry: snapshot,
        multicore: { enabled: true, requestedWorkers: 2, benchmarkSpeedup: 2, completeSimulationProof: true },
      });
    });
    return {
      expectedHash: benchmark.hashGameState(expected),
      actualHash: benchmark.hashGameState(actual.state),
      output: actual.state.entities.find((entity) => entity.id === machine.id)?.outputs.space_warper ?? 0,
      expectedMachine: expected.entities.find((entity) => entity.id === machine.id),
      actualMachine: actual.state.entities.find((entity) => entity.id === machine.id),
      expectedMetrics: expected.planetMetrics.home,
      actualMetrics: actual.state.planetMetrics.home,
      entityDiff: (() => {
        for (let index = 0; index < expected.entities.length; index += 1) {
          if (JSON.stringify(expected.entities[index]) !== JSON.stringify(actual.state.entities[index])) return { index, expected: expected.entities[index], actual: actual.state.entities[index] };
        }
        return null;
      })(),
      keyDiff: Object.keys(expected).filter((key) => JSON.stringify((expected as Record<string, unknown>)[key]) !== JSON.stringify((actual.state as Record<string, unknown>)[key])),
      expectedTotal: expected.totalProduced,
      actualTotal: actual.state.totalProduced,
      multicore: actual.multicore,
    };
  });

  expect(result.actualHash).toBe(result.expectedHash);
  expect(result.output).toBe(2);
  expect(result.multicore).toMatchObject({ enabled: true });
});

test("P6 real endgame fixture keeps the gate safe and the approved path deterministic", async ({ page }) => {
  test.setTimeout(300_000);
  test.skip(!P6_FIXTURE, "设置 DSP_P6_FIXTURE 后运行真实终局夹具");
  await page.goto("/");
  const envelope = JSON.parse(readFileSync(P6_FIXTURE!, "utf8")) as { state?: Record<string, unknown> } & Record<string, unknown>;
  const source = (envelope.state ?? envelope) as Record<string, unknown>;
  const result = await page.evaluate(async ({ source }) => {
    const engine = await import("/src/game/engine.ts");
    const packs = await import("/src/game/contentPacks.ts");
    const benchmark = await import("/src/game/benchmark.ts");
    const multicore = await import("/src/game/multicoreSimulation.ts");
    const registry = packs.createContentPackRuntimeSnapshot(packs.createContentPackRegistry());
    const original = structuredClone(source) as ReturnType<typeof engine.createInitialState>;
    const safeDiagnostic = structuredClone(original);
    safeDiagnostic.paused = false;
    safeDiagnostic.research.selectedTechId = null;
    safeDiagnostic.endgame.activeInfiniteResearchId = null;
    // Keep the factory, routes and inventories intact while removing only the
    // global Dyson launch activity that the P6 gate deliberately serializes.
    safeDiagnostic.entities = safeDiagnostic.entities.map((entity) => entity.recipeId === "solar_sail_launch" || entity.recipeId === "carrier_rocket_launch"
      ? { ...entity, recipeId: undefined, progress: 0, utilization: 0, productionRate: 0 }
      : entity);
    const runWorker = (state: typeof safeDiagnostic, multicore?: boolean) => new Promise<{ state?: typeof safeDiagnostic; multicore?: { enabled: boolean; workerCount: number; reason?: string }; durationMs: number }>((resolve, reject) => {
      const worker = new Worker(new URL("/src/game/simulation.worker.ts", location.origin), { type: "module" });
      const startedAt = performance.now();
      const timeout = window.setTimeout(() => { worker.terminate(); reject(new Error("P6 终局 Worker 超时")); }, 180_000);
      worker.onmessage = (event) => {
        if (event.data.id !== 1) return;
        window.clearTimeout(timeout);
        worker.terminate();
        if (!event.data.state) reject(new Error(event.data.registryError ?? "P6 终局 Worker 未返回状态"));
        else resolve({ state: event.data.state, multicore: event.data.multicore, durationMs: performance.now() - startedAt });
      };
      worker.onerror = () => { window.clearTimeout(timeout); worker.terminate(); reject(new Error("P6 终局 Worker 错误")); };
      worker.postMessage({
        id: 1,
        state: structuredClone(state),
        simulationSeconds: 5,
        wallSeconds: 5,
        registryFingerprint: registry.fingerprint,
        registry,
        ...(multicore ? { multicore: { enabled: true, requestedWorkers: 2, benchmarkSpeedup: 2, completeSimulationProof: true } } : {}),
      });
    });
    const originalGate = multicore.planMulticoreSimulation(original, { enabled: true, requestedWorkers: 2, benchmarkSpeedup: 2, completeSimulationProof: true });
    const serialRuntime = engine.createPersistentSimulationRuntime(structuredClone(safeDiagnostic));
    const syncRuntime = engine.createPersistentSimulationRuntime(structuredClone(safeDiagnostic));
    const sharedCloneRuntime = engine.createPersistentSimulationRuntime(structuredClone(safeDiagnostic));
    const serialDirect = engine.advancePersistentSimulationRuntime(serialRuntime, 5, 5).state;
    const syncDirect = await engine.advancePersistentSimulationRuntimeMulticore(syncRuntime, 5, 5, multicore.runPlanetPhaseSynchronously);
    const sharedCloneDirect = await engine.advancePersistentSimulationRuntimeMulticore(sharedCloneRuntime, 5, 5, {
      run: async (state, seconds, prepared, planetIds, options) => {
        const cloned = structuredClone({ state, lookup: sharedCloneRuntime.lookup });
        const local = cloned.state;
        const lookup = cloned.lookup ?? engine.createSimulationLookupContext(local);
        return planetIds.map((planetId) => engine.runPlanetSimulationPhase(
          local,
          seconds,
          planetId,
          prepared.reception,
          prepared.beltStepReservation,
          lookup,
          undefined,
          options.batchPowerStorage,
          options.batchConstructionAutomation,
        ));
      },
    });
    const phaseRuntime = engine.createPersistentSimulationRuntime(structuredClone(safeDiagnostic));
    const prepared = engine.prepareSimulationStep(phaseRuntime.state, 5, phaseRuntime.lookup);
    const childPhaseRuntime = engine.createPersistentSimulationRuntime(structuredClone(safeDiagnostic));
    const childPrepared = engine.prepareSimulationStep(childPhaseRuntime.state, 5, childPhaseRuntime.lookup);
    const serialPhase = engine.runPlanetSimulationPhase(phaseRuntime.state, 5, "inferno", prepared.reception, prepared.beltStepReservation, phaseRuntime.lookup);
    const childPhaseState = childPhaseRuntime.state;
    const serialInferno = phaseRuntime.lookup?.entitiesByPlanet.get("inferno") ?? [];
    const childLookup = childPhaseRuntime.lookup?.entitiesByPlanet.get("inferno") ?? [];
    const childInferno = childLookup;
    const childPhase = engine.runPlanetSimulationPhase(childPhaseState, 5, "inferno", childPrepared.reception, childPrepared.beltStepReservation);
    const phaseEntity = (phase: typeof serialPhase) => phase.entities.find((entity) => entity.id === "vein_inferno_kimberlite_ore");
    const serial = await runWorker(safeDiagnostic);
    const parallel = await runWorker(safeDiagnostic, true);
    return {
      originalGate,
      serialHash: serial.state ? benchmark.hashGameState(serial.state) : null,
      parallelHash: parallel.state ? benchmark.hashGameState(parallel.state) : null,
      serialMs: serial.durationMs,
      parallelMs: parallel.durationMs,
      parallelMulticore: parallel.multicore,
      serialElapsed: serial.state?.elapsedSeconds,
      parallelElapsed: parallel.state?.elapsedSeconds,
      directSerialHash: benchmark.hashGameState(serialDirect),
      directSyncHash: benchmark.hashGameState(syncDirect.state),
      directSharedCloneHash: benchmark.hashGameState(sharedCloneDirect.state),
      phaseSerial: phaseEntity(serialPhase),
      phaseChild: phaseEntity(childPhase),
      phasePower: {
        serial: { factor: serialPhase.powerPlan.factor, demand: serialPhase.powerPlan.demandKw, generation: serialPhase.powerPlan.generationKw, entityFactor: serialPhase.powerPlan.factorByEntity.get("vein_inferno_kimberlite_ore"), machineFactor: serialPhase.powerPlan.factorByEntity.get("entity_1146115"), factors: serialPhase.powerPlan.factorByEntity.size },
        child: { factor: childPhase.powerPlan.factor, demand: childPhase.powerPlan.demandKw, generation: childPhase.powerPlan.generationKw, entityFactor: childPhase.powerPlan.factorByEntity.get("vein_inferno_kimberlite_ore"), machineFactor: childPhase.powerPlan.factorByEntity.get("entity_1146115"), factors: childPhase.powerPlan.factorByEntity.size },
      },
      phaseCounts: {
        serial: { entities: serialInferno.length, machines: serialInferno.filter((entity) => entity.kind === "machine").length, runnableLike: serialInferno.filter((entity) => entity.kind === "machine" && entity.recipeId).length },
        child: { entities: childInferno.length, machines: childInferno.filter((entity) => entity.kind === "machine").length, runnableLike: childInferno.filter((entity) => entity.kind === "machine" && entity.recipeId).length },
      },
      phasePreMachineDiff: (() => {
        const left = phaseRuntime.state.entities.find((entity) => entity.id === "entity_1146115");
        const right = childPhaseState.entities.find((entity) => entity.id === "entity_1146115");
        return left && right ? Object.keys(left).filter((key) => JSON.stringify((left as Record<string, unknown>)[key]) !== JSON.stringify((right as Record<string, unknown>)[key])) : ["missing"];
      })(),
      keyDiff: serial.state && parallel.state ? Object.keys(serial.state).filter((key) => JSON.stringify((serial.state as Record<string, unknown>)[key]) !== JSON.stringify((parallel.state as Record<string, unknown>)[key])) : [],
      entityDiff: serial.state && parallel.state ? (() => {
        const diffs: Array<{ id: string; fields: string[] }> = [];
        const parallelById = new Map(parallel.state.entities.map((entity) => [entity.id, entity]));
        for (const entity of serial.state.entities) {
          const other = parallelById.get(entity.id);
          if (!other) { diffs.push({ id: entity.id, fields: ["missing"] }); continue; }
          const fields = Object.keys(entity).filter((key) => JSON.stringify((entity as Record<string, unknown>)[key]) !== JSON.stringify((other as Record<string, unknown>)[key]));
          if (fields.length > 0) diffs.push({ id: entity.id, fields });
          if (diffs.length >= 12) break;
        }
        return diffs;
      })() : [],
    };
  }, { source });

  console.log("P6_POWER", JSON.stringify(result.phasePower), JSON.stringify(result.phaseCounts), result.phasePreMachineDiff);
  console.log("P6_DIAGNOSTIC", JSON.stringify({
    serialHash: result.serialHash,
    parallelHash: result.parallelHash,
    directSerialHash: result.directSerialHash,
    directSyncHash: result.directSyncHash,
    directSharedCloneHash: result.directSharedCloneHash,
    keyDiff: result.keyDiff,
    entityDiff: result.entityDiff,
  }));
  expect(result.originalGate).toMatchObject({ enabled: false, workerCount: 1, reason: "unsafe-boundary" });
  expect(result.directSyncHash).toBe(result.directSerialHash);
  expect(result.directSharedCloneHash).toBe(result.directSerialHash);
  expect(result.parallelHash).toBe(result.serialHash);
  expect(result.parallelElapsed).toBe(result.serialElapsed);
  expect(result.parallelMulticore).toMatchObject({ enabled: true, workerCount: 2, fallback: false });
  expect(result.serialMs).toBeGreaterThan(0);
  expect(result.parallelMs).toBeGreaterThan(0);
});

test("P6 real endgame fixture benchmarks the persistent 1/2/4 Worker paths", async ({ page }) => {
  test.setTimeout(600_000);
  test.skip(!P6_FIXTURE || !RUN_P6_BENCHMARK, "设置 DSP_P6_FIXTURE 与 DSP_RUN_P6_BENCHMARK=1 后运行正式多 Worker 基准");
  await page.goto("/");
  const envelope = JSON.parse(readFileSync(P6_FIXTURE!, "utf8")) as { state?: Record<string, unknown> } & Record<string, unknown>;
  const source = (envelope.state ?? envelope) as Record<string, unknown>;
  const result = await page.evaluate(async ({ source, secondsPerRequest, sampleCount, warmupCount }) => {
    const packs = await import("/src/game/contentPacks.ts");
    const benchmark = await import("/src/game/benchmark.ts");
    const registry = packs.createContentPackRuntimeSnapshot(packs.createContentPackRegistry());
    const initial = structuredClone(source) as { entities: Array<Record<string, unknown>>; research: { selectedTechId: string | null }; endgame: { activeInfiniteResearchId: string | null }; paused: boolean } & Record<string, unknown>;
    initial.paused = false;
    initial.research.selectedTechId = null;
    initial.endgame.activeInfiniteResearchId = null;
    initial.entities = initial.entities.map((entity) => entity.recipeId === "solar_sail_launch" || entity.recipeId === "carrier_rocket_launch"
      ? { ...entity, recipeId: undefined, progress: 0, utilization: 0, productionRate: 0 }
      : entity);
    const percentile = (samples: number[], ratio: number) => {
      const ordered = [...samples].sort((left, right) => left - right);
      return ordered[Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * ratio) - 1))] ?? 0;
    };
    const summarize = (state: typeof initial) => {
      const entities = state.entities as Array<{
        stationDrones?: number;
        stationVessels?: number;
        stationWarpers?: number;
        stationRoutes?: Array<{ cargo?: number; vehicleCount?: number }>;
      }>;
      const network = state.quantumLogisticsNetwork as { inventory?: Record<string, string> } | undefined;
      return {
        drones: entities.reduce((sum, entity) => sum + Math.max(0, Math.floor(entity.stationDrones ?? 0)), 0),
        vessels: entities.reduce((sum, entity) => sum + Math.max(0, Math.floor(entity.stationVessels ?? 0)), 0),
        warpers: entities.reduce((sum, entity) => sum + Math.max(0, Math.floor(entity.stationWarpers ?? 0)), 0),
        routeCargo: entities.reduce((sum, entity) => sum + (entity.stationRoutes ?? []).reduce((routeSum, route) => routeSum + Math.max(0, Math.floor(route.cargo ?? 0)), 0), 0),
        routeVehicles: entities.reduce((sum, entity) => sum + (entity.stationRoutes ?? []).reduce((routeSum, route) => routeSum + Math.max(0, Math.floor(route.vehicleCount ?? 0)), 0), 0),
        quantumInventory: Object.entries(network?.inventory ?? {}).reduce((sum, [, amount]) => sum + BigInt(amount || "0"), 0n).toString(),
      };
    };
    const runConfiguration = async (workerCount: 1 | 2 | 4) => {
      const worker = new Worker(new URL("/src/game/simulation.worker.ts", location.origin), { type: "module" });
      let requestId = 0;
      let firstState: typeof initial | undefined = structuredClone(initial);
      let finalState: typeof initial | undefined;
      const send = (seconds: number) => new Promise<{
        durationMs: number;
        roundTripMs: number;
        state: typeof initial;
        profiler?: Record<string, number>;
        multicore?: { enabled: boolean; workerCount: number; fallback?: boolean };
      }>((resolve, reject) => {
        const id = ++requestId;
        const startedAt = performance.now();
        const timeout = window.setTimeout(() => reject(new Error(`P6 ${workerCount} Worker 基准超时`)), 180_000);
        const handle = (event: MessageEvent) => {
          if (event.data.id !== id) return;
          worker.removeEventListener("message", handle);
          window.clearTimeout(timeout);
          if (!event.data.state) reject(new Error(event.data.registryError ?? "P6 基准未返回状态"));
          else resolve({
            durationMs: event.data.durationMs ?? 0,
            roundTripMs: performance.now() - startedAt,
            state: event.data.state,
            profiler: event.data.profiler,
            multicore: event.data.multicore,
          });
        };
        worker.addEventListener("message", handle);
        worker.postMessage({
          id,
          ...(firstState ? { state: firstState } : {}),
          simulationSeconds: seconds,
          wallSeconds: seconds,
          profile: true,
          registryFingerprint: registry.fingerprint,
          ...(firstState ? { registry } : {}),
          ...(workerCount > 1 ? { multicore: { enabled: true, requestedWorkers: workerCount, benchmarkSpeedup: 2, completeSimulationProof: true } } : {}),
        });
        firstState = undefined;
      });
      try {
        for (let index = 0; index < warmupCount; index += 1) finalState = (await send(secondsPerRequest)).state;
        const samples = [];
        for (let index = 0; index < sampleCount; index += 1) {
          const sample = await send(secondsPerRequest);
          finalState = sample.state;
          samples.push(sample);
        }
        if (!finalState) throw new Error("P6 基准没有最终状态");
        const durations = samples.map((sample) => sample.durationMs);
        const roundTrips = samples.map((sample) => sample.roundTripMs);
        const stageKeys = ["copyStateMs", "productionMs", "powerMs", "beltsMs", "logisticsMs", "quantumMs", "dysonMs", "constructionMs", "historyMs"];
        return {
          workerCount,
          secondsPerRequest,
          internal: {
            averageMs: durations.reduce((sum, value) => sum + value, 0) / durations.length,
            p50Ms: percentile(durations, 0.5),
            p95Ms: percentile(durations, 0.95),
            maxMs: Math.max(...durations),
          },
          roundTrip: {
            averageMs: roundTrips.reduce((sum, value) => sum + value, 0) / roundTrips.length,
            p50Ms: percentile(roundTrips, 0.5),
            p95Ms: percentile(roundTrips, 0.95),
            maxMs: Math.max(...roundTrips),
          },
          hash: benchmark.hashGameState(finalState as never),
          summary: summarize(finalState),
          stageAverageMs: Object.fromEntries(stageKeys.map((key) => [key, samples.reduce((sum, sample) => sum + (sample.profiler?.[key] ?? 0), 0) / samples.length])),
          multicore: samples.at(-1)?.multicore,
        };
      } finally {
        worker.terminate();
      }
    };
    const results = [];
    for (const workerCount of [1, 2, 4] as const) results.push(await runConfiguration(workerCount));
    return results;
  }, {
    source,
    secondsPerRequest: P6_BENCHMARK_SECONDS,
    sampleCount: P6_BENCHMARK_SAMPLES,
    warmupCount: P6_BENCHMARK_WARMUPS,
  });

  const baseline = result[0].internal.averageMs;
  const report = result.map((entry) => ({
    ...entry,
    changeVsSinglePercent: baseline > 0 ? (entry.internal.averageMs / baseline - 1) * 100 : 0,
  }));
  console.log("P6_BENCHMARK", JSON.stringify(report));
  expect(new Set(result.map((entry) => entry.hash)).size).toBe(1);
  expect(new Set(result.map((entry) => JSON.stringify(entry.summary))).size).toBe(1);
  expect(result[0].multicore).toBeUndefined();
  expect(result[1].multicore).toMatchObject({ enabled: true, workerCount: 2, fallback: false });
  expect(result[2].multicore).toMatchObject({ enabled: true, workerCount: 4, fallback: false });
});
