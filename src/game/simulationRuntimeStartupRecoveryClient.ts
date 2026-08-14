import type { ContentPackRuntimeSnapshot } from "./contentPacks";
import type {
  SimulationRuntimeDurableRecoveryReadRecord,
} from "./simulationRuntimeDurableRecovery";
import {
  SimulationRuntimeDurableReplayError,
  type SimulationRuntimeDurableReplayProgress,
  type SimulationRuntimeDurableReplayResult,
} from "./simulationRuntimeDurableReplay";
import {
  deserializeSimulationStateTransfer,
  serializeSimulationStateForTransfer,
  type SimulationStateTransfer,
} from "./simulationRuntimeProtocol";
import type { GameState } from "./types";
import type { SimulationWorkerResponse } from "./simulation.worker";

export interface SimulationRuntimeStartupReplayOptions {
  registry: ContentPackRuntimeSnapshot;
  onProgress?: (progress: SimulationRuntimeDurableReplayProgress) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface SimulationRuntimeStartupReplayResult {
  state: GameState;
  replay: SimulationRuntimeDurableReplayResult;
}

function abortError(): DOMException {
  return new DOMException("启动恢复已取消", "AbortError");
}

function asReplayError(response: SimulationWorkerResponse): SimulationRuntimeDurableReplayError {
  return new SimulationRuntimeDurableReplayError(
    (response.durableReplayError?.code as ConstructorParameters<typeof SimulationRuntimeDurableReplayError>[0]) ?? "engine-failed",
    response.durableReplayError?.message ?? "durable startup replay 失败",
  );
}

/**
 * Run T0 durable replay and obtain a post-replay checkpoint without ever
 * returning a full GameState in the replay response. The only full state
 * transfer is the explicit checkpoint barrier needed by offline settlement;
 * its parse happens after the Worker has proved the ordered replay.
 */
export function replaySimulationRuntimeStartupInWorker(
  state: GameState,
  recovery: SimulationRuntimeDurableRecoveryReadRecord,
  options: SimulationRuntimeStartupReplayOptions,
): Promise<SimulationRuntimeStartupReplayResult> {
  if (typeof Worker === "undefined") return Promise.reject(new Error("当前环境不支持启动恢复 Worker"));
  if (options.signal?.aborted) return Promise.reject(abortError());
  const worker = new Worker(new URL("./simulation.worker.ts", import.meta.url), {
    type: "module",
    name: "simulation-startup-recovery",
  });
  const sourceTransfer = serializeSimulationStateForTransfer(state);
  const cancelChannel = typeof MessageChannel === "undefined" ? null : new MessageChannel();
  const timeoutMs = Math.max(1_000, options.timeoutMs ?? 120_000);
  let requestId = 0;
  let settled = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let abortListener: (() => void) | null = null;
  const finish = (callback: () => void) => {
    if (settled) return;
    settled = true;
    if (timeout !== null) globalThis.clearTimeout(timeout);
    if (abortListener) options.signal?.removeEventListener("abort", abortListener);
    cancelChannel?.port1.close();
    cancelChannel?.port2.close();
    worker.terminate();
    callback();
  };
  return new Promise((resolve, reject) => {
    let replayResponse: SimulationWorkerResponse | null = null;
    const fail = (error: unknown) => finish(() => reject(error instanceof Error ? error : new Error("启动恢复 Worker 失败")));
    timeout = globalThis.setTimeout(() => fail(new Error("启动恢复 Worker 超时，原主存档未修改")), timeoutMs);
    abortListener = () => {
      try { cancelChannel?.port1.postMessage({ cancel: true }); } catch { /* worker may be gone */ }
      fail(abortError());
    };
    options.signal?.addEventListener("abort", abortListener, { once: true });
    worker.onerror = (event) => fail(new Error(event.message || "启动恢复 Worker 异常"));
    worker.onmessage = (event: MessageEvent<SimulationWorkerResponse>) => {
      const response = event.data;
      if (response.id !== requestId) return;
      if (response.durableReplayProgress) {
        options.onProgress?.(response.durableReplayProgress);
        return;
      }
      if (!replayResponse) {
        replayResponse = response;
        if (response.durableReplayError) {
          fail(asReplayError(response));
          return;
        }
        if (!response.durableReplayResult || !response.sourceCheckpointTransfer ||
          response.sourceCheckpointTransfer.buffer.byteLength !== response.sourceCheckpointTransfer.byteLength) {
          fail(new Error("启动恢复 replay 回执缺少原始 checkpoint ownership"));
          return;
        }
        requestId = 2;
        try {
          worker.postMessage({
            id: requestId,
            kind: "checkpoint",
            simulationSeconds: 0,
            wallSeconds: 0,
            registryFingerprint: options.registry.fingerprint,
            registry: options.registry,
            protocol: "projection",
            stateRevision: response.stateRevision,
          });
        } catch (error) {
          fail(error);
        }
        return;
      }
      if (!response.checkpoint || response.checkpoint.buffer.byteLength !== response.checkpoint.byteLength) {
        fail(new Error("启动恢复 checkpoint 回执无效"));
        return;
      }
      try {
        const nextState = deserializeSimulationStateTransfer(response.checkpoint);
        finish(() => resolve({ state: nextState, replay: replayResponse!.durableReplayResult! }));
      } catch (error) {
        fail(error);
      }
    };
    try {
      const request: Parameters<Worker["postMessage"]>[0] = {
        id: 1,
        kind: "replay-durable",
        stateTransfer: sourceTransfer,
        stateRevision: recovery.checkpoint.stateRevision,
        simulationSeconds: 0,
        wallSeconds: 0,
        registryFingerprint: options.registry.fingerprint,
        registry: options.registry,
        protocol: "projection",
        durableReplay: {
          sessionId: recovery.checkpoint.sessionId,
          generation: recovery.checkpoint.generation,
          checkpointLastSequence: recovery.checkpoint.lastSequence,
          checkpointStateRevision: recovery.checkpoint.stateRevision,
          entries: recovery.entries,
          pendingIntent: recovery.pendingIntent,
        },
        ...(cancelChannel ? { durableReplayCancelPort: cancelChannel.port2 } : {}),
      };
      const transfer: Transferable[] = [sourceTransfer.buffer];
      if (cancelChannel) transfer.push(cancelChannel.port2);
      worker.postMessage(request, transfer);
    } catch (error) {
      fail(error);
    }
  });
}
