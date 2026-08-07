import type { InfiniteResearchId } from "./types";

export interface InfiniteResearchCurve {
  maximumLevel: number;
  growthNumerator: number;
}

export const INFINITE_RESEARCH_CURVES: Record<InfiniteResearchId, InfiniteResearchCurve> = {
  matrix_compression: { maximumLevel: 1_000, growthNumerator: 1_051 },
  vein_utilization: { maximumLevel: 1_000, growthNumerator: 1_048 },
  galactic_logistics: { maximumLevel: 1_000, growthNumerator: 1_052 },
  stellar_harnessing: { maximumLevel: 1_000, growthNumerator: 1_050 },
  continuum_simulation: { maximumLevel: 23, growthNumerator: 1_045 },
};

const LEGACY_BASE_AND_GROWTH: Record<InfiniteResearchId, readonly [number, number]> = {
  matrix_compression: [250, 1.55],
  vein_utilization: [300, 1.58],
  galactic_logistics: [350, 1.6],
  stellar_harnessing: [400, 1.62],
  continuum_simulation: [500, 1.65],
};

function roundRatioToNearestTen(previous: bigint, numerator: number): bigint {
  return ((previous * BigInt(numerator) + 5_000n) / 10_000n) * 10n;
}

function buildCurve(id: InfiniteResearchId): readonly bigint[] {
  const [baseCost, legacyGrowth] = LEGACY_BASE_AND_GROWTH[id];
  const { maximumLevel, growthNumerator } = INFINITE_RESEARCH_CURVES[id];
  const costs = Array<bigint>(maximumLevel + 1).fill(0n);
  for (let targetLevel = 1; targetLevel <= Math.min(10, maximumLevel); targetLevel += 1) {
    costs[targetLevel] = BigInt(Math.max(1, Math.round(baseCost * legacyGrowth ** (targetLevel - 1) / 10) * 10));
  }
  for (let targetLevel = 11; targetLevel <= maximumLevel; targetLevel += 1) {
    costs[targetLevel] = roundRatioToNearestTen(costs[targetLevel - 1], growthNumerator);
  }
  return costs;
}

const COSTS = Object.fromEntries((Object.keys(INFINITE_RESEARCH_CURVES) as InfiniteResearchId[])
  .map((id) => [id, buildCurve(id)])) as Record<InfiniteResearchId, readonly bigint[]>;

const CUMULATIVE_COSTS = Object.fromEntries((Object.keys(INFINITE_RESEARCH_CURVES) as InfiniteResearchId[])
  .map((id) => {
    const prefix = Array<bigint>(COSTS[id].length).fill(0n);
    for (let level = 1; level < COSTS[id].length; level += 1) {
      prefix[level] = prefix[level - 1] + COSTS[id][level];
    }
    return [id, prefix] as const;
  })) as unknown as Record<InfiniteResearchId, readonly bigint[]>;

export function getInfiniteResearchMaximumLevel(id: InfiniteResearchId): number {
  return INFINITE_RESEARCH_CURVES[id].maximumLevel;
}

export function getInfiniteResearchCostBigInt(id: InfiniteResearchId, currentLevel: number): bigint {
  const targetLevel = Math.max(1, Math.min(getInfiniteResearchMaximumLevel(id), Math.floor(currentLevel) + 1));
  return COSTS[id][targetLevel];
}

export function getInfiniteResearchCostString(id: InfiniteResearchId, currentLevel: number): string {
  return getInfiniteResearchCostBigInt(id, currentLevel).toString();
}

export function getInfiniteResearchCumulativeInvestmentBigInt(
  id: InfiniteResearchId,
  level: number,
  progress: string,
): bigint {
  const safeLevel = Math.max(0, Math.min(getInfiniteResearchMaximumLevel(id), Math.floor(level)));
  const safeProgress = /^\d+$/.test(progress) ? BigInt(progress) : 0n;
  if (safeLevel >= getInfiniteResearchMaximumLevel(id)) return CUMULATIVE_COSTS[id][safeLevel];
  return CUMULATIVE_COSTS[id][safeLevel] +
    (safeProgress > getInfiniteResearchCostBigInt(id, safeLevel)
      ? getInfiniteResearchCostBigInt(id, safeLevel)
      : safeProgress);
}

export interface InfiniteResearchBudgetResult {
  level: number;
  progress: string;
  consumed: bigint;
  completedLevels: number[];
  reachedMaximum: boolean;
}

/**
 * Applies an integer universe-matrix budget against the authoritative
 * non-linear cost curve. The helper owns no GameState fields, which keeps it
 * reusable by the exact engine and by bounded macro settlement.
 */
export function settleInfiniteResearchBudget(
  id: InfiniteResearchId,
  currentLevel: number,
  currentProgress: string,
  requested: bigint,
  autoResearch: boolean,
): InfiniteResearchBudgetResult {
  const maximum = getInfiniteResearchMaximumLevel(id);
  let level = Math.max(0, Math.min(maximum, Math.floor(currentLevel)));
  let progress = /^\d+$/.test(currentProgress) ? BigInt(currentProgress) : 0n;
  let remaining = requested > 0n ? requested : 0n;
  const completedLevels: number[] = [];

  while (level < maximum) {
    const cost = getInfiniteResearchCostBigInt(id, level);
    if (progress > cost) progress = cost;
    if (progress >= cost) {
      level += 1;
      progress = 0n;
      completedLevels.push(level);
      if (!autoResearch) break;
      continue;
    }
    if (remaining <= 0n) break;
    const needed = cost - progress;
    const invested = remaining < needed ? remaining : needed;
    progress += invested;
    remaining -= invested;
  }

  return {
    level,
    progress: progress.toString(),
    consumed: (requested > 0n ? requested : 0n) - remaining,
    completedLevels,
    reachedMaximum: level >= maximum,
  };
}

export function getInfiniteResearchCompletionBasisPoints(progress: string, id: InfiniteResearchId, currentLevel: number): number {
  const amount = /^\d+$/.test(progress) ? BigInt(progress) : 0n;
  const cost = getInfiniteResearchCostBigInt(id, currentLevel);
  return Number((amount * 10_000n / cost) > 10_000n ? 10_000n : amount * 10_000n / cost);
}

export function isInfiniteResearchComplete(id: InfiniteResearchId, level: number): boolean {
  return Math.max(0, Math.floor(level)) >= getInfiniteResearchMaximumLevel(id);
}
