import { describe, expect, it } from "vitest";
import { createContentPackRegistry, createContentPackRuntimeSnapshot } from "./contentPacks";
import {
  advanceSimulationRuntimeDurableAppHead,
  createSimulationRuntimeDurableAppHead,
  createSimulationRuntimeDurablePrimaryCheckpoint,
  createSimulationRuntimeDurableUnsignedIntent,
  type SimulationRuntimeDurableAppHead,
} from "./simulationRuntimeDurableAppState";

describe("simulation runtime durable App head", () => {
  const registry = createContentPackRuntimeSnapshot(createContentPackRegistry());
  const baseIdentity = { mode: "normal" as const, savedAt: 1_786_377_600_000, checksum: "a".repeat(16), revision: 4 };

  it("binds initialization proof to the verified post-save primary identity", () => {
    const checkpoint = createSimulationRuntimeDurablePrimaryCheckpoint({
      baseIdentity,
      sessionId: "app-head-test",
      stateRevision: 8,
      registry,
      committedAtMs: baseIdentity.savedAt,
    });
    const head = createSimulationRuntimeDurableAppHead(checkpoint, {
      schemaVersion: 1,
      sessionId: checkpoint.sessionId,
      generation: 1,
      sequence: 0,
      stateRevision: 8,
      checkpointSource: "primary",
      primaryStateChecksum: baseIdentity.checksum,
      primaryRevision: baseIdentity.revision,
      journalSha256: "b".repeat(64),
      journalByteLength: 2,
      pending: false,
      finalized: true,
    });
    expect(head).toMatchObject({ sequence: 0, stateRevision: 8, baseIdentity });
    expect(() => createSimulationRuntimeDurableAppHead(checkpoint, {
      schemaVersion: 1,
      sessionId: checkpoint.sessionId,
      generation: 1,
      sequence: 0,
      stateRevision: 8,
      checkpointSource: "primary",
      primaryStateChecksum: "wrong",
      primaryRevision: baseIdentity.revision,
      journalSha256: "b".repeat(64),
      journalByteLength: 2,
      pending: false,
      finalized: true,
    })).toThrow(/不匹配/);
  });

  it("allocates one ordered sequence and advances only on matching finalized proof", () => {
    const checkpoint = createSimulationRuntimeDurablePrimaryCheckpoint({ baseIdentity, sessionId: "ordered", stateRevision: 3, registry, committedAtMs: 4 });
    const head = createSimulationRuntimeDurableAppHead(checkpoint, {
      schemaVersion: 1, sessionId: "ordered", generation: 1, sequence: 0, stateRevision: 3,
      checkpointSource: "primary", primaryStateChecksum: baseIdentity.checksum, primaryRevision: baseIdentity.revision,
      journalSha256: "c".repeat(64), journalByteLength: 2, pending: false, finalized: true,
    });
    const unsigned = createSimulationRuntimeDurableUnsignedIntent(head, {
      command: null, simulationSeconds: 1, wallSeconds: 1, multicore: undefined, approximate: false, registry, committedAtMs: 5,
    });
    expect(unsigned).toMatchObject({ sequence: 1, baseStateRevision: 3 });
    const intent = { ...unsigned, intentSha256: "d".repeat(64) };
    const proof = {
      schemaVersion: 1 as const, sessionId: "ordered", generation: 1, sequence: 1, stateRevision: 4,
      checkpointSource: "primary" as const, primaryStateChecksum: baseIdentity.checksum, primaryRevision: baseIdentity.revision,
      journalSha256: "e".repeat(64), journalByteLength: 64, pending: false, finalized: true,
      intentSha256: intent.intentSha256, resultStateRevision: 4,
    };
    expect(advanceSimulationRuntimeDurableAppHead(head, intent, proof)).toMatchObject({ sequence: 1, stateRevision: 4 });
    expect(() => advanceSimulationRuntimeDurableAppHead(head, intent, { ...proof, resultStateRevision: 5 })).toThrow(/不匹配/);
    expect(() => advanceSimulationRuntimeDurableAppHead(head, intent, {
      ...proof,
      primaryStateChecksum: "wrong-primary",
    })).toThrow(/不匹配/);
  });

  it("advances a transfer-based recovery head on a matching transfer proof", () => {
    // A durable post-operation rollover absorbs an oversized intent into a
    // transfer checkpoint (source "transfer"). Subsequent journal-merge
    // finalizes continue on that transfer head, whose proof carries no primary
    // checksum binding; the App head must accept it without regressing to a
    // false mismatch pause.
    const transferHead: SimulationRuntimeDurableAppHead = {
      baseIdentity,
      sessionId: "transfer-head",
      generation: 2,
      sequence: 0,
      stateRevision: 3,
      registryFingerprint: registry.fingerprint,
    };
    const unsigned = createSimulationRuntimeDurableUnsignedIntent(transferHead, {
      command: null, simulationSeconds: 1, wallSeconds: 1, multicore: undefined, approximate: false, registry, committedAtMs: 5,
    });
    expect(unsigned).toMatchObject({ sessionId: "transfer-head", generation: 2, sequence: 1, baseStateRevision: 3 });
    const intent = { ...unsigned, intentSha256: "d".repeat(64) };
    const transferProof = {
      schemaVersion: 1 as const, sessionId: "transfer-head", generation: 2, sequence: 1, stateRevision: 4,
      checkpointSource: "transfer" as const, journalSha256: "e".repeat(64), journalByteLength: 64,
      pending: false, finalized: true, intentSha256: intent.intentSha256, resultStateRevision: 4,
    };
    expect(advanceSimulationRuntimeDurableAppHead(transferHead, intent, transferProof))
      .toMatchObject({ generation: 2, sequence: 1, stateRevision: 4 });
    // A transfer proof still must match session/generation/sequence/revision.
    expect(() => advanceSimulationRuntimeDurableAppHead(transferHead, intent, {
      ...transferProof,
      resultStateRevision: 5,
    })).toThrow(/不匹配/);
  });

  it("rejects malformed primary, registry and session metadata before initialization", () => {
    expect(() => createSimulationRuntimeDurablePrimaryCheckpoint({
      baseIdentity: { ...baseIdentity, checksum: "" }, sessionId: "valid", stateRevision: 0, registry, committedAtMs: 0,
    })).toThrow(/base identity/);
    expect(() => createSimulationRuntimeDurablePrimaryCheckpoint({
      baseIdentity, sessionId: "invalid session", stateRevision: 0, registry, committedAtMs: 0,
    })).toThrow(/session id/);
    expect(() => createSimulationRuntimeDurablePrimaryCheckpoint({
      baseIdentity, sessionId: "valid", stateRevision: 0, registry: { ...registry, fingerprint: "" }, committedAtMs: 0,
    })).toThrow(/registry/);
  });
});
