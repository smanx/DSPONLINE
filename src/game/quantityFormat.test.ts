import { describe, expect, it } from "vitest";
import {
  formatQuantityCompact,
  formatQuantityExact,
  formatQuantityScientific,
  normalizeDecimalIntegerString,
} from "./quantityFormat";

describe("quantity formatting", () => {
  it.each([
    [9_999, "9,999"],
    [10_000, "1万"],
    [12_345, "1.23万"],
    [999_999, "99.9万"],
    [99_999_999, "9999万"],
    [100_000_000, "1亿"],
    [1_234_567_890, "12.3亿"],
    [9_999_999_999_999_999n, "99999999亿"],
    [10_000_000_000_000_000n, "1e+16"],
    [31_441_647_386_989_570_364_354_250n, "3.144e+25"],
    [-12_345, "-1.23万"],
  ])("formats %s without rounding upward", (value, expected) => {
    expect(formatQuantityCompact(value)).toBe(expected);
  });

  it("keeps exact values on both sides of the safe integer boundary", () => {
    expect(formatQuantityExact(9_007_199_254_740_991n)).toBe("9,007,199,254,740,991");
    expect(formatQuantityExact("9007199254740993")).toBe("9,007,199,254,740,993");
    expect(formatQuantityScientific("150199719791816213690635070")).toBe("1.501e+26");
  });

  it("expands large finite Number values instead of formatting exponent text as digits", () => {
    expect(formatQuantityCompact(1e21)).toBe("1e+21");
    expect(formatQuantityExact(1e21)).toBe("1,000,000,000,000,000,000,000");
  });

  it("normalizes only canonical non-negative decimal integers", () => {
    expect(normalizeDecimalIntegerString("00042")).toBe("42");
    expect(normalizeDecimalIntegerString(42.9)).toBe("42");
    expect(normalizeDecimalIntegerString("1e6", "7")).toBe("7");
    expect(normalizeDecimalIntegerString("9".repeat(65), "7")).toBe("7");
  });
});
