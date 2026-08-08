import { describe, expect, it } from "vitest";
import {
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
    })).toBe("conservative");
  });

  it("uses the zero-calibration conservative path after a hard Worker restart", () => {
    expect(selectInitialOfflineWorkerStrategy({ ...ordinary, conservativeOnly: true })).toBe("conservative");
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
});
