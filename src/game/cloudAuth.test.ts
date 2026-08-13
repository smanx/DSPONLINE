/** @vitest-environment jsdom */
/** @vitest-environment-options {"url":"https://public.example.test"} */

import { beforeEach, describe, expect, it, vi } from "vitest";

let cloud: typeof import("./cloud");

const cloudUser = {
  id: "user_auth_test",
  username: "auth_test",
  email: "",
  displayName: "认证测试",
  createdAt: 1,
  emailVerified: false,
  emailVerifiedAt: null,
  passwordChangedAt: 1,
  leaderboardVisible: true,
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function errorResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const cookieSession = {
  transport: "cookie" as const,
  csrfToken: "csrf_abcdefghijklmnopqrstuvwxyz_",
  expiresAt: Date.now() + 60 * 60 * 1000,
};

describe("cloud authentication token resilience", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    vi.resetModules();
    cloud = await import("./cloud");
    expect(cloud.getCloudToken()).toBeNull();
  });

  it("keeps the current login usable when persistent storage rejects writes", async () => {
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function setItem(this: Storage, key, value) {
      if (key === cloud.CLOUD_TOKEN_STORAGE_KEY) throw new DOMException("storage unavailable", "QuotaExceededError");
      return originalSetItem.call(this, key, value);
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const path = String(input);
      if (path.endsWith("/auth/register")) return jsonResponse({ token: "memory-token", user: cloudUser });
      if (path.endsWith("/account/sessions")) {
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer memory-token");
        return jsonResponse({ sessions: [] });
      }
      throw new Error(`unexpected cloud request: ${path}`);
    });

    await cloud.registerCloudAccount("auth_test", "strong-pass-123", "认证测试");

    expect(window.localStorage.getItem(cloud.CLOUD_TOKEN_STORAGE_KEY)).toBeNull();
    expect(cloud.getCloudToken()).toBe("memory-token");
    await expect(cloud.fetchCloudSessions()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the last known token when storage becomes unreadable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ token: "persisted-token", user: cloudUser }));
    await cloud.registerCloudAccount("auth_test", "strong-pass-123", "认证测试");
    expect(window.localStorage.getItem(cloud.CLOUD_TOKEN_STORAGE_KEY)).toBe("persisted-token");

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("storage unavailable", "SecurityError");
    });

    expect(cloud.getCloudToken()).toBe("persisted-token");
  });

  it("does not revive a stale persisted token when logout cannot remove it", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      if (path.endsWith("/auth/register")) return jsonResponse({ token: "token-to-clear", user: cloudUser });
      if (path.endsWith("/auth/logout")) return jsonResponse({ ok: true });
      throw new Error(`unexpected cloud request: ${path}`);
    });
    await cloud.registerCloudAccount("auth_test", "strong-pass-123", "认证测试");
    expect(window.localStorage.getItem(cloud.CLOUD_TOKEN_STORAGE_KEY)).toBe("token-to-clear");

    const originalRemoveItem = Storage.prototype.removeItem;
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function removeItem(this: Storage, key) {
      if (key === cloud.CLOUD_TOKEN_STORAGE_KEY) throw new DOMException("storage unavailable", "SecurityError");
      return originalRemoveItem.call(this, key);
    });

    await cloud.logoutCloudAccount();

    expect(window.localStorage.getItem(cloud.CLOUD_TOKEN_STORAGE_KEY)).toBe("token-to-clear");
    expect(cloud.getCloudToken()).toBeNull();
  });

  it("observes a token changed by another tab when storage is healthy", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ token: "first-token", user: cloudUser }));
    await cloud.registerCloudAccount("auth_test", "strong-pass-123", "认证测试");
    window.localStorage.setItem(cloud.CLOUD_TOKEN_STORAGE_KEY, "second-token");
    expect(cloud.getCloudToken()).toBe("second-token");
  });

  it("issues a new same-origin Web login as HttpOnly Cookie mode and uses CSRF only for writes", async () => {
    const calls: Array<{ path: string; init: RequestInit }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init = {}) => {
      const path = String(input);
      calls.push({ path, init });
      if (path.endsWith("/auth/login")) return jsonResponse({ session: cookieSession, user: cloudUser });
      if (path.endsWith("/auth/web-session")) return jsonResponse({ session: cookieSession });
      if (path.endsWith("/health")) return jsonResponse({ ok: true, mailProvider: "disabled" });
      if (path.endsWith("/account")) return jsonResponse({ user: cloudUser, cloudSave: null, cloudSaves: {} });
      if (path.endsWith("/account/password")) return jsonResponse({ user: cloudUser });
      throw new Error(`unexpected cloud request: ${path}`);
    });

    await expect(cloud.loginCloudAccount("auth_test", "strong-pass-123")).resolves.toMatchObject({
      status: "authenticated",
      user: cloudUser,
    });
    expect(cloud.getCloudToken()).toBeNull();
    expect(cloud.hasCloudAuthentication()).toBe(true);
    expect(cloud.getWebCookieSession()).toEqual(cookieSession);

    const login = calls.find((call) => call.path.endsWith("/auth/login"))!.init;
    expect(login.credentials).toBe("include");
    expect(new Headers(login.headers).get("x-dsp-session-mode")).toBe("cookie-v1");
    expect(new Headers(login.headers).has("authorization")).toBe(false);

    const account = calls.find((call) => call.path.endsWith("/account"))!.init;
    expect(account.credentials).toBe("include");
    expect(new Headers(account.headers).get("x-dsp-session-mode")).toBe("cookie-v1");
    expect(new Headers(account.headers).has("x-dsp-csrf-token")).toBe(false);

    await cloud.changeCloudPassword("old-password", "new-password");
    const password = calls.find((call) => call.path.endsWith("/account/password"))!.init;
    expect(password.credentials).toBe("include");
    expect(new Headers(password.headers).get("x-dsp-csrf-token")).toBe(cookieSession.csrfToken);
    expect(new Headers(password.headers).has("authorization")).toBe(false);
  });

  it("migrates a legacy Web token only after cookie-only confirmation", async () => {
    const legacyToken = "legacy_session_abcdefghijklmnopqrstuvwxyz_0123456789";
    window.localStorage.setItem(cloud.CLOUD_TOKEN_STORAGE_KEY, legacyToken);
    const calls: Array<{ path: string; init: RequestInit }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init = {}) => {
      const path = String(input);
      calls.push({ path, init });
      if (path.endsWith("/health")) return jsonResponse({ ok: true, mailProvider: "disabled" });
      if (path.endsWith("/auth/web-session/migrate")) return jsonResponse({ session: cookieSession });
      if (path.endsWith("/auth/web-session")) return jsonResponse({ session: cookieSession });
      if (path.endsWith("/account")) return jsonResponse({ user: cloudUser, cloudSave: null, cloudSaves: {} });
      throw new Error(`unexpected cloud request: ${path}`);
    });

    await expect(cloud.resumeCloudSession()).resolves.toMatchObject({ status: "authenticated" });
    expect(window.localStorage.getItem(cloud.CLOUD_TOKEN_STORAGE_KEY)).toBeNull();
    expect(cloud.getCloudToken()).toBeNull();
    expect(cloud.hasCloudAuthentication()).toBe(true);

    const migration = calls.find((call) => call.path.endsWith("/auth/web-session/migrate"))!.init;
    expect(new Headers(migration.headers).get("authorization")).toBe(`Bearer ${legacyToken}`);
    const confirmation = calls.find((call) => call.path.endsWith("/auth/web-session"))!.init;
    expect(new Headers(confirmation.headers).has("authorization")).toBe(false);
    const account = calls.find((call) => call.path.endsWith("/account"))!.init;
    expect(account.credentials).toBe("include");
    expect(new Headers(account.headers).has("authorization")).toBe(false);
  });

  it("keeps the legacy Bearer token and old API path when migration is unsupported", async () => {
    const legacyToken = "legacy_session_abcdefghijklmnopqrstuvwxyz_0123456789";
    window.localStorage.setItem(cloud.CLOUD_TOKEN_STORAGE_KEY, legacyToken);
    const calls: Array<{ path: string; init: RequestInit }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init = {}) => {
      const path = String(input);
      calls.push({ path, init });
      if (path.endsWith("/health")) return jsonResponse({ ok: true, mailProvider: "disabled" });
      if (path.endsWith("/auth/web-session/migrate")) return errorResponse({ error: "not found" }, 404);
      if (path.endsWith("/account")) return jsonResponse({ user: cloudUser, cloudSave: null, cloudSaves: {} });
      throw new Error(`unexpected cloud request: ${path}`);
    });

    await expect(cloud.resumeCloudSession()).resolves.toMatchObject({ status: "authenticated" });
    expect(window.localStorage.getItem(cloud.CLOUD_TOKEN_STORAGE_KEY)).toBe(legacyToken);
    expect(cloud.getCloudToken()).toBe(legacyToken);
    expect(cloud.getWebCookieSession()).toBeNull();
    const account = calls.find((call) => call.path.endsWith("/account"))!.init;
    expect(new Headers(account.headers).get("authorization")).toBe(`Bearer ${legacyToken}`);
  });

  it("does not delete an existing Bearer when a newly issued Cookie cannot be confirmed", async () => {
    const existingToken = "existing_session_abcdefghijklmnopqrstuvwxyz_012345";
    window.localStorage.setItem(cloud.CLOUD_TOKEN_STORAGE_KEY, existingToken);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      if (path.endsWith("/auth/login")) return jsonResponse({ session: cookieSession, user: cloudUser });
      if (path.endsWith("/auth/web-session")) return errorResponse({ error: "Web 会话已过期", code: "SESSION_EXPIRED" }, 401);
      throw new Error(`unexpected cloud request: ${path}`);
    });

    await expect(cloud.loginCloudAccount("auth_test", "strong-pass-123")).rejects.toMatchObject({
      status: 401,
      payload: { code: "SESSION_EXPIRED" },
    });
    expect(window.localStorage.getItem(cloud.CLOUD_TOKEN_STORAGE_KEY)).toBe(existingToken);
    expect(cloud.getCloudToken()).toBe(existingToken);
    expect(cloud.getWebCookieSession()).toBeNull();
  });

  it("clears Cookie state only for an explicit expired or revoked session", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      if (path.endsWith("/auth/login")) return jsonResponse({ session: cookieSession, user: cloudUser });
      if (path.endsWith("/auth/web-session")) return jsonResponse({ session: cookieSession });
      if (path.endsWith("/health")) return jsonResponse({ ok: true, mailProvider: "disabled" });
      if (path.endsWith("/account")) return jsonResponse({ user: cloudUser, cloudSave: null, cloudSaves: {} });
      if (path.endsWith("/account/password")) return errorResponse({ error: "当前密码错误", code: "CURRENT_PASSWORD_INVALID" }, 401);
      if (path.endsWith("/account/sessions")) return errorResponse({ error: "登录已过期", code: "SESSION_EXPIRED" }, 401);
      throw new Error(`unexpected cloud request: ${path}`);
    });
    await cloud.loginCloudAccount("auth_test", "strong-pass-123");

    await expect(cloud.changeCloudPassword("wrong", "new-password")).rejects.toMatchObject({
      status: 401,
      payload: { code: "CURRENT_PASSWORD_INVALID" },
    });
    expect(cloud.hasCloudAuthentication()).toBe(true);

    await expect(cloud.fetchCloudSessions()).rejects.toMatchObject({
      status: 401,
      payload: { code: "SESSION_EXPIRED" },
    });
    expect(cloud.hasCloudAuthentication()).toBe(false);
    expect(cloud.getWebCookieSession()).toBeNull();
  });
});
