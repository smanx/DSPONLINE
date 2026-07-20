import { advanceSimulation } from "./engine";
import type { GameState } from "./types";

export interface DeterminismReport {
  deterministic: boolean;
  simulatedSeconds: number;
  runs: number;
  durationMs: number;
  stateHash: string;
  entityCount: number;
  beltCount: number;
}

export interface SimulationBenchmarkReport extends DeterminismReport {
  steps: number;
  stepsPerSecond: number;
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function hashGameState(state: GameState): string {
  return hashText(stableSerialize(state));
}

export function runDeterminismCheck(state: GameState, seconds = 30): DeterminismReport {
  const duration = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const startedAt = Date.now();
  const first = advanceSimulation(state, duration);
  const second = advanceSimulation(state, duration);
  const firstHash = hashGameState(first);
  const secondHash = hashGameState(second);
  return {
    deterministic: firstHash === secondHash,
    simulatedSeconds: duration,
    runs: 2,
    durationMs: Math.max(0, Date.now() - startedAt),
    stateHash: firstHash,
    entityCount: first.entities.length,
    beltCount: first.belts.length,
  };
}

export function runSimulationBenchmark(state: GameState, seconds = 60, steps = 60): SimulationBenchmarkReport {
  const duration = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const stepCount = Math.max(1, Math.floor(Number.isFinite(steps) ? steps : 1));
  const stepSeconds = duration / stepCount;
  const startedAt = Date.now();
  let current = state;
  for (let index = 0; index < stepCount; index += 1) current = advanceSimulation(current, stepSeconds);
  const durationMs = Math.max(0, Date.now() - startedAt);
  const deterministic = runDeterminismCheck(state, duration);
  return {
    ...deterministic,
    deterministic: deterministic.deterministic,
    durationMs: durationMs + deterministic.durationMs,
    steps: stepCount,
    stepsPerSecond: durationMs > 0 ? stepCount / (durationMs / 1000) : stepCount,
  };
}
