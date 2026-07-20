import { describe, expect, it } from "vitest";
import { createContentPackTemplate, parseContentPack, validateContentPack } from "./mods";

describe("content pack validation", () => {
  it("accepts a metadata-only pack and normalizes its arrays", () => {
    const result = validateContentPack(createContentPackTemplate());
    expect(result.valid).toBe(true);
    expect(result.manifest?.formatVersion).toBe(1);
    expect(result.counts).toEqual({ items: 0, buildings: 0, recipes: 0, technologies: 0 });
  });

  it("rejects core overrides and dangling recipe references", () => {
    const result = validateContentPack({
      formatVersion: 1,
      id: "bad_pack",
      name: "坏包",
      version: "1.0.0",
      items: [{ id: "new_item", name: "新物品" }],
      recipes: [{ id: "new_recipe", name: "新配方", buildingId: "unknown_machine", duration: 1, inputs: [{ itemId: "new_item", amount: 1 }], outputs: [{ itemId: "iron_ore", amount: 1 }] }],
      technologies: [],
      buildings: [{ id: "arc_smelter", name: "覆盖熔炉" }],
    });
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["override-building", "recipe-building"]));
  });

  it("reports malformed JSON without throwing", () => {
    const result = parseContentPack("{not json");
    expect(result.valid).toBe(false);
    expect(result.issues[0].code).toBe("json");
  });
});

