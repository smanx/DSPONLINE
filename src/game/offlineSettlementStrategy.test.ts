import { describe, expect, it } from "vitest";
import {
  classifyOfflineSettlementFailure,
  normalizeOfflineSettlementPreference,
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
});
