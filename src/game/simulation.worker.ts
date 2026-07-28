/// <reference lib="webworker" />

import { advanceSimulationBudget, createSimulationProfiler, type SimulationProfiler } from "./engine";
import type { GameState } from "./types";

export interface SimulationWorkerRequest {
  id: number;
  state: GameState;
  simulationSeconds: number;
  wallSeconds: number;
  profile?: boolean;
}

export interface SimulationWorkerResponse {
  id: number;
  changed: boolean;
  state?: GameState;
  durationMs?: number;
  profiler?: SimulationProfiler;
}

self.onmessage = (event: MessageEvent<SimulationWorkerRequest>) => {
  const { id, state, simulationSeconds, wallSeconds, profile } = event.data;
  const profiler = profile ? createSimulationProfiler() : undefined;
  const startedAt = profile ? performance.now() : 0;
  const next = advanceSimulationBudget(state, simulationSeconds, wallSeconds, profiler);
  const changed = next !== state;
  const response: SimulationWorkerResponse = {
    id,
    changed,
    ...(changed ? { state: next } : {}),
    ...(profile ? { durationMs: Math.max(0, performance.now() - startedAt), profiler } : {}),
  };
  self.postMessage(response);
};

export {};
