import test from "node:test";
import assert from "node:assert/strict";
import { ACTIVITY_DURATION_MS, ACTIVITY_MATERIAL_IDS, getActivityPublicStatus, normalizeActivityConfig, simulatedActivityProgress } from "./activity.mjs";

const fixture = {
  id: "union-station-test",
  enabled: true,
  startsAt: "2026-08-01T00:00:00.000Z",
  endsAt: "2026-08-04T00:00:00.000Z",
  personalTargets: Object.fromEntries(ACTIVITY_MATERIAL_IDS.map((id) => [id, 1_000_000])),
  globalTargets: Object.fromEntries(ACTIVITY_MATERIAL_IDS.map((id) => [id, 1_000_000_000])),
};

test("activity stays disabled without an explicit valid configuration", () => {
  assert.equal(normalizeActivityConfig(null).enabled, false);
  assert.equal(normalizeActivityConfig({ ...fixture, enabled: false }).enabled, false);
  assert.equal(normalizeActivityConfig({ ...fixture, endsAt: "2026-08-03T00:00:00.000Z" }).enabled, false);
  assert.equal(normalizeActivityConfig({ ...fixture, globalTargets: { ...fixture.globalTargets, universe_matrix: 0 } }).enabled, false);
});

test("activity curve freezes after its simulation phase while participation stays open", () => {
  const config = normalizeActivityConfig(fixture);
  assert.equal(config.endsAtMs - config.startsAtMs, ACTIVITY_DURATION_MS);
  for (const itemId of ACTIVITY_MATERIAL_IDS) {
    let previous = 0;
    for (let index = 0; index <= 1000; index += 1) {
      const progress = simulatedActivityProgress(config.id, itemId, index / 1000);
      assert.ok(progress >= previous);
      previous = progress;
    }
    assert.ok(previous > 1);
  }
  const deadline = getActivityPublicStatus(config, config.endsAtMs);
  const later = getActivityPublicStatus(config, config.endsAtMs + ACTIVITY_DURATION_MS);
  assert.deepEqual(later.globalDelivered, deadline.globalDelivered);
  assert.equal(deadline.status, "active");
  assert.equal(later.status, "active");
  assert.equal(later.openEnded, true);
});

test("completion checkpoints reach every target before the activity ends", () => {
  const config = normalizeActivityConfig(fixture);
  const checkpoints = { universe_matrix: 0.82, solar_sail: 0.86, small_carrier_rocket: 0.90, antimatter_fuel_rod: 0.94 };
  for (const itemId of ACTIVITY_MATERIAL_IDS) {
    const status = getActivityPublicStatus(config, config.startsAtMs + ACTIVITY_DURATION_MS * checkpoints[itemId]);
    assert.ok(status.globalDelivered[itemId] >= fixture.globalTargets[itemId]);
  }
});

test("the first public event accepts one-billion targets for all four materials", () => {
  const config = normalizeActivityConfig(fixture);
  assert.equal(config.enabled, true);
  assert.deepEqual(config.globalTargets, Object.fromEntries(ACTIVITY_MATERIAL_IDS.map((id) => [id, 1_000_000_000])));
});
