/// <reference lib="webworker" />

import { applyContentPackRegistry, type ContentPackRegistry } from "./contentPacks";
import { inspectSave, type SaveInspection, type SaveSlotSummary, type SaveSnapshotSummary } from "./storage";
import type { PlanetId } from "./types";

interface SaveSummaryWorkerEntry {
  key: string;
  kind: "slot" | "snapshot";
  slotId?: 1 | 2 | 3;
  raw: string;
}

interface SaveSummaryWorkerRequest {
  id: number;
  registry: ContentPackRegistry;
  entries: SaveSummaryWorkerEntry[];
}

interface SaveSummaryWorkerResponse {
  id: number;
  summaries: Array<{ key: string; summary: SaveSlotSummary | SaveSnapshotSummary }>;
}

function fallbackSummary(inspection: SaveInspection) {
  return inspection.summary ?? {
    savedAt: inspection.savedAt ?? 0,
    elapsedSeconds: 0,
    completedTechCount: 0,
    structurePoints: 0,
    activePlanetId: "home" as PlanetId,
  };
}

self.onmessage = (event: MessageEvent<SaveSummaryWorkerRequest>) => {
  const request = event.data;
  try {
    applyContentPackRegistry(request.registry);
    const summaries = request.entries.flatMap((entry) => {
      try {
        const inspection = inspectSave(entry.raw, request.registry);
        const base = fallbackSummary(inspection);
        const summary = entry.kind === "slot"
          ? { slotId: entry.slotId!, ...base, integrity: inspection.integrity, valid: inspection.valid, issues: inspection.issues } satisfies SaveSlotSummary
          : {
            id: entry.key.slice("dsp-idle-network.save.v1.snapshot.".length),
            ...base,
            reason: (() => {
              try {
                const parsed = JSON.parse(entry.raw) as { reason?: unknown };
                return typeof parsed.reason === "string" && parsed.reason ? parsed.reason : "自动快照";
              } catch {
                return "自动快照";
              }
            })(),
            integrity: inspection.integrity,
            valid: inspection.valid,
            issues: inspection.issues,
          } satisfies SaveSnapshotSummary;
        return [{ key: entry.key, summary }];
      } catch {
        return [];
      }
    });
    self.postMessage({ id: request.id, summaries } satisfies SaveSummaryWorkerResponse);
  } catch (error) {
    self.postMessage({ id: request.id, summaries: [], error: error instanceof Error ? error.message : "存档摘要校验失败" });
  }
};

export type { SaveSummaryWorkerEntry, SaveSummaryWorkerRequest, SaveSummaryWorkerResponse };
