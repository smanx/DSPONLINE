import { ITEMS, getBuilding, getPlanet, getRecipe } from "./content";
import { getEntityOperatingStatus } from "./engine";
import type { EntityOperatingStatus, FactoryEntity, GameState, PlanetId } from "./types";

export type FactoryAlertSeverity = "critical" | "warning";

export interface FactoryAlert {
  id: string;
  severity: FactoryAlertSeverity;
  statusCode: EntityOperatingStatus["code"];
  entityId: string;
  planetId: PlanetId;
  title: string;
  reason: string;
  location: string;
}

const CRITICAL_CODES = new Set<EntityOperatingStatus["code"]>([
  "no-power",
  "missing-fuel",
  "no-fuel-selected",
  "missing-vessel",
  "missing-drone",
  "missing-warper",
  "missing-hub",
  "missing-route",
  "missing-research",
  "missing-recipe",
]);

function entityTitle(entity: FactoryEntity): string {
  if (entity.kind === "vein" && entity.resourceId) {
    const extractor = entity.extractorBuildingId ? getBuilding(entity.extractorBuildingId).shortName : "采矿点";
    return `${extractor} · ${ITEMS[entity.resourceId].name}`;
  }
  const building = entity.buildingId ? getBuilding(entity.buildingId).shortName : "未知设备";
  const recipe = getRecipe(entity.recipeId);
  return recipe ? `${building} · ${recipe.name}` : building;
}

export interface FactoryAlertOptions {
  /** Build titles and locations only while the alert list is visible. */
  details?: boolean;
}

export function getFactoryAlerts(state: GameState, options: FactoryAlertOptions = {}): FactoryAlert[] {
  if (state.paused) return [];
  const details = options.details !== false;
  return state.entities.flatMap((entity): FactoryAlert[] => {
    if (entity.kind === "vein" && entity.minerCount < 1) return [];
    const status = getEntityOperatingStatus(state, entity);
    if (status.tone !== "warning" && status.tone !== "blocked") return [];
    return [{
      id: `${entity.id}:${status.code}`,
      severity: CRITICAL_CODES.has(status.code) ? "critical" : "warning",
      statusCode: status.code,
      entityId: entity.id,
      planetId: entity.planetId,
      title: details ? entityTitle(entity) : "",
      reason: details ? status.label : "",
      location: details ? `${getPlanet(entity.planetId).name} · ${getPlanet(entity.planetId).code}` : "",
    }];
  }).sort((left, right) => {
    if (left.severity !== right.severity) return left.severity === "critical" ? -1 : 1;
    if (left.planetId !== right.planetId) return left.planetId.localeCompare(right.planetId);
    return left.title.localeCompare(right.title, "zh-CN");
  });
}
