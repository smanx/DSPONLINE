import { describe, expect, it } from "vitest";
import {
  advanceSimulation,
  advanceSimulationSession,
  completeSimulationAdvanceSession,
  createInitialState,
  createSimulationAdvanceSession,
} from "./engine";

function createOfflineFixture() {
  const state = createInitialState();
  // Keep the long-duration equivalence matrix inexpensive while retaining
  // deterministic clock, galaxy and campaign settlement paths.
  state.entities = [];
  state.belts = [];
  return state;
}

describe("chunked offline simulation", () => {
  for (const [label, seconds] of [
    ["1 hour", 60 * 60],
    ["8 hours", 8 * 60 * 60],
    ["9 hours", 9 * 60 * 60],
    ["24 hours", 24 * 60 * 60],
    ["7 days", 7 * 24 * 60 * 60],
    ["30 days", 30 * 24 * 60 * 60],
  ] as const) {
    it(`matches the synchronous result after ${label}`, () => {
      const state = createOfflineFixture();
      const expected = advanceSimulation(state, seconds);
      const session = createSimulationAdvanceSession(state, seconds);
      while (session.remainingSeconds > 0) advanceSimulationSession(session, 256);
      const actual = completeSimulationAdvanceSession(session);

      expect(actual).toEqual(expected);
      expect(state.elapsedSeconds).toBe(0);
    }, 30_000);
  }

  it("does not mutate or settle a cancelled partial session", () => {
    const state = createOfflineFixture();
    const session = createSimulationAdvanceSession(state, 24 * 60 * 60);
    advanceSimulationSession(session, 256);

    expect(session.remainingSeconds).toBeGreaterThan(0);
    expect(state.elapsedSeconds).toBe(0);
    expect(state.productionHistory).toEqual([]);
  });
});
