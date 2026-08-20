import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import http from "node:http";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

import { readAccountArchiveZip } from "./account-archive.mjs";
import { createCloudServer } from "./index.mjs";
import { computeSaveStateChecksum } from "./save-integrity.mjs";

const TEST_PASSWORD = "synthetic-pass-123";
const ARCHIVE_CONTENT_TYPE = "application/vnd.dspidle.account-archive+zip";
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_EOCD_SIGNATURE = 0x06054b50;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function createV46State(mode = "normal", sequence = 1, paddingBytes = 0) {
  return {
    version: 46,
    mode,
    elapsedSeconds: 600 + sequence,
    entities: [{ id: "storage", kind: "storage", buildingId: "storage_mk1" }],
    belts: [{ id: "belt", source: "storage", target: "storage", itemId: "iron_ore" }],
    settings: {
      productionBufferLimit: 1_000_000,
      logisticsBufferLimit: 1_000_000,
      beltBufferLimit: 100_000_000,
      proliferatorBufferLimit: 600,
    },
    contentPacks: [],
    galaxy: { planetMetadata: {}, systemMetadata: {} },
    quantumLogisticsNetwork: {
      enabled: false,
      inventory: {},
      routingCursors: {},
      itemCapacities: {},
      uploadRoutingCursors: {},
    },
    constructionAutomation: { destroyedByproducts: {} },
    blueprints: [],
    blueprintVersions: [],
    constructionQueue: [],
    dysonPlans: {},
    timeWarp: {
      controllerEntityId: null,
      enabled: false,
      requestedMultiplier: 5,
      effectiveMultiplier: 1,
      pendingSimulationSeconds: 0,
      pendingWallSeconds: 0,
      requiredPowerKw: 0,
      allocatedPowerKw: 0,
    },
    endgame: {
      infiniteResearch: Object.fromEntries([
        "matrix_compression",
        "vein_utilization",
        "galactic_logistics",
        "stellar_harnessing",
        "continuum_simulation",
      ].map((id) => [id, { level: 0, progress: "0" }])),
    },
    totalProduced: { iron_ore: sequence, universe_matrix: sequence },
    metrics: { generationKw: 0, totalItemsPerMinute: sequence, rayGenerationKw: 0 },
    exploration: { unlockedSystemIds: ["helios"], colonizedPlanetIds: ["home"] },
    ...(paddingBytes > 0 ? { syntheticArchivePadding: "x".repeat(paddingBytes) } : {}),
  };
}

function createSavePayload(mode = "normal", sequence = 1, paddingBytes = 0) {
  const state = createV46State(mode, sequence, paddingBytes);
  const envelope = { formatVersion: 2, savedAt: 100_000 + sequence, mode, state };
  return JSON.stringify({
    ...envelope,
    checksum: computeSaveStateChecksum(envelope.formatVersion, state),
  });
}

async function startServer(databaseFile, options = {}) {
  const server = await createCloudServer({
    databaseFile,
    registrationLimit: 100,
    historyPruneIntervalMs: 0,
    backupIntervalMs: 0,
    mailer: null,
    logger: { error() {} },
    ...options,
  });
  await new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function request(baseUrl, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  return { response, body, text };
}

async function register(baseUrl, username) {
  const registered = await request(baseUrl, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      username,
      password: TEST_PASSWORD,
      displayName: "归档合成账号",
    }),
  });
  assert.equal(registered.response.status, 201, JSON.stringify(registered.body));
  return {
    accountId: registered.body.user.id,
    token: registered.body.token,
    headers: { authorization: `Bearer ${registered.body.token}` },
  };
}

async function upload(baseUrl, account, mode, slot, payload, expectedRevision) {
  const uploaded = await request(
    baseUrl,
    `/api/cloud-save?mode=${encodeURIComponent(mode)}&slot=${encodeURIComponent(slot)}`,
    {
      method: "PUT",
      headers: account.headers,
      body: JSON.stringify({ payload, expectedRevision }),
    },
  );
  assert.equal(uploaded.response.status, 200, JSON.stringify(uploaded.body));
  assert.equal(uploaded.body.cloudSave.mode, mode);
  assert.equal(uploaded.body.cloudSave.slot, slot);
  assert.equal(uploaded.body.cloudSave.revision, expectedRevision + 1);
  return uploaded.body.cloudSave;
}

async function downloadArchive(baseUrl, account, options = {}) {
  const response = await fetch(`${baseUrl}/api/account/export/archive`, {
    headers: account.headers,
    signal: options.signal,
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  return { response, bytes, archive: response.ok ? readAccountArchiveZip(bytes) : null };
}

function refIdentity(ref) {
  return `${ref.mode}:${ref.slot}:${ref.revision}`;
}

function zipEntryNames(zip) {
  const eocdOffset = zip.byteLength - 22;
  assert.equal(zip.readUInt32LE(eocdOffset), ZIP_EOCD_SIGNATURE);
  const count = zip.readUInt16LE(eocdOffset + 10);
  let cursor = zip.readUInt32LE(eocdOffset + 16);
  const names = [];
  for (let index = 0; index < count; index += 1) {
    assert.equal(zip.readUInt32LE(cursor), ZIP_CENTRAL_SIGNATURE);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    names.push(zip.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8"));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

async function withFixture(label, operation, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), `dsp-account-archive-${label}-`));
  const databaseFile = path.join(directory, "cloud.sqlite");
  let running;
  try {
    running = await startServer(databaseFile, options);
    await operation({ directory, databaseFile, ...running, setRunning(value) { running = value; } });
  } finally {
    await closeServer(running?.server);
    await rm(directory, { recursive: true, force: true });
  }
}

test("archive route exports a no-save account as a valid manifest-v2 with download headers", async () => {
  await withFixture("empty", async ({ baseUrl }) => {
    const account = await register(baseUrl, "archive_empty");
    const downloaded = await downloadArchive(baseUrl, account);

    assert.equal(downloaded.response.status, 200);
    assert.equal(downloaded.response.headers.get("content-type"), ARCHIVE_CONTENT_TYPE);
    assert.equal(downloaded.response.headers.get("content-length"), String(downloaded.bytes.byteLength));
    assert.match(
      downloaded.response.headers.get("content-disposition") ?? "",
      new RegExp(`^attachment; filename="dsp-account-${account.accountId}-[0-9]+\\.dspaccount\\.zip"$`),
    );
    assert.equal(downloaded.response.headers.get("cache-control"), "private, no-store");
    assert.equal(downloaded.response.headers.get("x-dsp-account-archive-version"), "2");
    assert.equal(downloaded.archive.manifest.manifestVersion, 2);
    assert.equal(downloaded.archive.manifest.schemaVersion, 8);
    assert.deepEqual(downloaded.archive.manifest.refs, []);
    assert.deepEqual(downloaded.archive.manifest.blobs, []);
    assert.equal(downloaded.archive.accountData.accountId, account.accountId);
    assert.equal(downloaded.archive.accountData.user.id, account.accountId);
    assert.equal(downloaded.archive.accountData.format, "dspidle-account-data");
    assert.equal(downloaded.archive.accountData.version, 2);
  });
});

test("archive route preserves every normal/speedrun slot and revision with exact bytes", async () => {
  await withFixture("matrix", async ({ baseUrl }) => {
    const account = await register(baseUrl, "archive_matrix");
    const expected = new Map();
    let sequence = 10;
    for (const mode of ["normal", "speedrun"]) {
      for (const slot of ["main", "1", "2", "3"]) {
        for (let revision = 1; revision <= 2; revision += 1) {
          const payload = createSavePayload(mode, sequence++);
          await upload(baseUrl, account, mode, slot, payload, revision - 1);
          expected.set(`${mode}:${slot}:${revision}`, payload);
        }
      }
    }

    const downloaded = await downloadArchive(baseUrl, account);
    assert.equal(downloaded.response.status, 200);
    assert.equal(downloaded.archive.manifest.refs.length, expected.size);
    assert.deepEqual(new Set(downloaded.archive.manifest.refs.map(refIdentity)), new Set(expected.keys()));
    for (const ref of downloaded.archive.manifest.refs) {
      const payload = expected.get(refIdentity(ref));
      assert.equal(ref.size, Buffer.byteLength(payload));
      assert.equal(ref.checksum, sha256(payload));
      assert.ok(downloaded.archive.payloads.get(ref.checksum).equals(Buffer.from(payload)));
      assert.equal(JSON.parse(payload).mode, ref.mode);
    }

    const normalChecksums = new Set(downloaded.archive.manifest.refs.filter((ref) => ref.mode === "normal").map((ref) => ref.checksum));
    const speedrunChecksums = new Set(downloaded.archive.manifest.refs.filter((ref) => ref.mode === "speedrun").map((ref) => ref.checksum));
    assert.deepEqual([...normalChecksums].filter((checksum) => speedrunChecksums.has(checksum)), []);
  });
});

test("archive route stores one physical payload entry for repeated checksum refs", async () => {
  await withFixture("dedupe", async ({ baseUrl }) => {
    const account = await register(baseUrl, "archive_dedupe");
    const payload = createSavePayload("normal", 30);
    await upload(baseUrl, account, "normal", "main", payload, 0);
    await upload(baseUrl, account, "normal", "main", payload, 1);

    const downloaded = await downloadArchive(baseUrl, account);
    const digest = sha256(payload);
    assert.equal(downloaded.archive.manifest.refs.length, 2);
    assert.equal(downloaded.archive.manifest.blobs.length, 1);
    assert.equal(downloaded.archive.manifest.blobs[0].checksum, digest);
    assert.equal(zipEntryNames(downloaded.bytes).filter((name) => name === `payloads/${digest}.json`).length, 1);
  });
});

test("legacy JSON account export remains compatible alongside the archive route", async () => {
  await withFixture("legacy", async ({ baseUrl }) => {
    const account = await register(baseUrl, "archive_legacy_json");
    const normal = createSavePayload("normal", 40);
    const speedrun = createSavePayload("speedrun", 41);
    await upload(baseUrl, account, "normal", "main", normal, 0);
    await upload(baseUrl, account, "speedrun", "2", speedrun, 0);

    const legacy = await request(baseUrl, "/api/account/export", { headers: account.headers });
    assert.equal(legacy.response.status, 200, JSON.stringify(legacy.body));
    assert.match(legacy.response.headers.get("content-type") ?? "", /^application\/json/);
    assert.equal(legacy.body.user.id, account.accountId);
    assert.equal(legacy.body.cloudSavesByMode.normal.main.payload, normal);
    assert.equal(legacy.body.cloudSavesByMode.speedrun.slots["2"].payload, speedrun);
    assert.equal(legacy.body.cloudSave.payload, normal);
  });
});

test("slow archive download does not block PUT and contains only its opening SQLite snapshot", async () => {
  await withFixture("snapshot", async ({ baseUrl }) => {
    const account = await register(baseUrl, "archive_snapshot");
    const before = createSavePayload("normal", 50, 8 * 1_048_576);
    const after = createSavePayload("normal", 51, 128 * 1_024);
    await upload(baseUrl, account, "normal", "main", before, 0);

    const opened = await openPausedHttpResponse(baseUrl, "/api/account/export/archive", account.headers);
    assert.equal(opened.response.statusCode, 200);
    assert.ok(Number(opened.response.headers["content-length"]) > 8 * 1_048_576);

    const started = performance.now();
    const uploaded = await upload(baseUrl, account, "normal", "main", after, 1);
    const uploadElapsedMs = performance.now() - started;
    assert.equal(uploaded.revision, 2);
    assert.ok(uploadElapsedMs < 2_000, `concurrent PUT took ${uploadElapsedMs.toFixed(1)} ms`);

    const archive = readAccountArchiveZip(await collectIncomingMessage(opened.response, 1));
    assert.deepEqual(archive.manifest.refs.map(refIdentity), ["normal:main:1"]);
    assert.ok(archive.payloads.get(sha256(before)).equals(Buffer.from(before)));
    assert.equal(archive.payloads.has(sha256(after)), false);

    const current = await request(baseUrl, "/api/cloud-save?mode=normal&slot=main", { headers: account.headers });
    assert.equal(current.response.status, 200);
    assert.equal(current.body.cloudSave.revision, 2);
    assert.equal(current.body.cloudSave.payload, after);
  });
});

test("cancelled archive releases its snapshot so upload, backup, close, and restart remain healthy", async () => {
  await withFixture("cancel", async (fixture) => {
    const { baseUrl, databaseFile, directory, server } = fixture;
    const account = await register(baseUrl, "archive_cancel");
    const before = createSavePayload("normal", 60, 8 * 1_048_576);
    const after = createSavePayload("normal", 61);
    await upload(baseUrl, account, "normal", "main", before, 0);

    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/api/account/export/archive`, {
      headers: account.headers,
      signal: controller.signal,
    });
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    const firstChunk = await reader.read();
    assert.equal(firstChunk.done, false);
    controller.abort();
    await reader.cancel().catch(() => undefined);

    await delay(50);
    const uploaded = await upload(baseUrl, account, "normal", "main", after, 1);
    assert.equal(uploaded.revision, 2);

    const backupFile = path.join(directory, "post-cancel.sqlite");
    await server.store.backup(backupFile);
    assert.ok((await readdir(directory)).includes("post-cancel.sqlite"));

    await closeServer(server);
    const restarted = await startServer(databaseFile);
    fixture.setRunning(restarted);
    const current = await request(restarted.baseUrl, "/api/cloud-save?mode=normal&slot=main", { headers: account.headers });
    assert.equal(current.response.status, 200, JSON.stringify(current.body));
    assert.equal(current.body.cloudSave.revision, 2);
    assert.equal(current.body.cloudSave.payload, after);
  });
});

test("archive route reports a missing payload body before exposing a successful archive", async () => {
  await withFixture("missing", async ({ baseUrl, server }) => {
    const account = await register(baseUrl, "archive_missing_body");
    const payload = createSavePayload("normal", 70);
    await upload(baseUrl, account, "normal", "main", payload, 0);
    server.store.database.prepare("DELETE FROM cloud_save_payloads WHERE user_id = ? AND slot = ? AND revision = ?")
      .run(account.accountId, "main", 1);

    const result = await rawHttpRequest(baseUrl, "/api/account/export/archive", account.headers);
    assertExplicitArchiveFailure(result, "CLOUD_SAVE_PAYLOAD_MISSING");
  });
});

test("archive route reports checksum metadata mismatch before exposing a successful archive", async () => {
  await withFixture("checksum", async ({ baseUrl, server }) => {
    const account = await register(baseUrl, "archive_bad_checksum");
    const payload = createSavePayload("normal", 71);
    await upload(baseUrl, account, "normal", "main", payload, 0);
    server.store.data.cloudSaves[account.accountId].checksum = "0".repeat(64);
    server.store.data.cloudSaveHistory[account.accountId][0].checksum = "0".repeat(64);

    const result = await rawHttpRequest(baseUrl, "/api/account/export/archive", account.headers);
    assertExplicitArchiveFailure(result, "ACCOUNT_ARCHIVE_PAYLOAD_CHECKSUM_MISMATCH");
  });
});

test("archive route reports size metadata mismatch before exposing a successful archive", async () => {
  await withFixture("size", async ({ baseUrl, server }) => {
    const account = await register(baseUrl, "archive_bad_size");
    const payload = createSavePayload("normal", 72);
    await upload(baseUrl, account, "normal", "main", payload, 0);
    server.store.data.cloudSaves[account.accountId].size += 1;
    server.store.data.cloudSaveHistory[account.accountId][0].size += 1;

    const result = await rawHttpRequest(baseUrl, "/api/account/export/archive", account.headers);
    assertExplicitArchiveFailure(result, "ACCOUNT_ARCHIVE_PAYLOAD_SIZE_MISMATCH");
  });
});

test("a slow HTTP reader applies backpressure without corrupting the archive", async () => {
  await withFixture("backpressure", async ({ baseUrl }) => {
    const account = await register(baseUrl, "archive_backpressure");
    const payload = createSavePayload("normal", 80, 3 * 1_048_576);
    await upload(baseUrl, account, "normal", "3", payload, 0);

    const response = await fetch(`${baseUrl}/api/account/export/archive`, { headers: account.headers });
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    const chunks = [];
    let observedPause = false;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      chunks.push(Buffer.from(next.value));
      if (!observedPause) {
        observedPause = true;
        await delay(75);
      } else {
        await delay(1);
      }
    }
    assert.equal(observedPause, true);
    const bytes = Buffer.concat(chunks);
    assert.equal(response.headers.get("content-length"), String(bytes.byteLength));
    const archive = readAccountArchiveZip(bytes);
    assert.deepEqual(archive.manifest.refs.map(refIdentity), ["normal:3:1"]);
    assert.ok(archive.payloads.get(sha256(payload)).equals(Buffer.from(payload)));
  });
});

function rawHttpRequest(baseUrl, route, headers = {}) {
  const url = new URL(route, baseUrl);
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method: "GET", headers }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve({
        statusCode: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
        complete: response.complete,
      }));
      response.on("aborted", () => resolve({
        statusCode: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
        complete: false,
      }));
    });
    request.on("error", (error) => resolve({
      statusCode: null,
      headers: {},
      body: Buffer.alloc(0),
      complete: false,
      socketError: error,
    }));
    request.end();
  });
}

function openPausedHttpResponse(baseUrl, route, headers = {}) {
  const url = new URL(route, baseUrl);
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method: "GET", headers }, (response) => {
      response.pause();
      resolve({ request, response });
    });
    request.on("error", reject);
    request.end();
  });
}

async function collectIncomingMessage(response, pauseMs = 0) {
  const chunks = [];
  for await (const chunk of response) {
    chunks.push(Buffer.from(chunk));
    if (pauseMs > 0) await delay(pauseMs);
  }
  assert.equal(response.complete, true);
  return Buffer.concat(chunks);
}

function assertExplicitArchiveFailure(result, expectedCode) {
  assert.ok(
    result.statusCode === 409 || result.statusCode === 500,
    `expected an explicit 409/500 ${expectedCode} response before streaming; received ${result.statusCode ?? `socket ${result.socketError?.code ?? "failure"}`}`,
  );
  assert.notEqual(result.headers["content-type"], ARCHIVE_CONTENT_TYPE);
  assert.equal(result.complete, true, "the structured error response must be complete");
  let body;
  assert.doesNotThrow(() => { body = JSON.parse(result.body.toString("utf8")); });
  assert.equal(body.code, expectedCode);
}
