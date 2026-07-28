import { describe, expect, it } from "vitest";
import { createInitialState } from "./engine";
import { activityCountdownLabel, activityOverallProgress, synchronizeGalacticActivity } from "./galacticActivity";

const amounts = { universe_matrix: 1_000_000, solar_sail: 1_000_000, small_carrier_rocket: 1_000_000, antimatter_fuel_rod: 1_000_000 } as const;

describe("galactic construction activity synchronization", () => {
  it("does nothing while the server activity is disabled", () => {
    const state = createInitialState();
    expect(synchronizeGalacticActivity(state, { enabled: false, status: "disabled", serverNow: 100 }, "participant")).toBe(state);
  });

  it("starts a new activity once and only moves its trusted clock forward", () => {
    const state = createInitialState();
    const status = { enabled: true, status: "active" as const, serverNow: 2_000, id: "activity", revision: "r1", startsAtMs: 1_000, endsAtMs: 4_000, personalTargets: amounts, globalTargets: amounts, globalDelivered: amounts };
    const first = synchronizeGalacticActivity(state, status, "participant");
    first.endgame.constructionActivity.personalDelivered.solar_sail = 7;
    const second = synchronizeGalacticActivity(first, { ...status, serverNow: 1_500 }, "other");
    expect(second.endgame.constructionActivity).toMatchObject({ participantId: "participant", activityClockMs: 2_000 });
    expect(second.endgame.constructionActivity.personalDelivered.solar_sail).toBe(7);
  });

  it("keeps an open-ended activity eligible after its former deadline", () => {
    const state = createInitialState();
    const status = { enabled: true, status: "active" as const, openEnded: true, serverNow: 8_000, id: "activity", revision: "r1", startsAtMs: 1_000, endsAtMs: 4_000, personalTargets: amounts, globalTargets: amounts, globalDelivered: amounts };
    const synchronized = synchronizeGalacticActivity(state, status, "participant");
    expect(synchronized.endgame.constructionActivity.endsAtMs).toBe(Number.MAX_SAFE_INTEGER);
    expect(activityCountdownLabel(status, status.serverNow)).toBe("长期开放");
  });

  it("averages four capped material ratios", () => {
    expect(activityOverallProgress({ ...amounts, universe_matrix: 2_000_000, solar_sail: 0 }, amounts)).toBe(0.75);
  });
});
