import assert from "node:assert/strict";
import test from "node:test";

import {
  WEB_SESSION_COOKIE_NAME,
  WEB_SESSION_COOKIE_PATH,
  WEB_SESSION_CSRF_HEADER,
  WEB_SESSION_MIGRATION_PATH,
  WEB_SESSION_MODE_COOKIE,
  WEB_SESSION_MODE_HEADER,
  WEB_SESSION_REQUEST_HEADER_NAMES,
  WEB_SESSION_STATUS_PATH,
  WebSessionError,
  assertLegacyWebSessionMigrationRequest,
  clearWebSessionCookie,
  createSessionDelivery,
  createWebSessionCookie,
  createWebSessionPolicy,
  deriveWebCsrfToken,
  inspectSessionCredential,
  inspectSessionIssuanceRequest,
  protectSessionRequest,
  publicCookieSession,
  requireCookieSessionCredential,
} from "./web-session.mjs";

const NOW = Date.parse("2026-08-13T04:00:00.000Z");
const SESSION_TOKEN = "session_abcdefghijklmnopqrstuvwxyz_0123456789";
const SECOND_TOKEN = "session_ABCDEFGHIJKLMNOPQRSTUVWXYZ_9876543210";
const ORIGIN = "https://dsponline.cn";
const policy = createWebSessionPolicy({ allowedOrigins: [ORIGIN] });

function request(method = "GET", headers = {}, extras = {}) {
  return { method, headers, ...extras };
}

function cookieHeader(token = SESSION_TOKEN) {
  return `${WEB_SESSION_COOKIE_NAME}=${token}`;
}

function expectCode(operation, code, statusCode) {
  assert.throws(operation, (error) => {
    assert.ok(error instanceof WebSessionError);
    assert.equal(error.code, code);
    if (statusCode !== undefined) assert.equal(error.statusCode, statusCode);
    return true;
  });
}

test("defines stable Web session routes and request headers", () => {
  assert.equal(WEB_SESSION_COOKIE_PATH, "/api");
  assert.equal(WEB_SESSION_MIGRATION_PATH, "/api/auth/web-session/migrate");
  assert.equal(WEB_SESSION_STATUS_PATH, "/api/auth/web-session");
  assert.deepEqual(WEB_SESSION_REQUEST_HEADER_NAMES, ["x-dsp-session-mode", "x-dsp-csrf-token"]);
  assert.equal(Object.isFrozen(WEB_SESSION_REQUEST_HEADER_NAMES), true);
});

test("normalizes a bounded Lax policy and rejects unsafe configuration", () => {
  const normalized = createWebSessionPolicy({
    allowedOrigins: [ORIGIN, ORIGIN],
    maximumAgeSeconds: 3_600,
  });
  assert.deepEqual(normalized.allowedOrigins, [ORIGIN]);
  assert.equal(normalized.sameSite, "Lax");
  assert.equal(normalized.cookieName, WEB_SESSION_COOKIE_NAME);
  assert.equal(normalized.cookiePath, "/api");
  assert.equal(normalized.maximumAgeSeconds, 3_600);
  assert.equal(Object.isFrozen(normalized), true);

  for (const options of [
    {},
    { allowedOrigins: [] },
    { allowedOrigins: ["*"] },
    { allowedOrigins: ["null"] },
    { allowedOrigins: [`${ORIGIN}/path`] },
    { allowedOrigins: ["https://user:password@dsponline.cn"] },
    { allowedOrigins: [ORIGIN], sameSite: "None" },
    { allowedOrigins: [ORIGIN], maximumAgeSeconds: 299 },
    { allowedOrigins: [ORIGIN], maximumAgeSeconds: 90 * 24 * 60 * 60 + 1 },
  ]) {
    expectCode(() => createWebSessionPolicy(options), "WEB_SESSION_POLICY_INVALID", 500);
  }
});

test("supports Strict when explicitly selected", () => {
  const strict = createWebSessionPolicy({ allowedOrigins: [ORIGIN], sameSite: "Strict" });
  const value = createWebSessionCookie(SESSION_TOKEN, NOW + 60_000, strict, { now: NOW });
  assert.match(value, /SameSite=Strict/);
});

test("issues an HttpOnly Secure API-scoped cookie with matching Max-Age and Expires", () => {
  const value = createWebSessionCookie(SESSION_TOKEN, NOW + 3_600_999, policy, { now: NOW });
  assert.equal(value, [
    `${WEB_SESSION_COOKIE_NAME}=${SESSION_TOKEN}`,
    "Path=/api",
    "Max-Age=3600",
    `Expires=${new Date(NOW + 3_600_999).toUTCString()}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Priority=High",
  ].join("; "));
  assert.equal(value.includes("Domain="), false, "the cookie remains host-only");
});

test("caps cookie lifetime to policy and rejects expired or injectable values", () => {
  const shortPolicy = createWebSessionPolicy({ allowedOrigins: [ORIGIN], maximumAgeSeconds: 600 });
  const value = createWebSessionCookie(SESSION_TOKEN, NOW + 86_400_000, shortPolicy, { now: NOW });
  assert.match(value, /Max-Age=600/);
  assert.match(value, new RegExp(`Expires=${new Date(NOW + 600_000).toUTCString().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  expectCode(() => createWebSessionCookie(SESSION_TOKEN, NOW, policy, { now: NOW }), "WEB_SESSION_EXPIRY_INVALID", 500);
  expectCode(() => createWebSessionCookie(`${SESSION_TOKEN}\r\nX-Evil: yes`, NOW + 60_000, policy, { now: NOW }), "WEB_SESSION_TOKEN_INVALID", 401);
});

test("clears the exact cookie with the same security attributes", () => {
  assert.equal(clearWebSessionCookie(policy), [
    `${WEB_SESSION_COOKIE_NAME}=`,
    "Path=/api",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Priority=High",
  ].join("; "));
});

test("keeps legacy and native session issuance on Bearer JSON by default", () => {
  const delivery = createSessionDelivery(request("POST"), {
    sessionToken: SESSION_TOKEN,
    sessionExpiresAt: NOW + 60_000,
    now: NOW,
  }, policy);
  assert.equal(delivery.transport, "bearer");
  assert.deepEqual(delivery.headers, {});
  assert.deepEqual(delivery.publicCredentials, { token: SESSION_TOKEN });
});

test("new Web issuance returns only a short public CSRF value and an HttpOnly cookie", () => {
  const webRequest = request("POST", {
    origin: ORIGIN,
    "sec-fetch-site": "same-origin",
    [WEB_SESSION_MODE_HEADER]: WEB_SESSION_MODE_COOKIE,
  });
  assert.deepEqual(inspectSessionIssuanceRequest(webRequest, policy), { transport: "cookie", origin: ORIGIN });
  const delivery = createSessionDelivery(webRequest, {
    sessionToken: SESSION_TOKEN,
    sessionExpiresAt: NOW + 60_000,
    now: NOW,
  }, policy);
  assert.equal(delivery.transport, "cookie");
  assert.match(delivery.headers["set-cookie"], new RegExp(`^${WEB_SESSION_COOKIE_NAME}=`));
  assert.deepEqual(delivery.publicCredentials, {
    session: {
      transport: "cookie",
      csrfToken: deriveWebCsrfToken(SESSION_TOKEN),
      expiresAt: NOW + 60_000,
    },
  });
  assert.equal(Object.hasOwn(delivery.publicCredentials, "token"), false);
  assert.equal(JSON.stringify(delivery.publicCredentials).includes(SESSION_TOKEN), false);
});

test("session issuance rejects bad mode, origin, fetch-site, method, and duplicate headers", () => {
  expectCode(() => inspectSessionIssuanceRequest(request("GET"), policy), "WEB_SESSION_ISSUANCE_METHOD_INVALID", 405);
  expectCode(() => inspectSessionIssuanceRequest(request("POST", {
    [WEB_SESSION_MODE_HEADER]: "future-mode",
  }), policy), "WEB_SESSION_MODE_INVALID", 400);
  expectCode(() => inspectSessionIssuanceRequest(request("POST", {
    [WEB_SESSION_MODE_HEADER]: WEB_SESSION_MODE_COOKIE,
  }), policy), "WEB_SESSION_ORIGIN_REQUIRED", 403);
  expectCode(() => inspectSessionIssuanceRequest(request("POST", {
    origin: "https://attacker.invalid",
    [WEB_SESSION_MODE_HEADER]: WEB_SESSION_MODE_COOKIE,
  }), policy), "WEB_SESSION_ORIGIN_DENIED", 403);
  expectCode(() => inspectSessionIssuanceRequest(request("POST", {
    origin: ORIGIN,
    "sec-fetch-site": "cross-site",
    [WEB_SESSION_MODE_HEADER]: WEB_SESSION_MODE_COOKIE,
  }), policy), "WEB_SESSION_FETCH_SITE_DENIED", 403);
  expectCode(() => inspectSessionIssuanceRequest(request("POST", {}, {
    rawHeaders: [
      "Origin", ORIGIN,
      "origin", ORIGIN,
      WEB_SESSION_MODE_HEADER, WEB_SESSION_MODE_COOKIE,
    ],
  }), policy), "WEB_SESSION_HEADER_DUPLICATE");
});

test("strictly identifies Bearer, cookie, and unauthenticated credentials", () => {
  assert.deepEqual(inspectSessionCredential(request("GET", {
    authorization: `Bearer ${SESSION_TOKEN}`,
  }), policy), { kind: "bearer", token: SESSION_TOKEN });
  assert.deepEqual(inspectSessionCredential(request("GET", {
    cookie: `theme=dark; ${cookieHeader()}; locale=zh-CN`,
  }), policy), { kind: "cookie", token: SESSION_TOKEN });
  assert.deepEqual(inspectSessionCredential(request(), policy), { kind: "none", token: null });
});

test("Bearer explicitly wins without parsing a stale cookie and remains CSRF-compatible", () => {
  const bearerRequest = request("POST", {
    authorization: `Bearer ${SESSION_TOKEN}`,
    cookie: `${WEB_SESSION_COOKIE_NAME}=broken\r\nX-Evil: yes`,
    origin: "https://attacker.invalid",
  });
  const credential = inspectSessionCredential(bearerRequest, policy);
  assert.deepEqual(credential, { kind: "bearer", token: SESSION_TOKEN });
  assert.deepEqual(protectSessionRequest(bearerRequest, credential, policy), {
    credential,
    csrfRequired: false,
    origin: null,
  });
});

test("rejects malformed, duplicated, Unicode, and ambiguous credentials", () => {
  for (const authorization of [
    "Basic abc",
    "Bearer short",
    `bearer ${SESSION_TOKEN}`,
    `Bearer ${SESSION_TOKEN} extra`,
    `Bearer ${SESSION_TOKEN}\r\nX-Evil: yes`,
    `Bearer ${"密".repeat(40)}`,
  ]) {
    expectCode(() => inspectSessionCredential(request("GET", { authorization }), policy),
      authorization.includes("\r\n") || authorization.includes("密")
        ? "WEB_SESSION_HEADER_INVALID"
        : "WEB_SESSION_AUTHORIZATION_INVALID");
  }
  expectCode(() => inspectSessionCredential(request("GET", {}, {
    rawHeaders: ["Authorization", `Bearer ${SESSION_TOKEN}`, "authorization", `Bearer ${SECOND_TOKEN}`],
  }), policy), "WEB_SESSION_HEADER_DUPLICATE");
  expectCode(() => inspectSessionCredential(request("GET", {
    cookie: `${cookieHeader()}; ${cookieHeader(SECOND_TOKEN)}`,
  }), policy), "WEB_SESSION_COOKIE_DUPLICATE");
  expectCode(() => inspectSessionCredential(request("GET", {
    cookie: `${WEB_SESSION_COOKIE_NAME}=short`,
  }), policy), "WEB_SESSION_COOKIE_INVALID");
});

test("cookie-authenticated safe methods do not need CSRF", () => {
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    const target = request(method, { cookie: cookieHeader() });
    const credential = inspectSessionCredential(target, policy);
    assert.deepEqual(protectSessionRequest(target, credential, policy), {
      credential,
      csrfRequired: false,
      origin: null,
    });
  }
});

test("cookie-authenticated writes require an exact origin and matching CSRF header", () => {
  const csrfToken = deriveWebCsrfToken(SESSION_TOKEN);
  assert.match(csrfToken, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(csrfToken, deriveWebCsrfToken(SESSION_TOKEN));
  assert.notEqual(csrfToken, deriveWebCsrfToken(SECOND_TOKEN));

  const target = request("PUT", {
    cookie: cookieHeader(),
    origin: ORIGIN,
    "sec-fetch-site": "same-origin",
    [WEB_SESSION_CSRF_HEADER]: csrfToken,
  });
  const credential = inspectSessionCredential(target, policy);
  assert.deepEqual(protectSessionRequest(target, credential, policy), {
    credential,
    csrfRequired: true,
    origin: ORIGIN,
  });
});

test("cookie writes reject missing, malformed, wrong-session, cross-site, and CRLF CSRF values", () => {
  const base = {
    cookie: cookieHeader(),
    origin: ORIGIN,
    "sec-fetch-site": "same-origin",
  };
  expectCode(() => protectSessionRequest(request("POST", base), null, policy), "WEB_SESSION_CSRF_REQUIRED", 403);
  for (const csrfToken of [
    "short",
    deriveWebCsrfToken(SECOND_TOKEN),
    `${deriveWebCsrfToken(SESSION_TOKEN)}\r\nX-Evil: yes`,
  ]) {
    const malformedHeader = csrfToken.includes("\r\n");
    expectCode(() => protectSessionRequest(request("POST", {
      ...base,
      [WEB_SESSION_CSRF_HEADER]: csrfToken,
    }), null, policy), malformedHeader ? "WEB_SESSION_HEADER_INVALID" : "WEB_SESSION_CSRF_INVALID", malformedHeader ? 400 : 403);
  }
  expectCode(() => protectSessionRequest(request("POST", {
    ...base,
    origin: "https://attacker.invalid",
    [WEB_SESSION_CSRF_HEADER]: deriveWebCsrfToken(SESSION_TOKEN),
  }), null, policy), "WEB_SESSION_ORIGIN_DENIED", 403);
  expectCode(() => protectSessionRequest(request("POST", {
    ...base,
    "sec-fetch-site": "cross-site",
    [WEB_SESSION_CSRF_HEADER]: deriveWebCsrfToken(SESSION_TOKEN),
  }), null, policy), "WEB_SESSION_FETCH_SITE_DENIED", 403);
});

test("requires an explicit same-origin Bearer exchange for legacy Web migration", () => {
  const migration = request("POST", {
    authorization: `Bearer ${SESSION_TOKEN}`,
    origin: ORIGIN,
    "sec-fetch-site": "same-origin",
    [WEB_SESSION_MODE_HEADER]: WEB_SESSION_MODE_COOKIE,
  });
  assert.deepEqual(assertLegacyWebSessionMigrationRequest(migration, policy), {
    kind: "bearer",
    token: SESSION_TOKEN,
  });

  expectCode(() => assertLegacyWebSessionMigrationRequest({ ...migration, method: "GET" }, policy),
    "WEB_SESSION_MIGRATION_METHOD_INVALID", 405);
  expectCode(() => assertLegacyWebSessionMigrationRequest(request("POST", {
    authorization: `Bearer ${SESSION_TOKEN}`,
    origin: ORIGIN,
  }), policy), "WEB_SESSION_MIGRATION_MODE_REQUIRED", 400);
  expectCode(() => assertLegacyWebSessionMigrationRequest(request("POST", {
    cookie: cookieHeader(),
    origin: ORIGIN,
    "sec-fetch-site": "same-origin",
    [WEB_SESSION_MODE_HEADER]: WEB_SESSION_MODE_COOKIE,
  }), policy), "WEB_SESSION_MIGRATION_BEARER_REQUIRED", 401);
  expectCode(() => assertLegacyWebSessionMigrationRequest(request("POST", {
    authorization: `Bearer ${SESSION_TOKEN}`,
    origin: "https://attacker.invalid",
    [WEB_SESSION_MODE_HEADER]: WEB_SESSION_MODE_COOKIE,
  }), policy), "WEB_SESSION_ORIGIN_DENIED", 403);
});

test("exposes a fresh public CSRF value only after cookie authentication", () => {
  const credential = requireCookieSessionCredential(request("GET", { cookie: cookieHeader() }), policy);
  assert.deepEqual(publicCookieSession(credential, NOW + 60_000, { now: NOW }), {
    transport: "cookie",
    csrfToken: deriveWebCsrfToken(SESSION_TOKEN),
    expiresAt: NOW + 60_000,
  });
  expectCode(() => requireCookieSessionCredential(request("GET", {
    authorization: `Bearer ${SESSION_TOKEN}`,
  }), policy), "WEB_SESSION_COOKIE_REQUIRED", 401);
  expectCode(() => publicCookieSession(credential, NOW, { now: NOW }), "WEB_SESSION_EXPIRY_INVALID", 401);
});

test("supports Fetch Headers objects without relaxing duplicate raw-header checks", () => {
  const credential = inspectSessionCredential({
    method: "GET",
    headers: new Headers({ cookie: cookieHeader() }),
  }, policy);
  assert.deepEqual(credential, { kind: "cookie", token: SESSION_TOKEN });
});
