import { getRecipe } from "./content";
import type { GameState } from "./types";

export type OfflineCriticalEventKind = "route-arrival" | "machine-cycle" | "exploration-complete";

export interface OfflineCriticalEvent {
  kind: OfflineCriticalEventKind;
  seconds: number;
}

const EPSILON = 1e-9;

function positiveCeil(value: number): number | null {
  if (!Number.isFinite(value) || value <= EPSILON) return null;
  // The exact engine still owns all settlement. Integer boundaries only keep
  // the worker from hiding a known event behind an oversized progress window.
  return Math.max(1, Math.ceil(value - EPSILON));
}

/**
 * Return a conservative, integer simulation boundary for offline progress.
 * This is a scheduling hint, never an alternate simulation formula. When a
 * state has no provable event the caller must use its normal exact chunk.
 */
export function getNextOfflineCriticalEvent(
  state: GameState,
  remainingSeconds: number,
  maximumWindowSeconds = 256,
): OfflineCriticalEvent | null {
  const limit = Math.max(1, Math.floor(Math.min(remainingSeconds, maximumWindowSeconds)));
  let best: OfflineCriticalEvent | null = null;
  const consider = (kind: OfflineCriticalEventKind, seconds: number | null) => {
    if (seconds === null || seconds > limit) return;
    if (!best || seconds < best.seconds) best = { kind, seconds };
  };

  for (const entity of state.entities) {
    for (const route of entity.stationRoutes ?? []) {
      const remaining = positiveCeil(Math.max(0, route.duration) * Math.max(0, 1 - route.progress));
      consider("route-arrival", remaining);
    }
    if (entity.kind === "machine" && entity.recipeId && entity.utilization > EPSILON) {
      const recipe = getRecipe(entity.recipeId);
      if (recipe) consider("machine-cycle", positiveCeil(recipe.duration * Math.max(0, 1 - entity.progress)));
    }
  }
  for (const mission of state.exploration.missions) {
    consider("exploration-complete", positiveCeil(mission.durationSeconds - mission.elapsedSeconds));
  }
  return best;
}
