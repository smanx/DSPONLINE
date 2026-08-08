import assert from "node:assert/strict";
import { test } from "node:test";
import {
  anonymousLoginContext,
  createLoginFailureGuard,
  leaderboardRevalidationRequired,
  normalizeAccountControls,
  normalizeAccountSecurity,
  recordSuccessfulLogin,
} from "./account-security.mjs";

test("stores only anonymous login hashes and flags a new device or region", () => {
  const request = { headers: { "user-agent": "Browser A", "x-country-code": "CN" } };
  const first = anonymousLoginContext(request, { deviceName: "Laptop", deviceId: "device_1234567890123456" });
  const data = { accountSecurity: {} };
  assert.deepEqual(recordSuccessfulLogin(data, "user_a", first, { now: 1 }), { newDevice: false, newRegion: false, message: null });
  const second = anonymousLoginContext({ headers: { "user-agent": "Browser B", "x-country-code": "HK" } }, { deviceName: "Phone", deviceId: "device_abcdefghijklmnop" });
  const notice = recordSuccessfulLogin(data, "user_a", second, { now: 2 });
  assert.equal(notice.newDevice, true);
  assert.equal(notice.newRegion, true);
  assert.match(notice.message, /新设备/);
  const serialized = JSON.stringify(data);
  assert.equal(serialized.includes("Browser"), false);
  assert.equal(serialized.includes("Laptop"), false);
  assert.equal(serialized.includes("CN"), false);
});

test("temporarily locks only the failing anonymous login tuple and clears on success", () => {
  let now = 1_000;
  const guard = createLoginFailureGuard(() => now, { maximumFailures: 3, windowMs: 1_000, lockMs: 2_000 });
  assert.equal(guard.fail("pilot", "network-a").locked, false);
  assert.equal(guard.fail("pilot", "network-a").locked, false);
  assert.equal(guard.fail("pilot", "network-a").locked, true);
  assert.equal(guard.check("pilot", "network-a").locked, true);
  assert.equal(guard.check("pilot", "network-b").locked, false);
  guard.success("pilot", "network-a");
  assert.equal(guard.check("pilot", "network-a").locked, false);
  now = 5_000;
  guard.cleanup();
  assert.equal(guard.metrics().activeLocks, 0);
});

test("normalizes internal controls without changing the public cloud schema", () => {
  const users = { user_a: { id: "user_a" } };
  const security = normalizeAccountSecurity({ user_a: { recentLogins: [{ deviceHash: "a".repeat(16), regionHash: "b".repeat(16), occurredAt: 10 }] } }, users);
  assert.equal(security.user_a.recentLogins.length, 1);
  const controls = normalizeAccountControls({ user_a: { source: "admin-test", createdAt: 1, loginDisabledUntil: 100, leaderboardResumeAfterRevision: 4 } }, users);
  assert.equal(leaderboardRevalidationRequired({ accountControls: controls }, "user_a", 4), true);
  assert.equal(leaderboardRevalidationRequired({ accountControls: controls }, "user_a", 5), false);
});
