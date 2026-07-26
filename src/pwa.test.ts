/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("PWA update activation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("registers only one reload listener across repeated update requests", async () => {
    const waitingWorker = { postMessage: vi.fn() };
    const serviceWorker = {
      addEventListener: vi.fn(),
    };
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
    const { activateWaitingPwaWorker } = await import("./pwa");

    expect(activateWaitingPwaWorker(waitingWorker, serviceWorker)).toBe(true);
    expect(activateWaitingPwaWorker(waitingWorker, serviceWorker)).toBe(true);

    expect(serviceWorker.addEventListener).toHaveBeenCalledTimes(1);
    expect(serviceWorker.addEventListener).toHaveBeenCalledWith("controllerchange", expect.any(Function), { once: true });
    expect(waitingWorker.postMessage).toHaveBeenCalledTimes(2);
    expect(waitingWorker.postMessage).toHaveBeenLastCalledWith({ type: "SKIP_WAITING" });
  });
});
