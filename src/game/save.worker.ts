/// <reference lib="webworker" />

import { serializeSaveEnvelopeToTransfer } from "./saveTransfer";
import { projectPersistentSaveState } from "./saveProjection";
import { sha256Bytes } from "./payloadDigest";
import { deserializeSimulationStateTransfer } from "./simulationRuntimeProtocol";
import type { SaveWorkerRequest, SaveWorkerResponse } from "./saveWorkerProtocol";
import type { GameState } from "./types";

self.onmessage = async (event: MessageEvent<SaveWorkerRequest>) => {
  const startedAt = performance.now();
  try {
    const request = event.data;
    if ((request.state === undefined) === (request.stateTransfer === undefined)) {
      throw new Error("后台存档必须且只能提供一个权威状态来源");
    }
    const sourceState = request.stateTransfer
      ? deserializeSimulationStateTransfer(request.stateTransfer)
      : request.state as GameState;
    const state = sourceState as unknown as Record<string, any>;
    const persistent = projectPersistentSaveState(sourceState, request.contentPackRegistry);
    const serialized = serializeSaveEnvelopeToTransfer(persistent, {
      formatVersion: request.formatVersion,
      kind: request.kind,
      ...(request.reason ? { reason: request.reason } : {}),
      mode: state.mode === "speedrun" ? "speedrun" : "normal",
      slot: request.slot,
      savedAt: request.savedAt,
    });
    const response = {
      id: request.id,
      bytes: serialized.bytes,
      payloadChecksum: serialized.payloadChecksum,
      ...(request.includePayloadSha256 ? { payloadSha256: await sha256Bytes(serialized.bytes) } : {}),
      byteLength: serialized.byteLength,
      durationMs: Math.max(0, performance.now() - startedAt),
      ...(Number.isSafeInteger(request.sourceStateRevision) ? { sourceStateRevision: request.sourceStateRevision } : {}),
      ...(request.stateTransfer ? { sourceStateTransfer: request.stateTransfer } : {}),
      summary: {
        stateVersion: Number.isFinite(state.version) ? Math.max(0, Math.floor(state.version)) : 0,
        savedAt: request.savedAt,
        elapsedSeconds: Number.isFinite(state.elapsedSeconds) ? Math.max(0, Math.floor(state.elapsedSeconds)) : 0,
        activePlanetId: typeof state.activePlanetId === "string" ? state.activePlanetId : "home",
        entityCount: Array.isArray(state.entities) ? state.entities.length : 0,
        completedTechCount: Array.isArray(state.research?.completedTechIds) ? state.research.completedTechIds.length : 0,
        structurePoints: Number.isFinite(state.dysonSphere?.structurePoints) ? Math.max(0, Math.floor(state.dysonSphere.structurePoints)) : 0,
        uploadedWhiteMatrix: Number.isFinite(state.totalProduced?.universe_matrix) ? Math.max(0, Math.floor(state.totalProduced.universe_matrix)) : 0,
        stateChecksum: serialized.stateChecksum,
        computedStateChecksum: serialized.stateChecksum,
        integrity: "valid",
      },
    } satisfies SaveWorkerResponse;
    self.postMessage(response, [serialized.bytes, ...(request.stateTransfer ? [request.stateTransfer.buffer] : [])]);
  } catch (error) {
    const sourceStateTransfer = event.data.stateTransfer;
    self.postMessage({
      id: event.data.id,
      error: error instanceof Error ? error.message : "后台生成存档失败",
      ...(sourceStateTransfer ? { sourceStateTransfer } : {}),
    } satisfies SaveWorkerResponse, sourceStateTransfer ? [sourceStateTransfer.buffer] : []);
  }
};

export {};
