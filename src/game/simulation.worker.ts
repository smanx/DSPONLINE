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
  changed: boolean;
  state?: GameState;
}

self.onmessage = (event: MessageEvent<SimulationWorkerRequest>) => {
  const { id, state, seconds } = event.data;
  const next = advanceSimulation(state, seconds);
  const changed = next !== state;
  const response: SimulationWorkerResponse = {
    id,
    changed,
    ...(changed ? { state: next } : {}),
  };
  self.postMessage(response);
};

export {};
