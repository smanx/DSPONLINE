import { describe, expect, it } from "vitest";
import {
  LARGE_SAVE_AUTOSAVE_MIN_INTERVAL_SECONDS,
  LARGE_SAVE_AUTOSAVE_THRESHOLD_BYTES,
  resolveLargeSaveAutosavePolicy,
} from "./largeSaveAutosavePolicy";

describe("large-save autosave policy", () => {
  it("raises a verified 24 MiB save to a ten-minute effective interval", () => {
    expect(resolveLargeSaveAutosavePolicy({
      configuredIntervalSeconds: 30,
      persistedByteLength: LARGE_SAVE_AUTOSAVE_THRESHOLD_BYTES,
      throttleEnabled: true,
    })).toMatchObject({
      configuredIntervalSeconds: 30,
      effectiveIntervalSeconds: LARGE_SAVE_AUTOSAVE_MIN_INTERVAL_SECONDS,
      largeSave: true,
      throttled: true,
    });
  });

  it("leaves small, unknown and already-slow autosave intervals unchanged", () => {
    expect(resolveLargeSaveAutosavePolicy({
      configuredIntervalSeconds: 30,
      persistedByteLength: LARGE_SAVE_AUTOSAVE_THRESHOLD_BYTES - 1,
      throttleEnabled: true,
    }).effectiveIntervalSeconds).toBe(30);
    expect(resolveLargeSaveAutosavePolicy({
      configuredIntervalSeconds: 30,
      persistedByteLength: null,
      throttleEnabled: true,
    }).effectiveIntervalSeconds).toBe(30);
    expect(resolveLargeSaveAutosavePolicy({
      configuredIntervalSeconds: 1_800,
      persistedByteLength: LARGE_SAVE_AUTOSAVE_THRESHOLD_BYTES * 2,
      throttleEnabled: true,
    }).effectiveIntervalSeconds).toBe(1_800);
  });

  it("honors explicit opt-out and never turns autosave back on", () => {
    expect(resolveLargeSaveAutosavePolicy({
      configuredIntervalSeconds: 30,
      persistedByteLength: LARGE_SAVE_AUTOSAVE_THRESHOLD_BYTES,
      throttleEnabled: false,
    })).toMatchObject({ effectiveIntervalSeconds: 30, throttled: false });
    expect(resolveLargeSaveAutosavePolicy({
      configuredIntervalSeconds: 0,
      persistedByteLength: LARGE_SAVE_AUTOSAVE_THRESHOLD_BYTES,
      throttleEnabled: true,
    })).toMatchObject({ effectiveIntervalSeconds: 0, throttled: false });
  });

  it("normalizes invalid size data without guessing that a save is large", () => {
    expect(resolveLargeSaveAutosavePolicy({
      configuredIntervalSeconds: Number.NaN,
      persistedByteLength: Number.POSITIVE_INFINITY,
      throttleEnabled: true,
    })).toEqual({
      configuredIntervalSeconds: 0,
      effectiveIntervalSeconds: 0,
      persistedByteLength: null,
      largeSave: false,
      throttled: false,
    });
  });
});
