/// <reference lib="webworker" />

import { advanceSimulationSession, completeSimulationAdvanceSession, createSimulationAdvanceSession } from "./engine";
import { applyContentPackRuntimeSnapshot } from "./contentPacks";
import type { OfflineSimulationWorkerRequest, OfflineSimulationWorkerResponse } from "./offlineSimulation";
import { getNextOfflineCriticalEvent } from "./offlineCriticalEvents";

let activeId: number | null = null;
let cancelled = false;

function post(message: OfflineSimulationWorkerResponse): void {
  self.postMessage(message);
}

self.onmessage = (event: MessageEvent<OfflineSimulationWorkerRequest>) => {
  const request = event.data;
  if (request.type === "cancel") {
    if (activeId === request.id) cancelled = true;
    return;
  }
  activeId = request.id;
  cancelled = false;
  try {
    applyContentPackRuntimeSnapshot(request.registry);
    const session = createSimulationAdvanceSession(request.state, request.seconds);
    const runChunk = () => {
      if (activeId !== request.id || cancelled) {
        post({ type: "cancelled", id: request.id });
        return;
      }
      const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      do {
        const event = getNextOfflineCriticalEvent(session.state, session.remainingSeconds, 256);
        // The event only bounds an exact session chunk. It never skips the
        // engine's deterministic settlement steps, so there is no alternate
        // offline result to reconcile.
        advanceSimulationSession(session, event?.seconds ?? 256);
        if (activeId !== request.id || cancelled) {
          post({ type: "cancelled", id: request.id });
          return;
        }
      } while (session.remainingSeconds > 0 &&
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt < 75);
      const completedSeconds = session.totalSeconds - session.remainingSeconds;
      post({
        type: "progress",
        id: request.id,
        completedSeconds,
        totalSeconds: session.totalSeconds,
        progress: session.totalSeconds > 0 ? completedSeconds / session.totalSeconds : 1,
      });
      if (session.remainingSeconds > 0) {
        setTimeout(runChunk, 0);
        return;
      }
      post({ type: "complete", id: request.id, state: completeSimulationAdvanceSession(session), totalSeconds: session.totalSeconds });
      activeId = null;
    };
    runChunk();
  } catch (error) {
    post({ type: "error", id: request.id, message: error instanceof Error ? error.message : "离线计算失败" });
    activeId = null;
  }
};

export {};
