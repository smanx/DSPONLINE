import { describe, expect, it } from "vitest";
import {
  clearOrbitalCargoPort,
  connectBelt,
  createBlueprint,
  createInitialState,
  createSimulationLookupContext,
  getBlueprintPlacementPreview,
  getOrbitalCargoPortClearCheck,
  pickFromEntityInput,
  placeBuilding,
  removeEntity,
} from "./engine";
import { cloneOrbitalStationState } from "./orbitalStation";
import {
  getOrbitalCargoPortItems,
  orbitalCargoTerminalAccepts,
  reconcileOrbitalCargoTerminalBindings,
  resolveOrbitalCargoPortIndex,
  setOrbitalCargoTerminalBinding,
  settleOrbitalCargoTerminals,
} from "./stationCargoTerminal";
import type { GameState, ItemId } from "./types";

function eligibleState(): GameState {
  const state = createInitialState();
  state.totalProduced.universe_matrix = 1;
  state.orbitalStation.status = "eligible";
  state.construction.orbital_cargo_terminal = 4;
  return state;
}

function placeTerminal(state: GameState): GameState {
  return placeBuilding(state, "orbital_cargo_terminal", { x: 300, y: 0 });
}

describe("orbital cargo terminal", () => {
  it("indexes only placed terminals so empty unlocked saves have no per-step endpoint scan", () => {
    const empty = eligibleState();
    expect(createSimulationLookupContext(empty).orbitalCargoTerminals).toEqual([]);
    const placed = placeTerminal(empty);
    expect(createSimulationLookupContext(placed).orbitalCargoTerminals.map((entity) => entity.buildingId))
      .toEqual(["orbital_cargo_terminal"]);
  });

  it("allows exactly one unstacked terminal per colonized planet", () => {
    const state = eligibleState();
    const first = placeTerminal(state);
    const terminal = first.entities.find((entity) => entity.buildingId === "orbital_cargo_terminal")!;
    expect(terminal.machineCount).toBe(1);
    expect(first.construction.orbital_cargo_terminal).toBe(3);
    expect(placeTerminal(first)).toBe(first);
  });

  it("uploads only target remainder and retains terminal tail cargo", () => {
    let state = placeTerminal(eligibleState());
    const terminal = state.entities.find((entity) => entity.buildingId === "orbital_cargo_terminal")!;
    state = setOrbitalCargoTerminalBinding(state, terminal.id, { kind: "construction" });
    const target = state.entities.find((entity) => entity.id === terminal.id)!;
    state.orbitalStation = cloneOrbitalStationState(state.orbitalStation);
    state.orbitalStation.status = "core-building";
    state.orbitalStation.construction.stageRequirements[0].costs = [{ itemId: "titanium_alloy", amount: "100" }];
    target.orbitalCargoPortItems = ["titanium_alloy", null, null, null];
    target.inputs.titanium_alloy = 250;
    target.powerFactor = 1;
    settleOrbitalCargoTerminals(state, 1);
    expect(target.inputs.titanium_alloy).toBe(150);
    expect(state.orbitalStation.construction.stageRequirements[0].delivered.titanium_alloy).toBe("100");
    expect(target.orbitalCargoTotalUploaded).toBe("100");
    settleOrbitalCargoTerminals(state, 60);
    expect(target.inputs.titanium_alloy).toBe(150);
  });

  it("stops at zero power and preserves fractional low-power progress", () => {
    let state = placeTerminal(eligibleState());
    const id = state.entities.find((entity) => entity.buildingId === "orbital_cargo_terminal")!.id;
    state = setOrbitalCargoTerminalBinding(state, id, { kind: "construction" });
    state.orbitalStation.status = "core-building";
    state.orbitalStation.construction.stageRequirements[0].costs = [{ itemId: "processor", amount: "1000" }];
    const terminal = state.entities.find((entity) => entity.id === id)!;
    terminal.orbitalCargoPortItems = ["processor", null, null, null];
    terminal.inputs.processor = 1000;
    terminal.powerFactor = 0;
    settleOrbitalCargoTerminals(state, 5);
    expect(terminal.inputs.processor).toBe(1000);
    terminal.powerFactor = 0.001;
    settleOrbitalCargoTerminals(state, 1);
    expect(terminal.inputs.processor).toBe(1000);
    expect(terminal.orbitalCargoProgress).toBeGreaterThan(0);
    const fractionalProgress = terminal.orbitalCargoProgress;
    terminal.powerFactor = 0;
    settleOrbitalCargoTerminals(state, 1);
    expect(terminal.orbitalCargoProgress).toBe(fractionalProgress);
    terminal.powerFactor = 0.001;
    settleOrbitalCargoTerminals(state, 3);
    expect(terminal.inputs.processor).toBe(999);
  });

  it("settles a multi-input budget identically across one-second and five-second segments", () => {
    let state = placeTerminal(eligibleState());
    const terminal = state.entities.find((entity) => entity.buildingId === "orbital_cargo_terminal")!;
    state = setOrbitalCargoTerminalBinding(state, terminal.id, { kind: "construction" });
    state.orbitalStation.status = "core-building";
    state.orbitalStation.construction.stageRequirements[0].costs = [
      { itemId: "processor", amount: "10000" },
      { itemId: "titanium_alloy", amount: "10000" },
    ];
    const prepared = state.entities.find((entity) => entity.id === terminal.id)!;
    prepared.orbitalCargoPortItems = ["processor", "titanium_alloy", null, null];
    prepared.inputs.processor = 10_000;
    prepared.inputs.titanium_alloy = 10_000;
    prepared.powerFactor = 1;
    const batched = structuredClone(state);
    const segmented = structuredClone(state);
    settleOrbitalCargoTerminals(batched, 5);
    for (let second = 0; second < 5; second += 1) settleOrbitalCargoTerminals(segmented, 1);
    const batchTerminal = batched.entities.find((entity) => entity.id === terminal.id)!;
    const segmentedTerminal = segmented.entities.find((entity) => entity.id === terminal.id)!;
    expect(segmented.orbitalStation.construction.stageRequirements[0].delivered)
      .toEqual(batched.orbitalStation.construction.stageRequirements[0].delivered);
    expect(segmentedTerminal.inputs).toEqual(batchTerminal.inputs);
    expect(segmentedTerminal.routingCursor).toBe(batchTerminal.routingCursor);
    expect(segmentedTerminal.orbitalCargoProgress).toBeCloseTo(batchTerminal.orbitalCargoProgress ?? 0, 10);
    expect(segmentedTerminal.orbitalCargoTotalUploaded).toBe(batchTerminal.orbitalCargoTotalUploaded);
  });

  it("supports four stable belt input ports", () => {
    let state = placeTerminal(eligibleState());
    const terminal = state.entities.find((entity) => entity.buildingId === "orbital_cargo_terminal")!;
    state = setOrbitalCargoTerminalBinding(state, terminal.id, { kind: "construction" });
    state.orbitalStation.status = "core-building";
    const items: ItemId[] = ["titanium_alloy", "frame_material", "processor", "universe_matrix"];
    state.orbitalStation.construction.stageRequirements[0].costs = items.map((itemId) => ({ itemId, amount: "1000" }));
    state.construction.storage_mk1 = 4;
    state.construction.conveyor_belt_mk1 = 4;
    const sourceIds: string[] = [];
    for (const [index, itemId] of items.entries()) {
      state = placeBuilding(state, "storage_mk1", { x: -400, y: index * 120 });
      const source = state.entities.filter((entity) => entity.buildingId === "storage_mk1").at(-1)!;
      source.storedItemId = itemId;
      source.outputs[itemId] = 100;
      sourceIds.push(source.id);
    }
    for (const [index, itemId] of items.entries()) state = connectBelt(state, sourceIds[index], terminal.id, itemId, 1, index as 0 | 1 | 2 | 3);
    expect(state.belts.map((belt) => belt.targetPortIndex).sort()).toEqual([0, 1, 2, 3]);
    expect(getOrbitalCargoPortItems(state.entities.find((entity) => entity.id === terminal.id)!)).toEqual(items);
  });

  it("requires confirmation before safely releasing a used port and returns its local cargo and belt", () => {
    let state = placeTerminal(eligibleState());
    const terminalId = state.entities.find((entity) => entity.buildingId === "orbital_cargo_terminal")!.id;
    state = setOrbitalCargoTerminalBinding(state, terminalId, { kind: "construction" });
    state.orbitalStation.status = "core-building";
    state.orbitalStation.construction.stageRequirements[0].costs = [{ itemId: "processor", amount: "1000" }];
    state.construction.storage_mk1 = 1;
    state.construction.conveyor_belt_mk1 = 1;
    state = placeBuilding(state, "storage_mk1", { x: -400, y: 0 });
    const source = state.entities.find((entity) => entity.buildingId === "storage_mk1")!;
    source.storedItemId = "processor";
    source.outputs.processor = 100;
    state = connectBelt(state, source.id, terminalId, "processor", 1, 0);
    state.entities.find((entity) => entity.id === terminalId)!.inputs.processor = 75;

    expect(getOrbitalCargoPortClearCheck(state, terminalId, 0)).toMatchObject({
      ok: true,
      requiresConfirmation: true,
      connectedBelts: 1,
      bufferedItems: 75,
      itemId: "processor",
    });
    expect(clearOrbitalCargoPort(state, terminalId, 0)).toBe(state);

    const cleared = clearOrbitalCargoPort(state, terminalId, 0, true);
    const clearedTerminal = cleared.entities.find((entity) => entity.id === terminalId)!;
    expect(getOrbitalCargoPortItems(clearedTerminal)).toEqual([null, null, null, null]);
    expect(clearedTerminal.inputs.processor).toBeUndefined();
    expect(cleared.belts.some((belt) => belt.target === terminalId && belt.targetPortIndex === 0)).toBe(false);
    expect(cleared.construction.conveyor_belt_mk1).toBe(1);
    expect(cleared.tray.processor).toBe(75);
    expect(resolveOrbitalCargoPortIndex(cleared, clearedTerminal, "processor", 0)).toBe(0);
  });

  it("resets blueprint binding, applies uniqueness and safely returns buffered cargo on removal", () => {
    let state = placeTerminal(eligibleState());
    const terminal = state.entities.find((entity) => entity.buildingId === "orbital_cargo_terminal")!;
    state = setOrbitalCargoTerminalBinding(state, terminal.id, { kind: "construction" });
    state.entities.find((entity) => entity.id === terminal.id)!.inputs.processor = 75;
    state = createBlueprint(state, [terminal.id], "货运终端");
    const blueprint = state.blueprints.at(-1)!;
    expect(blueprint.entities[0].orbitalCargoPortItems).toEqual([null, null, null, null]);
    expect(getBlueprintPlacementPreview(state, blueprint.id, { x: 700, y: 0 }).canPlace).toBe(false);
    const removed = removeEntity(state, terminal.id);
    expect(removed.tray.processor).toBe(75);
    expect(removed.construction.orbital_cargo_terminal).toBe(4);
  });

  it("clears completed or missing targets without deleting buffered player cargo", () => {
    let state = placeTerminal(eligibleState());
    const terminal = state.entities.find((entity) => entity.buildingId === "orbital_cargo_terminal")!;
    state = setOrbitalCargoTerminalBinding(state, terminal.id, { kind: "construction" });
    state.orbitalStation.status = "operational";
    state.entities.find((entity) => entity.id === terminal.id)!.inputs.processor = 75;
    const reconciled = reconcileOrbitalCargoTerminalBindings(state);
    const reconciledTerminal = reconciled.entities.find((entity) => entity.id === terminal.id)!;
    expect(reconciledTerminal.orbitalCargoBinding).toBeNull();
    expect(reconciledTerminal.inputs.processor).toBe(75);
    expect(reconciled).not.toBe(state);
    expect(reconcileOrbitalCargoTerminalBindings(reconciled)).toBe(reconciled);
  });

  it("does not upload while paused and lets the player retrieve cached input", () => {
    let state = placeTerminal(eligibleState());
    const terminal = state.entities.find((entity) => entity.buildingId === "orbital_cargo_terminal")!;
    state = setOrbitalCargoTerminalBinding(state, terminal.id, { kind: "construction" });
    const current = state.entities.find((entity) => entity.id === terminal.id)!;
    current.orbitalCargoPortItems = ["processor", null, null, null];
    current.inputs.processor = 150;
    current.powerFactor = 1;
    state.paused = true;
    settleOrbitalCargoTerminals(state, 60);
    expect(current.inputs.processor).toBe(150);
    const retrieved = pickFromEntityInput(state, current.id, "processor");
    expect(retrieved.cargo).toMatchObject({ itemId: "processor", amount: 100 });
    expect(retrieved.entities.find((entity) => entity.id === current.id)!.inputs.processor).toBe(50);
  });

  it("keeps existing locked logistics running while rejecting new port configuration", () => {
    let state = placeTerminal(eligibleState());
    const terminal = state.entities.find((entity) => entity.buildingId === "orbital_cargo_terminal")!;
    state = setOrbitalCargoTerminalBinding(state, terminal.id, { kind: "construction" });
    const current = state.entities.find((entity) => entity.id === terminal.id)!;
    current.orbitalCargoPortItems = ["processor", null, null, null];
    current.interactionLocked = true;
    expect(orbitalCargoTerminalAccepts(state, current, "processor", 0)).toBe(true);
    expect(resolveOrbitalCargoPortIndex(state, current, "processor", 0)).toBeUndefined();
  });

  it("keeps sparse four-port routing identical across segmented settlement", () => {
    let state = placeTerminal(eligibleState());
    const terminal = state.entities.find((entity) => entity.buildingId === "orbital_cargo_terminal")!;
    state = setOrbitalCargoTerminalBinding(state, terminal.id, { kind: "construction" });
    state.orbitalStation.status = "core-building";
    state.orbitalStation.construction.stageRequirements[0].costs = [
      { itemId: "processor", amount: "10000" },
      { itemId: "universe_matrix", amount: "10000" },
    ];
    const prepared = state.entities.find((entity) => entity.id === terminal.id)!;
    prepared.orbitalCargoPortItems = [null, "processor", null, "universe_matrix"];
    prepared.inputs.processor = 10_000;
    prepared.inputs.universe_matrix = 10_000;
    prepared.powerFactor = 0.137;
    prepared.routingCursor = 2;
    const batched = structuredClone(state);
    const segmented = structuredClone(state);
    settleOrbitalCargoTerminals(batched, 17);
    for (let second = 0; second < 17; second += 1) settleOrbitalCargoTerminals(segmented, 1);
    expect(segmented.entities.find((entity) => entity.id === terminal.id)?.inputs)
      .toEqual(batched.entities.find((entity) => entity.id === terminal.id)?.inputs);
    expect(segmented.orbitalStation.construction.stageRequirements[0].delivered)
      .toEqual(batched.orbitalStation.construction.stageRequirements[0].delivered);
    expect(segmented.entities.find((entity) => entity.id === terminal.id)?.routingCursor)
      .toBe(batched.entities.find((entity) => entity.id === terminal.id)?.routingCursor);
  });
});
