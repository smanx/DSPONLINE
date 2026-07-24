import type { ActivityMaterialId, GalacticExportProjectId } from "./types";

export const ACTIVITY_MATERIAL_IDS = [
  "universe_matrix",
  "solar_sail",
  "small_carrier_rocket",
  "antimatter_fuel_rod",
] as const satisfies readonly ActivityMaterialId[];

export const ACTIVITY_PROJECT_BY_ITEM: Readonly<Record<ActivityMaterialId, GalacticExportProjectId>> = {
  universe_matrix: "universe_archive",
  solar_sail: "solar_sail_array",
  small_carrier_rocket: "carrier_rocket_fleet",
  antimatter_fuel_rod: "antimatter_exchange",
};

export function isActivityMaterialId(value: unknown): value is ActivityMaterialId {
  return typeof value === "string" && (ACTIVITY_MATERIAL_IDS as readonly string[]).includes(value);
}
