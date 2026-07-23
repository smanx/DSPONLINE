import assert from "node:assert/strict";
import { test } from "node:test";
import {
  analyticsSummary,
  metricDay,
  normalizeAnalyticsState,
  recordAnalyticsBatch,
} from "./analytics.mjs";

const playerId = "player_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const sessionId = "session_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const shanghaiMidnight = Date.UTC(2026, 6, 21, 16, 5, 0);

test("uses the configured Shanghai calendar day", () => {
  assert.equal(metricDay(shanghaiMidnight, "Asia/Shanghai"), "2026-07-22");
  assert.equal(metricDay(shanghaiMidnight, "UTC"), "2026-07-21");
});

test("aggregates allowlisted analytics without retaining raw visitor identifiers", () => {
  const analytics = normalizeAnalyticsState(null);
  const accepted = recordAnalyticsBatch(analytics, {
    playerId,
    sessionId,
    sequence: 1,
    activeSeconds: 18,
    client: "mobile-web",
    source: "community",
    events: [{ name: "page_view", count: 1 }, { name: "game_enter", count: 1 }, { name: "open_technology", count: 2 }, { name: "mobile_nav_open", count: 3 }],
  }, { now: shanghaiMidnight });
  assert.deepEqual(accepted, { ok: true, duplicate: false, day: "2026-07-22" });
  const serialized = JSON.stringify(analytics);
  assert.equal(serialized.includes(playerId), false);
  assert.equal(serialized.includes(sessionId), false);
  const daily = analytics.daily["2026-07-22"];
  assert.equal(daily.uniqueVisitors, 1);
  assert.equal(daily.sessions, 1);
  assert.equal(daily.pageViews, 1);
  assert.equal(daily.gameStarts, 1);
  assert.equal(daily.activeSeconds, 18);
  assert.equal(daily.events.open_technology, 2);
  assert.equal(daily.events.mobile_nav_open, 3);
  assert.equal(daily.clients["mobile-web"], 1);
  assert.equal(daily.sources.community, 1);

  const duplicate = recordAnalyticsBatch(analytics, {
    playerId,
    sessionId,
    sequence: 1,
    activeSeconds: 18,
    events: [{ name: "page_view", count: 1 }],
  }, { now: shanghaiMidnight + 1_000 });
  assert.equal(duplicate.duplicate, true);
  assert.equal(analytics.daily["2026-07-22"].pageViews, 1);
});

test("rejects arbitrary event names and reports range summaries", () => {
  const analytics = normalizeAnalyticsState(null);
  const rejected = recordAnalyticsBatch(analytics, {
    playerId,
    sessionId,
    sequence: 1,
    events: [{ name: "raw_button_label", count: 1 }],
  }, { now: shanghaiMidnight });
  assert.equal(rejected.ok, false);

  recordAnalyticsBatch(analytics, {
    playerId,
    sessionId,
    sequence: 1,
    events: [
      { name: "page_view", count: 1 },
      { name: "new_game", count: 1 },
      { name: "perf_load_1500_3000", count: 3 },
      { name: "perf_load_3000_8000", count: 1 },
      { name: "perf_lcp_lt_2500", count: 3 },
      { name: "perf_lcp_gte_4000", count: 1 },
      { name: "perf_transfer_lt_1mb", count: 4 },
    ],
  }, { now: shanghaiMidnight });
  const summary = analyticsSummary(analytics, { now: shanghaiMidnight, days: 7 });
  assert.equal(summary.today, "2026-07-22");
  assert.equal(summary.totalVisitors, 1);
  assert.equal(summary.range.pageViews, 1);
  assert.deepEqual(summary.events.find((event) => event.name === "new_game"), { name: "new_game", count: 1 });
  assert.deepEqual(summary.performance.pageLoad, { fast: 0, acceptable: 3, slow: 1, verySlow: 0, samples: 4, p75Band: "1.5-3 秒" });
  assert.equal(summary.performance.lcp.p75Band, "<2.5 秒");
  assert.equal(summary.performance.transfer.p75Band, "<1 MB");
});
