/// <reference lib="webworker" />

import { applyContentPackRegistry, type ContentPackRegistry } from "./contentPacks";
import { inspectSave, type SaveInspection } from "./storage";

interface SaveInspectionWorkerRequest {
  id: number;
  raw: string;
  registry: ContentPackRegistry;
}

interface SaveInspectionWorkerResponse {
  id: number;
  inspection?: SaveInspection;
  error?: string;
}

self.onmessage = (event: MessageEvent<SaveInspectionWorkerRequest>) => {
  const request = event.data;
  try {
    applyContentPackRegistry(request.registry);
    const inspection = inspectSave(request.raw, request.registry);
    self.postMessage({ id: request.id, inspection } satisfies SaveInspectionWorkerResponse);
  } catch (error) {
    self.postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : "后台存档检查失败",
    } satisfies SaveInspectionWorkerResponse);
  }
};

export type { SaveInspectionWorkerRequest, SaveInspectionWorkerResponse };
