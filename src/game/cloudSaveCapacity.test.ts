import { describe, expect, it } from "vitest";
import { capacityDetailsFromCloudError, cloudSaveCapacityDetails, cloudSaveDiagnosticText, formatMebibytes } from "./cloudSaveCapacity";

describe("cloud save capacity diagnostics", () => {
  it("reports raw, compressed, expanded, limit and exact remaining bytes", () => {
    const details = cloudSaveCapacityDetails(33 * 1024 * 1024, 2 * 1024 * 1024);
    expect(details.rawFallbackAvailable).toBe(false);
    expect(details.compressionAvailable).toBe(true);
    expect(details.expandedBytes).toBe(details.originalBytes);
    expect(details.remainingPayloadBytes).toBe(details.payloadLimitBytes - details.originalBytes);
    expect(formatMebibytes(details.originalBytes)).toBe("33.00 MiB");
  });

  it("uses authoritative server-expanded size and limit for rejection guidance", () => {
    const details = capacityDetailsFromCloudError({
      originalBytes: 40,
      compressedBytes: 12,
      expandedBytes: 70,
      payloadLimitBytes: 64,
      compressedLimitBytes: 52,
      expandedLimitBytes: 64,
    }, 0);
    expect(details.overPayloadBytes).toBe(6);
    expect(details.remainingPayloadBytes).toBe(0);
  });

  it("copies only redacted metadata and never payload, token or account identity", () => {
    const diagnostic = cloudSaveDiagnosticText({
      mode: "speedrun",
      slot: "2",
      localRevision: 3,
      cloudRevision: 4,
      lastSuccessfulSyncAt: 1_800_000_000_000,
      status: "failed",
      errorCode: "REQUEST_EXPANDED_BODY_TOO_LARGE",
      sizes: cloudSaveCapacityDetails(40, 12),
    });
    expect(diagnostic).toContain("模式: speedrun");
    expect(diagnostic).toContain("槽位: 2");
    expect(diagnostic).not.toMatch(/payload|authorization|bearer|token|username|userId/i);
  });
});
