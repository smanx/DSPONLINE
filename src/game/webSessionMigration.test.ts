import { describe, expect, it, vi } from "vitest";

import {
  INITIAL_WEB_SESSION_MIGRATION_STATE,
  LEGACY_WEB_SESSION_STORAGE_KEY,
  WEB_SESSION_CSRF_HEADER,
  WEB_SESSION_MIGRATION_PATH,
  WEB_SESSION_MODE_COOKIE,
  WEB_SESSION_MODE_HEADER,
  WEB_SESSION_STATUS_PATH,
  clearWebCookieSessionState,
  createWebSessionMigrationCoordinator,
  migrateLegacyWebSession,
  parseWebCookieSessionPayload,
  reduceWebSessionMigration,
  webCookieSessionRequest,
  webSessionIssuanceHeaders,
  type WebCookieSession,
  type WebSessionStorage,
} from "./webSessionMigration";

const PAGE_URL = "https://dsponline.cn/";
const API_BASE = "/api";
const LEGACY_TOKEN = "legacy_session_abcdefghijklmnopqrstuvwxyz_0123456789";
const NOW = 1_786_590_000_000;
const SESSION: WebCookieSession = Object.freeze({
  transport: "cookie",
  csrfToken: "csrf_abcdefghijklmnopqrstuvwxyz_",
  expiresAt: NOW + 60_000,
});

class MemoryStorage implements WebSessionStorage {
  value: string | null;
  removeCalls = 0;
  getCalls = 0;
  onGet: ((call: number, current: string | null) => string | null) | null = null;
  removeError: Error | null = null;
  ignoreRemove = false;

  constructor(value: string | null) {
    this.value = value;
  }

  getItem(key: string): string | null {
    expect(key).toBe(LEGACY_WEB_SESSION_STORAGE_KEY);
    this.getCalls += 1;
    return this.onGet ? this.onGet(this.getCalls, this.value) : this.value;
  }

  removeItem(key: string): void {
    expect(key).toBe(LEGACY_WEB_SESSION_STORAGE_KEY);
    this.removeCalls += 1;
    if (this.removeError) throw this.removeError;
    if (!this.ignoreRemove) this.value = null;
  }
}

function jsonResponse(payload: unknown, status = 200, headers: Record<string, string> = {}): Response {
  const body = JSON.stringify(payload);
  return new Response(body, {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-length": String(new TextEncoder().encode(body).byteLength),
      ...headers,
    },
  });
}

function sessionResponse(session: WebCookieSession = SESSION): Response {
  return jsonResponse({ session });
}

function scriptedFetch(
  handlers: Array<(url: string, init: RequestInit) => Response | Promise<Response>>,
): { fetchImpl: typeof fetch; calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const handler = handlers.shift();
    if (!handler) throw new Error("unexpected fetch");
    return handler(url, init);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function migrationOptions(storage: WebSessionStorage, fetchImpl: typeof fetch, signal?: AbortSignal) {
  return {
    apiBase: API_BASE,
    pageUrl: PAGE_URL,
    storage,
    fetchImpl,
    signal,
    now: () => NOW,
  };
}

describe("Web cookie session migration contract", () => {
  it("keeps stable endpoint and request-header names", () => {
    expect(WEB_SESSION_MIGRATION_PATH).toBe("/auth/web-session/migrate");
    expect(WEB_SESSION_STATUS_PATH).toBe("/auth/web-session");
    expect(WEB_SESSION_MODE_HEADER).toBe("x-dsp-session-mode");
    expect(WEB_SESSION_CSRF_HEADER).toBe("x-dsp-csrf-token");
  });

  it("models explicit checking, migration, confirmation, ready, and failure phases", () => {
    const checking = reduceWebSessionMigration(INITIAL_WEB_SESSION_MIGRATION_STATE, { type: "CHECK_COOKIE" });
    expect(checking).toMatchObject({ phase: "checking_cookie", attempt: 0, retryable: false });
    const migrating = reduceWebSessionMigration(checking, { type: "START_MIGRATION" });
    expect(migrating).toMatchObject({ phase: "migrating", attempt: 1, legacyTokenPresent: true });
    const confirming = reduceWebSessionMigration(migrating, { type: "CONFIRM_COOKIE" });
    expect(confirming.phase).toBe("confirming_cookie");
    const ready = reduceWebSessionMigration(confirming, {
      type: "COOKIE_READY",
      session: SESSION,
      legacyTokenPresent: false,
    });
    expect(ready).toMatchObject({ phase: "ready", session: SESSION, legacyTokenPresent: false, retryable: false });
    expect(Object.isFrozen(ready)).toBe(true);

    const failed = reduceWebSessionMigration(migrating, {
      type: "FAIL",
      phase: "retryable",
      reason: "MIGRATION_NETWORK_ERROR",
      legacyTokenPresent: true,
    });
    expect(failed).toMatchObject({ phase: "retryable", reason: "MIGRATION_NETWORK_ERROR", retryable: true });
  });

  it("strictly validates the public cookie-session response", () => {
    expect(parseWebCookieSessionPayload({ session: SESSION }, NOW)).toEqual(SESSION);
    for (const payload of [
      null,
      {},
      { session: null },
      { session: { ...SESSION, transport: "bearer" } },
      { session: { ...SESSION, csrfToken: "short" } },
      { session: { ...SESSION, csrfToken: `${SESSION.csrfToken}\r\nX-Evil: yes` } },
      { session: { ...SESSION, expiresAt: NOW } },
      { session: { ...SESSION, expiresAt: NOW + 91 * 24 * 60 * 60 * 1_000 } },
      { session: { ...SESSION, expiresAt: Number.NaN } },
    ]) {
      expect(parseWebCookieSessionPayload(payload, NOW)).toBeNull();
    }
  });

  it("marks login/register/reset issuance as cookie mode without accepting Bearer", () => {
    const headers = webSessionIssuanceHeaders({ "content-type": "application/json" });
    expect(headers.get(WEB_SESSION_MODE_HEADER)).toBe(WEB_SESSION_MODE_COOKIE);
    expect(headers.get("content-type")).toBe("application/json");
    expect(() => webSessionIssuanceHeaders({ authorization: `Bearer ${LEGACY_TOKEN}` })).toThrow(/不得发送 Bearer/);
  });

  it("adds credentials and CSRF only to cookie-authenticated writes", () => {
    const validSession = { ...SESSION, expiresAt: Date.now() + 60_000 };
    const read = webCookieSessionRequest(validSession, { method: "GET", headers: { [WEB_SESSION_CSRF_HEADER]: "stale" } });
    expect(read.credentials).toBe("include");
    expect(new Headers(read.headers).get(WEB_SESSION_MODE_HEADER)).toBe(WEB_SESSION_MODE_COOKIE);
    expect(new Headers(read.headers).has(WEB_SESSION_CSRF_HEADER)).toBe(false);

    const write = webCookieSessionRequest(validSession, { method: "PUT", body: "{}" });
    expect(write.credentials).toBe("include");
    expect(new Headers(write.headers).get(WEB_SESSION_CSRF_HEADER)).toBe(SESSION.csrfToken);
    expect(new Headers(write.headers).has("authorization")).toBe(false);
    expect(() => webCookieSessionRequest(validSession, {
      method: "POST",
      headers: { authorization: `Bearer ${LEGACY_TOKEN}` },
    })).toThrow(/不得混用 Bearer/);
  });

  it("rejects expired sessions and invalid methods before making a request", () => {
    expect(() => webCookieSessionRequest({ ...SESSION, expiresAt: Date.now() - 1 })).toThrow(/无效或已过期/);
    expect(() => webCookieSessionRequest({ ...SESSION, expiresAt: Date.now() + 60_000 }, { method: "post\r\nX-Evil" })).toThrow(/方法无效/);
  });

  it("resumes an existing cookie session without reading a Bearer token", async () => {
    const storage = new MemoryStorage(null);
    const scripted = scriptedFetch([(url, init) => {
      expect(url).toBe(`https://dsponline.cn/api${WEB_SESSION_STATUS_PATH}`);
      expect(init.method).toBe("GET");
      expect(init.credentials).toBe("include");
      expect(new Headers(init.headers).has("authorization")).toBe(false);
      return sessionResponse();
    }]);
    await expect(migrateLegacyWebSession(migrationOptions(storage, scripted.fetchImpl))).resolves.toMatchObject({
      phase: "ready",
      session: SESSION,
      legacyTokenPresent: false,
      attempt: 0,
    });
    expect(scripted.calls).toHaveLength(1);
    expect(storage.removeCalls).toBe(0);
  });

  it("returns anonymous only after the cookie status endpoint says 401", async () => {
    const storage = new MemoryStorage(null);
    const scripted = scriptedFetch([() => jsonResponse({ error: "expired" }, 401)]);
    await expect(migrateLegacyWebSession(migrationOptions(storage, scripted.fetchImpl))).resolves.toMatchObject({
      phase: "anonymous",
      session: null,
      legacyTokenPresent: false,
    });
  });

  it("treats an unavailable cookie status endpoint as retryable, not anonymous", async () => {
    const storage = new MemoryStorage(null);
    const scripted = scriptedFetch([async () => { throw new TypeError("network unavailable"); }]);
    await expect(migrateLegacyWebSession(migrationOptions(storage, scripted.fetchImpl))).resolves.toMatchObject({
      phase: "retryable",
      reason: "COOKIE_STATUS_UNAVAILABLE",
      retryable: true,
    });
  });

  it("exchanges a valid legacy token, confirms cookie-only auth, then deletes exactly that token", async () => {
    const storage = new MemoryStorage(LEGACY_TOKEN);
    const scripted = scriptedFetch([
      (url, init) => {
        expect(url).toBe(`https://dsponline.cn/api${WEB_SESSION_MIGRATION_PATH}`);
        expect(init.method).toBe("POST");
        expect(init.credentials).toBe("include");
        const headers = new Headers(init.headers);
        expect(headers.get("authorization")).toBe(`Bearer ${LEGACY_TOKEN}`);
        expect(headers.get(WEB_SESSION_MODE_HEADER)).toBe(WEB_SESSION_MODE_COOKIE);
        expect(init.body).toBeUndefined();
        return sessionResponse();
      },
      (url, init) => {
        expect(url).toBe(`https://dsponline.cn/api${WEB_SESSION_STATUS_PATH}`);
        expect(new Headers(init.headers).has("authorization")).toBe(false);
        expect(init.credentials).toBe("include");
        return sessionResponse();
      },
    ]);
    const result = await migrateLegacyWebSession(migrationOptions(storage, scripted.fetchImpl));
    expect(result).toMatchObject({
      phase: "ready",
      session: SESSION,
      legacyTokenPresent: false,
      attempt: 1,
      reason: null,
    });
    expect(storage.removeCalls).toBe(1);
    expect(storage.value).toBeNull();
    expect(scripted.calls.every(({ url }) => !url.includes(LEGACY_TOKEN))).toBe(true);
  });

  it("never deletes the legacy token until cookie-only confirmation succeeds", async () => {
    const storage = new MemoryStorage(LEGACY_TOKEN);
    const scripted = scriptedFetch([
      () => sessionResponse(),
      () => jsonResponse({ error: "cookie missing" }, 401),
    ]);
    await expect(migrateLegacyWebSession(migrationOptions(storage, scripted.fetchImpl))).resolves.toMatchObject({
      phase: "retryable",
      reason: "COOKIE_CONFIRMATION_FAILED",
      legacyTokenPresent: true,
    });
    expect(storage.value).toBe(LEGACY_TOKEN);
    expect(storage.removeCalls).toBe(0);
  });

  it("requires confirmation to match the issued CSRF token and expiry", async () => {
    const storage = new MemoryStorage(LEGACY_TOKEN);
    const scripted = scriptedFetch([
      () => sessionResponse(),
      () => sessionResponse({ ...SESSION, csrfToken: "csrf_ABCDEFGHIJKLMNOPQRSTUVWXYZ_" }),
    ]);
    await expect(migrateLegacyWebSession(migrationOptions(storage, scripted.fetchImpl))).resolves.toMatchObject({
      phase: "retryable",
      reason: "COOKIE_CONFIRMATION_FAILED",
    });
    expect(storage.value).toBe(LEGACY_TOKEN);
  });

  it.each([
    [404, "unsupported", "MIGRATION_UNSUPPORTED"],
    [501, "unsupported", "MIGRATION_UNSUPPORTED"],
    [401, "reauthentication_required", "LEGACY_SESSION_REJECTED"],
    [403, "reauthentication_required", "LEGACY_SESSION_REJECTED"],
    [409, "retryable", "MIGRATION_REJECTED"],
    [503, "retryable", "MIGRATION_REJECTED"],
  ] as const)("preserves the token for migration HTTP %i", async (status, phase, reason) => {
    const storage = new MemoryStorage(LEGACY_TOKEN);
    const scripted = scriptedFetch([() => jsonResponse({ error: "rejected" }, status)]);
    await expect(migrateLegacyWebSession(migrationOptions(storage, scripted.fetchImpl))).resolves.toMatchObject({
      phase,
      reason,
      legacyTokenPresent: true,
    });
    expect(storage.value).toBe(LEGACY_TOKEN);
    expect(storage.removeCalls).toBe(0);
  });

  it("preserves the token after network failure or cancellation", async () => {
    const networkStorage = new MemoryStorage(LEGACY_TOKEN);
    const network = scriptedFetch([async () => { throw new TypeError("offline"); }]);
    await expect(migrateLegacyWebSession(migrationOptions(networkStorage, network.fetchImpl))).resolves.toMatchObject({
      phase: "retryable",
      reason: "MIGRATION_NETWORK_ERROR",
    });
    expect(networkStorage.value).toBe(LEGACY_TOKEN);

    const controller = new AbortController();
    controller.abort();
    const abortStorage = new MemoryStorage(LEGACY_TOKEN);
    const cancelled = scriptedFetch([async () => { throw new DOMException("cancelled", "AbortError"); }]);
    await expect(migrateLegacyWebSession(migrationOptions(abortStorage, cancelled.fetchImpl, controller.signal))).resolves.toMatchObject({
      phase: "retryable",
      reason: "MIGRATION_ABORTED",
    });
    expect(abortStorage.value).toBe(LEGACY_TOKEN);
  });

  it("does not send malformed or inaccessible legacy storage values", async () => {
    const malformed = new MemoryStorage("short");
    const unused = vi.fn<typeof fetch>();
    await expect(migrateLegacyWebSession(migrationOptions(malformed, unused))).resolves.toMatchObject({
      phase: "reauthentication_required",
      reason: "LEGACY_TOKEN_INVALID",
      legacyTokenPresent: true,
    });
    expect(unused).not.toHaveBeenCalled();
    expect(malformed.value).toBe("short");

    const unavailable: WebSessionStorage = {
      getItem() { throw new DOMException("blocked", "SecurityError"); },
      removeItem() { throw new Error("must not run"); },
    };
    await expect(migrateLegacyWebSession(migrationOptions(unavailable, unused))).resolves.toMatchObject({
      phase: "retryable",
      reason: "LEGACY_STORAGE_UNAVAILABLE",
    });
    expect(unused).not.toHaveBeenCalled();
  });

  it("preserves the token when migration JSON is malformed, oversized, or wrong media type", async () => {
    const cases = [
      new Response("not-json", { status: 200, headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify({ session: SESSION }), {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
      new Response(JSON.stringify({ session: SESSION }), {
        status: 200,
        headers: { "content-type": "application/json", "content-length": String(64 * 1024 + 1) },
      }),
      jsonResponse({ session: { ...SESSION, csrfToken: "bad" } }),
    ];
    for (const response of cases) {
      const storage = new MemoryStorage(LEGACY_TOKEN);
      const scripted = scriptedFetch([() => response]);
      await expect(migrateLegacyWebSession(migrationOptions(storage, scripted.fetchImpl))).resolves.toMatchObject({
        phase: "retryable",
        reason: "MIGRATION_RESPONSE_INVALID",
      });
      expect(storage.value).toBe(LEGACY_TOKEN);
      expect(storage.removeCalls).toBe(0);
    }
  });

  it("does not delete a replacement token written by another tab", async () => {
    const storage = new MemoryStorage(LEGACY_TOKEN);
    storage.onGet = (call, current) => call === 2 ? "replacement_session_abcdefghijklmnopqrstuvwxyz_9" : current;
    const scripted = scriptedFetch([() => sessionResponse(), () => sessionResponse()]);
    await expect(migrateLegacyWebSession(migrationOptions(storage, scripted.fetchImpl))).resolves.toMatchObject({
      phase: "cleanup_pending",
      reason: "LEGACY_STORAGE_CHANGED",
      session: SESSION,
      legacyTokenPresent: true,
    });
    expect(storage.removeCalls).toBe(0);
    expect(storage.value).toBe(LEGACY_TOKEN);
  });

  it("keeps a confirmed cookie session usable when legacy cleanup fails", async () => {
    for (const mode of ["throws", "ignored"] as const) {
      const storage = new MemoryStorage(LEGACY_TOKEN);
      if (mode === "throws") storage.removeError = new DOMException("blocked", "SecurityError");
      else storage.ignoreRemove = true;
      const scripted = scriptedFetch([() => sessionResponse(), () => sessionResponse()]);
      await expect(migrateLegacyWebSession(migrationOptions(storage, scripted.fetchImpl))).resolves.toMatchObject({
        phase: "cleanup_pending",
        reason: "LEGACY_STORAGE_CLEANUP_FAILED",
        session: SESSION,
        legacyTokenPresent: true,
        retryable: true,
      });
      expect(storage.value).toBe(LEGACY_TOKEN);
    }
  });

  it("refuses cross-origin, insecure public, and non-/api targets before fetch", async () => {
    const storage = new MemoryStorage(LEGACY_TOKEN);
    const unused = vi.fn<typeof fetch>();
    for (const options of [
      { apiBase: "https://attacker.invalid/api", pageUrl: PAGE_URL },
      { apiBase: "/v1", pageUrl: PAGE_URL },
      { apiBase: "/api?token=secret", pageUrl: PAGE_URL },
      { apiBase: "/api", pageUrl: "http://dsponline.cn/" },
    ]) {
      await expect(migrateLegacyWebSession({
        ...options,
        storage,
        fetchImpl: unused,
        now: () => NOW,
      })).rejects.toThrow(/只允许当前安全站点的 \/api/);
    }
    expect(unused).not.toHaveBeenCalled();
  });

  it("allows same-origin localhost HTTP only for local development", async () => {
    const storage = new MemoryStorage(null);
    const scripted = scriptedFetch([() => jsonResponse({ error: "anonymous" }, 401)]);
    await expect(migrateLegacyWebSession({
      apiBase: "/api/",
      pageUrl: "http://localhost:4318/",
      storage,
      fetchImpl: scripted.fetchImpl,
      now: () => NOW,
    })).resolves.toMatchObject({ phase: "anonymous" });
    expect(scripted.calls[0]?.url).toBe(`http://localhost:4318/api${WEB_SESSION_STATUS_PATH}`);
  });

  it("single-flights concurrent startup migration attempts and permits a later retry", async () => {
    const storage = new MemoryStorage(LEGACY_TOKEN);
    let releaseGate = (): void => undefined;
    const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      await gate;
      return jsonResponse({ error: "unsupported" }, 404);
    }) as typeof fetch;
    const coordinator = createWebSessionMigrationCoordinator();
    const first = coordinator.run(migrationOptions(storage, fetchImpl));
    const second = coordinator.run(migrationOptions(storage, fetchImpl));
    expect(first).toBe(second);
    expect(coordinator.inFlight()).toBe(true);
    releaseGate();
    await expect(first).resolves.toMatchObject({ phase: "unsupported" });
    expect(calls).toBe(1);
    expect(coordinator.inFlight()).toBe(false);

    await expect(coordinator.run(migrationOptions(storage, fetchImpl))).resolves.toMatchObject({ phase: "unsupported" });
    expect(calls).toBe(2);
  });

  it("clears only in-memory cookie state on logout/delete/revoke integration", () => {
    expect(clearWebCookieSessionState()).toEqual({
      ...INITIAL_WEB_SESSION_MIGRATION_STATE,
      phase: "anonymous",
    });
    expect(Object.isFrozen(clearWebCookieSessionState())).toBe(true);
  });
});
