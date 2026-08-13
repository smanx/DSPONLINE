import type {
  OfflineDeviceClass,
  OfflineRecommendedStrategy,
  OfflineSaveProfile,
} from "./offlineComplexityTypes";

const PROFILE_LABELS: Record<OfflineSaveProfile, string> = {
  simple: "简单存档",
  "stable-endgame": "稳定终局档",
  "volatile-endgame": "物流波动终局档",
  complex: "复杂边界终局档",
};

const DEVICE_CLASS_LABELS: Record<OfflineDeviceClass, string> = {
  standard: "标准设备",
  constrained: "受限设备",
  "low-memory": "低内存设备",
};

const STRATEGY_LABELS: Record<OfflineRecommendedStrategy, string> = {
  exact: "精确结算",
  fast: "快速校准",
  conservative: "保守宏观",
};

/** Pure presentation labels. This module must stay free of game-core imports. */
export function offlineProfileLabel(profile: OfflineSaveProfile): string {
  return PROFILE_LABELS[profile];
}

export function offlineDeviceClassLabel(deviceClass: OfflineDeviceClass): string {
  return DEVICE_CLASS_LABELS[deviceClass];
}

export function offlineRecommendedStrategyLabel(strategy: OfflineRecommendedStrategy): string {
  return STRATEGY_LABELS[strategy];
}
