import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createCloudServer } from "./index.mjs";
import { computeSaveStateChecksum } from "./save-integrity.mjs";

async function withServer(operation) {
  const directory = await mkdtemp(path.join(tmpdir(), "dsp-http-security-"));
  const server = await createCloudServer({
    databaseFile: path.join(directory, "cloud.sqlite"),
    allowedOrigin: "https://dsponline.cn,https://localhost",
    registrationLimit: 100,
    logger: { error() {} },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await operation({ server, base }); } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
}

test("real routes enforce CORS methods/headers and security headers across success, error and OPTIONS", async () => {
  await withServer(async ({ base }) => {
    const preflight = await fetch(`${base}/api/cloud-save`, {
      method: "OPTIONS",
      headers: {
        origin: "https://localhost",
        "access-control-request-method": "DELETE",
        "access-control-request-headers": "authorization, content-type, x-dsp-session-mode, x-dsp-csrf-token",
      },
    });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get("access-control-allow-methods") ?? "", /DELETE/);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "https://localhost");
    assert.match(preflight.headers.get("vary") ?? "", /Origin/);
    const denied = await fetch(`${base}/api/health`, { headers: { origin: "https://attacker.invalid" } });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
    const native = await fetch(`${base}/api/health`);
    assert.equal(native.status, 200);
    for (const name of ["content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy"]) {
      assert.ok(native.headers.get(name), `missing ${name}`);
      assert.ok(denied.headers.get(name), `error missing ${name}`);
    }
  });
});

test("route-specific limits and DTO validation reject work before account creation or scrypt-visible state", async () => {
  await withServer(async ({ server, base }) => {
    const beforeUsers = Object.keys(server.store.data.users).length;
    const oversized = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "BoundedPilot", password: "x".repeat(9_000), displayName: "边界账号" }),
    });
    assert.equal(oversized.status, 413);
    assert.equal(Object.keys(server.store.data.users).length, beforeUsers);
    const unknown = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "UnknownPilot", password: "valid-pass-123", displayName: "边界账号", role: "admin" }),
    });
    assert.equal(unknown.status, 400);
    assert.equal((await unknown.json()).code, "JSON_UNKNOWN_FIELD");
    assert.equal(Object.keys(server.store.data.users).length, beforeUsers);
  });
});

test("feedback diagnostics are allowlisted and sensitive values are redacted in persisted records", async () => {
  await withServer(async ({ server, base }) => {
    const secret = `Bearer ${"s".repeat(48)}`;
    const accountId = "user_private_identifier_123456";
    const digest = "a".repeat(64);
    const accepted = await fetch(`${base}/api/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "bug",
        message: `问题 ${secret} private@example.com ${accountId} ${digest}`,
        diagnostics: {
          application: { name: "DSP极简网络", version: "1.0.40", build: "synthetic", url: "https://example.invalid/private" },
          recentErrors: [{ kind: "error", message: `${secret} C:\\Users\\Pilot\\save.json ${accountId}` }],
          payload: "must-never-persist",
          token: secret,
        },
      }),
    });
    assert.equal(accepted.status, 202, await accepted.text());
    const persisted = JSON.stringify(server.store.data.feedback.at(-1));
    for (const value of [secret, "private@example.com", accountId, digest, "must-never-persist", "Users\\Pilot"]) {
      assert.equal(persisted.includes(value), false, `leaked ${value}`);
    }
    assert.match(persisted, /REDACTED/);
  });
});

test("public galaxy and speedrun endpoints expose stable aliases but no account, save or factory identities", async () => {
  await withServer(async ({ server, base }) => {
    const registeredResponse = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "PrivacyPilot", password: "privacy-pass-123", displayName: "隐私测试员" }),
    });
    const registered = await registeredResponse.json();
    const userId = registered.user.id;
    const headers = { authorization: `Bearer ${registered.token}`, "content-type": "application/json" };
    const state = {
      version: 24,
      mode: "normal",
      elapsedSeconds: 100,
      entities: [],
      totalProduced: { universe_matrix: 1 },
      metrics: { generationKw: 1_000, totalItemsPerMinute: 1, rayGenerationKw: 0 },
      exploration: { unlockedSystemIds: ["helios"], colonizedPlanetIds: ["home"] },
    };
    const envelope = { formatVersion: 2, savedAt: 100, mode: "normal", state };
    const payload = JSON.stringify({ ...envelope, checksum: computeSaveStateChecksum(2, state) });
    const uploaded = await fetch(`${base}/api/cloud-save`, {
      method: "PUT", headers, body: JSON.stringify({ payload, expectedRevision: 0 }),
    });
    assert.equal(uploaded.status, 200);
    const publicRanking = await (await fetch(`${base}/api/leaderboard?category=galaxy&seasonId=season_01`)).json();
    const publicEntry = publicRanking.entries.find((entry) => entry.displayName === "隐私测试员");
    assert.equal(publicEntry.userId, registered.user.leaderboardPublicId);
    assert.notEqual(publicEntry.userId, userId);
    const serialized = JSON.stringify(publicEntry);
    for (const privateValue of [userId, "verification", "saveRevision", "checksum", "payload"]) {
      assert.equal(serialized.includes(privateValue), false, `public ranking leaked ${privateValue}`);
    }
    const me = await (await fetch(`${base}/api/leaderboard/me?category=galaxy&seasonId=season_01`, { headers })).json();
    assert.equal(me.entry.userId, registered.user.leaderboardPublicId);
    assert.notEqual(me.entry.userId, userId);

    server.store.data.speedrunSubmissions.synthetic_private = {
      submissionId: "submission_private_identity",
      userId,
      displayName: "隐私测试员",
      avatar: "隐",
      targetId: "dyson_rockets_10000",
      seasonId: "season_01",
      rulesetVersion: "speedrun-v1",
      factoryId: "factory_private_identity",
      elapsedSeconds: 42,
      completedAtSeconds: 42,
      completedAt: 100,
      receivedAt: 100,
      saveRevision: 1,
      saveHash: "a".repeat(64),
      verified: true,
    };
    const speedrun = await (await fetch(`${base}/api/speedrun/leaderboard?targetId=dyson_rockets_10000&seasonId=season_01`)).json();
    assert.equal(speedrun.entries[0].userId, registered.user.speedrunPublicId);
    const speedrunSerialized = JSON.stringify(speedrun.entries[0]);
    for (const privateValue of [userId, "factory_private_identity", "submission_private_identity", "saveRevision", "saveHash"]) {
      assert.equal(speedrunSerialized.includes(privateValue), false, `speedrun ranking leaked ${privateValue}`);
    }
  });
});
