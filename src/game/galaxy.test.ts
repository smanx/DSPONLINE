import { describe, expect, it } from "vitest";
import {
  createGalaxyState,
  createVeinReserve,
  getRecommendedPlanetRole,
  normalizeGalaxyState,
  specializationApplies,
} from "./galaxy";

describe("planet industrial profiles", () => {
  it("derives deterministic profiles and finite reserves from the persisted seed", () => {
    const first = createGalaxyState(73_041);
    const second = createGalaxyState(73_041);
    expect(second).toEqual(first);
    expect(createGalaxyState(73_042).profiles.home.reserveScale).not.toBe(first.profiles.home.reserveScale);
    expect(createVeinReserve(first, "ashen", "iron_ore", "shared_iron"))
      .toBe(createVeinReserve(second, "ashen", "iron_ore", "shared_iron"));
    expect(createVeinReserve(first, "ashen", "iron_ore", "shared_iron"))
      .toBeGreaterThan(createVeinReserve(first, "magnetar", "iron_ore", "shared_iron"));
  });

  it("restores persisted environment multipliers without first-reload drift", () => {
    const baseline = createGalaxyState(240_721, true);
    baseline.planetRoles.ashen = "smelting";
    expect(normalizeGalaxyState(JSON.parse(JSON.stringify(baseline)))).toEqual(baseline);
  });

  it("maps environmental specializations to concrete planning roles and equipment", () => {
    const galaxy = createGalaxyState(240_721, true);
    expect(getRecommendedPlanetRole({ galaxy }, "ashen")).toBe("smelting");
    expect(getRecommendedPlanetRole({ galaxy }, "frost")).toBe("chemical");
    expect(getRecommendedPlanetRole({ galaxy }, "giant")).toBe("logistics");
    expect(specializationApplies(galaxy.profiles.ashen, "smelter", "arc_smelter")).toBe(true);
    expect(specializationApplies(galaxy.profiles.ashen, "assembler", "assembling_machine_mk1")).toBe(false);
  });
});
