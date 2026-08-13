const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Readable, Writable } = require("node:stream");
const { setTimeout: delay } = require("node:timers/promises");
const {
  ACCOUNT_ARCHIVE_CONTENT_TYPE,
  ACCOUNT_ARCHIVE_EXTENSION,
  MAXIMUM_ACCOUNT_ARCHIVE_BYTES,
  MAXIMUM_ERROR_RESPONSE_BYTES,
  AccountArchiveDownloadRegistry,
  downloadAccountArchiveToFile,
  normalizeArchiveTargetPath,
  normalizeBearerAuthorization,
  normalizeContentLength,
  runSelectedAccountArchiveDownload,
  sanitizeArchiveFileName,
  streamArchiveBodyToWritable,
} = require("./account-archive-download.cjs");

function response(status, body, headers = {}) {
  const normalized = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return {
    status,
    body,
    headers: { get: (name) => normalized.get(String(name).toLowerCase()) ?? null },
  };
}

function successfulResponse(bytes, body = Readable.from([bytes])) {
  return response(200, body, {
    "content-type": `${ACCOUNT_ARCHIVE_CONTENT_TYPE}; charset=binary`,
    "content-length": bytes.byteLength,
  });
}

async function temporaryDirectory(t, label) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), `dsp-archive-${label}-`));
  t.after(async () => fs.promises.rm(directory, { recursive: true, force: true }));
  return directory;
}

function partFiles(names) {
  return names.filter((name) => name.endsWith(".part"));
}

test("sanitizes suggested names to one fixed archive extension without path traversal", () => {
  assert.equal(sanitizeArchiveFileName("../../player:backup.zip"), `player_backup${ACCOUNT_ARCHIVE_EXTENSION}`);
  assert.equal(sanitizeArchiveFileName("save.dspaccount.zip"), `save${ACCOUNT_ARCHIVE_EXTENSION}`);
  assert.equal(sanitizeArchiveFileName("CON"), `_CON${ACCOUNT_ARCHIVE_EXTENSION}`);
  assert.match(sanitizeArchiveFileName(".."), /^dsp-idle-account-\d{4}-\d{2}-\d{2}\.dspaccount\.zip$/);
  const target = normalizeArchiveTargetPath(path.join("C:\\safe", "..\\escape\\named.zip"));
  assert.equal(path.basename(target), `named${ACCOUNT_ARCHIVE_EXTENSION}`);
  assert.equal(target.toLowerCase().endsWith(ACCOUNT_ARCHIVE_EXTENSION), true);
  assert.throws(() => normalizeArchiveTargetPath(`bad\0name.zip`), { code: "ACCOUNT_ARCHIVE_PATH_INVALID" });
});

test("requires a bounded Bearer credential and positive bounded content length", () => {
  assert.equal(normalizeBearerAuthorization(" Bearer abcdefgh "), "Bearer abcdefgh");
  for (const invalid of ["", "Basic abcdefgh", "Bearer short", "Bearer token with spaces", null]) {
    assert.throws(() => normalizeBearerAuthorization(invalid), { code: "ACCOUNT_ARCHIVE_AUTH_INVALID" });
  }
  assert.equal(normalizeContentLength("1073741824"), 1024 ** 3);
  assert.throws(() => normalizeContentLength("0"), { code: "ACCOUNT_ARCHIVE_LENGTH_INVALID" });
  assert.throws(() => normalizeContentLength("-1"), { code: "ACCOUNT_ARCHIVE_LENGTH_INVALID" });
  assert.throws(() => normalizeContentLength(String(MAXIMUM_ACCOUNT_ARCHIVE_BYTES + 1)), { code: "ACCOUNT_ARCHIVE_LENGTH_INVALID" });
});

test("streams a successful archive through a unique part file and atomically publishes exact bytes", async (t) => {
  const directory = await temporaryDirectory(t, "success");
  const target = path.join(directory, `account${ACCOUNT_ARCHIVE_EXTENSION}`);
  const bytes = Buffer.concat([Buffer.alloc(96 * 1024, 0x41), Buffer.from("archive-tail")]);
  let request = null;
  const result = await downloadAccountArchiveToFile({
    url: new URL("https://example.test/api/account/export/archive"),
    targetPath: target,
    authorization: "Bearer synthetic-token",
    fetchImpl: async (url, init) => {
      request = { url: url.toString(), init };
      return successfulResponse(bytes, Readable.from([
        bytes.subarray(0, 32 * 1024),
        bytes.subarray(32 * 1024, 80 * 1024),
        bytes.subarray(80 * 1024),
      ]));
    },
  });
  assert.equal(result.byteLength, bytes.byteLength);
  assert.equal(result.fileName, path.basename(target));
  assert.deepEqual(await fs.promises.readFile(target), bytes);
  assert.deepEqual(partFiles(await fs.promises.readdir(directory)), []);
  assert.equal(request.url, "https://example.test/api/account/export/archive");
  assert.equal(request.init.method, "GET");
  assert.equal(request.init.redirect, "error");
  assert.equal(request.init.headers.authorization, "Bearer synthetic-token");
  assert.equal(request.init.headers.accept, ACCOUNT_ARCHIVE_CONTENT_TYPE);
});

test("the body pipeline respects slow writable backpressure without aggregating chunks", async () => {
  const chunks = Array.from({ length: 48 }, (_, index) => Buffer.alloc(64 * 1024, index));
  let produced = 0;
  let completedWrites = 0;
  let maximumLead = 0;
  async function* source() {
    for (const chunk of chunks) {
      produced += 1;
      maximumLead = Math.max(maximumLead, produced - completedWrites);
      yield chunk;
    }
  }
  const received = [];
  const slowWritable = new Writable({
    highWaterMark: 64 * 1024,
    write(chunk, _encoding, callback) {
      setTimeout(() => {
        received.push(Buffer.from(chunk));
        completedWrites += 1;
        callback();
      }, 2);
    },
  });
  const byteLength = await streamArchiveBodyToWritable(Readable.from(source()), slowWritable, {
    expectedBytes: chunks.length * chunks[0].byteLength,
  });
  assert.equal(byteLength, chunks.length * chunks[0].byteLength);
  assert.deepEqual(Buffer.concat(received), Buffer.concat(chunks));
  assert.ok(maximumLead <= 4, `source ran ${maximumLead} chunks ahead of the slow sink`);
});

test("cancellation aborts the stream, removes the part file, and preserves an existing target", async (t) => {
  const directory = await temporaryDirectory(t, "cancel");
  const target = path.join(directory, `existing${ACCOUNT_ARCHIVE_EXTENSION}`);
  const original = Buffer.from("existing-account-archive");
  await fs.promises.writeFile(target, original);
  const controller = new AbortController();
  async function* source() {
    yield Buffer.alloc(32 * 1024, 1);
    await delay(100);
    yield Buffer.alloc(32 * 1024, 2);
  }
  const download = downloadAccountArchiveToFile({
    url: new URL("https://example.test/api/account/export/archive"),
    targetPath: target,
    authorization: "Bearer synthetic-token",
    signal: controller.signal,
    fetchImpl: async () => successfulResponse(Buffer.alloc(64 * 1024), Readable.from(source())),
  });
  setTimeout(() => controller.abort(), 15);
  await assert.rejects(download, { name: "AbortError", code: "ACCOUNT_ARCHIVE_CANCELLED" });
  assert.deepEqual(await fs.promises.readFile(target), original);
  assert.deepEqual(partFiles(await fs.promises.readdir(directory)), []);
});

test("truncated and overlong success bodies are rejected while the old target and directory stay clean", async (t) => {
  const directory = await temporaryDirectory(t, "length");
  const target = path.join(directory, `existing${ACCOUNT_ARCHIVE_EXTENSION}`);
  const original = Buffer.from("old-target");
  await fs.promises.writeFile(target, original);

  await assert.rejects(downloadAccountArchiveToFile({
    url: new URL("https://example.test/api/account/export/archive"),
    targetPath: target,
    authorization: "Bearer synthetic-token",
    fetchImpl: async () => response(200, Readable.from([Buffer.alloc(7)]), {
      "content-type": ACCOUNT_ARCHIVE_CONTENT_TYPE,
      "content-length": "8",
    }),
  }), { code: "ACCOUNT_ARCHIVE_BODY_TRUNCATED" });
  assert.deepEqual(await fs.promises.readFile(target), original);
  assert.deepEqual(partFiles(await fs.promises.readdir(directory)), []);

  await assert.rejects(downloadAccountArchiveToFile({
    url: new URL("https://example.test/api/account/export/archive"),
    targetPath: target,
    authorization: "Bearer synthetic-token",
    fetchImpl: async () => response(200, Readable.from([Buffer.alloc(9)]), {
      "content-type": ACCOUNT_ARCHIVE_CONTENT_TYPE,
      "content-length": "8",
    }),
  }), { code: "ACCOUNT_ARCHIVE_BODY_TOO_LONG" });
  assert.deepEqual(await fs.promises.readFile(target), original);
  assert.deepEqual(partFiles(await fs.promises.readdir(directory)), []);
});

test("a failed final rename preserves the confirmed existing target and cleans the part file", async (t) => {
  const directory = await temporaryDirectory(t, "rename-failure");
  const target = path.join(directory, `existing${ACCOUNT_ARCHIVE_EXTENSION}`);
  const original = Buffer.from("confirmed-existing-target");
  const replacement = Buffer.from("new-account-archive");
  await fs.promises.writeFile(target, original);
  const guardedFsPromises = Object.create(fs.promises);
  guardedFsPromises.rename = async () => {
    const error = new Error("synthetic sharing violation");
    error.code = "EACCES";
    throw error;
  };
  await assert.rejects(downloadAccountArchiveToFile({
    url: new URL("https://example.test/api/account/export/archive"),
    targetPath: target,
    authorization: "Bearer synthetic-token",
    fetchImpl: async () => successfulResponse(replacement),
    fsPromises: guardedFsPromises,
    platform: "win32",
  }), { code: "ACCOUNT_ARCHIVE_RENAME_FAILED" });
  assert.deepEqual(await fs.promises.readFile(target), original);
  assert.deepEqual(partFiles(await fs.promises.readdir(directory)), []);
});

test("rejects invalid success metadata before creating any temporary file", async (t) => {
  const directory = await temporaryDirectory(t, "metadata");
  const target = path.join(directory, `account${ACCOUNT_ARCHIVE_EXTENSION}`);
  for (const invalid of [
    response(200, Readable.from([Buffer.from("x")]), { "content-type": "application/zip", "content-length": "1" }),
    response(200, Readable.from([Buffer.from("x")]), { "content-type": ACCOUNT_ARCHIVE_CONTENT_TYPE }),
    response(200, Readable.from([Buffer.from("x")]), { "content-type": ACCOUNT_ARCHIVE_CONTENT_TYPE, "content-length": "0" }),
  ]) {
    await assert.rejects(downloadAccountArchiveToFile({
      url: new URL("https://example.test/api/account/export/archive"),
      targetPath: target,
      authorization: "Bearer synthetic-token",
      fetchImpl: async () => invalid,
    }));
  }
  assert.deepEqual(await fs.promises.readdir(directory), []);
});

test("reads at most 64 KiB from an error response and returns a stable server error", async (t) => {
  const directory = await temporaryDirectory(t, "http-error");
  const target = path.join(directory, `account${ACCOUNT_ARCHIVE_EXTENSION}`);
  let generatedChunks = 0;
  async function* hugeError() {
    for (let index = 0; index < 20; index += 1) {
      generatedChunks += 1;
      yield Buffer.alloc(16 * 1024, 0x78);
      await delay(1);
    }
  }
  await assert.rejects(downloadAccountArchiveToFile({
    url: new URL("https://example.test/api/account/export/archive"),
    targetPath: target,
    authorization: "Bearer synthetic-token",
    fetchImpl: async () => response(503, Readable.from(hugeError()), { "content-type": "application/json" }),
  }), (error) => {
    assert.equal(error.code, "ACCOUNT_ARCHIVE_HTTP_ERROR");
    assert.equal(error.status, 503);
    assert.match(error.message, /HTTP 503/);
    return true;
  });
  assert.ok(generatedChunks <= Math.ceil(MAXIMUM_ERROR_RESPONSE_BYTES / (16 * 1024)) + 1);
  assert.deepEqual(await fs.promises.readdir(directory), []);

  await assert.rejects(downloadAccountArchiveToFile({
    url: new URL("https://example.test/api/account/export/archive"),
    targetPath: target,
    authorization: "Bearer synthetic-token",
    fetchImpl: async () => response(409, Readable.from([Buffer.from(JSON.stringify({
      code: "ARCHIVE_NOT_READY",
      message: "账号归档尚未准备好",
    }))]), { "content-type": "application/json" }),
  }), (error) => {
    assert.equal(error.code, "ACCOUNT_ARCHIVE_HTTP_ERROR");
    assert.equal(error.serverCode, "ARCHIVE_NOT_READY");
    assert.equal(error.message, "账号归档尚未准备好");
    return true;
  });
});

test("a cancelled save dialog returns before the network request begins", async () => {
  let selected = 0;
  let downloaded = 0;
  const result = await runSelectedAccountArchiveDownload({
    selectTarget: async () => {
      selected += 1;
      return { canceled: true };
    },
    download: async () => {
      downloaded += 1;
      return { byteLength: 1 };
    },
  });
  assert.deepEqual(result, { cancelled: true });
  assert.equal(selected, 1);
  assert.equal(downloaded, 0);
});

test("download registry enforces one active request, rejects duplicate ids, and cancels all", () => {
  const registry = new AccountArchiveDownloadRegistry(1);
  const first = registry.begin("archive_request_1");
  assert.equal(registry.size, 1);
  assert.throws(() => registry.begin("archive_request_1"), { code: "ACCOUNT_ARCHIVE_REQUEST_DUPLICATE" });
  assert.throws(() => registry.begin("archive_request_2"), { code: "ACCOUNT_ARCHIVE_DOWNLOAD_BUSY" });
  assert.equal(registry.cancel("archive_request_1"), true);
  assert.equal(first.controller.signal.aborted, true);
  assert.equal(registry.finish("archive_request_1", first), true);
  const second = registry.begin("archive_request_2");
  registry.cancelAll();
  assert.equal(second.controller.signal.aborted, true);
  assert.equal(registry.finish("archive_request_2", second), true);
  assert.equal(registry.size, 0);
});

test("desktop main and preload keep the account archive on a fixed trusted streaming boundary", async () => {
  const [mainSource, preloadSource] = await Promise.all([
    fs.promises.readFile(path.join(__dirname, "main.cjs"), "utf8"),
    fs.promises.readFile(path.join(__dirname, "preload.cjs"), "utf8"),
  ]);
  assert.match(mainSource, /trustedSender\(event\)/);
  assert.match(mainSource, /resolveApiRequestUrl\("\/account\/export\/archive"\)/);
  assert.match(mainSource, /desktop:download-account-archive/);
  assert.match(mainSource, /desktop:cancel-account-archive-download/);
  assert.doesNotMatch(mainSource, /arrayBuffer\(\).*account-archive|account-archive.*arrayBuffer\(/s);
  assert.match(preloadSource, /downloadAccountArchive/);
  assert.match(preloadSource, /cancelAccountArchiveDownload/);
  assert.doesNotMatch(preloadSource, /downloadAccountArchive[^\n]+ArrayBuffer/);
});
