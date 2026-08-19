import { describe, expect, it } from "vitest";
import { createInitialState, createSpeedrunInitialState, placeBuilding } from "./engine";
import {
  cloneOrbitalStationState,
  createOrbitalStationState,
  deliverOrbitalQuantumInventory,
  deliverOrbitalStationConstructionMutable,
  deliverOrbitalStationFleet,
  getOrbitalStationActiveStage,
  normalizeOrbitalStationState,
  previewOrbitalQuantumDelivery,
  startOrbitalStationConstruction,
  synchronizeOrbitalStationEligibility,
} from "./orbitalStation";
import { exportGame, importGame, migrateGame } from "./storage";

describe("global orbital station", () => {
  it("unlocks only normal saves after cumulative universe-matrix production", () => {
    const initial = createInitialState();
    expect(initial.version).toBe(47);
    expect(initial.orbitalStation.status).toBe("locked");
    const produced = {
      ...initial,
      totalProduced: { ...initial.totalProduced, universe_matrix: 1 },
    };
    expect(synchronizeOrbitalStationEligibility(produced).orbitalStation.status).toBe("eligible");
    expect(createSpeedrunInitialState().orbitalStation.status).toBe("locked");
  });

  it("keeps all deprecated station state isolated when v46 saves migrate", () => {
    const legacy: any = createInitialState();
    legacy.version = 46;
    delete legacy.orbitalStation;
    legacy.totalProduced.universe_matrix = 9;
    legacy.systemSpaceStations.helios = {
      systemId: "helios",
      status: "not-started",
      costRevision: 1,
      costMultiplierBasisPoints: 10_000,
      phaseIndex: 0,
      delivered: { frame_material: "123" },
      constructionBuffer: { quantum_chip: "456" },
      inventory: { processor: "789" },
      itemPolicies: {},
      modules: { backbone: 0, energy: 0, interstellar: 0 },
      routingCursors: {},
      viewport: { x: 17, y: 29, zoom: 0.7 },
      decorations: [],
    };
    const migrated = migrateGame(legacy);
    expect(migrated?.version).toBe(47);
    expect(migrated?.orbitalStation.status).toBe("eligible");
    expect(migrated?.orbitalStation.economy.orbitalMarks).toBe("0");
    expect(migrated?.systemSpaceStations.helios?.delivered.frame_material).toBe("123");
    expect(migrated?.systemSpaceStations.helios?.constructionBuffer.quantum_chip).toBe("456");
    expect(migrated?.systemSpaceStations.helios?.inventory.processor).toBe("789");
  });

  it("repairs duplicate v47 cargo terminals without losing buffered cargo or the building", () => {
    let state = createInitialState();
    state.totalProduced.universe_matrix = 1;
    state.orbitalStation.status = "eligible";
    state.construction.orbital_cargo_terminal = 2;
    state = placeBuilding(state, "orbital_cargo_terminal", { x: 300, y: 0 });
    const terminal = state.entities.find((entity) => entity.buildingId === "orbital_cargo_terminal")!;
    terminal.inputs.processor = 5;
    terminal.orbitalCargoPortItems = ["processor", null, null, null];
    terminal.orbitalCargoTotalUploaded = "3";
    state.entities.push({
      ...structuredClone(terminal),
      id: "duplicate_terminal",
      inputs: { processor: 7, titanium_alloy: 11 },
      orbitalCargoPortItems: ["titanium_alloy", null, null, null],
      orbitalCargoTotalUploaded: "9",
    });
    const migrated = migrateGame(JSON.parse(JSON.stringify(state)))!;
    const terminals = migrated.entities.filter((entity) => entity.buildingId === "orbital_cargo_terminal");
    expect(terminals).toHaveLength(1);
    expect(terminals[0].inputs).toMatchObject({ processor: 12, titanium_alloy: 11 });
    expect(terminals[0].orbitalCargoPortItems).toEqual(["titanium_alloy", "processor", null, null]);
    expect(terminals[0].orbitalCargoTotalUploaded).toBe("12");
    expect(migrated.construction.orbital_cargo_terminal).toBe(2);
  });

  it("round-trips the v47 namespace and fails closed on malformed terminal persistence", () => {
    let state = createInitialState();
    state.totalProduced.universe_matrix = 1;
    state.orbitalStation.status = "core-building";
    state.orbitalStation.economy.orbitalMarks = "12345678901234567890";
    state.orbitalStation.profile.title = "白糖轨道港";
    state.orbitalStation.viewport = { x: 123, y: -456, zoom: 1.25 };
    state.construction.orbital_cargo_terminal = 1;
    state = placeBuilding(state, "orbital_cargo_terminal", { x: 300, y: 0 });
    const terminal = state.entities.find((entity) => entity.buildingId === "orbital_cargo_terminal")!;
    terminal.orbitalCargoBinding = { kind: "construction" };
    terminal.orbitalCargoPortItems = ["processor", null, null, null];
    terminal.orbitalCargoProgress = 0.75;
    terminal.orbitalCargoTotalUploaded = "99";
    const loaded = importGame(exportGame(state))!;
    expect(loaded.orbitalStation.economy.orbitalMarks).toBe("12345678901234567890");
    expect(loaded.orbitalStation.profile.title).toBe("白糖轨道港");
    expect(loaded.orbitalStation.viewport).toEqual({ x: 123, y: -456, zoom: 1.25 });
    expect(loaded.entities.find((entity) => entity.id === terminal.id)).toMatchObject({
      orbitalCargoBinding: { kind: "construction" },
      orbitalCargoPortItems: ["processor", null, null, null],
      orbitalCargoProgress: 0.75,
      orbitalCargoTotalUploaded: "99",
    });
    terminal.orbitalCargoPortItems = ["processor"];
    expect(() => exportGame(state)).toThrow(/four stable ports/i);
  });

  it("advances the three immutable construction snapshots without over-delivery", () => {
    const station = createOrbitalStationState({ universeMatrixProduced: 1, nowMs: 0 });
    const next = cloneOrbitalStationState(startOrbitalStationConstruction(station));
    for (const cost of getOrbitalStationActiveStage(next)!.costs) {
      expect(deliverOrbitalStationConstructionMutable(next, cost.itemId, BigInt(cost.amount) + 999n)).toBe(cost.amount);
    }
    expect(next.status).toBe("dock-building");
    const dock = getOrbitalStationActiveStage(next)!;
    for (const cost of dock.costs) deliverOrbitalStationConstructionMutable(next, cost.itemId, BigInt(cost.amount));
    expect(next.status).toBe("dock-building");
    const game = createInitialState();
    game.totalProduced.universe_matrix = 1;
    game.orbitalStation = next;
    game.portableFleet.logistics_vessel = 250;
    const fleet = deliverOrbitalStationFleet(game, "logistics_vessel", 250);
    expect(fleet.portableFleet.logistics_vessel).toBe(50);
    expect(fleet.orbitalStation.status).toBe("showcase-building");
    const showcase = getOrbitalStationActiveStage(fleet.orbitalStation)!;
    const finished = cloneOrbitalStationState(fleet.orbitalStation);
    for (const cost of showcase.costs) deliverOrbitalStationConstructionMutable(finished, cost.itemId, BigInt(cost.amount));
    expect(finished.status).toBe("operational");
  });

  it("manually delivers only the minimum of request, quantum inventory and target remainder", () => {
    const state = createInitialState();
    state.totalProduced.universe_matrix = 1;
    state.orbitalStation = startOrbitalStationConstruction(createOrbitalStationState({ universeMatrixProduced: 1, nowMs: 0 }));
    const stage = getOrbitalStationActiveStage(state.orbitalStation)!;
    stage.costs = [{ itemId: "titanium_alloy", amount: "100" }];
    state.quantumLogisticsNetwork.enabled = true;
    state.quantumLogisticsNetwork.inventory.titanium_alloy = "150";
    const result = deliverOrbitalQuantumInventory(state, { kind: "construction" }, "titanium_alloy", "999");
    expect(result.accepted).toBe("100");
    expect(result.state.quantumLogisticsNetwork.inventory.titanium_alloy).toBe("50");
    expect(result.state.orbitalStation.construction.stageRequirements[0].delivered.titanium_alloy).toBe("100");
    expect(deliverOrbitalQuantumInventory(result.state, { kind: "construction" }, "titanium_alloy", "1").state).toBe(result.state);
  });

  it("atomically uses quantum inventory for an ordinary source-restricted contract", () => {
    const state = createInitialState();
    state.orbitalStation.status = "operational";
    state.orbitalStation.contractBoard.accepted = [{
      id: "ordinary-origin-contract",
      templateId: "origin",
      slot: 0,
      title: "原产处理器订单",
      summary: "来源终端或量子库存均可完成",
      taskDay: state.orbitalStation.contractBoard.taskDay,
      expiresAtTaskDay: state.orbitalStation.contractBoard.taskDay + 3,
      special: false,
      difficulty: "P1",
      status: "accepted",
      requirements: [{ itemId: "processor", amount: "100", delivered: "0", sourcePlanetIds: ["home"], channel: "terminal", weight: 3 }],
      rewards: { baseMarks: "10", baseReputation: "10", completionMarks: "5", completionReputation: "5" },
    }];
    state.quantumLogisticsNetwork.enabled = true;
    state.quantumLogisticsNetwork.inventory.processor = "150";

    const target = { kind: "contract", contractId: "ordinary-origin-contract" } as const;
    expect(previewOrbitalQuantumDelivery(state, target, "processor", "999")).toMatchObject({
      accepted: "100",
      inventory: "150",
      remaining: "100",
      reason: "delivered",
    });
    const delivered = deliverOrbitalQuantumInventory(state, target, "processor", "999");
    expect(delivered).toMatchObject({ accepted: "100", reason: "delivered" });
    expect(delivered.state.quantumLogisticsNetwork.inventory.processor).toBe("50");
    expect(delivered.state.orbitalStation.contractBoard.accepted[0]).toMatchObject({
      status: "claimable",
      requirements: [{ delivered: "100" }],
    });
    expect(state.quantumLogisticsNetwork.inventory.processor).toBe("150");
    expect(state.orbitalStation.contractBoard.accepted[0].requirements[0].delivered).toBe("0");
  });

  it("rejects invalid quantum delivery without mutation and still allows explicit delivery while paused", () => {
    const state = createInitialState();
    state.totalProduced.universe_matrix = 1;
    state.orbitalStation = startOrbitalStationConstruction(createOrbitalStationState({ universeMatrixProduced: 1, nowMs: 0 }));
    state.quantumLogisticsNetwork.inventory.processor = "25";
    expect(previewOrbitalQuantumDelivery(state, { kind: "construction" }, "processor", "1").reason).toBe("network-disabled");
    state.quantumLogisticsNetwork.enabled = true;
    expect(previewOrbitalQuantumDelivery(state, { kind: "construction" }, "processor", "0").reason).toBe("invalid-amount");
    expect(previewOrbitalQuantumDelivery(state, { kind: "construction" }, "processor", "1.5").reason).toBe("invalid-amount");
    expect(deliverOrbitalQuantumInventory(state, { kind: "contract", contractId: "missing" }, "processor", "1").state).toBe(state);
    state.paused = true;
    const delivered = deliverOrbitalQuantumInventory(state, { kind: "construction" }, "processor", "10");
    expect(delivered.accepted).toBe("10");
    expect(delivered.state.paused).toBe(true);
    expect(delivered.state.quantumLogisticsNetwork.inventory.processor).toBe("15");
  });

  it("removes forged featured achievements when the save is loaded", () => {
    const state = createInitialState();
    state.totalProduced.universe_matrix = 1;
    state.orbitalStation.layout.featuredAchievementIds = ["first_manual_mine", "six_matrix_mastery"];
    state.achievements.unlockedIds = ["first_manual_mine"];
    const loaded = importGame(exportGame(state))!;
    expect(loaded.orbitalStation.layout.featuredAchievementIds).toEqual(["first_manual_mine"]);
  });

  it("normalizes invalid extension data without leaking it into speedrun mode", () => {
    const source = createOrbitalStationState({ universeMatrixProduced: 1, nowMs: 0 });
    source.economy.orbitalMarks = "00042";
    source.viewport.zoom = 99;
    source.construction.stageRequirements[0].costs[0].amount = "1";
    source.profile.featuredMetricKeys = [
      "total-generation", "peak-throughput", "dyson-power", "explored-systems", "colonized-planets",
    ];
    source.layout.placements.push({ id: "pack_decor_1", decorationId: "pack_banner", x: -500, y: -300, rotation: 0, layer: 1, variant: 0 });
    const normalized = normalizeOrbitalStationState(source, { mode: "normal", universeMatrixProduced: 1, nowMs: 0 });
    expect(normalized.economy.orbitalMarks).toBe("42");
    expect(normalized.viewport.zoom).toBe(2.5);
    expect(normalized.construction.stageRequirements[0].costs[0].amount).toBe("200000");
    expect(normalized.layout.placements).toEqual([expect.objectContaining({ decorationId: "pack_banner" })]);
    expect(normalized.profile.featuredMetricKeys).toHaveLength(4);
    const speedrun = normalizeOrbitalStationState(source, { mode: "speedrun", universeMatrixProduced: 999, nowMs: 0 });
    expect(speedrun.status).toBe("locked");
    expect(speedrun.economy.orbitalMarks).toBe("0");
  });

  it("does not trust an advanced status when its immutable construction stages are incomplete", () => {
    const source = createOrbitalStationState({ universeMatrixProduced: 1, nowMs: 0 });
    source.status = "operational";
    const normalized = normalizeOrbitalStationState(source, { mode: "normal", universeMatrixProduced: 1, nowMs: 0 });
    expect(normalized.status).toBe("core-building");
  });
});
