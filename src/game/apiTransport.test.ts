import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopBridge } from "../desktop";
import { apiFetch } from "./apiTransport";

const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;

function desktopBridge(overrides: Partial<DesktopBridge> = {}): DesktopBridge {
  return {
    isDesktop: true,
    setFontScale: vi.fn(),
    getReleaseInfo: vi.fn(),
    requestApi: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    installUpdate: vi.fn(),
    onUpdateStatus: vi.fn(() => () => undefined),
    ...overrides,
  } as DesktopBridge;
}

afterEach(() => {
  if (originalWindow === undefined) Reflect.deleteProperty(globalThis, "window");
  else Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("apiFetch", () => {
  it("uses the restricted desktop bridge for absolute HTTPS API calls", async () => {
    const requestApi = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: JSON.stringify({ ok: true }),
      headers: { "content-type": "application/json" },
    });
    Object.defineProperty(globalThis, "window", { configurable: true, value: { dspDesktop: desktopBridge({ requestApi }) } });
    const response = await apiFetch("https://dsponline.cn/api/account/session?full=1", {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json", "x-ignored": "client-only" },
      body: JSON.stringify({ ping: true }),
    });
    expect(requestApi).toHaveBeenCalledWith({
      path: "/account/session?full=1",
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json", "x-ignored": "client-only" },
      body: JSON.stringify({ ping: true }),
    });
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("retains browser fetch for web and relative requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock;
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    await apiFetch("/api/presence", { method: "POST" });
    expect(fetchMock).toHaveBeenCalledWith("/api/presence", { method: "POST" });
  });

  it("rejects binary desktop request bodies before IPC", async () => {
    const requestApi = vi.fn();
    Object.defineProperty(globalThis, "window", { configurable: true, value: { dspDesktop: desktopBridge({ requestApi }) } });
    await expect(apiFetch("https://dsponline.cn/api/cloud/save", { method: "PUT", body: new Uint8Array([1, 2, 3]) })).rejects.toThrow("只接受 JSON 字符串正文");
    expect(requestApi).not.toHaveBeenCalled();
  });
});
