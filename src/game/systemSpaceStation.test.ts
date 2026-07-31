import { describe, expect, it } from "vitest";
import { advanceSimulation, connectBelt, createInitialState, placeBuilding, setActivePlanet } from "./engine";
import {
  canUpgradeInterstellarStation,
  completeStationOperationModeTransition,
  deliverSystemSpaceStationMaterial,
  getInterstellarStationUpgradeStatus,
  getSpaceStationModuleCost,
  getSpaceStationProgress,
  setElevatorOutputItem,
  settleSpaceStationConstructionInputs,
  startSystemSpaceStationConstruction,
  upgradeAllInterstellarStationsToMk2,
  upgradeInterstellarStationToMk2,
} from "./systemSpaceStation";
import { settleSystemHubLogistics } from "./systemHubLogistics";
import type { FactoryEntity } from "./types";

function elevatorStation(id: string, planetId: FactoryEntity["planetId"]): FactoryEntity {
  return {
    id,
    kind: "station",
    planetId,
    position: { x: 0, y: 0 },
    interactionLocked: false,
    buildingId: "interstellar_logistics_station",
    stationTier: 2,
    stationOperationMode: "elevator",
    stationModeTransition: null,
    elevatorOutputItems: ["iron_ingot", null, null, null, null],
    stationSlots: [],
    stationRoutes: [],
    stationDrones: 0,
    stationVessels: 0,
    stationWarpers: 0,
    stationWarpEnabled: true,
    stationMode: "supply",
    machineCount: 1,
    minerCount: 0,
    inputs: {},
    outputs: {},
    progress: 0,
    routingCursor: 0,
    utilization: 0,
    productionRate: 0,
  };
}

describe("system space station domain", () => {
  it("delivers construction materials from the matching planet tray and reaches the next phase", () => {
    let state = createInitialState();
    state.research.completedTechIds.push("system_space_station_engineering");
    state.exploration.unlockedSystemIds.push("helios");
    state.construction.space_station_construction_launcher = 1;
    state = placeBuilding(state, "space_station_construction_launcher", { x: 20, y: 20 });
    state = startSystemSpaceStationConstruction(state, "helios");
    state.planetTrays.home.titanium_alloy = 1_000_000;
    state.tray = state.planetTrays.home;
    state = deliverSystemSpaceStationMaterial(state, "helios", "home", "titanium_alloy", 1_000_000);
    expect(state.systemSpaceStations.helios?.delivered.titanium_alloy).toBe("1000000");
    expect(state.systemSpaceStations.helios?.phaseIndex).toBe(0);
    expect(getSpaceStationProgress(state, "helios").progress).toBeGreaterThan(0);
  });

  it("settles real launcher input into the staged construction buffer", () => {
    let state = createInitialState();
    state.research.completedTechIds.push("system_space_station_engineering");
    state.exploration.unlockedSystemIds.push("helios");
    state.construction.space_station_construction_launcher = 1;
    state = placeBuilding(state, "space_station_construction_launcher", { x: 20, y: 20 });
    state = startSystemSpaceStationConstruction(state, "helios");
    const launcher = state.entities.find((entity) => entity.buildingId === "space_station_construction_launcher")!;
    launcher.inputs.titanium_alloy = 125;
    launcher.powerFactor = 1;
    const report = settleSpaceStationConstructionInputs(state);
    expect(report.accepted).toBe(125);
    expect(state.systemSpaceStations.helios?.delivered.titanium_alloy).toBe("125");
    expect(launcher.inputs.titanium_alloy).toBe(0);
  });

  it("keeps launcher input in place while its construction power factor is zero", () => {
    let state = createInitialState();
    state.research.completedTechIds.push("system_space_station_engineering");
    state.exploration.unlockedSystemIds.push("helios");
    state.construction.space_station_construction_launcher = 1;
    state = placeBuilding(state, "space_station_construction_launcher", { x: 20, y: 20 });
    state = startSystemSpaceStationConstruction(state, "helios");
    const launcher = state.entities.find((entity) => entity.buildingId === "space_station_construction_launcher")!;
    launcher.inputs.titanium_alloy = 125;
    launcher.powerFactor = 0;
    const report = settleSpaceStationConstructionInputs(state);
    expect(report.accepted).toBe(0);
    expect(launcher.inputs.titanium_alloy).toBe(125);
    expect(state.systemSpaceStations.helios?.delivered.titanium_alloy).toBeUndefined();
  });

  it("allows at most one construction launcher on a planet", () => {
    let state = createInitialState();
    state.construction.space_station_construction_launcher = 2;
    state = placeBuilding(state, "space_station_construction_launcher", { x: 0, y: 0 });
    const second = placeBuilding(state, "space_station_construction_launcher", { x: 100, y: 0 });
    expect(second.entities.filter((entity) => entity.buildingId === "space_station_construction_launcher")).toHaveLength(1);
    expect(second.construction.space_station_construction_launcher).toBe(1);
  });

  it("upgrades a station atomically and preserves the legacy mode until requested", () => {
    let state = createInitialState();
    state.research.completedTechIds.push("orbital_elevator_engineering");
    state.construction.interstellar_logistics_station = 1;
    state = placeBuilding(state, "interstellar_logistics_station", { x: 10, y: 10 });
    const station = state.entities.at(-1)!;
    state.tray = { titanium_alloy: 10_000, frame_material: 5_000, quantum_chip: 5_000, universe_matrix: 10_000 };
    state.planetTrays.home = state.tray;
    expect(canUpgradeInterstellarStation(state, station.id)).toBe(true);
    state = upgradeInterstellarStationToMk2(state, station.id);
    const upgraded = state.entities.find((entity) => entity.id === station.id)!;
    expect(upgraded.stationTier).toBe(2);
    expect(upgraded.stationOperationMode).toBe("legacy");
    expect(state.planetTrays.home.universe_matrix).toBe(0);
  });

  it("reports the actual blocker instead of silently ignoring an upgrade", () => {
    let state = createInitialState();
    state.construction.interstellar_logistics_station = 1;
    state = placeBuilding(state, "interstellar_logistics_station", { x: 10, y: 10 });
    const station = state.entities.at(-1)!;
    expect(getInterstellarStationUpgradeStatus(state, station.id)).toMatchObject({ blocker: "technology" });
    state.research.completedTechIds.push("orbital_elevator_engineering");
    expect(getInterstellarStationUpgradeStatus(state, station.id)).toMatchObject({ blocker: "materials" });
    state.planetTrays.home = { titanium_alloy: 10_000, frame_material: 5_000, quantum_chip: 5_000, universe_matrix: 10_000 };
    expect(getInterstellarStationUpgradeStatus(state, station.id)).toMatchObject({ blocker: "ready", missing: {} });
    state = upgradeInterstellarStationToMk2(state, station.id);
    expect(getInterstellarStationUpgradeStatus(state, station.id)).toMatchObject({ blocker: "already-upgraded" });
  });

  it("charges one upgrade package for a stacked station entity", () => {
    let state = createInitialState();
    state.research.completedTechIds.push("orbital_elevator_engineering");
    state.construction.interstellar_logistics_station = 11_532;
    state = placeBuilding(state, "interstellar_logistics_station", { x: 10, y: 10 });
    const station = state.entities.at(-1)!;
    station.machineCount = 11_532;
    expect(station.machineCount).toBe(11_532);
    state.planetTrays.home = { titanium_alloy: 10_000, frame_material: 5_000, quantum_chip: 5_000, universe_matrix: 10_000 };
    const status = getInterstellarStationUpgradeStatus(state, station.id);
    expect(status.blocker).toBe("ready");
    expect(status.costs).toEqual({ titanium_alloy: 10_000, frame_material: 5_000, quantum_chip: 5_000, universe_matrix: 10_000 });
    const upgraded = upgradeInterstellarStationToMk2(state, station.id);
    expect(upgraded.entities.find((entity) => entity.id === station.id)?.stationTier).toBe(2);
    expect(upgraded.planetTrays.home).toEqual({ titanium_alloy: 0, frame_material: 0, quantum_chip: 0, universe_matrix: 0 });
  });

  it("upgrades eligible stations in stable order and skips stations with independent blockers", () => {
    let state = createInitialState();
    state.research.completedTechIds.push("orbital_elevator_engineering");
    state.construction.interstellar_logistics_station = 2;
    state = placeBuilding(state, "interstellar_logistics_station", { x: 10, y: 10 });
    state = placeBuilding(state, "interstellar_logistics_station", { x: 80, y: 10 });
    const stations = state.entities.filter((entity) => entity.buildingId === "interstellar_logistics_station");
    const first = stations[0]!;
    const second = stations[1]!;
    state.planetTrays.home = { titanium_alloy: 10_000, frame_material: 5_000, quantum_chip: 5_000, universe_matrix: 10_000 };
    const result = upgradeAllInterstellarStationsToMk2(state, "helios");
    expect(result.upgradedIds).toEqual([first.id]);
    expect(result.skipped).toEqual([expect.objectContaining({ entityId: second.id, blocker: "materials" })]);
    expect(result.state.entities.find((entity) => entity.id === first.id)?.stationTier).toBe(2);
    expect(result.state.entities.find((entity) => entity.id === second.id)?.stationTier).toBe(1);
    expect(result.state.planetTrays.home).toEqual({ titanium_alloy: 0, frame_material: 0, quantum_chip: 0, universe_matrix: 0 });
  });

  it("upgrades every eligible station across the full star map without mixing planet trays", () => {
    let state = createInitialState();
    state.research.completedTechIds.push("orbital_elevator_engineering");
    state.exploration.unlockedSystemIds.push("borealis");
    state.exploration.colonizedPlanetIds.push("frost");
    state.exploration.surveyProgressBySystem.borealis = 1;
    state.construction.interstellar_logistics_station = 2;

    state = placeBuilding(state, "interstellar_logistics_station", { x: 10, y: 10 });
    state = setActivePlanet(state, "frost");
    state = placeBuilding(state, "interstellar_logistics_station", { x: 80, y: 10 });
    const stations = state.entities.filter((entity) => entity.buildingId === "interstellar_logistics_station");
    expect(stations).toHaveLength(2);

    const packageCost = { titanium_alloy: 10_000, frame_material: 5_000, quantum_chip: 5_000, universe_matrix: 10_000 };
    state.planetTrays.home = { ...packageCost };
    state.planetTrays.frost = { ...packageCost };
    state.tray = { ...state.planetTrays.frost };

    const result = upgradeAllInterstellarStationsToMk2(state);
    expect(result.upgradedIds).toEqual(stations.map((station) => station.id).sort());
    expect(result.skipped).toEqual([]);
    expect(result.state.entities.filter((entity) => entity.buildingId === "interstellar_logistics_station" && entity.stationTier === 2)).toHaveLength(2);
    expect(result.state.planetTrays.home).toEqual({ titanium_alloy: 0, frame_material: 0, quantum_chip: 0, universe_matrix: 0 });
    expect(result.state.planetTrays.frost).toEqual({ titanium_alloy: 0, frame_material: 0, quantum_chip: 0, universe_matrix: 0 });
  });

  it("does not complete a mode transition while any route role still references the station", () => {
    const state = createInitialState();
    const station = elevatorStation("station-a", "home");
    station.stationOperationMode = "legacy";
    station.stationModeTransition = "to-elevator";
    const peer = elevatorStation("station-b", "home");
    peer.stationOperationMode = "legacy";
    peer.stationRoutes = [{
      id: "route-1", slotIndex: 0, peerId: station.id, itemId: "iron_ingot", scope: "local", cargo: 10,
      vehicleCount: 1, progress: 0.5, duration: 8, requiresWarp: false, vehicleStationId: peer.id,
    }];
    state.entities = [station, peer];
    expect(completeStationOperationModeTransition(state, station.id).entities[0].stationOperationMode).toBe("legacy");
    peer.stationRoutes = [];
    expect(completeStationOperationModeTransition(state, station.id).entities[0].stationOperationMode).toBe("elevator");
  });

  it("keeps output assignments unique and refunds a removed output belt", () => {
    let state = createInitialState();
    const station = elevatorStation("station-a", "home");
    state.entities = [station];
    state.belts = [{
      id: "belt-1", planetId: "home", source: station.id, target: "missing", itemId: "iron_ingot", lanes: 2,
      tier: 1, sorterTier: 1, progress: 0, priority: 0, lastFlow: 0, elevatorOutputIndex: 0,
    }];
    state.construction.conveyor_belt_mk1 = 0;
    state = setElevatorOutputItem(state, station.id, 0, null, 2);
    expect(state.belts).toHaveLength(0);
    expect(state.construction.conveyor_belt_mk1).toBe(2);
    const unchanged = setElevatorOutputItem(state, station.id, 0, "iron_ingot", 2);
    const duplicate = setElevatorOutputItem({
      ...unchanged,
      entities: unchanged.entities.map((entity) => entity.id === station.id ? { ...entity, elevatorOutputItems: ["iron_ingot", "iron_ingot", null, null, null] } : entity),
    }, station.id, 1, "iron_ingot", 2);
    expect(duplicate.entities.find((entity) => entity.id === station.id)?.elevatorOutputItems).toEqual(["iron_ingot", "iron_ingot", null, null, null]);
  });

  it("settles local hub cargo, proportional outputs, and cross-system fleet buckets", () => {
    const state = createInitialState();
    state.research.completedTechIds.push("unified_system_logistics_protocol");
    state.systemSpaceStations.helios!.status = "operational";
    state.systemSpaceStations.borealis!.status = "operational";
    state.systemSpaceStations.helios!.itemPolicies.iron_ingot = { interstellarEnabled: true, reserve: "0", target: "0" };
    state.systemSpaceStations.borealis!.itemPolicies.iron_ingot = { interstellarEnabled: true, reserve: "0", target: "200" };
    state.systemSpaceStations.helios!.inventory.iron_ingot = "1000";
    state.galacticHubNetwork.fleetInstalled = 10;
    state.galacticHubNetwork.warpers = "20";
    const source = elevatorStation("station-helios", "home");
    source.elevatorOutputItems = [null, null, null, null, null];
    source.inputs.iron_ingot = 400;
    const output = elevatorStation("station-borealis", "frost");
    output.outputs.iron_ingot = 0;
    output.elevatorOutputItems = ["iron_ingot", null, null, null, null];
    state.entities = [source, output];
    const report = settleSystemHubLogistics(state, 5);
    expect(report.localUploads).toBe(400);
    expect(state.systemSpaceStations.helios!.inventory.iron_ingot).toBe("1200");
    expect(report.vesselsDispatched).toBeGreaterThan(0);
    expect(state.galacticHubNetwork.fleetReturns).toHaveLength(1);
    expect(state.galacticHubNetwork.warpers).toBe("16");
    expect(getSpaceStationModuleCost("interstellar", 10, 1).space_warper).toBe("20000");
  });

  it("holds elevator uploads when the station power factor is zero", () => {
    const state = createInitialState();
    state.systemSpaceStations.helios!.status = "operational";
    const station = elevatorStation("station-unpowered", "home");
    station.elevatorOutputItems = [null, null, null, null, null];
    station.inputs.iron_ingot = 100;
    station.powerFactor = 0;
    state.entities = [station];
    const report = settleSystemHubLogistics(state, 5);
    expect(report.localUploads).toBe(0);
    expect(station.inputs.iron_ingot).toBe(100);
    expect(state.systemSpaceStations.helios!.inventory.iron_ingot).toBeUndefined();
  });

  it("uses deterministic star-system distance for fleet return buckets", () => {
    const state = createInitialState();
    state.research.completedTechIds.push("unified_system_logistics_protocol");
    state.systemSpaceStations.helios!.status = "operational";
    state.systemSpaceStations.aurora!.status = "operational";
    state.systemSpaceStations.helios!.itemPolicies.iron_ingot = { interstellarEnabled: true, reserve: "0", target: "0" };
    state.systemSpaceStations.aurora!.itemPolicies.iron_ingot = { interstellarEnabled: true, reserve: "0", target: "100" };
    state.systemSpaceStations.helios!.inventory.iron_ingot = "100";
    state.galacticHubNetwork.fleetInstalled = 2;
    state.galacticHubNetwork.warpers = "4";
    const source = elevatorStation("station-helios-distance", "home");
    source.elevatorOutputItems = [null, null, null, null, null];
    const target = elevatorStation("station-aurora-distance", "verdant");
    target.elevatorOutputItems = [null, null, null, null, null];
    state.entities = [source, target];
    settleSystemHubLogistics(state, 5);
    expect(state.galacticHubNetwork.fleetReturns[0]?.returnAtSecond).toBeGreaterThan(30);
  });

  it("runs elevator settlement from the normal deterministic engine boundary", () => {
    let state = createInitialState();
    state.systemSpaceStations.helios!.status = "operational";
    const station = elevatorStation("station-engine", "home");
    station.elevatorOutputItems = [null, null, null, null, null];
    station.inputs.iron_ingot = 25;
    state.entities = [station];
    state = advanceSimulation(state, 5);
    expect(state.elapsedSeconds).toBe(5);
    expect(state.systemSpaceStations.helios!.inventory.iron_ingot).toBe("25");
    expect(state.entities[0].inputs.iron_ingot).toBe(0);
  });

  it("connects only configured elevator outputs and persists the output index", () => {
    let state = createInitialState();
    const source = elevatorStation("station-output", "home");
    state.entities = [source];
    state.construction.storage_mk1 = 1;
    state = placeBuilding(state, "storage_mk1", { x: 100, y: 0 });
    const target = state.entities.at(-1)!;
    state.construction.conveyor_belt_mk1 = 1;
    state = connectBelt(state, source.id, target.id, "iron_ingot", 1);
    expect(state.belts.at(-1)?.elevatorOutputIndex).toBe(0);
    const rejected = connectBelt(state, source.id, target.id, "copper_ingot", 1);
    expect(rejected.belts).toHaveLength(state.belts.length);
  });

  it("keeps five-second hub settlement equivalent across segmented advancement", () => {
    const makeState = () => {
      const next = createInitialState();
      next.systemSpaceStations.helios!.status = "operational";
      const station = elevatorStation("station-segment", "home");
      station.elevatorOutputItems = [null, null, null, null, null];
      station.inputs.iron_ingot = 125;
      next.entities = [station];
      return next;
    };
    const batched = advanceSimulation(makeState(), 60);
    let segmented = makeState();
    for (let index = 0; index < 60; index += 1) segmented = advanceSimulation(segmented, 1);
    expect(segmented.systemSpaceStations).toEqual(batched.systemSpaceStations);
    expect(segmented.entities[0].inputs).toEqual(batched.entities[0].inputs);
    expect(segmented.entities[0].outputs).toEqual(batched.entities[0].outputs);
  });
});
