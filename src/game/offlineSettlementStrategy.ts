import type { OfflineApproximationResult } from "./offlineApproximation";
import { FAST_OFFLINE_CALIBRATION_SECONDS } from "./offlineSettlementConstants";

export const OFFLINE_SETTLEMENT_PREFERENCE_KEY = "dsp-idle-network.offline-settlement-preference.v1";
const LEGACY_OFFLINE_APPROXIMATION_KEY = "dsp-idle-network.experimental-approximate-offline.v1";

export type OfflineSettlementPreference = "ask" | "exact" | "skip";
export type OfflineSettlementFailureKind =
  | "timeout"
  | "worker-error"
  | "memory-risk"
  | "calibration-unstable"
  | "boundary-validation"
  | "invalid-source"
  | "cancelled"
  | "contract-rejected"
  | "unknown";

export type OfflineWorkerSettlementStrategy = "fast" | "conservative-preview" | "exact" | "invalid-source";

export function normalizeOfflineSettlementPreference(value: unknown): OfflineSettlementPreference {
  return value === "exact" || value === "skip" ? value : "ask";
}

export function readOfflineSettlementPreference(storage?: Pick<Storage, "getItem">): OfflineSettlementPreference {
  const target = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
  if (!target) return "ask";
  try {
    const value = target.getItem(OFFLINE_SETTLEMENT_PREFERENCE_KEY);
    if (value !== null) return normalizeOfflineSettlementPreference(value);
    return target.getItem(LEGACY_OFFLINE_APPROXIMATION_KEY) === "false" ? "exact" : "ask";
  } catch {
    return "ask";
  }
}

export function writeOfflineSettlementPreference(preference: OfflineSettlementPreference): void {
  if (typeof window === "undefined") return;
  try {
    const normalized = normalizeOfflineSettlementPreference(preference);
    window.localStorage.setItem(OFFLINE_SETTLEMENT_PREFERENCE_KEY, normalized);
    window.localStorage.setItem(LEGACY_OFFLINE_APPROXIMATION_KEY, String(normalized !== "exact"));
  } catch { /* device preference */ }
}

export function classifyOfflineSettlementFailure(reason: string | undefined): OfflineSettlementFailureKind {
  const normalized = (reason ?? "").toLowerCase();
  if (/取消|cancel|abort/.test(normalized)) return "cancelled";
  if (/内存|memory|low-memory/.test(normalized)) return "memory-risk";
  if (/超时|时间上限|deadline|timeout/.test(normalized)) return "timeout";
  if (/worker|线程|崩溃|异常|无法启动/.test(normalized)) return "worker-error";
  if (/非法数值|无效源|源存档|invalid-source/.test(normalized)) return "invalid-source";
  if (/尾验|验证|边界|容量/.test(normalized)) return "boundary-validation";
  if (/校准|账本/.test(normalized)) return "calibration-unstable";
  if (/合同|不满足|不可用/.test(normalized)) return "contract-rejected";
  return "unknown";
}

export interface OfflineWorkerSettlementRequestShape {
  approximate: boolean;
  conservativeOnly: boolean;
  speedrun: boolean;
  seconds: number;
}

/**
 * Keeps the Worker fallback policy independent from the simulation formulas.
 * Ordinary fast settlement may degrade to conservative macro work, but it may
 * never turn a declined contract into an unbounded exact replay.
 */
export function selectInitialOfflineWorkerStrategy(
  request: OfflineWorkerSettlementRequestShape,
): OfflineWorkerSettlementStrategy {
  if (request.conservativeOnly && !request.speedrun) return "conservative-preview";
  if (request.approximate && !request.speedrun && request.seconds > FAST_OFFLINE_CALIBRATION_SECONDS) return "fast";
  return "exact";
}

export function selectOfflineWorkerStrategyAfterFastResult(
  request: OfflineWorkerSettlementRequestShape,
  result: OfflineApproximationResult,
): OfflineWorkerSettlementStrategy {
  if (result.status === "invalid-source") return "invalid-source";
  if (result.status === "approximate" || result.status === "conservative" || result.status === "bounded-exact") {
    return result.status === "conservative" ? "conservative-preview" : result.status === "bounded-exact" ? "exact" : "fast";
  }
  return request.speedrun ? "exact" : "conservative-preview";
}
