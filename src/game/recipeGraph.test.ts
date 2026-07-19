import { describe, expect, it } from "vitest";
import {
  getConsumingRecipes,
  getProducingRecipes,
  getResearchUses,
  getResourceSource,
  getVirtualRecipeResult,
} from "./recipeGraph";
import { getRecipe } from "./content";

describe("recipe graph", () => {
  it("finds natural sources and every direct consumer", () => {
    expect(getResourceSource("iron_ore")).toMatchObject({
      extractorBuildingId: "mining_machine",
      planetIds: ["home", "ashen"],
      manual: true,
    });
    expect(getConsumingRecipes("iron_ore").map((recipe) => recipe.id)).toEqual(
      expect.arrayContaining(["iron_ingot", "magnet"]),
    );
  });

  it("keeps synthetic and planetary sulfuric acid sources together", () => {
    expect(getResourceSource("sulfuric_acid")?.label).toBe("硫酸海洋抽取");
    expect(getProducingRecipes("sulfuric_acid").map((recipe) => recipe.id)).toEqual(["sulfuric_acid"]);
    expect(getConsumingRecipes("sulfuric_acid").map((recipe) => recipe.id)).toEqual(
      expect.arrayContaining(["titanium_alloy", "graphene"]),
    );
  });

  it("indexes by-products and matrix research uses", () => {
    expect(getProducingRecipes("hydrogen").map((recipe) => recipe.id)).toEqual(
      expect.arrayContaining(["plasma_refining", "xray_cracking", "antimatter"]),
    );
    expect(getResearchUses("universe_matrix").map((technology) => technology.id)).toEqual(
      expect.arrayContaining(["research_speed_3", "dyson_sphere_program", "dyson_shell"]),
    );
  });

  it("describes non-item launch results", () => {
    expect(getVirtualRecipeResult(getRecipe("solar_sail_launch")!)).toBe("戴森云轨道太阳帆");
    expect(getVirtualRecipeResult(getRecipe("carrier_rocket_launch")!)).toBe("戴森球永久结构点");
  });

  it("indexes rare veins, gas-giant fire ice and every alternative recipe", () => {
    expect(getResourceSource("fire_ice")).toMatchObject({
      extractorBuildingId: "orbital_collector",
      planetIds: ["giant"],
      manual: false,
    });
    expect(getResourceSource("organic_crystal")).toMatchObject({ planetIds: ["ashen"], manual: true });
    expect(getProducingRecipes("organic_crystal").map((recipe) => recipe.id)).toContain("organic_crystal");
    expect(getProducingRecipes("graphene").map((recipe) => recipe.id)).toEqual(expect.arrayContaining(["graphene", "graphene_from_fire_ice"]));
    expect(getProducingRecipes("diamond").map((recipe) => recipe.id)).toEqual(expect.arrayContaining(["diamond", "diamond_from_kimberlite"]));
    expect(getProducingRecipes("crystal_silicon").map((recipe) => recipe.id)).toContain("crystal_silicon_from_fractal");
    expect(getProducingRecipes("photon_combiner").map((recipe) => recipe.id)).toContain("photon_combiner_from_grating");
    expect(getProducingRecipes("casimir_crystal").map((recipe) => recipe.id)).toContain("casimir_crystal_advanced");
    expect(getProducingRecipes("carbon_nanotube").map((recipe) => recipe.id)).toContain("carbon_nanotube_from_spiniform");
    expect(getProducingRecipes("particle_container").map((recipe) => recipe.id)).toContain("particle_container_from_unipolar");
  });
});
