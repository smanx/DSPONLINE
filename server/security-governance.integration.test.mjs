import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createCloudServer } from "./index.mjs";
import { computeSaveStateChecksum } from "./save-integrity.mjs";

async function withServer(callback) {
  const directory = await mkdtemp(path.join(tmpdir(), "dsp-security-governance-"));
  const adminToken = "integration-admin-token-1234567890";
  const server = await createCloudServer({
    databaseFile: path.join(directory, "cloud.sqlite"),
    adminToken,
    registrationLimit: 100,
    mailer: null,
    historyPruneIntervalMs: 0,
    logger: { error() {} },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const request = async (route, options = {}) => {
    const response = await fetch(`${baseUrl}${route}`, {
      ...options,
      headers: { "content-type": "application/json", ...(options.headers ?? {}) },
    });
    return { response, body: await response.json() };
  };
  try {
    await callback({ request, adminToken });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
}

test("surfaces anonymous new-device events and supports audited administrator controls", async () => {
  await withServer(async ({ request, adminToken }) => {
    const registered = await request("/api/auth/register", {
      method: "POST",
      headers: { "x-country-code": "CN", "user-agent": "fixture-browser-a" },
      body: JSON.stringify({ username: "security_pilot", password: "strong-pass-123", displayName: "安全测试", deviceId: "device_fixture_aaaaaaaa" }),
    });
    assert.equal(registered.response.status, 201);
    const accountId = registered.body.user.id;
    const firstToken = registered.body.token;

    const login = await request("/api/auth/login", {
      method: "POST",
      headers: { "x-country-code": "SG", "user-agent": "fixture-browser-b" },
      body: JSON.stringify({ identifier: "security_pilot", password: "strong-pass-123", deviceId: "device_fixture_bbbbbbbb" }),
    });
    assert.equal(login.response.status, 200);
    assert.equal(login.body.security.newDevice, true);
    assert.equal(login.body.security.newRegion, true);
    assert.match(login.body.security.message, /新设备/);

    const events = await request("/api/account/security-events", { headers: { authorization: `Bearer ${login.body.token}` } });
    assert.equal(events.response.status, 200);
    assert.equal(events.body.events.length, 2);
    for (const event of events.body.events) {
      assert.match(event.deviceHash, /^[a-f0-9]{16}$/);
      assert.match(event.regionHash, /^[a-f0-9]{16}$/);
      assert.equal(JSON.stringify(event).includes("fixture-browser"), false);
      assert.equal(JSON.stringify(event).includes("CN"), false);
    }

    const adminHeaders = { authorization: `Bearer ${adminToken}` };
    const account = await request(`/api/admin/account?accountId=${encodeURIComponent(accountId)}`, { headers: adminHeaders });
    assert.equal(account.response.status, 200);
    assert.equal(account.body.account.sessionCount, 2);
    assert.equal(Object.hasOwn(account.body.account, "passwordHash"), false);

    const rejected = await request("/api/admin/account/action", {
      method: "POST", headers: adminHeaders,
      body: JSON.stringify({ accountId, action: "disable-login", confirmation: "wrong" }),
    });
    assert.equal(rejected.response.status, 400);
    const disabled = await request("/api/admin/account/action", {
      method: "POST", headers: adminHeaders,
      body: JSON.stringify({ accountId, action: "disable-login", confirmation: `CONFIRM:disable-login:${accountId}`, durationSeconds: 60 }),
    });
    assert.equal(disabled.response.status, 200);
    assert.ok(disabled.body.account.loginDisabledUntil > Date.now());
    const blocked = await request("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: "security_pilot", password: "strong-pass-123", deviceId: "device_fixture_bbbbbbbb" }) });
    assert.equal(blocked.response.status, 423);
    const enabled = await request("/api/admin/account/action", {
      method: "POST", headers: adminHeaders,
      body: JSON.stringify({ accountId, action: "enable-login", confirmation: `CONFIRM:enable-login:${accountId}` }),
    });
    assert.equal(enabled.response.status, 200);

    const restricted = await request("/api/admin/account/action", {
      method: "POST", headers: adminHeaders,
      body: JSON.stringify({ accountId, action: "restrict-leaderboard", confirmation: `CONFIRM:restrict-leaderboard:${accountId}` }),
    });
    assert.equal(restricted.body.account.leaderboardRestricted, true);
    const restored = await request("/api/admin/account/action", {
      method: "POST", headers: adminHeaders,
      body: JSON.stringify({ accountId, action: "restore-leaderboard", confirmation: `CONFIRM:restore-leaderboard:${accountId}` }),
    });
    assert.equal(restored.body.account.leaderboardRestricted, false);

    const revoked = await request("/api/admin/account/action", {
      method: "POST", headers: adminHeaders,
      body: JSON.stringify({ accountId, action: "revoke-sessions", confirmation: `CONFIRM:revoke-sessions:${accountId}` }),
    });
    assert.equal(revoked.body.account.sessionCount, 0);
    const staleSession = await request("/api/account", { headers: { authorization: `Bearer ${firstToken}` } });
    assert.equal(staleSession.response.status, 401);
  });
});

test("exposes SQLite growth metrics and requires an exact prune preview confirmation", async () => {
  await withServer(async ({ request, adminToken }) => {
    const headers = { authorization: `Bearer ${adminToken}` };
    const metrics = await request("/api/admin/metrics?days=7", { headers });
    assert.equal(metrics.response.status, 200);
    assert.equal(metrics.body.governance.sqlite.layoutVersion, 2);
    assert.equal(typeof metrics.body.governance.sqlite.appStateBytes, "number");
    assert.equal(typeof metrics.body.runtime.writeQueueDepth, "number");
    assert.equal(metrics.body.backups.state, "disabled");

    const preview = await request("/api/admin/cloud-history/prune-preview", { headers });
    assert.equal(preview.response.status, 200);
    assert.match(preview.body.preview.previewId, /^[a-f0-9]{64}$/);
    const rejected = await request("/api/admin/cloud-history/prune", {
      method: "POST", headers,
      body: JSON.stringify({ previewId: preview.body.preview.previewId, confirmation: "wrong" }),
    });
    assert.equal(rejected.response.status, 400);
    const applied = await request("/api/admin/cloud-history/prune", {
      method: "POST", headers,
      body: JSON.stringify({ previewId: preview.body.preview.previewId, confirmation: preview.body.preview.confirmation }),
    });
    assert.equal(applied.response.status, 200);
    assert.equal(applied.body.result.deletionCount, 0);
  });
});

test("warns at eighty-percent disk use and protects cloud writes at ninety percent", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dsp-disk-protection-"));
  const healthFile = path.join(directory, "node-health.json");
  await writeFile(healthFile, JSON.stringify({ ok: false, checkedAt: Date.now(), failedChecks: ["disk"], endpoints: [], disk: { ok: false, freeBytes: 9, totalBytes: 100, freeRatio: 0.09 }, tls: null }));
  const adminToken = "disk-admin-token-1234567890-abcdef";
  const server = await createCloudServer({ databaseFile: path.join(directory, "cloud.sqlite"), nodeHealthStatusFile: healthFile, adminToken, registrationLimit: 100, logger: { error() {} } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const request = async (route, options = {}) => {
    const response = await fetch(`${baseUrl}${route}`, { ...options, headers: { "content-type": "application/json", ...(options.headers ?? {}) } });
    return { response, body: await response.json() };
  };
  try {
    const metrics = await request("/api/admin/metrics", { headers: { authorization: `Bearer ${adminToken}` } });
    assert.equal(metrics.body.governance.disk.warning80Percent, true);
    assert.equal(metrics.body.governance.disk.protection90Percent, true);
    const registered = await request("/api/auth/register", { method: "POST", body: JSON.stringify({ username: "disk_pilot", password: "strong-pass-123", displayName: "磁盘测试" }) });
    const state = { version: 24, elapsedSeconds: 1, entities: [], totalProduced: {}, metrics: {}, exploration: { unlockedSystemIds: ["helios"], colonizedPlanetIds: ["home"] } };
    const payload = JSON.stringify({ formatVersion: 2, savedAt: Date.now(), state, checksum: computeSaveStateChecksum(2, state) });
    const upload = await request("/api/cloud-save", { method: "PUT", headers: { authorization: `Bearer ${registered.body.token}` }, body: JSON.stringify({ payload, expectedRevision: 0 }) });
    assert.equal(upload.response.status, 507);
    assert.equal(upload.body.code, "STORAGE_PROTECTION_ACTIVE");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
