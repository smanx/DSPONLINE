/// <reference lib="webworker" />

import { applyContentPackRuntimeSnapshot, type ContentPackRuntimeSnapshot } from "./contentPacks";
import { advancePersistentSimulationRuntime, createPersistentSimulationRuntime, createSimulationProfiler, replacePersistentSimulationRuntimeState, type PersistentSimulationRuntime, type SimulationProfiler } from "./engine";
import type { GameState } from "./types";
import { createSimulationProjection, type SimulationProjection } from "./simulationProjection";
import { createSimulationStateDelta, shouldUseSimulationDelta, type SimulationStateDelta } from "./simulationDelta";

export interface SimulationWorkerRequest {
  id: number;
  state?: GameState;
  simulationSeconds: number;
  wallSeconds: number;
  profile?: boolean;
  registryFingerprint: string;
  registry?: ContentPackRuntimeSnapshot;
  protocol?: "full" | "delta";
  stateRevision?: number;
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
  protocol?: "full" | "delta";
  stateRevision?: number;
  delta?: SimulationStateDelta;
  deltaFallback?: "larger-than-full";
}

let runtime: PersistentSimulationRuntime | null = null;
let activeRegistryFingerprint: string | null = null;
let runtimeRevision = 0;

self.onmessage = (event: MessageEvent<SimulationWorkerRequest>) => {
  const { id, state, simulationSeconds, wallSeconds, profile, registryFingerprint, registry, stateRevision } = event.data;
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
  const suppliedState = Boolean(state);
  if (state) {
    if (runtime) replacePersistentSimulationRuntimeState(runtime, state, profiler);
    else runtime = createPersistentSimulationRuntime(state, profiler);
    runtimeRevision = Math.max(runtimeRevision + 1, stateRevision ?? 0);
  }
  if (!runtime) {
    self.postMessage({ id, changed: false, needsState: true, registryFingerprint: activeRegistryFingerprint } satisfies SimulationWorkerResponse);
    return;
  }
  const startedAt = profile ? performance.now() : 0;
  const previousState = runtime.state;
  const previousRevision = runtimeRevision;
  const result = advancePersistentSimulationRuntime(runtime, simulationSeconds, wallSeconds, profiler);
  if (result.changed) runtimeRevision += 1;
  if (profiler && result.cacheRebuilt) profiler.persistentRuntimeRebuilds += 1;
  const response: SimulationWorkerResponse = {
    id,
    changed: result.changed,
    protocol: event.data.protocol ?? "full",
    stateRevision: runtimeRevision,
    ...(result.changed && (event.data.protocol !== "delta" || suppliedState) ? { state: result.state } : {}),
    ...(profile ? { durationMs: Math.max(0, performance.now() - startedAt), profiler } : {}),
    reusedState,
    cacheRebuilt: result.cacheRebuilt,
    registryFingerprint: activeRegistryFingerprint ?? undefined,
    ...(result.changed ? { projection: createSimulationProjection(previousState, result.state) } : {}),
  };
  if (result.changed && event.data.protocol === "delta" && !suppliedState) {
    const delta = createSimulationStateDelta(previousState, result.state, previousRevision, runtimeRevision);
    if (shouldUseSimulationDelta(result.state, delta)) {
      response.delta = delta;
    } else {
      // A busy end-game state can change most records every second. Sending a
      // larger delta would increase GC and structured-clone cost, so fall back
      // to the compatibility payload while keeping the same revision.
      response.protocol = "full";
      response.state = result.state;
      response.deltaFallback = "larger-than-full";
    }
  }
  self.postMessage(response);
};

export {};
