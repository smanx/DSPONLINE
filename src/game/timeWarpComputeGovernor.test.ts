import { describe, expect, it } from "vitest";
import {
  createTimeWarpComputeGovernor,
  markTimeWarpWorkerUnavailable,
  recordTimeWarpComputeSample,
  resolveTimeWarpComputeLimits,
  shouldAbortTimeWarpWorker,
} from "./timeWarpComputeGovernor";

describe("time-warp compute governor", () => {
  it("starts conservatively and raises the compute limit only after stable samples", () => {
    let governor = createTimeWarpComputeGovernor(1);
    expect(resolveTimeWarpComputeLimits(governor, 12, 12, 1).actualMultiplier).toBe(1);
    governor = recordTimeWarpComputeSample(governor, {
      simulationSeconds: 1,
      durationMs: 50,
      pendingSimulationSeconds: 0,
      requestedMultiplier: 12,
      powerLimitedMultiplier: 12,
      baseMultiplier: 1,
    });
    expect(governor.computeLimitedMultiplier).toBe(1);
    governor = recordTimeWarpComputeSample(governor, {
      simulationSeconds: 1,
      durationMs: 50,
      pendingSimulationSeconds: 0,
      requestedMultiplier: 12,
      powerLimitedMultiplier: 12,
      baseMultiplier: 1,
    });
    expect(governor.computeLimitedMultiplier).toBeGreaterThan(1);
    expect(resolveTimeWarpComputeLimits(governor, 12, 5, 1).actualMultiplier).toBeLessThanOrEqual(5);
  });

  it("drops immediately for a slow worker or excessive backlog", () => {
    let governor = { ...createTimeWarpComputeGovernor(1), sampleCount: 5, computeLimitedMultiplier: 12, throughputEma: 16, sliceSimulationSeconds: 8 };
    governor = recordTimeWarpComputeSample(governor, {
      simulationSeconds: 12,
      durationMs: 2_500,
      pendingSimulationSeconds: 0,
      requestedMultiplier: 12,
      powerLimitedMultiplier: 12,
      baseMultiplier: 1,
    });
    expect(governor.computeLimitedMultiplier).toBeLessThanOrEqual(6);
    expect(governor.reason).toBe("worker-slow");

    governor = { ...governor, computeLimitedMultiplier: 6, sliceSimulationSeconds: 4 };
    governor = recordTimeWarpComputeSample(governor, {
      simulationSeconds: 4,
      durationMs: 400,
      pendingSimulationSeconds: 100,
      requestedMultiplier: 12,
      powerLimitedMultiplier: 12,
      baseMultiplier: 1,
    });
    expect(governor.reason).toBe("backlog");
    expect(governor.computeLimitedMultiplier).toBeLessThan(6);
  });

  it("bounds pending work to a small number of dynamic slices", () => {
    const governor = { ...createTimeWarpComputeGovernor(1), sampleCount: 4, computeLimitedMultiplier: 8, sliceSimulationSeconds: 10 };
    const limits = resolveTimeWarpComputeLimits(governor, 12, 10, 1);
    expect(limits.actualMultiplier).toBe(8);
    expect(limits.maximumPendingSimulationSeconds).toBe(25);
  });

  it("marks failures and detects a hard timeout without mutating game state", () => {
    const unavailable = markTimeWarpWorkerUnavailable(createTimeWarpComputeGovernor(2), 2);
    expect(unavailable).toMatchObject({ computeLimitedMultiplier: 2, reason: "worker-unavailable" });
    expect(shouldAbortTimeWarpWorker(1_000, 5_999, 5_000)).toBe(false);
    expect(shouldAbortTimeWarpWorker(1_000, 6_000, 5_000)).toBe(true);
  });
});
