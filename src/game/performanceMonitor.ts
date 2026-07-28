import type { SimulationProfiler } from "./engine";
import type { GameState, PlanetId } from "./types";

export const PERFORMANCE_SAMPLE_WINDOW_SECONDS = 60;
export const OFFLINE_PERFORMANCE_SESSION_KEY = "dsp-idle-network.offline-performance.v1";

export interface PerformanceMemorySample {
  usedBytes: number | null;
  limitBytes: number | null;
  availableBytes: number | null;
  deviceMemoryGb: number | null;
}

export interface PerformanceMonitorSample {
  recordedAt: number;
  fps: number;
  averageFrameMs: number;
  peakFrameMs: number;
  longFrameCount: number;
  workerDurationMs: number;
  workerLatencyMs: number;
  pendingTaskMs: number;
  stateBytes: number;
  saveBytes: number;
  autosaveMs: number;
  memory: PerformanceMemorySample;
  phases: SimulationProfiler | null;
}

export interface PerformanceMonitorSnapshot {
  active: boolean;
  startedAt: number | null;
  samples: PerformanceMonitorSample[];
  lastOfflineSimulationMs: number;
}

export interface PerformanceWorkerMeasurement {
  durationMs: number;
  latencyMs: number;
  pendingTaskMs: number;
  profiler: SimulationProfiler | null;
}

export interface PerformanceSaveMeasurement {
  durationMs: number;
  bytes: number;
}

export interface PerformancePhaseShare {
  id: "production" | "belts" | "logistics" | "power" | "dyson" | "construction" | "history" | "copy" | "other";
  label: string;
  durationMs: number;
  share: number;
}

const PHASES: Array<{ id: PerformancePhaseShare["id"]; label: string; key: keyof SimulationProfiler }> = [
  { id: "production", label: "建筑生产与采集", key: "productionMs" },
  { id: "belts", label: "传送带", key: "beltsMs" },
  { id: "logistics", label: "物流运输", key: "logisticsMs" },
  { id: "power", label: "电力", key: "powerMs" },
  { id: "dyson", label: "戴森系统", key: "dysonMs" },
  { id: "construction", label: "制造与施工", key: "constructionMs" },
  { id: "history", label: "统计历史", key: "historyMs" },
  { id: "copy", label: "状态复制", key: "copyStateMs" },
];

export function getPerformancePhaseShares(sample: PerformanceMonitorSample | null): PerformancePhaseShare[] {
  if (!sample?.phases) return [];
  const measured = PHASES.map((phase) => ({
    id: phase.id,
    label: phase.label,
    durationMs: Math.max(0, Number(sample.phases?.[phase.key]) || 0),
  }));
  const measuredTotal = measured.reduce((sum, phase) => sum + phase.durationMs, 0);
  const total = Math.max(sample.workerDurationMs, measuredTotal, 0.0001);
  const other = Math.max(0, total - measuredTotal);
  return [...measured, { id: "other" as const, label: "其他模拟开销", durationMs: other }]
    .map((phase) => ({ ...phase, share: phase.durationMs / total }))
    .sort((left, right) => right.durationMs - left.durationMs);
}

export function getPerformancePeaks(samples: readonly PerformanceMonitorSample[]) {
  return {
    peakFrameMs: samples.reduce((peak, sample) => Math.max(peak, sample.peakFrameMs), 0),
    peakWorkerMs: samples.reduce((peak, sample) => Math.max(peak, sample.workerDurationMs), 0),
    peakLatencyMs: samples.reduce((peak, sample) => Math.max(peak, sample.workerLatencyMs), 0),
    peakPendingTaskMs: samples.reduce((peak, sample) => Math.max(peak, sample.pendingTaskMs), 0),
    longFrameCount: samples.reduce((sum, sample) => sum + sample.longFrameCount, 0),
  };
}

function planetCounts(game: GameState): Record<PlanetId, { entities: number; belts: number; inFlightRoutes: number }> {
  const counts = {} as Record<PlanetId, { entities: number; belts: number; inFlightRoutes: number }>;
  for (const entity of game.entities) {
    const current = counts[entity.planetId] ?? { entities: 0, belts: 0, inFlightRoutes: 0 };
    current.entities += 1;
    current.inFlightRoutes += entity.stationRoutes?.length ?? 0;
    counts[entity.planetId] = current;
  }
  for (const belt of game.belts) {
    const current = counts[belt.planetId] ?? { entities: 0, belts: 0, inFlightRoutes: 0 };
    current.belts += 1;
    counts[belt.planetId] = current;
  }
  return counts;
}

export function createAnonymousPerformanceReport(game: GameState, snapshot: PerformanceMonitorSnapshot): Record<string, unknown> {
  const samples = snapshot.samples.map((sample) => ({
    ...sample,
    phases: sample.phases ? { ...sample.phases } : null,
  }));
  return {
    generatedAt: Date.now(),
    application: { version: __APP_VERSION__, build: __BUILD_ID__ },
    environment: {
      platform: (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? "unknown",
      viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
      language: navigator.language,
      hardwareConcurrency: navigator.hardwareConcurrency ?? null,
      deviceMemoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
    },
    factoryScale: {
      stateVersion: game.version,
      elapsedSeconds: game.elapsedSeconds,
      totalEntities: game.entities.length,
      totalBelts: game.belts.length,
      inFlightRoutes: game.entities.reduce((sum, entity) => sum + (entity.stationRoutes?.length ?? 0), 0),
      planets: planetCounts(game),
    },
    sampling: {
      active: snapshot.active,
      startedAt: snapshot.startedAt,
      windowSeconds: PERFORMANCE_SAMPLE_WINDOW_SECONDS,
      lastOfflineSimulationMs: snapshot.lastOfflineSimulationMs,
      peaks: getPerformancePeaks(samples),
      samples,
    },
  };
}
