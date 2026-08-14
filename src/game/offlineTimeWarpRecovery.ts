import { getOfflineSimulationLimitSeconds } from "./endgame";
import { finishIdleRun } from "./idleSettlement";
import type { GameState } from "./types";

const EPSILON = 1e-6;

export interface DeferredOfflineTimeWarpState {
  state: GameState;
  savedAt: number;
  offlineSeconds: number;
  offlineReport: unknown;
  recovery?: unknown;
}

export interface OfflineTimeWarpRecoverySummary {
  recovered: boolean;
  checkpointAt: number;
  originalOfflineSeconds: number;
  recoveredPendingWallSeconds: number;
  discardedPendingSimulationSeconds: number;
  submittedOfflineSeconds: number;
  cappedSeconds: number;
}

export type OfflineTimeWarpRecoveryResult<T extends DeferredOfflineTimeWarpState> =
  | { ok: true; loaded: T; summary: OfflineTimeWarpRecoverySummary }
  | { ok: false; reason: string };

function finiteNonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function hasUncommittedTimeWarpTransaction(state: Pick<GameState, "timeWarp">): boolean {
  return state.timeWarp.enabled ||
    state.timeWarp.pendingSimulationSeconds > EPSILON ||
    state.timeWarp.pendingWallSeconds > EPSILON;
}

/**
 * Convert an orphaned foreground-only time-warp transaction into ordinary
 * offline work. The authoritative state remains the last committed main-save
 * checkpoint: accelerated simulation debt is discarded, real pending wall
 * time is prepended once, and all inventory/production fields stay untouched.
 * This function is transient and idempotent; persistence happens only after
 * the normal offline settlement succeeds.
 */
export function recoverOrphanedTimeWarpForOffline<T extends DeferredOfflineTimeWarpState>(
  loaded: T,
  options: { force?: boolean; nowMs?: number } = {},
): OfflineTimeWarpRecoveryResult<T> {
  const force = options.force === true;
  const nowMs = Number.isFinite(options.nowMs) ? Math.max(0, options.nowMs!) : Date.now();
  const savedAt = finiteNonNegative(loaded.savedAt);
  const originalOfflineSeconds = finiteNonNegative(loaded.offlineSeconds);
  const pendingWall = finiteNonNegative(loaded.state.timeWarp.pendingWallSeconds);
  const pendingSimulation = finiteNonNegative(loaded.state.timeWarp.pendingSimulationSeconds);
  if (!savedAt || originalOfflineSeconds === null || pendingWall === null || pendingSimulation === null) {
    if (!force) return { ok: false, reason: "时间扭曲检查点包含无效时间字段，自动恢复已停止" };
  }

  const safeSavedAt = savedAt && savedAt > 0 ? savedAt : nowMs;
  const safeOriginalOffline = originalOfflineSeconds ?? 0;
  const safePendingWall = pendingWall ?? 0;
  const safePendingSimulation = pendingSimulation ?? 0;
  if (!hasUncommittedTimeWarpTransaction(loaded.state)) {
    return {
      ok: true,
      loaded,
      summary: {
        recovered: false,
        checkpointAt: safeSavedAt,
        originalOfflineSeconds: safeOriginalOffline,
        recoveredPendingWallSeconds: 0,
        discardedPendingSimulationSeconds: 0,
        submittedOfflineSeconds: safeOriginalOffline,
        cappedSeconds: 0,
      },
    };
  }

  const offlineLimit = getOfflineSimulationLimitSeconds(loaded.state);
  const uncappedOfflineSeconds = safeOriginalOffline + safePendingWall;
  const submittedOfflineSeconds = Math.min(offlineLimit, uncappedOfflineSeconds);
  const checkpointAt = Math.max(0, safeSavedAt - safePendingWall * 1_000);
  const recoveredState: GameState = {
    ...loaded.state,
    timeWarp: {
      ...loaded.state.timeWarp,
      enabled: false,
      effectiveMultiplier: loaded.state.settings.simulationSpeed,
      pendingSimulationSeconds: 0,
      pendingWallSeconds: 0,
      requiredPowerKw: 0,
      allocatedPowerKw: 0,
    },
    idleSettlement: finishIdleRun(loaded.state.idleSettlement),
  };
  return {
    ok: true,
    loaded: {
      ...loaded,
      state: recoveredState,
      savedAt: checkpointAt,
      offlineSeconds: submittedOfflineSeconds,
    },
    summary: {
      recovered: true,
      checkpointAt,
      originalOfflineSeconds: safeOriginalOffline,
      recoveredPendingWallSeconds: safePendingWall,
      discardedPendingSimulationSeconds: safePendingSimulation,
      submittedOfflineSeconds,
      cappedSeconds: Math.max(0, uncappedOfflineSeconds - submittedOfflineSeconds),
    },
  };
}
