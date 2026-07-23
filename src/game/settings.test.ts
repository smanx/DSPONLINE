import { describe, expect, it } from "vitest";
import { validateBuildingBufferLimitInput, validateProliferatorBufferLimitInput } from "./settings";

describe("building buffer limit input", () => {
  it.each([
    ["1000", 1_000],
    ["10000", 10_000],
    ["100000", 100_000],
    ["1000000", 1_000_000],
    ["100000000", 100_000_000],
  ])("accepts positive integer %s", (raw, expected) => {
    expect(validateBuildingBufferLimitInput(raw)).toEqual({ ok: true, value: expected });
  });

  it.each([
    ["", "请输入"],
    ["999", "不能低于"],
    ["100000001", "不能高于"],
    ["-1000", "不能为负数"],
    ["1000.5", "只接受整数"],
    ["1e6", "不接受指数格式"],
    ["一万", "只能包含数字"],
  ])("rejects invalid value %s with a reason", (raw, reason) => {
    const result = validateBuildingBufferLimitInput(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain(reason);
  });
});

describe("proliferator buffer limit input", () => {
  it.each([["1", 1], ["120", 120], ["600", 600], ["3000", 3_000], ["100000", 100_000]])(
    "accepts %s",
    (raw, expected) => expect(validateProliferatorBufferLimitInput(raw)).toEqual({ ok: true, value: expected }),
  );

  it.each(["", "0", "100001", "-1", "1.5", "1e3", "abc"])("rejects %s", (raw) => {
    expect(validateProliferatorBufferLimitInput(raw).ok).toBe(false);
  });
});
