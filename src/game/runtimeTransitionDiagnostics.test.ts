import { afterEach, describe, expect, it } from "vitest";
import {
  beginRuntimeTransition,
  completeRuntimeTransition,
  measureRuntimeTransitionPhase,
  recordActiveRuntimeTransitionPhase,
  type RuntimeTransitionDiagnosticState,
} from "./runtimeTransitionDiagnostics";

describe("runtime transition diagnostics", () => {
  const originalWindow = globalThis.window;
  afterEach(() => Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow }));

  it("is inert unless an explicit diagnostics sink is enabled", () => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    expect(measureRuntimeTransitionPhase("noop", () => 7)).toBe(7);
  });

  it("records bounded transition and measured phase timings", () => {
    const diagnostics: RuntimeTransitionDiagnosticState = { enabled: true, events: [], active: {} };
    Object.defineProperty(globalThis, "window", { configurable: true, value: { __DSP_RUNTIME_TRANSITIONS__: diagnostics } });
    beginRuntimeTransition("resume");
    expect(measureRuntimeTransitionPhase("projection-apply", () => "ok", { entities: 12 })).toBe("ok");
    recordActiveRuntimeTransitionPhase("react-layout-commit");
    completeRuntimeTransition("resume", "first-frame");
    expect(diagnostics.events.map((event) => event.phase)).toEqual([
      "transition-start",
      "projection-apply",
      "react-layout-commit",
      "first-frame",
    ]);
    expect(diagnostics.active.resume).toBeUndefined();
  });
});
