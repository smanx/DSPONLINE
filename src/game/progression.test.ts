import { describe, expect, it } from "vitest";
import { createInitialState, placeBuilding, setActivePlanet } from "./engine";
import { ACHIEVEMENTS, getNewAchievementIds, unlockAchievements } from "./progression";

describe("achievement progression", () => {
  it("unlocks completed milestones once and preserves their order", () => {
    const state = createInitialState();
    state.manualMined = 1;
    state.belts.push({
      id: "belt_test",
      planetId: "home",
      source: "vein_iron",
      target: "vein_copper",
      itemId: "iron_ore",
      lanes: 1,
      tier: 1,
      sorterTier: 1,
      progress: 0,
      priority: 0,
      lastFlow: 0,
    });

    const first = unlockAchievements(state);
    expect(first.unlockedIds).toEqual(["first_manual_mine", "first_logistics_line"]);
    expect(first.state.achievements.unlockedIds).toEqual(first.unlockedIds);
    expect(unlockAchievements(first.state)).toEqual({ state: first.state, unlockedIds: [] });
  });

  it("tracks all six matrices and late Dyson milestones", () => {
    const state = createInitialState();
    for (const itemId of ["electromagnetic_matrix", "energy_matrix", "structure_matrix", "information_matrix", "gravity_matrix", "universe_matrix"] as const) {
      state.totalProduced[itemId] = 1;
    }
    state.dysonSwarm.totalLaunched = 4;
    state.dysonSphere.structurePoints = 2;

    expect(getNewAchievementIds(state)).toEqual(expect.arrayContaining([
      "electromagnetic_matrix_online",
      "energy_matrix_online",
      "six_matrix_mastery",
      "dyson_swarm_online",
      "permanent_dyson_structure",
    ]));
  });

  it("recognizes industry deployed across two star systems", () => {
    let state = createInitialState();
    state = placeBuilding(state, "wind_turbine", { x: 0, y: 0 });
    state.exploration.unlockedSystemIds.push("borealis");
    state = setActivePlanet(state, "frost");
    state = placeBuilding(state, "wind_turbine", { x: 0, y: 0 });

    expect(getNewAchievementIds(state)).toContain("multi_system_industry");
    expect(ACHIEVEMENTS).toHaveLength(13);
  });
});
