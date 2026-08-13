import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { LeaderboardSnapshotIndex, PresenceIndex } from "./runtime-indexes.mjs";

const SIZES = Object.freeze([1, 150, 1_000, 10_000]);
const CATEGORY = "galaxy";
const SEASON = "season_01";
const NOW = Date.parse("2026-08-13T12:00:00+08:00");

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function measure(operation, iterations) {
  const samples = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const startedAt = performance.now();
    operation(iteration);
    samples.push(performance.now() - startedAt);
  }
  return Math.round(median(samples) * 1_000) / 1_000;
}

function playerFixture(count) {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => [
    `player_${String(index).padStart(5, "0")}`,
    {
      firstSeenAt: NOW - 86_400_000,
      lastSeenAt: NOW - index % 240 * 1_000,
      lastActiveDay: index % 11 === 0 ? "2026-08-12" : "2026-08-13",
    },
  ]));
}

function leaderboardFixture(count) {
  const data = { users: {}, submissions: {}, restricted: {} };
  for (let index = 0; index < count; index += 1) {
    const userId = `user_${String(index).padStart(5, "0")}`;
    data.users[userId] = { leaderboardVisible: true };
    data.submissions[`${SEASON}:${userId}`] = {
      userId,
      accountId: userId,
      displayName: `Synthetic ${index}`,
      seasonId: SEASON,
      visible: true,
      metrics: { galaxyScore: (index * 7_919) % Math.max(1, count) },
      verification: { cloudRevision: index + 1 },
    };
  }
  return data;
}

function legacyPresenceMetrics(players, now = NOW) {
  const records = Object.values(players);
  return {
    total: records.length,
    today: records.filter((record) => record.lastActiveDay === "2026-08-13").length,
    online: records.filter((record) => record.lastSeenAt >= now - 120_000).length,
  };
}

function legacyLeaderboard(data) {
  return Object.values(data.submissions)
    .filter((entry) => entry.seasonId === SEASON && entry.visible !== false &&
      data.users[entry.userId]?.leaderboardVisible !== false && data.restricted[entry.userId] !== true)
    .map((entry) => ({ ...entry, value: Number.isFinite(entry.metrics?.galaxyScore) ? entry.metrics.galaxyScore : 0 }))
    .sort((left, right) => right.value - left.value || left.userId.localeCompare(right.userId));
}

export function runRuntimeIndexesBenchmark({ log = console.log } = {}) {
  const rows = [];
  // Measurements demonstrate shape, not a release performance promise. Each
  // row uses only deterministic anonymous in-memory fixtures.
  for (const count of SIZES) {
    const players = playerFixture(count);
    const data = leaderboardFixture(count);
    const presence = new PresenceIndex({ onlineWindowMs: 120_000 });
    const presenceColdMs = measure(() => presence.rebuild(players, NOW), count >= 10_000 ? 3 : 7);
    const expectedPresence = legacyPresenceMetrics(players);
    assert.deepEqual(presence.metrics(NOW), { ...expectedPresence, onlineWindowSeconds: 120 });
    const presenceReadMs = measure(() => presence.metrics(NOW), count >= 10_000 ? 1_000 : 3_000);
    let heartbeatClock = NOW;
    const presenceHeartbeatMs = measure((iteration) => {
      heartbeatClock += 1;
      presence.heartbeat(`player_${String(iteration % count).padStart(5, "0")}`, heartbeatClock);
    }, count >= 10_000 ? 2_000 : 5_000);
    const legacyPresenceReadMs = measure(() => legacyPresenceMetrics(players), count >= 10_000 ? 40 : 200);

    const leaderboard = new LeaderboardSnapshotIndex({
      getAuthoritativeData: () => data,
      categories: [CATEGORY],
      normalizeMetrics: (metrics) => ({ galaxyScore: Number.isFinite(metrics?.galaxyScore) ? metrics.galaxyScore : 0 }),
      categoryValue: (metrics) => metrics.galaxyScore,
      isRestricted: (authority, userId) => authority.restricted[userId] === true,
    });
    const expectedLeaderboard = legacyLeaderboard(data);
    const leaderboardColdMs = measure(() => {
      leaderboard.rebuild();
      const snapshot = leaderboard.getSnapshot(CATEGORY, SEASON);
      assert.deepEqual(snapshot.entries.map((entry) => entry.userId), expectedLeaderboard.map((entry) => entry.userId));
    }, count >= 10_000 ? 3 : 7);
    const leaderboardReadMs = measure(() => leaderboard.getSnapshot(CATEGORY, SEASON), count >= 10_000 ? 5_000 : 10_000);
    const targetUser = `user_${String(count - 1).padStart(5, "0")}`;
    const leaderboardMeMs = measure(() => leaderboard.getUserRank(CATEGORY, SEASON, targetUser), count >= 10_000 ? 5_000 : 10_000);
    const legacyLeaderboardReadMs = measure(() => legacyLeaderboard(data), count >= 10_000 ? 20 : 100);
    const mutationUser = `user_${String(Math.floor(count / 2)).padStart(5, "0")}`;
    const invalidationRebuildMs = measure((iteration) => {
      data.submissions[`${SEASON}:${mutationUser}`].metrics.galaxyScore = count + iteration;
      leaderboard.markSubmissionChanged({ userId: mutationUser, seasonId: SEASON });
      leaderboard.getSnapshot(CATEGORY, SEASON);
    }, count >= 10_000 ? 3 : 7);

    const row = {
      accounts: count,
      presenceColdMs,
      presenceHeartbeatMs,
      presenceReadMs,
      legacyPresenceReadMs,
      leaderboardColdMs,
      leaderboardReadMs,
      leaderboardMeMs,
      legacyLeaderboardReadMs,
      invalidationRebuildMs,
      presenceReadSpeedup: legacyPresenceReadMs > 0 ? Math.round(legacyPresenceReadMs / Math.max(0.000001, presenceReadMs) * 100) / 100 : null,
      leaderboardReadSpeedup: legacyLeaderboardReadMs > 0 ? Math.round(legacyLeaderboardReadMs / Math.max(0.000001, leaderboardReadMs) * 100) / 100 : null,
    };
    rows.push(row);
    log(JSON.stringify(row));
  }
  return rows;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file:///${process.argv[1].replaceAll("\\", "/")}`))) {
  console.log("runtime-indexes synthetic benchmark (median milliseconds; anonymous deterministic fixtures)");
  runRuntimeIndexesBenchmark();
  console.log("complexity: presence heartbeat O(log n), steady read O(k log n) expired; leaderboard cache hit/me O(1), invalidation rebuild O(n log n)");
}
