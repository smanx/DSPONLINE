import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { Writable } from "node:stream";
import test from "node:test";

import {
  ACCOUNT_ARCHIVE_FORMAT,
  ACCOUNT_ARCHIVE_MANIFEST_VERSION,
  AccountArchiveError,
  buildAccountArchiveManifest,
  createAccountArchiveZipStream,
  normalizeAccountArchiveManifest,
  readAccountArchiveZip,
} from "./account-archive.mjs";

const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_DESCRIPTOR_SIGNATURE = 0x08074b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
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

function payload(mode, marker = "fixture") {
  return Buffer.from(JSON.stringify({
    formatVersion: 2,
    mode,
    savedAt: 1_786_588_800_000,
    checksum: "1234abcd",
    state: { version: 46, mode, entities: [], marker },
  }), "utf8");
}

function legacySpeedrunPayload(marker = "legacy-speedrun") {
  return Buffer.from(JSON.stringify({
    formatVersion: 2,
    checksum: "1234abcd",
    state: {
      version: 46,
      entities: [],
      marker,
      speedrun: { enabled: true, mode: "speedrun", factoryId: "factory_0123456789abcdef" },
    },
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

function archiveInput(saves, overrides = {}) {
  return {
    exportedAt: 1_786_588_900_000,
    schemaVersion: 7,
    accountData: {
      user: { id: "synthetic_user", displayName: "Synthetic" },
      submissions: [],
      feedback: [],
      errors: [],
    },
    saves,
    ...overrides,
  };
}

async function collect(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function createArchive(input, options = {}) {
  const prepared = createAccountArchiveZipStream(input, options);
  const bytes = await collect(prepared.stream);
  assert.equal(bytes.byteLength, prepared.byteLength);
  return { ...prepared, bytes };
}

function assertArchiveError(code) {
  return (error) => {
    assert.ok(error instanceof AccountArchiveError);
    assert.equal(error.code, code);
    return true;
  };
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

function rawZip(entries, { crcOverride = new Map() } = {}) {
  const localParts = [];
  const records = [];
  let offset = 0;
  for (const [index, source] of entries.entries()) {
    const nameBytes = Buffer.from(source.name, "utf8");
    const data = Buffer.from(source.data);
    const crc = crcOverride.has(index) ? crcOverride.get(index) : crc32(data);
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
  const centralBytes = offset - centralOffset;
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(ZIP_EOCD_SIGNATURE, 0);
  footer.writeUInt16LE(entries.length, 8);
  footer.writeUInt16LE(entries.length, 10);
  footer.writeUInt32LE(centralBytes, 12);
  footer.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([...localParts, ...centralParts, footer]);
}

function extractEntries(zip) {
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
    const localExtraLength = zip.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    entries.push({ name, data: Buffer.from(zip.subarray(dataOffset, dataOffset + size)), dataOffset });
    cursor += 46 + nameLength + zip.readUInt16LE(cursor + 30) + zip.readUInt16LE(cursor + 32);
  }
  return entries;
}

test("manifest-v2 is deterministic, normalized, and protected by SHA-256", () => {
  const normal = payload("normal", "normal-main");
  const speedrun = payload("speedrun", "speedrun-slot");
  const accountBytes = Buffer.from('{"user":{"id":"synthetic_user"}}', "utf8");
  const refs = [
    saveRef(speedrun, { mode: "speedrun", slot: "2", revision: 8 }),
    saveRef(normal, { mode: "normal", slot: "main", revision: 3 }),
  ];
  const manifest = buildAccountArchiveManifest({ exportedAt: 123, schemaVersion: 7, accountBytes, refs });

  assert.equal(manifest.format, ACCOUNT_ARCHIVE_FORMAT);
  assert.equal(manifest.manifestVersion, ACCOUNT_ARCHIVE_MANIFEST_VERSION);
  assert.deepEqual(manifest.refs.map(({ mode, slot, revision }) => ({ mode, slot, revision })), [
    { mode: "normal", slot: "main", revision: 3 },
    { mode: "speedrun", slot: "2", revision: 8 },
  ]);
  assert.deepEqual(Object.keys(manifest.refs[0]).sort(), [
    "blob", "checksum", "integrity", "mode", "revision", "size", "slot", "updatedAt",
  ]);
  assert.deepEqual(manifest.refs[0].integrity, { algorithm: "sha256", value: manifest.refs[0].checksum });
  assert.equal(manifest.blobs.length, 2);
  assert.deepEqual(normalizeAccountArchiveManifest(JSON.parse(JSON.stringify(manifest))), manifest);

  const tampered = structuredClone(manifest);
  tampered.exportedAt += 1;
  assert.throws(() => normalizeAccountArchiveManifest(tampered), assertArchiveError("ACCOUNT_ARCHIVE_MANIFEST_INTEGRITY_INVALID"));
});

test("streamed ZIP round-trips normal and speedrun refs without changing payload bytes", async () => {
  const normal = payload("normal", "普通模式-😀");
  const speedrun = payload("speedrun", "speedrun-main");
  const input = archiveInput([
    saveRef(normal, { revision: 5 }),
    saveRef(normal, { slot: "1", revision: 2 }),
    saveRef(speedrun, { mode: "speedrun", slot: "main", revision: 7 }),
  ]);
  const { bytes, manifest } = await createArchive(input, { chunkBytes: 17 });
  const restored = readAccountArchiveZip(bytes);

  assert.deepEqual(restored.manifest, manifest);
  assert.deepEqual(restored.accountData, input.accountData);
  assert.deepEqual([...restored.payloads.keys()].sort(), [sha256(normal), sha256(speedrun)].sort());
  assert.ok(restored.payloads.get(sha256(normal)).equals(normal));
  assert.ok(restored.payloads.get(sha256(speedrun)).equals(speedrun));
  assert.deepEqual(restored.manifest.refs.map(({ mode, slot, revision }) => ({ mode, slot, revision })), [
    { mode: "normal", slot: "main", revision: 5 },
    { mode: "normal", slot: "1", revision: 2 },
    { mode: "speedrun", slot: "main", revision: 7 },
  ]);
});

test("an account with no cloud save refs still round-trips as a valid two-entry archive", async () => {
  const input = archiveInput([]);
  const { bytes, manifest } = await createArchive(input);
  const restored = readAccountArchiveZip(bytes);

  assert.deepEqual(restored.accountData, input.accountData);
  assert.deepEqual(restored.manifest, manifest);
  assert.deepEqual(manifest.refs, []);
  assert.deepEqual(manifest.blobs, []);
  assert.equal(restored.payloads.size, 0);
  assert.deepEqual(extractEntries(bytes).map((entry) => entry.name), ["account.json", "manifest.json"]);
});

test("duplicate revision payloads create one physical checksum blob and consume one source", async () => {
  const bytes = payload("normal", "deduplicated");
  let firstReads = 0;
  let duplicateReads = 0;
  async function* firstSource() {
    firstReads += 1;
    yield bytes.subarray(0, 9);
    yield bytes.subarray(9);
  }
  async function* duplicateSource() {
    duplicateReads += 1;
    throw new Error("duplicate payload source must not be consumed");
  }
  const digest = sha256(bytes);
  const saves = [
    saveRef(bytes, { revision: 1, payload: firstSource }),
    saveRef(bytes, { revision: 2, payload: duplicateSource }),
  ];
  const { bytes: zip, manifest } = await createArchive(archiveInput(saves));
  const rawEntries = extractEntries(zip);

  assert.equal(firstReads, 1);
  assert.equal(duplicateReads, 0);
  assert.equal(manifest.refs.length, 2);
  assert.equal(manifest.blobs.length, 1);
  assert.equal(rawEntries.filter((entry) => entry.name === `payloads/${digest}.json`).length, 1);
  assert.equal(readAccountArchiveZip(zip).payloads.size, 1);
});

test("stream source is lazy and remains bounded by downstream backpressure", async () => {
  const bytes = Buffer.concat([
    Buffer.from('{"formatVersion":2,"mode":"normal","state":{"version":46,"mode":"normal","entities":[],"padding":"'),
    Buffer.alloc(256 * 1_024, 0x61),
    Buffer.from('"}}'),
  ]);
  const totalChunks = Math.ceil(bytes.byteLength / 1_024);
  let produced = 0;
  async function* source() {
    for (let offset = 0; offset < bytes.byteLength; offset += 1_024) {
      produced += 1;
      yield bytes.subarray(offset, Math.min(offset + 1_024, bytes.byteLength));
    }
  }
  const prepared = createAccountArchiveZipStream(archiveInput([
    saveRef(bytes, { payload: source }),
  ]), { chunkBytes: 1_024 });
  assert.equal(produced, 0, "preflight must not consume a payload source");

  let writes = 0;
  const sink = new Writable({
    highWaterMark: 1,
    write(_chunk, _encoding, callback) {
      writes += 1;
      setTimeout(callback, 2);
    },
  });
  prepared.stream.pipe(sink);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(produced > 0, "streaming should have started");
  assert.ok(produced < totalChunks, "a slow response must not drain the complete payload source eagerly");
  await once(sink, "finish");
  assert.equal(produced, totalChunks);
  assert.ok(writes >= totalChunks);
});

test("aborting a stream stops a lazy source and surfaces a stable cancellation code", async () => {
  const bytes = payload("normal", "cancelled");
  const controller = new AbortController();
  let returned = false;
  async function* source() {
    try {
      yield bytes.subarray(0, 5);
      controller.abort();
      yield bytes.subarray(5);
    } finally {
      returned = true;
    }
  }
  const prepared = createAccountArchiveZipStream(archiveInput([
    saveRef(bytes, { payload: source }),
  ]), { signal: controller.signal, chunkBytes: 5 });

  await assert.rejects(collect(prepared.stream), assertArchiveError("ACCOUNT_ARCHIVE_ABORTED"));
  assert.equal(returned, true);
});

test("writer rejects duplicate revision identities and conflicting checksum metadata", () => {
  const bytes = payload("normal");
  assert.throws(() => createAccountArchiveZipStream(archiveInput([
    saveRef(bytes, { revision: 4 }),
    saveRef(bytes, { revision: 4 }),
  ])), assertArchiveError("ACCOUNT_ARCHIVE_REF_DUPLICATE"));

  assert.throws(() => createAccountArchiveZipStream(archiveInput([
    saveRef(bytes, { revision: 4 }),
    saveRef(bytes, { revision: 5, size: bytes.byteLength + 1 }),
  ])), assertArchiveError("ACCOUNT_ARCHIVE_BLOB_CONFLICT"));
});

test("writer rejects mode/slot/checksum/size errors before consuming payload sources", () => {
  const bytes = payload("normal");
  let consumed = false;
  const lazy = () => {
    consumed = true;
    return bytes;
  };
  assert.throws(() => createAccountArchiveZipStream(archiveInput([
    saveRef(bytes, { mode: "modded", payload: lazy }),
  ])), assertArchiveError("ACCOUNT_ARCHIVE_MODE_INVALID"));
  assert.throws(() => createAccountArchiveZipStream(archiveInput([
    saveRef(bytes, { slot: "4", payload: lazy }),
  ])), assertArchiveError("ACCOUNT_ARCHIVE_SLOT_INVALID"));
  assert.throws(() => createAccountArchiveZipStream(archiveInput([
    saveRef(bytes, { checksum: "ABC", payload: lazy }),
  ])), assertArchiveError("ACCOUNT_ARCHIVE_CHECKSUM_INVALID"));
  assert.throws(() => createAccountArchiveZipStream(archiveInput([
    saveRef(bytes, { size: bytes.byteLength + 1, payload: lazy }),
  ]), { maxPayloadBytes: bytes.byteLength }), assertArchiveError("ACCOUNT_ARCHIVE_PAYLOAD_LIMIT_EXCEEDED"));
  assert.equal(consumed, false);
});

test("writer detects source size and SHA-256 mismatches while streaming", async () => {
  const bytes = payload("normal");
  const short = createAccountArchiveZipStream(archiveInput([
    saveRef(bytes, { payload: bytes.subarray(0, bytes.byteLength - 1) }),
  ])).stream;
  await assert.rejects(collect(short), assertArchiveError("ACCOUNT_ARCHIVE_PAYLOAD_SIZE_MISMATCH"));

  const changed = Buffer.from(bytes);
  changed[changed.byteLength - 2] ^= 1;
  const corrupt = createAccountArchiveZipStream(archiveInput([
    saveRef(bytes, { payload: changed }),
  ])).stream;
  await assert.rejects(collect(corrupt), assertArchiveError("ACCOUNT_ARCHIVE_PAYLOAD_CHECKSUM_MISMATCH"));
});

test("ZIP32 preflight explicitly rejects an archive approaching 4 GiB without reading the source", () => {
  let consumed = false;
  const declaredSize = 0xffff_fee0;
  assert.throws(() => createAccountArchiveZipStream(archiveInput([{
    mode: "normal",
    slot: "main",
    revision: 1,
    updatedAt: 1,
    size: declaredSize,
    checksum: "0".repeat(64),
    payload: () => {
      consumed = true;
      return Buffer.alloc(0);
    },
  }]), {
    maxPayloadBytes: 0xffff_fffe,
    maxTotalUncompressedBytes: 0xffff_fffe,
    maxArchiveBytes: 0xffff_fffe,
  }), assertArchiveError("ACCOUNT_ARCHIVE_ZIP32_LIMIT_EXCEEDED"));
  assert.equal(consumed, false);
});

test("reader rejects path traversal before exposing any entry", () => {
  const malicious = rawZip([
    { name: "../evil.json", data: Buffer.from("{}") },
    { name: "account.json", data: Buffer.from("{}") },
  ]);
  assert.throws(() => readAccountArchiveZip(malicious), assertArchiveError("ACCOUNT_ARCHIVE_PATH_INVALID"));
});

test("reader rejects duplicate entry paths", () => {
  const malicious = rawZip([
    { name: "account.json", data: Buffer.from("{}") },
    { name: "account.json", data: Buffer.from("{}") },
    { name: "manifest.json", data: Buffer.from("{}") },
  ]);
  assert.throws(() => readAccountArchiveZip(malicious), assertArchiveError("ACCOUNT_ARCHIVE_ENTRY_DUPLICATE"));
});

test("reader rejects CRC damage even when central and descriptor CRC agree", () => {
  const malicious = rawZip([
    { name: "account.json", data: Buffer.from("{}") },
    { name: "manifest.json", data: Buffer.from("{}") },
  ], { crcOverride: new Map([[0, 0]]) });
  assert.throws(() => readAccountArchiveZip(malicious), assertArchiveError("ACCOUNT_ARCHIVE_CRC_MISMATCH"));
});

test("reader rejects missing manifest and missing account metadata", async () => {
  const bytes = payload("normal");
  const digest = sha256(bytes);
  const withoutManifest = rawZip([
    { name: "account.json", data: Buffer.from("{}") },
    { name: `payloads/${digest}.json`, data: bytes },
  ]);
  assert.throws(() => readAccountArchiveZip(withoutManifest), assertArchiveError("ACCOUNT_ARCHIVE_MANIFEST_MISSING"));

  const valid = await createArchive(archiveInput([saveRef(bytes)]));
  const entries = extractEntries(valid.bytes);
  const withoutAccount = rawZip(entries.filter((entry) => entry.name !== "account.json"));
  assert.throws(() => readAccountArchiveZip(withoutAccount), assertArchiveError("ACCOUNT_ARCHIVE_ACCOUNT_MISSING"));
});

test("reader rejects a manifest-referenced blob that is absent", async () => {
  const bytes = payload("normal");
  const valid = await createArchive(archiveInput([saveRef(bytes)]));
  const entries = extractEntries(valid.bytes);
  const withoutBlob = rawZip(entries.filter((entry) => !entry.name.startsWith("payloads/")));
  assert.throws(() => readAccountArchiveZip(withoutBlob), assertArchiveError("ACCOUNT_ARCHIVE_BLOB_MISSING"));
});

test("reader rejects a non-object account.json even when its descriptor is internally consistent", async () => {
  const bytes = payload("normal");
  const accountBytes = Buffer.from("[]", "utf8");
  const ref = saveRef(bytes);
  const manifest = buildAccountArchiveManifest({
    exportedAt: 1,
    schemaVersion: 7,
    accountBytes,
    refs: [ref],
  });
  const malicious = rawZip([
    { name: "account.json", data: accountBytes },
    { name: `payloads/${ref.checksum}.json`, data: bytes },
    { name: "manifest.json", data: Buffer.from(canonicalJson(manifest), "utf8") },
  ]);
  assert.throws(() => readAccountArchiveZip(malicious), assertArchiveError("ACCOUNT_ARCHIVE_JSON_INVALID"));
});

test("reader rejects unreferenced payload blobs", async () => {
  const bytes = payload("normal");
  const orphan = payload("normal", "orphan");
  const valid = await createArchive(archiveInput([saveRef(bytes)]));
  const entries = extractEntries(valid.bytes);
  entries.splice(1, 0, { name: `payloads/${sha256(orphan)}.json`, data: orphan });
  assert.throws(() => readAccountArchiveZip(rawZip(entries)), assertArchiveError("ACCOUNT_ARCHIVE_BLOB_ORPHANED"));
});

test("reader rejects a valid ZIP whose manifest content no longer matches its integrity", async () => {
  const bytes = payload("normal");
  const valid = await createArchive(archiveInput([saveRef(bytes)]));
  const entries = extractEntries(valid.bytes);
  const manifestEntry = entries.find((entry) => entry.name === "manifest.json");
  const manifest = JSON.parse(manifestEntry.data.toString("utf8"));
  manifest.exportedAt += 1;
  manifestEntry.data = Buffer.from(JSON.stringify(manifest), "utf8");
  assert.throws(() => readAccountArchiveZip(rawZip(entries)), assertArchiveError("ACCOUNT_ARCHIVE_MANIFEST_INTEGRITY_INVALID"));
});

test("reader rejects CRC-valid payload content whose SHA-256 differs from the manifest", async () => {
  const bytes = payload("normal");
  const valid = await createArchive(archiveInput([saveRef(bytes)]));
  const entries = extractEntries(valid.bytes);
  const payloadEntry = entries.find((entry) => entry.name.startsWith("payloads/"));
  payloadEntry.data = payload("normal", "different-but-valid");
  assert.throws(() => readAccountArchiveZip(rawZip(entries)), assertArchiveError("ACCOUNT_ARCHIVE_BLOB_INTEGRITY_INVALID"));
});

test("reader enforces normal/speedrun mode isolation, including legacy speedrun identity", async () => {
  const explicitSpeedrun = payload("speedrun", "wrong-ref-mode");
  const explicitArchive = await createArchive(archiveInput([
    saveRef(explicitSpeedrun, { mode: "normal" }),
  ]));
  assert.throws(() => readAccountArchiveZip(explicitArchive.bytes), assertArchiveError("ACCOUNT_ARCHIVE_MODE_MISMATCH"));

  const legacy = legacySpeedrunPayload();
  const legacyArchive = await createArchive(archiveInput([
    saveRef(legacy, { mode: "speedrun" }),
  ]));
  const restored = readAccountArchiveZip(legacyArchive.bytes);
  assert.ok(restored.payloads.get(sha256(legacy)).equals(legacy));
});

test("reader rejects conflicting envelope/state mode markers", async () => {
  const bytes = Buffer.from(JSON.stringify({
    formatVersion: 2,
    mode: "normal",
    state: { version: 46, mode: "speedrun", entities: [] },
  }), "utf8");
  const validZip = await createArchive(archiveInput([saveRef(bytes)]));
  assert.throws(() => readAccountArchiveZip(validZip.bytes), assertArchiveError("ACCOUNT_ARCHIVE_MODE_INVALID"));
});

test("reader applies independent entry, payload, account, manifest, and total limits", async () => {
  const bytes = payload("normal", "limits");
  const valid = await createArchive(archiveInput([saveRef(bytes)]));
  assert.throws(() => readAccountArchiveZip(valid.bytes, { maxEntries: 2 }), assertArchiveError("ACCOUNT_ARCHIVE_ENTRY_LIMIT_EXCEEDED"));
  assert.throws(() => readAccountArchiveZip(valid.bytes, { maxPayloadBytes: bytes.byteLength - 1 }), assertArchiveError("ACCOUNT_ARCHIVE_ENTRY_LIMIT_EXCEEDED"));
  assert.throws(() => readAccountArchiveZip(valid.bytes, { maxAccountBytes: 2 }), assertArchiveError("ACCOUNT_ARCHIVE_ENTRY_LIMIT_EXCEEDED"));
  assert.throws(() => readAccountArchiveZip(valid.bytes, { maxManifestBytes: 2 }), assertArchiveError("ACCOUNT_ARCHIVE_ENTRY_LIMIT_EXCEEDED"));
  assert.throws(() => readAccountArchiveZip(valid.bytes, { maxTotalUncompressedBytes: bytes.byteLength }), assertArchiveError("ACCOUNT_ARCHIVE_TOTAL_LIMIT_EXCEEDED"));
  assert.throws(() => readAccountArchiveZip(valid.bytes, { maxArchiveBytes: valid.bytes.byteLength - 1 }), assertArchiveError("ACCOUNT_ARCHIVE_TOTAL_LIMIT_EXCEEDED"));
});
