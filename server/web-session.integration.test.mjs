import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { createCloudServer } from "./index.mjs";
import {
  WEB_SESSION_COOKIE_NAME,
  WEB_SESSION_CSRF_HEADER,
  WEB_SESSION_MODE_COOKIE,
  WEB_SESSION_MODE_HEADER,
} from "./web-session.mjs";

const ORIGIN = "https://dsponline.cn";
const PASSWORD = "synthetic-pass-123";
let directory;
let server;
let baseUrl;
let sequence = 0;

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "dsp-web-session-http-"));
  server = await createCloudServer({
    databaseFile: path.join(directory, "cloud.sqlite"),
    allowedOrigin: ORIGIN,
    registrationLimit: 100,
    historyPruneIntervalMs: 0,
    mailer: null,
    logger: { error() {} },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
});

async function call(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
  });
  const body = await response.json();
  return { response, body };
}

function webIssuanceHeaders(extra = {}) {
  return {
    origin: ORIGIN,
    "sec-fetch-site": "same-origin",
    [WEB_SESSION_MODE_HEADER]: WEB_SESSION_MODE_COOKIE,
    ...extra,
  };
}

function cookieFrom(response) {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "expected a Set-Cookie response header");
  const pair = setCookie.split(";", 1)[0];
  assert.match(pair, new RegExp(`^${WEB_SESSION_COOKIE_NAME}=[A-Za-z0-9_-]{32,256}$`));
  return { pair, value: pair.slice(pair.indexOf("=") + 1), setCookie };
}

function cookieAuth(cookie, csrfToken, method = "GET", extra = {}) {
  return {
    cookie: cookie.pair,
    [WEB_SESSION_MODE_HEADER]: WEB_SESSION_MODE_COOKIE,
    ...(method === "GET" ? {} : {
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
      [WEB_SESSION_CSRF_HEADER]: csrfToken,
    }),
    ...extra,
  };
}

async function registerLegacy(prefix = "legacy") {
  sequence += 1;
  const result = await call("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      username: `${prefix}_${sequence}`,
      password: PASSWORD,
      displayName: `合成账号 ${sequence}`,
    }),
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  return result;
}

async function registerCookie(prefix = "cookie") {
  sequence += 1;
  const result = await call("/api/auth/register", {
    method: "POST",
    headers: webIssuanceHeaders(),
    body: JSON.stringify({
      username: `${prefix}_${sequence}`,
      password: PASSWORD,
      displayName: `Cookie 合成账号 ${sequence}`,
    }),
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  assert.equal(Object.hasOwn(result.body, "token"), false);
  assert.equal(result.body.session.transport, "cookie");
  return { ...result, cookie: cookieFrom(result.response), csrf: result.body.session.csrfToken };
}

test("keeps legacy Bearer issuance and authenticated reads byte-contract compatible", async () => {
  const registered = await registerLegacy();
  assert.equal(typeof registered.body.token, "string");
  assert.equal(Object.hasOwn(registered.body, "session"), false);
  assert.equal(registered.response.headers.get("set-cookie"), null);

  const account = await call("/api/account", {
    headers: { authorization: `Bearer ${registered.body.token}` },
  });
  assert.equal(account.response.status, 200);
  assert.equal(account.body.user.id, registered.body.user.id);
});

test("issues an HttpOnly cookie without exposing the bearer and requires CSRF for writes", async () => {
  const registered = await registerCookie();
  assert.match(registered.cookie.setCookie, /Path=\/api/);
  assert.match(registered.cookie.setCookie, /HttpOnly/);
  assert.match(registered.cookie.setCookie, /Secure/);
  assert.match(registered.cookie.setCookie, /SameSite=Lax/);
  assert.doesNotMatch(registered.cookie.setCookie, /Domain=/);

  const status = await call("/api/auth/web-session", {
    headers: cookieAuth(registered.cookie, registered.csrf),
  });
  assert.equal(status.response.status, 200);
  assert.deepEqual(status.body.session, registered.body.session);

  const account = await call("/api/account", {
    headers: cookieAuth(registered.cookie, registered.csrf),
  });
  assert.equal(account.response.status, 200);
  assert.equal(account.body.user.id, registered.body.user.id);

  const missingCsrf = await call("/api/leaderboard/visibility", {
    method: "POST",
    headers: {
      cookie: registered.cookie.pair,
      [WEB_SESSION_MODE_HEADER]: WEB_SESSION_MODE_COOKIE,
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify({ visible: false }),
  });
  assert.equal(missingCsrf.response.status, 403);
  assert.equal(missingCsrf.body.code, "WEB_SESSION_CSRF_REQUIRED");

  const wrongCsrf = await call("/api/leaderboard/visibility", {
    method: "POST",
    headers: cookieAuth(registered.cookie, "wrong_csrf_token_abcdefghijklmnop", "POST"),
    body: JSON.stringify({ visible: false }),
  });
  assert.equal(wrongCsrf.response.status, 403);
  assert.equal(wrongCsrf.body.code, "WEB_SESSION_CSRF_INVALID");

  const valid = await call("/api/leaderboard/visibility", {
    method: "POST",
    headers: cookieAuth(registered.cookie, registered.csrf, "POST"),
    body: JSON.stringify({ visible: false }),
  });
  assert.equal(valid.response.status, 200, JSON.stringify(valid.body));
  assert.equal(valid.body.visible, false);
});

test("migrates a legacy token only through an explicit same-origin exchange and leaves Bearer valid", async () => {
  const legacy = await registerLegacy("migration");
  const migrated = await call("/api/auth/web-session/migrate", {
    method: "POST",
    headers: webIssuanceHeaders({ authorization: `Bearer ${legacy.body.token}` }),
  });
  assert.equal(migrated.response.status, 200, JSON.stringify(migrated.body));
  assert.equal(Object.hasOwn(migrated.body, "token"), false);
  const cookie = cookieFrom(migrated.response);

  const cookieStatus = await call("/api/auth/web-session", {
    headers: cookieAuth(cookie, migrated.body.session.csrfToken),
  });
  assert.equal(cookieStatus.response.status, 200);
  assert.deepEqual(cookieStatus.body.session, migrated.body.session);

  const legacyStillValid = await call("/api/account", {
    headers: { authorization: `Bearer ${legacy.body.token}` },
  });
  assert.equal(legacyStillValid.response.status, 200);

  const rejected = await call("/api/auth/web-session/migrate", {
    method: "POST",
    headers: {
      authorization: `Bearer ${legacy.body.token}`,
      origin: "https://attacker.invalid",
      "sec-fetch-site": "cross-site",
      [WEB_SESSION_MODE_HEADER]: WEB_SESSION_MODE_COOKIE,
    },
  });
  assert.equal(rejected.response.status, 403);
  assert.equal(rejected.response.headers.get("set-cookie"), null);
  assert.equal((await call("/api/account", {
    headers: { authorization: `Bearer ${legacy.body.token}` },
  })).response.status, 200);
});

test("password change preserves the current cookie and revokes other devices", async () => {
  const registered = await registerCookie("password");
  const second = await call("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      identifier: registered.body.user.username,
      password: PASSWORD,
      deviceName: "第二合成设备",
    }),
  });
  assert.equal(second.response.status, 200);

  const wrong = await call("/api/account/password", {
    method: "POST",
    headers: cookieAuth(registered.cookie, registered.csrf, "POST"),
    body: JSON.stringify({ currentPassword: "wrong-password", newPassword: "new-synthetic-pass-456" }),
  });
  assert.equal(wrong.response.status, 401);
  assert.equal(wrong.body.code, "CURRENT_PASSWORD_INVALID");
  assert.equal((await call("/api/account", {
    headers: cookieAuth(registered.cookie, registered.csrf),
  })).response.status, 200);

  const changed = await call("/api/account/password", {
    method: "POST",
    headers: cookieAuth(registered.cookie, registered.csrf, "POST"),
    body: JSON.stringify({ currentPassword: PASSWORD, newPassword: "new-synthetic-pass-456" }),
  });
  assert.equal(changed.response.status, 200, JSON.stringify(changed.body));
  assert.equal((await call("/api/account", {
    headers: cookieAuth(registered.cookie, registered.csrf),
  })).response.status, 200);
  assert.equal((await call("/api/account", {
    headers: { authorization: `Bearer ${second.body.token}` },
  })).response.status, 401);
});

test("revoking all devices removes every session and clears the current cookie", async () => {
  const registered = await registerCookie("revoke_all");
  const second = await call("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier: registered.body.user.username, password: PASSWORD }),
  });
  assert.equal(second.response.status, 200);

  const revoked = await call("/api/account/sessions/revoke-all", {
    method: "POST",
    headers: cookieAuth(registered.cookie, registered.csrf, "POST"),
    body: "{}",
  });
  assert.equal(revoked.response.status, 200, JSON.stringify(revoked.body));
  assert.equal(revoked.body.currentSessionRevoked, true);
  assert.equal(revoked.body.revokedCount, 2);
  assert.match(revoked.response.headers.get("set-cookie") ?? "", /Max-Age=0/);
  assert.equal((await call("/api/account", {
    headers: cookieAuth(registered.cookie, registered.csrf),
  })).response.status, 401);
  assert.equal((await call("/api/account", {
    headers: { authorization: `Bearer ${second.body.token}` },
  })).response.status, 401);
});

test("logout clears a cookie even after its server session expires", async () => {
  const registered = await registerCookie("expiry");
  const tokenHash = createHash("sha256").update(registered.cookie.value).digest("hex");
  server.store.data.sessions[tokenHash].expiresAt = Date.now() - 1;

  const expired = await call("/api/auth/web-session", {
    headers: cookieAuth(registered.cookie, registered.csrf),
  });
  assert.equal(expired.response.status, 401);
  assert.equal(expired.body.code, "SESSION_EXPIRED");

  const logout = await call("/api/auth/logout", {
    method: "POST",
    headers: cookieAuth(registered.cookie, registered.csrf, "POST"),
    body: "{}",
  });
  assert.equal(logout.response.status, 200);
  assert.match(logout.response.headers.get("set-cookie") ?? "", /Max-Age=0/);
});

test("deleting a cookie-authenticated account clears the cookie without changing schema versions", async () => {
  const registered = await registerCookie("delete");
  const deleted = await call("/api/account/delete", {
    method: "POST",
    headers: cookieAuth(registered.cookie, registered.csrf, "POST"),
    body: JSON.stringify({ password: PASSWORD, confirmation: "DELETE" }),
  });
  assert.equal(deleted.response.status, 200, JSON.stringify(deleted.body));
  assert.match(deleted.response.headers.get("set-cookie") ?? "", /Max-Age=0/);
  assert.equal(server.store.data.schemaVersion, 7);
  assert.equal(server.store.data.storageLayoutVersion, 2);
  assert.equal((await call("/api/account", {
    headers: cookieAuth(registered.cookie, registered.csrf),
  })).response.status, 401);
});
