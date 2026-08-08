import { describe, expect, it } from "vitest";
import {
  MAX_BUILDING_STACK_COUNT,
  batchIncreaseSelection,
  canEntityAcceptBeltItem,
  createInitialState,
  setConstructionAutomationTargetsForBuildings,
} from "./engine";
import type { FactoryEntity, GameState } from "./types";

function entity(id: string, buildingId: FactoryEntity["buildingId"], machineCount = 1): FactoryEntity {
  return {
    id,
    kind: "machine",
    planetId: "home",
    position: { x: 0, y: 0 },
    interactionLocked: false,
    buildingId,
    machineCount,
    minerCount: 0,
    inputs: {},
    outputs: {},
    progress: 0,
    routingCursor: 0,
    utilization: 0,
    productionRate: 0,
  };
}

function baseSelectionState(): GameState {
  const state = createInitialState(27_001);
  state.entities.push(entity("e1", "arc_smelter", 1), entity("e2", "arc_smelter", 2));
  state.belts.push({
    id: "b1",
    planetId: "home",
    source: "e1",
    target: "e2",
    itemId: "iron_ingot",
    lanes: 2,
    tier: 1,
    sorterTier: 1,
    progress: 0,
    priority: 1,
    lastFlow: 0,
  });
  state.construction.arc_smelter = 4;
  state.construction.conveyor_belt_mk1 = 2;
  return state;
}

describe("P2 batch selection operations", () => {
  it("increases mixed buildings and belts atomically and consumes construction", () => {
    const state = baseSelectionState();
    const result = batchIncreaseSelection(state, ["e1", "e2"], ["b1"], 2);

    expect(result.ok).toBe(true);
    expect(result.changedBuildingCount).toBe(2);
    expect(result.changedBeltCount).toBe(1);
    expect(result.state.entities.find((candidate) => candidate.id === "e1")?.machineCount).toBe(3);
    expect(result.state.entities.find((candidate) => candidate.id === "e2")?.machineCount).toBe(4);
    expect(result.state.belts[0].lanes).toBe(4);
    expect(result.state.construction.arc_smelter).toBe(0);
    expect(result.state.construction.conveyor_belt_mk1).toBe(0);
  });

  it("keeps the complete selection unchanged when material is insufficient", () => {
    const state = baseSelectionState();
    state.construction.arc_smelter = 0;
    const result = batchIncreaseSelection(state, ["e1", "e2"], ["b1"], 2);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("missing-construction");
    expect(result.state).toBe(state);
    expect(state.entities.find((candidate) => candidate.id === "e1")?.machineCount).toBe(1);
    expect(state.belts[0].lanes).toBe(2);
  });

  it("does not add to a building or belt at the hard limit", () => {
    const state = baseSelectionState();
    state.entities.find((candidate) => candidate.id === "e1")!.machineCount = MAX_BUILDING_STACK_COUNT;
    state.belts[0].lanes = 4096;
    const result = batchIncreaseSelection(state, ["e1"], ["b1"], 1);

    expect(result.ok).toBe(true);
    expect(result.changedBuildingCount).toBe(0);
    expect(result.changedBeltCount).toBe(0);
    expect(result.buildingAtLimitCount).toBe(1);
    expect(result.beltAtLimitCount).toBe(1);
    expect(result.state).toBe(state);
  });

  it("skips unique megastructures in mixed batch previews and commits without charging them", () => {
    const state = baseSelectionState();
    state.entities.push(
      entity("warp", "time_warp_device", 1),
      entity("black-hole", "micro_black_hole_connector", 1),
    );
    state.construction.time_warp_device = 100;
    state.construction.micro_black_hole_connector = 100;
    const beforeWarpInventory = state.construction.time_warp_device;
    const beforeBlackHoleInventory = state.construction.micro_black_hole_connector;

    const result = batchIncreaseSelection(state, ["e1", "warp", "black-hole"], ["b1"], 1);

    expect(result).toMatchObject({
      ok: true,
      changedBuildingCount: 1,
      changedBeltCount: 1,
      uniqueBuildingSkippedCount: 2,
    });
    expect(result.requiredConstruction).not.toHaveProperty("time_warp_device");
    expect(result.requiredConstruction).not.toHaveProperty("micro_black_hole_connector");
    expect(result.state.entities.find((candidate) => candidate.id === "warp")?.machineCount).toBe(1);
    expect(result.state.entities.find((candidate) => candidate.id === "black-hole")?.machineCount).toBe(1);
    expect(result.state.construction.time_warp_device).toBe(beforeWarpInventory);
    expect(result.state.construction.micro_black_hole_connector).toBe(beforeBlackHoleInventory);
  });

  it("uses the established universal-port rules for connection-card candidates", () => {
    const state = createInitialState(27_003);
    const hub = entity("hub", "material_delivery_hub");
    hub.kind = "storage";
    hub.deliverySlots = [
      { itemId: null, mode: "auto" },
      { itemId: "copper_ingot", mode: "manual" },
      { itemId: null, mode: "disabled" },
    ];
    const blackHole = entity("black-hole", "micro_black_hole_connector");

    expect(canEntityAcceptBeltItem(state, hub, "iron_ingot")).toBe(true);
    expect(canEntityAcceptBeltItem(state, hub, "copper_ingot")).toBe(true);
    hub.deliverySlots[0] = { itemId: null, mode: "disabled" };
    expect(canEntityAcceptBeltItem(state, hub, "iron_ingot")).toBe(false);
    expect(canEntityAcceptBeltItem(state, blackHole, "universe_matrix")).toBe(true);
  });

  it("sets one target for all unlocked buildings without cancelling jobs", () => {
    const state = createInitialState(27_002);
    state.research.completedTechIds.push("construction_capacity_2");
    state.constructionAutomation.jobs.center_1 = {
      constructionId: "arc_smelter",
      steps: [],
      stepIndex: 0,
      elapsedSeconds: 0,
      inventory: {},
    };
    const result = setConstructionAutomationTargetsForBuildings(state, 100_000_000);

    expect(result.ok).toBe(true);
    expect(result.affectedCount).toBeGreaterThan(0);
    expect(result.state.constructionAutomation.targetStock.arc_smelter).toBe(100_000_000);
    expect(result.state.constructionAutomation.jobs.center_1).toBeDefined();
  });
});
