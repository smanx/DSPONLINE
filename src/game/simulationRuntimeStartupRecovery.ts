import type { SimulationRuntimeRecoveryBaseIdentity } from "./simulationRuntimeRecovery";
import type { ContentPackRuntimeSnapshot } from "./contentPacks";
import { createSimulationRuntimeDurablePrimaryCheckpoint, createSimulationRuntimeDurableAppHead } from "./simulationRuntimeDurableAppState";
import type { SimulationRuntimeDurableRecoveryReadRecord } from "./simulationRuntimeDurableRecovery";
import type { SaveInspection, SaveGameResult } from "./storage";
import { getLocalSaveWriterStatus, getPrimaryLocalSaveRecoveryIdentity, initializeLocalSaveStore } from "./localSaveStore";
import {
  initializeSimulationRuntimeRecoveryInPersistenceWorker,
  readSimulationRuntimeRecoveryInPersistenceWorker,
} from "./simulationRuntimeRecoveryPersistenceClient";
import type { SimulationRuntimeRecoveryWriterFence } from "./simulationRuntimeRecoveryStore";
import { replaySimulationRuntimeStartupInWorker } from "./simulationRuntimeStartupRecoveryClient";
import type { GameState, SaveMode } from "./types";
import { getOfflineSimulationLimitSeconds } from "./endgame";

export type SimulationRuntimeStartupRecoveryPhase =
  | "selected-primary"
  | "recovery-read"
  | "recovery-replayed"
  | "offline-computed"
  | "offline-settled"
  | "promoted-primary-verified"
  | "stale-recovery-cleared"
  | "next-recovery-initialized"
  | "ready"
  | "failed-source-preserved"
  | "failed-promoted-primary";

export type SimulationRuntimeStartupRecoveryEvent =
  | "read-recovery"
  | "replay-recovery"
  | "compute-offline"
  | "settle-offline"
  | "verify-promoted-primary"
  | "clear-stale-recovery"
  | "initialize-next-recovery"
  | "enter-game"
  | "fail";

export interface SimulationRuntimeStartupRecoveryState {
  phase: SimulationRuntimeStartupRecoveryPhase;
}

/** Verified T1 identity handed to FactoryGame only after recovery is ready. */
export interface SimulationRuntimeStartupRecoveryBinding {
  status: "active";
  baseIdentity: SimulationRuntimeRecoveryBaseIdentity;
  sessionId: string;
  generation: number;
  sequence: number;
  stateRevision: number;
  registryFingerprint: string;
}

export interface SimulationRuntimeStartupRecoveryCandidate {
  sourceBaseIdentity: SimulationRuntimeRecoveryBaseIdentity;
  sourceRecovery: SimulationRuntimeDurableRecoveryReadRecord | null;
  /** Revision/sequence after every finalized and pending T0 operation replayed. */
  replayedSequence: number;
  replayedStateRevision: number;
  replayedWallSeconds: number;
  replayedSimulationSeconds: number;
  registryFingerprint: string;
}

export type SimulationRuntimeStartupRecoveryProgressPhase =
  | "identity"
  | "read"
  | "replay"
  | "offline"
  | "save"
  | "clear"
  | "initialize"
  | "complete";

export interface SimulationRuntimeStartupRecoveryProgress {
  phase: SimulationRuntimeStartupRecoveryProgressPhase;
  message: string;
  completedOperations?: number;
  totalOperations?: number;
}

function writerFenceOrThrow(): SimulationRuntimeRecoveryWriterFence {
  const status = getLocalSaveWriterStatus();
  if (status.role !== "primary" || !status.writerId || !Number.isSafeInteger(status.fencingToken) || status.fencingToken < 1) {
    throw new Error(status.reason || "本页没有本地存档写入权，已阻止启动恢复");
  }
  return { ownerId: status.writerId, fencingToken: status.fencingToken };
}

function verifySelectedPrimaryIdentity(
  inspection: SaveInspection,
  mode: SaveMode,
): SimulationRuntimeRecoveryBaseIdentity {
  const identity = getPrimaryLocalSaveRecoveryIdentity(mode);
  if (!identity || !inspection.valid || inspection.integrity !== "valid" || inspection.mode !== mode ||
    inspection.savedAt !== identity.savedAt || inspection.computedChecksum !== identity.checksum || identity.revision < 1) {
    throw new Error("主存档校验身份未完成，已阻止启动恢复；请重试以保留原存档");
  }
  return identity;
}

/** Read/replay T0 before the menu's ordinary offline settlement can mutate it. */
export async function prepareSimulationRuntimeStartupRecovery(input: {
  state: GameState;
  savedAtMs: number;
  inspection: SaveInspection;
  source: "primary" | "backup" | "snapshot";
  mode: SaveMode;
  registry: ContentPackRuntimeSnapshot;
  onProgress?: (progress: SimulationRuntimeStartupRecoveryProgress) => void;
}): Promise<{ state: GameState; offlineSeconds: number; candidate: SimulationRuntimeStartupRecoveryCandidate | null }> {
  if (input.source !== "primary") return { state: input.state, offlineSeconds: 0, candidate: null };
  input.onProgress?.({ phase: "identity", message: "正在核对主存档与 durable recovery 基线…" });
  await initializeLocalSaveStore();
  const baseIdentity = verifySelectedPrimaryIdentity(input.inspection, input.mode);
  const fence = writerFenceOrThrow();
  input.onProgress?.({ phase: "read", message: "正在读取崩溃恢复日志（主存档保持不变）…" });
  const read = await readSimulationRuntimeRecoveryInPersistenceWorker(baseIdentity, fence);
  if (!read.ok) throw new Error(`${read.message}；原主存档未修改`);
  if (read.diagnostic === "corrupt-recovery-quarantined") {
    throw new Error("durable recovery 已隔离损坏记录；请重试恢复，原主存档未修改");
  }
  let state = input.state;
  let replayedSequence = 0;
  let replayedStateRevision = 0;
  let replayedWallSeconds = 0;
  let replayedSimulationSeconds = 0;
  if (read.recovery) {
    input.onProgress?.({ phase: "replay", message: "正在按原始边界回放崩溃前进度…", totalOperations: read.recovery.entries.length + (read.recovery.pendingIntent ? 1 : 0) });
    const replay = await replaySimulationRuntimeStartupInWorker(state, read.recovery, {
      registry: input.registry,
      onProgress: (progress) => input.onProgress?.({
        phase: "replay",
        message: "正在按原始边界回放崩溃前进度…",
        completedOperations: progress.completedOperations,
        totalOperations: progress.totalOperations,
      }),
    });
    state = replay.state;
    replayedSequence = replay.replay.finalSequence;
    replayedStateRevision = replay.replay.finalStateRevision;
    replayedWallSeconds = replay.replay.totalWallSeconds;
    replayedSimulationSeconds = replay.replay.totalSimulationSeconds;
  }
  const offlineWindow = computeSimulationRuntimeStartupOfflineWindow({
    savedAtMs: input.savedAtMs,
    nowMs: Date.now(),
    paused: state.paused,
    replayedWallSeconds,
    maxOfflineSeconds: getOfflineSimulationLimitSeconds(state),
  });
  return {
    state,
    offlineSeconds: offlineWindow.offlineSeconds,
    candidate: {
      sourceBaseIdentity: baseIdentity,
      sourceRecovery: read.recovery,
      replayedSequence,
      replayedStateRevision,
      replayedWallSeconds,
      replayedSimulationSeconds,
      registryFingerprint: input.registry.fingerprint,
    },
  };
}

function createStartupSessionId(now = Date.now()): string {
  try { return `startup_${crypto.randomUUID()}`; } catch { return `startup_${now.toString(36)}_${Math.random().toString(36).slice(2)}`; }
}

/** Save T1 first, then retire T0 and install a proof-bound primary checkpoint. */
export async function finalizeSimulationRuntimeStartupRecovery(input: {
  state: GameState;
  candidate: SimulationRuntimeStartupRecoveryCandidate;
  mode: SaveMode;
  registry: ContentPackRuntimeSnapshot;
  saveGameVerified: (state: GameState) => Promise<SaveGameResult>;
  onProgress?: (progress: SimulationRuntimeStartupRecoveryProgress) => void;
}): Promise<SimulationRuntimeStartupRecoveryBinding> {
  input.onProgress?.({ phase: "save", message: "正在验证 T1 主存档；旧 recovery 尚未清理…" });
  const saved = await input.saveGameVerified(input.state);
  if (!saved.success) throw new Error(`${saved.message}；原恢复基线仍保留`);
  await initializeLocalSaveStore();
  const t1Identity = getPrimaryLocalSaveRecoveryIdentity(input.mode);
  if (!t1Identity || t1Identity.savedAt <= 0 || t1Identity.revision < 1) {
    throw new Error("T1 主存档已写入但未取得逐字校验身份；已阻止进入游戏");
  }
  const fence = writerFenceOrThrow();
  // `initializeSimulationRuntimeRecovery` performs a fenced stale-base
  // replacement itself.  Do not clear T0 first: if staging, verification, or
  // the publish transaction fails, the old checkpoint and pending intent must
  // remain available for an exact retry.  The store publishes T1 only after
  // its readback succeeds and then garbage-collects the old generation.
  if (input.candidate.sourceRecovery) {
    input.onProgress?.({ phase: "clear", message: "正在以原子事务替换已被 T1 吸收的旧 recovery…" });
  }
  input.onProgress?.({ phase: "initialize", message: "正在为 T1 建立新的 durable recovery 基线…" });
  const checkpoint = createSimulationRuntimeDurablePrimaryCheckpoint({
    baseIdentity: t1Identity,
    sessionId: createStartupSessionId(),
    // T1 absorbs the replayed journal into its primary payload, but the
    // monotonic runtime revision must not reset after a non-empty replay.
    // Revision zero is reserved for an unbootstrapped Worker: its first exact
    // state install becomes revision one, so the durable head must start at
    // that same boundary.
    stateRevision: Math.max(1, input.candidate.replayedStateRevision),
    registry: input.registry,
    committedAtMs: t1Identity.savedAt,
  });
  const initialized = await initializeSimulationRuntimeRecoveryInPersistenceWorker(checkpoint, fence);
  if (!initialized.result.ok) throw new Error(`${initialized.result.message}；T1 已保存，未进入游戏`);
  const head = createSimulationRuntimeDurableAppHead(checkpoint, initialized.result.proof);
  input.onProgress?.({ phase: "complete", message: "启动恢复基线已验证" });
  return {
    status: "active",
    baseIdentity: head.baseIdentity,
    sessionId: head.sessionId,
    generation: head.generation,
    sequence: head.sequence,
    stateRevision: head.stateRevision,
    registryFingerprint: head.registryFingerprint,
  };
}

/**
 * Establish a fresh durable session after a non-primary source (backup,
 * snapshot, slot, or new factory) has been promoted to a verified primary.
 * Those sources must never replay a WAL bound to the old primary, but they
 * also must not enter FactoryGame with durability silently disabled. The
 * checkpoint is intentionally generation 1/revision 1 because the promoted
 * payload already contains the complete state and Worker bootstrap reserves
 * revision zero for an uninstalled runtime.
 */
export async function initializeSimulationRuntimeAfterVerifiedPrimary(input: {
  mode: SaveMode;
  registry: ContentPackRuntimeSnapshot;
  onProgress?: (progress: SimulationRuntimeStartupRecoveryProgress) => void;
}): Promise<SimulationRuntimeStartupRecoveryBinding> {
  input.onProgress?.({ phase: "identity", message: "正在核对新主存档的 durable 身份…" });
  await initializeLocalSaveStore();
  const identity = getPrimaryLocalSaveRecoveryIdentity(input.mode);
  if (!identity || identity.revision < 1 || identity.savedAt <= 0) {
    throw new Error("新主存档已写入但 durable identity 尚未完成，已阻止进入游戏");
  }
  const fence = writerFenceOrThrow();
  const checkpoint = createSimulationRuntimeDurablePrimaryCheckpoint({
    baseIdentity: identity,
    sessionId: createStartupSessionId(),
    stateRevision: 1,
    registry: input.registry,
    committedAtMs: identity.savedAt,
  });
  input.onProgress?.({ phase: "initialize", message: "正在建立新的 durable recovery 基线…" });
  const initialized = await initializeSimulationRuntimeRecoveryInPersistenceWorker(checkpoint, fence);
  if (!initialized.result.ok) throw new Error(`${initialized.result.message}；主存档保持不变`);
  const head = createSimulationRuntimeDurableAppHead(checkpoint, initialized.result.proof);
  input.onProgress?.({ phase: "complete", message: "durable recovery 基线已验证" });
  return {
    status: "active",
    baseIdentity: head.baseIdentity,
    sessionId: head.sessionId,
    generation: head.generation,
    sequence: head.sequence,
    stateRevision: head.stateRevision,
    registryFingerprint: head.registryFingerprint,
  };
}

const EXPECTED_EVENT: Partial<Record<SimulationRuntimeStartupRecoveryPhase, SimulationRuntimeStartupRecoveryEvent>> = {
  "selected-primary": "read-recovery",
  "recovery-read": "replay-recovery",
  "recovery-replayed": "compute-offline",
  "offline-computed": "settle-offline",
  "offline-settled": "verify-promoted-primary",
  "promoted-primary-verified": "clear-stale-recovery",
  "stale-recovery-cleared": "initialize-next-recovery",
  "next-recovery-initialized": "enter-game",
};

const NEXT_PHASE: Record<Exclude<SimulationRuntimeStartupRecoveryEvent, "fail">, SimulationRuntimeStartupRecoveryPhase> = {
  "read-recovery": "recovery-read",
  "replay-recovery": "recovery-replayed",
  "compute-offline": "offline-computed",
  "settle-offline": "offline-settled",
  "verify-promoted-primary": "promoted-primary-verified",
  "clear-stale-recovery": "stale-recovery-cleared",
  "initialize-next-recovery": "next-recovery-initialized",
  "enter-game": "ready",
};

const PROMOTED_PRIMARY_PHASES = new Set<SimulationRuntimeStartupRecoveryPhase>([
  "promoted-primary-verified",
  "stale-recovery-cleared",
  "next-recovery-initialized",
  "ready",
  "failed-promoted-primary",
]);

/**
 * Startup is deliberately linear: T0 recovery is replayed before any offline
 * settlement or primary write. T0's pending intent remains pending until the
 * verified T1 save has absorbed its result; there is no cross-primary pseudo
 * transaction that could mutate T0 before T1 is durable.
 */
export function advanceSimulationRuntimeStartupRecovery(
  state: SimulationRuntimeStartupRecoveryState,
  event: SimulationRuntimeStartupRecoveryEvent,
): SimulationRuntimeStartupRecoveryState {
  if (event === "fail") {
    if (state.phase === "ready" || state.phase.startsWith("failed-")) {
      throw new Error(`startup recovery cannot fail from ${state.phase}`);
    }
    return {
      phase: PROMOTED_PRIMARY_PHASES.has(state.phase)
        ? "failed-promoted-primary"
        : "failed-source-preserved",
    };
  }
  const expected = EXPECTED_EVENT[state.phase];
  if (event !== expected) {
    throw new Error(`startup recovery expected ${expected ?? "no event"} from ${state.phase}, received ${event}`);
  }
  return { phase: NEXT_PHASE[event] };
}

export function canEnterGameAfterSimulationRuntimeStartupRecovery(
  state: SimulationRuntimeStartupRecoveryState,
): boolean {
  return state.phase === "ready";
}

export interface SimulationRuntimeStartupOfflineWindowInput {
  savedAtMs: number;
  nowMs: number;
  paused: boolean;
  replayedWallSeconds: number;
  maxOfflineSeconds: number;
}

export interface SimulationRuntimeStartupOfflineWindow {
  elapsedWallSeconds: number;
  replayedWallSeconds: number;
  remainingWallSeconds: number;
  offlineSeconds: number;
}

function finiteNonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be finite and non-negative`);
  return value;
}

/**
 * Remove wall time already represented by successful durable replay before
 * applying the ordinary offline cap. Simulation seconds are intentionally not
 * accepted here: time-warp/multiplier work can cover many engine seconds while
 * consuming only its recorded wall interval.
 */
export function computeSimulationRuntimeStartupOfflineWindow(
  input: SimulationRuntimeStartupOfflineWindowInput,
): SimulationRuntimeStartupOfflineWindow {
  const savedAtMs = finiteNonNegative(input.savedAtMs, "savedAtMs");
  const nowMs = finiteNonNegative(input.nowMs, "nowMs");
  const replayedWallSeconds = finiteNonNegative(input.replayedWallSeconds, "replayedWallSeconds");
  const maxOfflineSeconds = finiteNonNegative(input.maxOfflineSeconds, "maxOfflineSeconds");
  const elapsedWallSeconds = Math.max(0, (nowMs - savedAtMs) / 1_000);
  const remainingWallSeconds = Math.max(0, elapsedWallSeconds - replayedWallSeconds);
  return {
    elapsedWallSeconds,
    replayedWallSeconds,
    remainingWallSeconds,
    offlineSeconds: input.paused ? 0 : Math.min(maxOfflineSeconds, remainingWallSeconds),
  };
}
