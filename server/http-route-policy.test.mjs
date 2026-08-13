import assert from "node:assert/strict";
import test from "node:test";

import cloudTransferContract from "./cloud-transfer-contract.json" with { type: "json" };
import { HTTP_BODY_LIMITS, bodyCapabilityForRoute } from "./http-route-policy.mjs";

const options = {
  cloudTransferContract,
  maximumArchiveBytes: 1_000_000,
  maximumLegacyJsonBytes: 2_000_000,
};

test("assigns independent small limits to authentication, telemetry and ordinary JSON", () => {
  assert.equal(bodyCapabilityForRoute("POST", "/api/auth/login", options).mediaTypeLimits["application/json"], HTTP_BODY_LIMITS.auth);
  assert.equal(bodyCapabilityForRoute("POST", "/api/presence", options).mediaTypeLimits["application/json"], HTTP_BODY_LIMITS.presence);
  assert.equal(bodyCapabilityForRoute("POST", "/api/feedback", options).mediaTypeLimits["application/json"], HTTP_BODY_LIMITS.feedback);
  assert.equal(bodyCapabilityForRoute("DELETE", "/api/cloud-save", options).mediaTypeLimits["application/json"], HTTP_BODY_LIMITS.ordinary);
});

test("keeps cloud, ZIP archive and legacy JSON import capabilities distinct", () => {
  const cloud = bodyCapabilityForRoute("PUT", "/api/cloud-save", options);
  assert.equal(cloud.mediaTypeLimits[cloudTransferContract.directPayloadContentType], cloudTransferContract.requestCompressedLimitBytes);
  assert.equal(bodyCapabilityForRoute("POST", "/api/account/import/archive", options).mediaTypeLimits["application/vnd.dspidle.account-archive+zip"], 1_000_000);
  const legacy = bodyCapabilityForRoute("POST", "/api/account/import/legacy-json", options);
  assert.equal(legacy.mediaTypeLimits["application/vnd.dspidle.account-export+json"], 2_000_000);
  assert.equal(legacy.requireContentLength, true);
});

test("permits shipped Cookie and mode headers only on compatible route families", () => {
  const read = bodyCapabilityForRoute("GET", "/api/account", options);
  assert.deepEqual(read.allowedCustomHeaders, ["x-dsp-session-mode", "x-dsp-save-mode"]);
  const logout = bodyCapabilityForRoute("POST", "/api/auth/logout", options);
  assert.equal(logout.kind, "body");
  assert.equal(logout.allowEmpty, true);
  assert.deepEqual(logout.allowedCustomHeaders, ["x-dsp-session-mode", "x-dsp-csrf-token"]);
});
