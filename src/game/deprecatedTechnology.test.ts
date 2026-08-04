import { describe, expect, it } from "vitest";
import { TECHNOLOGY_LIST, getTechnology, isDeprecatedTechnology } from "./content";
import { canQueueTechnology, canSelectTechnology, createPlayerInitialState } from "./engine";

describe("historical space-station technologies", () => {
  it("keeps legacy definitions resolvable while hiding them from new research", () => {
    const deprecatedIds = [
      "orbital_elevator_engineering",
      "orbital_multi_cargo_bus",
      "orbital_energy_recovery",
      "system_space_station_engineering",
      "orbital_modular_assembly",
      "autonomous_station_construction",
      "unified_system_logistics_protocol",
    ] as const;
    for (const id of deprecatedIds) {
      expect(getTechnology(id)).toBeDefined();
      expect(TECHNOLOGY_LIST.some((technology) => technology.id === id)).toBe(false);
      expect(isDeprecatedTechnology(id)).toBe(true);
    }
  });

  it("does not let a new queue select a deprecated technology", () => {
    const state = createPlayerInitialState();
    for (const id of ["orbital_elevator_engineering", "orbital_multi_cargo_bus", "orbital_energy_recovery", "system_space_station_engineering"] as const) {
      expect(canSelectTechnology(state, id)).toBe(false);
      expect(canQueueTechnology(state, id)).toBe(false);
    }
  });
});
