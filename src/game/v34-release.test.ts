import { describe, expect, it } from "vitest";
import { ACTIVITY_MATERIAL_IDS, ACTIVITY_PROJECT_BY_ITEM } from "./activity";
import {
  advanceSimulationBudget,
  connectBelt,
  createInitialState,
  getBeltConnectionCheck,
  getEffectiveSimulationMultiplier,
  getMaximumStableTimeWarpMultiplier,
  getStationFleetDiagnostic,
  getTimeWarpRequiredPowerKw,
  installMiner,
  placeBuilding,
  removeEntity,
  setBlackHolePaused,
  setGalacticMaterialExporterPaused,
  setStationSlotItem,
  setStationSlotMinimumLoad,
  setStationSlotMode,
  setTimeWarpEnabled,
  setTimeWarpRequestedMultiplier,
} from "./engine";
import { migrateGame } from "./storage";
import type { ActivityMaterialId, FactoryEntity, GameState, ItemId } from "./types";

function placeOne(state: GameState, buildingId: Parameters<typeof placeBuilding>[1], x: number): GameState {
  state.construction[buildingId] = Math.max(1, state.construction[buildingId] ?? 0);
  return placeBuilding(state, buildingId, { x, y: 0 });
}

function configureActivity(state: GameState, clockMs = 1_500, startsAtMs = 1_000, endsAtMs = 10_000): void {
  Object.assign(state.endgame.constructionActivity, {
    activityId: "v34-test-activity",
    participantId: "local-participant",
    configRevision: "test-revision",
    startsAtMs,
    endsAtMs,
    serverTimeAnchorMs: clockMs,
    activityClockMs: clockMs,
  });
  for (const itemId of ACTIVITY_MATERIAL_IDS) {
    state.endgame.constructionActivity.personalTargets[itemId] = 1_000_000;
    state.endgame.constructionActivity.globalTargets[itemId] = 1_000_000_000;
  }
}

function station(state: GameState, id: string): FactoryEntity {
  return state.entities.find((entity) => entity.id === id)!;
}

describe("v34 gameplay release", () => {
  it("connects all four activity materials and settles one atomic local batch per item", () => {
    let state = createInitialState();
    state.research.completedTechIds.push("universe_matrix");
    configureActivity(state);
    state = placeOne(state, "galactic_material_exporter", 600);
    state.construction.wind_turbine = 4;
    state = placeBuilding(state, "wind_turbine", { x: 800, y: -200 }, 4);
    const exporter = state.entities.find((entity) => entity.buildingId === "galactic_material_exporter")!;
    state = setGalacticMaterialExporterPaused(state, exporter.id, false);
    state.construction.conveyor_belt_mk1 = ACTIVITY_MATERIAL_IDS.length;

    ACTIVITY_MATERIAL_IDS.forEach((itemId, index) => {
      state = placeOne(state, "storage_mk1", index * 120);
      const source = state.entities.filter((entity) => entity.buildingId === "storage_mk1").at(-1)!;
      source.storedItemId = itemId;
      source.outputs[itemId] = 10;
      const check = getBeltConnectionCheck(state, source.id, exporter.id, itemId);
      expect(check.ok, check.label).toBe(true);
      state = connectBelt(state, source.id, exporter.id, itemId);
    });

    state = advanceSimulationBudget(state, 1, 1);
    for (const itemId of ACTIVITY_MATERIAL_IDS) {
      expect(state.endgame.constructionActivity.personalDelivered[itemId]).toBe(6);
      expect(state.endgame.constructionActivity.pendingBatches[itemId]).toMatchObject({ itemId, amount: 6 });
      expect(state.endgame.exportProjects[ACTIVITY_PROJECT_BY_ITEM[itemId]].totalDelivered).toBe(6);
    }
    expect(state.endgame.totalExported).toBe(24);
  });

  it("keeps exporter input buffered outside the activity window and advances only the wall clock", () => {
    let state = createInitialState();
    state.research.completedTechIds.push("universe_matrix");
    configureActivity(state, 500, 1_000, 2_000);
    state = placeOne(state, "galactic_material_exporter", 300);
    state.construction.wind_turbine = 1;
    state = placeBuilding(state, "wind_turbine", { x: 500, y: -200 });
    const exporter = state.entities.find((entity) => entity.buildingId === "galactic_material_exporter")!;
    exporter.inputs.universe_matrix = 9;
    state = setGalacticMaterialExporterPaused(state, exporter.id, false);

    state = advanceSimulationBudget(state, 4, 0.25);
    const buffered = state.entities.find((entity) => entity.id === exporter.id)!;
    expect(buffered.inputs.universe_matrix).toBe(9);
    expect(state.endgame.constructionActivity.personalDelivered.universe_matrix).toBe(0);
    expect(state.endgame.constructionActivity.activityClockMs).toBe(750);

    state = advanceSimulationBudget(state, 4, 0.25);
    expect(state.endgame.constructionActivity.activityClockMs).toBe(1_000);
    expect(state.endgame.constructionActivity.personalDelivered.universe_matrix).toBe(0);
    state = advanceSimulationBudget(state, 4, 0.5);
    expect(state.endgame.constructionActivity.activityClockMs).toBe(1_500);
    expect(state.endgame.constructionActivity.personalDelivered.universe_matrix).toBe(9);
  });

  it("keeps black-hole ports independent, paused by default and exact above Number.MAX_SAFE_INTEGER", () => {
    let state = createInitialState();
    state = placeOne(state, "micro_black_hole_connector", 500);
    const blackHole = state.entities.find((entity) => entity.buildingId === "micro_black_hole_connector")!;
    state.construction.conveyor_belt_mk1 = 3;
    const items: ItemId[] = ["iron_ore", "water", "universe_matrix"];
    items.forEach((itemId, index) => {
      state = placeOne(state, "storage_mk1", index * 120);
      const source = state.entities.filter((entity) => entity.buildingId === "storage_mk1").at(-1)!;
      source.storedItemId = itemId;
      source.outputs[itemId] = 20;
      state = connectBelt(state, source.id, blackHole.id, itemId, 1, index as 0 | 1 | 2);
    });
    state.construction.conveyor_belt_mk1 = 1;
    const occupied = getBeltConnectionCheck(state, state.belts[0].source, blackHole.id, "iron_ore", 1, 0);
    expect(occupied).toMatchObject({ ok: false });
    expect(occupied.label).toContain("接口 1 已占用");

    state = advanceSimulationBudget(state, 1, 1);
    expect(state.entities.find((entity) => entity.id === blackHole.id)?.blackHolePorts?.map((port) => port.totalDestroyed)).toEqual(["0", "0", "0"]);

    state = setBlackHolePaused(state, blackHole.id, false, true);
    state = advanceSimulationBudget(state, 1, 1);
    let active = state.entities.find((entity) => entity.id === blackHole.id)!;
    expect(active.blackHolePorts?.map((port) => [port.currentItemId, port.totalDestroyed])).toEqual([
      ["iron_ore", "6"],
      ["water", "6"],
      ["universe_matrix", "6"],
    ]);

    active.blackHolePorts![0].totalDestroyed = "9007199254740993";
    state = advanceSimulationBudget(state, 1, 1);
    active = state.entities.find((entity) => entity.id === blackHole.id)!;
    expect(active.blackHolePorts?.[0].totalDestroyed).toBe("9007199254740999");
  });

  it("applies the time-warp power curve, automatic fallback and singleton controller cleanup", () => {
    const expected = [
      [4, 100_000], [5, 1_000_000], [6, 10_000_000], [7, 100_000_000],
      [8, 1_000_000_000], [9, 10_000_000_000], [10, 100_000_000_000],
      [11, 1_000_000_000_000], [12, 10_000_000_000_000], [13, 100_000_000_000_000],
    ] as const;
    for (const [multiplier, power] of expected) expect(getTimeWarpRequiredPowerKw(multiplier)).toBe(power);
    expect(getTimeWarpRequiredPowerKw(309)).toBeNull();
    expect(getMaximumStableTimeWarpMultiplier(1_000_000, Number.MAX_SAFE_INTEGER)).toBe(5);

    let state = createInitialState();
    state.settings.simulationSpeed = 4;
    state.construction.wind_turbine = 4_000;
    state = placeBuilding(state, "wind_turbine", { x: 0, y: -200 }, 4_000);
    const wind = state.entities.find((entity) => entity.buildingId === "wind_turbine")!;
    wind.machineCount = 4_000;
    state = placeOne(state, "time_warp_device", 400);
    const controller = state.entities.find((entity) => entity.buildingId === "time_warp_device")!;
    state = setTimeWarpRequestedMultiplier(state, 6);
    state = setTimeWarpEnabled(state, true);
    state = advanceSimulationBudget(state, 0.1, 0.1);
    expect(state.timeWarp).toMatchObject({ requestedMultiplier: 6, effectiveMultiplier: 5, requiredPowerKw: 1_000_000, allocatedPowerKw: 1_000_000 });
    expect(getEffectiveSimulationMultiplier(state)).toBe(5);

    state = removeEntity(state, controller.id);
    expect(state.timeWarp).toMatchObject({ controllerEntityId: null, enabled: false, effectiveMultiplier: 4 });
  });

  it("applies 4x, 5x and 6x to real production for 60 wall seconds without accelerating activity time", () => {
    const produced: number[] = [];
    for (const multiplier of [4, 5, 6]) {
      let state = createInitialState();
      state.settings.resourceMode = "infinite";
      state.settings.simulationSpeed = 4;
      state.construction.mining_machine = 1;
      state.construction.wind_turbine = 40_000;
      state = installMiner(state, "vein_iron");
      state = placeBuilding(state, "wind_turbine", { x: 0, y: -200 }, 40_000);
      if (multiplier > 4) {
        state = placeOne(state, "time_warp_device", 400);
        state = setTimeWarpRequestedMultiplier(state, multiplier);
        state = setTimeWarpEnabled(state, true);
      }
      configureActivity(state, 1_000, 0, 1_000_000);
      state = advanceSimulationBudget(state, 0.1, 0.1);
      expect(getEffectiveSimulationMultiplier(state)).toBe(multiplier);
      const vein = state.entities.find((entity) => entity.id === "vein_iron")!;
      vein.outputs.iron_ore = 0;
      state.totalProduced.iron_ore = 0;
      state.elapsedSeconds = 0;
      state.endgame.constructionActivity.activityClockMs = 1_000;

      state = advanceSimulationBudget(state, multiplier * 60, 60);
      produced.push(state.entities.find((entity) => entity.id === "vein_iron")!.outputs.iron_ore ?? 0);
      expect(state.elapsedSeconds).toBe(multiplier * 60);
      expect(state.endgame.constructionActivity.activityClockMs).toBe(61_000);
    }
    expect(produced).toEqual([120, 150, 180]);
  });

  it("skips an unavailable supply and fills one demand from multiple peers in the same step", () => {
    let state = createInitialState();
    state.construction.wind_turbine = 4;
    state = placeBuilding(state, "wind_turbine", { x: 0, y: -200 }, 4);
    state.construction.planetary_logistics_station = 4;
    for (let index = 0; index < 4; index += 1) state = placeBuilding(state, "planetary_logistics_station", { x: index * 220, y: 100 });
    const [empty, partial, full, demand] = state.entities.filter((entity) => entity.buildingId === "planetary_logistics_station");
    for (const supply of [empty, partial, full]) {
      state = setStationSlotItem(state, supply.id, 0, "iron_ingot");
      state = setStationSlotMode(state, supply.id, 0, "local", "supply");
    }
    state = setStationSlotItem(state, demand.id, 0, "iron_ingot");
    state = setStationSlotMode(state, demand.id, 0, "local", "demand");
    state = setStationSlotMinimumLoad(state, demand.id, 0, 1);
    station(state, empty.id).outputs.iron_ingot = 0;
    station(state, partial.id).outputs.iron_ingot = 25;
    station(state, full.id).outputs.iron_ingot = 50;
    station(state, demand.id).stationDrones = 3;

    state = advanceSimulationBudget(state, 0.1, 0.1);
    const routes = station(state, demand.id).stationRoutes ?? [];
    expect(routes.map((route) => route.peerId)).toEqual([partial.id, full.id]);
    expect(routes.reduce((sum, route) => sum + route.vehicleCount, 0)).toBe(3);
    expect(routes.reduce((sum, route) => sum + route.cargo, 0)).toBe(75);
  });

  it("reports a partially warper-limited fleet instead of claiming every idle vessel is available", () => {
    let state = createInitialState();
    state.research.completedTechIds.push("interstellar_logistics", "space_warp");
    state.exploration.unlockedSystemIds.push("borealis");
    state.exploration.colonizedPlanetIds.push("frost");
    state = placeOne(state, "interstellar_logistics_station", 0);
    const supply = state.entities.find((entity) => entity.buildingId === "interstellar_logistics_station")!;
    state = setStationSlotItem(state, supply.id, 0, "processor");
    state = setStationSlotMode(state, supply.id, 0, "remote", "supply");
    station(state, supply.id).outputs.processor = 10_000;
    Object.assign(station(state, supply.id), { powerFactor: 1 });
    state = placeOne(state, "wind_turbine", -200);
    state.activePlanetId = "frost";
    state.tray = state.planetTrays.frost;
    state = placeOne(state, "wind_turbine", -200);
    state = placeOne(state, "interstellar_logistics_station", 300);
    const demand = state.entities.filter((entity) => entity.buildingId === "interstellar_logistics_station").at(-1)!;
    state = setStationSlotItem(state, demand.id, 0, "processor");
    state = setStationSlotMode(state, demand.id, 0, "remote", "demand");
    state = setStationSlotMinimumLoad(state, demand.id, 0, 1);
    Object.assign(station(state, demand.id), { machineCount: 5, stationVessels: 50, stationWarpers: 10, stationWarpEnabled: true, powerFactor: 1 });

    const diagnostic = getStationFleetDiagnostic(state, demand.id)!;
    expect(diagnostic.vessels).toMatchObject({ installed: 50, capacity: 50, available: 10, blocked: 40, blockerCode: "missing-warper" });
    expect(diagnostic.vessels.blockerLabel).toContain("10 艘可出发");
  });

  it("migrates a v33 state through v34 to current v35 without changing activity, routes, inventory or Dyson progress", () => {
    const current = createInitialState();
    current.tray.processor = 321;
    configureActivity(current, 5_000, 1_000, 10_000);
    current.endgame.constructionActivity.personalDelivered.universe_matrix = 12;
    current.endgame.constructionActivity.pendingBatches.universe_matrix = {
      id: "legacy-batch", itemId: "universe_matrix", amount: 12, sequence: 0, firstDeliveredAtMs: 4_000, lastDeliveredAtMs: 5_000,
    };
    current.dysonPlans.helios.structurePoints = 17;
    current.dysonPlans.helios.shellSails = 9;
    const legacy = JSON.parse(JSON.stringify(current)) as Record<string, any>;
    legacy.version = 33;
    delete legacy.timeWarp;
    for (const plan of Object.values(legacy.dysonPlans) as Array<Record<string, any>>) {
      for (const layer of plan.layers ?? []) {
        delete layer.structureAllocationFloor;
        delete layer.shellAllocationFloor;
      }
    }

    const migrated = migrateGame(legacy)!;
    expect(migrated.version).toBe(39);
    expect(migrated.tray.processor).toBe(321);
    expect(migrated.dysonPlans.helios).toMatchObject({ structurePoints: 17, shellSails: 9 });
    expect(migrated.endgame.constructionActivity.personalDelivered.universe_matrix).toBe(12);
    expect(migrated.endgame.constructionActivity.pendingBatches.universe_matrix?.amount).toBe(12);
    expect(migrated.endgame.constructionActivity.activityClockMs).toBe(5_000);
    expect(migrated.timeWarp).toMatchObject({ controllerEntityId: null, enabled: false, requestedMultiplier: 5, pendingSimulationSeconds: 0, pendingWallSeconds: 0 });
    expect(migrated.construction.micro_black_hole_connector).toBe(0);
    expect(migrated.construction.time_warp_device).toBe(0);
  });

  it("keeps the activity material type closed over all four configured IDs", () => {
    expect(new Set<ActivityMaterialId>(ACTIVITY_MATERIAL_IDS).size).toBe(4);
  });
});
