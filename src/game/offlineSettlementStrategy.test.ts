import { describe, expect, it } from "vitest";
import {
  estimateOfflineExactDurationLabel,
  classifyOfflineSettlementFailure,
  normalizeOfflineSettlementPreference,
  offlineSettlementChoiceDescription,
  selectInitialOfflineWorkerStrategy,
  selectOfflineWorkerStrategyAfterFastResult,
} from "./offlineSettlementStrategy";

describe("offline Worker bounded fallback policy", () => {
  const ordinary = {
    approximate: true,
    conservativeOnly: false,
    speedrun: false,
    seconds: 30 * 24 * 60 * 60,
  };

  it("never selects full exact replay after an ordinary fast contract declines", () => {
    expect(selectInitialOfflineWorkerStrategy(ordinary)).toBe("fast");
    expect(selectOfflineWorkerStrategyAfterFastResult(ordinary, {
      status: "fallback",
      report: {
        mode: "exact",
        calibrationWindowSeconds: 30,
        approximatedSeconds: 0,
        maxEstimatedError: 1,
        fellBack: true,
        fallbackReason: "injected contract failure",
      },
    })).toBe("conservative-preview");
  });

  it("uses the zero-calibration conservative path after a hard Worker restart", () => {
    expect(selectInitialOfflineWorkerStrategy({ ...ordinary, conservativeOnly: true })).toBe("conservative-preview");
  });

  it("keeps short and speedrun sessions on their exact rules", () => {
    expect(selectInitialOfflineWorkerStrategy({ ...ordinary, seconds: 10 })).toBe("exact");
    expect(selectInitialOfflineWorkerStrategy({ ...ordinary, speedrun: true })).toBe("exact");
  });

  it("stops instead of settling an invalid source", () => {
    expect(selectOfflineWorkerStrategyAfterFastResult(ordinary, {
      status: "invalid-source",
      report: {
        mode: "exact",
        calibrationWindowSeconds: 0,
        approximatedSeconds: 0,
        maxEstimatedError: 1,
        fellBack: true,
        fallbackReason: "invalid source",
        settlementStatus: "invalid-source",
      },
    })).toBe("invalid-source");
  });

  it("normalizes device preferences without allowing a silent legacy value", () => {
    expect(normalizeOfflineSettlementPreference("ask")).toBe("ask");
    expect(normalizeOfflineSettlementPreference("exact")).toBe("exact");
    expect(normalizeOfflineSettlementPreference("skip")).toBe("skip");
    expect(normalizeOfflineSettlementPreference(true)).toBe("ask");
  });

  it("classifies the reason shown by the decision dialog", () => {
    expect(classifyOfflineSettlementFailure("快速 Worker 达到现实时间上限")).toBe("timeout");
    expect(classifyOfflineSettlementFailure("低内存设备风险")).toBe("memory-risk");
    expect(classifyOfflineSettlementFailure("白糖尾验误差过高")).toBe("boundary-validation");
    expect(classifyOfflineSettlementFailure("30 秒校准未形成普通合同")).toBe("calibration-unstable");
  });

  it("explains all three player choices without implying a silent fallback", () => {
    expect(offlineSettlementChoiceDescription("fast", 3_600)).toContain("目标约 30 秒");
    expect(offlineSettlementChoiceDescription("fast", 3_600)).toContain("再次快速尝试");
    expect(offlineSettlementChoiceDescription("exact", 3_600)).toContain("可随时安全取消");
    expect(offlineSettlementChoiceDescription("exact", 3_600)).toContain("粗略预计");
    expect(offlineSettlementChoiceDescription("skip", 3_600)).toContain("二次确认");
    expect(offlineSettlementChoiceDescription("skip", 3_600)).toContain("不会重复结算");
  });

  it("shows a wider exact-settlement estimate for longer, complex, constrained saves", () => {
    const simple = estimateOfflineExactDurationLabel(3_600, {
      profile: "simple",
      recommendedStrategy: "fast",
      score: 0,
      entityCount: 0,
      beltCount: 0,
      stationCount: 0,
      quantumStationCount: 0,
      routeCount: 0,
      activeConstructionJobs: 0,
      fluidOrGasConnections: 0,
      nearCacheBoundaryCount: 0,
      activeDysonSystems: 0,
      finiteResourceBoundaryCount: 0,
      estimatedSerializedBytes: 1,
      estimatedPeakBytes: 1,
      device: { deviceClass: "standard", deviceMemoryGb: 8, hardwareConcurrency: 8, coarsePointer: false, workerSupported: true },
      recommendedDeadlineMs: 30_000,
      reasons: [],
    });
    const complex = estimateOfflineExactDurationLabel(24 * 3_600, {
      profile: "complex",
      recommendedStrategy: "conservative",
      score: 100,
      entityCount: 10_000,
      beltCount: 20_000,
      stationCount: 100,
      quantumStationCount: 50,
      routeCount: 100,
      activeConstructionJobs: 5,
      fluidOrGasConnections: 100,
      nearCacheBoundaryCount: 100,
      activeDysonSystems: 3,
      finiteResourceBoundaryCount: 4,
      estimatedSerializedBytes: 30_000_000,
      estimatedPeakBytes: 500_000_000,
      device: { deviceClass: "constrained", deviceMemoryGb: 4, hardwareConcurrency: 4, coarsePointer: true, workerSupported: true },
      recommendedDeadlineMs: 60_000,
      reasons: [],
    });
    expect(simple).toBe("1～15 秒");
    expect(complex).toContain("小时");
  });
});
