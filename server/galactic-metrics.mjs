export const GALACTIC_NOMINAL_METRIC_VERSION = "galactic-planet-sum-v1";
export const LEGACY_ACTIVE_PLANET_METRIC_VERSION = "legacy-active-planet-v1";

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeFactoryMetric(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function saturatingFactoryMetricAdd(left, right) {
  const normalizedLeft = normalizeFactoryMetric(left);
  const normalizedRight = normalizeFactoryMetric(right);
  return normalizedLeft >= Number.MAX_VALUE - normalizedRight
    ? Number.MAX_VALUE
    : normalizedLeft + normalizedRight;
}

/**
 * Aggregates one nominal factory metric without treating the active-planet UI
 * snapshot as a galactic total. Explicit planetMetrics entries are authoritative;
 * only old saves with no entries use the root metrics fallback.
 */
export function aggregateGalacticFactoryMetric(state, metricKey) {
  const source = isRecord(state) ? state : {};
  const rootMetricValue = normalizeFactoryMetric(
    isRecord(source.metrics) ? source.metrics[metricKey] : 0,
  );
  const planetMetrics = isRecord(source.planetMetrics) ? source.planetMetrics : null;
  const planetIds = planetMetrics ? Object.keys(planetMetrics) : [];
  if (planetIds.length === 0) {
    return {
      activePlanetValue: rootMetricValue,
      galacticValue: rootMetricValue,
      metricVersion: LEGACY_ACTIVE_PLANET_METRIC_VERSION,
      planetCount: 0,
      invalidPlanetCount: 0,
    };
  }

  let galacticValue = 0;
  let invalidPlanetCount = 0;
  for (const planetId of planetIds) {
    const metrics = planetMetrics[planetId];
    const rawValue = isRecord(metrics) ? metrics[metricKey] : undefined;
    if (!(typeof rawValue === "number" && Number.isFinite(rawValue) && rawValue >= 0)) {
      invalidPlanetCount += 1;
      continue;
    }
    galacticValue = saturatingFactoryMetricAdd(galacticValue, rawValue);
  }
  const activePlanetMetrics = typeof source.activePlanetId === "string"
    ? planetMetrics[source.activePlanetId]
    : null;
  const activePlanetMetric = isRecord(activePlanetMetrics)
    ? activePlanetMetrics[metricKey]
    : undefined;
  const activePlanetValue = typeof activePlanetMetric === "number"
    && Number.isFinite(activePlanetMetric)
    && activePlanetMetric >= 0
    ? activePlanetMetric
    : rootMetricValue;
  return {
    activePlanetValue,
    galacticValue,
    metricVersion: GALACTIC_NOMINAL_METRIC_VERSION,
    planetCount: planetIds.length,
    invalidPlanetCount,
  };
}
