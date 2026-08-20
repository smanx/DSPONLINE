import { describe, expect, it } from "vitest";
import { getAccessibleItemGlyphTextColor } from "./ItemReference";

describe("getAccessibleItemGlyphTextColor", () => {
  it("uses dark text on bright item colors", () => {
    expect(getAccessibleItemGlyphTextColor("#dbe8ff")).toBe("#000000");
    expect(getAccessibleItemGlyphTextColor("#d4b866")).toBe("#000000");
  });

  it("uses light text on dark item colors", () => {
    expect(getAccessibleItemGlyphTextColor("#101412")).toBe("#ffffff");
    expect(getAccessibleItemGlyphTextColor("#243b42")).toBe("#ffffff");
  });

  it("falls back predictably for non-hex theme colors", () => {
    expect(getAccessibleItemGlyphTextColor("transparent")).toBe("#000000");
  });
});
