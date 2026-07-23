import { describe, expect, it } from "vitest";
import { createInitialState, discardPlanetTrayItems } from "./engine";

describe("planet tray management", () => {
  it("discards exact preview requests and floors half quantities", () => {
    const state = createInitialState();
    state.tray = { iron_ore: 1, copper_ore: 2, stone: 3 };
    state.planetTrays.home = state.tray;
    const next = discardPlanetTrayItems(state, "home", [
      { itemId: "iron_ore", amount: 0 },
      { itemId: "copper_ore", amount: Math.floor(2 / 2) },
      { itemId: "stone", amount: Math.floor(3 / 2) },
    ]);
    expect(next.tray).toEqual({ iron_ore: 1, copper_ore: 1, stone: 2 });
    expect(next.planetTrays.home).toEqual(next.tray);
  });

  it("clamps against current stock while leaving unrelated game data unchanged", () => {
    const state = createInitialState();
    state.planetTrays.ashen = { iron_ingot: 4, hydrogen: 7 };
    state.cargo = { itemId: "iron_ingot", amount: 99 };
    state.construction.arc_smelter = 12;
    state.portableFleet.logistics_drone = 8;
    const entities = state.entities;
    const belts = state.belts;
    const next = discardPlanetTrayItems(state, "ashen", [{ itemId: "iron_ingot", amount: 999 }]);
    expect(next.planetTrays.ashen).toEqual({ hydrogen: 7 });
    expect(next.tray).toBe(state.tray);
    expect(next.cargo).toBe(state.cargo);
    expect(next.construction).toBe(state.construction);
    expect(next.portableFleet).toBe(state.portableFleet);
    expect(next.entities).toBe(entities);
    expect(next.belts).toBe(belts);
  });

  it("returns the same state for empty or ineffective requests", () => {
    const state = createInitialState();
    expect(discardPlanetTrayItems(state, "home", [])).toBe(state);
    expect(discardPlanetTrayItems(state, "home", [{ itemId: "hydrogen", amount: 5 }])).toBe(state);
  });
});
