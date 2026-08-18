import { describe, expect, it } from "vitest";
import { isBenignResizeObserverError } from "./monitoring";

describe("client monitoring error classification", () => {
  it("ignores only the browser-defined ResizeObserver delivery warnings", () => {
    expect(isBenignResizeObserverError("ResizeObserver loop limit exceeded")).toBe(true);
    expect(isBenignResizeObserverError(" ResizeObserver loop completed with undelivered notifications. ")).toBe(true);

    expect(isBenignResizeObserverError("ResizeObserver callback threw TypeError")).toBe(false);
    expect(isBenignResizeObserverError("TypeError: module failed to load")).toBe(false);
    expect(isBenignResizeObserverError("")).toBe(false);
  });
});
