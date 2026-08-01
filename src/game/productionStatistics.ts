import { formatQuantityCompact } from "./quantityFormat";
import type { ItemId, ProductionHistorySample } from "./types";

export type ProductionStatisticsWindow = "second" | "minute" | "ten-minutes" | "hour";

export interface ProductionStatisticsWindowDefinition {
  id: ProductionStatisticsWindow;
  label: string;
  seconds: number;
  suffix: string;
}

export const PRODUCTION_STATISTICS_WINDOWS: readonly ProductionStatisticsWindowDefinition[] = [
  { id: "second", label: "每秒", seconds: 1, suffix: "/s" },
  { id: "minute", label: "每分钟", seconds: 60, suffix: "/min" },
  { id: "ten-minutes", label: "每十分钟", seconds: 600, suffix: "/10min" },
  { id: "hour", label: "每小时", seconds: 3_600, suffix: "/h" },
] as const;

export const PRODUCTION_HISTORY_SAMPLE_SECONDS = 1;
const RECENT_FINE_SECONDS = 70;
const RECENT_MEDIUM_SECONDS = 660;
const HISTORY_RETENTION_SECONDS = 3_660;

function rounded(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function getProductionHistorySampleDuration(sample: ProductionHistorySample): number {
  const duration = sample.sampleDurationSeconds;
  return Number.isFinite(duration) && duration! > 0 ? Math.max(1, Math.round(duration!)) : 10;
}

function mergeRateRecords(
  samples: readonly ProductionHistorySample[],
  selector: (sample: ProductionHistorySample) => Partial<Record<ItemId, number>>,
  duration: number,
): Partial<Record<ItemId, number>> {
  const weighted = new Map<ItemId, number>();
  for (const sample of samples) {
    const sampleDuration = getProductionHistorySampleDuration(sample);
    for (const [itemId, value] of Object.entries(selector(sample)) as Array<[ItemId, number | undefined]>) {
      if (!Number.isFinite(value)) continue;
      weighted.set(itemId, (weighted.get(itemId) ?? 0) + (value ?? 0) * sampleDuration);
    }
  }
  return Object.fromEntries([...weighted].map(([itemId, value]) => [itemId, rounded(value / duration)])) as Partial<Record<ItemId, number>>;
}

function weightedOptional(
  samples: readonly ProductionHistorySample[],
  selector: (sample: ProductionHistorySample) => number | undefined,
  duration: number,
): number | undefined {
  let total = 0;
  let covered = 0;
  for (const sample of samples) {
    const value = selector(sample);
    if (!Number.isFinite(value)) continue;
    const sampleDuration = getProductionHistorySampleDuration(sample);
    total += value! * sampleDuration;
    covered += sampleDuration;
  }
  return covered > 0 ? rounded(total / Math.min(duration, covered), 4) : undefined;
}

export function mergeProductionHistorySamples(samples: readonly ProductionHistorySample[]): ProductionHistorySample {
  if (samples.length === 0) throw new Error("生产统计时间桶不能为空");
  const duration = samples.reduce((sum, sample) => sum + getProductionHistorySampleDuration(sample), 0);
  const latest = samples.at(-1)!;
  return {
    elapsedSeconds: latest.elapsedSeconds,
    sampleDurationSeconds: duration,
    productionPerMinute: mergeRateRecords(samples, (sample) => sample.productionPerMinute, duration),
    consumptionPerMinute: mergeRateRecords(samples, (sample) => sample.consumptionPerMinute, duration),
    inventory: { ...latest.inventory },
    generationKw: weightedOptional(samples, (sample) => sample.generationKw, duration) ?? latest.generationKw,
    demandKw: weightedOptional(samples, (sample) => sample.demandKw, duration) ?? latest.demandKw,
    machineEfficiency: weightedOptional(samples, (sample) => sample.machineEfficiency, duration),
    logisticsEfficiency: weightedOptional(samples, (sample) => sample.logisticsEfficiency, duration),
    powerEfficiency: weightedOptional(samples, (sample) => sample.powerEfficiency, duration),
    activeMachines: Math.max(0, Math.round(weightedOptional(samples, (sample) => sample.activeMachines, duration) ?? latest.activeMachines ?? 0)),
    blockedMachines: Math.max(0, Math.round(weightedOptional(samples, (sample) => sample.blockedMachines, duration) ?? latest.blockedMachines ?? 0)),
  };
}

function compactBucketsBefore(
  history: ProductionHistorySample[],
  cutoffElapsedSeconds: number,
  targetDurationSeconds: number,
): void {
  while (true) {
    const start = history.findIndex((sample) =>
      sample.elapsedSeconds <= cutoffElapsedSeconds && getProductionHistorySampleDuration(sample) < targetDurationSeconds);
    if (start < 0) return;
    let duration = 0;
    let end = start;
    while (end < history.length && history[end].elapsedSeconds <= cutoffElapsedSeconds &&
      getProductionHistorySampleDuration(history[end]) < targetDurationSeconds && duration < targetDurationSeconds) {
      duration += getProductionHistorySampleDuration(history[end]);
      end += 1;
    }
    if (end - start < 2 || duration < targetDurationSeconds) return;
    history.splice(start, end - start, mergeProductionHistorySamples(history.slice(start, end)));
  }
}

/**
 * Keep one-hour rolling statistics without retaining 3,600 full item maps.
 * Recent data stays at one-second resolution, then folds into ten-second and
 * one-minute buckets. One extra minute is retained for an exact rolling edge.
 */
export function compactProductionHistory(samples: readonly ProductionHistorySample[]): ProductionHistorySample[] {
  const history = [...samples].sort((left, right) => left.elapsedSeconds - right.elapsedSeconds);
  const latestElapsedSeconds = history.at(-1)?.elapsedSeconds ?? 0;
  // Worker publications can cover 1, 4, 5, 12, or more simulation seconds.
  // Compact by covered time rather than assuming every source bucket is
  // exactly one second, otherwise higher simulation speeds grow saves forever.
  compactBucketsBefore(history, latestElapsedSeconds - RECENT_FINE_SECONDS, 10);
  compactBucketsBefore(history, latestElapsedSeconds - RECENT_FINE_SECONDS - RECENT_MEDIUM_SECONDS, 60);
  let retainedSeconds = history.reduce((sum, sample) => sum + getProductionHistorySampleDuration(sample), 0);
  while (history.length > 1 && retainedSeconds > HISTORY_RETENTION_SECONDS) {
    retainedSeconds -= getProductionHistorySampleDuration(history[0]);
    history.shift();
  }
  return history;
}

export interface ProductionWindowSnapshot {
  window: ProductionStatisticsWindowDefinition;
  coveredSeconds: number;
  production: Partial<Record<ItemId, number>>;
  consumption: Partial<Record<ItemId, number>>;
  totalProduction: number;
  totalConsumption: number;
}

export function calculateProductionWindowSnapshot(
  history: readonly ProductionHistorySample[],
  windowId: ProductionStatisticsWindow,
  fallbackProductionPerMinute: Partial<Record<ItemId, number>> = {},
  fallbackConsumptionPerMinute: Partial<Record<ItemId, number>> = {},
): ProductionWindowSnapshot {
  const window = PRODUCTION_STATISTICS_WINDOWS.find((entry) => entry.id === windowId) ?? PRODUCTION_STATISTICS_WINDOWS[1];
  const weightedProduction = new Map<ItemId, number>();
  const weightedConsumption = new Map<ItemId, number>();
  let remaining = window.seconds;
  let coveredSeconds = 0;
  const addWeighted = (target: Map<ItemId, number>, record: Partial<Record<ItemId, number>>, weight: number) => {
    for (const [itemId, value] of Object.entries(record) as Array<[ItemId, number | undefined]>) {
      if (!Number.isFinite(value)) continue;
      target.set(itemId, (target.get(itemId) ?? 0) + (value ?? 0) * weight);
    }
  };
  for (let index = history.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const sample = history[index];
    const overlap = Math.min(remaining, getProductionHistorySampleDuration(sample));
    addWeighted(weightedProduction, sample.productionPerMinute, overlap);
    addWeighted(weightedConsumption, sample.consumptionPerMinute, overlap);
    coveredSeconds += overlap;
    remaining -= overlap;
  }

  const scale = window.seconds / 60;
  const normalized = (
    weighted: Map<ItemId, number>,
    fallback: Partial<Record<ItemId, number>>,
  ): Partial<Record<ItemId, number>> => {
    if (coveredSeconds <= 0) {
      return Object.fromEntries(Object.entries(fallback).map(([itemId, value]) => [itemId, rounded((value ?? 0) * scale)])) as Partial<Record<ItemId, number>>;
    }
    return Object.fromEntries([...weighted].map(([itemId, value]) => [itemId, rounded(value / coveredSeconds * scale)])) as Partial<Record<ItemId, number>>;
  };
  const production = normalized(weightedProduction, fallbackProductionPerMinute);
  const consumption = normalized(weightedConsumption, fallbackConsumptionPerMinute);
  return {
    window,
    coveredSeconds,
    production,
    consumption,
    totalProduction: rounded(Object.values(production).reduce((sum, value) => sum + (value ?? 0), 0)),
    totalConsumption: rounded(Object.values(consumption).reduce((sum, value) => sum + (value ?? 0), 0)),
  };
}

export function formatProductionStatistic(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) < 0.005) return "0";
  if (Math.abs(value) >= 10_000) return formatQuantityCompact(Math.trunc(value));
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function formatProductionStatisticExact(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 6 });
}
