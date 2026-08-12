export type OfflineSaveProfile = "simple" | "stable-endgame" | "volatile-endgame" | "complex";
export type OfflineDeviceClass = "standard" | "constrained" | "low-memory";
export type OfflineRecommendedStrategy = "exact" | "fast" | "conservative";

export interface OfflineDeviceCapability {
  deviceClass: OfflineDeviceClass;
  deviceMemoryGb: number | null;
  hardwareConcurrency: number | null;
  coarsePointer: boolean;
  workerSupported: boolean;
}

/** Runtime-only diagnosis. It is never persisted in GameState or save data. */
export interface OfflineComplexityReport {
  profile: OfflineSaveProfile;
  recommendedStrategy: OfflineRecommendedStrategy;
  score: number;
  entityCount: number;
  beltCount: number;
  stationCount: number;
  quantumStationCount: number;
  routeCount: number;
  activeConstructionJobs: number;
  fluidOrGasConnections: number;
  nearCacheBoundaryCount: number;
  activeDysonSystems: number;
  finiteResourceBoundaryCount: number;
  estimatedSerializedBytes: number;
  estimatedPeakBytes: number;
  device: OfflineDeviceCapability;
  recommendedDeadlineMs: number;
  reasons: string[];
  warning?: string;
}

export function offlineProfileLabel(profile: OfflineSaveProfile): string {
  if (profile === "simple") return "简单存档";
  if (profile === "stable-endgame") return "稳定终局档";
  if (profile === "volatile-endgame") return "物流波动终局档";
  return "复杂边界终局档";
}
