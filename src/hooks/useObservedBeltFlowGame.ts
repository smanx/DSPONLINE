import { useMemo, useRef } from "react";
import { applyBeltFlowObservations, BeltFlowSampler } from "../game/beltFlow";
import type { GameState } from "../game/types";

export function useObservedBeltFlowGame(game: GameState): GameState {
  const samplerRef = useRef<BeltFlowSampler | null>(null);
  if (!samplerRef.current) samplerRef.current = new BeltFlowSampler();
  return useMemo(() => applyBeltFlowObservations(game, samplerRef.current!.sample(game)), [game]);
}
