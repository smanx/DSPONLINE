import type { GameState } from "./types";
import { OFFLINE_PERFORMANCE_SESSION_KEY } from "./performanceMonitor";
import { createContentPackRuntimeSnapshot, loadContentPackRegistry, type ContentPackRuntimeSnapshot } from "./contentPacks";

export type OfflineSimulationWorkerRequest =
  | { type: "start"; id: number; state: GameState; seconds: number; registry: ContentPackRuntimeSnapshot }
  | { type: "cancel"; id: number };

export type OfflineSimulationWorkerResponse =
  | { type: "progress"; id: number; completedSeconds: number; totalSeconds: number; progress: number }
  | { type: "complete"; id: number; state: GameState; totalSeconds: number }
  | { type: "cancelled"; id: number }
  | { type: "error"; id: number; message: string };

export interface OfflineSimulationProgress {
  completedSeconds: number;
  totalSeconds: number;
  progress: number;
}

export function runOfflineSimulationInWorker(
  state: GameState,
  seconds: number,
  options: { signal?: AbortSignal; onProgress?: (progress: OfflineSimulationProgress) => void; registry?: ContentPackRuntimeSnapshot } = {},
): Promise<GameState> {
  if (typeof Worker === "undefined") return Promise.reject(new Error("当前浏览器不支持离线计算 Worker"));
  const worker = new Worker(new URL("./offlineSimulation.worker.ts", import.meta.url), { type: "module", name: "offline-simulation" });
  const id = Date.now() + Math.floor(Math.random() * 1_000_000);
  const startedAt = performance.now();
  return new Promise<GameState>((resolve, reject) => {
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
        finish(() => resolve(message.state));
        return;
      }
      if (message.type === "cancelled") {
        finish(() => reject(new DOMException("离线计算已取消", "AbortError")));
        return;
      }
      finish(() => reject(new Error(message.message)));
    };
    worker.onerror = () => finish(() => reject(new Error("离线计算 Worker 运行失败，未保存任何半成品")));
    const registry = options.registry ?? createContentPackRuntimeSnapshot(loadContentPackRegistry());
    worker.postMessage({ type: "start", id, state, seconds, registry } satisfies OfflineSimulationWorkerRequest);
  });
}
