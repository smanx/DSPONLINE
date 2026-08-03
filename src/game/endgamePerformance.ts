export const ENDGAME_EXTREME_MODE_KEY = "dsp-idle-network.endgame-extreme.v1";
export const ENDGAME_EXTREME_MODE_ACK_KEY = "dsp-idle-network.endgame-extreme-ack.v1";
export const CANVAS_PERFORMANCE_FEATURES_KEY = "dsp-idle-network.canvas-performance-features.v1";

export interface CanvasPerformanceFeatures {
  /** P1: publish a planet-scoped render snapshot instead of the full galaxy state. */
  renderProjection: boolean;
  /** P2: reuse topology, route geometry and runtime indexes until explicitly invalidated. */
  topologyCache: boolean;
  /** P3: remove non-essential animation, labels and decoration. Extreme mode only. */
  extremeVisuals: boolean;
  /** P4: mount compact/medium node bodies instead of merely hiding full markup. Extreme mode only. */
  nodeLod: boolean;
  /** P5: draw ordinary belts in one Canvas layer while retaining DOM hit paths. Extreme mode only. */
  canvasBelts: boolean;
  /** P6: force React Flow viewport culling for dense end-game canvases. Extreme mode only. */
  viewportCulling: boolean;
  /** P6: reuse topology-scoped alignment, handle and routing indexes. */
  spatialIndexes: boolean;
  /** P6: keep the MiniMap on the low-frequency topology snapshot. Extreme mode only. */
  minimapThrottle: boolean;
}

export type CanvasPerformanceFeatureId = keyof CanvasPerformanceFeatures;

export const DEFAULT_CANVAS_PERFORMANCE_FEATURES: Readonly<CanvasPerformanceFeatures> = Object.freeze({
  renderProjection: true,
  topologyCache: true,
  extremeVisuals: true,
  nodeLod: true,
  canvasBelts: true,
  viewportCulling: true,
  spatialIndexes: true,
  minimapThrottle: true,
});

const EXTREME_ONLY_FEATURES = new Set<CanvasPerformanceFeatureId>([
  "extremeVisuals",
  "nodeLod",
  "canvasBelts",
  "viewportCulling",
  "minimapThrottle",
]);

function readBoolean(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

export function readEndgameExtremeMode(): boolean {
  return readBoolean(ENDGAME_EXTREME_MODE_KEY);
}

export function writeEndgameExtremeMode(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled) window.localStorage.setItem(ENDGAME_EXTREME_MODE_KEY, "true");
    else window.localStorage.removeItem(ENDGAME_EXTREME_MODE_KEY);
  } catch {
    // Device-only preferences are best effort and never block gameplay.
  }
}

export function hasAcknowledgedEndgameExtremeMode(): boolean {
  return readBoolean(ENDGAME_EXTREME_MODE_ACK_KEY);
}

export function acknowledgeEndgameExtremeMode(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(ENDGAME_EXTREME_MODE_ACK_KEY, "true"); } catch { /* optional preference */ }
}

export function normalizeCanvasPerformanceFeatures(value: unknown): CanvasPerformanceFeatures {
  if (!value || typeof value !== "object") return { ...DEFAULT_CANVAS_PERFORMANCE_FEATURES };
  const source = value as Partial<Record<CanvasPerformanceFeatureId, unknown>>;
  return Object.fromEntries(
    (Object.keys(DEFAULT_CANVAS_PERFORMANCE_FEATURES) as CanvasPerformanceFeatureId[]).map((id) => [
      id,
      typeof source[id] === "boolean" ? source[id] : DEFAULT_CANVAS_PERFORMANCE_FEATURES[id],
    ]),
  ) as unknown as CanvasPerformanceFeatures;
}

export function readCanvasPerformanceFeatures(): CanvasPerformanceFeatures {
  if (typeof window === "undefined") return { ...DEFAULT_CANVAS_PERFORMANCE_FEATURES };
  try {
    const raw = window.localStorage.getItem(CANVAS_PERFORMANCE_FEATURES_KEY);
    return raw ? normalizeCanvasPerformanceFeatures(JSON.parse(raw)) : { ...DEFAULT_CANVAS_PERFORMANCE_FEATURES };
  } catch {
    return { ...DEFAULT_CANVAS_PERFORMANCE_FEATURES };
  }
}

export function writeCanvasPerformanceFeatures(features: CanvasPerformanceFeatures): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CANVAS_PERFORMANCE_FEATURES_KEY, JSON.stringify(normalizeCanvasPerformanceFeatures(features)));
  } catch {
    // Device-only preferences are best effort and never block gameplay.
  }
}

export function canvasPerformanceFeatureIsActive(
  features: CanvasPerformanceFeatures,
  id: CanvasPerformanceFeatureId,
  endgameExtremeMode: boolean,
): boolean {
  return features[id] && (!EXTREME_ONLY_FEATURES.has(id) || endgameExtremeMode);
}
