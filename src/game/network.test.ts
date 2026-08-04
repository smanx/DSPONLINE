import { describe, expect, it } from "vitest";
import { connectBelt, createInitialState, getEntityItemInputCapacity, placeBuilding, setEntityRecipe, setLogisticsItem } from "./engine";
import { analyzeBeltNetwork, diagnoseBelt, getBeltBundleMap, getPortOccupancy, listBeltNetworks, predictBeltConnection } from "./network";

describe("production network diagnostics", () => {
  it("forecasts a connection before the belt is built", () => {
    let state = createInitialState();
    state.construction.arc_smelter = 1;
    state = placeBuilding(state, "arc_smelter", { x: 400, y: 0 });
    const smelter = state.entities.find((entity) => entity.buildingId === "arc_smelter")!;
    state = setEntityRecipe(state, smelter.id, "iron_ingot");
    const forecast = predictBeltConnection(state, "vein_iron", smelter.id, "iron_ore", 1);
    expect(forecast?.capacityPerSecond).toBeGreaterThan(0);
    expect(forecast?.label).toContain("/s");
  });
  it("traces directional branches and diagnoses starvation", () => {
    let state = createInitialState();
    state.construction.storage_mk1 = 1;
    state.construction.arc_smelter = 1;
    state.construction.conveyor_belt_mk1 = 2;
    state = placeBuilding(state, "storage_mk1", { x: 0, y: 0 });
    state = placeBuilding(state, "arc_smelter", { x: 400, y: 0 });
    const storage = state.entities.find((entity) => entity.buildingId === "storage_mk1")!;
    const smelter = state.entities.find((entity) => entity.buildingId === "arc_smelter")!;
    state = setLogisticsItem(state, storage.id, "iron_ore");
    state = setEntityRecipe(state, smelter.id, "iron_ingot");
    state = connectBelt(state, "vein_iron", storage.id, "iron_ore");
    state = connectBelt(state, storage.id, smelter.id, "iron_ore");

    const snapshot = analyzeBeltNetwork(state, state.belts[1].id)!;
    expect(snapshot.beltIds).toHaveLength(2);
    expect(snapshot.upstreamBeltIds).toEqual([state.belts[0].id]);
    expect(snapshot.downstreamBeltIds).toEqual([]);
    expect(snapshot.sourceEntityIds).toEqual(["vein_iron"]);
    expect(snapshot.sinkEntityIds).toEqual([smelter.id]);
    expect(snapshot.health).toBe("starved");
  });

  it("reports congestion, occupied ports and parallel bundles", () => {
    let state = createInitialState();
    state.construction.arc_smelter = 2;
    state.construction.conveyor_belt_mk1 = 2;
    state = placeBuilding(state, "arc_smelter", { x: 300, y: 0 });
    state = placeBuilding(state, "arc_smelter", { x: 300, y: 260 });
    const [firstPlaced, second] = state.entities.filter((entity) => entity.buildingId === "arc_smelter");
    state = setEntityRecipe(state, firstPlaced.id, "iron_ingot");
    state = connectBelt(state, "vein_iron", firstPlaced.id, "iron_ore");
    state = connectBelt(state, "vein_iron", second.id, "iron_ore");
    const first = state.entities.find((entity) => entity.id === firstPlaced.id)!;
    state.belts[0].congestion = 0.9;
    state.entities.find((entity) => entity.id === "vein_iron")!.outputs.iron_ore = 20;
    first.inputs.iron_ore = getEntityItemInputCapacity(state, first, "iron_ore");

    expect(diagnoseBelt(state, state.belts[0]).health).toBe("congested");
    const occupancy = getPortOccupancy(state);
    expect(occupancy.output.get("vein_iron")?.iron_ore).toBe(2);
    expect(occupancy.input.get(first.id)?.iron_ore).toBe(1);

    state.belts[1].target = first.id;
    const bundles = getBeltBundleMap(state);
    expect(bundles.get(state.belts[0].id)).toEqual({ index: 0, size: 2 });
    expect(bundles.get(state.belts[1].id)).toEqual({ index: 1, size: 2 });
    const networks = listBeltNetworks(state, "home");
    expect(networks).toHaveLength(1);
    expect(networks[0]).toMatchObject({ health: "congested", beltIds: expect.arrayContaining(state.belts.map((belt) => belt.id)) });
    expect(networks[0].capacityDeficit).toBeGreaterThan(0);
  });
});
