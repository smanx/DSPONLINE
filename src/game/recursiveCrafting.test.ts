import { describe, expect, it } from "vitest";
import { RECIPES } from "./content";
import { planRecursiveRequirements, planSelectedRecipe } from "./recursiveCrafting";
import type { TechId } from "./types";

const recipes = Object.values(RECIPES);

describe("recursive manufacturing planner", () => {
  it("plans iron ore through iron ingots into steel before consuming the target material", () => {
    const plan = planRecursiveRequirements({
      inventory: { iron_ore: 6 },
      requirements: [{ itemId: "steel", amount: 2 }],
      recipes,
      completedTechnologyIds: ["high_efficiency_plasma_control"],
    });

    expect(plan.possible).toBe(true);
    expect(plan.steps.map((step) => [step.recipeId, step.batches])).toEqual([
      ["iron_ingot", 6],
      ["steel", 2],
    ]);
    expect(plan.inventory.iron_ore).toBe(0);
    expect(plan.inventory.steel).toBe(0);
  });

  it("prefers unlocked fractal silicon and records the selected compact recipe", () => {
    const plan = planRecursiveRequirements({
      inventory: { fractal_silicon: 1, silicon_ore: 20 },
      requirements: [{ itemId: "crystal_silicon", amount: 2 }],
      recipes,
      completedTechnologyIds: ["nanomaterials", "rare_resource_utilization"],
    });

    expect(plan.possible).toBe(true);
    expect(plan.steps.at(-1)?.recipeId).toBe("crystal_silicon_from_fractal");
    expect(plan.decisions.at(-1)).toMatchObject({
      itemId: "crystal_silicon",
      recipeId: "crystal_silicon_from_fractal",
    });
  });

  it("prefers the green-matrix warper recipe and falls back to the lens recipe atomically", () => {
    const compact = planRecursiveRequirements({
      inventory: { gravity_matrix: 1, graviton_lens: 1 },
      requirements: [{ itemId: "space_warper", amount: 8 }],
      recipes,
      completedTechnologyIds: ["space_warp"],
    });
    expect(compact.possible).toBe(true);
    expect(compact.steps.at(-1)).toMatchObject({ recipeId: "space_warper_from_gravity_matrix", batches: 1, outputAmount: 8 });

    const fallback = planRecursiveRequirements({
      inventory: { graviton_lens: 1 },
      requirements: [{ itemId: "space_warper", amount: 1 }],
      recipes,
      completedTechnologyIds: ["space_warp"],
    });
    expect(fallback.possible).toBe(true);
    expect(fallback.steps.at(-1)?.recipeId).toBe("space_warper");
    expect(fallback.decisions.at(-1)?.fallbacks[0]).toMatchObject({ recipeId: "space_warper_from_gravity_matrix", reason: "technology" });
  });

  it.each([
    {
      name: "technology is locked",
      inventory: { fractal_silicon: 1, silicon_ore: 2 },
      completedTechnologyIds: ["nanomaterials", "high_strength_crystal"] as TechId[],
      expectedReason: "technology",
    },
    {
      name: "rare input is missing",
      inventory: { silicon_ore: 2 },
      completedTechnologyIds: ["nanomaterials", "rare_resource_utilization", "high_strength_crystal"] as TechId[],
      expectedReason: "materials",
    },
  ])("falls back to the base silicon route when $name", ({ inventory, completedTechnologyIds, expectedReason }) => {
    const plan = planRecursiveRequirements({
      inventory,
      requirements: [{ itemId: "crystal_silicon", amount: 1 }],
      recipes,
      completedTechnologyIds,
    });

    expect(plan.possible).toBe(true);
    expect(plan.steps.at(-1)?.recipeId).toBe("crystal_silicon");
    expect(plan.decisions.at(-1)?.fallbacks[0]).toMatchObject({
      recipeId: "crystal_silicon_from_fractal",
      reason: expectedReason,
    });
  });

  it("reports the deepest raw-resource shortage without mutating the supplied inventory", () => {
    const inventory = { iron_ore: 5 } as const;
    const plan = planRecursiveRequirements({
      inventory,
      requirements: [{ itemId: "steel", amount: 2 }],
      recipes,
      completedTechnologyIds: ["high_efficiency_plasma_control"],
    });

    expect(plan.possible).toBe(false);
    expect(plan.blocker).toMatchObject({ itemId: "iron_ore", current: 5, required: 6, reason: "raw-shortage" });
    expect(inventory.iron_ore).toBe(5);
  });

  it("backtracks atomically when several requirements compete for the same inventory", () => {
    const plan = planRecursiveRequirements({
      inventory: { fractal_silicon: 1, silicon_ore: 2 },
      requirements: [
        { itemId: "crystal_silicon", amount: 1 },
        { itemId: "high_purity_silicon", amount: 1 },
      ],
      recipes,
      completedTechnologyIds: ["nanomaterials", "rare_resource_utilization", "high_strength_crystal"],
    });

    expect(plan.possible).toBe(true);
    expect(plan.inventory.fractal_silicon).toBe(0);
    expect(plan.inventory.silicon_ore).toBe(0);
  });

  it("keeps an explicitly selected final recipe while recursively filling its inputs", () => {
    const plan = planSelectedRecipe({
      inventory: { iron_ore: 15, processor: 2, electromagnetic_turbine: 2 },
      recipe: RECIPES.logistics_drone,
      batches: 1,
      recipes,
      completedTechnologyIds: [
        "high_efficiency_plasma_control",
        "planetary_logistics",
      ],
    });

    expect(plan.possible).toBe(true);
    expect(plan.steps.at(-1)?.recipeId).toBe("logistics_drone");
    expect(plan.inventory.logistics_drone).toBe(1);
  });
});
