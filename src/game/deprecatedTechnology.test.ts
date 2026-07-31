import { describe, expect, it } from "vitest";
import { TECHNOLOGY_LIST, getTechnology, isDeprecatedTechnology } from "./content";
import { canQueueTechnology, canSelectTechnology, createPlayerInitialState } from "./engine";

describe("historical space-station technologies", () => {
  it("keeps legacy definitions resolvable while hiding them from new research", () => {
    expect(getTechnology("system_space_station_engineering")).toBeDefined();
    expect(TECHNOLOGY_LIST.some((technology) => technology.id === "system_space_station_engineering")).toBe(false);
    expect(isDeprecatedTechnology("system_space_station_engineering")).toBe(true);
  });

  it("does not let a new queue select a deprecated technology", () => {
    const state = createPlayerInitialState();
    expect(canSelectTechnology(state, "system_space_station_engineering")).toBe(false);
    expect(canQueueTechnology(state, "system_space_station_engineering")).toBe(false);
  });
});
