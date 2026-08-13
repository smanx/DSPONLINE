import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCOUNT_JSON_SCHEMAS,
  HttpSecurityError,
  accountArchiveBodyCapability,
  cloudSaveBodyCapability,
  createBodyCapability,
  createCorsPolicy,
  inspectHttpRequest,
  noBodyCapability,
  projectPublicDto,
  projectPublicError,
  projectPublicLeaderboard,
  projectPublicSpeedrunLeaderboard,
  securityResponseHeaders,
  validateJsonDto,
} from "./http-security.mjs";

const CLOUD_CONTRACT = Object.freeze({
  legacyJsonRequestLimitBytes: 68_157_440,
  requestCompressedLimitBytes: 33_554_432,
  directPayloadContentType: "application/vnd.dspidle.save+json",
  expectedRevisionHeader: "x-dsp-expected-revision",
  requestIdHeader: "x-dsp-request-id",
  originalBytesHeader: "x-dsp-save-original-bytes",
  compressedBytesHeader: "x-dsp-save-compressed-bytes",
});

const corsPolicy = createCorsPolicy({
  allowedOrigins: ["https://dsponline.cn", "https://localhost"],
  allowCredentials: true,
});

function request(method, headers = {}, extras = {}) {
  return { method, headers, ...extras };
}

function expectCode(operation, code, statusCode) {
  assert.throws(operation, (error) => {
    assert.ok(error instanceof HttpSecurityError);
    assert.equal(error.code, code);
    if (statusCode !== undefined) assert.equal(error.statusCode, statusCode);
    return true;
  });
}

test("allows configured Web and Android origins while keeping origin-less native requests compatible", () => {
  const web = inspectHttpRequest(request("GET", { origin: "https://dsponline.cn" }), {
    corsPolicy,
    bodyCapability: noBodyCapability(),
  });
  assert.equal(web.cors.headers["access-control-allow-origin"], "https://dsponline.cn");
  assert.equal(web.cors.headers["access-control-allow-credentials"], "true");
  assert.equal(web.cors.headers.vary, "Origin");

  const android = inspectHttpRequest(request("GET", { origin: "https://localhost" }), {
    corsPolicy,
    bodyCapability: noBodyCapability(),
  });
  assert.equal(android.cors.headers["access-control-allow-origin"], "https://localhost");

  const windows = inspectHttpRequest(request("GET"), { corsPolicy, bodyCapability: noBodyCapability() });
  assert.equal(windows.cors.origin, null);
  assert.deepEqual(windows.cors.headers, {});
});

test("never reflects unknown, null, malformed, comma-joined, or duplicated origins", () => {
  for (const origin of ["https://attacker.invalid", "null", "https://dsponline.cn, https://attacker.invalid", "https://dsponline.cn/path"]) {
    expectCode(
      () => inspectHttpRequest(request("GET", { origin }), { corsPolicy, bodyCapability: noBodyCapability() }),
      origin === "https://attacker.invalid" || origin === "null" || origin.includes(",") ? "CORS_ORIGIN_DENIED" : "CORS_ORIGIN_INVALID",
      403,
    );
  }
  expectCode(() => inspectHttpRequest(request("GET", {}, {
    rawHeaders: ["Origin", "https://dsponline.cn", "origin", "https://localhost"],
  }), { corsPolicy, bodyCapability: noBodyCapability() }), "REQUEST_HEADER_DUPLICATE");
  expectCode(() => inspectHttpRequest(request("GET", { origin: "https://dsponline.cn\r\nx-evil: yes" }), {
    corsPolicy,
    bodyCapability: noBodyCapability(),
  }), "REQUEST_HEADER_INVALID");
});

test("answers credentialed OPTIONS only for allowed methods and current request headers", () => {
  const inspected = inspectHttpRequest(request("OPTIONS", {
    origin: "https://localhost",
    "access-control-request-method": "DELETE",
    "access-control-request-headers": "authorization, content-type, x-dsp-expected-revision",
  }), { corsPolicy, bodyCapability: noBodyCapability() });
  assert.equal(inspected.preflight, true);
  assert.equal(inspected.cors.requestedMethod, "DELETE");
  assert.match(inspected.cors.headers["access-control-allow-methods"], /DELETE/);
  assert.match(inspected.cors.headers["access-control-allow-headers"], /x-dsp-expected-revision/);
  assert.equal(inspected.cors.headers["access-control-allow-credentials"], "true");
  assert.equal(
    inspected.cors.headers.vary,
    "Origin, Access-Control-Request-Method, Access-Control-Request-Headers",
  );

  expectCode(() => inspectHttpRequest(request("OPTIONS", {
    origin: "https://localhost",
    "access-control-request-method": "PATCH",
  }), { corsPolicy, bodyCapability: noBodyCapability() }), "CORS_METHOD_DENIED", 403);
  expectCode(() => inspectHttpRequest(request("OPTIONS", {
    origin: "https://localhost",
    "access-control-request-method": "PUT",
    "access-control-request-headers": "authorization, x-not-approved",
  }), { corsPolicy, bodyCapability: noBodyCapability() }), "CORS_HEADERS_DENIED", 403);
});

test("strictly parses legacy Bearer auth and every current cloud upload header", () => {
  const inspected = inspectHttpRequest(request("PUT", {
    authorization: "Bearer old_client-token_123",
    "content-type": "application/vnd.dspidle.save+json",
    "content-encoding": "gzip",
    "content-length": "1024",
    "x-dsp-expected-revision": "0",
    "x-dsp-request-id": "request_12345678",
    "x-dsp-save-original-bytes": "2048",
    "x-dsp-save-compressed-bytes": "1024",
  }), { bodyCapability: cloudSaveBodyCapability(CLOUD_CONTRACT) });
  assert.deepEqual(inspected.authorization, { scheme: "Bearer", credential: "old_client-token_123" });
  assert.equal(inspected.body.contentType.mediaType, "application/vnd.dspidle.save+json");
  assert.equal(inspected.body.contentEncoding, "gzip");
  assert.equal(inspected.body.contentLength, 1024);
  assert.equal(inspected.body.maximumBytes, CLOUD_CONTRACT.requestCompressedLimitBytes);
  assert.deepEqual(inspected.customHeaders, {
    "x-dsp-expected-revision": "0",
    "x-dsp-request-id": "request_12345678",
    "x-dsp-save-original-bytes": 2048,
    "x-dsp-save-compressed-bytes": 1024,
  });
});

test("rejects duplicate, CRLF, Unicode, unsupported auth, encoding, and DSP headers", () => {
  const bodyCapability = cloudSaveBodyCapability(CLOUD_CONTRACT);
  expectCode(() => inspectHttpRequest(request("PUT", {}, {
    rawHeaders: [
      "Content-Type", "application/json",
      "Authorization", "Bearer first-token",
      "authorization", "Bearer second-token",
    ],
  }), { bodyCapability }), "REQUEST_HEADER_DUPLICATE");
  for (const authorization of ["Basic abc", "Bearer token\r\nx-evil: yes", "Bearer 密钥"]) {
    expectCode(() => inspectHttpRequest(request("PUT", {
      authorization,
      "content-type": "application/json",
      "content-length": "1",
    }), { bodyCapability }), authorization.startsWith("Basic") ? "AUTHORIZATION_HEADER_INVALID" : "REQUEST_HEADER_INVALID");
  }
  expectCode(() => inspectHttpRequest(request("PUT", {
    "content-type": "application/json",
    "content-encoding": "gzip, identity",
    "content-length": "1",
  }), { bodyCapability }), "CONTENT_ENCODING_INVALID", 415);
  expectCode(() => inspectHttpRequest(request("PUT", {
    "content-type": "application/json",
    "content-length": "1",
    "x-dsp-future-protocol": "1",
  }), { bodyCapability }), "DSP_HEADER_UNSUPPORTED");
  expectCode(() => inspectHttpRequest(request("POST", {
    "content-type": "application/json",
    "content-length": "1",
    "x-dsp-expected-revision": "0",
  }), { bodyCapability: createBodyCapability() }), "DSP_HEADER_NOT_ALLOWED");
});

test("rejects invalid and overflowing Content-Length before a body is read", () => {
  const capability = createBodyCapability({ mediaTypeLimits: { "application/json": 16 * 1024 } });
  for (const value of ["-1", "+1", "01", "1e3", "9007199254740992"]) {
    expectCode(() => inspectHttpRequest(request("POST", {
      "content-type": "application/json",
      "content-length": value,
    }), { bodyCapability: capability }), "CONTENT_LENGTH_INVALID");
  }
  expectCode(() => inspectHttpRequest(request("POST", {
    "content-type": "application/json",
    "content-length": String(16 * 1024 + 1),
  }), { bodyCapability: capability }), "REQUEST_BODY_TOO_LARGE", 413);
  expectCode(() => inspectHttpRequest(request("GET", { "content-length": "1" }), {
    bodyCapability: noBodyCapability(),
  }), "REQUEST_BODY_NOT_ALLOWED", 413);
});

test("uses media-specific cloud limits without changing legacy JSON compatibility", () => {
  const capability = cloudSaveBodyCapability(CLOUD_CONTRACT);
  const legacy = inspectHttpRequest(request("PUT", {
    "content-type": "application/json; charset=UTF-8",
    "content-length": String(CLOUD_CONTRACT.requestCompressedLimitBytes + 1),
  }), { bodyCapability: capability });
  assert.equal(legacy.body.maximumBytes, CLOUD_CONTRACT.legacyJsonRequestLimitBytes);
  assert.deepEqual(legacy.body.contentType.parameters, { charset: "utf-8" });

  expectCode(() => inspectHttpRequest(request("PUT", {
    "content-type": CLOUD_CONTRACT.directPayloadContentType,
    "content-length": String(CLOUD_CONTRACT.requestCompressedLimitBytes + 1),
  }), { bodyCapability: capability }), "REQUEST_BODY_TOO_LARGE", 413);
  expectCode(() => inspectHttpRequest(request("PUT", {
    "content-type": "text/plain",
    "content-length": "10",
  }), { bodyCapability: capability }), "CONTENT_TYPE_NOT_ALLOWED", 415);
});

test("requires bounded identity-encoded account archives and validates both guard headers", () => {
  const capability = accountArchiveBodyCapability(1024 * 1024);
  const guard = "a".repeat(64);
  const inspected = inspectHttpRequest(request("POST", {
    authorization: "Bearer archive-token",
    "content-type": "application/vnd.dspidle.account-archive+zip",
    "content-length": "4096",
    "x-dsp-account-import-guard": guard,
    "x-dsp-account-import-confirmation": `REPLACE_CLOUD_SAVES:${guard}`,
  }), { bodyCapability: capability });
  assert.equal(inspected.body.maximumBytes, 1024 * 1024);
  assert.equal(inspected.customHeaders["x-dsp-account-import-guard"], guard);

  const compatibleCharset = inspectHttpRequest(request("POST", {
    "content-type": "application/vnd.dspidle.account-archive+zip; charset=binary",
    "content-length": "1",
  }), { bodyCapability: capability });
  assert.deepEqual(compatibleCharset.body.contentType.parameters, { charset: "binary" });

  expectCode(() => inspectHttpRequest(request("POST", {
    "content-type": "application/vnd.dspidle.account-archive+zip",
  }), { bodyCapability: capability }), "CONTENT_LENGTH_REQUIRED", 411);
  expectCode(() => inspectHttpRequest(request("POST", {
    "content-type": "application/vnd.dspidle.account-archive+zip",
    "content-encoding": "gzip",
    "content-length": "1",
  }), { bodyCapability: capability }), "CONTENT_ENCODING_NOT_ALLOWED", 415);
  expectCode(() => inspectHttpRequest(request("POST", {
    "content-type": "application/vnd.dspidle.account-archive+zip; charset=utf-8",
    "content-length": "1",
  }), { bodyCapability: capability }), "CONTENT_TYPE_PARAMETERS_UNSUPPORTED", 415);
  expectCode(() => inspectHttpRequest(request("POST", {
    "content-type": "application/vnd.dspidle.account-archive+zip",
    "content-length": "1",
    "x-dsp-account-import-guard": "a".repeat(64),
    "x-dsp-account-import-confirmation": `REPLACE_CLOUD_SAVES:${"b".repeat(64)}`,
  }), { bodyCapability: capability }), "DSP_IMPORT_CONFIRMATION_MISMATCH");
});

test("keeps GET compatibility with an empty application/json Content-Type", () => {
  const inspected = inspectHttpRequest(request("GET", {
    "content-type": "application/json",
  }), { bodyCapability: noBodyCapability() });
  assert.equal(inspected.body.contentType.mediaType, "application/json");
  assert.equal(inspected.body.contentLength, null);
});

test("builds one security-header baseline with explicit public/private cache policy", () => {
  const allowed = inspectHttpRequest(request("GET", { origin: "https://localhost" }), {
    corsPolicy,
    bodyCapability: noBodyCapability(),
  });
  const privateHeaders = securityResponseHeaders({ privacy: "private", cors: allowed.cors });
  assert.equal(privateHeaders["cache-control"], "private, no-store");
  assert.equal(privateHeaders["x-content-type-options"], "nosniff");
  assert.equal(privateHeaders["x-frame-options"], "DENY");
  assert.match(privateHeaders["content-security-policy"], /frame-ancestors 'none'/);
  assert.equal(privateHeaders["referrer-policy"], "no-referrer");
  assert.match(privateHeaders["permissions-policy"], /camera=\(\)/);
  assert.equal(privateHeaders["cross-origin-opener-policy"], "same-origin");
  assert.equal(privateHeaders["cross-origin-resource-policy"], "cross-origin");
  assert.equal(privateHeaders["access-control-allow-origin"], "https://localhost");

  const publicHeaders = securityResponseHeaders({ privacy: "public", secureTransport: true });
  assert.equal(publicHeaders["cache-control"], "public, max-age=0, must-revalidate");
  assert.equal(publicHeaders["cross-origin-resource-policy"], "same-site");
  assert.match(publicHeaders["strict-transport-security"], /includeSubDomains/);
  assert.equal(securityResponseHeaders({ privacy: "public", responseKind: "error" })["cache-control"], "private, no-store");
});

test("rejects malformed account JSON before an expensive credential callback can run", () => {
  let expensiveCredentialCalls = 0;
  const beforeCredentialWork = (body, schema) => {
    const validated = validateJsonDto(body, schema);
    expensiveCredentialCalls += 1;
    return validated;
  };

  const valid = beforeCredentialWork({
    username: "Pilot_01",
    password: "strong-pass-123",
    displayName: "测试工程师",
    deviceId: "device_fixture_aaaaaaaa",
  }, ACCOUNT_JSON_SCHEMAS.register);
  assert.equal(valid.username, "Pilot_01");
  assert.equal(expensiveCredentialCalls, 1);

  for (const body of [
    { username: "Pilot_02", password: 123, displayName: "玩家" },
    { username: "Pilot_03", password: "x".repeat(513), displayName: "玩家" },
    { username: "Pilot_04", password: "valid-pass", displayName: "玩家", unexpected: true },
    { username: "Pilot_05", password: "valid-pass", displayName: `坏${String.fromCharCode(0xd800)}` },
  ]) {
    assert.throws(() => beforeCredentialWork(body, ACCOUNT_JSON_SCHEMAS.register), HttpSecurityError);
  }
  assert.equal(expensiveCredentialCalls, 1, "credential work must run only after DTO validation succeeds");
});

test("bounds JSON depth, arrays, node count, cycles, prototypes, and accessor properties", () => {
  const recursiveSchema = { type: "object", fields: {} };
  recursiveSchema.fields.child = recursiveSchema;
  expectCode(() => validateJsonDto({ child: { child: { child: {} } } }, recursiveSchema, { maximumDepth: 2 }), "JSON_DEPTH_EXCEEDED");

  const arraySchema = {
    type: "object",
    required: ["events"],
    fields: { events: { type: "array", maximumItems: 2, items: { type: "string", maximumBytes: 8 } } },
  };
  expectCode(() => validateJsonDto({ events: ["a", "b", "c"] }, arraySchema), "JSON_ARRAY_LENGTH_INVALID");
  expectCode(() => validateJsonDto({ events: ["a", "b"] }, arraySchema, { maximumNodes: 2 }), "JSON_NODE_LIMIT_EXCEEDED");

  const cycle = { child: null };
  cycle.child = cycle;
  expectCode(() => validateJsonDto(cycle, recursiveSchema), "JSON_CYCLE_INVALID");
  expectCode(() => validateJsonDto(new Date(), { type: "object", fields: {} }), "JSON_OBJECT_INVALID");

  const getter = {};
  Object.defineProperty(getter, "password", { enumerable: true, get() { throw new Error("must not execute"); } });
  expectCode(() => validateJsonDto(getter, {
    type: "object",
    required: ["password"],
    fields: { password: { type: "string" } },
  }), "JSON_REQUIRED_FIELD_MISSING");
});

test("measures credential limits in UTF-8 bytes and normalizes safe Unicode", () => {
  const schema = {
    type: "object",
    required: ["value"],
    fields: { value: { type: "string", minimumBytes: 1, maximumBytes: 4 } },
  };
  assert.deepEqual(validateJsonDto({ value: "🚀" }, schema), { value: "🚀" });
  expectCode(() => validateJsonDto({ value: "🚀a" }, schema), "JSON_STRING_LENGTH_INVALID");
  assert.equal(validateJsonDto({ identifier: "e\u0301", password: "temporary" }, ACCOUNT_JSON_SCHEMAS.login).identifier, "é");
});

test("projects only explicit DTO fields and recursively refuses sensitive keys", () => {
  const source = {
    title: "玩家🚀\u202e正常",
    nested: {
      visible: "保留",
      token: "secret-token",
      email: "private@example.com",
      accountId: "user_private",
      latestRevision: 42,
      checksum: "a".repeat(64),
      payload: "save-body",
      absolutePath: "C:\\private\\save.json",
      ipAddress: "203.0.113.1",
    },
    ignored: "not allowlisted",
  };
  const schema = {
    type: "object",
    fields: {
      title: { type: "string", maximumBytes: 64 },
      nested: {
        type: "object",
        fields: {
          visible: { type: "string" },
          token: { type: "string" },
          email: { type: "string" },
          accountId: { type: "string" },
          latestRevision: { type: "number" },
          checksum: { type: "string" },
          payload: { type: "string" },
          absolutePath: { type: "string" },
          ipAddress: { type: "string" },
        },
      },
    },
  };
  const result = projectPublicDto(source, schema);
  assert.deepEqual(result, { title: "玩家🚀正常", nested: { visible: "保留" } });
  const serialized = JSON.stringify(result);
  for (const secret of ["secret-token", "private@example.com", "user_private", "save-body", "private", "203.0.113.1"]) {
    assert.equal(serialized.includes(secret), false);
  }
});

test("handles circular, accessor, proxy, non-finite, and oversized anomalous DTO values safely", () => {
  const circular = { label: "ok" };
  circular.self = circular;
  Object.defineProperty(circular, "danger", { enumerable: true, get() { throw new Error("getter ran"); } });
  const hostile = new Proxy({}, { ownKeys() { throw new Error("proxy trap ran"); } });
  const schema = {
    type: "object",
    fields: {
      label: { type: "string" },
      self: { type: "object", fields: { label: { type: "string" } } },
      danger: { type: "string" },
      value: { type: "number" },
    },
  };
  assert.deepEqual(projectPublicDto(circular, schema), { label: "ok" });
  assert.deepEqual(projectPublicDto(hostile, schema), {});
  assert.deepEqual(projectPublicDto({ value: Number.NaN }, schema), {});
  expectCode(() => projectPublicDto({ label: "x".repeat(100) }, schema, { maximumBytes: 10 }), "PUBLIC_DTO_TOO_LARGE", 500);
});

test("projects the public Top leaderboard through anonymous aliases without leaking account data", () => {
  const entries = Array.from({ length: 105 }, (_, index) => ({
    userId: `user_private_${index}`,
    accountId: `user_private_${index}`,
    displayName: `工程师 ${index}`,
    avatar: "工",
    seasonId: "season_01",
    metrics: {
      energyGeneratedMj: index,
      uploadedWhiteMatrix: index,
      peakWhiteMatrixPerMinute: index,
      peakGenerationKw: index,
      peakThroughputPerMinute: index,
      theoreticalPeakThroughputPerMinute: index,
      activePlanetThroughputPerMinute: index,
      galacticThroughputPerMinute: index,
      peakDysonPowerKw: index,
      exploredSystems: 1,
      colonizedPlanets: 1,
      galaxyScore: index,
      nominalThroughputMetricVersion: "galactic-nominal-v1",
      throughputMetricVersion: "settled-throughput-v2",
      throughputWindowSeconds: 60,
      payload: "nested-save",
    },
    submittedAt: 100 + index,
    value: index,
    verified: true,
    rank: index + 1,
    verification: { revision: 9, checksum: "a".repeat(64), payload: "save" },
    token: "bearer-secret",
    email: "private@example.com",
    internalPath: "/var/lib/private.sqlite",
    ipAddress: "203.0.113.5",
  }));
  const result = projectPublicLeaderboard({
    category: "galaxy",
    seasonId: "season_01",
    entries,
    generatedAt: 123,
    accountId: "top-level-private",
  }, { publicIdFor: (raw) => `public_${raw.replace("user_private_", "").padStart(16, "0")}` });
  assert.equal(result.entries.length, 100);
  assert.equal(result.entries[0].userId, "public_0000000000000000");
  assert.equal(result.entries[0].accountId, result.entries[0].userId);
  assert.equal(result.entries[0].publicId, result.entries[0].userId);
  assert.equal(result.entries[0].metrics.exploredSystems, 1);
  const serialized = JSON.stringify(result);
  for (const secret of ["user_private_", "bearer-secret", "private@example.com", "/var/lib", "203.0.113.5", "nested-save", "checksum", "revision", "verification"]) {
    assert.equal(serialized.includes(secret), false, `public Top list leaked ${secret}`);
  }
});

test("omits a leaderboard entry when no stable anonymous public ID is supplied", () => {
  const input = {
    entries: [{
      userId: "user_private",
      accountId: "user_private",
      displayName: "玩家",
      metrics: {},
      rank: 1,
    }],
  };
  assert.deepEqual(projectPublicLeaderboard(input).entries, []);
  assert.deepEqual(projectPublicLeaderboard(input, { publicIdFor: (raw) => raw }).entries, []);
});

test("projects speedrun display fields while removing factory and save identities", () => {
  const result = projectPublicSpeedrunLeaderboard({
    category: "speedrun-white-matrix-1m",
    targetId: "white_matrix_1m",
    seasonId: "season_01",
    rulesetVersion: "speedrun-v1",
    entries: [{
      submissionId: "submission_private",
      userId: "user_private_speedrun",
      accountId: "user_private_speedrun",
      displayName: "速通玩家",
      avatar: "速",
      targetId: "white_matrix_1m",
      seasonId: "season_01",
      rulesetVersion: "speedrun-v1",
      factoryId: "factory_private",
      elapsedSeconds: 822.75,
      completedAtSeconds: 822.75,
      completedAt: 1000,
      receivedAt: 1001,
      saveRevision: 8,
      saveHash: "b".repeat(64),
      verified: true,
      rank: 1,
    }],
  }, { publicIdFor: () => "public_speedrun_0001" });
  assert.equal(result.entries[0].userId, "public_speedrun_0001");
  assert.equal(result.entries[0].accountId, "public_speedrun_0001");
  assert.match(result.entries[0].submissionId, /^speedrun_season_01_white_matrix_1m_public_/);
  const serialized = JSON.stringify(result);
  for (const secret of ["user_private_speedrun", "submission_private", "factory_private", "saveRevision", "saveHash", "factoryId"]) {
    assert.equal(serialized.includes(secret), false);
  }
});

test("publishes only trusted error codes and static messages, never exception internals", () => {
  const arbitrary = Object.assign(new Error("token=secret email=private@example.com C:\\private\\save.json"), {
    code: "SQLITE_PRIVATE_FAILURE",
    statusCode: 500,
    payload: "save-body",
    accountId: "user_private",
  });
  const generic = projectPublicError(arbitrary, {
    defaultMessage: "服务暂时不可用",
    allowedCodes: ["SAFE_CODE"],
  });
  assert.deepEqual(generic, { statusCode: 500, body: { error: "服务暂时不可用" } });
  assert.equal(JSON.stringify(generic).includes("private"), false);

  const trusted = projectPublicError(new HttpSecurityError("REQUEST_BODY_TOO_LARGE", "请求内容超过当前接口允许上限", 413));
  assert.deepEqual(trusted, {
    statusCode: 413,
    body: { error: "请求内容超过当前接口允许上限", code: "REQUEST_BODY_TOO_LARGE" },
  });
});

test("does not execute hostile error getters and projects allowlisted public details only", () => {
  const hostile = {};
  Object.defineProperty(hostile, "message", { enumerable: true, get() { throw new Error("message getter ran"); } });
  Object.defineProperty(hostile, "code", { enumerable: true, get() { throw new Error("code getter ran"); } });
  assert.deepEqual(projectPublicError(hostile), { statusCode: 500, body: { error: "服务暂时不可用" } });

  const error = new HttpSecurityError("WINDOW_PENDING", "统计窗口尚未形成", 409);
  error.publicDetails = {
    observedSeconds: 59,
    remainingSeconds: 1,
    checksum: "a".repeat(64),
    accountId: "user_private",
  };
  const projected = projectPublicError(error, {
    detailsSchema: {
      type: "object",
      fields: {
        observedSeconds: { type: "number", minimum: 0 },
        remainingSeconds: { type: "number", minimum: 0 },
        checksum: { type: "string" },
        accountId: { type: "string" },
      },
    },
  });
  assert.deepEqual(projected.body.details, { observedSeconds: 59, remainingSeconds: 1 });
});
