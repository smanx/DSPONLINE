import { describe, expect, it } from "vitest";
import { CONSTRUCTION, RECIPES, TECHNOLOGIES, getBuilding, validateContentCatalog } from "./content";
import { createInitialState } from "./engine";
import { getRecipeRates } from "./recipeGraph";

describe("content catalog", () => {
  it("keeps every non-black-fog content reference internally valid", () => {
    const audit = validateContentCatalog();
    expect(audit.valid).toBe(true);
    expect(audit.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("exposes normalized per-minute recipe demand and output rates", () => {
    const recipe = RECIPES.processor;
    const rates = getRecipeRates(recipe, getBuilding(recipe.buildingId).speed);
    expect(rates.cyclesPerMinute).toBe(15);
    expect(rates.inputPerMinute).toMatchObject({ circuit_board: 30, microcrystalline_component: 30 });
    expect(rates.outputPerMinute.processor).toBe(15);
  });

  it("starts with smelting and basic assembly unlocked without placeholder technologies", () => {
    expect("automatic_metallurgy" in TECHNOLOGIES).toBe(false);
    expect("basic_assembling" in TECHNOLOGIES).toBe(false);
    expect(CONSTRUCTION.find((entry) => entry.buildingId === "arc_smelter")?.requiredTechId).toBeUndefined();
    expect(CONSTRUCTION.find((entry) => entry.buildingId === "assembling_machine_mk1")?.requiredTechId).toBeUndefined();
    const state = createInitialState();
    expect(state.construction.arc_smelter).toBe(3);
    expect(state.construction.assembling_machine_mk1).toBe(3);
  });
});
