import { describe, expect, it } from "vitest";
import {
  applyStationSlotTemplateToEntities,
  createInitialState,
  connectBelt,
  getStationSlots,
  placeBuilding,
  setActivePlanet,
  setEntitiesRecipe,
  setStationSlotItem,
} from "./engine";
import type { StationSlotTemplate } from "./types";

function unlockAshen<T extends ReturnType<typeof createInitialState>>(state: T): T {
  if (!state.exploration.colonizedPlanetIds.includes("ashen")) state.exploration.colonizedPlanetIds.push("ashen");
  return state;
}

describe("cross-planet production management commands", () => {
  it("keeps buffers and belts when a batch reapplies the current recipe", () => {
    let state = createInitialState();
    state.construction.arc_smelter = 1;
    state.construction.conveyor_belt_mk1 = 1;
    state = placeBuilding(state, "arc_smelter", { x: 260, y: 0 });
    const smelter = state.entities.find((entity) => entity.buildingId === "arc_smelter")!;
    state = connectBelt(state, "vein_iron", smelter.id, "iron_ore");
    state.entities.find((entity) => entity.id === smelter.id)!.inputs.iron_ore = 8;

    const next = setEntitiesRecipe(state, [smelter.id], smelter.recipeId!);

    expect(next).toBe(state);
    expect(next.entities.find((entity) => entity.id === smelter.id)?.inputs.iron_ore).toBe(8);
    expect(next.belts).toHaveLength(1);
  });

  it("changes only compatible recipes and refunds buffers to each local planet tray", () => {
    let state = unlockAshen(createInitialState());
    state.construction.arc_smelter = 2;
    state = placeBuilding(state, "arc_smelter", { x: 260, y: 0 });
    const homeSmelter = state.entities.find((entity) => entity.buildingId === "arc_smelter" && entity.planetId === "home")!;
    state = setActivePlanet(state, "ashen");
    state = placeBuilding(state, "arc_smelter", { x: 260, y: 0 });
    const ashenSmelter = state.entities.find((entity) => entity.buildingId === "arc_smelter" && entity.planetId === "ashen")!;
    state.entities.find((entity) => entity.id === homeSmelter.id)!.inputs.iron_ore = 7;
    state.entities.find((entity) => entity.id === ashenSmelter.id)!.inputs.iron_ore = 11;
    state = setActivePlanet(state, "home");

    state = setEntitiesRecipe(state, [homeSmelter.id, ashenSmelter.id, "vein_iron"], "copper_ingot");

    expect(state.activePlanetId).toBe("home");
    expect(state.entities.find((entity) => entity.id === homeSmelter.id)?.recipeId).toBe("copper_ingot");
    expect(state.entities.find((entity) => entity.id === ashenSmelter.id)?.recipeId).toBe("copper_ingot");
    expect(state.tray.iron_ore).toBe(7);
    expect(state.planetTrays.ashen.iron_ore).toBe(11);
    expect(state.entities.find((entity) => entity.id === "vein_iron")?.recipeId).toBeUndefined();
  });

  it("applies one station slot across planets without overwriting other slots", () => {
    let state = unlockAshen(createInitialState());
    state.construction.interstellar_logistics_station = 2;
    state = placeBuilding(state, "interstellar_logistics_station", { x: 260, y: 0 });
    const homeStation = state.entities.find((entity) => entity.buildingId === "interstellar_logistics_station" && entity.planetId === "home")!;
    state = setStationSlotItem(state, homeStation.id, 0, "iron_ingot");
    state = setStationSlotItem(state, homeStation.id, 1, "copper_ingot");
    state.entities.find((entity) => entity.id === homeStation.id)!.outputs.iron_ingot = 5;
    state = setActivePlanet(state, "ashen");
    state = placeBuilding(state, "interstellar_logistics_station", { x: 260, y: 0 });
    const ashenStation = state.entities.find((entity) => entity.buildingId === "interstellar_logistics_station" && entity.planetId === "ashen")!;
    state = setStationSlotItem(state, ashenStation.id, 0, "iron_ingot");
    state = setStationSlotItem(state, ashenStation.id, 1, "copper_ingot");
    state.entities.find((entity) => entity.id === ashenStation.id)!.outputs.iron_ingot = 9;
    state = setActivePlanet(state, "home");
    const template: StationSlotTemplate = {
      itemId: "titanium_ingot",
      localMode: "demand",
      remoteMode: "supply",
      minimumLoad: 0.25,
      minStock: 20,
      maxStock: 200,
      priority: 2,
    };

    state = applyStationSlotTemplateToEntities(state, [homeStation.id, ashenStation.id], 0, template);

    expect(state.activePlanetId).toBe("home");
    for (const stationId of [homeStation.id, ashenStation.id]) {
      const station = state.entities.find((entity) => entity.id === stationId)!;
      expect(getStationSlots(station)[0]).toEqual(template);
      expect(getStationSlots(station)[1].itemId).toBe("copper_ingot");
    }
    expect(state.tray.iron_ingot).toBe(5);
    expect(state.planetTrays.ashen.iron_ingot).toBe(9);
  });

  it("skips a station when the template item already occupies another slot", () => {
    let state = createInitialState();
    state.construction.planetary_logistics_station = 1;
    state = placeBuilding(state, "planetary_logistics_station", { x: 260, y: 0 });
    const station = state.entities.find((entity) => entity.buildingId === "planetary_logistics_station")!;
    state = setStationSlotItem(state, station.id, 1, "titanium_ingot");
    const before = getStationSlots(state.entities.find((entity) => entity.id === station.id)!);
    const template: StationSlotTemplate = {
      itemId: "titanium_ingot",
      localMode: "demand",
      remoteMode: "storage",
      minimumLoad: 0.5,
      minStock: 0,
      maxStock: 100,
      priority: 1,
    };

    const next = applyStationSlotTemplateToEntities(state, [station.id], 0, template);

    expect(getStationSlots(next.entities.find((entity) => entity.id === station.id)!)).toEqual(before);
  });
});
