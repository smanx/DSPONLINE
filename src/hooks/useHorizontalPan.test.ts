import { describe, expect, it } from "vitest";
import { horizontalFocusScrollLeft, horizontalWheelDelta } from "./useHorizontalPan";

describe("technology tree horizontal wheel conversion", () => {
  it("uses vertical wheel input when the device does not report deltaX", () => {
    expect(horizontalWheelDelta(0, 120)).toBe(120);
    expect(horizontalWheelDelta(0, -80)).toBe(-80);
  });

  it("preserves a real horizontal trackpad delta", () => {
    expect(horizontalWheelDelta(32, 120)).toBe(152);
    expect(horizontalWheelDelta(-24, 6)).toBe(-18);
  });

  it("normalizes line and page wheel units", () => {
    expect(horizontalWheelDelta(0, 3, 1)).toBe(48);
    expect(horizontalWheelDelta(1, 1, 2, 640)).toBe(1_280);
  });

  it("centers a focused node without requesting vertical document motion", () => {
    expect(horizontalFocusScrollLeft(200, 100, 800, 900, 240, 3_000)).toBe(720);
    expect(horizontalFocusScrollLeft(0, 100, 800, 20, 240, 3_000)).toBe(0);
    expect(horizontalFocusScrollLeft(2_000, 100, 800, 2_850, 240, 3_000)).toBe(2_200);
  });
});
