import { describe, expect, it } from "vitest";
import { advanceSimulation, createInitialState, placeBuilding } from "./engine";
import {
  calculateProductionPlan,
  createProductionPlan,
  removeProductionPlan,
  setProductionPlanRecipe,
  updateProductionPlan,
} from "./planning";

describe("industrial production planning", () => {
  it("expands a matrix target into equipment, power, logistics and raw requirements", () => {
    let state = createInitialState();
    state.research.completedTechIds.push("electromagnetic_matrix", "electromagnetism");
    state = createProductionPlan(state, "electromagnetic_matrix", 60, "all");
    const result = calculateProductionPlan(state, state.productionPlans[0]);

    expect(result.requirements[0]).toMatchObject({ itemId: "electromagnetic_matrix", requiredPerMinute: 60, source: "recipe" });
    expect(result.requirements.map((requirement) => requirement.itemId)).toEqual(expect.arrayContaining([
      "magnetic_coil",
      "circuit_board",
      "iron_ore",
      "copper_ore",
    ]));
    expect(result.totalMachines).toBeGreaterThan(0);
    expect(result.totalPowerDemandKw).toBeGreaterThan(0);
    expect(result.totalLogisticsPerMinute).toBeGreaterThan(60);
  });

  it("switches an intermediate to an unlocked alternative recipe", () => {
    let state = createInitialState();
    state.research.completedTechIds.push("nanomaterials", "rare_resource_utilization");
    state = createProductionPlan(state, "graphene", 60);
    const planId = state.productionPlans[0].id;
    state = setProductionPlanRecipe(state, planId, "graphene", "graphene_from_fire_ice");
    const result = calculateProductionPlan(state, state.productionPlans[0]);

    expect(result.requirements.find((requirement) => requirement.itemId === "graphene")?.recipeId).toBe("graphene_from_fire_ice");
    expect(result.requirements.some((requirement) => requirement.itemId === "fire_ice")).toBe(true);
    expect(result.requirements.some((requirement) => requirement.itemId === "sulfuric_acid")).toBe(false);
  });

  it("persists edits and removes saved production targets", () => {
    let state = createInitialState();
    state = createProductionPlan(state, "iron_ingot", 30, "home");
    const planId = state.productionPlans[0].id;
    state = updateProductionPlan(state, planId, { name: "钢铁基线", targetPerMinute: 120 });
    expect(state.productionPlans[0]).toMatchObject({ name: "钢铁基线", targetPerMinute: 120, planetId: "home" });
    state = removeProductionPlan(state, planId);
    expect(state.productionPlans).toEqual([]);
  });

  it("records bounded ten-second production history samples", () => {
    let state = createInitialState();
    state.construction.wind_turbine = 2;
    state.construction.arc_smelter = 1;
    state = placeBuilding(state, "wind_turbine", { x: 0, y: -100 }, 2);
    state = placeBuilding(state, "arc_smelter", { x: 200, y: 0 });
    const smelter = state.entities.find((entity) => entity.buildingId === "arc_smelter")!;
    smelter.inputs.iron_ore = 30;
    state = advanceSimulation(state, 11);

    expect(state.productionHistory).toHaveLength(1);
    expect(state.productionHistory[0].productionPerMinute.iron_ingot).toBeGreaterThan(0);
    expect(state.historyRecordedAt).toBeGreaterThanOrEqual(10);
  });
});
