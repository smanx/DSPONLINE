import { validateContentPackRuntimeSnapshot, type ContentPackRuntimeSnapshot } from "./contentPacks";
import {
  computeSimulationRuntimeDurableIntentSha256,
  iterateSimulationRuntimeDurablePassiveReplay,
  validateSimulationRuntimeDurableJournalEntryDigests,
  validateSimulationRuntimeDurableOperationIntent,
  verifySimulationRuntimeDurablePassiveSegmentSha256,
  type SimulationRuntimeDurableJournalEntry,
  type SimulationRuntimeDurableOperationIntent,
  type SimulationRuntimeDurablePassiveSegment,
} from "./simulationRuntimeDurableRecovery";
import type { MulticoreSimulationOptions } from "./multicoreSimulation";

export const SIMULATION_RUNTIME_DURABLE_REPLAY_PROGRESS_INTERVAL_MS = 250;
const SIMULATION_RUNTIME_DURABLE_REPLAY_YIELD_INTERVAL_MS = 50;
const SIMULATION_RUNTIME_DURABLE_REPLAY_YIELD_OPERATION_INTERVAL = 8;

export type SimulationRuntimeDurableReplayErrorCode =
  | "invalid-plan"
  | "digest-mismatch"
  | "sequence-mismatch"
  | "revision-mismatch"
  | "registry-mismatch"
  | "cancelled"
  | "engine-failed";

export class SimulationRuntimeDurableReplayError extends Error {
  constructor(readonly code: SimulationRuntimeDurableReplayErrorCode, message: string) {
    super(message);
    this.name = "SimulationRuntimeDurableReplayError";
  }
}

export interface SimulationRuntimeDurableReplayPlan {
  sessionId: string;
  generation: number;
  checkpointLastSequence: number;
  checkpointStateRevision: number;
  entries: SimulationRuntimeDurableJournalEntry[];
  pendingIntent: SimulationRuntimeDurableOperationIntent | null;
}

export interface SimulationRuntimeDurablePassiveStep {
  sequence: number;
  baseStateRevision: number;
  simulationSeconds: number;
  wallSeconds: number;
  multicore: MulticoreSimulationOptions | undefined;
  approximate: boolean;
  registry: ContentPackRuntimeSnapshot;
}

export interface SimulationRuntimeDurableReplayProgress {
  completedOperations: number;
  totalOperations: number;
  elapsedMs: number;
}

export interface SimulationRuntimeDurableReplayHooks {
  executeIntent: (intent: SimulationRuntimeDurableOperationIntent) => Promise<number>;
  executePassiveStep: (step: SimulationRuntimeDurablePassiveStep) => Promise<number>;
  onProgress?: (progress: SimulationRuntimeDurableReplayProgress) => void;
  isCancelled?: () => boolean;
  yieldControl?: () => Promise<void>;
  now?: () => number;
}

export interface SimulationRuntimeDurableReplayResult {
  finalSequence: number;
  finalStateRevision: number;
  completedOperations: number;
  totalOperations: number;
  /** Exact engine time covered by the replayed, ordered intents. */
  totalSimulationSeconds: number;
  /** Exact wall-clock time already represented by those intents. */
  totalWallSeconds: number;
  pendingIntentSha256: string | null;
  pendingResultStateRevision: number | null;
}

function entryOperationCount(entry: SimulationRuntimeDurableJournalEntry): number {
  return entry.kind === "atomic" ? 1 : entry.operationCount;
}

async function verifyIntent(intent: SimulationRuntimeDurableOperationIntent): Promise<void> {
  if (validateSimulationRuntimeDurableOperationIntent(intent) !== null) {
    throw new SimulationRuntimeDurableReplayError("invalid-plan", "durable replay intent 结构无效");
  }
  const { intentSha256: _intentSha256, ...unsigned } = intent;
  if (await computeSimulationRuntimeDurableIntentSha256(unsigned) !== intent.intentSha256) {
    throw new SimulationRuntimeDurableReplayError("digest-mismatch", "durable replay intent digest 不匹配");
  }
}

function validatePlanIdentity(plan: SimulationRuntimeDurableReplayPlan): void {
  if (!plan.sessionId || !Number.isSafeInteger(plan.generation) || plan.generation < 1 ||
    !Number.isSafeInteger(plan.checkpointLastSequence) || plan.checkpointLastSequence < 0 ||
    !Number.isSafeInteger(plan.checkpointStateRevision) || plan.checkpointStateRevision < 0) {
    throw new SimulationRuntimeDurableReplayError("invalid-plan", "durable replay checkpoint identity 无效");
  }
}

function ensureNotCancelled(hooks: SimulationRuntimeDurableReplayHooks): void {
  if (hooks.isCancelled?.()) throw new SimulationRuntimeDurableReplayError("cancelled", "durable replay 已取消");
}

async function preflightReplayPlan(plan: SimulationRuntimeDurableReplayPlan): Promise<void> {
  const digestIssue = await validateSimulationRuntimeDurableJournalEntryDigests(plan.entries);
  if (digestIssue) throw new SimulationRuntimeDurableReplayError("digest-mismatch", digestIssue);
  let sequence = plan.checkpointLastSequence;
  let revision = plan.checkpointStateRevision;
  for (const entry of plan.entries) {
    if (entry.kind === "atomic") {
      const intent = entry.intent;
      if (intent.sessionId !== plan.sessionId || intent.generation !== plan.generation || intent.sequence !== sequence + 1) {
        throw new SimulationRuntimeDurableReplayError("sequence-mismatch", "durable atomic preflight sequence 不连续");
      }
      if (intent.baseStateRevision !== revision || !Number.isSafeInteger(entry.resultStateRevision) ||
        entry.resultStateRevision < revision) {
        throw new SimulationRuntimeDurableReplayError("revision-mismatch", "durable atomic preflight revision 不匹配");
      }
      sequence = intent.sequence;
      revision = entry.resultStateRevision;
      continue;
    }
    const replayCount = entry.replay.steps.reduce((count, step) => count + step.count, 0);
    if (entry.sessionId !== plan.sessionId || entry.generation !== plan.generation ||
      entry.firstSequence !== sequence + 1 || entry.lastSequence - entry.firstSequence + 1 !== entry.operationCount ||
      replayCount !== entry.operationCount) {
      throw new SimulationRuntimeDurableReplayError("sequence-mismatch", "durable passive preflight sequence 不连续");
    }
    if (entry.baseStateRevision !== revision || !Number.isSafeInteger(entry.nextStateRevision) ||
      entry.nextStateRevision < revision || !validateContentPackRuntimeSnapshot(entry.registry)) {
      throw new SimulationRuntimeDurableReplayError(
        !validateContentPackRuntimeSnapshot(entry.registry) ? "registry-mismatch" : "revision-mismatch",
        "durable passive preflight metadata 不匹配",
      );
    }
    sequence = entry.lastSequence;
    revision = entry.nextStateRevision;
  }
  if (plan.pendingIntent) {
    await verifyIntent(plan.pendingIntent);
    if (plan.pendingIntent.sessionId !== plan.sessionId || plan.pendingIntent.generation !== plan.generation ||
      plan.pendingIntent.sequence !== sequence + 1) {
      throw new SimulationRuntimeDurableReplayError("sequence-mismatch", "durable pending preflight sequence 不连续");
    }
    if (plan.pendingIntent.baseStateRevision !== revision) {
      throw new SimulationRuntimeDurableReplayError("revision-mismatch", "durable pending preflight revision 不匹配");
    }
  }
}

/**
 * Replay one validated durable journal without aggregating engine boundaries.
 * This coordinator never holds or returns a GameState; the Worker publishes a
 * scoped projection only after this function completes successfully.
 */
export async function replaySimulationRuntimeDurableJournal(
  plan: SimulationRuntimeDurableReplayPlan,
  hooks: SimulationRuntimeDurableReplayHooks,
): Promise<SimulationRuntimeDurableReplayResult> {
  validatePlanIdentity(plan);
  const now = hooks.now ?? (() => performance.now());
  const startedAt = now();
  await preflightReplayPlan(plan);
  let lastProgressAt = startedAt;
  let lastYieldAt = startedAt;
  let sequence = plan.checkpointLastSequence;
  let revision = plan.checkpointStateRevision;
  let completedOperations = 0;
  let totalSimulationSeconds = 0;
  let totalWallSeconds = 0;
  const totalOperations = plan.entries.reduce((count, entry) => count + entryOperationCount(entry), 0) +
    (plan.pendingIntent ? 1 : 0);
  const publishProgress = () => {
    const current = now();
    if (!hooks.onProgress || current - lastProgressAt < SIMULATION_RUNTIME_DURABLE_REPLAY_PROGRESS_INTERVAL_MS) return;
    lastProgressAt = current;
    hooks.onProgress({ completedOperations, totalOperations, elapsedMs: Math.max(0, current - startedAt) });
  };
  const yieldIfNeeded = async () => {
    const current = now();
    if (!hooks.yieldControl || completedOperations % SIMULATION_RUNTIME_DURABLE_REPLAY_YIELD_OPERATION_INTERVAL !== 0 &&
      current - lastYieldAt < SIMULATION_RUNTIME_DURABLE_REPLAY_YIELD_INTERVAL_MS) return;
    await hooks.yieldControl();
    lastYieldAt = now();
    ensureNotCancelled(hooks);
  };
  const completeOperation = async () => {
    completedOperations += 1;
    publishProgress();
    await yieldIfNeeded();
  };

  ensureNotCancelled(hooks);
  try {
    for (const entry of plan.entries) {
      ensureNotCancelled(hooks);
      if (entry.kind === "atomic") {
        const intent = entry.intent;
        await verifyIntent(intent);
        if (intent.sessionId !== plan.sessionId || intent.generation !== plan.generation || intent.sequence !== sequence + 1) {
          throw new SimulationRuntimeDurableReplayError("sequence-mismatch", "durable atomic sequence 不连续");
        }
        if (intent.baseStateRevision !== revision) {
          throw new SimulationRuntimeDurableReplayError("revision-mismatch", "durable atomic base revision 不匹配");
        }
        revision = await hooks.executeIntent(intent);
        sequence = intent.sequence;
        if (revision !== entry.resultStateRevision) {
          throw new SimulationRuntimeDurableReplayError("revision-mismatch", "durable atomic result revision 不匹配");
        }
        totalSimulationSeconds += intent.simulationSeconds;
        totalWallSeconds += intent.wallSeconds;
        await completeOperation();
        continue;
      }
      if (!await verifySimulationRuntimeDurablePassiveSegmentSha256(entry)) {
        throw new SimulationRuntimeDurableReplayError("digest-mismatch", "durable passive segment digest 不匹配");
      }
      if (entry.sessionId !== plan.sessionId || entry.generation !== plan.generation || entry.firstSequence !== sequence + 1 ||
        entry.lastSequence - entry.firstSequence + 1 !== entry.operationCount) {
        throw new SimulationRuntimeDurableReplayError("sequence-mismatch", "durable passive segment sequence 不连续");
      }
      if (entry.baseStateRevision !== revision) {
        throw new SimulationRuntimeDurableReplayError("revision-mismatch", "durable passive segment base revision 不匹配");
      }
      if (!validateContentPackRuntimeSnapshot(entry.registry)) {
        throw new SimulationRuntimeDurableReplayError("registry-mismatch", "durable passive segment registry 无效");
      }
      let stepSequence = entry.firstSequence;
      for (const step of iterateSimulationRuntimeDurablePassiveReplay(entry.replay)) {
        revision = await hooks.executePassiveStep({
          sequence: stepSequence,
          baseStateRevision: revision,
          simulationSeconds: step.simulationSeconds,
          wallSeconds: step.wallSeconds,
          multicore: entry.multicore,
          approximate: entry.approximate,
          registry: entry.registry,
        });
        sequence = stepSequence;
        stepSequence += 1;
        totalSimulationSeconds += step.simulationSeconds;
        totalWallSeconds += step.wallSeconds;
        await completeOperation();
      }
      if (sequence !== entry.lastSequence) {
        throw new SimulationRuntimeDurableReplayError("sequence-mismatch", "durable passive replay count 不匹配");
      }
      if (revision !== entry.nextStateRevision) {
        throw new SimulationRuntimeDurableReplayError("revision-mismatch", "durable passive segment result revision 不匹配");
      }
    }

    let pendingIntentSha256: string | null = null;
    let pendingResultStateRevision: number | null = null;
    if (plan.pendingIntent) {
      const pending = plan.pendingIntent;
      await verifyIntent(pending);
      if (pending.sessionId !== plan.sessionId || pending.generation !== plan.generation || pending.sequence !== sequence + 1) {
        throw new SimulationRuntimeDurableReplayError("sequence-mismatch", "durable pending intent sequence 不连续");
      }
      if (pending.baseStateRevision !== revision) {
        throw new SimulationRuntimeDurableReplayError("revision-mismatch", "durable pending intent base revision 不匹配");
      }
      // This is the sole pending-intent execution site. Its digest and result
      // revision are returned separately so storage can finalize it once.
      revision = await hooks.executeIntent(pending);
      sequence = pending.sequence;
      pendingIntentSha256 = pending.intentSha256;
      pendingResultStateRevision = revision;
      totalSimulationSeconds += pending.simulationSeconds;
      totalWallSeconds += pending.wallSeconds;
      await completeOperation();
    }
    ensureNotCancelled(hooks);
    return {
      finalSequence: sequence,
      finalStateRevision: revision,
      completedOperations,
      totalOperations,
      totalSimulationSeconds,
      totalWallSeconds,
      pendingIntentSha256,
      pendingResultStateRevision,
    };
  } catch (error) {
    if (error instanceof SimulationRuntimeDurableReplayError) throw error;
    throw new SimulationRuntimeDurableReplayError(
      "engine-failed",
      error instanceof Error ? error.message : "durable replay engine 失败",
    );
  }
}
