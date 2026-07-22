import { describe, expect, it } from "vitest";
import { createBlueprint, createInitialState, placeBuilding, setLogisticsItem, setStationHubConfiguration, setStationSlotRoutePolicy, setStationSlotWarperBudget, setStationWarperAutoRefill, setStationWarperTarget } from "./engine";
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

  it("preserves relay hub and per-slot routing configuration", () => {
    let state = createInitialState();
    state.research.completedTechIds.push("interstellar_logistics", "space_warp");
    state.construction.interstellar_logistics_station = 1;
    state = placeBuilding(state, "interstellar_logistics_station", { x: 120, y: 80 });
    const station = state.entities.find((entity) => entity.buildingId === "interstellar_logistics_station")!;
    state = setLogisticsItem(state, station.id, "processor");
    state = setStationHubConfiguration(state, station.id, true, 2);
    state = setStationSlotRoutePolicy(state, station.id, 0, "relay-required");
    state = setStationSlotWarperBudget(state, station.id, 0, 3);
    state = setStationWarperTarget(state, station.id, 35);
    state = setStationWarperAutoRefill(state, station.id, true);
    state = createBlueprint(state, [station.id], "中转枢纽");

    const parsed = parseBlueprintExchange(serializeBlueprintExchange(state.blueprints[0]));
    expect(parsed.valid).toBe(true);
    expect(parsed.blueprint?.entities[0]).toMatchObject({
      stationHubEnabled: true,
      stationHubPriority: 2,
      stationWarperAutoRefill: true,
      stationWarperTarget: 35,
      stationSlots: expect.arrayContaining([expect.objectContaining({ itemId: "processor", routePolicy: "relay-required", warperBudget: 3 })]),
    });
  });
});
