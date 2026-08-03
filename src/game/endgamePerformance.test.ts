import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CANVAS_PERFORMANCE_FEATURES_KEY,
  DEFAULT_CANVAS_PERFORMANCE_FEATURES,
  canvasPerformanceFeatureIsActive,
  normalizeCanvasPerformanceFeatures,
  readCanvasPerformanceFeatures,
  writeCanvasPerformanceFeatures,
} from "./endgamePerformance";

afterEach(() => vi.unstubAllGlobals());

describe("canvas performance device preferences", () => {
  it("fills missing and invalid feature switches from conservative defaults", () => {
    expect(normalizeCanvasPerformanceFeatures({ renderProjection: false, canvasBelts: "yes" })).toEqual({
      ...DEFAULT_CANVAS_PERFORMANCE_FEATURES,
      renderProjection: false,
    });
  });

  it("keeps visual degradation dormant until endgame extreme mode is enabled", () => {
    const features = { ...DEFAULT_CANVAS_PERFORMANCE_FEATURES };
    expect(canvasPerformanceFeatureIsActive(features, "renderProjection", false)).toBe(true);
    expect(canvasPerformanceFeatureIsActive(features, "topologyCache", false)).toBe(true);
    expect(canvasPerformanceFeatureIsActive(features, "canvasBelts", false)).toBe(false);
    expect(canvasPerformanceFeatureIsActive(features, "nodeLod", true)).toBe(true);
  });

  it("round-trips switches through local storage without touching game state", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    const changed = { ...DEFAULT_CANVAS_PERFORMANCE_FEATURES, canvasBelts: false, topologyCache: false };
    writeCanvasPerformanceFeatures(changed);
    expect(values.has(CANVAS_PERFORMANCE_FEATURES_KEY)).toBe(true);
    expect(readCanvasPerformanceFeatures()).toEqual(changed);
  });
});
