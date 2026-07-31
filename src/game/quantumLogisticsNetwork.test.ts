import { describe, expect, it } from "vitest";
import {
  addQuantumInteger,
  beginQuantumAttachment,
  compareQuantumInteger,
  createEmptyQuantumLogisticsNetworkState,
  getQuantumLogisticsMultiplier,
  getQuantumTowerBandwidth,
  normalizeQuantumInteger,
  settleQuantumAttachment,
  settleQuantumLogisticsNetwork,
} from "./quantumLogisticsNetwork";
import { advanceSimulation, attachAllInterstellarStationsToQuantumNetwork, createPlayerInitialState } from "./engine";
import type { FactoryEntity, StationSlot } from "./types";

describe("quantum logistics network", () => {
  it("normalizes hostile quantities and keeps exact decimal arithmetic", () => {
    expect(normalizeQuantumInteger("0000012")).toBe("12");
    expect(normalizeQuantumInteger("1e6")).toBe("0");
    expect(normalizeQuantumInteger(-1)).toBe("0");
    expect(addQuantumInteger("9007199254740993", "7")).toBe("9007199254741000");
    expect(compareQuantumInteger("100000000000000000000", "99")).toBe(1);
  });

  it("uses the squared wireless technology multiplier and independent directions", () => {
    expect(getQuantumLogisticsMultiplier(0)).toBe(1);
    expect(getQuantumLogisticsMultiplier(10)).toBe(2.25);
    const bandwidth = getQuantumTowerBandwidth({ buildingId: "interstellar_logistics_station", machineCount: 10, quantumMode: "quantum" }, 232, 0.5);
    expect(bandwidth.uploadPerMinute).toBeCloseTo(317_520, 6);
    expect(bandwidth.uploadPerBoundary).toBe(26_460);
    expect(bandwidth.downloadPerBoundary).toBe(bandwidth.uploadPerBoundary);
  });

  it("settles input before output and preserves inventory exactly", () => {
    const network = { ...createEmptyQuantumLogisticsNetworkState(), enabled: true, inventory: { iron_ore: "10" } };
    const result = settleQuantumLogisticsNetwork(network, [
      { key: "supply-b", stationId: "supply", itemId: "iron_ore", requested: "100" },
    ], [
      { key: "demand-a", stationId: "demand", itemId: "iron_ore", requested: "80", capacity: "80" },
    ], { uploadCapByStation: { supply: 50 }, downloadCapByStation: { demand: 80 } });
    expect(result.inputAccepted["supply-b"]).toBe("50");
    expect(result.outputDelivered["demand-a"]).toBe("60");
    expect(result.state.inventory.iron_ore).toBe("0");
    expect(result.diagnostics.blockedByInventory).toBe("20");
  });

  it("is deterministic when request arrays are reordered and rotates equal requests fairly", () => {
    const network = { ...createEmptyQuantumLogisticsNetworkState(), enabled: true, inventory: { copper_ore: "5" }, routingCursors: { copper_ore: 0 } };
    const outputs = [
      { key: "station-b:0", stationId: "station-b", itemId: "copper_ore" as const, requested: 5, capacity: 5 },
      { key: "station-a:0", stationId: "station-a", itemId: "copper_ore" as const, requested: 5, capacity: 5 },
    ];
    const first = settleQuantumLogisticsNetwork(network, [], outputs);
    const second = settleQuantumLogisticsNetwork(network, [], [...outputs].reverse());
    expect(first.outputDelivered).toEqual(second.outputDelivered);
    expect(Object.values(first.outputDelivered).reduce((sum, value) => sum + Number(value), 0)).toBe(5);
    expect(first.state.routingCursors.copper_ore).toBe(second.state.routingCursors.copper_ore);
  });

  it("requires a completed station upgrade and waits for legacy route tails", () => {
    const base = createPlayerInitialState();
    base.quantumLogisticsNetwork.enabled = true;
    base.entities.push({
      id: "quantum-station",
      kind: "station",
      planetId: "home",
      position: { x: 0, y: 0 },
      interactionLocked: false,
      buildingId: "interstellar_logistics_station",
      stationTier: 2,
      stationRoutes: [{ id: "route-1", slotIndex: 0, peerId: "peer", itemId: "iron_ore", scope: "remote", cargo: 10, vehicleCount: 1, progress: 0, duration: 10, requiresWarp: false }],
      stationSlots: [],
      inputs: {}, outputs: {}, progress: 0, utilization: 0, productionRate: 0,
      routingCursor: 0, machineCount: 1, minerCount: 0,
    });
    const started = beginQuantumAttachment(base, "quantum-station");
    expect(started.changed).toBe(true);
    expect(started.state.entities.find((entity) => entity.id === "quantum-station")?.quantumMode).toBe("transitioning");
    expect(settleQuantumAttachment({ ...started.state, elapsedSeconds: 5 }, "quantum-station").changed).toBe(false);
    const done = settleQuantumAttachment({
      ...started.state,
      elapsedSeconds: 15,
      entities: started.state.entities.map((entity) => entity.id === "quantum-station" ? {
        ...entity,
        stationRoutes: [],
        quantumTransition: entity.quantumTransition ? {
          ...entity.quantumTransition,
          bridges: entity.quantumTransition.bridges.map((bridge) => ({ ...bridge, remainingCargo: "0" })),
        } : null,
      } : entity),
    }, "quantum-station");
    expect(done.changed).toBe(true);
    expect(done.state.entities.find((entity) => entity.id === "quantum-station")?.quantumMode).toBe("quantum");
  });

  it("uses the engine five-second boundary without creating a quantum StationRoute", () => {
    const state = createPlayerInitialState();
    state.quantumLogisticsNetwork.enabled = true;
    const emptySlots = (): StationSlot[] => Array.from({ length: 5 }, () => ({ localMode: "storage", remoteMode: "storage", minimumLoad: 1, minStock: 0, maxStock: 0, priority: 1, routePolicy: "direct", warperBudget: 2 }));
    const station = (id: string, mode: "supply" | "demand"): FactoryEntity => {
      const slots = emptySlots();
      slots[0] = { ...slots[0], itemId: "iron_ore", remoteMode: mode };
      return {
        id, kind: "station", planetId: "home", position: { x: 0, y: 0 }, interactionLocked: false,
        buildingId: "interstellar_logistics_station", stationTier: 2, quantumMode: "quantum", stationSlots: slots, stationRoutes: [],
        inputs: {}, outputs: mode === "supply" ? { iron_ore: 100 } : {}, progress: 0, utilization: 0, productionRate: 0,
        routingCursor: 0, machineCount: 1, minerCount: 0, stationDrones: 0, stationVessels: 0,
      };
    };
    state.entities.push(station("q-supply", "supply"), station("q-demand", "demand"), {
      id: "power", kind: "power", planetId: "home", position: { x: 0, y: 0 }, interactionLocked: false,
      buildingId: "wind_turbine", inputs: {}, outputs: {}, progress: 0, utilization: 0, productionRate: 0,
      routingCursor: 0, machineCount: 20, minerCount: 0,
    });
    const advanced = advanceSimulation(state, 5);
    const supply = advanced.entities.find((entity) => entity.id === "q-supply")!;
    const demand = advanced.entities.find((entity) => entity.id === "q-demand")!;
    expect(supply.stationRoutes).toEqual([]);
    expect(demand.stationRoutes).toEqual([]);
    expect(demand.outputs.iron_ore).toBe(33);
    expect(supply.outputs.iron_ore).toBe(67);
  });

  it("starts all eligible stations in stable order and scopes a batch to one star system", () => {
    const state = createPlayerInitialState();
    state.research.completedTechIds.push("quantum_logistics_network");
    state.entities.push(
      { id: "batch-b", kind: "station", planetId: "home", position: { x: 0, y: 0 }, interactionLocked: false, buildingId: "interstellar_logistics_station", stationTier: 2, quantumMode: "legacy", stationSlots: [], stationRoutes: [], inputs: {}, outputs: {}, progress: 0, utilization: 0, productionRate: 0, routingCursor: 0, machineCount: 1, minerCount: 0 },
      { id: "batch-a", kind: "station", planetId: "home", position: { x: 10, y: 0 }, interactionLocked: false, buildingId: "interstellar_logistics_station", stationTier: 2, quantumMode: "legacy", stationSlots: [], stationRoutes: [], inputs: {}, outputs: {}, progress: 0, utilization: 0, productionRate: 0, routingCursor: 0, machineCount: 1, minerCount: 0 },
      { id: "batch-mk1", kind: "station", planetId: "home", position: { x: 20, y: 0 }, interactionLocked: false, buildingId: "interstellar_logistics_station", stationTier: 1, quantumMode: "legacy", stationSlots: [], stationRoutes: [], inputs: {}, outputs: {}, progress: 0, utilization: 0, productionRate: 0, routingCursor: 0, machineCount: 1, minerCount: 0 },
    );
    const scoped = attachAllInterstellarStationsToQuantumNetwork(state, "helios");
    expect(scoped.startedIds).toEqual(["batch-a", "batch-b"]);
    expect(scoped.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityId: "batch-mk1", blocker: "not-upgraded" }),
    ]));
    expect(scoped.state.entities.find((entity) => entity.id === "batch-a")?.quantumMode).toBe("transitioning");
    const outside = createPlayerInitialState();
    outside.research.completedTechIds.push("quantum_logistics_network");
    outside.entities.push({ id: "outside", kind: "station", planetId: "home", position: { x: 0, y: 0 }, interactionLocked: false, buildingId: "interstellar_logistics_station", stationTier: 2, quantumMode: "legacy", stationSlots: [], stationRoutes: [], inputs: {}, outputs: {}, progress: 0, utilization: 0, productionRate: 0, routingCursor: 0, machineCount: 1, minerCount: 0 });
    expect(attachAllInterstellarStationsToQuantumNetwork(outside, "helios").startedIds).toEqual(["outside"]);
  });
});
