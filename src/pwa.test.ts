/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";

function responseHeaders(values: Record<string, string> = {}): Headers {
  return new Headers(values);
}

describe("PWA route and lifecycle isolation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("keeps root, immutable canary and previous-stable contexts distinct", async () => {
    const { createPwaWorkerUrl, resolvePwaRouteContext } = await import("./pwa");
    const root = resolvePwaRouteContext("https://game.example/index.html");
    const canary = resolvePwaRouteContext("https://game.example/canary/1.0.39-abcd/index.html");
    const previous = resolvePwaRouteContext("https://game.example/canary/previous/");

    expect(root).toEqual({ basePath: "/", routeKey: "root", register: true });
    expect(canary).toEqual({
      basePath: "/canary/1.0.39-abcd/",
      routeKey: "canary-1.0.39-abcd",
      register: false,
    });
    expect(previous).toEqual({ basePath: "/canary/previous/", routeKey: "previous", register: false });
    expect(createPwaWorkerUrl("1.0.40+a/b", root)).toBe("/sw.js?v=1.0.40%2Ba%2Fb&route=root&base=%2F");
  });

  it("registers only production Web root pages", async () => {
    const { resolvePwaRouteContext, shouldRegisterPwa } = await import("./pwa");
    const root = resolvePwaRouteContext("https://game.example/");
    const canary = resolvePwaRouteContext("https://game.example/canary/build-a/");

    expect(shouldRegisterPwa("web", true, true, root)).toBe(true);
    expect(shouldRegisterPwa("web", false, true, root)).toBe(false);
    expect(shouldRegisterPwa("web", true, false, root)).toBe(false);
    expect(shouldRegisterPwa("desktop", true, true, root)).toBe(false);
    expect(shouldRegisterPwa("android", true, true, root)).toBe(false);
    expect(shouldRegisterPwa("web", true, true, canary)).toBe(false);
  });

  it("registers only one reload listener across repeated update requests", async () => {
    const waitingWorker = { postMessage: vi.fn() };
    const serviceWorker = { addEventListener: vi.fn() };
    const { activateWaitingPwaWorker } = await import("./pwa");

    expect(activateWaitingPwaWorker(waitingWorker, serviceWorker)).toBe(true);
    expect(activateWaitingPwaWorker(waitingWorker, serviceWorker)).toBe(true);

    expect(serviceWorker.addEventListener).toHaveBeenCalledTimes(1);
    expect(serviceWorker.addEventListener).toHaveBeenCalledWith("controllerchange", expect.any(Function), { once: true });
    expect(waitingWorker.postMessage).toHaveBeenCalledTimes(2);
    expect(waitingWorker.postMessage).toHaveBeenLastCalledWith({ type: "SKIP_WAITING" });
  });
});

describe("PWA update status", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("keeps a downloaded worker as the highest-priority await-restart state", async () => {
    const { checkPwaVersion, getPwaRuntimeState } = await import("./pwa");
    const registration = { waiting: {}, update: vi.fn() } as unknown as ServiceWorkerRegistration;
    const fetchVersion = vi.fn();

    await expect(checkPwaVersion(registration, fetchVersion)).resolves.toBe("downloaded-await-restart");
    expect(fetchVersion).not.toHaveBeenCalled();
    expect(getPwaRuntimeState()).toMatchObject({
      updateAvailable: true,
      updateStatus: "downloaded-await-restart",
    });
  });

  it("reports network-unavailable while retaining last-known version metadata", async () => {
    const { checkPwaVersion, getPwaRuntimeState } = await import("./pwa");
    const fetchVersion = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: responseHeaders({
        "X-DSP-PWA-Status": "network-unavailable",
        "X-DSP-PWA-Fallback": "last-known-version",
      }),
      json: vi.fn().mockResolvedValue({ version: "1.0.39", buildId: "1.0.39+known" }),
    });

    await expect(checkPwaVersion(null, fetchVersion)).resolves.toBe("network-unavailable");
    expect(fetchVersion).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ cache: "no-store" }));
    expect(getPwaRuntimeState()).toMatchObject({
      updateStatus: "network-unavailable",
      latestBuildId: "1.0.39+known",
      networkAvailable: false,
    });
  });

  it("distinguishes malformed version checks from actual zero connectivity", async () => {
    const { checkPwaVersion, getPwaRuntimeState } = await import("./pwa");
    const fetchVersion = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: responseHeaders(),
      json: vi.fn().mockResolvedValue({ buildId: 40 }),
    });

    await expect(checkPwaVersion(null, fetchVersion)).resolves.toBe("version-check-failed");
    expect(getPwaRuntimeState().updateStatus).toBe("version-check-failed");

    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    fetchVersion.mockRejectedValueOnce(new TypeError("offline"));
    await expect(checkPwaVersion(null, fetchVersion)).resolves.toBe("network-unavailable");
    expect(getPwaRuntimeState()).toMatchObject({ updateStatus: "network-unavailable", networkAvailable: false });
  });

  it("treats fetch transport failures as unavailable even when navigator.onLine is stale", async () => {
    const { checkPwaVersion, getPwaRuntimeState } = await import("./pwa");
    const fetchVersion = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(checkPwaVersion(null, fetchVersion)).resolves.toBe("network-unavailable");
    expect(getPwaRuntimeState()).toMatchObject({ updateStatus: "network-unavailable", networkAvailable: false });
  });

  it("surfaces a previous-stable shell fallback without losing update availability", async () => {
    const { checkPwaVersion, consumePwaWorkerStatus, getPwaRuntimeState } = await import("./pwa");

    expect(consumePwaWorkerStatus({ type: "DSP_PWA_STATUS", status: "stable-fallback", previousStable: true })).toBe(true);
    expect(getPwaRuntimeState()).toMatchObject({
      updateStatus: "stable-fallback",
      usingStableFallback: true,
      networkAvailable: false,
    });
    const fallbackResponse = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: responseHeaders({
        "X-DSP-PWA-Status": "network-unavailable",
        "X-DSP-PWA-Fallback": "last-known-version",
      }),
      json: vi.fn().mockResolvedValue({ version: "1.0.39", buildId: "1.0.39+known" }),
    });
    await expect(checkPwaVersion(null, fallbackResponse)).resolves.toBe("stable-fallback");
    expect(getPwaRuntimeState().updateStatus).toBe("stable-fallback");
    const registration = { waiting: {}, update: vi.fn() } as unknown as ServiceWorkerRegistration;
    await checkPwaVersion(registration, vi.fn());
    expect(consumePwaWorkerStatus({ type: "DSP_PWA_STATUS", status: "stable-fallback", previousStable: true })).toBe(true);
    expect(getPwaRuntimeState()).toMatchObject({
      updateAvailable: true,
      updateStatus: "downloaded-await-restart",
      usingStableFallback: true,
    });
    expect(consumePwaWorkerStatus({ type: "OTHER", status: "stable-fallback" })).toBe(false);
  });
});
