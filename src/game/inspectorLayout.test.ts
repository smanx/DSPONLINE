import { describe, expect, it } from "vitest";
import { DEFAULT_INSPECTOR_SECTION_ORDER, normalizeInspectorLayoutPreference, readInspectorLayoutPreference } from "./inspectorLayout";

describe("inspector layout preference", () => {
  it("filters unknown and duplicate ids and appends missing defaults", () => {
    expect(normalizeInspectorLayoutPreference({ order: ["power", "power", "future"], collapsed: ["stack", "future"] })).toEqual({
      version: 1,
      order: ["power", "recipe", "stack", "upgrade", "proliferator"],
      collapsed: ["stack"],
    });
  });

  it("falls back without clearing unrelated storage when JSON is damaged", () => {
    const storage = { getItem: () => "{" };
    expect(readInspectorLayoutPreference(storage).order).toEqual(DEFAULT_INSPECTOR_SECTION_ORDER);
  });
});
