import { PLANET_LIST, getRecipe } from "./content";
import type { FactoryEntity, GameState, ItemId, PlanetId } from "./types";

export interface ProductionLineLocation {
  planetId: PlanetId;
  producerEntityIds: string[];
  relatedEntityIds: string[];
  relatedBeltIds: string[];
}

function entityProducesItem(entity: FactoryEntity, itemId: ItemId): boolean {
  if (entity.kind === "vein") return entity.resourceId === itemId && entity.minerCount > 0;
  if (entity.buildingId === "orbital_collector") return entity.storedItemId === itemId;
  return getRecipe(entity.recipeId)?.outputs.some((output) => output.itemId === itemId && output.amount > 0) ?? false;
}

export function getProductionLineLocations(game: GameState, itemId: ItemId): ProductionLineLocation[] {
  return PLANET_LIST.flatMap((planet) => {
    const producers = game.entities
      .filter((entity) => entity.planetId === planet.id && entityProducesItem(entity, itemId))
      .sort((left, right) => left.id.localeCompare(right.id));
    if (producers.length === 0) return [];

    const relatedEntityIds = new Set(producers.map((entity) => entity.id));
    const relatedBeltIds = new Set<string>();
    const queue = producers.map((entity) => entity.id);
    for (let index = 0; index < queue.length; index += 1) {
      const targetId = queue[index];
      const inbound = game.belts
        .filter((belt) => belt.planetId === planet.id && belt.target === targetId)
        .sort((left, right) => left.id.localeCompare(right.id));
      for (const belt of inbound) {
        relatedBeltIds.add(belt.id);
        if (relatedEntityIds.has(belt.source)) continue;
        const source = game.entities.find((entity) => entity.id === belt.source && entity.planetId === planet.id);
        if (!source) continue;
        relatedEntityIds.add(source.id);
        queue.push(source.id);
      }
    }

    return [{
      planetId: planet.id,
      producerEntityIds: producers.map((entity) => entity.id),
      relatedEntityIds: [...relatedEntityIds],
      relatedBeltIds: [...relatedBeltIds],
    }];
  });
}
