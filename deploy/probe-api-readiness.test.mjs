import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { probeApiReadiness } from "./probe-api-readiness.mjs";

async function withApi({ readyStatus = 200, writable = true, shuttingDown = false }, run) {
  const server = http.createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/health") return response.end(JSON.stringify({ ok: true, storage: "sqlite", schemaVersion: 7, storageLayoutVersion: 2 }));
    if (request.url === "/api/ready") {
      response.statusCode = readyStatus;
      return response.end(JSON.stringify(readyStatus === 404 ? { error: "not found" } : { writable, shuttingDown }));
    }
    response.statusCode = 404;
    response.end("{}");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    return await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("accepts current writable readiness", async () => {
  const result = await withApi({}, (baseUrl) => probeApiReadiness({ baseUrl }));
  assert.equal(result.writable, true);
  assert.equal(result.legacyHealthFallback, false);
});

test("accepts legacy API immediately only when readiness explicitly returns 404", async () => {
  const startedAt = Date.now();
  const result = await withApi({ readyStatus: 404 }, (baseUrl) => probeApiReadiness({ baseUrl }));
  assert.equal(result.legacyHealthFallback, true);
  assert.ok(Date.now() - startedAt < 1_000);
});

test("does not treat current 503 or non-writable readiness as a legacy API", async () => {
  await assert.rejects(() => withApi({ readyStatus: 503, writable: false, shuttingDown: true }, (baseUrl) => probeApiReadiness({ baseUrl })), /not writable/);
});
