export type LeaderboardCategoryId = "power" | "upload" | "white-rate" | "dyson" | "throughput" | "galaxy";

export interface LeaderboardMetrics {
  energyGeneratedMj: number;
  uploadedWhiteMatrix: number;
  peakWhiteMatrixPerMinute: number;
  peakGenerationKw: number;
  /** Actual settled totalProduced delta. */
  peakThroughputPerMinute: number;
  /** Nominal machine capacity retained as a separate diagnostic. */
  theoreticalPeakThroughputPerMinute?: number;
  /** Nominal snapshot for the planet active when the save was uploaded. */
  activePlanetThroughputPerMinute?: number;
  /** Saturating sum of every explicit planetMetrics entry. */
  galacticThroughputPerMinute?: number;
  nominalThroughputMetricVersion?: "galactic-planet-sum-v1" | "legacy-active-planet-v1";
  throughputMetricVersion?: "settled-total-produced-v1" | "legacy-nominal-v1";
  throughputWindowSeconds?: number;
  peakDysonPowerKw: number;
  exploredSystems: number;
  colonizedPlanets: number;
  galaxyScore: number;
}

function nonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function integer(value: unknown): number {
  return Math.floor(nonNegative(value));
}

function saturatingProduct(left: number, right: number): number {
  if (left <= 0 || right <= 0) return 0;
  return left > Number.MAX_VALUE / right ? Number.MAX_VALUE : left * right;
}

function saturatingAdd(left: number, right: number): number {
  const safeLeft = nonNegative(left);
  const safeRight = nonNegative(right);
  return safeLeft >= Number.MAX_VALUE - safeRight ? Number.MAX_VALUE : safeLeft + safeRight;
}

export function calculateLeaderboardGalaxyScore(metrics: Omit<LeaderboardMetrics, "galaxyScore">): number {
  const terms = [
    metrics.energyGeneratedMj / 1_000_000,
    saturatingProduct(metrics.uploadedWhiteMatrix, 12),
    metrics.peakDysonPowerKw / 100,
    saturatingProduct(metrics.peakThroughputPerMinute, 8),
    saturatingProduct(metrics.exploredSystems, 10_000),
    saturatingProduct(metrics.colonizedPlanets, 2_000),
  ];
  return Math.round(terms.reduce(saturatingAdd, 0));
}

export function normalizeLeaderboardMetrics(value: unknown): LeaderboardMetrics {
  const source = value && typeof value === "object" ? value as Record<string, any> : {};
  const nominalFallback = nonNegative(source.theoreticalPeakThroughputPerMinute
    ?? source.galacticThroughputPerMinute
    ?? source.peakThroughputPerMinute);
  const metrics = {
    energyGeneratedMj: nonNegative(source.energyGeneratedMj),
    uploadedWhiteMatrix: integer(source.uploadedWhiteMatrix),
    peakWhiteMatrixPerMinute: nonNegative(source.peakWhiteMatrixPerMinute),
    peakGenerationKw: nonNegative(source.peakGenerationKw),
    peakThroughputPerMinute: nonNegative(source.peakThroughputPerMinute),
    theoreticalPeakThroughputPerMinute: nominalFallback,
    activePlanetThroughputPerMinute: nonNegative(source.activePlanetThroughputPerMinute ?? nominalFallback),
    galacticThroughputPerMinute: nonNegative(source.galacticThroughputPerMinute ?? nominalFallback),
    nominalThroughputMetricVersion: (source.nominalThroughputMetricVersion === "galactic-planet-sum-v1"
      ? "galactic-planet-sum-v1"
      : "legacy-active-planet-v1") as LeaderboardMetrics["nominalThroughputMetricVersion"],
    throughputMetricVersion: (source.throughputMetricVersion === "settled-total-produced-v1"
      ? "settled-total-produced-v1"
      : "legacy-nominal-v1") as LeaderboardMetrics["throughputMetricVersion"],
    throughputWindowSeconds: nonNegative(source.throughputWindowSeconds),
    peakDysonPowerKw: nonNegative(source.peakDysonPowerKw),
    exploredSystems: integer(source.exploredSystems),
    colonizedPlanets: integer(source.colonizedPlanets),
  };
  return { ...metrics, galaxyScore: calculateLeaderboardGalaxyScore(metrics) };
}
