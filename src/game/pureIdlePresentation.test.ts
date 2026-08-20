import { describe, expect, it } from "vitest";
import type { PureIdleMacroSummary, PureIdleTerminalSnapshot } from "./pureIdleMacro";
import { projectPureIdleTerminalSnapshot } from "./pureIdlePresentation";

function snapshot(overrides: Partial<PureIdleTerminalSnapshot> = {}): PureIdleTerminalSnapshot {
  return {
    dysonGenerationKw: 0,
    whiteMatrixProduced: 0,
    rocketsLaunched: 0,
    sailsAbsorbed: 0,
    structurePoints: 0,
    shellSails: 0,
    sailsInOrbit: 0,
    activityDelivered: {},
    ...overrides,
  };
}

function projectionSummary(
  current: PureIdleTerminalSnapshot,
  rates: Partial<PureIdleMacroSummary["ratePerSimulationSecond"]>,
): Pick<PureIdleMacroSummary, "settledWallSeconds" | "actualMultiplier" | "current" | "ratePerSimulationSecond"> {
  return {
    settledWallSeconds: 60,
    actualMultiplier: 2,
    current,
    ratePerSimulationSecond: {
      dysonGenerationKw: 0,
      whiteMatrixProduced: 0,
      rocketsLaunched: 0,
      sailsAbsorbed: 0,
      structurePoints: 0,
      shellSails: 0,
      sailsInOrbit: 0,
      activityDelivered: {},
      ...rates,
    },
  };
}

describe("pure idle terminal presentation", () => {
  it("keeps instantaneous Dyson values on the last committed 30-second snapshot", () => {
    const current = snapshot({ dysonGenerationKw: 1_100, shellSails: 800, sailsInOrbit: 600 });
    const summary = projectionSummary(current, {
      dysonGenerationKw: -20,
      shellSails: -10,
      sailsInOrbit: -30,
    });

    // The removed extrapolation produced 900 kW here, below a 1,000 kW run
    // baseline, then jumped back when the next macro bucket arrived.
    expect(current.dysonGenerationKw + summary.ratePerSimulationSecond.dysonGenerationKw * 10).toBe(900);
    expect(projectPureIdleTerminalSnapshot(summary, snapshot(), 70)).toMatchObject({
      dysonGenerationKw: 1_100,
      shellSails: 800,
      sailsInOrbit: 600,
    });
  });

  it("interpolates only monotonic counters and clamps the window to one bucket", () => {
    const current = snapshot({
      whiteMatrixProduced: 100,
      rocketsLaunched: 20,
      sailsAbsorbed: 30,
      structurePoints: 40,
      activityDelivered: { processor: 50 },
    });
    const summary = projectionSummary(current, {
      whiteMatrixProduced: 2,
      rocketsLaunched: 1,
      sailsAbsorbed: 3,
      structurePoints: 4,
      activityDelivered: { processor: 5 },
    });

    expect(projectPureIdleTerminalSnapshot(summary, snapshot(), 100)).toMatchObject({
      whiteMatrixProduced: 220,
      rocketsLaunched: 80,
      sailsAbsorbed: 210,
      structurePoints: 280,
      activityDelivered: { processor: 350 },
    });
  });

  it("never lets a noisy negative rate reduce cumulative output", () => {
    const current = snapshot({ whiteMatrixProduced: 100, activityDelivered: { processor: 50 } });
    const summary = projectionSummary(current, {
      whiteMatrixProduced: -5,
      activityDelivered: { processor: -2 },
    });
    expect(projectPureIdleTerminalSnapshot(summary, snapshot(), 75)).toMatchObject({
      whiteMatrixProduced: 100,
      activityDelivered: { processor: 50 },
    });
  });
});
