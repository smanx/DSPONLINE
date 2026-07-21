import { describe, expect, it } from "vitest";
import { createBlueprint, createInitialState, placeBuilding } from "./engine";
import { importBlueprintExchange, parseBlueprintExchange, serializeBlueprintExchange } from "./blueprintExchange";

describe("blueprint exchange", () => {
  it("round-trips a valid blueprint and assigns a safe local id on import", () => {
    let state = createInitialState();
    state = placeBuilding(state, "arc_smelter", { x: 120, y: 80 });
    const smelter = state.entities.find((entity) => entity.buildingId === "arc_smelter")!;
    state = createBlueprint(state, [smelter.id], "交换测试");
    const original = state.blueprints[0];

    const result = parseBlueprintExchange(serializeBlueprintExchange(original));
    expect(result.valid).toBe(true);
    const imported = importBlueprintExchange(state, result.blueprint!);
    expect(imported.blueprints).toHaveLength(2);
    expect(imported.blueprints[1]).toMatchObject({ name: "交换测试 2", entities: [{ buildingId: "arc_smelter" }] });
    expect(imported.blueprints[1].id).not.toBe(original.id);
  });

  it("rejects exchange files that reference content missing from the active catalog", () => {
    const result = parseBlueprintExchange(JSON.stringify({
      type: "dsp-idle-blueprint",
      formatVersion: 1,
      blueprint: {
        name: "损坏蓝图",
        entities: [{ key: "node_1", buildingId: "missing_machine", offset: { x: 0, y: 0 }, machineCount: 1 }],
        belts: [],
      },
    }));
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toContain("设备");
  });
});
