import type { GameState } from "./types";

export interface MulticoreSimulationPlan {
  requestedWorkers: number;
  workerCount: number;
  enabled: boolean;
  reason: "disabled" | "insufficient-work" | "transfer-cost" | "approved";
}

/**
 * P6 guardrail: parallelism is opt-in and only allowed after an external
 * deterministic benchmark proves transfer/merge cost is worthwhile. The
 * normal game path remains one authoritative Worker.
 */
export function planMulticoreSimulation(state: Pick<GameState, "entities" | "belts">, options: { requestedWorkers?: number; benchmarkSpeedup?: number; enabled?: boolean } = {}): MulticoreSimulationPlan {
  const requestedWorkers = Math.max(1, Math.floor(options.requestedWorkers ?? 1));
  const workUnits = state.entities.length + state.belts.length;
  if (!options.enabled) return { requestedWorkers, workerCount: 1, enabled: false, reason: "disabled" };
  if (workUnits < 512 || requestedWorkers < 2) return { requestedWorkers, workerCount: 1, enabled: false, reason: "insufficient-work" };
  if ((options.benchmarkSpeedup ?? 0) <= 1.15) return { requestedWorkers, workerCount: 1, enabled: false, reason: "transfer-cost" };
  return { requestedWorkers, workerCount: Math.min(requestedWorkers, 4), enabled: true, reason: "approved" };
}
