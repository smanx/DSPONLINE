import { describe, expect, it } from "vitest";
import { createInitialState } from "./engine";
import { getProductionLineLocations } from "./productionLocator";

describe("production line locator", () => {
  it("collects every producer and recursively follows upstream belts without changing selection state", () => {
    const game = createInitialState();
    game.entities.push(
      {
        id: "smelter", kind: "machine", planetId: "home", position: { x: 0, y: 0 }, buildingId: "arc_smelter",
        recipeId: "iron_ingot", machineCount: 1, minerCount: 0, inputs: {}, outputs: {}, progress: 0, utilization: 0, productionRate: 0, interactionLocked: false, routingCursor: 0,
      },
      {
        id: "storage", kind: "storage", planetId: "home", position: { x: -200, y: 0 }, buildingId: "storage_mk1",
        storedItemId: "iron_ore", machineCount: 1, minerCount: 0, inputs: {}, outputs: {}, progress: 0, utilization: 0, productionRate: 0, interactionLocked: false, routingCursor: 0,
      },
    );
    game.belts.push(
      { id: "ore_to_storage", planetId: "home", source: "vein_iron", target: "storage", itemId: "iron_ore", lanes: 1, tier: 1, sorterTier: 1, progress: 0, priority: 1, lastFlow: 0 },
      { id: "storage_to_smelter", planetId: "home", source: "storage", target: "smelter", itemId: "iron_ore", lanes: 1, tier: 1, sorterTier: 1, progress: 0, priority: 1, lastFlow: 0 },
    );
    game.entities.find((entity) => entity.id === "vein_iron")!.minerCount = 1;

    expect(getProductionLineLocations(game, "iron_ingot")).toEqual([{
      planetId: "home",
      producerEntityIds: ["smelter"],
      relatedEntityIds: ["smelter", "storage", "vein_iron"],
      relatedBeltIds: ["storage_to_smelter", "ore_to_storage"],
    }]);
  });

  it("returns separate planet choices for the same product", () => {
    const game = createInitialState();
    game.entities.find((entity) => entity.id === "vein_iron")!.minerCount = 1;
    game.entities.find((entity) => entity.id === "ashen_iron")!.minerCount = 1;
    expect(getProductionLineLocations(game, "iron_ore").map((location) => location.planetId)).toEqual(["home", "ashen"]);
  });
});
