import { describe, expect, it } from "vitest";
import { advancePersistentSimulationRuntime, advancePersistentSimulationRuntimeMulticore, createInitialState, createPersistentSimulationRuntime, mergeSimulationPlanetPhaseResults } from "./engine";
import { hashGameState } from "./benchmark";
import { planMulticoreSimulation, runPlanetPhaseSynchronously } from "./multicoreSimulation";
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
