/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cloudSyncStatusFromUpload, readCloudSyncStatus, writeCloudSyncStatus } from "./cloudSyncStatus";
import { cloudSaveCapacityDetails } from "./cloudSaveCapacity";

describe("cloud sync status center state", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("isolates normal and speedrun slots and preserves the last successful timestamp across failures", () => {
    vi.spyOn(Date, "now").mockReturnValue(100);
    writeCloudSyncStatus(cloudSyncStatusFromUpload("normal", "main", "success", { message: "normal ok", cloud: { mode: "normal", slot: "main", revision: 2, updatedAt: 100, size: 10, checksum: "a".repeat(64), summary: null }, sizes: cloudSaveCapacityDetails(10) }));
    writeCloudSyncStatus(cloudSyncStatusFromUpload("speedrun", "1", "failed", { message: "speedrun failed", errorCode: "NETWORK", sizes: cloudSaveCapacityDetails(20) }));
    expect(readCloudSyncStatus("normal", "main")).toMatchObject({ state: "success", cloudRevision: 2, lastSuccessfulSyncAt: 100 });
    expect(readCloudSyncStatus("speedrun", "1")).toMatchObject({ state: "failed", cloudRevision: null, errorCode: "NETWORK" });
    expect(readCloudSyncStatus("normal", "1")).toBeNull();
  });

  it("stores diagnostics only and never accepts a save payload or credential field", () => {
    const snapshot = cloudSyncStatusFromUpload("normal", "2", "failed", { message: "too large", errorCode: "SAVE_SIZE_TOO_LARGE", sizes: cloudSaveCapacityDetails(70) });
    writeCloudSyncStatus(snapshot);
    const raw = window.sessionStorage.getItem("dsp-idle-network.cloud-sync-status.v1") ?? "";
    expect(raw).toContain("SAVE_SIZE_TOO_LARGE");
    const stored = JSON.parse(raw)["normal:2"] as Record<string, unknown>;
    expect(stored).not.toHaveProperty("payload");
    expect(stored).not.toHaveProperty("authorization");
    expect(stored).not.toHaveProperty("token");
    expect(stored).not.toHaveProperty("password");
    expect(stored).not.toHaveProperty("username");
  });
});
