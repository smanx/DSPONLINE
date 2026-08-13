import { describe, expect, it } from "vitest";

import {
  offlineDeviceClassLabel,
  offlineProfileLabel,
  offlineRecommendedStrategyLabel,
} from "./offlineComplexityLabels";

describe("lightweight offline complexity labels", () => {
  it("labels every save profile without loading simulation data", () => {
    expect(offlineProfileLabel("simple")).toBe("简单存档");
    expect(offlineProfileLabel("stable-endgame")).toBe("稳定终局档");
    expect(offlineProfileLabel("volatile-endgame")).toBe("物流波动终局档");
    expect(offlineProfileLabel("complex")).toBe("复杂边界终局档");
  });

  it("labels device classes and settlement strategies", () => {
    expect(offlineDeviceClassLabel("standard")).toBe("标准设备");
    expect(offlineDeviceClassLabel("constrained")).toBe("受限设备");
    expect(offlineDeviceClassLabel("low-memory")).toBe("低内存设备");
    expect(offlineRecommendedStrategyLabel("exact")).toBe("精确结算");
    expect(offlineRecommendedStrategyLabel("fast")).toBe("快速校准");
    expect(offlineRecommendedStrategyLabel("conservative")).toBe("保守宏观");
  });
});
