import { describe, expect, it } from "vitest";
import { createInitialState } from "./engine";
import { getNextOfflineCriticalEvent } from "./offlineCriticalEvents";

describe("offline critical event scheduling", () => {
  it("returns the nearest route arrival without changing the state", () => {
    const state = createInitialState();
    const demand = state.entities[0];
    if (!demand) throw new Error("fixture entity missing");
    demand.stationRoutes = [{
      id: "offline-route",
      slotIndex: 0,
      peerId: "source",
      itemId: "iron_ore",
      scope: "local",
      cargo: 1,
      vehicleCount: 1,
      progress: 0.75,
      duration: 8,
      requiresWarp: false,
    }];
    const before = JSON.stringify(state);
    expect(getNextOfflineCriticalEvent(state, 256)).toEqual({ kind: "route-arrival", seconds: 2 });
    expect(JSON.stringify(state)).toBe(before);
  });

  it("falls back to the normal window when no event is provable", () => {
    expect(getNextOfflineCriticalEvent(createInitialState(), 900, 256)).toBeNull();
  });
});
