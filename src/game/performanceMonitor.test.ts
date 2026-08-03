import { describe, expect, it } from "vitest";
import { createSimulationProfiler } from "./engine";
import { getPerformancePeaks, getPerformancePhaseShares, type PerformanceMonitorSample } from "./performanceMonitor";

function sample(overrides: Partial<PerformanceMonitorSample> = {}): PerformanceMonitorSample {
  const phases = createSimulationProfiler();
  phases.productionMs = 4;
  phases.beltsMs = 2;
  phases.copyStateMs = 1;
  return {
    recordedAt: 1,
    fps: 60,
    averageFrameMs: 16.7,
    frameP50Ms: 16.6,
    frameP95Ms: 18,
    peakFrameMs: 24,
    longFrameCount: 0,
    longFrames: { over50Ms: 0, over100Ms: 0, over250Ms: 0, over500Ms: 0 },
    workerDurationMs: 10,
    workerLatencyMs: 12,
    workerRequestBytes: 20,
    workerResponseBytes: 80,
    stateTransferBytes: 100,
    pendingTaskMs: 0,
    stateBytes: 100,
    saveBytes: 80,
    autosaveMs: 2,
    memory: { usedBytes: null, limitBytes: null, availableBytes: null, deviceMemoryGb: null },
    phases,
    canvas: {
      snapshotMs: 1,
      nodeDerivationMs: 2,
      edgeDerivationMs: 3,
      reactFlowNodeCount: 4,
      reactFlowEdgeCount: 5,
      domNodeCount: 4,
      domEdgeCount: 5,
      domElementCount: 40,
      refreshIntervalMs: 500,
      lod: "full",
      endgameExtremeMode: false,
      projectionEnabled: true,
      topologyRevision: 1,
      runtimeRevision: 1,
      canvasLineSegments: 0,
    },
    ...overrides,
  };
}

describe("performance monitor attribution", () => {
  it("uses non-overlapping phase timings and reports unmeasured worker time as other", () => {
    const shares = getPerformancePhaseShares(sample());
    expect(shares.find((entry) => entry.id === "production")).toMatchObject({ durationMs: 4, share: 0.4 });
    expect(shares.find((entry) => entry.id === "belts")).toMatchObject({ durationMs: 2, share: 0.2 });
    expect(shares.find((entry) => entry.id === "copy")).toMatchObject({ durationMs: 1, share: 0.1 });
    expect(shares.find((entry) => entry.id === "other")).toMatchObject({ durationMs: 3, share: 0.3 });
  });

  it("summarizes the worst main-thread, worker and backlog samples in the rolling window", () => {
    expect(getPerformancePeaks([
      sample({ peakFrameMs: 30, workerDurationMs: 8, workerLatencyMs: 12, pendingTaskMs: 100, longFrameCount: 1, longFrames: { over50Ms: 1, over100Ms: 0, over250Ms: 0, over500Ms: 0 } }),
      sample({ peakFrameMs: 70, workerDurationMs: 15, workerLatencyMs: 20, pendingTaskMs: 40, longFrameCount: 2, longFrames: { over50Ms: 2, over100Ms: 1, over250Ms: 1, over500Ms: 0 } }),
    ])).toEqual({ peakFrameMs: 70, peakWorkerMs: 15, peakLatencyMs: 20, peakPendingTaskMs: 100, longFrameCount: 3, over100Ms: 1, over250Ms: 1, over500Ms: 0 });
  });
});
