import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import { createCloudServer } from "./index.mjs";

async function start(databaseFile, options = {}) {
  const server = await createCloudServer({ databaseFile, registrationLimit: 100, logger: { error() {} }, ...options });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (route, init = {}) => {
    const response = await fetch(`${base}${route}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
    return { response, body: await response.json() };
  };
  return { server, call };
}

async function stop(server) {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
}

function appStateRow(databaseFile) {
  const database = new Database(databaseFile, { readonly: true });
  try { return database.prepare("SELECT payload, updated_at AS updatedAt FROM app_state WHERE id = 1").get(); }
  finally { database.close(); }
}

test("real presence and analytics writes leave app_state unchanged yet survive restart", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dsp-runtime-delta-http-"));
  const databaseFile = path.join(directory, "cloud.sqlite");
  let running;
  try {
    running = await start(databaseFile);
    const before = appStateRow(databaseFile);
    const playerId = "runtime_delta_player_0000000000000000";
    const presence = await running.call("/api/presence", {
      method: "POST",
      body: JSON.stringify({ playerId }),
    });
    assert.equal(presence.response.status, 202);
    const analytics = await running.call("/api/analytics", {
      method: "POST",
      body: JSON.stringify({
        playerId: "player_runtime_delta_000000000000000000",
        sessionId: "session_runtime_delta_000000000000000000",
        sequence: 1,
        client: "desktop-web",
        source: "direct",
        events: [{ name: "page_view", count: 1 }],
      }),
    });
    assert.equal(analytics.response.status, 202, JSON.stringify(analytics.body));
    assert.deepEqual(appStateRow(databaseFile), before, "high-frequency writes must not rewrite the full app_state blob");
    const diagnostics = running.server.store.runtimeStatePersistence.diagnostics({ includeRowCounts: true });
    assert.ok(diagnostics.commits >= 2);
    assert.equal(diagnostics.rows.player, 1);
    await stop(running.server);
    running = await start(databaseFile);
    assert.equal(Object.keys(running.server.store.data.players).length, 1);
    assert.equal(Object.keys(running.server.store.data.analytics.visitors).length, 1);
    assert.equal(Object.keys(running.server.store.data.analytics.sessions).length, 1);
  } finally {
    await stop(running?.server);
    await rm(directory, { recursive: true, force: true });
  }
});

test("an ordinary account mutation reconciles runtime rows and advances the rollback guard atomically", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dsp-runtime-reconcile-http-"));
  const databaseFile = path.join(directory, "cloud.sqlite");
  let running;
  try {
    running = await start(databaseFile);
    const playerId = "runtime_reconcile_player_00000000000000";
    assert.equal((await running.call("/api/presence", { method: "POST", body: JSON.stringify({ playerId }) })).response.status, 202);
    const beforeAccount = appStateRow(databaseFile);
    const registered = await running.call("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: "RuntimeReconcile", password: "runtime-pass-123", displayName: "增量回退测试" }),
    });
    assert.equal(registered.response.status, 201);
    const afterAccount = appStateRow(databaseFile);
    assert.notEqual(afterAccount.payload, beforeAccount.payload);
    await stop(running.server);
    running = await start(databaseFile);
    assert.equal(Object.keys(running.server.store.data.players).length, 1);
    assert.ok(running.server.store.data.users[registered.body.user.id]);
  } finally {
    await stop(running?.server);
    await rm(directory, { recursive: true, force: true });
  }
});

test("runtime delta fault rolls back every side row and does not publish the heartbeat", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dsp-runtime-delta-fault-"));
  const databaseFile = path.join(directory, "cloud.sqlite");
  let fail = false;
  let running;
  try {
    running = await start(databaseFile, {
      persistenceFaultInjector({ phase, operation }) {
        if (fail && phase === "after-runtime-upserts" && operation === "presence.update") {
          const error = new Error("synthetic runtime delta failure");
          error.code = "SQLITE_IOERR_TEST";
          throw error;
        }
      },
    });
    const before = appStateRow(databaseFile);
    fail = true;
    const failed = await running.call("/api/presence", {
      method: "POST",
      body: JSON.stringify({ playerId: "runtime_fault_player_000000000000000000" }),
    });
    assert.equal(failed.response.status, 500);
    assert.deepEqual(appStateRow(databaseFile), before);
    assert.equal(Object.keys(running.server.store.data.players).length, 0);
    await stop(running.server);
    running = await start(databaseFile);
    assert.equal(Object.keys(running.server.store.data.players).length, 0);
  } finally {
    await stop(running?.server);
    await rm(directory, { recursive: true, force: true });
  }
});
