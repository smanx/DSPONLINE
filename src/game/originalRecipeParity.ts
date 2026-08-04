import { RECIPES } from "./content";
import type { RecipeId } from "./types";

export type OriginalRecipeParityStatus = "implemented" | "adapted" | "not-applicable" | "missing";

export interface OriginalRecipeParityEntry {
  routeId: string;
  label: string;
  status: OriginalRecipeParityStatus;
  recipeId?: RecipeId;
  note?: string;
}

// Fixed against the non-Dark-Fog component catalog recorded in the 2026-08-04
// feedback handoff. Keeping this list explicit makes a new core recipe require
// an intentional parity decision instead of silently changing the audit.
export const IMPLEMENTED_ORIGINAL_RECIPE_IDS = [
  "iron_ingot",
  "copper_ingot",
  "magnet",
  "stone_brick",
  "glass",
  "steel",
  "energetic_graphite",
  "gear",
  "magnetic_coil",
  "circuit_board",
  "prism",
  "plasma_exciter",
  "plasma_refining",
  "xray_cracking",
  "reforming_refine",
  "high_purity_silicon",
  "silicon_ore_from_stone",
  "titanium_ingot",
  "sulfuric_acid",
  "titanium_alloy",
  "microcrystalline_component",
  "processor",
  "logistics_drone",
  "logistics_vessel",
  "space_warper",
  "space_warper_from_gravity_matrix",
  "accumulator",
  "hydrogen_fuel_rod",
  "deuterium_fractionation",
  "graphene",
  "graphene_from_fire_ice",
  "carbon_nanotube",
  "carbon_nanotube_from_spiniform",
  "proliferator_mk1",
  "proliferator_mk2",
  "proliferator_mk3",
  "crystal_silicon",
  "crystal_silicon_from_fractal",
  "particle_broadband",
  "electric_motor",
  "electromagnetic_turbine",
  "super_magnetic_ring",
  "particle_container",
  "particle_container_from_unipolar",
  "deuterium",
  "deuteron_fuel_rod",
  "titanium_glass",
  "casimir_crystal",
  "casimir_crystal_advanced",
  "plane_filter",
  "quantum_chip",
  "strange_matter",
  "graviton_lens",
  "photon_combiner",
  "photon_combiner_from_grating",
  "solar_sail",
  "antimatter",
  "annihilation_constraint_sphere",
  "antimatter_fuel_rod",
  "frame_material",
  "dyson_sphere_component",
  "small_carrier_rocket",
  "diamond",
  "diamond_from_kimberlite",
  "plastic",
  "organic_crystal",
  "titanium_crystal",
  "electromagnetic_matrix",
  "energy_matrix",
  "structure_matrix",
  "information_matrix",
  "gravity_matrix",
  "universe_matrix",
] as const satisfies readonly RecipeId[];

const PROJECT_FLOW_RECIPE_IDS = new Set<RecipeId>([
  "accumulator_charge",
  "accumulator_discharge",
  "solar_sail_launch",
  "ray_power",
  "critical_photon",
  "carrier_rocket_launch",
  "matrix_research",
]);

export const ORIGINAL_NON_DARK_FOG_RECIPE_PARITY: readonly OriginalRecipeParityEntry[] = [
  ...IMPLEMENTED_ORIGINAL_RECIPE_IDS.map((recipeId) => ({
    routeId: recipeId,
    label: RECIPES[recipeId].name,
    status: "implemented" as const,
    recipeId,
  })),
  { routeId: "critical_photon_graviton_lens", label: "引力透镜强化临界光子", status: "missing", note: "需要射线接收站透镜输入与强化模式的独立设计" },
  { routeId: "organic_crystal_raw", label: "有机晶体（原始）", status: "not-applicable", note: "当前内容不包含木材和植物燃料采集链" },
  { routeId: "thruster", label: "推进器", status: "missing", note: "需与物流运输机制造链成套迁移" },
  { routeId: "reinforced_thruster", label: "加力推进器", status: "missing", note: "需与物流运输船制造链成套迁移" },
  { routeId: "logistics_distributor", label: "配送运输机", status: "adapted", note: "当前由物资配送枢纽抽象替代" },
  { routeId: "foundation", label: "地基", status: "not-applicable", note: "无限二维画布没有地形改造和沙土机制" },
];

export interface OriginalRecipeParityAudit {
  valid: boolean;
  entries: readonly OriginalRecipeParityEntry[];
  issues: string[];
  counts: Record<OriginalRecipeParityStatus, number>;
}

export function auditOriginalNonDarkFogRecipeParity(): OriginalRecipeParityAudit {
  const issues: string[] = [];
  const routeIds = new Set<string>();
  for (const entry of ORIGINAL_NON_DARK_FOG_RECIPE_PARITY) {
    if (routeIds.has(entry.routeId)) issues.push(`原版配方审计重复登记：${entry.routeId}`);
    routeIds.add(entry.routeId);
    if (entry.status === "implemented" && (!entry.recipeId || !RECIPES[entry.recipeId])) {
      issues.push(`已实现配方缺少目录定义：${entry.routeId}`);
    }
  }
  if (ORIGINAL_NON_DARK_FOG_RECIPE_PARITY.length !== 79) {
    issues.push(`原版非黑雾配方基线应为 79 条，实际 ${ORIGINAL_NON_DARK_FOG_RECIPE_PARITY.length} 条`);
  }
  const registered = new Set<RecipeId>(IMPLEMENTED_ORIGINAL_RECIPE_IDS);
  for (const recipeId of Object.keys(RECIPES) as RecipeId[]) {
    if (!registered.has(recipeId) && !PROJECT_FLOW_RECIPE_IDS.has(recipeId)) {
      issues.push(`核心配方尚未登记原版兼容状态：${recipeId}`);
    }
  }
  const counts = { implemented: 0, adapted: 0, "not-applicable": 0, missing: 0 } satisfies Record<OriginalRecipeParityStatus, number>;
  for (const entry of ORIGINAL_NON_DARK_FOG_RECIPE_PARITY) counts[entry.status] += 1;
  return { valid: issues.length === 0, entries: ORIGINAL_NON_DARK_FOG_RECIPE_PARITY, issues, counts };
}
