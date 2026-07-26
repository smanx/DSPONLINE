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
});
