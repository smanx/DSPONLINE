import { describe, expect, it } from "vitest";
import {
  advanceSimulationRuntimeStartupRecovery,
  canEnterGameAfterSimulationRuntimeStartupRecovery,
  computeSimulationRuntimeStartupOfflineWindow,
  type SimulationRuntimeStartupRecoveryEvent,
  type SimulationRuntimeStartupRecoveryPhase,
} from "./simulationRuntimeStartupRecovery";

const ORDERED_EVENTS: SimulationRuntimeStartupRecoveryEvent[] = [
  "read-recovery",
  "replay-recovery",
  "compute-offline",
  "settle-offline",
  "verify-promoted-primary",
  "clear-stale-recovery",
  "initialize-next-recovery",
  "enter-game",
];

describe("simulation runtime startup recovery", () => {
  it("orders T0 replay and offline settlement before the first T1 primary write", () => {
    let state = { phase: "selected-primary" as SimulationRuntimeStartupRecoveryPhase };
    expect(() => advanceSimulationRuntimeStartupRecovery(state, "verify-promoted-primary")).toThrow(/expected read-recovery/);
    for (const event of ORDERED_EVENTS) state = advanceSimulationRuntimeStartupRecovery(state, event);
    expect(state.phase).toBe("ready");
    expect(canEnterGameAfterSimulationRuntimeStartupRecovery(state)).toBe(true);
  });

  it("preserves T0 at every failure before T1 readback and trusts T1 after it", () => {
    let state = { phase: "selected-primary" as SimulationRuntimeStartupRecoveryPhase };
    const states = [state];
    for (const event of ORDERED_EVENTS.slice(0, -1)) {
      state = advanceSimulationRuntimeStartupRecovery(state, event);
      states.push(state);
    }
    for (const candidate of states) {
      const failed = advanceSimulationRuntimeStartupRecovery(candidate, "fail");
      const promoted = [
        "promoted-primary-verified",
        "stale-recovery-cleared",
        "next-recovery-initialized",
      ].includes(candidate.phase);
      expect(failed.phase).toBe(promoted ? "failed-promoted-primary" : "failed-source-preserved");
      expect(canEnterGameAfterSimulationRuntimeStartupRecovery(failed)).toBe(false);
    }
  });

  it("subtracts replayed wall time before the ordinary offline cap", () => {
    expect(computeSimulationRuntimeStartupOfflineWindow({
      savedAtMs: 1_000_000,
      nowMs: 1_130_000,
      paused: false,
      replayedWallSeconds: 30,
      maxOfflineSeconds: 90,
    })).toEqual({
      elapsedWallSeconds: 130,
      replayedWallSeconds: 30,
      remainingWallSeconds: 100,
      offlineSeconds: 90,
    });
  });

  it("keeps paused saves at zero and pure commands from consuming wall time", () => {
    const input = { savedAtMs: 10_000, nowMs: 110_000, replayedWallSeconds: 0, maxOfflineSeconds: 1_000 };
    expect(computeSimulationRuntimeStartupOfflineWindow({ ...input, paused: true }).offlineSeconds).toBe(0);
    expect(computeSimulationRuntimeStartupOfflineWindow({ ...input, paused: false }).offlineSeconds).toBe(100);
  });

  it("uses wall coverage rather than accelerated simulation time and clamps clock rollback", () => {
    // A time-warp intent may have simulated 600 seconds while its durable
    // result reports only 60 wall seconds; only the latter is supplied here.
    expect(computeSimulationRuntimeStartupOfflineWindow({
      savedAtMs: 10_000,
      nowMs: 110_000,
      paused: false,
      replayedWallSeconds: 60,
      maxOfflineSeconds: 1_000,
    }).offlineSeconds).toBe(40);
    expect(computeSimulationRuntimeStartupOfflineWindow({
      savedAtMs: 110_000,
      nowMs: 10_000,
      paused: false,
      replayedWallSeconds: 60,
      maxOfflineSeconds: 1_000,
    }).offlineSeconds).toBe(0);
  });
});
