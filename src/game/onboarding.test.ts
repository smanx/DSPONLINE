import { describe, expect, it } from "vitest";
import { connectBelt, createInitialState, placeBuilding, setEntityRecipe } from "./engine";
import { BASIC_ONBOARDING_STEPS, getCurrentBasicOnboardingStep, getCurrentOnboardingStep, getOnboardingFocusTarget, getOnboardingStep, isBasicOnboardingStepComplete, ONBOARDING_STEPS, type BasicOnboardingProgress } from "./onboarding";

describe("progressive onboarding", () => {
  it("requires five successful UI command milestones before the existing progression", () => {
    const progress: BasicOnboardingProgress = { version: 1, completedEvents: [], skipped: false };
    expect(BASIC_ONBOARDING_STEPS).toHaveLength(5);
    expect(getCurrentBasicOnboardingStep(progress)?.id).toBe("basic-cargo");
    progress.completedEvents.push("cargo-stowed", "construction-crafted", "building-placed");
    expect(getCurrentBasicOnboardingStep(progress)?.id).toBe("basic-place-stack");
    expect(isBasicOnboardingStepComplete(progress, BASIC_ONBOARDING_STEPS[2])).toBe(false);
    progress.completedEvents.push("building-stacked", "belt-connected", "research-selected");
    expect(getCurrentBasicOnboardingStep(progress)).toBeNull();
  });

  it("advances from first mining through the white-matrix loop", () => {
    let state = createInitialState();
    expect(ONBOARDING_STEPS).toHaveLength(13);
    expect(getCurrentOnboardingStep(state)?.id).toBe("mine");

    state.manualMined = 1;
    state.entities.find((entity) => entity.id === "vein_iron")!.minerCount = 1;
    state = placeBuilding(state, "arc_smelter", { x: 100, y: 0 });
    const smelter = state.entities.find((entity) => entity.buildingId === "arc_smelter")!;
    state = connectBelt(state, "vein_iron", smelter.id, "iron_ore");
    state.research.selectedTechId = "electromagnetic_matrix";
    expect(getCurrentOnboardingStep(state)?.id).toBe("blue_matrix");

    state.totalProduced.electromagnetic_matrix = 1;
    expect(getCurrentOnboardingStep(state)?.id).toBe("oil_chain");
    state.totalProduced.refined_oil = 1;
    expect(getCurrentOnboardingStep(state)?.id).toBe("oil_chain");
    state.totalProduced.plastic = 1;
    state.totalProduced.energy_matrix = 1;
    expect(getCurrentOnboardingStep(state)?.id).toBe("yellow_matrix");
    state.totalProduced.structure_matrix = 1;
    expect(getCurrentOnboardingStep(state)?.id).toBe("interstellar_logistics");

    state.entities.push({
      id: "onboarding_station",
      kind: "station",
      planetId: "home",
      position: { x: 400, y: 0 },
      interactionLocked: false,
      buildingId: "interstellar_logistics_station",
      machineCount: 1,
      minerCount: 0,
      inputs: {},
      outputs: {},
      progress: 0,
      routingCursor: 0,
      utilization: 0,
      productionRate: 0,
      stationTrips: 1,
    });
    state.dysonSwarm.totalLaunched = 1;
    state.totalProduced.critical_photon = 1;
    state.totalProduced.universe_matrix = 1;
    expect(getCurrentOnboardingStep(state)).toBeNull();
  });

  it("prefers a stalled input line over its downstream machine as the current blocker", () => {
    let state = createInitialState();
    state.research.completedTechIds.push("basic_chemical_engineering");
    state.construction.chemical_plant = 1;
    state = placeBuilding(state, "chemical_plant", { x: 200, y: 0 });
    const plant = state.entities.find((entity) => entity.buildingId === "chemical_plant")!;
    state = setEntityRecipe(state, plant.id, "plastic");
    state.belts.push({
      id: "stalled_refined_oil",
      planetId: "home",
      source: "vein_oil",
      target: plant.id,
      itemId: "refined_oil",
      lanes: 1,
      tier: 1,
      sorterTier: 1,
      progress: 0,
      priority: 0,
      lastFlow: 0,
    });

    const target = getOnboardingFocusTarget(state, getOnboardingStep("oil_chain")!);
    expect(target).toMatchObject({ kind: "belt", id: "stalled_refined_oil", planetId: "home" });
    expect(target?.reason).toContain("精炼油");
  });
});
