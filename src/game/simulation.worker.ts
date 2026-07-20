/// <reference lib="webworker" />

import { advanceSimulation } from "./engine";
import type { GameState } from "./types";

export interface SimulationWorkerRequest {
  id: number;
  state: GameState;
  seconds: number;
}

export interface SimulationWorkerResponse {
  id: number;
  state: GameState;
  changed: boolean;
}

self.onmessage = (event: MessageEvent<SimulationWorkerRequest>) => {
  const { id, state, seconds } = event.data;
  const next = advanceSimulation(state, seconds);
  const response: SimulationWorkerResponse = { id, state: next, changed: next !== state };
  self.postMessage(response);
};

export {};
