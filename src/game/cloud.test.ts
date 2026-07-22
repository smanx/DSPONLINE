/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from "vitest";
import {
  CLOUD_SYNC_STORAGE_KEY,
  compareCloudSave,
  getCloudSyncMarker,
  markCloudSaveSynchronized,
  summarizeCloudPayload,
  type CloudSaveMetadata,
} from "./cloud";

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
  beforeEach(() => window.localStorage.clear());

  it("compares unbound, synchronized and one-sided changes", () => {
    const local = payload("state-a", 100);
    const cloud = metadata(1, "cloud-a", local);
    expect(compareCloudSave("user_a", local, cloud).state).toBe("synced");

    markCloudSaveSynchronized("user_a", cloud, local);
    expect(compareCloudSave("user_a", local, cloud).state).toBe("synced");
    expect(compareCloudSave("user_a", payload("state-b", 200), cloud).state).toBe("local-newer");
    expect(compareCloudSave("user_a", local, { ...cloud, revision: 2, checksum: "cloud-b" }).state).toBe("cloud-newer");
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
});
