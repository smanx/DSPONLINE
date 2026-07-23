/// <reference lib="webworker" />

import { advanceSimulationSession, completeSimulationAdvanceSession, createSimulationAdvanceSession } from "./engine";
import type { OfflineSimulationWorkerRequest, OfflineSimulationWorkerResponse } from "./offlineSimulation";

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
    const session = createSimulationAdvanceSession(request.state, request.seconds);
    const runChunk = () => {
      if (activeId !== request.id || cancelled) {
        post({ type: "cancelled", id: request.id });
        return;
      }
      advanceSimulationSession(session, 256);
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
