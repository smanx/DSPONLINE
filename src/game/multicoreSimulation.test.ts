import { describe, expect, it } from "vitest";
import { advancePersistentSimulationRuntime, advancePersistentSimulationRuntimeMulticore, createInitialState, createPersistentSimulationRuntime, mergeSimulationPlanetPhaseResults, prepareSimulationStep } from "./engine";
import { hashGameState } from "./benchmark";
import { BrowserMulticoreExecutor, partitionPlanetPhaseWork, planMulticoreSimulation, runPlanetPhaseSynchronously, type PlanetPhaseWorkerRequest } from "./multicoreSimulation";
import { PLANET_LIST } from "./content";


describe("multicore simulation guardrail", () => {
  it("keeps the production path on one worker unless explicitly approved", () => {
    const state = createInitialState();
    expect(planMulticoreSimulation(state, { enabled: true, requestedWorkers: 8, benchmarkSpeedup: 2 })).toMatchObject({ workerCount: 1, enabled: false });
  });

  it("caps approved desktop experiments and rejects low measured speedups", () => {
    const state = createInitialState();
    state.entities = Array.from({ length: 600 }, (_, index) => ({ ...state.entities[0], id: `e-${index}` }));
    const plan = planMulticoreSimulation(state, { enabled: true, requestedWorkers: 8, benchmarkSpeedup: 1.5, completeSimulationProof: true });
    expect(plan).toMatchObject({ workerCount: 4, enabled: true, reason: "approved", mode: "planet-phase" });
    expect(planMulticoreSimulation(state, { enabled: true, requestedWorkers: 4, benchmarkSpeedup: 1.01 }).reason).toBe("transfer-cost");
  });

  it("keeps shared research and construction boundaries on the authority Worker", () => {
    const state = createInitialState();
    state.entities = Array.from({ length: 600 }, (_, index) => ({ ...state.entities[0], id: `e-${index}` }));
    state.endgame.activeInfiniteResearchId = "matrix_compression";
    state.entities[0].recipeId = "matrix_research";
    expect(planMulticoreSimulation(state, { enabled: true, requestedWorkers: 4, benchmarkSpeedup: 2, completeSimulationProof: true })).toMatchObject({
      workerCount: 1,
      enabled: false,
      reason: "unsafe-boundary",
      mode: "single",
    });
    state.endgame.activeInfiniteResearchId = null;
    state.entities[0].recipeId = undefined;
    state.paused = true;
    expect(planMulticoreSimulation(state, { enabled: true, requestedWorkers: 4, benchmarkSpeedup: 2, completeSimulationProof: true }).reason).toBe("unsafe-boundary");
    state.paused = false;
    state.timeWarp.enabled = true;
    expect(planMulticoreSimulation(state, { enabled: true, requestedWorkers: 4, benchmarkSpeedup: 2, completeSimulationProof: true }).reason).toBe("unsafe-boundary");
    state.timeWarp.enabled = false;
    state.entities[0].recipeId = "solar_sail_launch";
    expect(planMulticoreSimulation(state, { enabled: true, requestedWorkers: 4, benchmarkSpeedup: 2, completeSimulationProof: true }).reason).toBe("unsafe-boundary");
  });

  it("keeps the phased coordinator deterministic against the serial oracle", async () => {
    const source = createInitialState();
    const serialRuntime = createPersistentSimulationRuntime(structuredClone(source));
    const serial = advancePersistentSimulationRuntime(serialRuntime, 5, 5);
    const runtime = createPersistentSimulationRuntime(structuredClone(source));
    const parallel = await advancePersistentSimulationRuntimeMulticore(runtime, 5, 5, runPlanetPhaseSynchronously);
    expect(hashGameState(parallel.state)).toBe(hashGameState(serial.state));
    expect(parallel.state.elapsedSeconds).toBe(serial.state.elapsedSeconds);
  });

  it("assigns every planet to one stable load-balanced batch", () => {
    const state = createInitialState();
    const planetIds = PLANET_LIST.map((planet) => planet.id);
    state.entities = Array.from({ length: 900 }, (_, index) => ({
      ...state.entities[0],
      id: `p6-partition-${index}`,
      planetId: planetIds[index % Math.min(6, planetIds.length)],
    }));
    const first = partitionPlanetPhaseWork(state, planetIds, 4);
    const second = partitionPlanetPhaseWork(state, planetIds, 4);
    expect(first).toEqual(second);
    expect(first).toHaveLength(4);
    expect(first.flat().sort()).toEqual([...planetIds].sort());
    expect(new Set(first.flat()).size).toBe(planetIds.length);
  });

  it("sends one compact request per child Worker instead of one full state per planet", async () => {
    const state = createInitialState();
    const planetIds = PLANET_LIST.map((planet) => planet.id);
    state.entities = Array.from({ length: 900 }, (_, index) => ({
      ...state.entities[0],
      id: `p6-request-${index}`,
      planetId: planetIds[index % Math.min(6, planetIds.length)],
    }));
    const posted: PlanetPhaseWorkerRequest[] = [];
    const executor = new BrowserMulticoreExecutor(4, () => ({
      onmessage: null,
      onerror: null,
      postMessage: (message: PlanetPhaseWorkerRequest) => { posted.push(message); },
      terminate: () => undefined,
    }));
    const runtime = createPersistentSimulationRuntime(state);
    const prepared = prepareSimulationStep(runtime.state, 1, runtime.lookup);
    const pending = executor.run(runtime.state, 1, prepared, planetIds, {
      batchPowerStorage: true,
      batchConstructionAutomation: true,
    });
    const rejection = expect(pending).rejects.toThrow("已终止");
    expect(posted).toHaveLength(4);
    expect(posted.flatMap((request) => request.planetIds).sort()).toEqual([...planetIds].sort());
    expect(posted.every((request) => request.state.belts.length === 0)).toBe(true);
    expect(posted.every((request) => request.state.entities.length < state.entities.length)).toBe(true);
    executor.terminate();
    await rejection;
  });

  it("keeps 60 seconds deterministic across whole and segmented planet phases", async () => {
    const source = createInitialState();
    const authoritativeHash = (state: typeof source) => hashGameState({ ...state, productionHistory: [] });
    const serialRuntime = createPersistentSimulationRuntime(structuredClone(source));
    const serial = advancePersistentSimulationRuntime(serialRuntime, 60, 60).state;
    const wholeRuntime = createPersistentSimulationRuntime(structuredClone(source));
    const whole = (await advancePersistentSimulationRuntimeMulticore(wholeRuntime, 60, 60, runPlanetPhaseSynchronously)).state;
    const segmentedRuntime = createPersistentSimulationRuntime(structuredClone(source));
    for (let index = 0; index < 60; index += 1) {
      await advancePersistentSimulationRuntimeMulticore(segmentedRuntime, 1, 1, runPlanetPhaseSynchronously);
    }
    expect(authoritativeHash(whole)).toBe(authoritativeHash(serial));
    expect(authoritativeHash(segmentedRuntime.state)).toBe(authoritativeHash(serial));
    expect(segmentedRuntime.state.elapsedSeconds).toBe(serial.elapsedSeconds);
  }, 30_000);

  it("validates every partition before mutating the coordinator state", () => {
    const state = createInitialState();
    const emptyPower = {
      generationKw: 0,
      demandKw: 0,
      factor: 1,
      windGenerationKw: 0,
      solarGenerationKw: 0,
      geothermalGenerationKw: 0,
      thermalGenerationKw: 0,
      fusionGenerationKw: 0,
      artificialStarGenerationKw: 0,
      rayGenerationKw: 0,
      storageDischargeKw: 0,
      storageChargeKw: 0,
      powerOutputByEntity: new Map<string, number>(),
      powerInputByEntity: new Map<string, number>(),
      factorByEntity: new Map<string, number>(),
      connectedEntities: 0,
      disconnectedEntities: 0,
      generatorCount: 0,
    };
    const results = PLANET_LIST.map(({ id: planetId }) => ({
      planetId,
      entities: state.entities.filter((entity) => entity.planetId === planetId),
      powerGridMetrics: state.powerGridMetrics[planetId],
      planetMetrics: state.planetMetrics[planetId],
      totalProducedDelta: {},
      totalProducedKeys: [],
      powerPlan: emptyPower,
    }));
    const before = JSON.stringify(state);
    expect(() => mergeSimulationPlanetPhaseResults(state, results.slice(0, -1))).toThrow("不完整");
    expect(JSON.stringify(state)).toBe(before);

    const duplicatePlanet = [...results, { ...results[0], entities: [] }];
    expect(() => mergeSimulationPlanetPhaseResults(state, duplicatePlanet)).toThrow("重复");
    expect(JSON.stringify(state)).toBe(before);

    const unknownEntity = results.map((result, index) => index === 0
      ? { ...result, entities: [...result.entities, { ...state.entities[0], id: "unknown-p6-entity" }] }
      : result);
    expect(() => mergeSimulationPlanetPhaseResults(state, unknownEntity)).toThrow("未知实体");
    expect(JSON.stringify(state)).toBe(before);
  });
});
