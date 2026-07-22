import { describe, expect, it } from "vitest";
import {
  createGalaxyState,
  createVeinReserve,
  getPlanetSolarPowerMultiplier,
  getRecommendedPlanetRole,
  getSystemDistanceLy,
  isInfiniteResource,
  normalizeGalaxyState,
  specializationApplies,
} from "./galaxy";
import { PLANET_LIST, STAR_SYSTEM_LIST } from "./content";
import { PLANET_TEMPLATES, STAR_CLASS_TEMPLATES } from "./galaxyCatalog";

describe("planet industrial profiles", () => {
  it("derives deterministic profiles and finite reserves from the persisted seed", () => {
    const first = createGalaxyState(73_041);
    const second = createGalaxyState(73_041);
    expect(second).toEqual(first);
    expect(STAR_SYSTEM_LIST).toHaveLength(8);
    expect(PLANET_LIST).toHaveLength(22);
    expect(Object.keys(PLANET_TEMPLATES)).toHaveLength(16);
    expect(Object.keys(STAR_CLASS_TEMPLATES)).toHaveLength(8);
    expect(new Set(Object.values(first.profiles).map((profile) => profile.templateId)).size).toBeGreaterThanOrEqual(12);
    expect(Object.values(createGalaxyState(73_042).profiles).map((profile) => profile.templateId))
      .not.toEqual(Object.values(first.profiles).map((profile) => profile.templateId));
    expect(createGalaxyState(73_042).profiles.home.reserveScale).not.toBe(first.profiles.home.reserveScale);
    expect(createVeinReserve(first, "ashen", "iron_ore", "shared_iron"))
      .toBe(createVeinReserve(second, "ashen", "iron_ore", "shared_iron"));
    expect(createVeinReserve(first, "ashen", "iron_ore", "shared_iron"))
      .toBeGreaterThan(createVeinReserve(first, "magnetar", "iron_ore", "shared_iron"));
  });

  it("makes oceans, tidal locking, stellar luminosity and two-dimensional distance mechanical", () => {
    const galaxy = createGalaxyState(240_721, true);
    expect(isInfiniteResource("water", "home", "finite", galaxy)).toBe(true);
    expect(isInfiniteResource("water", "frost", "finite", galaxy)).toBe(false);
    expect(isInfiniteResource("sulfuric_acid", "ashen", "finite", galaxy)).toBe(true);
    expect(getPlanetSolarPowerMultiplier({ galaxy }, "home")).toBe(1);
    expect(getPlanetSolarPowerMultiplier({ galaxy }, "frost")).toBe(0.5);
    expect(getPlanetSolarPowerMultiplier({ galaxy }, "magnetar")).toBe(0.19);
    expect(getSystemDistanceLy({ galaxy }, "aurora", "white_dwarf"))
      .toBe(getSystemDistanceLy({ galaxy }, "white_dwarf", "aurora"));
    expect(getSystemDistanceLy({ galaxy }, "aurora", "white_dwarf")).toBeGreaterThan(0);
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
