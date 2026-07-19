/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from "vitest";
import { createInitialState, placeBuilding, setActivePlanet, setFuelItem } from "./engine";
import { loadGame, saveGame } from "./storage";

const SAVE_KEY = "dsp-idle-network.save.v1";

describe("game storage", () => {
  beforeEach(() => window.localStorage.clear());

  it("round-trips a v10 multi-planet research save", () => {
    const state = createInitialState();
    state.research.selectedTechId = "electromagnetic_matrix";
    state.research.queuedTechIds = ["electromagnetism"];
    state.tray.iron_ore = 7;
    state.planetTrays.ashen.titanium_ore = 9;
    saveGame(state);

    const loaded = loadGame().state;
    expect(loaded.version).toBe(10);
    expect(loaded.activePlanetId).toBe("home");
    expect(loaded.planetMetrics.ashen.powerFactor).toBe(1);
    expect(loaded.research.selectedTechId).toBe("electromagnetic_matrix");
    expect(loaded.research.queuedTechIds).toEqual(["electromagnetism"]);
    expect(loaded.tray.iron_ore).toBe(7);
    expect(loaded.planetTrays.ashen.titanium_ore).toBe(9);
  });

  it("migrates v1 fractional inventories into the integer research model", () => {
    const legacy = JSON.parse(JSON.stringify(createInitialState()));
    legacy.version = 1;
    delete legacy.activePlanetId;
    delete legacy.planetMetrics;
    delete legacy.research;
    legacy.tray.iron_ore = 4.9;
    legacy.entities[0].outputs.iron_ore = 3.8;
    for (const entity of legacy.entities) {
      delete entity.progress;
      delete entity.planetId;
    }
    legacy.construction.matrix_lab = 0;
    legacy.construction.conveyor_belt_mk1 = 0;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ savedAt: Date.now(), state: legacy }));

    const loaded = loadGame().state;
    expect(loaded.version).toBe(10);
    expect(loaded.tray.iron_ore).toBe(4);
    expect(loaded.entities[0].outputs.iron_ore).toBe(3);
    expect(loaded.entities.every((entity) => entity.progress === 0)).toBe(true);
    expect(loaded.research.completedTechIds).toEqual([]);
    expect(loaded.research.queuedTechIds).toEqual([]);
    expect(loaded.construction.wind_turbine).toBe(3);
    expect(loaded.construction.mining_machine).toBe(2);
    expect(loaded.construction.arc_smelter).toBe(3);
    expect(loaded.construction.assembling_machine_mk1).toBe(3);
    expect(loaded.construction.matrix_lab).toBe(2);
    expect(loaded.construction.conveyor_belt_mk1).toBe(10);
    expect(loaded.entities.some((entity) => entity.resourceId === "coal")).toBe(true);
    expect(loaded.entities.some((entity) => entity.resourceId === "crude_oil")).toBe(true);
    expect(loaded.entities.some((entity) => entity.resourceId === "silicon_ore")).toBe(true);
    expect(loaded.entities.some((entity) => entity.resourceId === "titanium_ore")).toBe(true);
    expect(loaded.entities.some((entity) => entity.resourceId === "water")).toBe(true);
    expect(loaded.entities.some((entity) => entity.resourceId === "sulfuric_acid")).toBe(true);
    expect(loaded.entities.filter((entity) => entity.planetId === "home" && entity.kind === "vein")).toHaveLength(6);
    expect(loaded.entities.filter((entity) => entity.planetId === "ashen" && entity.kind === "vein")).toHaveLength(7);
  });

  it("migrates numeric research progress and tops up around deployed starter equipment", () => {
    const legacy = JSON.parse(JSON.stringify(createInitialState()));
    legacy.version = 2;
    legacy.research.progressByTech = { electromagnetic_matrix: 2 };
    delete legacy.construction.wind_turbine;
    delete legacy.construction.mining_machine;
    legacy.construction.arc_smelter = 0;
    legacy.construction.assembling_machine_mk1 = 0;
    legacy.construction.matrix_lab = 0;
    legacy.construction.conveyor_belt_mk1 = 0;
    legacy.entities.push({
      id: "legacy_wind",
      kind: "power",
      position: { x: 0, y: 0 },
      buildingId: "wind_turbine",
      machineCount: 2,
      minerCount: 0,
      inputs: {},
      outputs: {},
      progress: 0,
      utilization: 0,
      productionRate: 0,
    });
    legacy.entities.find((entity: { id: string }) => entity.id === "vein_iron").minerCount = 1;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ savedAt: Date.now(), state: legacy }));

    const loaded = loadGame().state;
    expect(loaded.research.progressByTech.electromagnetic_matrix).toEqual({ electromagnetic_matrix: 2 });
    expect(loaded.construction.wind_turbine).toBe(1);
    expect(loaded.construction.mining_machine).toBe(1);
    expect(loaded.construction.arc_smelter).toBe(3);
    expect(loaded.construction.assembling_machine_mk1).toBe(3);
    expect(loaded.construction.matrix_lab).toBe(2);
    expect(loaded.construction.conveyor_belt_mk1).toBe(10);
    expect(loaded.entities.find((entity) => entity.id === "legacy_wind")?.routingCursor).toBe(0);
  });

  it("round-trips thermal fuel configuration and chamber energy", () => {
    let state = createInitialState();
    state.construction.thermal_power_plant = 1;
    state = placeBuilding(state, "thermal_power_plant", { x: 10, y: 20 });
    const plant = state.entities.find((entity) => entity.buildingId === "thermal_power_plant")!;
    state = setFuelItem(state, plant.id, "hydrogen");
    const configured = state.entities.find((entity) => entity.id === plant.id)!;
    configured.inputs.hydrogen = 4;
    configured.fuelRemainingMj = 3.25;
    saveGame(state);

    const loaded = loadGame().state.entities.find((entity) => entity.id === plant.id)!;
    expect(loaded.fuelItemId).toBe("hydrogen");
    expect(loaded.inputs.hydrogen).toBe(4);
    expect(loaded.fuelRemainingMj).toBe(3.25);
  });

  it("round-trips information matrices and purple research state", () => {
    const state = createInitialState();
    state.tray.information_matrix = 7;
    state.research.completedTechIds.push("information_matrix");
    state.research.selectedTechId = "research_speed_1";
    state.research.progressByTech.research_speed_1 = { information_matrix: 3 };
    saveGame(state);

    const loaded = loadGame().state;
    expect(loaded.tray.information_matrix).toBe(7);
    expect(loaded.research.completedTechIds).toContain("information_matrix");
    expect(loaded.research.selectedTechId).toBe("research_speed_1");
    expect(loaded.research.progressByTech.research_speed_1).toEqual({ information_matrix: 3 });
  });

  it("round-trips gravity matrices, collider construction and green research state", () => {
    const state = createInitialState();
    state.tray.gravity_matrix = 5;
    state.construction.miniature_particle_collider = 2;
    state.research.completedTechIds.push("gravity_matrix", "research_speed_1");
    state.research.selectedTechId = "research_speed_2";
    state.research.progressByTech.research_speed_2 = { gravity_matrix: 4 };
    saveGame(state);

    const loaded = loadGame().state;
    expect(loaded.tray.gravity_matrix).toBe(5);
    expect(loaded.construction.miniature_particle_collider).toBe(2);
    expect(loaded.research.completedTechIds).toContain("gravity_matrix");
    expect(loaded.research.selectedTechId).toBe("research_speed_2");
    expect(loaded.research.progressByTech.research_speed_2).toEqual({ gravity_matrix: 4 });
  });

  it("migrates v4 stations with a compatibility vessel and full minimum load", () => {
    let current = createInitialState();
    current.construction.interstellar_logistics_station = 1;
    current = placeBuilding(current, "interstellar_logistics_station", { x: 10, y: 20 });
    const legacy = JSON.parse(JSON.stringify(current));
    legacy.version = 4;
    const legacyStation = legacy.entities.find((entity: { kind: string }) => entity.kind === "station");
    delete legacyStation.stationVessels;
    delete legacyStation.stationMinimumLoad;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ savedAt: Date.now(), state: legacy }));

    const loaded = loadGame().state;
    const station = loaded.entities.find((entity) => entity.kind === "station")!;
    expect(loaded.version).toBe(10);
    expect(station.stationVessels).toBe(1);
    expect(station.stationMinimumLoad).toBe(1);
  });

  it("migrates the legacy remote zone into the ashen planet", () => {
    const legacy = JSON.parse(JSON.stringify(createInitialState()));
    legacy.version = 3;
    delete legacy.activePlanetId;
    delete legacy.planetMetrics;
    delete legacy.planetTrays;
    legacy.entities = legacy.entities.filter((entity: { id: string }) => !entity.id.startsWith("ashen_"));
    for (const entity of legacy.entities) {
      delete entity.planetId;
      if (["vein_silicon", "vein_titanium", "vein_water"].includes(entity.id)) entity.position.x = -790;
    }
    legacy.entities.push({
      id: "legacy_remote_smelter",
      kind: "machine",
      position: { x: -760, y: 40 },
      buildingId: "arc_smelter",
      recipeId: "titanium_ingot",
      machineCount: 1,
      minerCount: 0,
      inputs: { titanium_ore: 3 },
      outputs: {},
      progress: 0.5,
      routingCursor: 0,
      utilization: 0,
      productionRate: 0,
    });
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ savedAt: Date.now(), state: legacy }));

    const loaded = loadGame().state;
    const silicon = loaded.entities.find((entity) => entity.id === "vein_silicon")!;
    const water = loaded.entities.find((entity) => entity.id === "vein_water")!;
    const smelter = loaded.entities.find((entity) => entity.id === "legacy_remote_smelter")!;
    expect(silicon).toMatchObject({ planetId: "ashen", position: { x: -150 } });
    expect(water).toMatchObject({ planetId: "home", position: { x: -150 } });
    expect(smelter).toMatchObject({ planetId: "ashen", position: { x: -120 }, inputs: { titanium_ore: 3 }, progress: 0.5 });
  });

  it("migrates v5 saves with an empty Dyson swarm and new construction slots", () => {
    const legacy = JSON.parse(JSON.stringify(createInitialState()));
    legacy.version = 5;
    delete legacy.dysonSwarm;
    delete legacy.construction.em_rail_ejector;
    delete legacy.construction.ray_receiver;
    delete legacy.metrics.rayGenerationKw;
    delete legacy.planetMetrics.home.rayGenerationKw;
    delete legacy.planetMetrics.ashen.rayGenerationKw;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ savedAt: Date.now(), state: legacy }));

    const loaded = loadGame().state;
    expect(loaded.version).toBe(10);
    expect(loaded.dysonSwarm).toEqual({
      sailsInOrbit: 0,
      totalLaunched: 0,
      totalExpired: 0,
      decayProgress: 0,
      generationKw: 0,
      receiverLoadKw: 0,
    });
    expect(loaded.construction.em_rail_ejector).toBe(0);
    expect(loaded.construction.ray_receiver).toBe(0);
    expect(loaded.construction.vertical_launching_silo).toBe(0);
    expect(loaded.dysonSphere).toEqual({
      structurePoints: 0,
      totalRocketsLaunched: 0,
      shellSails: 0,
      totalSailsAbsorbed: 0,
      absorptionProgress: 0,
      generationKw: 0,
    });
    expect(loaded.metrics.rayGenerationKw).toBe(0);
  });

  it("migrates v6 Dyson swarm counters with an empty permanent sphere", () => {
    const saved = JSON.parse(JSON.stringify(createInitialState()));
    saved.version = 6;
    delete saved.dysonSphere;
    delete saved.construction.vertical_launching_silo;
    saved.dysonSwarm = {
      sailsInOrbit: 12.9,
      totalLaunched: 1,
      totalExpired: 2.8,
      decayProgress: 3.75,
      generationKw: 999999,
      receiverLoadKw: 999999,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ savedAt: Date.now(), state: saved }));

    const loaded = loadGame().state;
    expect(loaded.dysonSwarm).toEqual({
      sailsInOrbit: 12,
      totalLaunched: 14,
      totalExpired: 2,
      decayProgress: 0.75,
      generationKw: 432,
      receiverLoadKw: 432,
    });
    expect(loaded.dysonSphere).toEqual({
      structurePoints: 0,
      totalRocketsLaunched: 0,
      shellSails: 0,
      totalSailsAbsorbed: 0,
      absorptionProgress: 0,
      generationKw: 0,
    });
  });

  it("sanitizes v8 Dyson sphere capacity and recomputes total receiver power", () => {
    const saved = JSON.parse(JSON.stringify(createInitialState()));
    saved.dysonSwarm = {
      sailsInOrbit: 12.9,
      totalLaunched: 1,
      totalExpired: 2.8,
      decayProgress: 3.75,
      generationKw: 999999,
      receiverLoadKw: 999999,
    };
    saved.dysonSphere = {
      structurePoints: 3.9,
      totalRocketsLaunched: 1,
      shellSails: 100,
      totalSailsAbsorbed: 2,
      absorptionProgress: 2.25,
      generationKw: 999999,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ savedAt: Date.now(), state: saved }));

    const loaded = loadGame().state;
    expect(loaded.dysonSphere).toEqual({
      structurePoints: 3,
      totalRocketsLaunched: 3,
      shellSails: 60,
      totalSailsAbsorbed: 60,
      absorptionProgress: 0.25,
      generationKw: 5040,
    });
    expect(loaded.dysonSwarm).toEqual({
      sailsInOrbit: 12,
      totalLaunched: 74,
      totalExpired: 2,
      decayProgress: 0.75,
      generationKw: 432,
      receiverLoadKw: 5472,
    });
  });

  it("migrates v7 belts to Mk.I and initializes every upgrade construction slot", () => {
    let current = createInitialState();
    current = placeBuilding(current, "arc_smelter", { x: 100, y: 0 });
    const smelter = current.entities.find((entity) => entity.buildingId === "arc_smelter")!;
    const legacy = JSON.parse(JSON.stringify(current));
    legacy.version = 7;
    delete legacy.construction.plane_smelter;
    delete legacy.construction.assembling_machine_mk2;
    delete legacy.construction.assembling_machine_mk3;
    delete legacy.construction.conveyor_belt_mk2;
    delete legacy.construction.conveyor_belt_mk3;
    legacy.belts = [{
      id: "legacy_belt",
      planetId: "home",
      source: "vein_iron",
      target: smelter.id,
      itemId: "iron_ore",
      lanes: 1,
      tier: 3,
      progress: 0.5,
      priority: 0,
      lastFlow: 2,
    }];
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ savedAt: Date.now(), state: legacy }));

    const loaded = loadGame().state;
    expect(loaded.version).toBe(10);
    expect(loaded.belts[0]).toMatchObject({ id: "legacy_belt", tier: 1, progress: 0.5 });
    expect(loaded.construction).toMatchObject({
      plane_smelter: 0,
      assembling_machine_mk2: 0,
      assembling_machine_mk3: 0,
      conveyor_belt_mk2: 0,
      conveyor_belt_mk3: 0,
    });
  });

  it("round-trips v8 high-tier equipment and belt levels without starter replenishment", () => {
    let state = createInitialState();
    state.construction.assembling_machine_mk2 = 1;
    state = placeBuilding(state, "assembling_machine_mk2", { x: 100, y: 0 });
    const assembler = state.entities.find((entity) => entity.buildingId === "assembling_machine_mk2")!;
    state.construction.conveyor_belt_mk1 = 2;
    state.belts.push({
      id: "belt_mk2",
      planetId: "home",
      source: "vein_iron",
      target: assembler.id,
      itemId: "iron_ore",
      lanes: 1,
      tier: 2,
      sorterTier: 1,
      progress: 0.25,
      priority: 0,
      lastFlow: 4,
    });
    saveGame(state);

    const loaded = loadGame().state;
    expect(loaded.entities.find((entity) => entity.id === assembler.id)?.buildingId).toBe("assembling_machine_mk2");
    expect(loaded.belts[0]).toMatchObject({ id: "belt_mk2", tier: 2, progress: 0.25 });
    expect(loaded.construction.conveyor_belt_mk1).toBe(2);
  });

  it("migrates v8 production nodes into a consistent empty proliferator state", () => {
    let current = createInitialState();
    current = placeBuilding(current, "assembling_machine_mk1", { x: 100, y: 0 });
    const legacy = JSON.parse(JSON.stringify(current));
    legacy.version = 8;
    delete legacy.construction.spray_coater;
    const assembler = legacy.entities.find((entity: { buildingId?: string }) => entity.buildingId === "assembling_machine_mk1");
    delete assembler.sprayCoaterInstalled;
    delete assembler.proliferatorTier;
    delete assembler.proliferatorMode;
    delete assembler.proliferatorPoints;
    delete assembler.proliferatorBonusProgress;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ savedAt: Date.now(), state: legacy }));

    const loaded = loadGame().state;
    const migrated = loaded.entities.find((entity) => entity.id === assembler.id)!;
    expect(loaded.version).toBe(10);
    expect(loaded.construction.spray_coater).toBe(0);
    expect(migrated).toMatchObject({ sprayCoaterInstalled: false, proliferatorPoints: 0, proliferatorBonusProgress: {} });
    expect(migrated.proliferatorTier).toBeUndefined();
    expect(migrated.proliferatorMode).toBeUndefined();
  });

  it("sanitizes malformed v9 proliferator module fields", () => {
    let current = createInitialState();
    current = placeBuilding(current, "assembling_machine_mk1", { x: 100, y: 0 });
    const saved = JSON.parse(JSON.stringify(current));
    const assembler = saved.entities.find((entity: { buildingId?: string }) => entity.buildingId === "assembling_machine_mk1");
    assembler.sprayCoaterInstalled = true;
    assembler.proliferatorTier = 99;
    assembler.proliferatorMode = "invalid";
    assembler.proliferatorPoints = 3.9;
    assembler.proliferatorBonusProgress = { gear: 2.75 };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ savedAt: Date.now(), state: saved }));

    const migrated = loadGame().state.entities.find((entity) => entity.id === assembler.id)!;
    expect(migrated).toMatchObject({
      sprayCoaterInstalled: true,
      proliferatorTier: 1,
      proliferatorMode: "normal",
      proliferatorPoints: 3,
      proliferatorBonusProgress: { gear: 0.75 },
    });
  });

  it("migrates v9 belts and planet records into the v10 logistics model", () => {
    let current = createInitialState();
    current = placeBuilding(current, "arc_smelter", { x: 100, y: 0 });
    const smelter = current.entities.find((entity) => entity.buildingId === "arc_smelter")!;
    current.belts.push({
      id: "v9_belt",
      planetId: "home",
      source: "vein_iron",
      target: smelter.id,
      itemId: "iron_ore",
      lanes: 1,
      tier: 2,
      sorterTier: 1,
      progress: 0.25,
      priority: 0,
      lastFlow: 3,
    });
    const legacy = JSON.parse(JSON.stringify(current));
    legacy.version = 9;
    delete legacy.belts[0].sorterTier;
    delete legacy.planetTrays.giant;
    delete legacy.planetMetrics.giant;
    delete legacy.construction.planetary_logistics_station;
    delete legacy.construction.orbital_collector;
    delete legacy.construction.sorter_mk1;
    delete legacy.construction.sorter_mk2;
    delete legacy.construction.sorter_mk3;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ savedAt: Date.now(), state: legacy }));

    const loaded = loadGame().state;
    expect(loaded.version).toBe(10);
    expect(loaded.belts[0]).toMatchObject({ id: "v9_belt", tier: 2, sorterTier: 1, progress: 0.25 });
    expect(loaded.planetTrays.giant).toEqual({});
    expect(loaded.planetMetrics.giant.powerFactor).toBe(1);
    expect(loaded.construction).toMatchObject({
      planetary_logistics_station: 0,
      orbital_collector: 0,
      sorter_mk1: 0,
      sorter_mk2: 0,
      sorter_mk3: 0,
    });
  });

  it("round-trips planetary fleets, warpers and a gas-giant collector", () => {
    let state = createInitialState();
    state.construction.planetary_logistics_station = 1;
    state.construction.interstellar_logistics_station = 1;
    state.construction.orbital_collector = 1;
    state = placeBuilding(state, "planetary_logistics_station", { x: 0, y: 0 });
    state = placeBuilding(state, "interstellar_logistics_station", { x: 300, y: 0 });
    state.entities.find((entity) => entity.buildingId === "planetary_logistics_station")!.stationDrones = 7;
    const interstellar = state.entities.find((entity) => entity.buildingId === "interstellar_logistics_station")!;
    interstellar.stationVessels = 3;
    interstellar.stationWarpers = 4;
    interstellar.stationWarpEnabled = false;
    state = setActivePlanet(state, "giant");
    state = placeBuilding(state, "orbital_collector", { x: 0, y: 0 });
    state.tray.deuterium = 9;
    saveGame(state);

    const loaded = loadGame().state;
    expect(loaded.activePlanetId).toBe("giant");
    expect(loaded.tray.deuterium).toBe(9);
    expect(loaded.entities.find((entity) => entity.buildingId === "planetary_logistics_station")?.stationDrones).toBe(7);
    expect(loaded.entities.find((entity) => entity.buildingId === "interstellar_logistics_station")).toMatchObject({
      stationVessels: 3,
      stationWarpers: 4,
      stationWarpEnabled: false,
    });
    expect(loaded.entities.find((entity) => entity.buildingId === "orbital_collector")).toMatchObject({
      planetId: "giant",
      storedItemId: "hydrogen",
      stationMode: "supply",
    });
  });
});
