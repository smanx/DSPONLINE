import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import Database from "better-sqlite3";
import {
  SqliteRuntimeStatePersistence,
  createRuntimeStatePersistencePlan,
  runtimeAppStateFingerprint,
} from "./runtime-state-persistence.mjs";

const COUNTS = [1, 150, 1_000, 10_000];
const DAY = "2026-08-13";

function playerHash(index) {
  return index.toString(16).padStart(64, "0");
}

function runtimeState(count) {
  const players = {};
  for (let index = 0; index < count; index += 1) {
    players[playerHash(index)] = {
      firstSeenAt: 1_700_000_000_000 + index,
      lastSeenAt: 1_700_000_000_000 + index,
      lastActiveDay: DAY,
    };
  }
  return {
    players,
    dailyMetrics: {
      [DAY]: { requests: 0, errors: 0, feedback: 0, leaderboardSubmissions: 0, cloudUploads: 0, players: count },
    },
    analytics: { visitors: {}, sessions: {}, daily: {} },
  };
}

function appState(state) {
  // The padding approximates unrelated account/cloud metadata that should not
  // be serialized for a heartbeat. It is identical for both measurements.
  return {
    schemaVersion: 7,
    users: {},
    cloudSaves: {},
    runtime: state,
    unrelatedMetadata: "x".repeat(2 * 1024 * 1024),
  };
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
}

function measure(iterations, callback) {
  const samples = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const startedAt = performance.now();
    callback(iteration);
    samples.push(performance.now() - startedAt);
  }
  return median(samples);
}

function benchmarkCount(count) {
  const baselineState = runtimeState(count);
  const fullState = appState(structuredClone(baselineState));
  const initialPayload = JSON.stringify(fullState);
  const fullDatabase = new Database(":memory:");
  const incrementalDatabase = new Database(":memory:");
  fullDatabase.exec("CREATE TABLE app_state (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)");
  incrementalDatabase.exec("CREATE TABLE app_state (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)");
  fullDatabase.prepare("INSERT INTO app_state VALUES (1, ?, 1)").run(initialPayload);
  incrementalDatabase.prepare("INSERT INTO app_state VALUES (1, ?, 1)").run(initialPayload);
  const incremental = new SqliteRuntimeStatePersistence(incrementalDatabase, { nowProvider: () => 1_800_000_000_000 });
  incremental.initialize(baselineState, {
    appStateUpdatedAt: 1,
    appStateFingerprint: runtimeAppStateFingerprint(initialPayload),
  });
  const writeAppState = fullDatabase.prepare("UPDATE app_state SET payload = ?, updated_at = ? WHERE id = 1");
  const iterations = count >= 10_000 ? 20 : count >= 1_000 ? 35 : 60;
  const targetHash = playerHash(count - 1);

  // Warm both prepared paths before recording medians.
  JSON.stringify(fullState);
  const warmBefore = structuredClone(baselineState);
  const warmAfter = structuredClone(warmBefore);
  warmAfter.players[targetHash].lastSeenAt += 1;
  warmAfter.dailyMetrics[DAY].requests += 1;
  incremental.commitPlan(createRuntimeStatePersistencePlan(warmBefore, warmAfter, {
    operation: "presence.touch",
    runtimeIndexEvents: [{ type: "presence", playerHash: targetHash }],
  }));

  const fullMedianMs = measure(iterations, (iteration) => {
    fullState.runtime.players[targetHash].lastSeenAt += 1;
    fullState.runtime.dailyMetrics[DAY].requests += 1;
    const payload = JSON.stringify(fullState);
    fullDatabase.transaction(() => writeAppState.run(payload, iteration + 2))();
  });

  let current = warmAfter;
  let incrementalBytes = 0;
  let scannedRecords = 0;
  const incrementalMedianMs = measure(iterations, () => {
    const previousPlayer = current.players[targetHash];
    const previousDay = current.dailyMetrics[DAY];
    // The incremental planner consumes explicit dirty projections; avoid
    // charging this persistence benchmark for cloning the 10k-player map.
    const beforeProjection = {
      players: { [targetHash]: previousPlayer },
      dailyMetrics: { [DAY]: previousDay },
      analytics: current.analytics,
    };
    const nextPlayer = { ...previousPlayer, lastSeenAt: previousPlayer.lastSeenAt + 1 };
    const nextDay = { ...previousDay, requests: previousDay.requests + 1 };
    const afterProjection = {
      players: { [targetHash]: nextPlayer },
      dailyMetrics: { [DAY]: nextDay },
      analytics: current.analytics,
    };
    const next = {
      ...current,
      players: current.players,
      dailyMetrics: current.dailyMetrics,
    };
    next.players[targetHash] = nextPlayer;
    next.dailyMetrics[DAY] = nextDay;
    const plan = createRuntimeStatePersistencePlan(beforeProjection, afterProjection, {
      operation: "presence.touch",
      runtimeIndexEvents: [{ type: "presence", playerHash: targetHash }],
      dirtyServiceDays: [DAY],
    });
    incrementalBytes += plan.upserts.reduce((sum, row) => sum + Buffer.byteLength(row.payload, "utf8"), 0);
    scannedRecords += plan.scannedRecords;
    incremental.commitPlan(plan);
    current = next;
  });

  const appStateAfter = incrementalDatabase.prepare("SELECT payload, updated_at AS updatedAt FROM app_state WHERE id = 1").get();
  assert.deepEqual(appStateAfter, { payload: initialPayload, updatedAt: 1 });
  assert.equal(incremental.readRuntimeState().players[targetHash].lastSeenAt, current.players[targetHash].lastSeenAt);
  assert.equal(scannedRecords, iterations * 2);
  const fullBytesPerWrite = Buffer.byteLength(JSON.stringify(fullState), "utf8");
  const incrementalBytesPerWrite = Math.round(incrementalBytes / iterations);
  assert.ok(incrementalBytesPerWrite < fullBytesPerWrite / 100, "incremental heartbeat should write less than 1% of full app_state bytes");

  fullDatabase.close();
  incrementalDatabase.close();
  return {
    accounts: count,
    iterations,
    fullAppStateBytesPerWrite: fullBytesPerWrite,
    incrementalPayloadBytesPerWrite: incrementalBytesPerWrite,
    fullRewriteMedianMs: Math.round(fullMedianMs * 1_000) / 1_000,
    incrementalMedianMs: Math.round(incrementalMedianMs * 1_000) / 1_000,
    measuredSpeedup: Math.round(fullMedianMs / Math.max(0.000_001, incrementalMedianMs) * 100) / 100,
    rowsScannedPerHeartbeat: scannedRecords / iterations,
  };
}

const results = COUNTS.map(benchmarkCount);
const versionDatabase = new Database(":memory:");
const sqliteVersion = versionDatabase.prepare("select sqlite_version() AS version").get().version;
versionDatabase.close();
console.log(JSON.stringify({
  benchmark: "runtime-state-persistence",
  environment: { node: process.version, sqlite: sqliteVersion },
  scope: "synthetic in-memory SQLite; persistence-path comparison only, not a production latency promise",
  results,
}, null, 2));
