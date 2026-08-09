import type { GameState, IdleSettlementState, ItemId } from "./types";

function nonNegativeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function integerMap(value: unknown): Partial<Record<ItemId, number>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([itemId, amount]) => {
    if (typeof amount !== "number" || !Number.isFinite(amount)) return [];
    return [[itemId, Math.max(0, Math.floor(amount))]];
  })) as Partial<Record<ItemId, number>>;
}

export function createIdleSettlementState(): IdleSettlementState {
  return {
    currentRunStartedAt: null,
    currentRunElapsed: 0,
    lastSettledAt: 0,
    totalIdleTime: 0,
    currentRunProduction: {},
    totalProduction: {},
  };
}

/** Safe, idempotent migration for the additive v46 settlement fields. */
export function normalizeIdleSettlementState(raw: unknown): IdleSettlementState {
  const source = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const currentRunStartedAt = source.currentRunStartedAt === null || source.currentRunStartedAt === undefined
    ? null
    : nonNegativeNumber(source.currentRunStartedAt);
  const lastSettledAt = nonNegativeNumber(source.lastSettledAt);
  const currentRunElapsed = Math.max(lastSettledAt, nonNegativeNumber(source.currentRunElapsed));
  return {
    currentRunStartedAt: currentRunStartedAt !== null && currentRunStartedAt > 0 ? Math.floor(currentRunStartedAt) : null,
    currentRunElapsed,
    lastSettledAt,
    totalIdleTime: nonNegativeNumber(source.totalIdleTime),
    currentRunProduction: integerMap(source.currentRunProduction),
    totalProduction: integerMap(source.totalProduction),
  };
}

export function beginIdleRun(settlement: IdleSettlementState, startedAtMs: number): IdleSettlementState {
  const current = normalizeIdleSettlementState(settlement);
  // A duplicated start event belongs to the already-active run. Resetting the
  // cursor here would make the previously settled prefix eligible a second
  // time when rapid taps or lifecycle retries race each other.
  if (current.currentRunStartedAt !== null) return current;
  const currentRunStartedAt = Number.isFinite(startedAtMs) && startedAtMs > 0 ? Math.floor(startedAtMs) : Date.now();
  return {
    ...current,
    currentRunStartedAt,
    currentRunElapsed: 0,
    lastSettledAt: 0,
    currentRunProduction: {},
  };
}

function productionDelta(
  before: Partial<Record<ItemId, number>>,
  after: Partial<Record<ItemId, number>>,
): Partial<Record<ItemId, number>> {
  const itemIds = new Set<ItemId>([
    ...Object.keys(before),
    ...Object.keys(after),
  ] as ItemId[]);
  return Object.fromEntries([...itemIds].flatMap((itemId) => {
    const amount = Math.max(0, Math.floor((after[itemId] ?? 0) - (before[itemId] ?? 0)));
    return amount > 0 ? [[itemId, amount]] : [];
  })) as Partial<Record<ItemId, number>>;
}

/**
 * Commit only the forward interval `(lastSettledAt, targetWallSeconds]`.
 * Repeating the same target is a no-op, which makes stop/retry/reload safe.
 */
export function settleIdleRun(
  settlement: IdleSettlementState,
  targetWallSeconds: number,
  baselineProduction: Partial<Record<ItemId, number>>,
  settledProduction: Partial<Record<ItemId, number>>,
): IdleSettlementState {
  const current = normalizeIdleSettlementState(settlement);
  const target = Math.max(current.lastSettledAt, nonNegativeNumber(targetWallSeconds));
  const deltaSeconds = Math.max(0, target - current.lastSettledAt);
  const runProduction = productionDelta(baselineProduction, settledProduction);
  const currentRunProduction = { ...current.currentRunProduction };
  const totalProduction = { ...current.totalProduction };
  for (const [itemId, amount] of Object.entries(runProduction) as Array<[ItemId, number]>) {
    currentRunProduction[itemId] = Math.max(currentRunProduction[itemId] ?? 0, amount);
    totalProduction[itemId] = Math.floor((totalProduction[itemId] ?? 0) + Math.max(0, amount - (current.currentRunProduction[itemId] ?? 0)));
  }
  return {
    ...current,
    currentRunElapsed: Math.max(current.currentRunElapsed, target),
    lastSettledAt: target,
    totalIdleTime: current.totalIdleTime + deltaSeconds,
    currentRunProduction,
    totalProduction,
  };
}

export function finishIdleRun(settlement: IdleSettlementState): IdleSettlementState {
  return {
    ...normalizeIdleSettlementState(settlement),
    currentRunStartedAt: null,
  };
}

export function idleSettlementFromState(state: Pick<GameState, "idleSettlement">): IdleSettlementState {
  return normalizeIdleSettlementState(state.idleSettlement);
}
