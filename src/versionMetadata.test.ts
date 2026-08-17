import { describe, expect, it } from "vitest";
import { resolveVersionGeneratedAt } from "../vite.config";

describe("release version metadata", () => {
  it("uses SOURCE_DATE_EPOCH for reproducible release builds", () => {
    expect(resolveVersionGeneratedAt("0", new Date("2030-01-02T03:04:05.000Z")))
      .toBe("1970-01-01T00:00:00.000Z");
    expect(resolveVersionGeneratedAt("1786950000", new Date("2030-01-02T03:04:05.000Z")))
      .toBe("2026-08-17T07:00:00.000Z");
  });

  it("falls back to the supplied clock for invalid source dates", () => {
    const now = new Date("2030-01-02T03:04:05.000Z");
    for (const value of [undefined, "", "-1", "1.5", "not-a-date", "999999999999999999999"]) {
      expect(resolveVersionGeneratedAt(value, now)).toBe(now.toISOString());
    }
  });
});
