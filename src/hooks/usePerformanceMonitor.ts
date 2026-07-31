import { useCallback, useEffect, useRef, useState } from "react";
import { exportTextFile } from "../game/fileExport";
import {
  OFFLINE_PERFORMANCE_SESSION_KEY,
  PERFORMANCE_SAMPLE_WINDOW_SECONDS,
  createAnonymousPerformanceReport,
  type PerformanceMonitorSnapshot,
  type PerformanceSaveMeasurement,
  type PerformanceWorkerMeasurement,
} from "../game/performanceMonitor";
import { getLocalSaveSummaryMetrics } from "../game/storage";
import type { GameState } from "../game/types";

function readLastOfflineDuration(): number {
  try {
    const value = Number(window.sessionStorage.getItem(OFFLINE_PERFORMANCE_SESSION_KEY));
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  } catch {
    return 0;
  }
}

function memorySample() {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number; jsHeapSizeLimit?: number } }).memory;
  const usedBytes = Number.isFinite(memory?.usedJSHeapSize) ? Math.max(0, memory!.usedJSHeapSize!) : null;
  const limitBytes = Number.isFinite(memory?.jsHeapSizeLimit) ? Math.max(0, memory!.jsHeapSizeLimit!) : null;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return {
    usedBytes,
    limitBytes,
    availableBytes: usedBytes !== null && limitBytes !== null ? Math.max(0, limitBytes - usedBytes) : null,
    deviceMemoryGb: Number.isFinite(deviceMemory) ? deviceMemory! : null,
  };
}

function serializedSize(value: unknown): number {
  try {
    const raw = JSON.stringify(value);
    return typeof TextEncoder !== "undefined" ? new TextEncoder().encode(raw).byteLength : raw.length;
  } catch {
    return 0;
  }
}

function textSize(value: string): number {
  return typeof TextEncoder !== "undefined" ? new TextEncoder().encode(value).byteLength : value.length;
}

export function usePerformanceMonitor(getGame: () => GameState, paused = false) {
  const initial = useRef<PerformanceMonitorSnapshot>({
    active: false,
    startedAt: null,
    samples: [],
    lastOfflineSimulationMs: readLastOfflineDuration(),
  });
  const [snapshot, setSnapshot] = useState(initial.current);
  const snapshotRef = useRef(snapshot);
  const activeRef = useRef(false);
  const workerRef = useRef<PerformanceWorkerMeasurement>({ durationMs: 0, latencyMs: 0, pendingTaskMs: 0, profiler: null });
  const saveRef = useRef<PerformanceSaveMeasurement>({ durationMs: 0, bytes: 0, stages: null });
  const saveStorageRef = useRef<ReturnType<typeof getLocalSaveSummaryMetrics> | null>(null);
  const stateBytesRef = useRef(0);

  const updateSnapshot = useCallback((updater: (current: PerformanceMonitorSnapshot) => PerformanceMonitorSnapshot) => {
    setSnapshot((current) => {
      const next = updater(current);
      snapshotRef.current = next;
      return next;
    });
  }, []);

  const start = useCallback(() => {
    activeRef.current = true;
    try {
      const raw = window.localStorage.getItem("dsp-idle-network.save.v1");
      if (raw) saveRef.current = { ...saveRef.current, bytes: textSize(raw) };
    } catch { /* storage size is optional diagnostics */ }
    updateSnapshot(() => ({ active: true, startedAt: Date.now(), samples: [], lastOfflineSimulationMs: readLastOfflineDuration() }));
  }, [updateSnapshot]);

  const stop = useCallback(() => {
    activeRef.current = false;
    updateSnapshot((current) => ({ ...current, active: false }));
  }, [updateSnapshot]);

  const clear = useCallback(() => {
    updateSnapshot((current) => ({ ...current, samples: [], startedAt: current.active ? Date.now() : current.startedAt }));
  }, [updateSnapshot]);

  const recordWorker = useCallback((measurement: PerformanceWorkerMeasurement) => {
    if (!activeRef.current) return;
    workerRef.current = {
      durationMs: Math.max(0, measurement.durationMs),
      latencyMs: Math.max(0, measurement.latencyMs),
      pendingTaskMs: Math.max(0, measurement.pendingTaskMs),
      profiler: measurement.profiler ? { ...measurement.profiler } : null,
    };
  }, []);

  const recordSave = useCallback((measurement: PerformanceSaveMeasurement) => {
    if (!activeRef.current) return;
    saveRef.current = {
      durationMs: Math.max(0, measurement.durationMs),
      bytes: Math.max(0, Math.floor(measurement.bytes)),
      stages: measurement.stages ? { ...measurement.stages } : null,
    };
  }, []);

  useEffect(() => {
    if (!snapshot.active || paused) return;
    let frameId = 0;
    let previousFrameAt = performance.now();
    let windowStartedAt = previousFrameAt;
    let frames = 0;
    let totalFrameMs = 0;
    let peakFrameMs = 0;
    let longFrameCount = 0;
    let sampleSequence = 0;
    const sampleFrame = (now: number) => {
      if (document.visibilityState === "hidden") {
        previousFrameAt = now;
        windowStartedAt = now;
        frames = 0;
        totalFrameMs = 0;
        peakFrameMs = 0;
        longFrameCount = 0;
        frameId = window.requestAnimationFrame(sampleFrame);
        return;
      }
      const frameMs = Math.max(0, now - previousFrameAt);
      previousFrameAt = now;
      frames += 1;
      totalFrameMs += frameMs;
      peakFrameMs = Math.max(peakFrameMs, frameMs);
      if (frameMs >= 50) longFrameCount += 1;
      const elapsed = now - windowStartedAt;
      if (elapsed >= 1_000) {
        sampleSequence += 1;
        if (sampleSequence === 1 || sampleSequence % 5 === 0) {
          stateBytesRef.current = serializedSize(getGame());
          saveStorageRef.current = getLocalSaveSummaryMetrics();
        }
        const worker = workerRef.current;
        const save = saveRef.current;
        const sample = {
          recordedAt: Date.now(),
          fps: frames * 1_000 / elapsed,
          averageFrameMs: frames > 0 ? totalFrameMs / frames : 0,
          peakFrameMs,
          longFrameCount,
          workerDurationMs: worker.durationMs,
          workerLatencyMs: worker.latencyMs,
          pendingTaskMs: worker.pendingTaskMs,
          stateBytes: stateBytesRef.current,
          saveBytes: save.bytes,
          autosaveMs: save.durationMs,
          saveStages: save.stages ? { ...save.stages } : null,
          saveStorage: saveStorageRef.current ? { ...saveStorageRef.current } : null,
          memory: memorySample(),
          phases: worker.profiler ? { ...worker.profiler } : null,
        };
        updateSnapshot((current) => ({
          ...current,
          samples: [...current.samples, sample].slice(-PERFORMANCE_SAMPLE_WINDOW_SECONDS),
          lastOfflineSimulationMs: readLastOfflineDuration(),
        }));
        windowStartedAt = now;
        frames = 0;
        totalFrameMs = 0;
        peakFrameMs = 0;
        longFrameCount = 0;
      }
      frameId = window.requestAnimationFrame(sampleFrame);
    };
    frameId = window.requestAnimationFrame(sampleFrame);
    return () => window.cancelAnimationFrame(frameId);
  }, [getGame, paused, snapshot.active, updateSnapshot]);

  const exportAnonymous = useCallback(async () => {
    const report = createAnonymousPerformanceReport(getGame(), snapshotRef.current);
    await exportTextFile({
      contents: JSON.stringify(report, null, 2),
      fileName: `dsp-performance-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
      title: "导出匿名性能诊断",
    });
  }, [getGame]);

  const isActive = useCallback(() => activeRef.current, []);

  return { snapshot, start, stop, clear, recordWorker, recordSave, exportAnonymous, isActive };
}
