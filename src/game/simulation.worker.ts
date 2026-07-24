/// <reference lib="webworker" />

import { advanceSimulationBudget } from "./engine";
import type { GameState } from "./types";

export interface SimulationWorkerRequest {
  id: number;
  state: GameState;
  simulationSeconds: number;
  wallSeconds: number;
}

export interface SimulationWorkerResponse {
  id: number;
  changed: boolean;
  state?: GameState;
}

self.onmessage = (event: MessageEvent<SimulationWorkerRequest>) => {
  const { id, state, simulationSeconds, wallSeconds } = event.data;
  const next = advanceSimulationBudget(state, simulationSeconds, wallSeconds);
  const changed = next !== state;
  const response: SimulationWorkerResponse = {
    id,
    changed,
    ...(changed ? { state: next } : {}),
  };
  self.postMessage(response);
};

export {};
