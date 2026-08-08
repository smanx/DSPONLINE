import { describe, expect, it } from "vitest";
import {
  getInfiniteResearchCompletionBasisPoints,
  getInfiniteResearchCostBigInt,
  getInfiniteResearchCostString,
  isInfiniteResearchComplete,
  settleInfiniteResearchBudget,
} from "./infiniteResearch";
import type { InfiniteResearchId } from "./types";

const EXPECTED: Record<Exclude<InfiniteResearchId, "continuum_simulation">, Record<number, string>> = {
  matrix_compression: { 1: "250", 10: "12910", 25: "27220", 50: "94400", 100: "1135160", 250: "1974550610", 500: "496760755291850", 1000: "31441647386989570364354250" },
  vein_utilization: { 1: "300", 10: "18410", 25: "37210", 50: "120120", 100: "1252390", 250: "1418808150", 500: "174680466054430", 1000: "2647802975164680627175490" },
  galactic_logistics: { 1: "350", 10: "24050", 25: "51450", 50: "182700", 100: "2304110", 250: "4622365250", 500: "1475024430858500", 1000: "150199719791816213690635070" },
  stellar_harnessing: { 1: "400", 10: "30740", 25: "63890", 50: "216310", 100: "2480540", 250: "3740610580", 500: "741766589212380", 1000: "29168681802280940068235780" },
};

describe("infinite research cost curves", () => {
  for (const [id, levels] of Object.entries(EXPECTED) as Array<[Exclude<InfiniteResearchId, "continuum_simulation">, Record<number, string>]>) {
    for (const [targetLevel, expected] of Object.entries(levels)) {
      it(`${id} Lv.${targetLevel} is exact`, () => {
        expect(getInfiniteResearchCostString(id, Number(targetLevel) - 1)).toBe(expected);
      });
    }
  }

  it("caps continuum simulation at Lv.23", () => {
    expect(getInfiniteResearchCostString("continuum_simulation", 22)).toBe("80330");
    expect(isInfiniteResearchComplete("continuum_simulation", 23)).toBe(true);
    expect(isInfiniteResearchComplete("matrix_compression", 999)).toBe(false);
    expect(isInfiniteResearchComplete("matrix_compression", 1_000)).toBe(true);
  });

  it("calculates progress without converting large integers to Number", () => {
    const cost = getInfiniteResearchCostString("galactic_logistics", 999);
    expect(getInfiniteResearchCompletionBasisPoints(cost, "galactic_logistics", 999)).toBe(10_000);
    expect(getInfiniteResearchCompletionBasisPoints((BigInt(cost) / 2n).toString(), "galactic_logistics", 999)).toBe(5_000);
  });

  it("settles matrix compression from Lv.263 across exact BigInt costs", () => {
    const first = getInfiniteResearchCostBigInt("matrix_compression", 263);
    const second = getInfiniteResearchCostBigInt("matrix_compression", 264);
    const result = settleInfiniteResearchBudget(
      "matrix_compression",
      263,
      "0",
      first + second,
      true,
    );

    expect(result).toMatchObject({ level: 265, progress: "0", completedLevels: [264, 265] });
    expect(result.consumed).toBe(first + second);
  });

  it("stops after one exact level when automatic infinite research is disabled", () => {
    const first = getInfiniteResearchCostBigInt("matrix_compression", 263);
    const second = getInfiniteResearchCostBigInt("matrix_compression", 264);
    const result = settleInfiniteResearchBudget(
      "matrix_compression",
      263,
      "0",
      first + second,
      false,
    );

    expect(result).toMatchObject({ level: 264, progress: "0", completedLevels: [264] });
    expect(result.consumed).toBe(first);
  });

  it("settles an already-funded level without requiring one extra matrix", () => {
    const cost = getInfiniteResearchCostBigInt("matrix_compression", 263);
    const result = settleInfiniteResearchBudget(
      "matrix_compression",
      263,
      cost.toString(),
      0n,
      true,
    );

    expect(result).toMatchObject({
      level: 264,
      progress: "0",
      consumed: 0n,
      completedLevels: [264],
    });
  });
});
