import { describe, expect, it } from "vitest";
import { ITEMS, RECIPES } from "./content";
import { createInitialState } from "./engine";
import { getInfiniteResearchCostBigInt } from "./infiniteResearch";
import { RESOURCE_SOURCES } from "./recipeGraph";
import type { ItemId, RecipeDefinition } from "./types";

function mergeAmounts(target: Partial<Record<ItemId, number>>, source: Partial<Record<ItemId, number>>): void {
  for (const [itemId, amount] of Object.entries(source) as Array<[ItemId, number]>) {
    target[itemId] = (target[itemId] ?? 0) + amount;
  }
}

function baseRecipeFor(itemId: ItemId): RecipeDefinition | undefined {
  return Object.values(RECIPES)
    .filter((recipe) => (recipe.recursivePriority ?? 0) === 0 &&
      recipe.outputs.some((output) => output.itemId === itemId && output.amount > 0))
    .sort((left, right) => left.id.localeCompare(right.id))[0];
}

function expandToRawResources(itemId: ItemId, amount: number, resolving = new Set<ItemId>()): Partial<Record<ItemId, number>> {
  if ((RESOURCE_SOURCES[itemId]?.length ?? 0) > 0) return { [itemId]: amount };
  if (resolving.has(itemId)) throw new Error(`Recipe cycle while auditing ${itemId}`);
  const recipe = baseRecipeFor(itemId);
  if (!recipe) return {};
  const output = recipe.outputs.find((candidate) => candidate.itemId === itemId)!;
  const batches = Math.ceil(amount / output.amount);
  const nextResolving = new Set(resolving).add(itemId);
  const result: Partial<Record<ItemId, number>> = {};
  for (const input of recipe.inputs) {
    mergeAmounts(result, expandToRawResources(input.itemId, input.amount * batches, nextResolving));
  }
  return result;
}

describe("vein utilization finite-resource budget", () => {
  it("can reach level ten from finite reserves with at least 300% of every consumed reserve left over", () => {
    const state = createInitialState();
    const available = state.entities.reduce<Partial<Record<ItemId, number>>>((total, entity) => {
      if (entity.kind === "vein" && entity.resourceId && entity.resourceRemaining !== undefined) {
        total[entity.resourceId] = (total[entity.resourceId] ?? 0) + entity.resourceRemaining;
      }
      return total;
    }, {});
    const consumed: Partial<Record<ItemId, number>> = {};
    const depletionRemainders: Partial<Record<ItemId, number>> = {};
    let totalMatrices = 0;

    for (let currentLevel = 0; currentLevel < 10; currentLevel += 1) {
      const matrices = Number(getInfiniteResearchCostBigInt("vein_utilization", currentLevel));
      totalMatrices += matrices;
      const rawDemand = expandToRawResources("universe_matrix", matrices);
      for (const [itemId, amount] of Object.entries(rawDemand) as Array<[ItemId, number]>) {
        if (available[itemId] === undefined) continue;
        const consumptionTenths = ITEMS[itemId].kind === "solid" ? 10 - currentLevel : 10;
        const accruedTenths = (depletionRemainders[itemId] ?? 0) + amount * consumptionTenths;
        consumed[itemId] = (consumed[itemId] ?? 0) + Math.floor(accruedTenths / 10);
        depletionRemainders[itemId] = accruedTenths % 10;
      }
    }

    expect(totalMatrices).toBe(49_620);
    expect(consumed.coal).toBe(428_868);
    expect(available.coal).toBe(2_611_769);
    for (const [itemId, amount] of Object.entries(consumed) as Array<[ItemId, number]>) {
      expect(available[itemId], `${ITEMS[itemId].name} should retain at least 300% surplus`).toBeGreaterThanOrEqual(amount * 4);
    }
  });
});
