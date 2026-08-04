export interface SimulationBudgetSlice {
  simulationSeconds: number;
  wallSeconds: number;
  remainingSimulationSeconds: number;
  remainingWallSeconds: number;
}

/**
 * Take one bounded simulation slice while preserving the simulation/wall
 * clock ratio. This is a scheduling boundary only; the engine still performs
 * all ordinary exact steps inside the slice.
 */
export function takeSimulationBudgetSlice(
  simulationSeconds: number,
  wallSeconds: number,
  maximumSimulationSeconds = 60,
): SimulationBudgetSlice {
  const simulation = Number.isFinite(simulationSeconds) ? Math.max(0, simulationSeconds) : 0;
  const wall = Number.isFinite(wallSeconds) ? Math.max(0, wallSeconds) : 0;
  const limit = Number.isFinite(maximumSimulationSeconds) && maximumSimulationSeconds > 0
    ? maximumSimulationSeconds
    : 60;
  if (simulation <= limit) {
    return {
      simulationSeconds: simulation,
      wallSeconds: wall,
      remainingSimulationSeconds: 0,
      remainingWallSeconds: 0,
    };
  }
  const ratio = simulation > 0 ? wall / simulation : 0;
  const takenWall = Math.min(wall, limit * ratio);
  return {
    simulationSeconds: limit,
    wallSeconds: takenWall,
    remainingSimulationSeconds: Math.max(0, simulation - limit),
    remainingWallSeconds: Math.max(0, wall - takenWall),
  };
}

