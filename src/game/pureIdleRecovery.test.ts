import { describe, expect, it } from "vitest";
import {
  getPureIdleBackgroundPlan,
  PURE_IDLE_BACKGROUND_GRACE_SECONDS,
  type PureIdleRecoveryRecord,
} from "./pureIdleRecovery";

function record(backgroundStartedAtMs?: number): Pick<PureIdleRecoveryRecord, "startedAtMs" | "backgroundStartedAtMs"> {
  return {
    startedAtMs: 1_000_000,
    ...(backgroundStartedAtMs === undefined ? {} : { backgroundStartedAtMs }),
  };
}

describe("pure idle background grace", () => {
  it("keeps the full wall-clock interval on the macro path while visible", () => {
    expect(getPureIdleBackgroundPlan(record(), 1_000_000 + 90_000)).toEqual({
      backgrounded: false,
      totalWallSeconds: 90,
      highWallSeconds: 90,
      normalOfflineSeconds: 0,
      graceExpired: false,
    });
  });

  it("allows five minutes after the page enters the background", () => {
    const startedAt = 1_000_000 + 60_000;
    expect(getPureIdleBackgroundPlan(record(startedAt), startedAt + 240_000)).toMatchObject({
      backgrounded: true,
      highWallSeconds: 300,
      normalOfflineSeconds: 0,
      graceExpired: false,
    });
  });

  it("does not extend the grace window when background marking is repeated", () => {
    const first = 1_000_000 + 60_000;
    const repeated = first + 120_000;
    const plan = getPureIdleBackgroundPlan(record(first), repeated + 5 * 60_000);
    expect(plan.highWallSeconds).toBe(60 + PURE_IDLE_BACKGROUND_GRACE_SECONDS);
    expect(plan.normalOfflineSeconds).toBe(120);
    expect(plan.graceExpired).toBe(true);
  });

  it("moves the remainder to ordinary offline time after the grace window", () => {
    const startedAt = 1_000_000 + 60_000;
    const plan = getPureIdleBackgroundPlan(
      record(startedAt),
      startedAt + (PURE_IDLE_BACKGROUND_GRACE_SECONDS + 600) * 1_000,
    );
    expect(plan.backgrounded).toBe(true);
    expect(plan.highWallSeconds).toBe(60 + PURE_IDLE_BACKGROUND_GRACE_SECONDS);
    expect(plan.normalOfflineSeconds).toBe(600);
    expect(plan.graceExpired).toBe(true);
  });
});
