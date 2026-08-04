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
  error?: string;
}

self.onmessage = (event: MessageEvent<SaveWorkerRequest>) => {
  const startedAt = performance.now();
  try {
    const request = event.data;
    const envelope = {
      formatVersion: request.formatVersion,
      kind: request.kind,
      ...(request.reason ? { reason: request.reason } : {}),
      savedAt: request.savedAt,
      state: request.state,
      checksum: computeSaveStateChecksum(request.formatVersion, request.state),
    };
    self.postMessage({
      id: request.id,
      raw: JSON.stringify(envelope),
      durationMs: Math.max(0, performance.now() - startedAt),
    } satisfies SaveWorkerResponse);
  } catch (error) {
    self.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : "后台生成存档失败" } satisfies SaveWorkerResponse);
  }
};

export {};
