import { describe, expect, it } from "vitest";
import { createContentPackRegistry, createContentPackRuntimeSnapshot } from "./contentPacks";
import {
  consumeSimulationRuntimeDurableUiAcknowledgement,
  createSimulationRuntimeDurableDispatch,
  markSimulationRuntimeDurableIntentFinalized,
  markSimulationRuntimeDurableIntentStaged,
  markSimulationRuntimeDurableStageFailed,
  markSimulationRuntimeDurableWorkerDispatched,
  markSimulationRuntimeDurableWorkerResult,
  requireSimulationRuntimeDurableRecovery,
  type SimulationRuntimeDurableIntentProof,
} from "./simulationRuntimeDurableCoordinator";
import type { SimulationRuntimeDurableOperationIntent } from "./simulationRuntimeDurableRecovery";

function fixture(): { intent: SimulationRuntimeDurableOperationIntent; staged: SimulationRuntimeDurableIntentProof; finalized: SimulationRuntimeDurableIntentProof } {
  const registry = createContentPackRuntimeSnapshot(createContentPackRegistry());
  const intent: SimulationRuntimeDurableOperationIntent = {
    schemaVersion: 1,
    sessionId: "durable-coordinator-test",
    generation: 1,
    sequence: 7,
    intentSha256: "a".repeat(64),
    baseStateRevision: 12,
    command: null,
    simulationSeconds: 1,
    wallSeconds: 1,
    multicore: undefined,
    approximate: false,
    registry,
    committedAtMs: 1_786_377_600_000,
  };
  const staged: SimulationRuntimeDurableIntentProof = {
    sessionId: intent.sessionId,
    generation: intent.generation,
    sequence: intent.sequence,
    intentSha256: intent.intentSha256,
    status: "pending",
  };
  return {
    intent,
    staged,
    finalized: { ...staged, status: "finalized", resultStateRevision: 13 },
  };
}

describe("simulation runtime durable dispatch coordinator", () => {
  it("permits exactly WAL readback -> Worker -> finalize readback -> one UI ACK", () => {
    const { intent, staged, finalized } = fixture();
    let state = createSimulationRuntimeDurableDispatch(intent);
    expect(() => markSimulationRuntimeDurableWorkerDispatched(state)).toThrow(/read-back-verified WAL/);
    expect(() => consumeSimulationRuntimeDurableUiAcknowledgement(state)).toThrow(/blocked/);
    state = markSimulationRuntimeDurableIntentStaged(state, staged);
    state = markSimulationRuntimeDurableWorkerDispatched(state);
    state = markSimulationRuntimeDurableWorkerResult(state, 13);
    expect(() => consumeSimulationRuntimeDurableUiAcknowledgement(state)).toThrow(/blocked/);
    state = markSimulationRuntimeDurableIntentFinalized(state, finalized);
    const first = consumeSimulationRuntimeDurableUiAcknowledgement(state);
    expect(first.acknowledge).toBe(true);
    expect(consumeSimulationRuntimeDurableUiAcknowledgement(first.state).acknowledge).toBe(false);
  });

  it("retains debt/command for retry when WAL staging fails", () => {
    const { intent } = fixture();
    const failed = markSimulationRuntimeDurableStageFailed(createSimulationRuntimeDurableDispatch(intent), "quota");
    expect(failed).toMatchObject({ phase: "stage-retry", intent, failure: "quota" });
    expect(() => markSimulationRuntimeDurableWorkerDispatched(failed)).toThrow();
  });

  it.each(["postMessage uncertain", "response lost", "finalize quota"])("requires checkpoint+journal recovery after %s", (failure) => {
    const { intent, staged } = fixture();
    let state = markSimulationRuntimeDurableIntentStaged(createSimulationRuntimeDurableDispatch(intent), staged);
    if (failure !== "postMessage uncertain") state = markSimulationRuntimeDurableWorkerDispatched(state);
    if (failure === "finalize quota") state = markSimulationRuntimeDurableWorkerResult(state, 13);
    const recovery = requireSimulationRuntimeDurableRecovery(state, failure);
    expect(recovery).toMatchObject({ phase: "recovery-required", intent, failure });
    expect(() => consumeSimulationRuntimeDurableUiAcknowledgement(recovery)).toThrow(/blocked/);
  });

  it("accepts lost-response proof retries idempotently and rejects cross-intent proofs", () => {
    const { intent, staged, finalized } = fixture();
    const firstStage = markSimulationRuntimeDurableIntentStaged(createSimulationRuntimeDurableDispatch(intent), staged);
    expect(markSimulationRuntimeDurableIntentStaged(firstStage, { ...staged })).toBe(firstStage);
    const finalizing = markSimulationRuntimeDurableWorkerResult(markSimulationRuntimeDurableWorkerDispatched(firstStage), 13);
    const firstFinalize = markSimulationRuntimeDurableIntentFinalized(finalizing, finalized);
    expect(markSimulationRuntimeDurableIntentFinalized(firstFinalize, { ...finalized })).toBe(firstFinalize);
    expect(() => markSimulationRuntimeDurableIntentStaged(createSimulationRuntimeDurableDispatch(intent), {
      ...staged,
      intentSha256: "b".repeat(64),
    })).toThrow(/does not match/);
  });
});
