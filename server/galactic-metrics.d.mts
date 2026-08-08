export type GalacticNominalMetricVersion = "galactic-planet-sum-v1" | "legacy-active-planet-v1";

export interface GalacticFactoryMetricSnapshot {
  activePlanetValue: number;
  galacticValue: number;
  metricVersion: GalacticNominalMetricVersion;
  planetCount: number;
  invalidPlanetCount: number;
}

export const GALACTIC_NOMINAL_METRIC_VERSION: "galactic-planet-sum-v1";
export const LEGACY_ACTIVE_PLANET_METRIC_VERSION: "legacy-active-planet-v1";
export function normalizeFactoryMetric(value: unknown): number;
export function saturatingFactoryMetricAdd(left: unknown, right: unknown): number;
export function aggregateGalacticFactoryMetric(state: unknown, metricKey: string): GalacticFactoryMetricSnapshot;
