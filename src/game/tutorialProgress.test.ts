import { describe, expect, it } from "vitest";
import {
  TUTORIAL_CONTENT_REVISION,
  TUTORIAL_PROGRESS_KEY,
  readTutorialProgress,
  writeTutorialProgress,
} from "./tutorialProgress";

function memoryStorage(seed: Record<string, string> = {}) {
  const entries = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    value: (key: string) => entries.get(key) ?? null,
  };
}

describe("tutorial progress revision", () => {
  it("uses a content revision key independent from the application version", () => {
    expect(TUTORIAL_PROGRESS_KEY).toBe(`dspidle:tutorial-progress:${TUTORIAL_CONTENT_REVISION}`);
    expect(TUTORIAL_PROGRESS_KEY).not.toContain("1.0.42");
  });

  it("migrates the old tutorial key once and never overwrites current progress", () => {
    const storage = memoryStorage({ "dspidle:tutorial-progress:1.0.15": '["canvas","belts"]' });
    expect([...readTutorialProgress(storage)]).toEqual(["canvas", "belts"]);
    expect(storage.value(TUTORIAL_PROGRESS_KEY)).toBe('["canvas","belts"]');

    writeTutorialProgress(storage, ["canvas", "cloud"]);
    expect([...readTutorialProgress(storage)]).toEqual(["canvas", "cloud"]);
    expect(storage.value(TUTORIAL_PROGRESS_KEY)).toBe('["canvas","cloud"]');
  });

  it("ignores malformed legacy progress without blocking the tutorial", () => {
    const storage = memoryStorage({ "dspidle:tutorial-progress:1.0.15": "not-json" });
    expect([...readTutorialProgress(storage)]).toEqual([]);
    expect(storage.value(TUTORIAL_PROGRESS_KEY)).toBeNull();
  });
});
