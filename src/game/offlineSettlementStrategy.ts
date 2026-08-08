import { FAST_OFFLINE_CALIBRATION_SECONDS, type OfflineApproximationResult } from "./offlineApproximation";

export type OfflineWorkerSettlementStrategy = "fast" | "conservative" | "exact" | "invalid-source";

export interface OfflineWorkerSettlementRequestShape {
  approximate: boolean;
  conservativeOnly: boolean;
  speedrun: boolean;
  seconds: number;
}

/**
 * Keeps the Worker fallback policy independent from the simulation formulas.
 * Ordinary fast settlement may degrade to conservative macro work, but it may
 * never turn a declined contract into an unbounded exact replay.
 */
export function selectInitialOfflineWorkerStrategy(
  request: OfflineWorkerSettlementRequestShape,
): OfflineWorkerSettlementStrategy {
  if (request.conservativeOnly && !request.speedrun) return "conservative";
  if (request.approximate && !request.speedrun && request.seconds > FAST_OFFLINE_CALIBRATION_SECONDS) return "fast";
  return "exact";
}

export function selectOfflineWorkerStrategyAfterFastResult(
  request: OfflineWorkerSettlementRequestShape,
  result: OfflineApproximationResult,
): OfflineWorkerSettlementStrategy {
  if (result.status === "invalid-source") return "invalid-source";
  if (result.status === "approximate" || result.status === "conservative" || result.status === "bounded-exact") {
    return result.status === "conservative" ? "conservative" : result.status === "bounded-exact" ? "exact" : "fast";
  }
  return request.speedrun ? "exact" : "conservative";
}
