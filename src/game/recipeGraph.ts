import { RECIPES, TECHNOLOGY_LIST, getBuilding } from "./content";
import type { BuildingId, ItemId, PlanetId, RecipeDefinition, TechnologyDefinition } from "./types";

export interface ResourceSourceDefinition {
  label: string;
  planetIds: PlanetId[];
  extractorBuildingId: BuildingId;
  manual: boolean;
}

export interface RecipeRateSummary {
  cyclesPerMinute: number;
  inputPerMinute: Partial<Record<ItemId, number>>;
  outputPerMinute: Partial<Record<ItemId, number>>;
}

export function getRecipeRates(recipe: RecipeDefinition, speed = getBuilding(recipe.buildingId).speed): RecipeRateSummary {
  const cyclesPerMinute = 60 * Math.max(0, speed) / Math.max(0.001, recipe.duration);
  const scale = (entries: RecipeDefinition["inputs"]) => Object.fromEntries(entries.map((entry) => [entry.itemId, Math.round(entry.amount * cyclesPerMinute * 100) / 100])) as Partial<Record<ItemId, number>>;
  return { cyclesPerMinute, inputPerMinute: scale(recipe.inputs), outputPerMinute: scale(recipe.outputs) };
}

const SOLID_VEIN_SOURCE = (planetIds: PlanetId[]): ResourceSourceDefinition => ({
  label: "矿脉开采",
  planetIds,
  extractorBuildingId: "mining_machine",
  manual: true,
});

export const RESOURCE_SOURCES: Partial<Record<ItemId, ResourceSourceDefinition[]>> = {
  iron_ore: [SOLID_VEIN_SOURCE(["home", "ashen", "frost", "magnetar"])],
  copper_ore: [SOLID_VEIN_SOURCE(["home", "ashen", "frost", "magnetar"])],
  coal: [SOLID_VEIN_SOURCE(["home", "ashen"])],
  stone: [SOLID_VEIN_SOURCE(["home", "ashen"])],
  silicon_ore: [SOLID_VEIN_SOURCE(["ashen", "frost", "magnetar"])],
  titanium_ore: [SOLID_VEIN_SOURCE(["ashen", "frost", "magnetar"])],
  kimberlite_ore: [SOLID_VEIN_SOURCE(["ashen"])],
  fractal_silicon: [SOLID_VEIN_SOURCE(["ashen"])],
  optical_grating_crystal: [SOLID_VEIN_SOURCE(["frost"])],
  spiniform_stalagmite_crystal: [SOLID_VEIN_SOURCE(["frost"])],
  unipolar_magnet: [SOLID_VEIN_SOURCE(["magnetar"])],
  organic_crystal: [SOLID_VEIN_SOURCE(["ashen"])],
  crude_oil: [{
    label: "原油涌泉萃取",
    planetIds: ["home"],
    extractorBuildingId: "oil_extractor",
    manual: false,
  }],
  water: [{
    label: "海洋抽取",
    planetIds: ["home"],
    extractorBuildingId: "water_pump",
    manual: false,
  }],
  sulfuric_acid: [{
    label: "硫酸海洋抽取",
    planetIds: ["ashen"],
    extractorBuildingId: "water_pump",
    manual: false,
  }],
  hydrogen: [{
    label: "气态巨星轨道采集",
    planetIds: ["giant", "boreal_giant"],
    extractorBuildingId: "orbital_collector",
    manual: false,
  }],
  deuterium: [{
    label: "气态巨星轨道采集",
    planetIds: ["giant", "boreal_giant"],
    extractorBuildingId: "orbital_collector",
    manual: false,
  }],
  fire_ice: [
    {
      label: "气态巨星轨道采集",
      planetIds: ["giant", "boreal_giant"],
      extractorBuildingId: "orbital_collector",
      manual: false,
    },
    SOLID_VEIN_SOURCE(["frost"]),
  ],
};

export function getProducingRecipes(itemId: ItemId): RecipeDefinition[] {
  return Object.values(RECIPES).filter((recipe) => recipe.outputs.some((output) => output.itemId === itemId));
}

export function getConsumingRecipes(itemId: ItemId): RecipeDefinition[] {
  return Object.values(RECIPES).filter((recipe) => recipe.inputs.some((input) => input.itemId === itemId));
}

export function getResearchUses(itemId: ItemId): TechnologyDefinition[] {
  return TECHNOLOGY_LIST.filter((technology) => technology.costs.some((cost) => cost.itemId === itemId));
}

export function getResourceSource(itemId: ItemId): ResourceSourceDefinition | undefined {
  return RESOURCE_SOURCES[itemId]?.[0];
}

export function getResourceSources(itemId: ItemId): ResourceSourceDefinition[] {
  return RESOURCE_SOURCES[itemId] ?? [];
}

export function getVirtualRecipeResult(recipe: RecipeDefinition): string | null {
  if (recipe.id === "solar_sail_launch") return "戴森云轨道太阳帆";
  if (recipe.id === "carrier_rocket_launch") return "戴森球永久结构点";
  if (recipe.id === "ray_power") return "行星电网电力";
  if (recipe.id === "matrix_research") return "科技研究进度";
  return null;
}
