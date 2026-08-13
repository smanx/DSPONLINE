import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, open, rename, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AccountArchiveError, buildAccountArchiveManifest, createAccountArchiveZipStream } from "./account-archive.mjs";
import { inspectAccountArchiveFile, validateAccountArchiveFile } from "./account-archive-file.mjs";

const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_DESCRIPTOR_SIGNATURE = 0x08074b50;
const ZIP_FLAGS = 0x0808;
const ZIP_DOS_DATE = 0x0021;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    table[value] = crc >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffff_ffff;
  for (let index = 0; index < bytes.byteLength; index += 1) crc = CRC32_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffff_ffff) >>> 0;
}

function payload(mode, marker = "fixture", paddingBytes = 0) {
  return Buffer.from(JSON.stringify({
    formatVersion: 2,
    mode,
    savedAt: 1_786_588_800_000,
    checksum: "synthetic",
    state: { version: 46, mode, entities: [], marker, padding: "x".repeat(paddingBytes) },
  }), "utf8");
}

function legacySpeedrunPayload() {
  return Buffer.from(JSON.stringify({
    formatVersion: 2,
    state: { version: 46, entities: [], speedrun: { enabled: true, mode: "speedrun", factoryId: "factory_test" } },
  }), "utf8");
}

function saveRef(bytes, overrides = {}) {
  return {
    mode: "normal",
    slot: "main",
    revision: 1,
    updatedAt: 1_786_588_800_000,
    size: bytes.byteLength,
    checksum: sha256(bytes),
    payload: bytes,
    ...overrides,
  };
}

function archiveInput(saves) {
  return {
    exportedAt: 1_786_588_900_000,
    schemaVersion: 7,
    accountData: { user: { id: "synthetic_user", displayName: "Synthetic" }, submissions: [] },
    saves,
  };
}

async function collect(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function makeFixture(t, saves, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), "dspidle-archive-file-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "account.zip");
  const prepared = createAccountArchiveZipStream(archiveInput(saves), options);
  const bytes = await collect(prepared.stream);
  await writeFile(path, bytes);
  return { directory, path, bytes, manifest: prepared.manifest };
}

function assertArchiveError(code) {
  return (error) => {
    assert.ok(error instanceof AccountArchiveError, String(error));
    assert.equal(error.code, code);
    return true;
  };
}

function locateEntries(zip) {
  const eocd = zip.byteLength - 22;
  assert.equal(zip.readUInt32LE(eocd), ZIP_EOCD_SIGNATURE);
  const count = zip.readUInt16LE(eocd + 10);
  let cursor = zip.readUInt32LE(eocd + 16);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    assert.equal(zip.readUInt32LE(cursor), ZIP_CENTRAL_SIGNATURE);
    const size = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    const localNameLength = zip.readUInt16LE(localOffset + 26);
    const dataOffset = localOffset + 30 + localNameLength;
    entries.push({ name, size, dataOffset, centralOffset: cursor, localOffset });
    cursor += 46 + nameLength;
  }
  return entries;
}

function extractEntries(zip) {
  return locateEntries(zip).map((entry) => ({
    name: entry.name,
    data: Buffer.from(zip.subarray(entry.dataOffset, entry.dataOffset + entry.size)),
  }));
}

function rawZip(entries) {
  const localParts = [];
  const records = [];
  let offset = 0;
  for (const source of entries) {
    const nameBytes = Buffer.from(source.name, "utf8");
    const data = Buffer.from(source.data);
    const crc = crc32(data);
    const local = Buffer.alloc(30 + nameBytes.byteLength);
    local.writeUInt32LE(ZIP_LOCAL_SIGNATURE, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(ZIP_FLAGS, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(ZIP_DOS_DATE, 12);
    local.writeUInt16LE(nameBytes.byteLength, 26);
    nameBytes.copy(local, 30);
    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(ZIP_DESCRIPTOR_SIGNATURE, 0);
    descriptor.writeUInt32LE(crc, 4);
    descriptor.writeUInt32LE(data.byteLength, 8);
    descriptor.writeUInt32LE(data.byteLength, 12);
    localParts.push(local, data, descriptor);
    records.push({ nameBytes, data, crc, offset });
    offset += local.byteLength + data.byteLength + descriptor.byteLength;
  }
  const centralOffset = offset;
  const centralParts = [];
  for (const record of records) {
    const central = Buffer.alloc(46 + record.nameBytes.byteLength);
    central.writeUInt32LE(ZIP_CENTRAL_SIGNATURE, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(ZIP_FLAGS, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(ZIP_DOS_DATE, 14);
    central.writeUInt32LE(record.crc, 16);
    central.writeUInt32LE(record.data.byteLength, 20);
    central.writeUInt32LE(record.data.byteLength, 24);
    central.writeUInt16LE(record.nameBytes.byteLength, 28);
    central.writeUInt32LE(record.offset, 42);
    record.nameBytes.copy(central, 46);
    centralParts.push(central);
    offset += central.byteLength;
  }
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(ZIP_EOCD_SIGNATURE, 0);
  footer.writeUInt16LE(entries.length, 8);
  footer.writeUInt16LE(entries.length, 10);
  footer.writeUInt32LE(offset - centralOffset, 12);
  footer.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([...localParts, ...centralParts, footer]);
}

function updateEntryCrc(zip, entry) {
  const data = zip.subarray(entry.dataOffset, entry.dataOffset + entry.size);
  const crc = crc32(data);
  zip.writeUInt32LE(crc, entry.dataOffset + entry.size + 4);
  zip.writeUInt32LE(crc, entry.centralOffset + 16);
}

test("file inspector validates normal/speedrun slots, deduplicates bodies, and supports a second traversal", async (t) => {
  const normal = payload("normal", "normal-shared");
  const speedrun = payload("speedrun", "speedrun-slot");
  const fixture = await makeFixture(t, [
    saveRef(normal, { slot: "main", revision: 1 }),
    saveRef(normal, { slot: "2", revision: 9 }),
    saveRef(speedrun, { mode: "speedrun", slot: "3", revision: 4 }),
  ]);
  const inspection = await inspectAccountArchiveFile(fixture.path, { limits: { chunkBytes: 31 } });
  t.after(() => inspection.close());
  assert.equal(inspection.manifest.refs.length, 3);
  assert.equal(inspection.payloads.length, 2);
  const first = await collect(inspection.openPayload(sha256(normal)));
  const second = await collect(inspection.openPayload(sha256(normal)));
  assert.deepEqual(first, normal);
  assert.deepEqual(second, normal);
  const validated = await inspection.validate();
  assert.deepEqual(validated.validatedPayloads.map(({ mode }) => mode).sort(), ["normal", "speedrun"]);
});

test("30 MiB payload is read in bounded chunks and never returned as a materialized validation result", async (t) => {
  const large = payload("normal", "large", 30 * 1_048_576);
  const fixture = await makeFixture(t, [saveRef(large)], { limits: { maxPayloadBytes: 32 * 1_048_576 } });
  const inspection = await inspectAccountArchiveFile(fixture.path, { limits: { maxPayloadBytes: 32 * 1_048_576, chunkBytes: 64 * 1_024 } });
  t.after(() => inspection.close());
  let chunks = 0;
  let bytes = 0;
  for await (const chunk of inspection.openPayload(sha256(large))) {
    chunks += 1;
    bytes += chunk.byteLength;
    assert.ok(chunk.byteLength <= 64 * 1_024);
  }
  assert.equal(bytes, large.byteLength);
  assert.ok(chunks > 400);
  const result = await inspection.validate();
  assert.equal(result.validatedPayloads[0].size, large.byteLength);
  assert.equal("payloads" in result, false);
});

test("legacy implicit speedrun identity remains valid", async (t) => {
  const bytes = legacySpeedrunPayload();
  const fixture = await makeFixture(t, [saveRef(bytes, { mode: "speedrun" })]);
  const result = await validateAccountArchiveFile(fixture.path, { limits: { chunkBytes: 7 } });
  assert.equal(result.validatedPayloads[0].mode, "speedrun");
});

test("missing files and configured archive/entry limits fail before payload materialization", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "dspidle-archive-file-missing-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await assert.rejects(inspectAccountArchiveFile(join(directory, "missing.zip")), assertArchiveError("ACCOUNT_ARCHIVE_FILE_NOT_FOUND"));
  const bytes = payload("normal", "limit", 2048);
  const fixture = await makeFixture(t, [saveRef(bytes)]);
  await assert.rejects(inspectAccountArchiveFile(fixture.path, { limits: { maxArchiveBytes: fixture.bytes.byteLength - 1 } }), assertArchiveError("ACCOUNT_ARCHIVE_TOTAL_LIMIT_EXCEEDED"));
  await assert.rejects(inspectAccountArchiveFile(fixture.path, { limits: { maxPayloadBytes: bytes.byteLength - 1 } }), assertArchiveError("ACCOUNT_ARCHIVE_ENTRY_LIMIT_EXCEEDED"));
  await assert.rejects(inspectAccountArchiveFile(fixture.path, { limits: { maxEntries: 2 } }), assertArchiveError("ACCOUNT_ARCHIVE_ENTRY_LIMIT_EXCEEDED"));
  const second = payload("normal", "second-ref");
  const twoRefFixture = await makeFixture(t, [saveRef(bytes), saveRef(second, { slot: "1", revision: 2 })]);
  await assert.rejects(inspectAccountArchiveFile(twoRefFixture.path, { limits: { maxRefs: 1 } }), assertArchiveError("ACCOUNT_ARCHIVE_ENTRY_LIMIT_EXCEEDED"));
  await assert.rejects(inspectAccountArchiveFile(fixture.path, { limits: { maxPathBytes: 8 } }), assertArchiveError("ACCOUNT_ARCHIVE_PATH_INVALID"));
  await assert.rejects(inspectAccountArchiveFile(fixture.path, { limits: { maxAccountBytes: 8 } }), assertArchiveError("ACCOUNT_ARCHIVE_ENTRY_LIMIT_EXCEEDED"));
  await assert.rejects(inspectAccountArchiveFile(fixture.path, { limits: { maxManifestBytes: 8 } }), assertArchiveError("ACCOUNT_ARCHIVE_ENTRY_LIMIT_EXCEEDED"));
  await assert.rejects(inspectAccountArchiveFile(fixture.path, { limits: { maxTotalUncompressedBytes: bytes.byteLength } }), assertArchiveError("ACCOUNT_ARCHIVE_TOTAL_LIMIT_EXCEEDED"));
});

test("strict ZIP32 metadata rejects comments, ZIP64, compression, extra fields, gaps, unsafe paths, and duplicates", async (t) => {
  const body = payload("normal");
  const secondBody = payload("normal", "second");
  const fixture = await makeFixture(t, [
    saveRef(body),
    saveRef(secondBody, { slot: "1", revision: 2 }),
  ]);
  const mutations = [
    ["comment", (zip) => { zip.writeUInt16LE(1, zip.byteLength - 2); }],
    ["zip64", (zip) => { zip.writeUInt32LE(0xffff_ffff, zip.byteLength - 6); }],
    ["multi-disk", (zip) => { zip.writeUInt16LE(1, zip.byteLength - 18); }],
    ["compression", (zip) => { const entry = locateEntries(zip)[0]; zip.writeUInt16LE(8, entry.centralOffset + 10); }],
    ["extra", (zip) => { const entry = locateEntries(zip)[0]; zip.writeUInt16LE(1, entry.centralOffset + 30); }],
    ["gap", (zip) => { const entry = locateEntries(zip)[0]; zip.writeUInt32LE(1, entry.centralOffset + 42); }],
    ["descriptor", (zip) => { const entry = locateEntries(zip)[0]; zip.writeUInt32LE(0, entry.dataOffset + entry.size); }],
    ["local-path", (zip) => { const entry = locateEntries(zip)[0]; zip[entry.localOffset + 30] ^= 1; }],
    ["unsafe", (zip) => { const entry = locateEntries(zip).find(({ name }) => name.startsWith("payloads/")); zip.write("../unsafe/", entry.centralOffset + 46, "utf8"); }],
    ["duplicate", (zip) => {
      const entries = locateEntries(zip).filter(({ name }) => name.startsWith("payloads/"));
      const [first, last] = entries;
      assert.equal(first.name.length, last.name.length);
      zip.write(first.name, last.centralOffset + 46, "utf8");
    }],
  ];
  for (const [name, mutate] of mutations) {
    const zip = Buffer.from(fixture.bytes);
    mutate(zip);
    const path = join(fixture.directory, `${name}.zip`);
    await writeFile(path, zip);
    await assert.rejects(inspectAccountArchiveFile(path), (error) => error instanceof AccountArchiveError);
  }
});

test("CRC, SHA-256, JSON syntax, and payload mode are checked while streaming", async (t) => {
  const body = payload("normal", "integrity");
  const fixture = await makeFixture(t, [saveRef(body)]);
  const payloadEntry = locateEntries(fixture.bytes).find(({ name }) => name.startsWith("payloads/"));
  const crcZip = Buffer.from(fixture.bytes);
  crcZip[payloadEntry.dataOffset + 10] ^= 1;
  const crcPath = join(fixture.directory, "crc.zip");
  await writeFile(crcPath, crcZip);
  await assert.rejects(validateAccountArchiveFile(crcPath), assertArchiveError("ACCOUNT_ARCHIVE_CRC_MISMATCH"));

  const shaZip = Buffer.from(fixture.bytes);
  const shaEntry = locateEntries(shaZip).find(({ name }) => name.startsWith("payloads/"));
  shaZip[shaEntry.dataOffset + 10] ^= 1;
  updateEntryCrc(shaZip, shaEntry);
  const shaPath = join(fixture.directory, "sha.zip");
  await writeFile(shaPath, shaZip);
  await assert.rejects(validateAccountArchiveFile(shaPath), assertArchiveError("ACCOUNT_ARCHIVE_BLOB_INTEGRITY_INVALID"));

  const modeBody = payload("speedrun", "wrong-mode");
  const modeFixture = await makeFixture(t, [saveRef(modeBody, { mode: "normal" })]);
  await assert.rejects(validateAccountArchiveFile(modeFixture.path), assertArchiveError("ACCOUNT_ARCHIVE_MODE_MISMATCH"));

  const conflictingMode = Buffer.from('{"mode":"normal","state":{"mode":"speedrun","version":46}}');
  const conflictFixture = await makeFixture(t, [saveRef(conflictingMode)]);
  await assert.rejects(validateAccountArchiveFile(conflictFixture.path), assertArchiveError("ACCOUNT_ARCHIVE_MODE_INVALID"));

  const invalidJson = Buffer.from('{"mode":"normal","state":');
  const jsonFixture = await makeFixture(t, [saveRef(invalidJson)]);
  await assert.rejects(validateAccountArchiveFile(jsonFixture.path), assertArchiveError("ACCOUNT_ARCHIVE_JSON_INVALID"));

  const deepJson = Buffer.from(`${"[".repeat(258)}0${"]".repeat(258)}`);
  const deepFixture = await makeFixture(t, [saveRef(deepJson)]);
  await assert.rejects(validateAccountArchiveFile(deepFixture.path), assertArchiveError("ACCOUNT_ARCHIVE_JSON_INVALID"));
});

test("manifest/account canonicality and missing or orphan blobs are rejected", async (t) => {
  const body = payload("normal");
  const fixture = await makeFixture(t, [saveRef(body)]);
  const entries = extractEntries(fixture.bytes);
  const missingZip = rawZip(entries.filter(({ name }) => !name.startsWith("payloads/")));
  const missingPath = join(fixture.directory, "missing.zip");
  await writeFile(missingPath, missingZip);
  await assert.rejects(inspectAccountArchiveFile(missingPath), assertArchiveError("ACCOUNT_ARCHIVE_BLOB_MISSING"));

  const accountEntry = entries.find(({ name }) => name === "account.json");
  const payloadEntry = entries.find(({ name }) => name.startsWith("payloads/"));
  const noManifestPath = join(fixture.directory, "no-manifest.zip");
  await writeFile(noManifestPath, rawZip([accountEntry, payloadEntry]));
  await assert.rejects(inspectAccountArchiveFile(noManifestPath), assertArchiveError("ACCOUNT_ARCHIVE_MANIFEST_MISSING"));

  const manifestEntry = entries.find(({ name }) => name === "manifest.json");
  const noAccountPath = join(fixture.directory, "no-account.zip");
  await writeFile(noAccountPath, rawZip([manifestEntry, payloadEntry]));
  await assert.rejects(inspectAccountArchiveFile(noAccountPath), assertArchiveError("ACCOUNT_ARCHIVE_ACCOUNT_MISSING"));

  const orphanChecksum = "f".repeat(64);
  const orphanZip = rawZip([...entries, { name: `payloads/${orphanChecksum}.json`, data: Buffer.from("{}") }]);
  const orphanPath = join(fixture.directory, "orphan.zip");
  await writeFile(orphanPath, orphanZip);
  await assert.rejects(inspectAccountArchiveFile(orphanPath), assertArchiveError("ACCOUNT_ARCHIVE_BLOB_ORPHANED"));

  const accountBytes = Buffer.from('{"z":1,"a":2}', "utf8");
  const manifest = buildAccountArchiveManifest({ exportedAt: 1, schemaVersion: 7, accountBytes, refs: [] });
  const nonCanonicalAccount = rawZip([
    { name: "account.json", data: accountBytes },
    { name: "manifest.json", data: Buffer.from(canonicalJson(manifest)) },
  ]);
  const accountPath = join(fixture.directory, "account-noncanonical.zip");
  await writeFile(accountPath, nonCanonicalAccount);
  await assert.rejects(inspectAccountArchiveFile(accountPath), assertArchiveError("ACCOUNT_ARCHIVE_JSON_INVALID"));

  const canonicalAccountBytes = Buffer.from('{"a":2,"z":1}', "utf8");
  const canonicalManifest = buildAccountArchiveManifest({ exportedAt: 1, schemaVersion: 7, accountBytes: canonicalAccountBytes, refs: [] });
  const nonCanonicalManifest = rawZip([
    { name: "account.json", data: canonicalAccountBytes },
    { name: "manifest.json", data: Buffer.from(JSON.stringify(canonicalManifest, null, 2)) },
  ]);
  const manifestPath = join(fixture.directory, "manifest-noncanonical.zip");
  await writeFile(manifestPath, nonCanonicalManifest);
  await assert.rejects(inspectAccountArchiveFile(manifestPath), assertArchiveError("ACCOUNT_ARCHIVE_MANIFEST_INVALID"));
});

test("truncation and path replacement are detected against the fixed open view", async (t) => {
  const body = payload("normal", "fixed", 512 * 1_024);
  const fixture = await makeFixture(t, [saveRef(body)]);
  const truncation = await inspectAccountArchiveFile(fixture.path, { limits: { chunkBytes: 1024 } });
  await truncate(fixture.path, fixture.bytes.byteLength - 10);
  await assert.rejects(collect(truncation.openPayload(sha256(body))), assertArchiveError("ACCOUNT_ARCHIVE_FILE_CHANGED"));
  await truncation.close();

  await writeFile(fixture.path, fixture.bytes);
  const replacement = await inspectAccountArchiveFile(fixture.path);
  const replacementPath = join(fixture.directory, "replacement.zip");
  await writeFile(replacementPath, fixture.bytes);
  let replacementPrevented = false;
  try {
    await rename(replacementPath, fixture.path);
  } catch (error) {
    if (process.platform !== "win32" || error?.code !== "EPERM") throw error;
    replacementPrevented = true;
  }
  if (replacementPrevented) {
    assert.equal(process.platform, "win32");
  } else {
    await assert.rejects(collect(replacement.openPayload(sha256(body))), assertArchiveError("ACCOUNT_ARCHIVE_FILE_CHANGED"));
  }
  await replacement.close();
});

test("AbortSignal cancels iteration and close releases the descriptor without leaks", async (t) => {
  const body = payload("normal", "cancel", 2 * 1_048_576);
  const fixture = await makeFixture(t, [saveRef(body)]);
  const inspection = await inspectAccountArchiveFile(fixture.path, { limits: { chunkBytes: 1024 } });
  const controller = new AbortController();
  const iterator = inspection.openPayload(sha256(body), { signal: controller.signal })[Symbol.asyncIterator]();
  const first = await iterator.next();
  assert.equal(first.done, false);
  controller.abort();
  await assert.rejects(iterator.next(), assertArchiveError("ACCOUNT_ARCHIVE_ABORTED"));
  await inspection.close();
  assert.equal(inspection.closed, true);
  await assert.rejects(collect(inspection.openPayload(sha256(body))), assertArchiveError("ACCOUNT_ARCHIVE_FILE_CLOSED"));
  const renamed = join(fixture.directory, "closed.zip");
  await rename(fixture.path, renamed);
  const handle = await open(renamed, "r+");
  await handle.close();
});

test("close actively terminates a paused payload iterator", async (t) => {
  const body = payload("normal", "close-paused", 2 * 1_048_576);
  const fixture = await makeFixture(t, [saveRef(body)]);
  const inspection = await inspectAccountArchiveFile(fixture.path, { limits: { chunkBytes: 1024 } });
  const iterator = inspection.openPayload(sha256(body))[Symbol.asyncIterator]();
  assert.equal((await iterator.next()).done, false);
  await Promise.race([
    inspection.close(),
    new Promise((_, reject) => setTimeout(() => reject(new Error("close timed out with a paused iterator")), 2_000)),
  ]);
  assert.equal(inspection.closed, true);
  assert.equal((await iterator.next()).done, true);
});

test("breaking a payload stream early is explicit and validate helper closes on failure", async (t) => {
  const body = payload("normal", "partial", 128 * 1_024);
  const fixture = await makeFixture(t, [saveRef(body)]);
  const inspection = await inspectAccountArchiveFile(fixture.path, { limits: { chunkBytes: 1024 } });
  await assert.rejects(async () => {
    for await (const _chunk of inspection.openPayload(sha256(body))) break;
  }, assertArchiveError("ACCOUNT_ARCHIVE_STREAM_INCOMPLETE"));
  await inspection.close();

  const damaged = Buffer.from(fixture.bytes);
  const entry = locateEntries(damaged).find(({ name }) => name.startsWith("payloads/"));
  damaged[entry.dataOffset + 5] ^= 1;
  const path = join(fixture.directory, "failure-closes.zip");
  await writeFile(path, damaged);
  await assert.rejects(validateAccountArchiveFile(path), assertArchiveError("ACCOUNT_ARCHIVE_CRC_MISMATCH"));
  const closedPath = join(fixture.directory, "failure-closed.zip");
  await rename(path, closedPath);
  const handle = await open(closedPath, "r+");
  await handle.close();
});
