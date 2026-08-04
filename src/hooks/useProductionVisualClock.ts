import { useCallback, useRef, useSyncExternalStore } from "react";
import { getWorkDisplayProgress, type WorkProgressMode, type WorkProgressSnapshot } from "../game/productionRefresh";

type ClockListener = () => void;

const listeners = new Set<ClockListener>();
let currentTimeMs = typeof performance !== "undefined" ? performance.now() : 0;
let timer: number | null = null;

function currentIntervalMs(): number {
  if (typeof document === "undefined") return 200;
  const raw = document.querySelector<HTMLElement>(".game-shell")?.dataset.productionRefreshMs;
  const parsed = Number(raw);
  // Visual phase updates stay independent from sparse, authoritative state
  // publication. Inventory and simulation state still honor the chosen tier.
  return Number.isFinite(parsed) ? Math.max(100, Math.min(200, parsed)) : 200;
}

function stopClock(): void {
  if (timer !== null) window.clearTimeout(timer);
  timer = null;
}

function scheduleClock(): void {
  if (timer !== null || listeners.size === 0 || typeof window === "undefined") return;
  timer = window.setTimeout(() => {
    timer = null;
    if (document.visibilityState !== "hidden") {
      currentTimeMs = performance.now();
      for (const listener of listeners) listener();
    }
    scheduleClock();
  }, currentIntervalMs());
}

function subscribe(listener: ClockListener): () => void {
  listeners.add(listener);
  scheduleClock();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopClock();
  };
}

function getSnapshot(): number {
  return currentTimeMs;
}

export function useProductionVisualClock(active: boolean): number {
  const subscribeWhenActive = useCallback((listener: ClockListener) => active ? subscribe(listener) : () => undefined, [active]);
  return useSyncExternalStore(subscribeWhenActive, getSnapshot, () => 0);
}

export function useWorkDisplayProgress(input: {
  mode: WorkProgressMode;
  semanticKey: string;
  snapshotProgress: number;
  cyclesPerSecond: number;
  effectiveSimulationMultiplier: number;
  active: boolean;
}): number {
  const normalized = Math.max(0, Math.min(1, Number.isFinite(input.snapshotProgress) ? input.snapshotProgress : 0));
  const inputKey = `${input.mode}:${input.semanticKey}:${normalized}:${input.cyclesPerSecond}:${input.effectiveSimulationMultiplier}:${input.active}`;
  const previousInputRef = useRef("");
  const snapshotRef = useRef<WorkProgressSnapshot>({ ...input, snapshotProgress: normalized, publishedAtMs: typeof performance === "undefined" ? 0 : performance.now() });
  if (previousInputRef.current !== inputKey) {
    previousInputRef.current = inputKey;
    snapshotRef.current = { ...input, snapshotProgress: normalized, publishedAtMs: typeof performance === "undefined" ? 0 : performance.now() };
  }
  const visualTimeMs = useProductionVisualClock(input.active && input.cyclesPerSecond > 0 && input.mode !== "indeterminate" && input.mode !== "level");
  return getWorkDisplayProgress(snapshotRef.current, visualTimeMs || snapshotRef.current.publishedAtMs);
}
