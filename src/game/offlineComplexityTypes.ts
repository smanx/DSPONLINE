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

// Compatibility re-export for factory modules that already import the label
// from this contract. Start-menu code imports the presentation module directly.
export { offlineProfileLabel } from "./offlineComplexityLabels";
