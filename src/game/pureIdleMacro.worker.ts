/// <reference lib="webworker" />

import {
  applyContentPackRuntimeSnapshot,
  type ContentPackRuntimeSnapshot,
} from "./contentPacks";
import {
  advancePureIdleMacroSession,
  createPureIdleMacroSession,
  finalizePureIdleMacroSession,
  type PureIdleMacroMode,
  type PureIdleMacroSession,
  type PureIdleMacroSummary,
} from "./pureIdleMacro";
import type { GameState } from "./types";

export type PureIdleMacroWorkerRequest =
  | {
    id: number;
    type: "initialize";
    state: GameState;
    mode: PureIdleMacroMode;
    registry: ContentPackRuntimeSnapshot;
  }
  | { id: number; type: "advance"; targetWallSeconds: number }
  | { id: number; type: "finalize"; targetWallSeconds: number };

export type PureIdleMacroWorkerResponse =
  | {
    id: number;
    type: "ready" | "advanced";
    summary: PureIdleMacroSummary;
    durationMs: number;
  }
  | {
    id: number;
    type: "finalized";
    summary: PureIdleMacroSummary;
    state: GameState;
    rawBytes: number;
    durationMs: number;
  }
  | {
    id: number;
    type: "error";
    operation: PureIdleMacroWorkerRequest["type"];
    message: string;
    recoverable: true;
    durationMs: number;
  };

let session: PureIdleMacroSession | null = null;
let registry: ContentPackRuntimeSnapshot | null = null;
let queue: Promise<void> = Promise.resolve();

self.onmessage = (event: MessageEvent<PureIdleMacroWorkerRequest>) => {
  queue = queue.then(() => processRequest(event.data)).catch((error) => {
    self.postMessage({
      id: event.data.id,
      type: "error",
      operation: event.data.type,
      message: error instanceof Error ? error.message : "纯挂机 Worker 发生未知错误",
      recoverable: true,
      durationMs: 0,
    } satisfies PureIdleMacroWorkerResponse);
  });
};

async function processRequest(request: PureIdleMacroWorkerRequest): Promise<void> {
  const startedAt = performance.now();
  try {
    if (request.type === "initialize") {
      applyContentPackRuntimeSnapshot(request.registry);
      registry = request.registry;
      session = createPureIdleMacroSession(request.state, request.mode);
      self.postMessage({
        id: request.id,
        type: "ready",
        summary: advancePureIdleMacroSession(session, 0),
        durationMs: Math.max(0, performance.now() - startedAt),
      } satisfies PureIdleMacroWorkerResponse);
      return;
    }
    if (!session || !registry) throw new Error("纯挂机 Worker 尚未完成校准");
    if (request.type === "advance") {
      self.postMessage({
        id: request.id,
        type: "advanced",
        summary: advancePureIdleMacroSession(session, request.targetWallSeconds),
        durationMs: Math.max(0, performance.now() - startedAt),
      } satisfies PureIdleMacroWorkerResponse);
      return;
    }
    const result = finalizePureIdleMacroSession(session, request.targetWallSeconds, registry.registry);
    self.postMessage({
      id: request.id,
      type: "finalized",
      summary: result.summary,
      state: result.state,
      rawBytes: result.rawBytes,
      durationMs: Math.max(0, performance.now() - startedAt),
    } satisfies PureIdleMacroWorkerResponse);
  } catch (error) {
    self.postMessage({
      id: request.id,
      type: "error",
      operation: request.type,
      message: error instanceof Error ? error.message : "纯挂机 Worker 处理失败",
      recoverable: true,
      durationMs: Math.max(0, performance.now() - startedAt),
    } satisfies PureIdleMacroWorkerResponse);
  }
}

export {};
