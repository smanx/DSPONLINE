/// <reference lib="webworker" />

import { computeSaveStateChecksum } from "./saveEnvelopeIntegrity";

interface SaveWorkerRequest {
  id: number;
  formatVersion: number;
  savedAt: number;
  kind: "primary" | "slot" | "snapshot";
  reason?: string;
  state: unknown;
}

interface SaveWorkerResponse {
  id: number;
  raw?: string;
  durationMs?: number;
  summary?: {
    stateVersion: number;
    savedAt: number;
    elapsedSeconds: number;
    activePlanetId: string;
    entityCount: number;
    completedTechCount: number;
    structurePoints: number;
    uploadedWhiteMatrix: number;
    stateChecksum: string;
    computedStateChecksum: string;
    integrity: "valid";
  };
  error?: string;
}

self.onmessage = (event: MessageEvent<SaveWorkerRequest>) => {
  const startedAt = performance.now();
  try {
    const request = event.data;
    const state = request.state as Record<string, any>;
    const checksum = computeSaveStateChecksum(request.formatVersion, request.state);
    const envelope = {
      formatVersion: request.formatVersion,
      kind: request.kind,
      ...(request.reason ? { reason: request.reason } : {}),
      savedAt: request.savedAt,
      state: request.state,
      checksum,
    };
    self.postMessage({
      id: request.id,
      raw: JSON.stringify(envelope),
      durationMs: Math.max(0, performance.now() - startedAt),
      summary: {
        stateVersion: Number.isFinite(state.version) ? Math.max(0, Math.floor(state.version)) : 0,
        savedAt: request.savedAt,
        elapsedSeconds: Number.isFinite(state.elapsedSeconds) ? Math.max(0, Math.floor(state.elapsedSeconds)) : 0,
        activePlanetId: typeof state.activePlanetId === "string" ? state.activePlanetId : "home",
        entityCount: Array.isArray(state.entities) ? state.entities.length : 0,
        completedTechCount: Array.isArray(state.research?.completedTechIds) ? state.research.completedTechIds.length : 0,
        structurePoints: Number.isFinite(state.dysonSphere?.structurePoints) ? Math.max(0, Math.floor(state.dysonSphere.structurePoints)) : 0,
        uploadedWhiteMatrix: Number.isFinite(state.totalProduced?.universe_matrix) ? Math.max(0, Math.floor(state.totalProduced.universe_matrix)) : 0,
        stateChecksum: checksum,
        computedStateChecksum: checksum,
        integrity: "valid",
      },
    } satisfies SaveWorkerResponse);
  } catch (error) {
    self.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : "后台生成存档失败" } satisfies SaveWorkerResponse);
  }
};

export {};
