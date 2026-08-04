import type { GameSettings, GameState } from "./types";
import { OFFLINE_PERFORMANCE_SESSION_KEY } from "./performanceMonitor";
import { createContentPackRuntimeSnapshot, loadContentPackRegistry, type ContentPackRuntimeSnapshot } from "./contentPacks";
import { advanceSimulationSession, type SimulationAdvanceSession } from "./engine";
import { getNextOfflineCriticalEvent } from "./offlineCriticalEvents";
import {
  runOfflineApproximation,
  type OfflineApproximationReport,
} from "./offlineApproximation";

export type OfflineSimulationWorkerRequest =
  | { type: "start"; id: number; state: GameState; seconds: number; registry: ContentPackRuntimeSnapshot; approximate?: boolean }
  | {
    type: "prepare-upload";
    id: number;
    raw: string;
    now: number;
    menuSettings?: Partial<GameSettings>;
    returningRewardClaimed: boolean;
    skipOffline?: boolean;
    registry: ContentPackRuntimeSnapshot;
  }
  | { type: "cancel"; id: number };

export type OfflineSimulationWorkerResponse =
  | { type: "progress"; id: number; completedSeconds: number; totalSeconds: number; progress: number }
  | { type: "complete"; id: number; state: GameState; totalSeconds: number; approximation?: OfflineApproximationReport }
  | { type: "upload-complete"; id: number; payload: string; summary: CloudUploadSummary; offlineSeconds: number; returningReward: Array<{ itemId: string; amount: number }> }
  | { type: "cancelled"; id: number }
  | { type: "error"; id: number; message: string };

export interface OfflineSimulationProgress {
  completedSeconds: number;
  totalSeconds: number;
  progress: number;
}

export interface OfflineSimulationRunResult {
  state: GameState;
  approximation?: OfflineApproximationReport;
}

export interface OfflineSimulationChunkOptions {
  /** Maximum amount of deterministic session work requested per worker turn. */
  maximumWindowSeconds?: number;
  /** Keep critical-event scheduling for sessions whose engine step is larger than a hub boundary. */
  scanCriticalEvents?: boolean;
}

/**
 * Advance one bounded exact chunk without inventing an alternate simulation
 * formula. Sessions with a five-second hub step already settle every
 * boundary inside the engine; scanning every machine for a cycle boundary in
 * that case only adds O(entityCount) work and can never make the engine settle
 * an extra phase. Larger-step sessions retain the conservative event hint.
 */
export function advanceOfflineSimulationChunk(
  session: SimulationAdvanceSession,
  options: OfflineSimulationChunkOptions = {},
): number {
  const maximumWindowSeconds = Math.max(1, Math.floor(options.maximumWindowSeconds ?? 256));
  const scanCriticalEvents = options.scanCriticalEvents ?? session.stepSize > 5;
  const event = scanCriticalEvents
    ? getNextOfflineCriticalEvent(session.state, session.remainingSeconds, maximumWindowSeconds)
    : null;
  return advanceSimulationSession(session, event?.seconds ?? maximumWindowSeconds);
}

export interface CloudUploadSummary {
  stateVersion: number;
  savedAt: number;
  elapsedSeconds: number;
  activePlanetId: string;
  entityCount: number;
  completedTechCount: number;
  structurePoints: number;
  uploadedWhiteMatrix: number;
  stateChecksum: string | null;
  computedStateChecksum?: string | null;
  integrity?: "valid" | "invalid";
}

export function runOfflineSimulationInWorker(
  state: GameState,
  seconds: number,
  options: { signal?: AbortSignal; onProgress?: (progress: OfflineSimulationProgress) => void; registry?: ContentPackRuntimeSnapshot; approximate?: boolean; onApproximationReport?: (report: OfflineApproximationReport) => void } = {},
): Promise<GameState> {
  return runOfflineSimulationInWorkerDetailed(state, seconds, options).then((result) => result.state);
}

export function runOfflineSimulationInWorkerDetailed(
  state: GameState,
  seconds: number,
  options: { signal?: AbortSignal; onProgress?: (progress: OfflineSimulationProgress) => void; registry?: ContentPackRuntimeSnapshot; approximate?: boolean; onApproximationReport?: (report: OfflineApproximationReport) => void } = {},
): Promise<OfflineSimulationRunResult> {
  if (typeof Worker === "undefined") return Promise.reject(new Error("当前浏览器不支持离线计算 Worker"));
  const worker = new Worker(new URL("./offlineSimulation.worker.ts", import.meta.url), { type: "module", name: "offline-simulation" });
  const id = Date.now() + Math.floor(Math.random() * 1_000_000);
  const startedAt = performance.now();
  return new Promise<OfflineSimulationRunResult>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", abort);
      worker.terminate();
      callback();
    };
    const abort = () => {
      try { worker.postMessage({ type: "cancel", id } satisfies OfflineSimulationWorkerRequest); } catch { /* worker may already be gone */ }
      finish(() => reject(new DOMException("离线计算已取消", "AbortError")));
    };
    if (options.signal?.aborted) {
      abort();
      return;
    }
    options.signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<OfflineSimulationWorkerResponse>) => {
      const message = event.data;
      if (message.id !== id) return;
      if (message.type === "progress") {
        options.onProgress?.(message);
        return;
      }
      if (message.type === "complete") {
        try { window.sessionStorage.setItem(OFFLINE_PERFORMANCE_SESSION_KEY, String(Math.max(0, performance.now() - startedAt))); } catch { /* optional diagnostics */ }
        if (message.approximation) options.onApproximationReport?.(message.approximation);
        finish(() => resolve({ state: message.state, approximation: message.approximation }));
        return;
      }
      if (message.type === "cancelled") {
        finish(() => reject(new DOMException("离线计算已取消", "AbortError")));
        return;
      }
      if (message.type === "error") finish(() => reject(new Error(message.message)));
    };
    worker.onerror = () => finish(() => reject(new Error("离线计算 Worker 运行失败，未保存任何半成品")));
    const registry = options.registry ?? createContentPackRuntimeSnapshot(loadContentPackRegistry());
    worker.postMessage({ type: "start", id, state, seconds, registry, approximate: options.approximate === true } satisfies OfflineSimulationWorkerRequest);
  });
}

/**
 * Prepare a cloud payload without loading, simulating or serializing the save
 * on the UI thread. The Worker returns the one final checksum-verified payload
 * used by local persistence, conflict comparison and upload.
 */
export function prepareCloudUploadInWorker(
  raw: string,
  options: {
    signal?: AbortSignal;
    now?: number;
    menuSettings?: Partial<GameSettings>;
    returningRewardClaimed?: boolean;
    skipOffline?: boolean;
    registry?: ContentPackRuntimeSnapshot;
    onProgress?: (progress: OfflineSimulationProgress) => void;
  } = {},
): Promise<{ payload: string; summary: CloudUploadSummary; offlineSeconds: number; returningReward: Array<{ itemId: string; amount: number }> }> {
  if (typeof Worker === "undefined") return Promise.reject(new Error("当前浏览器不支持云存档后台 Worker"));
  const worker = new Worker(new URL("./offlineSimulation.worker.ts", import.meta.url), { type: "module", name: "cloud-upload-preparation" });
  const id = Date.now() + Math.floor(Math.random() * 1_000_000);
  const registry = options.registry ?? createContentPackRuntimeSnapshot(loadContentPackRegistry());
  const now = options.now ?? Date.now();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", abort);
      worker.terminate();
      callback();
    };
    const abort = () => {
      try { worker.postMessage({ type: "cancel", id } satisfies OfflineSimulationWorkerRequest); } catch { /* worker may already be gone */ }
      finish(() => reject(new DOMException("云存档准备已取消", "AbortError")));
    };
    if (options.signal?.aborted) {
      abort();
      return;
    }
    options.signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<OfflineSimulationWorkerResponse>) => {
      const message = event.data;
      if (message.id !== id) return;
      if (message.type === "progress") {
        options.onProgress?.(message);
        return;
      }
      if (message.type === "upload-complete") {
        finish(() => resolve({ payload: message.payload, summary: message.summary, offlineSeconds: message.offlineSeconds, returningReward: message.returningReward }));
        return;
      }
      if (message.type === "cancelled") {
        finish(() => reject(new DOMException("云存档准备已取消", "AbortError")));
        return;
      }
      if (message.type === "error") finish(() => reject(new Error(message.message)));
    };
    worker.onerror = () => finish(() => reject(new Error("云存档后台 Worker 运行失败，未修改本地存档")));
    try {
      worker.postMessage({
        type: "prepare-upload",
        id,
        raw,
        now,
        menuSettings: options.menuSettings,
        returningRewardClaimed: options.returningRewardClaimed ?? false,
        skipOffline: options.skipOffline === true,
        registry,
      } satisfies OfflineSimulationWorkerRequest);
    } catch {
      finish(() => reject(new Error("云存档无法交给后台 Worker 处理，未修改本地存档")));
    }
  });
}
