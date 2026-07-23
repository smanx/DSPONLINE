import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { createCloudServer } from "./index.mjs";
import { metricDay } from "./analytics.mjs";

let directory;
let server;
let baseUrl;
let token;
let mailbox;
let offsiteBackupStatusFile;
let restoreDrillStatusFile;
let nodeHealthStatusFile;
const adminToken = "test-admin-secret-1234567890-abcdef";
const cloudPayload = JSON.stringify({
  formatVersion: 1,
  savedAt: 123456,
  checksum: "client-state-checksum",
  state: {
    version: 24,
    elapsedSeconds: 1_000_000,
    entities: [],
    totalProduced: { universe_matrix: 10 },
    metrics: { generationKw: 1_000, totalItemsPerMinute: 0, rayGenerationKw: 0 },
    exploration: { unlockedSystemIds: ["helios"], colonizedPlanetIds: ["home"] },
  },
});

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "dsp-cloud-"));
  offsiteBackupStatusFile = path.join(directory, "offsite-status.json");
  restoreDrillStatusFile = path.join(directory, "restore-status.json");
  nodeHealthStatusFile = path.join(directory, "node-health-status.json");
  await writeFile(offsiteBackupStatusFile, JSON.stringify({ ok: true, completedAt: 100, durationMs: 20, transported: true, transport: "local", schemaVersion: 5, artifact: "cloud-test.sqlite.dspbak" }));
  await writeFile(restoreDrillStatusFile, JSON.stringify({ ok: true, completedAt: 200, durationMs: 30, restoredSchemaVersion: 5, artifact: "cloud-test.sqlite.dspbak" }));
  await writeFile(nodeHealthStatusFile, JSON.stringify({ ok: true, checkedAt: 300, failedChecks: [], endpoints: [{ url: "https://dsponline.cn/api/health", ok: true, status: 200, latencyMs: 12.5, contentEncoding: "gzip" }], disk: { ok: true, freeBytes: 80, totalBytes: 100, freeRatio: 0.8 }, tls: { configured: true, ok: true, expiresAt: 1000, daysRemaining: 60 } }));
  mailbox = [];
  server = await createCloudServer({
    databaseFile: path.join(directory, "cloud.sqlite"),
    adminToken,
    offsiteBackupStatusFile,
    restoreDrillStatusFile,
    nodeHealthStatusFile,
    registrationLimit: 100,
    mailer: async (message) => { mailbox.push(message); return true; },
    logger: { error() {} },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
});

async function request(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  return { response, body: await response.json() };
}

test("registers by username, preserves the leaderboard email gate and verifies a bound email", async () => {
  const health = await request("/api/health");
  assert.equal(health.body.mailProvider, "custom");
  assert.equal(health.body.schemaVersion, 7);
  const registered = await request("/api/auth/register", { method: "POST", body: JSON.stringify({ username: "Pilot_One", password: "strong-pass-123", displayName: "测试工程师" }) });
  assert.equal(registered.response.status, 201);
  assert.ok(registered.body.token);
  assert.equal(registered.body.user.username, "pilot_one");
  assert.equal(registered.body.user.email, "");
  assert.equal(registered.body.user.emailVerified, false);
  token = registered.body.token;

  const blockedLeaderboard = await request("/api/leaderboard", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ seasonId: "season_01", metrics: { energyGeneratedMj: 1 } }),
  });
  assert.equal(blockedLeaderboard.response.status, 403);
  assert.equal(blockedLeaderboard.body.code, "EMAIL_VERIFICATION_REQUIRED");

  const duplicate = await request("/api/auth/register", { method: "POST", body: JSON.stringify({ username: "PILOT_ONE", password: "strong-pass-123", displayName: "另一位工程师" }) });
  assert.equal(duplicate.response.status, 409);

  const bound = await request("/api/account/email", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ email: "pilot@example.com" }),
  });
  assert.equal(bound.response.status, 202);
  const verification = mailbox.find((message) => message.kind === "verify" && message.email === "pilot@example.com");
  assert.ok(verification?.actionToken);
  const verified = await request("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token: verification.actionToken }) });
  assert.equal(verified.response.status, 200);
  assert.equal(verified.body.user.emailVerified, true);
  const reused = await request("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token: verification.actionToken }) });
  assert.equal(reused.response.status, 400);
});

test("opens all cloud save functions without mail while keeping leaderboard verification required", async () => {
  const isolatedDirectory = await mkdtemp(path.join(tmpdir(), "dsp-no-mail-"));
  let isolatedServer;
  try {
    isolatedServer = await createCloudServer({ databaseFile: path.join(isolatedDirectory, "cloud.sqlite"), registrationLimit: 1, mailer: null, logger: { error() {} } });
    await new Promise((resolve) => isolatedServer.listen(0, "127.0.0.1", resolve));
    const isolatedBaseUrl = `http://127.0.0.1:${isolatedServer.address().port}`;
    const isolatedRequest = async (route, options = {}) => {
      const response = await fetch(`${isolatedBaseUrl}${route}`, {
        ...options,
        headers: { "content-type": "application/json", ...(options.headers || {}) },
      });
      return { response, body: await response.json() };
    };
    const health = await isolatedRequest("/api/health");
    assert.equal(health.body.mailProvider, "disabled");
    assert.equal(health.body.schemaVersion, 7);
    const registered = await isolatedRequest("/api/auth/register", {
      method: "POST",
      headers: { "x-forwarded-for": "spoofed-a, 203.0.113.42" },
      body: JSON.stringify({ username: "no_mail_pilot", password: "strong-pass-123", displayName: "邮件未配置" }),
    });
    assert.equal(registered.response.status, 201);
    assert.equal(registered.body.user.email, "");
    assert.equal(registered.body.user.emailVerified, false);
    assert.equal(registered.body.mailAvailable, false);
    const rateLimited = await isolatedRequest("/api/auth/register", {
      method: "POST",
      headers: { "x-forwarded-for": "spoofed-b, 203.0.113.42" },
      body: JSON.stringify({ username: "second_pilot", password: "strong-pass-123", displayName: "第二位工程师" }),
    });
    assert.equal(rateLimited.response.status, 429);
    assert.equal(rateLimited.body.code, "REGISTRATION_RATE_LIMITED");
    const isolatedToken = registered.body.token;
    const headers = { authorization: `Bearer ${isolatedToken}` };

    for (const slot of ["main", "1", "2", "3"]) {
      const suffix = slot === "main" ? "" : `?slot=${slot}`;
      const saved = await isolatedRequest(`/api/cloud-save${suffix}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ payload: cloudPayload, expectedRevision: 0 }),
      });
      assert.equal(saved.response.status, 200);
      assert.equal(saved.body.cloudSave.revision, 1);
      assert.equal(saved.body.cloudSave.slot, slot);
    }
    const second = await isolatedRequest("/api/cloud-save", {
      method: "PUT",
      headers,
      body: JSON.stringify({ payload: cloudPayload.replace('"universe_matrix":10', '"universe_matrix":12'), expectedRevision: 1 }),
    });
    assert.equal(second.body.cloudSave.revision, 2);
    const history = await isolatedRequest("/api/cloud-save/history", { headers });
    assert.deepEqual(history.body.history.map((entry) => entry.revision), [2, 1]);
    const restored = await isolatedRequest("/api/cloud-save/restore", {
      method: "POST",
      headers,
      body: JSON.stringify({ revision: 1, expectedRevision: 2 }),
    });
    assert.equal(restored.response.status, 200);
    assert.equal(restored.body.cloudSave.revision, 3);
    const account = await isolatedRequest("/api/account", { headers });
    assert.equal(account.body.cloudSaves.main.revision, 3);
    assert.equal(account.body.cloudSaves["1"].revision, 1);
    assert.equal(account.body.cloudSaves["2"].revision, 1);
    assert.equal(account.body.cloudSaves["3"].revision, 1);

    const blockedLeaderboard = await isolatedRequest("/api/leaderboard", {
      method: "POST",
      headers,
      body: JSON.stringify({ seasonId: "season_01", metrics: { energyGeneratedMj: 1 } }),
    });
    assert.equal(blockedLeaderboard.response.status, 403);
    assert.equal(blockedLeaderboard.body.code, "EMAIL_VERIFICATION_REQUIRED");

    const loggedIn = await isolatedRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier: "NO_MAIL_PILOT", password: "strong-pass-123" }),
    });
    assert.equal(loggedIn.response.status, 200);
    assert.equal(loggedIn.body.user.username, "no_mail_pilot");
  } finally {
    if (isolatedServer?.listening) await new Promise((resolve) => isolatedServer.close(resolve));
    await rm(isolatedDirectory, { recursive: true, force: true });
  }
});

test("manages sessions and supports password change and reset", async () => {
  const secondLogin = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "pilot@example.com", password: "strong-pass-123", deviceName: "测试手机" }),
  });
  assert.equal(secondLogin.response.status, 200);
  const secondToken = secondLogin.body.token;
  const sessions = await request("/api/account/sessions", { headers: { authorization: `Bearer ${token}` } });
  assert.equal(sessions.response.status, 200);
  assert.equal(sessions.body.sessions.length, 2);
  assert.equal(sessions.body.sessions.some((session) => session.deviceName === "测试手机" && !session.current), true);

  const secondSession = sessions.body.sessions.find((session) => session.deviceName === "测试手机");
  const revoked = await request("/api/account/sessions/revoke", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ sessionId: secondSession.id }),
  });
  assert.equal(revoked.response.status, 200);
  const revokedAccount = await request("/api/account", { headers: { authorization: `Bearer ${secondToken}` } });
  assert.equal(revokedAccount.response.status, 401);

  const wrongPassword = await request("/api/account/password", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ currentPassword: "wrong-password", newPassword: "changed-pass-456" }),
  });
  assert.equal(wrongPassword.response.status, 401);
  const changed = await request("/api/account/password", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ currentPassword: "strong-pass-123", newPassword: "changed-pass-456" }),
  });
  assert.equal(changed.response.status, 200);
  const oldLogin = await request("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "pilot@example.com", password: "strong-pass-123" }) });
  assert.equal(oldLogin.response.status, 401);

  const forgot = await request("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: "pilot@example.com" }) });
  assert.equal(forgot.response.status, 202);
  const resetMessage = [...mailbox].reverse().find((message) => message.kind === "reset" && message.email === "pilot@example.com");
  assert.ok(resetMessage?.actionToken);
  const previousToken = token;
  const reset = await request("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token: resetMessage.actionToken, password: "reset-pass-789", deviceName: "重置后的设备" }),
  });
  assert.equal(reset.response.status, 200);
  assert.ok(reset.body.token);
  token = reset.body.token;
  const previousSession = await request("/api/account", { headers: { authorization: `Bearer ${previousToken}` } });
  assert.equal(previousSession.response.status, 401);
});

test("binds and verifies email for legacy accounts and only resets verified addresses", async () => {
  const created = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username: "legacy_pilot", password: "legacy-pass-123", displayName: "旧账号工程师" }),
  });
  assert.equal(created.response.status, 201);
  const legacyToken = created.body.token;

  const resetCountBeforeBinding = mailbox.filter((message) => message.kind === "reset" && message.email === "bound@example.com").length;
  const bound = await request("/api/account/email", {
    method: "POST",
    headers: { authorization: `Bearer ${legacyToken}` },
    body: JSON.stringify({ email: "bound@example.com" }),
  });
  assert.equal(bound.response.status, 202);
  assert.equal(bound.body.user.email, "bound@example.com");
  assert.equal(bound.body.user.emailVerified, false);

  const unverifiedForgot = await request("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: "bound@example.com" }) });
  assert.equal(unverifiedForgot.response.status, 202);
  assert.equal(mailbox.filter((message) => message.kind === "reset" && message.email === "bound@example.com").length, resetCountBeforeBinding);

  const verification = [...mailbox].reverse().find((message) => message.kind === "verify" && message.email === "bound@example.com");
  assert.ok(verification?.actionToken);
  const verified = await request("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token: verification.actionToken }) });
  assert.equal(verified.body.user.emailVerified, true);
  const verifiedForgot = await request("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: "bound@example.com" }) });
  assert.equal(verifiedForgot.response.status, 202);
  assert.equal(mailbox.filter((message) => message.kind === "reset" && message.email === "bound@example.com").length, resetCountBeforeBinding + 1);
});

test("deduplicates anonymous players and reports total, daily and online counts", async () => {
  const invalid = await request("/api/presence", { method: "POST", body: JSON.stringify({ playerId: "short" }) });
  assert.equal(invalid.response.status, 400);

  const firstId = "player_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const secondId = "player_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const first = await request("/api/presence", { method: "POST", body: JSON.stringify({ playerId: firstId }) });
  const repeated = await request("/api/presence", { method: "POST", body: JSON.stringify({ playerId: firstId }) });
  const second = await request("/api/presence", { method: "POST", body: JSON.stringify({ playerId: secondId }) });
  assert.equal(first.response.status, 202);
  assert.equal(repeated.body.players.total, 1);
  assert.equal(second.body.players.total, 2);

  const status = await request("/api/public-status");
  const metrics = await request("/api/admin/metrics", { headers: { authorization: `Bearer ${adminToken}` } });
  const today = metricDay();
  assert.deepEqual(status.body.players, { total: 2, today: 2, online: 2, onlineWindowSeconds: 120 });
  assert.equal(metrics.body.daily.find((entry) => entry.day === today).players, 2);
  assert.equal(Object.keys(server.store.data.players).every((key) => /^[a-f0-9]{64}$/.test(key)), true);
  assert.equal(JSON.stringify(server.store.data.players).includes(firstId), false);

  const oversized = await request("/api/presence", {
    method: "POST",
    body: JSON.stringify({ playerId: firstId, padding: "x".repeat(8 * 1024 * 1024) }),
  });
  assert.equal(oversized.response.status, 413);
  for (let index = 0; index < 5; index += 1) {
    const accepted = await request("/api/presence", { method: "POST", body: JSON.stringify({ playerId: firstId }) });
    assert.equal(accepted.response.status, 202);
  }
  const limited = await request("/api/presence", { method: "POST", body: JSON.stringify({ playerId: firstId }) });
  assert.equal(limited.response.status, 429);
  assert.equal(limited.response.headers.get("retry-after"), "60");
});

test("persists player totals across a restart and expires stale online players", async () => {
  const restartDirectory = await mkdtemp(path.join(tmpdir(), "dsp-presence-"));
  const databaseFile = path.join(restartDirectory, "cloud.sqlite");
  let restartServer;
  try {
    restartServer = await createCloudServer({ databaseFile, playerOnlineWindowMs: 500, adminToken, logger: { error() {} } });
    await new Promise((resolve) => restartServer.listen(0, "127.0.0.1", resolve));
    let restartBaseUrl = `http://127.0.0.1:${restartServer.address().port}`;
    await fetch(`${restartBaseUrl}/api/presence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: "player_cccccccccccccccccccccccccccccccc" }),
    });
    await new Promise((resolve) => restartServer.close(resolve));

    restartServer = await createCloudServer({ databaseFile, playerOnlineWindowMs: 500, adminToken, logger: { error() {} } });
    await new Promise((resolve) => restartServer.listen(0, "127.0.0.1", resolve));
    restartBaseUrl = `http://127.0.0.1:${restartServer.address().port}`;
    const restored = await fetch(`${restartBaseUrl}/api/public-status`).then((response) => response.json());
    assert.equal(restored.players.total, 1);
    assert.equal(restored.players.online, 1);
    await new Promise((resolve) => setTimeout(resolve, 550));
    const expired = await fetch(`${restartBaseUrl}/api/public-status`).then((response) => response.json());
    assert.equal(expired.players.total, 1);
    assert.equal(expired.players.online, 0);
  } finally {
    if (restartServer?.listening) await new Promise((resolve) => restartServer.close(resolve));
    await rm(restartDirectory, { recursive: true, force: true });
  }
});

test("protects detailed metrics and aggregates privacy-safe visits and events", async () => {
  const publicStatus = await request("/api/public-status");
  assert.equal(publicStatus.response.status, 200);
  assert.equal("accounts" in publicStatus.body, false);
  const unauthorized = await request("/api/metrics");
  assert.equal(unauthorized.response.status, 401);

  const playerId = "player_dddddddddddddddddddddddddddddddd";
  const sessionId = "session_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  const batch = {
    playerId,
    sessionId,
    sequence: 1,
    activeSeconds: 24,
    client: "desktop-web",
    source: "direct",
    events: [
      { name: "page_view", count: 1 },
      { name: "game_enter", count: 1 },
      { name: "open_recipes", count: 2 },
      { name: "perf_load_lt_1500", count: 1 },
      { name: "perf_lcp_lt_2500", count: 1 },
      { name: "perf_transfer_lt_1mb", count: 1 },
    ],
  };
  const accepted = await request("/api/analytics", { method: "POST", body: JSON.stringify(batch) });
  const duplicate = await request("/api/analytics", { method: "POST", body: JSON.stringify(batch) });
  assert.equal(accepted.response.status, 202);
  assert.equal(duplicate.body.duplicate, true);
  const rejected = await request("/api/analytics", { method: "POST", body: JSON.stringify({ ...batch, sequence: 2, events: [{ name: "raw_click_text", count: 1 }] }) });
  assert.equal(rejected.response.status, 400);

  const metrics = await request("/api/admin/metrics?days=7", { headers: { authorization: `Bearer ${adminToken}` } });
  assert.equal(metrics.response.status, 200);
  assert.equal(metrics.body.timeZone, "Asia/Shanghai");
  assert.equal(metrics.body.analytics.range.pageViews, 1);
  assert.equal(metrics.body.analytics.range.gameStarts, 1);
  assert.equal(metrics.body.analytics.range.activeSeconds, 24);
  assert.equal(metrics.body.analytics.events.find((event) => event.name === "open_recipes").count, 2);
  assert.equal(metrics.body.analytics.performance.pageLoad.p75Band, "<1.5 秒");
  assert.equal(metrics.body.analytics.performance.lcp.samples, 1);
  assert.equal(metrics.body.analytics.performance.transfer.light, 1);
  assert.equal(metrics.body.backups.offsite.transported, true);
  assert.equal(metrics.body.backups.offsite.completedAt, 100);
  assert.equal(metrics.body.backups.restoreDrill.ok, true);
  assert.equal(metrics.body.infrastructure.endpoints[0].latencyMs, 12.5);
  assert.equal(metrics.body.infrastructure.disk.freeRatio, 0.8);
  assert.equal(metrics.body.audit.entries > 0, true);
  assert.equal(metrics.body.audit.recent.some((entry) => entry.action === "account.password_reset"), true);
  assert.equal(JSON.stringify(metrics.body.audit).includes("pilot@example.com"), false);
  assert.equal(JSON.stringify(server.store.data.analytics).includes(playerId), false);
  assert.equal(JSON.stringify(server.store.data.analytics).includes(sessionId), false);
});

test("migrates schema v3 data to v7 without losing accounts, saves or players", async () => {
  const migrationDirectory = await mkdtemp(path.join(tmpdir(), "dsp-schema-v3-"));
  const dataFile = path.join(migrationDirectory, "cloud.json");
  const playerHash = "a".repeat(64);
  const legacyPassword = "legacy-email-pass-123";
  const legacySalt = "00112233445566778899aabbccddeeff";
  const legacy = {
    schemaVersion: 3,
    users: { user_legacy: { id: "user_legacy", email: "legacy@example.com", displayName: "旧工程师", createdAt: 1, passwordSalt: legacySalt, passwordHash: scryptSync(legacyPassword, legacySalt, 64).toString("hex") } },
    sessions: {},
    cloudSaves: { user_legacy: { revision: 1, payload: cloudPayload, checksum: "checksum", size: cloudPayload.length, updatedAt: 2 } },
    cloudSaveHistory: {},
    submissions: {},
    players: { [playerHash]: { firstSeenAt: 1, lastSeenAt: 2, lastActiveDay: "2026-07-21" } },
    feedback: [],
    errors: [],
    dailyMetrics: { "2026-07-21": { requests: 3, errors: 0, feedback: 0, leaderboardSubmissions: 0, cloudUploads: 1, players: 1 } },
  };
  await writeFile(dataFile, JSON.stringify(legacy));
  let migrationServer;
  try {
    migrationServer = await createCloudServer({ dataFile, databaseFile: "", adminToken, logger: { error() {} } });
    await new Promise((resolve) => migrationServer.listen(0, "127.0.0.1", resolve));
    assert.equal(migrationServer.store.data.schemaVersion, 7);
    assert.equal(migrationServer.store.data.users.user_legacy.email, "legacy@example.com");
    assert.match(migrationServer.store.data.users.user_legacy.username, /^pilot_[a-f0-9]{12}$/);
    assert.equal(migrationServer.store.data.users.user_legacy.emailVerifiedAt, 1);
    assert.equal(migrationServer.store.data.users.user_legacy.passwordChangedAt, 1);
    assert.equal(migrationServer.store.data.cloudSaves.user_legacy.revision, 1);
    assert.deepEqual(migrationServer.store.data.cloudSaveSlots, {});
    assert.deepEqual(migrationServer.store.data.cloudSaveSlotHistory, {});
    assert.equal(migrationServer.store.data.players[playerHash].lastActiveDay, "2026-07-21");
    assert.deepEqual(migrationServer.store.data.analytics, { visitors: {}, sessions: {}, daily: {} });
    const migratedUsername = migrationServer.store.data.users.user_legacy.username;
    const migrationBaseUrl = `http://127.0.0.1:${migrationServer.address().port}`;
    const legacyLoginResponse = await fetch(`${migrationBaseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier: "LEGACY@example.com", password: legacyPassword }),
    });
    const legacyLogin = await legacyLoginResponse.json();
    assert.equal(legacyLoginResponse.status, 200);
    assert.equal(legacyLogin.user.username, migratedUsername);
    await migrationServer.store.persist();
    await new Promise((resolve) => migrationServer.close(resolve));

    migrationServer = await createCloudServer({ dataFile, databaseFile: "", adminToken, logger: { error() {} } });
    await new Promise((resolve) => migrationServer.listen(0, "127.0.0.1", resolve));
    assert.equal(migrationServer.store.data.schemaVersion, 7);
    assert.equal(migrationServer.store.data.users.user_legacy.username, migratedUsername);
    assert.equal(migrationServer.store.data.cloudSaveHistory.user_legacy.length, 1);
  } finally {
    if (migrationServer?.listening) await new Promise((resolve) => migrationServer.close(resolve));
    await rm(migrationDirectory, { recursive: true, force: true });
  }
});

test("stores revisioned cloud saves and detects conflicts", async () => {
  const saved = await request("/api/cloud-save", { method: "PUT", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ payload: cloudPayload, expectedRevision: 0 }) });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.body.cloudSave.revision, 1);
  assert.equal(saved.body.cloudSave.summary.stateVersion, 24);
  assert.equal(saved.body.cloudSave.summary.savedAt, 123456);
  assert.equal(saved.body.cloudSave.summary.completedTechCount, 0);
  assert.equal(saved.body.cloudSave.summary.stateChecksum, "client-state-checksum");
  const conflict = await request("/api/cloud-save", { method: "PUT", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ payload: cloudPayload, expectedRevision: 0 }) });
  assert.equal(conflict.response.status, 409);

  const secondPayload = cloudPayload.replace('"universe_matrix":10', '"universe_matrix":12');
  const second = await request("/api/cloud-save", { method: "PUT", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ payload: secondPayload, expectedRevision: 1 }) });
  assert.equal(second.body.cloudSave.revision, 2);
  const history = await request("/api/cloud-save/history", { headers: { authorization: `Bearer ${token}` } });
  assert.deepEqual(history.body.history.map((entry) => entry.revision), [2, 1]);
  const restored = await request("/api/cloud-save/restore", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ revision: 1, expectedRevision: 2 }) });
  assert.equal(restored.body.cloudSave.revision, 3);
  assert.equal(restored.body.cloudSave.restoredFromRevision, 1);
  const loaded = await request("/api/cloud-save", { headers: { authorization: `Bearer ${token}` } });
  assert.equal(loaded.body.cloudSave.payload, cloudPayload);

  const exported = await request("/api/account/export", { headers: { authorization: `Bearer ${token}` } });
  assert.equal(exported.response.status, 200);
  assert.equal(exported.body.user.email, "pilot@example.com");
  assert.equal(exported.body.cloudSave.revision, 3);
  assert.deepEqual(exported.body.cloudSaveHistory.map((entry) => entry.revision), [3, 2, 1]);
});

test("keeps main and three manual cloud slots revisioned independently", async () => {
  const slotOne = await request("/api/cloud-save?slot=1", { method: "PUT", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ payload: cloudPayload, expectedRevision: 0 }) });
  const slotTwo = await request("/api/cloud-save?slot=2", { method: "PUT", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ payload: cloudPayload.replace('"universe_matrix":10', '"universe_matrix":11'), expectedRevision: 0 }) });
  assert.equal(slotOne.body.cloudSave.slot, "1");
  assert.equal(slotOne.body.cloudSave.revision, 1);
  assert.equal(slotTwo.body.cloudSave.slot, "2");
  assert.equal(slotTwo.body.cloudSave.revision, 1);

  const slotOneSecond = await request("/api/cloud-save?slot=1", { method: "PUT", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ payload: cloudPayload.replace('"universe_matrix":10', '"universe_matrix":15'), expectedRevision: 1 }) });
  assert.equal(slotOneSecond.body.cloudSave.revision, 2);
  const slotOneConflict = await request("/api/cloud-save?slot=1", { method: "PUT", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ payload: cloudPayload, expectedRevision: 1 }) });
  assert.equal(slotOneConflict.response.status, 409);
  assert.equal(slotOneConflict.body.cloudSave.slot, "1");

  const account = await request("/api/account", { headers: { authorization: `Bearer ${token}` } });
  assert.equal(account.body.cloudSaves.main.revision, 3);
  assert.equal(account.body.cloudSaves["1"].revision, 2);
  assert.equal(account.body.cloudSaves["2"].revision, 1);
  assert.equal(account.body.cloudSaves["3"], null);
  const history = await request("/api/cloud-save/history?slot=1", { headers: { authorization: `Bearer ${token}` } });
  assert.deepEqual(history.body.history.map((entry) => entry.revision), [2, 1]);
  const main = await request("/api/cloud-save", { headers: { authorization: `Bearer ${token}` } });
  assert.equal(main.body.cloudSave.revision, 3);
  const invalid = await request("/api/cloud-save?slot=invalid", { headers: { authorization: `Bearer ${token}` } });
  assert.equal(invalid.response.status, 400);
});

test("validates v32 gameplay buffer limits before accepting cloud saves", async () => {
  const payloadFor = (productionBufferLimit, logisticsBufferLimit) => JSON.stringify({
    state: {
      version: 32,
      entities: [],
      settings: { productionBufferLimit, logisticsBufferLimit },
    },
  });
  for (const payload of [
    payloadFor(999, 1_000_000),
    payloadFor(1_000_000.5, 1_000_000),
    payloadFor(1_000_000, 100_000_001),
    JSON.stringify({ state: { version: 32, entities: [], settings: {} } }),
  ]) {
    const rejected = await request("/api/cloud-save?slot=3", { method: "PUT", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ payload, expectedRevision: 0 }) });
    assert.equal(rejected.response.status, 400);
  }
  const accepted = await request("/api/cloud-save?slot=3", { method: "PUT", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ payload: payloadFor(1_000, 100_000_000), expectedRevision: 0 }) });
  assert.equal(accepted.response.status, 200);
});

test("recalculates leaderboard score on the server", async () => {
  const rejected = await request("/api/leaderboard", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ seasonId: "season_01", metrics: { energyGeneratedMj: 1_000_000, uploadedWhiteMatrix: 1_000_000 } }),
  });
  assert.equal(rejected.response.status, 422);
  const submitted = await request("/api/leaderboard", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ seasonId: "season_01", metrics: { energyGeneratedMj: 1_000_000, uploadedWhiteMatrix: 10, galaxyScore: 999_999_999 } }),
  });
  assert.equal(submitted.response.status, 200);
  assert.equal(submitted.body.submission.metrics.galaxyScore, 121);
  const ranking = await request("/api/leaderboard?category=galaxy&seasonId=season_01");
  assert.equal(ranking.body.entries[0].verified, true);
});

test("deletes an account and all directly owned cloud data", async () => {
  const created = await request("/api/auth/register", { method: "POST", body: JSON.stringify({ username: "delete_pilot", password: "delete-pass-123", displayName: "待注销工程师" }) });
  assert.equal(created.response.status, 201);
  const deleteToken = created.body.token;
  const saved = await request("/api/cloud-save", { method: "PUT", headers: { authorization: `Bearer ${deleteToken}` }, body: JSON.stringify({ payload: cloudPayload, expectedRevision: 0 }) });
  assert.equal(saved.response.status, 200);
  const manualSaved = await request("/api/cloud-save?slot=1", { method: "PUT", headers: { authorization: `Bearer ${deleteToken}` }, body: JSON.stringify({ payload: cloudPayload, expectedRevision: 0 }) });
  assert.equal(manualSaved.response.status, 200);

  const rejected = await request("/api/account/delete", {
    method: "POST",
    headers: { authorization: `Bearer ${deleteToken}` },
    body: JSON.stringify({ password: "delete-pass-123", confirmation: "wrong" }),
  });
  assert.equal(rejected.response.status, 400);
  const deleted = await request("/api/account/delete", {
    method: "POST",
    headers: { authorization: `Bearer ${deleteToken}` },
    body: JSON.stringify({ password: "delete-pass-123", confirmation: "DELETE" }),
  });
  assert.equal(deleted.response.status, 200);
  assert.equal(Object.values(server.store.data.users).some((user) => user.username === "delete_pilot"), false);
  assert.equal(server.store.data.cloudSaves[created.body.user.id], undefined);
  assert.equal(server.store.data.cloudSaveSlots[created.body.user.id], undefined);
  const expired = await request("/api/account", { headers: { authorization: `Bearer ${deleteToken}` } });
  assert.equal(expired.response.status, 401);
});
