import { describe, expect, it } from "vitest";
import { createPlayerInitialState } from "./engine";
import { exportGame, migrateGame } from "./storage";

describe("quantum GameState migration", () => {
  it("migrates v42 with an empty disabled network and keeps legacy station data", () => {
    const state = createPlayerInitialState();
    (state as { version: number }).version = 42;
    delete (state as Partial<typeof state>).quantumLogisticsNetwork;
    const migrated = migrateGame(JSON.parse(JSON.stringify(state)));
    expect(migrated?.version).toBe(46);
    expect(migrated?.quantumLogisticsNetwork).toEqual({
      enabled: false,
      inventory: {},
      itemCapacities: {},
      routingCursors: {},
      uploadRoutingCursors: {},
    });
    expect(migrated?.entities.every((entity) => entity.buildingId !== "interstellar_logistics_station" || entity.quantumMode === "legacy")).toBe(true);
  });

  it("migrates v44 towers while leaving collectors in traditional mode", () => {
    const state = createPlayerInitialState();
    (state as { version: number }).version = 44;
    state.quantumLogisticsNetwork = {
      enabled: true,
      inventory: { hydrogen: "123" },
      routingCursors: { hydrogen: 2 },
    } as typeof state.quantumLogisticsNetwork;
    state.entities.push({
      id: "legacy-v44-collector", kind: "station", planetId: "giant", position: { x: 0, y: 0 }, interactionLocked: false,
      buildingId: "orbital_collector", quantumMode: "quantum", storedItemId: "hydrogen", stationRoutes: [],
      inputs: {}, outputs: { hydrogen: 77 }, progress: 0, utilization: 0, productionRate: 0,
      routingCursor: 0, machineCount: 3, minerCount: 0,
    });
    const migrated = migrateGame(JSON.parse(JSON.stringify(state)))!;
    expect(migrated.version).toBe(46);
    expect(migrated.quantumLogisticsNetwork).toMatchObject({
      enabled: true,
      inventory: { hydrogen: "123" },
      itemCapacities: {},
      routingCursors: { hydrogen: 2 },
      uploadRoutingCursors: {},
    });
    const collector = migrated.entities.find((entity) => entity.id === "legacy-v44-collector")!;
    expect(collector.quantumMode).toBe("legacy");
    expect(collector.outputs.hydrogen).toBe(77);
  });

  it("keeps runtime flow diagnostics out of exported saves", () => {
    const state = createPlayerInitialState();
    state.quantumLogisticsNetwork.runtimeFlow = {
      boundarySecond: 5,
      uploaded: { hydrogen: "33" },
      downloaded: {},
      globalUploadPerMinute: 400,
      globalDownloadPerMinute: 400,
      quantumTowerStacks: 1,
      quantumCollectorStacks: 5,
    };
    const envelope = JSON.parse(exportGame(state));
    expect(envelope.state.quantumLogisticsNetwork.runtimeFlow).toBeUndefined();
  });

  it("rejects an experimental v43 space-station save instead of merging its assets", () => {
    const state = createPlayerInitialState();
    (state as { version: number }).version = 43;
    state.systemSpaceStations.helios!.status = "building";
    expect(migrateGame(JSON.parse(JSON.stringify(state)))).toBeNull();
  });
});
