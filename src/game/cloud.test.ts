/** @vitest-environment jsdom */
/** @vitest-environment-options {"url":"https://public.example.test"} */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLOUD_SYNC_STORAGE_KEY,
  compareCloudSave,
  compareCloudSaveSummary,
  fetchCloudPublicStatus,
  getCloudSyncMarker,
  markCloudSaveSynchronized,
  resumeCloudSession,
  summarizeCloudPayload,
  uploadCloudSave,
  type CloudSaveMetadata,
} from "./cloud";
import { createInitialState, placeBuilding } from "./engine";
import { exportGame, importGame } from "./storage";
import { computeSaveStateChecksum } from "./saveEnvelopeIntegrity";

function payload(checksum: string, elapsedSeconds: number): string {
  return JSON.stringify({
    formatVersion: 2,
    savedAt: 1000 + elapsedSeconds,
    checksum,
    state: {
      version: 24,
      elapsedSeconds,
      activePlanetId: "home",
      entities: [{ id: "entity_1" }],
      research: { completedTechIds: ["electromagnetism"] },
      dysonSphere: { structurePoints: 2 },
      totalProduced: { universe_matrix: 3 },
    },
  });
}

function metadata(revision: number, cloudChecksum: string, source: string): CloudSaveMetadata {
  return {
    revision,
    updatedAt: 2000 + revision,
    size: source.length,
    checksum: cloudChecksum,
    summary: summarizeCloudPayload(source),
  };
}

describe("cloud save synchronization markers", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("allows anonymous public status discovery on HTTP without opening account transport", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      activity: { enabled: false, status: "disabled", serverNow: 1 },
    }), { status: 200, headers: { "content-type": "application/json" } }));

    await expect(fetchCloudPublicStatus()).resolves.toMatchObject({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/public-status", expect.any(Object));
    fetchMock.mockClear();
    await expect(resumeCloudSession()).resolves.toMatchObject({ status: "anonymous", message: null });
    expect(fetchMock).toHaveBeenCalledWith("/api/health", expect.any(Object));
  });

  it("compares unbound, synchronized and one-sided changes", () => {
    const local = payload("state-a", 100);
    const cloud = metadata(1, "cloud-a", local);
    expect(compareCloudSave("user_a", local, cloud).state).toBe("synced");

    markCloudSaveSynchronized("user_a", cloud, local);
    expect(compareCloudSave("user_a", local, cloud).state).toBe("synced");
    expect(compareCloudSave("user_a", payload("state-b", 200), cloud).state).toBe("local-newer");
    expect(compareCloudSave("user_a", local, { ...cloud, revision: 2, checksum: "cloud-b" }).state).toBe("cloud-newer");
  });

  it("compares a Worker-provided summary without parsing the payload again", () => {
    const local = payload("state-a", 100);
    const cloud = metadata(1, "cloud-a", local);
    const summary = summarizeCloudPayload(local)!;
    expect(compareCloudSaveSummary("user_summary", summary, cloud).state).toBe("synced");
    markCloudSaveSynchronized("user_summary", cloud);
    expect(compareCloudSaveSummary("user_summary", { ...summary, elapsedSeconds: 101 }, cloud).state).toBe("synced");
  });

  it("requires an explicit choice when local and cloud both changed", () => {
    const original = payload("state-a", 100);
    const cloud = metadata(1, "cloud-a", original);
    markCloudSaveSynchronized("user_a", cloud, original);
    const changedCloud = metadata(2, "cloud-b", payload("state-c", 300));
    const comparison = compareCloudSave("user_a", payload("state-b", 200), changedCloud);
    expect(comparison.state).toBe("conflict");
    expect(comparison.localChanged).toBe(true);
    expect(comparison.cloudChanged).toBe(true);
  });

  it("keeps markers isolated per cloud account", () => {
    const local = payload("state-a", 100);
    const cloud = metadata(1, "cloud-a", local);
    markCloudSaveSynchronized("user_a", cloud, local);
    expect(JSON.parse(window.localStorage.getItem(CLOUD_SYNC_STORAGE_KEY) ?? "{}")["user_a:main"].revision).toBe(1);
    expect(compareCloudSave("user_b", payload("state-b", 200), cloud).state).toBe("unbound");
  });

  it("keeps all four save-slot markers independent while reading a legacy main marker", () => {
    const mainPayload = payload("state-main", 100);
    const slotPayload = payload("state-slot-1", 250);
    const main = metadata(3, "cloud-main", mainPayload);
    const manual = { ...metadata(1, "cloud-slot-1", slotPayload), slot: "1" as const };
    markCloudSaveSynchronized("user_slots", main, mainPayload, "main");
    markCloudSaveSynchronized("user_slots", manual, slotPayload, "1");

    expect(compareCloudSave("user_slots", mainPayload, main, "main").state).toBe("synced");
    expect(compareCloudSave("user_slots", slotPayload, manual, "1").state).toBe("synced");
    expect(getCloudSyncMarker("user_slots", "main")?.revision).toBe(3);
    expect(getCloudSyncMarker("user_slots", "1")?.revision).toBe(1);

    window.localStorage.setItem(CLOUD_SYNC_STORAGE_KEY, JSON.stringify({
      legacy_user: { userId: "legacy_user", revision: 4, cloudChecksum: "legacy-cloud", stateChecksum: "state-main", syncedAt: 1 },
    }));
    expect(getCloudSyncMarker("legacy_user", "main")).toMatchObject({ revision: 4, slot: "main" });
    expect(getCloudSyncMarker("legacy_user", "1")).toBeNull();
  });

  it("reads once, re-saves, and uploads a legacy ordinary-building quantumTarget save", async () => {
    let state = createInitialState();
    state.construction.storage_mk1 = 1;
    state.construction.interstellar_logistics_station = 1;
    state = placeBuilding(state, "storage_mk1", { x: 0, y: 0 });
    state = placeBuilding(state, "interstellar_logistics_station", { x: 300, y: 0 });
    const ordinary = state.entities.find((entity) => entity.buildingId === "storage_mk1")!;
    const legacy = JSON.parse(exportGame(state));
    legacy.state.entities.find((entity: Record<string, unknown>) => entity.id === ordinary.id).quantumTarget = false;
    legacy.checksum = computeSaveStateChecksum(legacy.formatVersion, legacy.state);
    const loaded = importGame(JSON.stringify(legacy));
    expect(loaded).not.toBeNull();
    const payload = exportGame(loaded!);
    const saved = JSON.parse(payload);
    expect(saved.state.entities.find((entity: Record<string, unknown>) => entity.id === ordinary.id)).not.toHaveProperty("quantumTarget");

    const cloudSave = { revision: 1, updatedAt: 2, size: payload.length, checksum: "server-checksum", summary: null };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ cloudSave }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    await expect(uploadCloudSave(payload, 0)).resolves.toMatchObject({ revision: 1 });
    expect(fetchMock).toHaveBeenCalledWith("/api/cloud-save", expect.objectContaining({ method: "PUT" }));
    const request = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
    expect(JSON.parse(String(request.body)).payload).toBe(payload);
  });

});
