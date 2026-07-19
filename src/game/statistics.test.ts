import { describe, expect, it } from "vitest";
import { advanceSimulation, createInitialState, installMiner, placeBuilding, setFuelItem } from "./engine";
import { calculateFactoryStatistics } from "./statistics";

describe("factory statistics", () => {
  it("derives recipe production, consumption, inventory and power demand", () => {
    let state = createInitialState();
    state = placeBuilding(state, "wind_turbine", { x: 0, y: 0 }, 2);
    state = placeBuilding(state, "arc_smelter", { x: 300, y: 0 });
    const smelter = state.entities.find((entity) => entity.buildingId === "arc_smelter")!;
    smelter.inputs.iron_ore = 100;
    state = advanceSimulation(state, 0.5);

    const statistics = calculateFactoryStatistics(state);
    const ore = statistics.items.find((item) => item.itemId === "iron_ore")!;
    const ingot = statistics.items.find((item) => item.itemId === "iron_ingot")!;
    expect(ore.consumptionPerMinute).toBe(60);
    expect(ore.inventory).toBe(100);
    expect(ingot.productionPerMinute).toBe(60);
    expect(ingot.netPerMinute).toBe(60);
    expect(statistics.powerConsumers[0]).toMatchObject({ equipmentName: "电弧熔炉", activeDemandKw: 360, ratedDemandKw: 360 });
  });

  it("reports missing inputs and blocked producers as bottlenecks", () => {
    let state = createInitialState();
    state = placeBuilding(state, "arc_smelter", { x: 0, y: 0 });
    const smelter = state.entities.find((entity) => entity.buildingId === "arc_smelter")!;
    let statistics = calculateFactoryStatistics(state);
    expect(statistics.issues[0]).toMatchObject({ equipmentName: "电弧熔炉", status: { code: "missing-input", label: "缺少铁矿石" } });

    smelter.outputs.iron_ingot = 120;
    statistics = calculateFactoryStatistics(state);
    expect(statistics.issues[0].status.code).toBe("output-blocked");
    expect(statistics.items.find((item) => item.itemId === "iron_ingot")?.blockedProducerCount).toBe(1);
  });

  it("converts real thermal output into fuel consumption rate", () => {
    let state = createInitialState();
    state.construction.thermal_power_plant = 1;
    state = placeBuilding(state, "thermal_power_plant", { x: 0, y: 0 });
    const plant = state.entities.find((entity) => entity.buildingId === "thermal_power_plant")!;
    state = setFuelItem(state, plant.id, "coal");
    state.entities.find((entity) => entity.id === plant.id)!.inputs.coal = 2;
    state = installMiner(state, "vein_iron");
    state = advanceSimulation(state, 0.2);

    const statistics = calculateFactoryStatistics(state);
    const coal = statistics.items.find((item) => item.itemId === "coal")!;
    expect(state.metrics.thermalGenerationKw).toBe(420);
    expect(coal.consumptionPerMinute).toBeCloseTo(11.67, 2);
    expect(coal.consumerCount).toBe(1);
  });
});
