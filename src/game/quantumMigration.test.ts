import { describe, expect, it } from "vitest";
import { createPlayerInitialState } from "./engine";
import { migrateGame } from "./storage";

describe("quantum GameState migration", () => {
  it("migrates v42 with an empty disabled network and keeps legacy station data", () => {
    const state = createPlayerInitialState();
    (state as { version: number }).version = 42;
    delete (state as Partial<typeof state>).quantumLogisticsNetwork;
    const migrated = migrateGame(JSON.parse(JSON.stringify(state)));
    expect(migrated?.version).toBe(44);
    expect(migrated?.quantumLogisticsNetwork).toEqual({ enabled: false, inventory: {}, routingCursors: {} });
    expect(migrated?.entities.every((entity) => entity.buildingId !== "interstellar_logistics_station" || entity.quantumMode === "legacy")).toBe(true);
  });

  it("rejects an experimental v43 space-station save instead of merging its assets", () => {
    const state = createPlayerInitialState();
    (state as { version: number }).version = 43;
    state.systemSpaceStations.helios!.status = "building";
    expect(migrateGame(JSON.parse(JSON.stringify(state)))).toBeNull();
  });
});
