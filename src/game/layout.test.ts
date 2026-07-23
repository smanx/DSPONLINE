import { describe, expect, it } from "vitest";
import { connectBelt, createInitialState, placeBuilding, setEntityRecipe } from "./engine";
import { getFactoryLayoutCollisionBounds, planFactoryAutoLayout } from "./layout";

function overlaps(left: ReturnType<typeof getFactoryLayoutCollisionBounds>, right: ReturnType<typeof getFactoryLayoutCollisionBounds>): boolean {
  return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
}

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

  it("treats every fixed resource node as a deterministic collision obstacle", () => {
    let state = createInitialState();
    state = placeBuilding(state, "arc_smelter", { x: -470, y: -250 });
    const smelter = state.entities.find((entity) => entity.buildingId === "arc_smelter")!;
    const vein = state.entities.find((entity) => entity.id === "vein_iron")!;
    const first = planFactoryAutoLayout(state, "home");
    const second = planFactoryAutoLayout(state, "home");
    expect(second).toEqual(first);
    const move = first.find((candidate) => candidate.id === smelter.id)!;
    expect(overlaps(getFactoryLayoutCollisionBounds(smelter, move.position), getFactoryLayoutCollisionBounds(vein))).toBe(false);
  });

  it("keeps selection layouts clear of fixed resources and unselected equipment", () => {
    let state = createInitialState();
    state = { ...state, construction: { ...state.construction, storage_mk1: 1 } };
    state = placeBuilding(state, "arc_smelter", { x: -470, y: -250 });
    state = placeBuilding(state, "storage_mk1", { x: -470, y: -10 });
    const smelter = state.entities.find((entity) => entity.buildingId === "arc_smelter")!;
    const storage = state.entities.find((entity) => entity.buildingId === "storage_mk1")!;
    const move = planFactoryAutoLayout(state, "home", [smelter.id])[0];
    expect(move.id).toBe(smelter.id);
    expect(overlaps(getFactoryLayoutCollisionBounds(smelter, move.position), getFactoryLayoutCollisionBounds(storage))).toBe(false);
    for (const fixed of state.entities.filter((entity) => entity.planetId === "home" && entity.kind === "vein")) {
      expect(overlaps(getFactoryLayoutCollisionBounds(smelter, move.position), getFactoryLayoutCollisionBounds(fixed))).toBe(false);
    }
  });
});
