export type TimeWarpThrottleReason =
  | "warming-up"
  | "requested-limit"
  | "power-limit"
  | "compute-limit"
  | "worker-slow"
  | "backlog"
  | "worker-unavailable";

export interface TimeWarpComputeGovernorState {
  sampleCount: number;
  stableSampleCount: number;
  throughputEma: number;
  durationEmaMs: number;
  recentWorkerDurationMs: number;
  computeLimitedMultiplier: number;
  sliceSimulationSeconds: number;
  reason: TimeWarpThrottleReason;
}

export interface TimeWarpComputeLimits {
  requestedMultiplier: number;
  powerLimitedMultiplier: number;
  computeLimitedMultiplier: number;
  baseMultiplier: number;
  actualMultiplier: number;
  maximumPendingSimulationSeconds: number;
  sliceSimulationSeconds: number;
  reason: TimeWarpThrottleReason;
}

export interface TimeWarpComputeSample {
  simulationSeconds: number;
  durationMs: number;
  pendingSimulationSeconds: number;
  requestedMultiplier: number;
  powerLimitedMultiplier: number;
  baseMultiplier: number;
}

const TARGET_SLICE_DURATION_SECONDS = 0.35;
const SLOW_SLICE_DURATION_MS = 1_000;
export const TIME_WARP_MAX_SLICE_SIMULATION_SECONDS = 12;
export const TIME_WARP_WORKER_HARD_TIMEOUT_MS = 2_000;
const MIN_PENDING_SLICES = 2.5;

function safeMultiplier(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.max(fallback, Math.floor(value));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function createTimeWarpComputeGovernor(baseMultiplier = 1): TimeWarpComputeGovernorState {
  const base = safeMultiplier(baseMultiplier, 1);
  return {
    sampleCount: 0,
    stableSampleCount: 0,
    throughputEma: 0,
    durationEmaMs: 0,
    recentWorkerDurationMs: 0,
    computeLimitedMultiplier: base,
    sliceSimulationSeconds: base,
    reason: "warming-up",
  };
}

export function resolveTimeWarpComputeLimits(
  governor: TimeWarpComputeGovernorState,
  requestedMultiplier: number,
  powerLimitedMultiplier: number,
  baseMultiplier = 1,
): TimeWarpComputeLimits {
  const base = safeMultiplier(baseMultiplier, 1);
  const requested = safeMultiplier(requestedMultiplier, base);
  const power = safeMultiplier(powerLimitedMultiplier, base);
  const compute = safeMultiplier(governor.computeLimitedMultiplier, base);
  const actualMultiplier = Math.max(base, Math.min(requested, power, compute));
  const sliceSimulationSeconds = clamp(
    governor.sliceSimulationSeconds,
    base,
    TIME_WARP_MAX_SLICE_SIMULATION_SECONDS,
  );
  const maximumPendingSimulationSeconds = Math.max(
    sliceSimulationSeconds * MIN_PENDING_SLICES,
    actualMultiplier * 2,
  );
  let reason = governor.reason;
  if (actualMultiplier >= requested) reason = "requested-limit";
  else if (actualMultiplier >= power && power < requested) reason = "power-limit";
  else if (governor.sampleCount < 2) reason = "warming-up";
  else if (reason !== "worker-slow" && reason !== "backlog" && reason !== "worker-unavailable") reason = "compute-limit";
  return {
    requestedMultiplier: requested,
    powerLimitedMultiplier: power,
    computeLimitedMultiplier: compute,
    baseMultiplier: base,
    actualMultiplier,
    maximumPendingSimulationSeconds,
    sliceSimulationSeconds,
    reason,
  };
}

/**
 * Update the device-local governor from one completed Worker round trip. The
 * sample includes clone, queue and commit latency so a fast engine step cannot
 * hide an overloaded browser main thread.
 */
export function recordTimeWarpComputeSample(
  governor: TimeWarpComputeGovernorState,
  sample: TimeWarpComputeSample,
): TimeWarpComputeGovernorState {
  const base = safeMultiplier(sample.baseMultiplier, 1);
  if (!Number.isFinite(sample.simulationSeconds) || sample.simulationSeconds <= 0 ||
    !Number.isFinite(sample.durationMs) || sample.durationMs <= 0) {
    return {
      ...governor,
      computeLimitedMultiplier: base,
      stableSampleCount: 0,
      reason: "worker-slow",
    };
  }
  const observedThroughput = sample.simulationSeconds / (sample.durationMs / 1_000);
  const throughputEma = governor.sampleCount === 0
    ? observedThroughput
    : governor.throughputEma * 0.65 + observedThroughput * 0.35;
  const durationEmaMs = governor.sampleCount === 0
    ? sample.durationMs
    : governor.durationEmaMs * 0.65 + sample.durationMs * 0.35;
  const sustainableMultiplier = Math.max(base, Math.floor(throughputEma * 0.75));
  const previousLimit = safeMultiplier(governor.computeLimitedMultiplier, base);
  const targetSlice = clamp(
    throughputEma * TARGET_SLICE_DURATION_SECONDS,
    base,
    TIME_WARP_MAX_SLICE_SIMULATION_SECONDS,
  );
  const provisional = {
    ...governor,
    sampleCount: governor.sampleCount + 1,
    throughputEma,
    durationEmaMs,
    recentWorkerDurationMs: sample.durationMs,
    sliceSimulationSeconds: targetSlice,
  };
  const limits = resolveTimeWarpComputeLimits(
    provisional,
    sample.requestedMultiplier,
    sample.powerLimitedMultiplier,
    base,
  );
  const backlogHigh = sample.pendingSimulationSeconds > limits.maximumPendingSimulationSeconds;
  const workerSlow = sample.durationMs >= SLOW_SLICE_DURATION_MS;
  if (workerSlow || backlogHigh || sustainableMultiplier < previousLimit) {
    const emergencyLimit = Math.max(
      base,
      Math.min(sustainableMultiplier, Math.floor(previousLimit * (workerSlow ? 0.5 : 0.7))),
    );
    return {
      ...provisional,
      stableSampleCount: 0,
      computeLimitedMultiplier: emergencyLimit,
      reason: workerSlow ? "worker-slow" : backlogHigh ? "backlog" : "compute-limit",
    };
  }
  const stableSampleCount = governor.stableSampleCount + 1;
  const mayRaise = stableSampleCount >= 2 && sustainableMultiplier > previousLimit;
  const raisedLimit = mayRaise
    ? Math.min(sustainableMultiplier, Math.max(previousLimit + 1, Math.ceil(previousLimit * 1.5)))
    : previousLimit;
  const requested = safeMultiplier(sample.requestedMultiplier, base);
  const power = safeMultiplier(sample.powerLimitedMultiplier, base);
  const computeLimitedMultiplier = Math.max(base, Math.min(raisedLimit, Math.max(requested, power)));
  return {
    ...provisional,
    stableSampleCount: mayRaise ? 0 : stableSampleCount,
    computeLimitedMultiplier,
    reason: provisional.sampleCount < 2 ? "warming-up" : "compute-limit",
  };
}

export function markTimeWarpWorkerUnavailable(
  governor: TimeWarpComputeGovernorState,
  baseMultiplier = 1,
): TimeWarpComputeGovernorState {
  const base = safeMultiplier(baseMultiplier, 1);
  return {
    ...governor,
    stableSampleCount: 0,
    computeLimitedMultiplier: base,
    reason: "worker-unavailable",
  };
}

export function shouldAbortTimeWarpWorker(submittedAt: number, now: number, hardTimeoutMs = TIME_WARP_WORKER_HARD_TIMEOUT_MS): boolean {
  return Number.isFinite(submittedAt) && Number.isFinite(now) && now - submittedAt >= Math.max(1_000, hardTimeoutMs);
}
