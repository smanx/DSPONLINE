import { describe, expect, it } from "vitest";
import { getBuilding } from "./content";
import { advanceSimulation, connectBelt, createInitialState, placeBuilding, setLogisticsItem } from "./engine";
import { getProductionManagementSnapshot } from "./productionManagement";

describe("production management", () => {
  it("summarizes a normally running production device", () => {
    let state = createInitialState();
    state = placeBuilding(state, "wind_turbine", { x: 0, y: 0 }, 2);
    state = placeBuilding(state, "arc_smelter", { x: 320, y: 0 });
    const smelter = state.entities.find((entity) => entity.buildingId === "arc_smelter")!;
    smelter.inputs.iron_ore = 20;
    state = advanceSimulation(state, 0.5);

    const row = getProductionManagementSnapshot(state).rows.find((candidate) => candidate.entityId === smelter.id)!;
    expect(row).toMatchObject({ group: "smelting", state: "running", processName: "铁块" });
    expect(row.productionRate).toBeGreaterThan(0);
    expect(row.inputItemIds).toEqual(["iron_ore"]);
    expect(row.outputItemIds).toEqual(["iron_ingot"]);
  });

  it("traces a missing input through its inbound belt, upstream machine and raw vein", () => {
    let state = createInitialState();
    state.construction.arc_smelter = 1;
    state.construction.assembling_machine_mk1 = 1;
    state.construction.conveyor_belt_mk1 = 2;
    state = placeBuilding(state, "arc_smelter", { x: 300, y: 0 });
    state = placeBuilding(state, "assembling_machine_mk1", { x: 620, y: 0 });
    const smelter = state.entities.find((entity) => entity.buildingId === "arc_smelter")!;
    const assembler = state.entities.find((entity) => entity.buildingId === "assembling_machine_mk1")!;
    state = connectBelt(state, "vein_iron", smelter.id, "iron_ore");
    state = connectBelt(state, smelter.id, assembler.id, "iron_ingot");

    const row = getProductionManagementSnapshot(state).rows.find((candidate) => candidate.entityId === assembler.id)!;
    const iron = row.inputTraces.find((trace) => trace.itemId === "iron_ingot")!;
    expect(row.state).toBe("missing");
    expect(iron.inboundBeltIds).toEqual([state.belts[1].id]);
    expect(iron.upstreamEntityIds).toContain(smelter.id);
    expect(iron.rootSourceEntityIds).toContain("vein_iron");
    expect(iron.focusBeltId).toBe(state.belts[1].id);
    expect(iron.label).toContain("上游电弧熔炉");
  });

  it("identifies a congested output belt and its full downstream cache", () => {
    let state = createInitialState();
    state.construction.arc_smelter = 1;
    state.construction.storage_mk1 = 1;
    state.construction.conveyor_belt_mk1 = 1;
    state = placeBuilding(state, "arc_smelter", { x: 260, y: 0 });
    state = placeBuilding(state, "storage_mk1", { x: 620, y: 0 });
    const smelter = state.entities.find((entity) => entity.buildingId === "arc_smelter")!;
    const storage = state.entities.find((entity) => entity.buildingId === "storage_mk1")!;
    state = setLogisticsItem(state, storage.id, "iron_ingot");
    state = connectBelt(state, smelter.id, storage.id, "iron_ingot");
    state.entities.find((entity) => entity.id === smelter.id)!.outputs.iron_ingot = getBuilding("arc_smelter").outputCapacity;
    state.entities.find((entity) => entity.id === storage.id)!.inputs.iron_ingot = getBuilding("storage_mk1").inputCapacity;

    const row = getProductionManagementSnapshot(state).rows.find((candidate) => candidate.entityId === smelter.id)!;
    const output = row.outputTraces.find((trace) => trace.itemId === "iron_ingot")!;
    expect(row.state).toBe("blocked");
    expect(output.label).toBe("下游缓存已满");
    expect(output.focusBeltId).toBe(state.belts[0].id);
    expect(output.downstreamEntityIds).toEqual([storage.id]);
  });

  it("keeps per-planet capacity summaries separate", () => {
    let state = createInitialState();
    state.construction.arc_smelter = 1;
    state = placeBuilding(state, "arc_smelter", { x: 300, y: 0 });
    const smelter = state.entities.find((entity) => entity.buildingId === "arc_smelter")!;
    smelter.planetId = "ashen";
    state.exploration.colonizedPlanetIds.push("ashen");

    const snapshot = getProductionManagementSnapshot(state);
    expect(snapshot.planets.find((planet) => planet.planetId === "home")?.entityCount).toBe(0);
    expect(snapshot.planets.find((planet) => planet.planetId === "ashen")?.entityCount).toBe(1);
  });
});
