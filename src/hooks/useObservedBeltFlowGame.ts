import { useMemo, useRef } from "react";
import { applyBeltFlowObservations, BeltFlowSampler } from "../game/beltFlow";
import type { GameState } from "../game/types";

export function useObservedBeltFlowGame(game: GameState, sampleEnabled = true): GameState {
  const samplerRef = useRef<BeltFlowSampler | null>(null);
  if (!samplerRef.current) samplerRef.current = new BeltFlowSampler();
  return useMemo(() => {
    // A paused canvas is already showing an authoritative snapshot. Avoid
    // rebuilding every belt observation until simulation or editing publishes
    // a new source state.
    if (!sampleEnabled) return game;
    const observations = samplerRef.current!.sample(game, { planetId: game.activePlanetId });
    return applyBeltFlowObservations(game, observations, game.activePlanetId);
  }, [game, game.activePlanetId, sampleEnabled]);
}
