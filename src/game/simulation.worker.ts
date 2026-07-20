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
}

self.onmessage = (event: MessageEvent<SimulationWorkerRequest>) => {
  const { id, state, seconds } = event.data;
  const response: SimulationWorkerResponse = { id, state: advanceSimulation(state, seconds) };
  self.postMessage(response);
};

export {};
