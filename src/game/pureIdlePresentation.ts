import {
  PURE_IDLE_MACRO_BUCKET_WALL_SECONDS,
  type PureIdleMacroSummary,
  type PureIdleTerminalSnapshot,
} from "./pureIdleMacro";

type PureIdleProjectionSummary = Pick<
  PureIdleMacroSummary,
  "settledWallSeconds" | "actualMultiplier" | "current" | "ratePerSimulationSecond"
>;

/**
 * Builds a between-bucket presentation snapshot without inventing changes to
 * instantaneous Dyson fields. Generation and orbit populations can rise or
 * fall at discrete expiry/absorption boundaries, so only the last committed
 * macro snapshot is authoritative for them. Cumulative counters may be safely
 * interpolated, but a malformed or noisy negative rate must never reduce one.
 */
export function projectPureIdleTerminalSnapshot(
  summary: PureIdleProjectionSummary | null,
  fallback: PureIdleTerminalSnapshot,
  elapsedWallSeconds: number,
): PureIdleTerminalSnapshot {
  if (!summary) return fallback;
  const interpolationWallSeconds = Math.max(
    0,
    Math.min(PURE_IDLE_MACRO_BUCKET_WALL_SECONDS, elapsedWallSeconds - summary.settledWallSeconds),
  );
  const simulationSeconds = interpolationWallSeconds * Math.max(1, summary.actualMultiplier);
  const projectCumulative = (value: number, rate: number) => Math.max(0, value + Math.max(0, rate) * simulationSeconds);
  const activityDelivered: Record<string, number> = { ...summary.current.activityDelivered };
  for (const [itemId, rate] of Object.entries(summary.ratePerSimulationSecond.activityDelivered)) {
    activityDelivered[itemId] = projectCumulative(activityDelivered[itemId] ?? 0, rate);
  }
  return {
    dysonGenerationKw: Math.max(0, summary.current.dysonGenerationKw),
    whiteMatrixProduced: projectCumulative(summary.current.whiteMatrixProduced, summary.ratePerSimulationSecond.whiteMatrixProduced),
    rocketsLaunched: projectCumulative(summary.current.rocketsLaunched, summary.ratePerSimulationSecond.rocketsLaunched),
    sailsAbsorbed: projectCumulative(summary.current.sailsAbsorbed, summary.ratePerSimulationSecond.sailsAbsorbed),
    structurePoints: projectCumulative(summary.current.structurePoints, summary.ratePerSimulationSecond.structurePoints),
    shellSails: Math.max(0, summary.current.shellSails),
    sailsInOrbit: Math.max(0, summary.current.sailsInOrbit),
    activityDelivered,
  };
}
