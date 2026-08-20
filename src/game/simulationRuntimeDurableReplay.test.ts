import { describe, expect, it } from "vitest";
import { createContentPackRegistry, createContentPackRuntimeSnapshot } from "./contentPacks";
import {
  computeSimulationRuntimeDurableIntentSha256,
  computeSimulationRuntimeDurablePassiveSegmentSha256,
  finalizeSimulationRuntimeDurableRecoveryIntent,
  type SimulationRuntimeDurableJournalEntry,
  type SimulationRuntimeDurableOperationIntent,
} from "./simulationRuntimeDurableRecovery";
import {
  replaySimulationRuntimeDurableJournal,
  SimulationRuntimeDurableReplayError,
  type SimulationRuntimeDurableReplayPlan,
  type SimulationRuntimeDurableReplayProgress,
} from "./simulationRuntimeDurableReplay";
import type { SimulationCommandPatch } from "./simulationRuntimeProtocol";

const command = (baseRevision: number): SimulationCommandPatch => ({
  protocolVersion: 1,
  baseRevision,
  topLevelChanges: [{ path: ["paused"], operation: "set", value: false }],
  changedEntities: [],
  addedEntities: [],
  removedEntityIds: [],
  changedBelts: [],
  addedBelts: [],
  removedBeltIds: [],
});

async function intent(
  sequence: number,
  baseStateRevision: number,
  options: { simulationSeconds?: number; wallSeconds?: number; command?: SimulationCommandPatch | null } = {},
): Promise<SimulationRuntimeDurableOperationIntent> {
  const unsigned: Omit<SimulationRuntimeDurableOperationIntent, "intentSha256"> = {
    schemaVersion: 1,
    sessionId: "durable-replay-test",
    generation: 1,
    sequence,
    baseStateRevision,
    command: options.command ?? null,
    simulationSeconds: options.simulationSeconds ?? 1,
    wallSeconds: options.wallSeconds ?? options.simulationSeconds ?? 1,
    multicore: undefined,
    approximate: false,
    registry: createContentPackRuntimeSnapshot(createContentPackRegistry()),
    committedAtMs: 1_786_377_600_000 + sequence * 1_000,
  };
  return { ...unsigned, intentSha256: await computeSimulationRuntimeDurableIntentSha256(unsigned) };
}

async function fixture(): Promise<{ plan: SimulationRuntimeDurableReplayPlan; entries: SimulationRuntimeDurableJournalEntry[] }> {
  const passive1 = await intent(1, 1, { simulationSeconds: 1, wallSeconds: 0.5 });
  const passive2 = await intent(2, 2, { simulationSeconds: 1, wallSeconds: 0.5 });
  const passive3 = await intent(3, 3, { simulationSeconds: 2, wallSeconds: 1 });
  const atomic = await intent(4, 4, { simulationSeconds: 0, command: command(4) });
  const pending = await intent(5, 5, { simulationSeconds: 3, wallSeconds: 2 });
  let entries: SimulationRuntimeDurableJournalEntry[] = [];
  entries = await finalizeSimulationRuntimeDurableRecoveryIntent(entries, passive1, 2);
  entries = await finalizeSimulationRuntimeDurableRecoveryIntent(entries, passive2, 3);
  entries = await finalizeSimulationRuntimeDurableRecoveryIntent(entries, passive3, 4);
  entries = await finalizeSimulationRuntimeDurableRecoveryIntent(entries, atomic, 5);
  return {
    entries,
    plan: {
      sessionId: passive1.sessionId,
      generation: passive1.generation,
      checkpointLastSequence: 0,
      checkpointStateRevision: 1,
      entries,
      pendingIntent: pending,
    },
  };
}

describe("durable runtime Worker replay coordinator", () => {
  it("replays finalized RLE, an atomic command and one pending intent in exact order", async () => {
    const { plan } = await fixture();
    let revision = 1;
    let clock = 0;
    let pendingExecutions = 0;
    const calls: Array<{ kind: "passive" | "intent"; sequence: number; seconds: number }> = [];
    const progress: SimulationRuntimeDurableReplayProgress[] = [];
    const result = await replaySimulationRuntimeDurableJournal(plan, {
      executePassiveStep: async (step) => {
        expect(step.baseStateRevision).toBe(revision);
        calls.push({ kind: "passive", sequence: step.sequence, seconds: step.simulationSeconds });
        revision += 1;
        clock += 300;
        return revision;
      },
      executeIntent: async (next) => {
        expect(next.baseStateRevision).toBe(revision);
        calls.push({ kind: "intent", sequence: next.sequence, seconds: next.simulationSeconds });
        if (next === plan.pendingIntent) pendingExecutions += 1;
        revision += 1;
        clock += 300;
        return revision;
      },
      onProgress: (sample) => progress.push(sample),
      now: () => clock,
      yieldControl: async () => undefined,
    });
    expect(calls).toEqual([
      { kind: "passive", sequence: 1, seconds: 1 },
      { kind: "passive", sequence: 2, seconds: 1 },
      { kind: "passive", sequence: 3, seconds: 2 },
      { kind: "intent", sequence: 4, seconds: 0 },
      { kind: "intent", sequence: 5, seconds: 3 },
    ]);
    expect(result).toMatchObject({
      finalSequence: 5,
      finalStateRevision: 6,
      completedOperations: 5,
      totalOperations: 5,
      totalSimulationSeconds: 7,
      totalWallSeconds: 4,
      pendingIntentSha256: plan.pendingIntent!.intentSha256,
      pendingResultStateRevision: 6,
    });
    expect(pendingExecutions).toBe(1);
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.every((sample) => JSON.stringify(sample).length < 256)).toBe(true);
  });

  it("rejects a corrupt passive segment before executing any engine step", async () => {
    const { plan } = await fixture();
    const corrupt = structuredClone(plan);
    const segment = corrupt.entries[0];
    if (segment.kind !== "passive-segment") throw new Error("passive fixture missing");
    segment.replay.steps[0].simulationSeconds += 1;
    let calls = 0;
    await expect(replaySimulationRuntimeDurableJournal(corrupt, {
      executePassiveStep: async () => { calls += 1; return 0; },
      executeIntent: async () => { calls += 1; return 0; },
    })).rejects.toMatchObject({ code: "digest-mismatch" });
    expect(calls).toBe(0);
  });

  it("rejects result revision and pending digest mismatches without a committable result", async () => {
    const { plan } = await fixture();
    const wrongRevision = structuredClone(plan);
    const passive = wrongRevision.entries[0];
    if (passive.kind !== "passive-segment") throw new Error("passive fixture missing");
    passive.nextStateRevision += 1;
    const { segmentSha256: _segmentSha256, ...unsignedPassive } = passive;
    passive.segmentSha256 = await computeSimulationRuntimeDurablePassiveSegmentSha256(unsignedPassive);
    let revision = 1;
    await expect(replaySimulationRuntimeDurableJournal(wrongRevision, {
      executePassiveStep: async () => ++revision,
      executeIntent: async () => ++revision,
    })).rejects.toMatchObject({ code: "revision-mismatch" });

    const corruptPending = structuredClone(plan);
    corruptPending.entries = [];
    corruptPending.checkpointLastSequence = 4;
    corruptPending.checkpointStateRevision = 5;
    corruptPending.pendingIntent!.intentSha256 = "f".repeat(64);
    await expect(replaySimulationRuntimeDurableJournal(corruptPending, {
      executePassiveStep: async () => 0,
      executeIntent: async () => 0,
    })).rejects.toMatchObject({ code: "digest-mismatch" });
  });

  it("cancels between original RLE boundaries and never executes pending", async () => {
    const { plan } = await fixture();
    let revision = 1;
    let cancelled = false;
    let calls = 0;
    let pendingCalls = 0;
    const run = replaySimulationRuntimeDurableJournal(plan, {
      executePassiveStep: async () => { calls += 1; return ++revision; },
      executeIntent: async (next) => {
        if (next === plan.pendingIntent) pendingCalls += 1;
        calls += 1;
        return ++revision;
      },
      isCancelled: () => cancelled,
      yieldControl: async () => { cancelled = true; },
      now: () => calls * 100,
    });
    await expect(run).rejects.toEqual(expect.objectContaining<Partial<SimulationRuntimeDurableReplayError>>({ code: "cancelled" }));
    expect(calls).toBe(1);
    expect(pendingCalls).toBe(0);
  });
});
