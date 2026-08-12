import { describe, expect, it, vi } from "vitest";
import {
  LOCAL_SAVE_LEASE_DURATION_MS,
  canClaimLocalSaveWriterLease,
  createLocalSaveRevision,
  createLocalSaveWriterLease,
  inspectLocalSaveIdentity,
  localSaveConflictKeys,
  localSaveRevisionKey,
  parseLocalSaveConflictRecord,
  parseLocalSaveRevision,
  parseLocalSaveWriterLease,
} from "./localSaveCoordination";

describe("local save cross-tab coordination", () => {
  it("increments fencing tokens only when ownership changes", () => {
    const first = createLocalSaveWriterLease("tab-a", null, 1_000);
    expect(first).toEqual({
      schemaVersion: 1,
      ownerId: "tab-a",
      fencingToken: 1,
      heartbeatAt: 1_000,
      expiresAt: 1_000 + LOCAL_SAVE_LEASE_DURATION_MS,
    });
    const renewed = createLocalSaveWriterLease("tab-a", first, 2_000);
    expect(renewed.fencingToken).toBe(1);
    const takeover = createLocalSaveWriterLease("tab-b", renewed, renewed.expiresAt);
    expect(takeover.fencingToken).toBe(2);
  });

  it("allows only the owner or an expired lease to be claimed", () => {
    const lease = createLocalSaveWriterLease("tab-a", null, 10_000);
    expect(canClaimLocalSaveWriterLease(lease, "tab-a", 10_001)).toBe(true);
    expect(canClaimLocalSaveWriterLease(lease, "tab-b", lease.expiresAt - 1)).toBe(false);
    expect(canClaimLocalSaveWriterLease(lease, "tab-b", lease.expiresAt)).toBe(true);
  });

  it("reads envelope identity without parsing its large state body", () => {
    const parse = vi.spyOn(JSON, "parse");
    const value = '{"formatVersion":2,"savedAt":12345,"state":{"payload":"' + "x".repeat(10_000) + '"},"checksum":"abc_123"}';
    expect(inspectLocalSaveIdentity(value)).toEqual({ savedAt: 12345, checksum: "abc_123" });
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
  });

  it("creates monotonic per-key revisions for saves and tombstones", () => {
    const save = createLocalSaveRevision({
      saveKey: "dsp-idle-network.save.v1",
      previousRevision: 7,
      value: '{"savedAt":200,"state":{},"checksum":"savehash"}',
      writerId: "tab-a",
      fencingToken: 3,
      now: 300,
    });
    expect(save).toMatchObject({ revision: 8, savedAt: 200, checksum: "savehash", deleted: false, fencingToken: 3 });
    const tombstone = createLocalSaveRevision({ ...save, previousRevision: save.revision, value: null, writerId: "tab-a", now: 400 });
    expect(tombstone).toMatchObject({ revision: 9, savedAt: 0, checksum: null, deleted: true });
    expect(parseLocalSaveRevision(JSON.stringify(tombstone))).toEqual(tombstone);
    expect(parseLocalSaveRevision(JSON.stringify({ ...tombstone, revision: 0 }))).toBeNull();
  });

  it("uses encoded revision keys and isolated conflict save keys", () => {
    expect(localSaveRevisionKey("dsp-idle-network.slot.speedrun.1")).toContain("dsp-idle-network.slot.speedrun.1");
    const keys = localSaveConflictKeys("abc-123");
    expect(keys.candidate).not.toBe(keys.persisted);
    expect(keys.candidate).toContain(".conflict.abc-123.candidate");
  });

  it("strictly rejects malformed lease and conflict metadata", () => {
    expect(parseLocalSaveWriterLease(JSON.stringify({ schemaVersion: 1, ownerId: "x", fencingToken: 0, heartbeatAt: 1, expiresAt: 2 }))).toBeNull();
    expect(parseLocalSaveWriterLease("{broken")).toBeNull();
    expect(parseLocalSaveConflictRecord(JSON.stringify({ schemaVersion: 1, conflictId: "x" }))).toBeNull();
  });
});
