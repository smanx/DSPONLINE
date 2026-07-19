import { RECIPES, TECHNOLOGY_LIST } from "./content";
import type { BuildingId, ItemId, PlanetId, RecipeDefinition, TechnologyDefinition } from "./types";

export interface ResourceSourceDefinition {
  label: string;
  planetIds: PlanetId[];
  extractorBuildingId: BuildingId;
  manual: boolean;
}

const SOLID_VEIN_SOURCE = (planetIds: PlanetId[]): ResourceSourceDefinition => ({
  label: "矿脉开采",
  planetIds,
  extractorBuildingId: "mining_machine",
  manual: true,
});

export const RESOURCE_SOURCES: Partial<Record<ItemId, ResourceSourceDefinition>> = {
  iron_ore: SOLID_VEIN_SOURCE(["home", "ashen"]),
  copper_ore: SOLID_VEIN_SOURCE(["home", "ashen"]),
  coal: SOLID_VEIN_SOURCE(["home", "ashen"]),
  stone: SOLID_VEIN_SOURCE(["home", "ashen"]),
  silicon_ore: SOLID_VEIN_SOURCE(["ashen"]),
  titanium_ore: SOLID_VEIN_SOURCE(["ashen"]),
  crude_oil: {
    label: "原油涌泉萃取",
    planetIds: ["home"],
    extractorBuildingId: "oil_extractor",
    manual: false,
  },
  water: {
    label: "海洋抽取",
    planetIds: ["home"],
    extractorBuildingId: "water_pump",
    manual: false,
  },
  sulfuric_acid: {
    label: "硫酸海洋抽取",
    planetIds: ["ashen"],
    extractorBuildingId: "water_pump",
    manual: false,
  },
};

const RECIPE_LIST = Object.values(RECIPES);

export function getProducingRecipes(itemId: ItemId): RecipeDefinition[] {
  return RECIPE_LIST.filter((recipe) => recipe.outputs.some((output) => output.itemId === itemId));
}

export function getConsumingRecipes(itemId: ItemId): RecipeDefinition[] {
  return RECIPE_LIST.filter((recipe) => recipe.inputs.some((input) => input.itemId === itemId));
}

export function getResearchUses(itemId: ItemId): TechnologyDefinition[] {
  return TECHNOLOGY_LIST.filter((technology) => technology.costs.some((cost) => cost.itemId === itemId));
}

export function getResourceSource(itemId: ItemId): ResourceSourceDefinition | undefined {
  return RESOURCE_SOURCES[itemId];
}

export function getVirtualRecipeResult(recipe: RecipeDefinition): string | null {
  if (recipe.id === "solar_sail_launch") return "戴森云轨道太阳帆";
  if (recipe.id === "carrier_rocket_launch") return "戴森球永久结构点";
  if (recipe.id === "ray_power") return "行星电网电力";
  if (recipe.id === "matrix_research") return "科技研究进度";
  return null;
}
