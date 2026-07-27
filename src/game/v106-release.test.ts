import { describe, expect, it } from "vitest";
import { getRecipe } from "./content";
import {
  MAX_BELT_LANES,
  advanceSimulation,
  connectBelt,
  createBlueprint,
  createInitialState,
  getBeltCapacity,
  getBlueprintPlacementPreview,
  installMiner,
  placeBlueprint,
  placeBuilding,
  removeEntity,
  setConstructionAutomationTarget,
  setEntityRecipe,
  setLogisticsItem,
} from "./engine";
import { migrateGame } from "./storage";
import type { BeltConnection, FactoryEntity } from "./types";

describe("V1.06 shared recipe catalog", () => {
  it("produces one information matrix from exactly one particle broadband", () => {
    expect(getRecipe("information_matrix")?.inputs).toEqual([
      { itemId: "particle_broadband", amount: 1 },
      { itemId: "processor", amount: 2 },
    ]);
    let state = createInitialState(10_601);
    state.research.completedTechIds.push("information_matrix");
    state.construction.wind_turbine = 9;
    state = placeBuilding(state, "wind_turbine", { x: -200, y: 0 }, 9);
    state = placeBuilding(state, "matrix_lab", { x: 180, y: 0 });
    const lab = state.entities.find((entity) => entity.buildingId === "matrix_lab")!;
    state = setEntityRecipe(state, lab.id, "information_matrix");
    const configured = state.entities.find((entity) => entity.id === lab.id)!;
    configured.inputs.particle_broadband = 1;
    configured.inputs.processor = 2;

    state = advanceSimulation(state, 10.1);
    const completed = state.entities.find((entity) => entity.id === lab.id)!;
    expect(completed.inputs.particle_broadband).toBe(0);
    expect(completed.inputs.processor).toBe(0);
    expect(completed.outputs.information_matrix).toBe(1);
  });
});

describe("V1.06 construction-center byproducts", () => {
  it("keeps required graphene and destroys only optional hydrogen when the planet tray is full", () => {
    let state = createInitialState(10_602);
    state.research.completedTechIds.push("construction_automation", "super_magnetic_logistics", "rare_resource_utilization");
    state.construction.wind_turbine = 80;
    state.construction.construction_center = 1;
    state.construction.conveyor_belt_mk3 = 0;
    state = placeBuilding(state, "wind_turbine", { x: -300, y: -180 }, 80);
    state = placeBuilding(state, "construction_center", { x: 120, y: 0 });
    state.planetTrayItemLimits.home = 1_000;
    state.tray = { fire_ice: 2, electromagnetic_turbine: 2, super_magnetic_ring: 1, hydrogen: 1_000 };
    state.planetTrays.home = state.tray;
    state = setConstructionAutomationTarget(state, "conveyor_belt_mk3", 3);

    state = advanceSimulation(state, 8);
    expect(state.construction.conveyor_belt_mk3).toBe(3);
    expect(state.tray.hydrogen).toBe(1_000);
    expect(state.constructionAutomation.destroyedByproducts.hydrogen).toBe(1);
    expect(state.constructionAutomation.jobs).toEqual({});
    expect(state.tray.graphene ?? 0).toBe(0);

    const reloaded = migrateGame(JSON.parse(JSON.stringify(state)))!;
    expect(reloaded.constructionAutomation.destroyedByproducts.hydrogen).toBe(1);
    expect(reloaded.construction.conveyor_belt_mk3).toBe(3);
  });
});

describe("V1.06 high-capacity belt bundles", () => {
  it("supports the benchmarked 4096-lane ceiling with constant-size capacity math and save reload", () => {
    const state = createInitialState(10_603);
    const source = state.entities.find((entity) => entity.id === "vein_iron")!;
    const target = state.entities.find((entity) => entity.id === "vein_copper")!;
    const belt: BeltConnection = {
      id: "v106_bundle",
      planetId: "home",
      source: source.id,
      target: target.id,
      itemId: "iron_ore",
      lanes: MAX_BELT_LANES,
      tier: 3,
      sorterTier: 3,
      progress: 0.75,
      priority: 2,
      stackSize: 4,
      monitorEnabled: true,
      totalTransferred: 12_345,
      congestion: 0.4,
      lastFlow: 1_000,
      routeMode: "manual",
      routeOffsetY: 160,
    };
    state.belts.push(belt);
    expect(MAX_BELT_LANES).toBe(4_096);
    expect(getBeltCapacity(belt)).toBe(30 * 4 * 4_096);

    const reloaded = migrateGame(JSON.parse(JSON.stringify(state)))!;
    expect(reloaded.belts[0]).toMatchObject({ lanes: 4_096, progress: 0.75, totalTransferred: 12_345, routeOffsetY: 160 });
    expect(getBeltCapacity(reloaded.belts[0])).toBe(491_520);
  });
});

describe("V1.06 batch stack reduction", () => {
  it("reduces a large group to one in one command without touching buffers, progress or belts", () => {
    let state = createInitialState(10_604);
    state.research.completedTechIds.push("basic_logistics");
    state.construction.arc_smelter = 101;
    state.construction.conveyor_belt_mk1 = 1;
    state = placeBuilding(state, "arc_smelter", { x: 220, y: 0 }, 101);
    const smelter = state.entities.find((entity) => entity.buildingId === "arc_smelter")!;
    state = connectBelt(state, "vein_iron", smelter.id, "iron_ore");
    const configured = state.entities.find((entity) => entity.id === smelter.id)!;
    configured.inputs.iron_ore = 2_500;
    configured.outputs.iron_ingot = 1_200;
    configured.progress = 0.625;
    state.belts[0].progress = 0.8;

    state = removeEntity(state, smelter.id, 100);
    expect(state.entities.find((entity) => entity.id === smelter.id)).toMatchObject({
      machineCount: 1,
      inputs: { iron_ore: 2_500 },
      outputs: { iron_ingot: 1_200 },
      progress: 0.625,
    });
    expect(state.belts[0].progress).toBe(0.8);
    expect(state.construction.arc_smelter).toBe(100);
  });

  it("keeps idle and executing logistics vehicles conserved when a stacked tower becomes over capacity", () => {
    let state = createInitialState(10_612);
    state.construction.interstellar_logistics_station = 3;
    state = placeBuilding(state, "interstellar_logistics_station", { x: 220, y: 0 }, 3);
    const station = state.entities.find((entity) => entity.buildingId === "interstellar_logistics_station")!;
    station.stationDrones = 120;
    station.stationVessels = 24;
    station.stationWarpers = 90;
    station.stationRoutes = [{ id: "active_route", slotIndex: 0, peerId: "remote_station", itemId: "processor", scope: "remote", cargo: 800, vehicleCount: 4, progress: 0.4, duration: 30, requiresWarp: true, vehicleStationId: station.id }];

    state = removeEntity(state, station.id, 2);
    expect(state.entities.find((entity) => entity.id === station.id)).toMatchObject({
      machineCount: 1,
      stationDrones: 120,
      stationVessels: 24,
      stationWarpers: 90,
      stationRoutes: [expect.objectContaining({ id: "active_route", cargo: 800, vehicleCount: 4, progress: 0.4 })],
    });
    expect(state.construction.interstellar_logistics_station).toBe(2);
  });
});

describe("V1.06 mining blueprint resource anchors", () => {
  it("maps onto an existing compatible vein, preserves its reserve and never duplicates the vein or installed target", () => {
    let state = createInitialState(10_605);
    state.research.completedTechIds.push("basic_logistics");
    state.construction.mining_machine = 10;
    state.construction.storage_mk1 = 3;
    state.construction.conveyor_belt_mk1 = 10;
    const sourceVein = state.entities.find((entity) => entity.id === "vein_iron")!;
    state = installMiner(state, sourceVein.id, 3);
    state = placeBuilding(state, "storage_mk1", { x: sourceVein.position.x + 280, y: sourceVein.position.y });
    const sourceStorage = state.entities.find((entity) => entity.buildingId === "storage_mk1")!;
    state = setLogisticsItem(state, sourceStorage.id, "iron_ore");
    state = connectBelt(state, sourceVein.id, sourceStorage.id, "iron_ore");
    state = createBlueprint(state, [sourceVein.id, sourceStorage.id], "铁矿采集布局");
    const blueprint = state.blueprints[0];
    expect(blueprint.resourceAnchors).toEqual([expect.objectContaining({ resourceId: "iron_ore", minerCount: 3 })]);
    expect(blueprint.entities).toEqual([expect.objectContaining({ buildingId: "storage_mk1" })]);

    const destination = {
      ...sourceVein,
      id: "vein_iron_copy_target",
      position: { x: 1_600, y: 900 },
      minerCount: 0,
      extractorBuildingId: undefined,
      inputs: {},
      outputs: { iron_ore: 27 },
      resourceCapacity: 8_000,
      resourceRemaining: 6_543,
      progress: 0.25,
    } satisfies FactoryEntity;
    state.entities.push(destination);
    const anchor = blueprint.resourceAnchors![0];
    const pastePosition = { x: destination.position.x - anchor.offset.x, y: destination.position.y - anchor.offset.y };
    const beforeVeinCount = state.entities.filter((entity) => entity.kind === "vein").length;
    const preview = getBlueprintPlacementPreview(state, blueprint.id, pastePosition);
    expect(preview).toMatchObject({ matchedResourceAnchors: 1, skippedResourceAnchors: [], extractorInstallCount: 3, canPlace: true });

    const placed = placeBlueprint(state, blueprint.id, pastePosition);
    const placedVein = placed.entities.find((entity) => entity.id === destination.id)!;
    expect(placed.entities.filter((entity) => entity.kind === "vein")).toHaveLength(beforeVeinCount);
    expect(placedVein).toMatchObject({ minerCount: 3, resourceCapacity: 8_000, resourceRemaining: 6_543, outputs: { iron_ore: 27 }, progress: 0.25 });
    expect(placed.belts.some((belt) => belt.source === destination.id)).toBe(true);

    const repeated = placeBlueprint(placed, blueprint.id, pastePosition);
    expect(repeated.entities.find((entity) => entity.id === destination.id)?.minerCount).toBe(3);
    expect(repeated.entities.filter((entity) => entity.kind === "vein")).toHaveLength(beforeVeinCount);
    expect(repeated.entities.find((entity) => entity.id === destination.id)?.resourceRemaining).toBe(6_543);
  });

  it("skips an anchor when no nearby compatible vein exists without creating resources", () => {
    let state = createInitialState(10_606);
    state.construction.mining_machine = 5;
    const sourceVein = state.entities.find((entity) => entity.id === "vein_iron")!;
    state = installMiner(state, sourceVein.id, 2);
    state = createBlueprint(state, [sourceVein.id], "仅采矿锚点");
    const blueprint = state.blueprints[0];
    const beforeVeins = state.entities.filter((entity) => entity.kind === "vein").map((entity) => entity.id);
    const position = { x: 80_000, y: 80_000 };
    const preview = getBlueprintPlacementPreview(state, blueprint.id, position);
    expect(preview).toMatchObject({ matchedResourceAnchors: 0, extractorInstallCount: 0, canPlace: false });
    expect(preview.skippedResourceAnchors).toEqual([expect.objectContaining({ resourceId: "iron_ore" })]);
    expect(placeBlueprint(state, blueprint.id, position)).toBe(state);
    expect(state.entities.filter((entity) => entity.kind === "vein").map((entity) => entity.id)).toEqual(beforeVeins);
  });
});
