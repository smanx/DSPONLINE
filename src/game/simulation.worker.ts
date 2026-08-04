/// <reference lib="webworker" />

import { applyContentPackRuntimeSnapshot, type ContentPackRuntimeSnapshot } from "./contentPacks";
import { advancePersistentSimulationRuntime, createPersistentSimulationRuntime, createSimulationProfiler, replacePersistentSimulationRuntimeState, type PersistentSimulationRuntime, type SimulationProfiler } from "./engine";
import type { GameState } from "./types";
import { createSimulationProjection, type SimulationProjection } from "./simulationProjection";

export interface SimulationWorkerRequest {
  id: number;
  state?: GameState;
  simulationSeconds: number;
  wallSeconds: number;
  profile?: boolean;
  registryFingerprint: string;
  registry?: ContentPackRuntimeSnapshot;
}

export interface SimulationWorkerResponse {
  id: number;
  changed: boolean;
  state?: GameState;
  durationMs?: number;
  profiler?: SimulationProfiler;
  needsState?: boolean;
  reusedState?: boolean;
  cacheRebuilt?: boolean;
  registryFingerprint?: string;
  needsRegistry?: boolean;
  registryError?: string;
  /** Optional P4 projection; `state` remains the compatibility oracle. */
  projection?: SimulationProjection;
}

let runtime: PersistentSimulationRuntime | null = null;
let activeRegistryFingerprint: string | null = null;

self.onmessage = (event: MessageEvent<SimulationWorkerRequest>) => {
  const { id, state, simulationSeconds, wallSeconds, profile, registryFingerprint, registry } = event.data;
  const profiler = profile ? createSimulationProfiler() : undefined;
  const reusedState = !state && Boolean(runtime);
  if (profiler && reusedState) profiler.persistentRuntimeHits += 1;
  if (!registryFingerprint || activeRegistryFingerprint !== registryFingerprint) {
    if (!registry || registry.fingerprint !== registryFingerprint) {
      self.postMessage({
        id,
        changed: false,
        needsRegistry: true,
        registryFingerprint: activeRegistryFingerprint ?? undefined,
        registryError: "内容包运行时注册表缺失或指纹不匹配",
      } satisfies SimulationWorkerResponse);
      return;
    }
    try {
      applyContentPackRuntimeSnapshot(registry);
    } catch (error) {
      self.postMessage({
        id,
        changed: false,
        needsRegistry: true,
        registryFingerprint: activeRegistryFingerprint ?? undefined,
        registryError: error instanceof Error ? error.message : "内容包运行时目录校验失败",
      } satisfies SimulationWorkerResponse);
      return;
    }
    activeRegistryFingerprint = registryFingerprint;
    // The entity state remains authoritative. Only the catalog-dependent lookup
    // is rebuilt at this boundary; no inventory, route, or production progress is recreated.
    if (runtime) replacePersistentSimulationRuntimeState(runtime, runtime.state, profiler);
  }
  if (state) {
    if (runtime) replacePersistentSimulationRuntimeState(runtime, state, profiler);
    else runtime = createPersistentSimulationRuntime(state, profiler);
  }
  if (!runtime) {
    self.postMessage({ id, changed: false, needsState: true, registryFingerprint: activeRegistryFingerprint } satisfies SimulationWorkerResponse);
    return;
  }
  const startedAt = profile ? performance.now() : 0;
  const previousState = runtime.state;
  const result = advancePersistentSimulationRuntime(runtime, simulationSeconds, wallSeconds, profiler);
  if (profiler && result.cacheRebuilt) profiler.persistentRuntimeRebuilds += 1;
  const response: SimulationWorkerResponse = {
    id,
    changed: result.changed,
    ...(result.changed ? { state: result.state } : {}),
    ...(profile ? { durationMs: Math.max(0, performance.now() - startedAt), profiler } : {}),
    reusedState,
    cacheRebuilt: result.cacheRebuilt,
    registryFingerprint: activeRegistryFingerprint ?? undefined,
    ...(result.changed ? { projection: createSimulationProjection(previousState, result.state) } : {}),
  };
  self.postMessage(response);
};

export {};
