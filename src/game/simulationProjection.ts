import type { GameState, PlanetId } from "./types";

/** Versioned, UI-only projection carried alongside the authoritative state. */
export interface SimulationProjection {
  protocolVersion: 1;
  elapsedSeconds: number;
  activePlanetId: PlanetId;
  changedEntityIds: string[];
  changedBeltIds: string[];
  entityCount: number;
  beltCount: number;
  inFlightRouteCount: number;
  totalProduced: number;
}

function entitySignature(entity: GameState["entities"][number]): string {
  return [
    entity.id,
    entity.position.x,
    entity.position.y,
    entity.machineCount,
    entity.minerCount,
    entity.progress,
    entity.utilization,
    entity.productionRate,
    JSON.stringify(entity.inputs ?? {}),
    JSON.stringify(entity.outputs ?? {}),
    entity.stationRoutes?.length ?? 0,
  ].join("|");
}

function beltSignature(belt: GameState["belts"][number]): string {
  return [belt.id, belt.source, belt.target, belt.progress, belt.lastFlow, belt.totalTransferred, belt.congestion].join("|");
}

export function createSimulationProjection(previous: GameState | null, current: GameState): SimulationProjection {
  const previousEntities = new Map((previous?.entities ?? []).map((entity) => [entity.id, entitySignature(entity)]));
  const previousBelts = new Map((previous?.belts ?? []).map((belt) => [belt.id, beltSignature(belt)]));
  const changedEntityIds = current.entities.filter((entity) => previousEntities.get(entity.id) !== entitySignature(entity)).map((entity) => entity.id);
  const changedBeltIds = current.belts.filter((belt) => previousBelts.get(belt.id) !== beltSignature(belt)).map((belt) => belt.id);
  const totalProduced = Object.values(current.totalProduced ?? {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  return {
    protocolVersion: 1,
    elapsedSeconds: current.elapsedSeconds,
    activePlanetId: current.activePlanetId,
    changedEntityIds,
    changedBeltIds,
    entityCount: current.entities.length,
    beltCount: current.belts.length,
    inFlightRouteCount: current.entities.reduce((sum, entity) => sum + (entity.stationRoutes?.length ?? 0), 0),
    totalProduced,
  };
}
