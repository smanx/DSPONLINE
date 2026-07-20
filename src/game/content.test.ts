import { describe, expect, it } from "vitest";
import { RECIPES, getBuilding, validateContentCatalog } from "./content";
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
});
