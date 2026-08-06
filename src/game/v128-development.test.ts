import { describe, expect, it } from "vitest";
import { RECIPES, getBuilding, getRecipe, getTechnology } from "./content";
import {
  MAX_BUILDING_STACK_COUNT,
  advanceSimulation,
  createInitialState,
  getAcceptedInputs,
  getEntityOperatingStatus,
  getEntityOutputCapacity,
  getEntityProliferatorPowerMultiplier,
  getEntityProliferatorSpeedMultiplier,
  getEntityStackTargetCheck,
  getSprayCoaterInstallCheck,
  installMiner,
  installSprayCoater,
  isHandcraftableRecipe,
  placeBuilding,
  setEntityRecipe,
  setEntityStackTarget,
  setProliferatorConfiguration,
} from "./engine";
import { auditOriginalNonDarkFogRecipeParity } from "./originalRecipeParity";
import { calculateProductionPlan, createProductionPlan, getProductionRecipeOptions, setProductionPlanRecipe } from "./planning";
import { getConsumingRecipes, getProducingRecipes, getRecipeRates } from "./recipeGraph";
import { calculateFactoryStatistics } from "./statistics";
import type { FactoryEntity, GameState, ItemId } from "./types";

function placePoweredMachine(state: GameState, buildingId: "matrix_lab" | "oil_refinery"): { state: GameState; entityId: string } {
  state.construction.wind_turbine = 20;
  state.construction[buildingId] = 1;
  state = placeBuilding(state, "wind_turbine", { x: 0, y: -220 }, 20);
  state = placeBuilding(state, buildingId, { x: 260, y: 0 });
  return { state, entityId: state.entities.find((entity) => entity.buildingId === buildingId)!.id };
}

function configuredResearchLab(): { state: GameState; entityId: string } {
  let state = createInitialState(128_001);
  state.research.completedTechIds.push("proliferator_1", "information_matrix");
  state.construction.spray_coater = 1;
  const placed = placePoweredMachine(state, "matrix_lab");
  state = setEntityRecipe(placed.state, placed.entityId, "matrix_research");
  state.research.selectedTechId = "research_speed_1";
  const technology = getTechnology("research_speed_1")!;
  state.research.progressByTech.research_speed_1 = Object.fromEntries(
    technology.costs.map((cost) => [cost.itemId, cost.amount - 1]),
  );
  const lab = state.entities.find((entity) => entity.id === placed.entityId)!;
  for (const cost of technology.costs) lab.inputs[cost.itemId] = 1;
  return { state, entityId: placed.entityId };
}

function configuredRefinery(): { state: GameState; entityId: string } {
  let state = createInitialState(128_002);
  state.research.completedTechIds.push("energy_matrix", "xray_cracking", "basic_chemical_engineering", "reforming_refine");
  const placed = placePoweredMachine(state, "oil_refinery");
  state = setEntityRecipe(placed.state, placed.entityId, "reforming_refine");
  return { state, entityId: placed.entityId };
}

describe("1.0.28 building stack targets", () => {
  it("increases and decreases one entity atomically while preserving its runtime data", () => {
    let state = createInitialState(128_010);
    state.construction.arc_smelter = 20;
    state = placeBuilding(state, "arc_smelter", { x: 40, y: 80 });
    const entityId = state.entities.find((entity) => entity.buildingId === "arc_smelter")!.id;
    state = setEntityRecipe(state, entityId, "iron_ingot");
    let entity = state.entities.find((candidate) => candidate.id === entityId)!;
    entity.inputs.iron_ore = 17;
    entity.outputs.iron_ingot = 9;
    entity.progress = 0.625;

    state = setEntityStackTarget(state, entityId, 11);
    entity = state.entities.find((candidate) => candidate.id === entityId)!;
    expect(entity).toMatchObject({ machineCount: 11, recipeId: "iron_ingot", progress: 0.625 });
    expect(entity.inputs.iron_ore).toBe(17);
    expect(entity.outputs.iron_ingot).toBe(9);
    expect(state.construction.arc_smelter).toBe(9);

    state = setEntityStackTarget(state, entityId, 3);
    entity = state.entities.find((candidate) => candidate.id === entityId)!;
    expect(entity).toMatchObject({ machineCount: 3, recipeId: "iron_ingot", progress: 0.625 });
    expect(entity.inputs.iron_ore).toBe(17);
    expect(entity.outputs.iron_ingot).toBe(9);
    expect(state.construction.arc_smelter).toBe(17);
  });

  it("rejects missing stock and locked targets without a partial mutation", () => {
    let state = createInitialState(128_011);
    state.construction.storage_mk1 = 1;
    state = placeBuilding(state, "storage_mk1", { x: 0, y: 0 });
    const entity = state.entities.find((candidate) => candidate.buildingId === "storage_mk1")!;
    const insufficient = getEntityStackTargetCheck(state, entity.id, 3);
    expect(insufficient).toMatchObject({ ok: false, code: "inventory" });
    expect(setEntityStackTarget(state, entity.id, 3)).toBe(state);

    entity.interactionLocked = true;
    expect(getEntityStackTargetCheck(state, entity.id, 1)).toMatchObject({ ok: false, code: "locked" });
    expect(setEntityStackTarget(state, entity.id, 1)).toBe(state);
  });

  it("allows a historical over-limit stack to decrease but never increase", () => {
    let state = createInitialState(128_012);
    state.construction.storage_mk1 = 10;
    state = placeBuilding(state, "storage_mk1", { x: 0, y: 0 });
    const entity = state.entities.find((candidate) => candidate.buildingId === "storage_mk1")!;
    entity.machineCount = MAX_BUILDING_STACK_COUNT + 500;
    expect(getEntityStackTargetCheck(state, entity.id, MAX_BUILDING_STACK_COUNT + 501)).toMatchObject({ ok: false, code: "stack-limit" });
    state = setEntityStackTarget(state, entity.id, MAX_BUILDING_STACK_COUNT - 1);
    expect(state.entities.find((candidate) => candidate.id === entity.id)?.machineCount).toBe(MAX_BUILDING_STACK_COUNT - 1);
    expect(state.construction.storage_mk1).toBe(510);
  });

  it("does not delete station excess cargo, fleet or settings when lowering stack", () => {
    let state = createInitialState(128_013);
    state.research.completedTechIds.push("energy_matrix", "high_speed_logistics", "planetary_logistics");
    state.construction.planetary_logistics_station = 4;
    state = placeBuilding(state, "planetary_logistics_station", { x: 0, y: 0 }, 4);
    const station = state.entities.find((candidate) => candidate.buildingId === "planetary_logistics_station")!;
    station.stationDrones = 500;
    station.stationSlots![0] = {
      itemId: "iron_ingot",
      localMode: "supply",
      remoteMode: "storage",
      minimumLoad: 0.25,
      minStock: 123,
      maxStock: 456,
      priority: 2,
      routePolicy: "direct",
      warperBudget: 4,
    };
    station.outputs.iron_ingot = 500_000;
    state = setEntityStackTarget(state, station.id, 1);
    const result = state.entities.find((candidate) => candidate.id === station.id)!;
    expect(result.machineCount).toBe(1);
    expect(result.stationDrones).toBe(500);
    expect(result.outputs.iron_ingot).toBe(500_000);
    expect(result.stationSlots?.[0]).toMatchObject({ minStock: 123, maxStock: 456, routePolicy: "direct", warperBudget: 4 });
  });

  it("changes only miner count and never changes a vein reserve", () => {
    let state = createInitialState(128_014);
    state.construction.mining_machine = 10;
    state = installMiner(state, "vein_iron", 4);
    const vein = state.entities.find((candidate) => candidate.id === "vein_iron")!;
    expect(vein.kind).toBe("vein");
    if (vein.kind !== "vein") throw new Error("expected vein entity");
    const reserve = vein.resourceRemaining;
    state = setEntityStackTarget(state, vein.id, 2);
    const result = state.entities.find((candidate) => candidate.id === vein.id)!;
    expect(result.kind).toBe("vein");
    if (result.kind !== "vein") throw new Error("expected vein entity");
    expect(result.minerCount).toBe(2);
    expect(result.machineCount).toBe(0);
    expect(result.resourceRemaining).toBe(reserve);
  });
});

describe("1.0.28 matrix research proliferator", () => {
  it("installs on research mode, rejects extra output, and accepts the spray input port", () => {
    let { state, entityId } = configuredResearchLab();
    expect(getSprayCoaterInstallCheck(state, entityId)).toMatchObject({ ready: true, code: "ready" });
    state = installSprayCoater(state, entityId);
    const beforeExtra = state;
    expect(setProliferatorConfiguration(state, entityId, 1, "extra")).toBe(beforeExtra);
    state = setProliferatorConfiguration(state, entityId, 1, "speed");
    const lab = state.entities.find((entity) => entity.id === entityId)!;
    expect(getAcceptedInputs(lab, state)).toContain("proliferator_mk1");
    expect(getEntityProliferatorSpeedMultiplier(lab)).toBeGreaterThan(1);
    expect(getEntityProliferatorPowerMultiplier(lab)).toBeGreaterThan(1);
  });

  it("charges one spray point per matrix actually consumed across a multi-matrix technology", () => {
    let { state, entityId } = configuredResearchLab();
    state = installSprayCoater(state, entityId);
    state = setProliferatorConfiguration(state, entityId, 1, "speed");
    state.entities.find((entity) => entity.id === entityId)!.inputs.proliferator_mk1 = 1;
    state = advanceSimulation(state, 10);
    const result = state.entities.find((entity) => entity.id === entityId)!;
    expect(state.research.completedTechIds).toContain("research_speed_1");
    expect(result.inputs.proliferator_mk1).toBe(0);
    expect(result.proliferatorPoints).toBe(8);
  });

  it("continues at normal research speed after spray points run out", () => {
    let { state, entityId } = configuredResearchLab();
    state = installSprayCoater(state, entityId);
    state = setProliferatorConfiguration(state, entityId, 1, "speed");
    state.research.selectedTechId = "electromagnetism";
    state.research.progressByTech.electromagnetism = {};
    const lab = state.entities.find((entity) => entity.id === entityId)!;
    lab.inputs = { electromagnetic_matrix: 5 };
    expect(getEntityOperatingStatus(state, lab)).toMatchObject({ code: "missing-proliferator", tone: "warning" });
    state = advanceSimulation(state, 15.1);
    expect(state.research.completedTechIds).toContain("electromagnetism");
  });

  it("is deterministic between one run and segmented simulation", () => {
    let configured = configuredResearchLab().state;
    const entityId = configured.entities.find((entity) => entity.buildingId === "matrix_lab")!.id;
    configured = installSprayCoater(configured, entityId);
    configured = setProliferatorConfiguration(configured, entityId, 1, "speed");
    configured.entities.find((entity) => entity.id === entityId)!.inputs.proliferator_mk1 = 1;
    const single = advanceSimulation(structuredClone(configured), 10);
    let segmented = structuredClone(configured);
    for (let second = 0; second < 10; second += 1) segmented = advanceSimulation(segmented, 1);
    single.productionHistory = [];
    segmented.productionHistory = [];
    expect(segmented).toEqual(single);
  });
});

describe("1.0.28 reforming refine parity", () => {
  it("registers the original recipe and all four parity decisions", () => {
    const audit = auditOriginalNonDarkFogRecipeParity();
    expect(audit.valid, audit.issues.join("\n")).toBe(true);
    expect(audit.entries).toHaveLength(79);
    expect(audit.counts).toMatchObject({ implemented: 73, adapted: 1, "not-applicable": 2, missing: 3 });
    expect(RECIPES.reforming_refine).toMatchObject({
      duration: 4,
      buildingId: "oil_refinery",
      inputs: [{ itemId: "coal", amount: 1 }, { itemId: "hydrogen", amount: 1 }, { itemId: "refined_oil", amount: 2 }],
      outputs: [{ itemId: "refined_oil", amount: 3 }],
    });
    expect(getTechnology("reforming_refine")?.summary).toContain("消耗 2 份精炼油、1 份煤和 1 份氢");
    expect(getTechnology("reforming_refine")?.summary).toContain("每轮额外获得 1 份精炼油");
  });

  it("produces the exact net oil amount and records production and consumption separately", () => {
    let { state, entityId } = configuredRefinery();
    const refinery = state.entities.find((entity) => entity.id === entityId)!;
    refinery.inputs = { coal: 2, hydrogen: 2, refined_oil: 4 };
    state = advanceSimulation(state, 8.1);
    const result = state.entities.find((entity) => entity.id === entityId)!;
    expect(result.inputs).toMatchObject({ coal: 0, hydrogen: 0, refined_oil: 0 });
    expect(result.outputs.refined_oil).toBe(6);
    expect(state.totalProduced.refined_oil).toBe(6);

    result.utilization = 1;
    const statistics = calculateFactoryStatistics(state);
    const oil = statistics.items.find((item) => item.itemId === "refined_oil")!;
    expect(oil.productionPerMinute).toBe(45);
    expect(oil.consumptionPerMinute).toBe(30);
    expect(oil.productionPerMinute - oil.consumptionPerMinute).toBe(15);
  });

  it.each(["coal", "hydrogen", "refined_oil"] as ItemId[])("stays blocked when %s is missing", (missingItemId) => {
    let { state, entityId } = configuredRefinery();
    const refinery = state.entities.find((entity) => entity.id === entityId)!;
    refinery.inputs = { coal: 1, hydrogen: 1, refined_oil: 2 };
    refinery.inputs[missingItemId] = 0;
    state = advanceSimulation(state, 8);
    const result = state.entities.find((entity) => entity.id === entityId)!;
    expect(result.outputs.refined_oil ?? 0).toBe(0);
    expect(getEntityOperatingStatus(state, result).code).toBe("missing-input");
  });

  it("requires room for the complete three-oil output transaction", () => {
    let { state, entityId } = configuredRefinery();
    let refinery = state.entities.find((entity) => entity.id === entityId)!;
    refinery.inputs = { coal: 1, hydrogen: 1, refined_oil: 2 };
    const capacity = getEntityOutputCapacity(state, refinery);
    refinery.outputs.refined_oil = capacity - 2;
    const blocked = advanceSimulation(state, 4.1);
    expect(blocked.entities.find((entity) => entity.id === entityId)?.outputs.refined_oil).toBe(capacity - 2);

    state = structuredClone(state);
    refinery = state.entities.find((entity) => entity.id === entityId)!;
    refinery.outputs.refined_oil = capacity - 3;
    state = advanceSimulation(state, 4.1);
    expect(state.entities.find((entity) => entity.id === entityId)?.outputs.refined_oil).toBe(capacity);
  });

  it("uses net output in planning and never exposes refinery cycles to recursive handcraft", () => {
    let { state } = configuredRefinery();
    state = createProductionPlan(state, "refined_oil", 60);
    const planId = state.productionPlans.at(-1)!.id;
    state = setProductionPlanRecipe(state, planId, "refined_oil", "reforming_refine");
    const result = calculateProductionPlan(state, state.productionPlans.at(-1)!);
    const oil = result.requirements.find((requirement) => requirement.itemId === "refined_oil")!;
    expect(oil.recipeId).toBe("reforming_refine");
    expect(oil.machinesRequired).toBe(4);
    expect(result.requirements.filter((requirement) => requirement.itemId === "refined_oil")).toHaveLength(1);
    expect(getProductionRecipeOptions(state, "refined_oil").map((recipe) => recipe.id)).toContain("reforming_refine");
    expect(isHandcraftableRecipe("reforming_refine")).toBe(false);
    expect(isHandcraftableRecipe("plasma_refining")).toBe(false);
    expect(isHandcraftableRecipe("xray_cracking")).toBe(false);
  });

  it("indexes the loop without losing its input edge or reporting free output", () => {
    expect(getProducingRecipes("refined_oil").map((recipe) => recipe.id)).toEqual(expect.arrayContaining(["plasma_refining", "reforming_refine"]));
    expect(getConsumingRecipes("refined_oil").map((recipe) => recipe.id)).toEqual(expect.arrayContaining(["xray_cracking", "reforming_refine"]));
    const rates = getRecipeRates(getRecipe("reforming_refine")!, getBuilding("oil_refinery").speed);
    expect(rates.inputPerMinute.refined_oil).toBe(30);
    expect(rates.outputPerMinute.refined_oil).toBe(45);
  });
});
