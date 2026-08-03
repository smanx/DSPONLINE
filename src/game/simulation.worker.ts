/// <reference lib="webworker" />

import { applyContentPackRuntimeSnapshot, type ContentPackRuntimeSnapshot } from "./contentPacks";
import { advancePersistentSimulationRuntime, advancePersistentSimulationRuntimeMulticore, createPersistentSimulationRuntime, createSimulationProfiler, replacePersistentSimulationRuntimeState, type PersistentSimulationRuntime, type SimulationProfiler } from "./engine";
import { BrowserMulticoreExecutor, planMulticoreSimulation, type MulticoreSimulationOptions } from "./multicoreSimulation";
import type { GameState } from "./types";
import { captureSimulationProjectionBaseline, createSimulationProjection, type SimulationProjection } from "./simulationProjection";
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
  multicore?: MulticoreSimulationOptions;
}

export interface SimulationWorkerResponse {
  id: number;
  changed: boolean;
  state?: GameState;
  durationMs?: number;
  /** JSON-equivalent payload size, sampled only while the diagnostics panel is active. */
  transferBytes?: number;
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
  multicore?: { enabled: boolean; workerCount: number; fallback?: boolean; reason?: string };
}

let runtime: PersistentSimulationRuntime | null = null;
let activeRegistryFingerprint: string | null = null;
let runtimeRevision = 0;
let multicoreExecutor: BrowserMulticoreExecutor | null = null;
let multicoreExecutorWorkerCount = 0;
let activeRegistrySnapshot: ContentPackRuntimeSnapshot | undefined;
let simulationMessageQueue: Promise<void> = Promise.resolve();

// A content-pack update is a simulation boundary. Serialising requests here
// prevents an older awaited planet-phase response from racing a newer state or
// registry update and overwriting the authoritative runtime.
self.onmessage = (event: MessageEvent<SimulationWorkerRequest>) => {
  simulationMessageQueue = simulationMessageQueue
    .then(() => processSimulationRequest(event))
    .catch((error) => {
      self.postMessage({
        id: event.data.id,
        changed: false,
        needsState: true,
        registryFingerprint: activeRegistryFingerprint ?? undefined,
        registryError: error instanceof Error ? error.message : "模拟 Worker 处理失败，已请求安全重建",
      } satisfies SimulationWorkerResponse);
    });
};

async function processSimulationRequest(event: MessageEvent<SimulationWorkerRequest>): Promise<void> {
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
    activeRegistrySnapshot = registry;
    // The entity state remains authoritative. Only the catalog-dependent lookup
    // is rebuilt at this boundary; no inventory, route, or production progress is recreated.
    if (runtime) replacePersistentSimulationRuntimeState(runtime, runtime.state, profiler);
    multicoreExecutor?.setRegistry(registry);
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
  const projectionBaseline = captureSimulationProjectionBaseline(previousState);
  const previousRevision = runtimeRevision;
  const multicorePlan = requestMulticorePlan(runtime.state, event.data.multicore);
  let multicoreUsed = false;
  let multicoreFallback = false;
  let result: { state: GameState; changed: boolean; cacheRebuilt: boolean };
  if (multicorePlan.enabled && multicorePlan.mode === "planet-phase") {
    const baseline = structuredClone(runtime.state);
    try {
      if (!multicoreExecutor || multicoreExecutorWorkerCount !== multicorePlan.workerCount) {
        multicoreExecutor?.terminate();
        multicoreExecutor = new BrowserMulticoreExecutor(multicorePlan.workerCount, undefined, activeRegistrySnapshot);
        multicoreExecutorWorkerCount = multicorePlan.workerCount;
      }
      multicoreExecutor.setRegistry(activeRegistrySnapshot);
      result = await advancePersistentSimulationRuntimeMulticore(runtime, simulationSeconds, wallSeconds, multicoreExecutor, profiler);
      multicoreUsed = true;
    } catch (error) {
      multicoreFallback = true;
      if (multicoreExecutor) {
        multicoreExecutor.terminate();
        multicoreExecutor = null;
        multicoreExecutorWorkerCount = 0;
      }
      replacePersistentSimulationRuntimeState(runtime, baseline, profiler);
      result = advancePersistentSimulationRuntime(runtime, simulationSeconds, wallSeconds, profiler);
      void error;
    }
  } else {
    if (multicoreExecutor) {
      multicoreExecutor.terminate();
      multicoreExecutor = null;
      multicoreExecutorWorkerCount = 0;
    }
    result = advancePersistentSimulationRuntime(runtime, simulationSeconds, wallSeconds, profiler);
  }
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
    ...(result.changed ? { projection: createSimulationProjection(projectionBaseline, result.state) } : {}),
    ...(event.data.multicore ? { multicore: {
      enabled: multicoreUsed,
      workerCount: multicoreUsed ? multicoreExecutor?.workerCount ?? multicorePlan.workerCount : multicorePlan.workerCount,
      fallback: multicoreFallback,
      reason: multicorePlan.reason,
    } } : {}),
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
  if (profile) {
    try {
      const raw = JSON.stringify(response);
      response.transferBytes = typeof TextEncoder === "undefined" ? raw.length : new TextEncoder().encode(raw).byteLength;
    } catch {
      response.transferBytes = 0;
    }
  }
  self.postMessage(response);
}

function requestMulticorePlan(state: GameState, options?: MulticoreSimulationOptions) {
  return planMulticoreSimulation(state, options);
}

export {};
