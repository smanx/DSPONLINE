import { afterEach, describe, expect, it } from "vitest";
import { CONSTRUCTION, ITEMS, getRecipe, getRecipesForBuilding } from "./content";
import {
  applyContentPackRegistry,
  createContentPackRegistry,
  getContentPackValidationContext,
  registerContentPack,
  setContentPackEnabled,
} from "./contentPacks";
import { satisfiesContentPackVersion, validateContentPack } from "./mods";

afterEach(() => {
  applyContentPackRegistry(createContentPackRegistry());
});

describe("content pack runtime registry", () => {
  it("registers an enabled pack into the live item, recipe, building, and technology catalogs", () => {
    const validation = validateContentPack({
      formatVersion: 1,
      id: "qa_factory_pack",
      name: "QA 工厂扩展",
      version: "1.2.0",
      items: [{ id: "qa_alloy", name: "QA 合金", symbol: "QA", kind: "solid" }],
      buildings: [{ id: "qa_fabricator", name: "QA 制造机", costs: [{ itemId: "iron_ingot", amount: 2 }] }],
      recipes: [{ id: "qa_alloy_recipe", name: "QA 合金制造", buildingId: "qa_fabricator", duration: 2, inputs: [{ itemId: "iron_ingot", amount: 1 }], outputs: [{ itemId: "qa_alloy", amount: 1 }] }],
      technologies: [{ id: "qa_factory_theory", name: "QA 工厂理论", tier: 1, costs: [{ itemId: "electromagnetic_matrix", amount: 1 }] }],
    });
    expect(validation.valid).toBe(true);

    const registered = registerContentPack(createContentPackRegistry(), validation);
    expect(registered.enabled).toBe(true);
    const report = applyContentPackRegistry(registered.registry);

    expect(report.catalogValid).toBe(true);
    expect((ITEMS as Record<string, { name: string }>).qa_alloy?.name).toBe("QA 合金");
    expect(getRecipe("qa_alloy_recipe" as never)?.outputs[0].itemId).toBe("qa_alloy");
    expect(getRecipesForBuilding("qa_fabricator" as never).map((recipe) => recipe.id)).toContain("qa_alloy_recipe");
    expect((CONSTRUCTION as Array<{ buildingId: string }>).some((definition) => definition.buildingId === "qa_fabricator")).toBe(true);
  });

  it("requires installed and enabled version-compatible dependencies before activation", () => {
    const base = validateContentPack({ formatVersion: 1, id: "qa_base", name: "QA 基础", version: "1.4.0" });
    let registry = registerContentPack(createContentPackRegistry(), base).registry;
    const consumer = validateContentPack({
      formatVersion: 1,
      id: "qa_consumer",
      name: "QA 消费端",
      version: "1.0.0",
      dependencies: ["qa_base@^1.2.0"],
    }, getContentPackValidationContext(registry));
    const registered = registerContentPack(registry, consumer);
    expect(registered.enabled).toBe(true);
    registry = registered.registry;

    const disabled = setContentPackEnabled(registry, "qa_base", false);
    expect(disabled.changed).toBe(false);
    expect(disabled.reason).toContain("qa_consumer");
    expect(satisfiesContentPackVersion("1.4.0", "^1.2.0")).toBe(true);
    expect(satisfiesContentPackVersion("2.0.0", "^1.2.0")).toBe(false);
  });
});
