import { describe, expect, it } from "vitest";
import { validateTimedPeriodicProgress, type TimedPeriodicProgressSample } from "./periodicProgressValidation";

const RATE = 2 / 3;

function sample(atMs: number, value: number): TimedPeriodicProgressSample {
  return { atMs, aria: Math.round(value), text: Math.round(value), fill: value };
}

describe("time-aware periodic progress validation", () => {
  it("recognizes the release failure shape as a delayed legal wrap", () => {
    const samples = [sample(0, 89), sample(1_050, 59)];
    const legacyDrop = samples[0].aria - samples[1].aria;
    expect(legacyDrop).toBe(30);
    expect(legacyDrop).toBeLessThan(50);

    const result = validateTimedPeriodicProgress(samples, {
      cyclesPerSecond: RATE,
      refreshIntervalMs: 100,
      minimumWraps: 1,
    });
    expect(result).toEqual({ issues: [], transitionCount: 1, wrapCount: 1 });
  });

  it("accepts natural boundary and multiple-cycle wraps from elapsed time", () => {
    const boundary = validateTimedPeriodicProgress([sample(0, 97), sample(100, 3.6667)], {
      cyclesPerSecond: RATE,
      refreshIntervalMs: 100,
    });
    expect(boundary.issues).toEqual([]);
    expect(boundary.wrapCount).toBe(1);

    const delayed = validateTimedPeriodicProgress([sample(0, 10), sample(3_500, 43.3333)], {
      cyclesPerSecond: RATE,
      refreshIntervalMs: 100,
      minimumWraps: 2,
    });
    expect(delayed.issues).toEqual([]);
    expect(delayed.wrapCount).toBe(2);
  });

  it("accounts for one known sparse authority publication without hiding an impossible drop", () => {
    const sparseForward = validateTimedPeriodicProgress([sample(0, 97.6), sample(92.9, 55.547)], {
      cyclesPerSecond: RATE,
      refreshIntervalMs: 100,
      authorityPublicationIntervalMs: 1_000,
    });
    expect(sparseForward).toEqual({ issues: [], transitionCount: 1, wrapCount: 1 });

    const impossible = validateTimedPeriodicProgress([sample(0, 40), sample(100, 35)], {
      cyclesPerSecond: RATE,
      refreshIntervalMs: 100,
      authorityPublicationIntervalMs: 1_000,
      minimumWraps: 0,
    });
    expect(impossible.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "non-wrap-backstep",
      "phase-mismatch",
    ]));
  });

  it("rejects a real non-wrap backstep instead of treating every drop as a wrap", () => {
    const result = validateTimedPeriodicProgress([sample(0, 40), sample(100, 35)], {
      cyclesPerSecond: RATE,
      refreshIntervalMs: 100,
      minimumWraps: 0,
    });
    expect(result.issues.map((issue) => issue.code)).toContain("non-wrap-backstep");
    expect(result.wrapCount).toBe(0);
  });

  it("checks aria, text and fill on every browser sample", () => {
    const result = validateTimedPeriodicProgress([
      sample(0, 10),
      { atMs: 100, aria: 17, text: 16, fill: 13 },
    ], {
      cyclesPerSecond: RATE,
      refreshIntervalMs: 100,
      minimumWraps: 0,
    });
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "aria-text-mismatch",
      "aria-fill-mismatch",
    ]));
  });
});
