import { describe, expect, it } from "vitest";
import { alignToDevicePixel } from "./displayPixels";

describe("device-pixel alignment", () => {
  it("rounds transformed UI coordinates to physical pixel boundaries", () => {
    expect(alignToDevicePixel(10.24, 1)).toBe(10);
    expect(alignToDevicePixel(10.24, 2)).toBe(10);
    expect(alignToDevicePixel(10.26, 2)).toBe(10.5);
    expect(alignToDevicePixel(-3.2, 2.5)).toBe(-3.2);
  });

  it("falls back to a ratio of one for invalid device ratios", () => {
    expect(alignToDevicePixel(4.6, 0)).toBe(5);
    expect(alignToDevicePixel(4.6, Number.NaN)).toBe(5);
  });
});
