import { describe, expect, it } from "vitest";
import {
  advanceSimulation,
  createInitialState,
  getEntityInputCapacity,
  getTechnologyConstructionRewards,
} from "./engine";
import { getInfiniteResearchCostBigInt } from "./infiniteResearch";
import {
  advanceResearchMacroInPlace,
  createResearchMacroLedger,
  type ResearchMacroLedger,
} from "./researchMacro";
import type { FactoryEntity, GameState } from "./types";

function researchLab(machineCount = 1, inputs: FactoryEntity["inputs"] = {}): FactoryEntity {
  return {
    id: "macro-research-lab",
    kind: "machine",
    planetId: "home",
    position: { x: 0, y: 0 },
    interactionLocked: false,
    buildingId: "matrix_lab",
    recipeId: "matrix_research",
    machineCount,
    minerCount: 0,
    inputs,
    outputs: {},
    progress: 0,
    routingCursor: 0,
    utilization: 0,
    productionRate: 0,
  };
}

function windPower(): FactoryEntity {
  return {
    id: "macro-research-power",
    kind: "power",
    planetId: "home",
    position: { x: -100, y: 0 },
    interactionLocked: false,
    buildingId: "wind_turbine",
    machineCount: 10,
    minerCount: 0,
    inputs: {},
    outputs: {},
    progress: 0,
    routingCursor: 0,
    utilization: 0,
    productionRate: 0,
  };
}

function finiteResearchState(): GameState {
  const state = createInitialState(undefined, false);
  state.paused = false;
  state.entities = [windPower(), researchLab(1, { electromagnetic_matrix: 100 })];
  state.belts = [];
  state.constructionAutomation.enabled = false;
  state.research.selectedTechId = "electromagnetic_matrix";
  state.research.queuedTechIds = ["electromagnetism"];
  return state;
}

describe("macro research ledger", () => {
  it("completes finite technologies in queue order and grants each reward once", () => {
    const source = finiteResearchState();
    const snapshots = [structuredClone(source)];
    let shadow = structuredClone(source);
    for (let index = 0; index < 3; index += 1) {
      shadow = advanceSimulation(shadow, 10);
      snapshots.push(structuredClone(shadow));
    }
    const ledger = createResearchMacroLedger(snapshots, 10);
    expect(ledger).not.toBeNull();

    const candidate = structuredClone(source);
    const rewardIds = [
      ...getTechnologyConstructionRewards("electromagnetic_matrix"),
      ...getTechnologyConstructionRewards("electromagnetism"),
    ];
    const beforeRewards = Object.fromEntries(rewardIds.map((id) => [id, candidate.construction[id] ?? 0]));
    const result = advanceResearchMacroInPlace(candidate, ledger!, 30);

    expect(result.completedFiniteTechIds).toEqual(["electromagnetic_matrix", "electromagnetism"]);
    expect(candidate.research.completedTechIds).toEqual(expect.arrayContaining(["electromagnetic_matrix", "electromagnetism"]));
    expect(candidate.research.selectedTechId).toBeNull();
    expect(candidate.entities.find((entity) => entity.id === "macro-research-lab")?.inputs.electromagnetic_matrix).toBe(92);
    for (const id of new Set(rewardIds)) {
      const occurrences = rewardIds.filter((rewardId) => rewardId === id).length;
      expect(candidate.construction[id]).toBe((beforeRewards[id] ?? 0) + occurrences * 2);
    }

    const rewardsAfterFirst = { ...candidate.construction };
    advanceResearchMacroInPlace(candidate, ledger!, 30, result.remainder, result.inflowRemainders);
    expect(candidate.construction).toEqual(rewardsAfterFirst);
  });

  it("crosses matrix_compression Lv.263 with exact BigInt costs and score", () => {
    const state = createInitialState(undefined, false);
    const first = getInfiniteResearchCostBigInt("matrix_compression", 263);
    const second = getInfiniteResearchCostBigInt("matrix_compression", 264);
    const budget = first + second;
    expect(budget).toBeLessThan(BigInt(Number.MAX_SAFE_INTEGER));
    state.entities = [researchLab(100_000_000, { universe_matrix: Number(budget) })];
    state.research.completedTechIds.push("universe_matrix");
    state.endgame.activeInfiniteResearchId = "matrix_compression";
    state.endgame.autoResearch = true;
    state.endgame.infiniteResearch.matrix_compression = { level: 263, progress: "0" };
    const scoreBefore = state.endgame.galacticScore;
    const ledger: ResearchMacroLedger = {
      unitsPerWindow: budget,
      windowSeconds: 30,
      observedUnits: budget,
      inflowPerWindow: {},
    };

    const result = advanceResearchMacroInPlace(state, ledger, 30);

    expect(result.consumed).toBe(budget);
    expect(result.completedInfiniteLevels).toEqual([264, 265]);
    expect(state.endgame.infiniteResearch.matrix_compression).toEqual({ level: 265, progress: "0" });
    expect(state.endgame.galacticScore - scoreBefore).toBe(
      (1_000 + 264 * 250) + (1_000 + 265 * 250),
    );
    expect(state.entities[0].inputs.universe_matrix).toBe(0);
  });

  it("preserves historical over-capacity lab matrices except for real consumption", () => {
    const state = createInitialState(undefined, false);
    const firstLab = researchLab(1, { universe_matrix: 10 });
    firstLab.id = "macro-research-lab-first";
    const secondLab = researchLab(1);
    secondLab.id = "macro-research-lab-over-capacity";
    const capacity = getEntityInputCapacity(state, secondLab);
    const historicalAmount = capacity + 12_345;
    secondLab.inputs.universe_matrix = historicalAmount;
    state.entities = [firstLab, secondLab];
    state.research.completedTechIds.push("universe_matrix");
    state.endgame.activeInfiniteResearchId = "matrix_compression";
    state.endgame.autoResearch = true;
    const ledger: ResearchMacroLedger = {
      unitsPerWindow: 1n,
      windowSeconds: 1,
      observedUnits: 1n,
      inflowPerWindow: {},
    };

    const result = advanceResearchMacroInPlace(state, ledger, 1);

    expect(result.consumed).toBe(1n);
    expect(firstLab.inputs.universe_matrix).toBe(9);
    expect(secondLab.inputs.universe_matrix).toBe(historicalAmount);
    expect(
      (firstLab.inputs.universe_matrix ?? 0) + (secondLab.inputs.universe_matrix ?? 0) + Number(result.consumed),
    ).toBe(10 + historicalAmount);
  });

  it("settles finite and infinite exact-cost boundaries once with a zero macro budget", () => {
    const finite = finiteResearchState();
    finite.research.progressByTech.electromagnetic_matrix = { electromagnetic_matrix: 10 };
    const finiteRewards = getTechnologyConstructionRewards("electromagnetic_matrix");
    const rewardBefore = Object.fromEntries(finiteRewards.map((id) => [id, finite.construction[id] ?? 0]));
    const zeroLedger: ResearchMacroLedger = {
      unitsPerWindow: 0n,
      windowSeconds: 30,
      observedUnits: 0n,
      inflowPerWindow: {},
    };

    const finiteResult = advanceResearchMacroInPlace(finite, zeroLedger, 30);
    expect(finiteResult.completedFiniteTechIds).toEqual(["electromagnetic_matrix"]);
    for (const id of finiteRewards) expect(finite.construction[id]).toBe((rewardBefore[id] ?? 0) + 2);
    const rewardsAfter = { ...finite.construction };
    expect(advanceResearchMacroInPlace(finite, zeroLedger, 30).completedFiniteTechIds).toEqual([]);
    expect(finite.construction).toEqual(rewardsAfter);

    const infinite = createInitialState(undefined, false);
    const cost = getInfiniteResearchCostBigInt("matrix_compression", 263);
    infinite.research.completedTechIds.push("universe_matrix");
    infinite.endgame.activeInfiniteResearchId = "matrix_compression";
    infinite.endgame.autoResearch = true;
    infinite.endgame.infiniteResearch.matrix_compression = { level: 263, progress: cost.toString() };
    const scoreBefore = infinite.endgame.galacticScore;
    const infiniteResult = advanceResearchMacroInPlace(infinite, zeroLedger, 30);
    expect(infiniteResult.completedInfiniteLevels).toEqual([264]);
    expect(infiniteResult.consumed).toBe(0n);
    expect(infinite.endgame.infiniteResearch.matrix_compression).toEqual({ level: 264, progress: "0" });
    expect(infinite.endgame.galacticScore - scoreBefore).toBe(1_000 + 264 * 250);
    advanceResearchMacroInPlace(infinite, zeroLedger, 30);
    expect(infinite.endgame.galacticScore - scoreBefore).toBe(1_000 + 264 * 250);
  });

  it("honors autoResearch=false and stops after the first infinite level", () => {
    const state = createInitialState(undefined, false);
    const first = getInfiniteResearchCostBigInt("matrix_compression", 263);
    const second = getInfiniteResearchCostBigInt("matrix_compression", 264);
    const budget = first + second;
    state.entities = [researchLab(100_000_000, { universe_matrix: Number(budget) })];
    state.research.completedTechIds.push("universe_matrix");
    state.endgame.activeInfiniteResearchId = "matrix_compression";
    state.endgame.autoResearch = false;
    state.endgame.infiniteResearch.matrix_compression = { level: 263, progress: "0" };
    const ledger: ResearchMacroLedger = {
      unitsPerWindow: budget,
      windowSeconds: 30,
      observedUnits: budget,
      inflowPerWindow: {},
    };

    const result = advanceResearchMacroInPlace(state, ledger, 30);

    expect(result.completedInfiniteLevels).toEqual([264]);
    expect(result.consumed).toBe(first);
    expect(state.endgame.activeInfiniteResearchId).toBeNull();
    expect(state.entities[0].inputs.universe_matrix).toBe(Number(second));
  });
});
