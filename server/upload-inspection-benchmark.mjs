import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { createCloudServer } from "./index.mjs";
import { computeSaveStateChecksum } from "./save-integrity.mjs";

const targetMiB = Number(process.argv[2] ?? 28);
const concurrentUploads = Number(process.argv[3] ?? 8);
if (!Number.isFinite(targetMiB) || targetMiB < 1 || targetMiB > 48 ||
  ![1, 2, 4, 8].includes(concurrentUploads)) {
  throw new Error("usage: node upload-inspection-benchmark.mjs <1..48 MiB> <1|2|4|8 uploads>");
}

function payloadAtLeast(bytes, seed) {
  const state = {
    version: 24,
    mode: "normal",
    elapsedSeconds: 1_000 + seed,
    entities: [],
    totalProduced: { universe_matrix: seed },
    metrics: { generationKw: 100, totalItemsPerMinute: 20 },
    exploration: { unlockedSystemIds: ["helios"], colonizedPlanetIds: ["home"] },
    padding: "",
  };
  const envelope = () => JSON.stringify({
    formatVersion: 2,
    savedAt: 123_456 + seed,
    mode: "normal",
    state,
    checksum: computeSaveStateChecksum(2, state),
  });
  let payload = envelope();
  state.padding = "x".repeat(Math.max(0, bytes - Buffer.byteLength(payload) - 64));
  payload = envelope();
  while (Buffer.byteLength(payload) < bytes) {
    state.padding += "x".repeat(Math.min(64, bytes - Buffer.byteLength(payload)));
    payload = envelope();
  }
  return payload;
}

const directory = await mkdtemp(path.join(tmpdir(), "dsp-upload-benchmark-"));
let server;
try {
  server = await createCloudServer({
    databaseFile: path.join(directory, "cloud.sqlite"),
    registrationLimit: 100,
    mailer: null,
    logger: { error() {} },
    uploadInspectionConcurrency: 2,
    uploadInspectionQueueLimit: 16,
    uploadInspectionWorkerThresholdBytes: 1024 * 1024,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const accounts = await Promise.all(Array.from({ length: concurrentUploads }, async (_, index) => {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: `upload_bench_${concurrentUploads}_${index}`, password: "strong-pass-123", displayName: `B${index}` }),
    });
    assert.equal(response.status, 201);
    return response.json();
  }));
  const targetBytes = Math.floor(targetMiB * 1024 * 1024);
  const payloads = accounts.map((_, index) => payloadAtLeast(targetBytes, index + 1));
  const compressed = payloads.map((payload) => gzipSync(Buffer.from(payload)));
  const loopDelay = monitorEventLoopDelay({ resolution: 10 });
  loopDelay.enable();
  const before = process.memoryUsage();
  const startedAt = performance.now();
  const results = await Promise.all(accounts.map(async (account, index) => {
    const response = await fetch(`${baseUrl}/api/cloud-save?mode=normal`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${account.token}`,
        "content-type": "application/vnd.dspidle.save+json",
        "content-encoding": "gzip",
        "x-dsp-expected-revision": "0",
        "x-dsp-save-original-bytes": String(Buffer.byteLength(payloads[index])),
      },
      body: compressed[index],
    });
    const body = await response.json();
    return { status: response.status, revision: body.cloudSave?.revision ?? null, code: body.code ?? null };
  }));
  const durationMs = performance.now() - startedAt;
  const after = process.memoryUsage();
  loopDelay.disable();
  assert.ok(results.every((result) => result.status === 200 && result.revision === 1), JSON.stringify(results));
  console.log(JSON.stringify({
    targetMiB,
    concurrentUploads,
    durationMs: Math.round(durationMs * 100) / 100,
    rssBefore: before.rss,
    rssAfter: after.rss,
    heapBefore: before.heapUsed,
    heapAfter: after.heapUsed,
    eventLoopDelayMaxMs: Math.round(loopDelay.max / 1e4) / 100,
    eventLoopDelayP99Ms: Math.round(loopDelay.percentile(99) / 1e4) / 100,
    scheduler: server.uploadInspections.snapshot(),
  }));
} finally {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
