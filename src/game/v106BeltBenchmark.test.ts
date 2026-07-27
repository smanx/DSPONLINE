import { describe, it } from "vitest";
import { advanceSimulation, connectBelt, createInitialState, placeBuilding, setLogisticsItem } from "./engine";

const runBenchmark = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } })
  .process?.env?.DSP_RUN_V106_BELT_BENCHMARK === "1";

describe.runIf(runBenchmark)("V1.06 belt lane benchmark", () => {
  it("measures 64, 256, 1024 and 4096 lanes with the same constant-size belt object", () => {
    for (const lanes of [64, 256, 1_024, 4_096]) {
      let state = createInitialState(10_611);
      state.research.completedTechIds.push("basic_logistics", "material_delivery_logistics", "super_magnetic_logistics");
      state.construction.storage_mk1 = 1;
      state.construction.material_delivery_hub = 1;
      state.construction.conveyor_belt_mk3 = lanes;
      state = placeBuilding(state, "storage_mk1", { x: -320, y: 0 });
      state = placeBuilding(state, "material_delivery_hub", { x: 0, y: 0 });
      const source = state.entities.find((entity) => entity.buildingId === "storage_mk1")!;
      const target = state.entities.find((entity) => entity.buildingId === "material_delivery_hub")!;
      state = setLogisticsItem(state, source.id, "iron_ingot");
      state = connectBelt(state, source.id, target.id, "iron_ingot", 3);
      state.belts[0].lanes = lanes;
      state.belts[0].stackSize = 4;
      const startedAt = performance.now();
      for (let step = 0; step < 2_000; step += 1) state = advanceSimulation(state, 0.1);
      const elapsedMs = performance.now() - startedAt;
      console.info(JSON.stringify({ lanes, steps: 2_000, elapsedMs: Math.round(elapsedMs * 100) / 100, beltObjects: state.belts.length }));
    }
  });
});
