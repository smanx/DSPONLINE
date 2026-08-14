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
