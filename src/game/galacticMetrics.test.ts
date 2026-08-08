import { describe, expect, it } from "vitest";
import {
  GALACTIC_NOMINAL_METRIC_VERSION,
  LEGACY_ACTIVE_PLANET_METRIC_VERSION,
  aggregateGalacticFactoryMetric,
} from "../../server/galactic-metrics.mjs";

describe("galactic factory metric aggregation", () => {
  it("sums every planet while the active-planet value follows activePlanetId", () => {
    const state = {
      activePlanetId: "home",
      metrics: { totalItemsPerMinute: 999 },
      planetMetrics: {
        home: { totalItemsPerMinute: 100 },
        ashen: { totalItemsPerMinute: 200 },
        abyss: { totalItemsPerMinute: 300 },
      },
    };

    expect(aggregateGalacticFactoryMetric(state, "totalItemsPerMinute")).toEqual({
      activePlanetValue: 100,
      galacticValue: 600,
      metricVersion: GALACTIC_NOMINAL_METRIC_VERSION,
      planetCount: 3,
      invalidPlanetCount: 0,
    });

    state.activePlanetId = "abyss";
    state.metrics.totalItemsPerMinute = 300;
    expect(aggregateGalacticFactoryMetric(state, "totalItemsPerMinute")).toMatchObject({
      activePlanetValue: 300,
      galacticValue: 600,
      metricVersion: GALACTIC_NOMINAL_METRIC_VERSION,
    });
  });

  it("uses the root snapshot only for old saves without explicit planet metrics", () => {
    expect(aggregateGalacticFactoryMetric({
      metrics: { totalItemsPerMinute: 450 },
    }, "totalItemsPerMinute")).toEqual({
      activePlanetValue: 450,
      galacticValue: 450,
      metricVersion: LEGACY_ACTIVE_PLANET_METRIC_VERSION,
      planetCount: 0,
      invalidPlanetCount: 0,
    });
    expect(aggregateGalacticFactoryMetric({
      metrics: { totalItemsPerMinute: 450 },
      planetMetrics: {},
    }, "totalItemsPerMinute").metricVersion).toBe(LEGACY_ACTIVE_PLANET_METRIC_VERSION);
  });

  it("ignores invalid planet values and saturates finite overflow", () => {
    const invalid = aggregateGalacticFactoryMetric({
      activePlanetId: "negative",
      metrics: { totalItemsPerMinute: 7 },
      planetMetrics: {
        valid: { totalItemsPerMinute: 10 },
        negative: { totalItemsPerMinute: -1 },
        nan: { totalItemsPerMinute: Number.NaN },
        infinite: { totalItemsPerMinute: Number.POSITIVE_INFINITY },
        string: { totalItemsPerMinute: "20" },
        missing: {},
      },
    }, "totalItemsPerMinute");
    expect(invalid).toMatchObject({
      activePlanetValue: 7,
      galacticValue: 10,
      planetCount: 6,
      invalidPlanetCount: 5,
    });
    expect(Number.isFinite(invalid.galacticValue)).toBe(true);

    expect(aggregateGalacticFactoryMetric({
      activePlanetId: "one",
      metrics: { totalItemsPerMinute: Number.MAX_VALUE },
      planetMetrics: {
        one: { totalItemsPerMinute: Number.MAX_VALUE },
        two: { totalItemsPerMinute: Number.MAX_VALUE },
      },
    }, "totalItemsPerMinute").galacticValue).toBe(Number.MAX_VALUE);
  });

  it("uses the last duplicate JSON object key, matching JSON.parse semantics", () => {
    const parsed = JSON.parse('{"activePlanetId":"home","planetMetrics":{"home":{"totalItemsPerMinute":1},"home":{"totalItemsPerMinute":2}}}');
    expect(aggregateGalacticFactoryMetric(parsed, "totalItemsPerMinute")).toMatchObject({
      activePlanetValue: 2,
      galacticValue: 2,
      planetCount: 1,
    });
  });
});
