import { describe, expect, it } from "vitest";
import { connectBelt, createInitialState, placeBuilding, setEntityRecipe } from "./engine";
import { planFactoryAutoLayout } from "./layout";

describe("factory auto layout", () => {
  it("orders connected production nodes from upstream to downstream", () => {
    let state = createInitialState();
    state = placeBuilding(state, "arc_smelter", { x: 800, y: 500 });
    const smelter = state.entities.find((entity) => entity.buildingId === "arc_smelter")!;
    state = setEntityRecipe(state, smelter.id, "iron_ingot");
    state = connectBelt(state, "vein_iron", smelter.id, "iron_ore");
    const move = planFactoryAutoLayout(state, "home").find((candidate) => candidate.id === smelter.id);
    expect(move).toBeDefined();
    expect(move!.position.x % 20).toBe(0);
  });

  it("does not move resource deposits", () => {
    const state = createInitialState();
    expect(planFactoryAutoLayout(state, "home").some((move) => move.id === "vein_iron")).toBe(false);
  });
});
