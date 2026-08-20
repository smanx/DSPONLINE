import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { TextDecoder } from "node:util";

export const ACCOUNT_ARCHIVE_FORMAT = "dspidle-account-archive";
export const ACCOUNT_ARCHIVE_MANIFEST_VERSION = 2;

const ACCOUNT_ENTRY_PATH = "account.json";
const MANIFEST_ENTRY_PATH = "manifest.json";
const PAYLOAD_PATH_PATTERN = /^payloads\/([a-f0-9]{64})\.json$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAVE_MODES = new Set(["normal", "speedrun"]);
const SAVE_SLOTS = new Set(["main", "1", "2", "3"]);
const ZIP32_SENTINEL_UINT32 = 0xffff_ffff;
const ZIP32_SENTINEL_UINT16 = 0xffff;
const ZIP32_SAFE_MAX_UINT32 = ZIP32_SENTINEL_UINT32 - 1;
const ZIP32_SAFE_MAX_ENTRIES = ZIP32_SENTINEL_UINT16 - 1;
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_DATA_DESCRIPTOR_SIGNATURE = 0x08074b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_UTF8_DATA_DESCRIPTOR_FLAGS = 0x0808;
const ZIP_STORE_METHOD = 0;
const ZIP_VERSION_20 = 20;
const ZIP_LOCAL_HEADER_BYTES = 30;
const ZIP_DATA_DESCRIPTOR_BYTES = 16;
const ZIP_CENTRAL_HEADER_BYTES = 46;
const ZIP_EOCD_BYTES = 22;
const ZIP_DOS_DATE_1980_01_01 = 0x0021;
const MANIFEST_CANONICALIZATION = "dspidle-json-sort-v1";
const MANIFEST_INTEGRITY_SCOPE = "manifest-without-integrity";
const DEFAULT_PAYLOAD_BYTES = 33_553_408;

export const DEFAULT_ACCOUNT_ARCHIVE_LIMITS = Object.freeze({
  maxEntries: 512,
  maxRefs: 1_024,
  maxPathBytes: 256,
  maxPayloadBytes: DEFAULT_PAYLOAD_BYTES,
  maxAccountBytes: 16 * 1_048_576,
  maxManifestBytes: 8 * 1_048_576,
  maxTotalUncompressedBytes: ZIP32_SAFE_MAX_UINT32,
  maxArchiveBytes: ZIP32_SAFE_MAX_UINT32,
  chunkBytes: 64 * 1_024,
});

/** A stable, non-sensitive error code accompanies every rejected archive. */
export class AccountArchiveError extends Error {
  constructor(code, message, options = undefined) {
    super(message, options);
    this.name = "AccountArchiveError";
    this.code = code;
  }
}

function fail(code, message, options = undefined) {
  throw new AccountArchiveError(code, message, options);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("ACCOUNT_ARCHIVE_MANIFEST_INVALID", `${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail("ACCOUNT_ARCHIVE_MANIFEST_INVALID", `${label} contains unexpected or missing fields`);
  }
}

function boundedInteger(value, minimum, maximum, label, code = "ACCOUNT_ARCHIVE_MANIFEST_INVALID") {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(code, `${label} is outside its supported range`);
  }
  return value;
}

function normalizeLimit(value, fallback, maximum, label) {
  if (value === undefined) return fallback;
  return boundedInteger(value, 1, maximum, label, "ACCOUNT_ARCHIVE_LIMIT_INVALID");
}

function archiveLimits(options = {}) {
  const source = options?.limits && typeof options.limits === "object" ? options.limits : options;
  const limits = {
    maxEntries: normalizeLimit(source?.maxEntries, DEFAULT_ACCOUNT_ARCHIVE_LIMITS.maxEntries, ZIP32_SAFE_MAX_ENTRIES, "maxEntries"),
    maxRefs: normalizeLimit(source?.maxRefs, DEFAULT_ACCOUNT_ARCHIVE_LIMITS.maxRefs, ZIP32_SAFE_MAX_ENTRIES, "maxRefs"),
    maxPathBytes: normalizeLimit(source?.maxPathBytes, DEFAULT_ACCOUNT_ARCHIVE_LIMITS.maxPathBytes, 65_535, "maxPathBytes"),
    maxPayloadBytes: normalizeLimit(source?.maxPayloadBytes, DEFAULT_ACCOUNT_ARCHIVE_LIMITS.maxPayloadBytes, ZIP32_SAFE_MAX_UINT32, "maxPayloadBytes"),
    maxAccountBytes: normalizeLimit(source?.maxAccountBytes, DEFAULT_ACCOUNT_ARCHIVE_LIMITS.maxAccountBytes, ZIP32_SAFE_MAX_UINT32, "maxAccountBytes"),
    maxManifestBytes: normalizeLimit(source?.maxManifestBytes, DEFAULT_ACCOUNT_ARCHIVE_LIMITS.maxManifestBytes, ZIP32_SAFE_MAX_UINT32, "maxManifestBytes"),
    maxTotalUncompressedBytes: normalizeLimit(source?.maxTotalUncompressedBytes, DEFAULT_ACCOUNT_ARCHIVE_LIMITS.maxTotalUncompressedBytes, ZIP32_SAFE_MAX_UINT32, "maxTotalUncompressedBytes"),
    maxArchiveBytes: normalizeLimit(source?.maxArchiveBytes, DEFAULT_ACCOUNT_ARCHIVE_LIMITS.maxArchiveBytes, ZIP32_SAFE_MAX_UINT32, "maxArchiveBytes"),
    chunkBytes: normalizeLimit(source?.chunkBytes, DEFAULT_ACCOUNT_ARCHIVE_LIMITS.chunkBytes, 16 * 1_048_576, "chunkBytes"),
  };
  if (limits.maxEntries < 2) fail("ACCOUNT_ARCHIVE_LIMIT_INVALID", "maxEntries must leave room for account.json and manifest.json");
  return limits;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalJsonValue(value, seen) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("ACCOUNT_ARCHIVE_JSON_INVALID", "archive JSON cannot contain non-finite numbers");
    return JSON.stringify(value);
  }
  if (typeof value !== "object" || value === null || typeof value.toJSON === "function") {
    fail("ACCOUNT_ARCHIVE_JSON_INVALID", "archive JSON contains an unsupported value");
  }
  if (seen.has(value)) fail("ACCOUNT_ARCHIVE_JSON_INVALID", "archive JSON cannot contain cycles");
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    result = `[${value.map((entry) => canonicalJsonValue(entry, seen)).join(",")}]`;
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      fail("ACCOUNT_ARCHIVE_JSON_INVALID", "archive JSON objects must use a plain prototype");
    }
    result = `{${Object.keys(value).sort(compareText).map((key) => {
      const entry = value[key];
      if (entry === undefined || typeof entry === "function" || typeof entry === "symbol" || typeof entry === "bigint") {
        fail("ACCOUNT_ARCHIVE_JSON_INVALID", "archive JSON contains a non-serializable field");
      }
      return `${JSON.stringify(key)}:${canonicalJsonValue(entry, seen)}`;
    }).join(",")}}`;
  }
  seen.delete(value);
  return result;
}

function canonicalJson(value) {
  return canonicalJsonValue(value, new Set());
}

function canonicalJsonBytes(value) {
  return Buffer.from(canonicalJson(value), "utf8");
}

function integrityDescriptor(value) {
  return { algorithm: "sha256", value };
}

function validateIntegrityDescriptor(value, expected, label) {
  exactKeys(value, ["algorithm", "value"], label);
  if (value.algorithm !== "sha256" || value.value !== expected) {
    fail("ACCOUNT_ARCHIVE_INTEGRITY_INVALID", `${label} does not match its SHA-256 checksum`);
  }
  return integrityDescriptor(expected);
}

function payloadPath(checksum) {
  return `payloads/${checksum}.json`;
}

function normalizeBuilderRef(value, limits) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("ACCOUNT_ARCHIVE_MANIFEST_INVALID", "each save ref must be an object");
  }
  const mode = value.mode;
  const slot = value.slot;
  if (!SAVE_MODES.has(mode)) fail("ACCOUNT_ARCHIVE_MODE_INVALID", "save ref mode must be normal or speedrun");
  if (!SAVE_SLOTS.has(slot)) fail("ACCOUNT_ARCHIVE_SLOT_INVALID", "save ref slot must be main, 1, 2, or 3");
  const revision = boundedInteger(value.revision, 1, Number.MAX_SAFE_INTEGER, "save ref revision");
  const updatedAt = boundedInteger(value.updatedAt, 0, Number.MAX_SAFE_INTEGER, "save ref updatedAt");
  const size = boundedInteger(value.size, 1, limits.maxPayloadBytes, "save ref size", "ACCOUNT_ARCHIVE_PAYLOAD_LIMIT_EXCEEDED");
  const checksum = value.checksum;
  if (typeof checksum !== "string" || !SHA256_PATTERN.test(checksum)) {
    fail("ACCOUNT_ARCHIVE_CHECKSUM_INVALID", "save ref checksum must be a lowercase SHA-256 digest");
  }
  return {
    mode,
    slot,
    revision,
    updatedAt,
    size,
    checksum,
    blob: payloadPath(checksum),
    integrity: integrityDescriptor(checksum),
  };
}

function compareRefs(left, right) {
  const modeOrder = left.mode === right.mode ? 0 : left.mode === "normal" ? -1 : 1;
  if (modeOrder) return modeOrder;
  const slots = ["main", "1", "2", "3"];
  const slotOrder = slots.indexOf(left.slot) - slots.indexOf(right.slot);
  return slotOrder || left.revision - right.revision || compareText(left.checksum, right.checksum);
}

function normalizedRefs(builderRefs, limits) {
  if (!Array.isArray(builderRefs)) fail("ACCOUNT_ARCHIVE_MANIFEST_INVALID", "manifest refs must be an array");
  if (builderRefs.length > limits.maxRefs) fail("ACCOUNT_ARCHIVE_ENTRY_LIMIT_EXCEEDED", "manifest contains too many save refs");
  const refs = builderRefs.map((entry) => normalizeBuilderRef(entry, limits)).sort(compareRefs);
  const identities = new Set();
  const blobs = new Map();
  for (const ref of refs) {
    const identity = `${ref.mode}\u0000${ref.slot}\u0000${ref.revision}`;
    if (identities.has(identity)) fail("ACCOUNT_ARCHIVE_REF_DUPLICATE", "manifest contains a duplicate mode/slot/revision ref");
    identities.add(identity);
    const previous = blobs.get(ref.checksum);
    if (previous && previous.size !== ref.size) {
      fail("ACCOUNT_ARCHIVE_BLOB_CONFLICT", "refs sharing a checksum must agree on payload size");
    }
    if (previous && previous.mode !== ref.mode) {
      fail("ACCOUNT_ARCHIVE_MODE_INVALID", "one payload checksum cannot belong to both normal and speedrun modes");
    }
    if (!previous) blobs.set(ref.checksum, { size: ref.size, mode: ref.mode });
  }
  return { refs, blobs };
}

function normalizedAccountDescriptor(value, limits) {
  exactKeys(value, ["path", "size", "integrity"], "manifest account descriptor");
  if (value.path !== ACCOUNT_ENTRY_PATH) fail("ACCOUNT_ARCHIVE_PATH_INVALID", "account descriptor path must be account.json");
  const size = boundedInteger(value.size, 2, limits.maxAccountBytes, "account metadata size", "ACCOUNT_ARCHIVE_ACCOUNT_LIMIT_EXCEEDED");
  const digest = value.integrity?.value;
  if (typeof digest !== "string" || !SHA256_PATTERN.test(digest)) {
    fail("ACCOUNT_ARCHIVE_INTEGRITY_INVALID", "account metadata SHA-256 is invalid");
  }
  return { path: ACCOUNT_ENTRY_PATH, size, integrity: validateIntegrityDescriptor(value.integrity, digest, "account integrity") };
}

function manifestCore({ exportedAt, schemaVersion, account, refs }, limits) {
  const normalizedExportedAt = boundedInteger(exportedAt, 0, Number.MAX_SAFE_INTEGER, "manifest exportedAt");
  const normalizedSchemaVersion = boundedInteger(schemaVersion, 1, 1_000_000, "manifest schemaVersion");
  const normalizedAccount = normalizedAccountDescriptor(account, limits);
  const normalized = normalizedRefs(refs, limits);
  const blobs = [...normalized.blobs.entries()].sort(([left], [right]) => compareText(left, right)).map(([checksum, descriptor]) => ({
    path: payloadPath(checksum),
    checksum,
    size: descriptor.size,
    integrity: integrityDescriptor(checksum),
  }));
  if (blobs.length + 2 > limits.maxEntries) fail("ACCOUNT_ARCHIVE_ENTRY_LIMIT_EXCEEDED", "archive contains too many unique payload blobs");
  return {
    format: ACCOUNT_ARCHIVE_FORMAT,
    manifestVersion: ACCOUNT_ARCHIVE_MANIFEST_VERSION,
    exportedAt: normalizedExportedAt,
    schemaVersion: normalizedSchemaVersion,
    account: normalizedAccount,
    refs: normalized.refs,
    blobs,
  };
}

function signedManifest(core) {
  const digest = sha256(canonicalJsonBytes(core));
  return {
    ...core,
    integrity: {
      algorithm: "sha256",
      canonicalization: MANIFEST_CANONICALIZATION,
      scope: MANIFEST_INTEGRITY_SCOPE,
      value: digest,
    },
  };
}

/**
 * Build a deterministic manifest-v2. `accountBytes` are the exact bytes that
 * will be stored as account.json; save payload bytes remain outside the
 * manifest and are addressed by their raw SHA-256 checksum.
 */
export function buildAccountArchiveManifest({ exportedAt, schemaVersion, accountBytes, refs }, options = {}) {
  const limits = archiveLimits(options);
  const bytes = bytesView(accountBytes, "accountBytes");
  if (bytes.byteLength < 2 || bytes.byteLength > limits.maxAccountBytes) {
    fail("ACCOUNT_ARCHIVE_ACCOUNT_LIMIT_EXCEEDED", "account.json exceeds the configured archive limit");
  }
  const account = {
    path: ACCOUNT_ENTRY_PATH,
    size: bytes.byteLength,
    integrity: integrityDescriptor(sha256(bytes)),
  };
  return signedManifest(manifestCore({ exportedAt, schemaVersion, account, refs }, limits));
}

function normalizeManifestRef(value, limits) {
  exactKeys(value, ["mode", "slot", "revision", "updatedAt", "size", "checksum", "blob", "integrity"], "save ref");
  const ref = normalizeBuilderRef(value, limits);
  if (value.blob !== ref.blob) fail("ACCOUNT_ARCHIVE_PATH_INVALID", "save ref blob path does not match its checksum");
  validateIntegrityDescriptor(value.integrity, ref.checksum, "save ref integrity");
  return ref;
}

function normalizeManifestBlob(value, limits) {
  exactKeys(value, ["path", "checksum", "size", "integrity"], "manifest blob descriptor");
  if (typeof value.checksum !== "string" || !SHA256_PATTERN.test(value.checksum)) {
    fail("ACCOUNT_ARCHIVE_CHECKSUM_INVALID", "manifest blob checksum must be a lowercase SHA-256 digest");
  }
  if (value.path !== payloadPath(value.checksum)) {
    fail("ACCOUNT_ARCHIVE_PATH_INVALID", "manifest blob path does not match its checksum");
  }
  const size = boundedInteger(value.size, 1, limits.maxPayloadBytes, "manifest blob size", "ACCOUNT_ARCHIVE_PAYLOAD_LIMIT_EXCEEDED");
  validateIntegrityDescriptor(value.integrity, value.checksum, "manifest blob integrity");
  return {
    path: value.path,
    checksum: value.checksum,
    size,
    integrity: integrityDescriptor(value.checksum),
  };
}

/** Verify and normalize a manifest-v2 without reading any payload body. */
export function normalizeAccountArchiveManifest(value, options = {}) {
  const limits = archiveLimits(options);
  exactKeys(value, ["format", "manifestVersion", "exportedAt", "schemaVersion", "account", "refs", "blobs", "integrity"], "manifest");
  if (value.format !== ACCOUNT_ARCHIVE_FORMAT || value.manifestVersion !== ACCOUNT_ARCHIVE_MANIFEST_VERSION) {
    fail("ACCOUNT_ARCHIVE_VERSION_UNSUPPORTED", "account archive manifest version is unsupported");
  }
  if (!Array.isArray(value.refs)) fail("ACCOUNT_ARCHIVE_MANIFEST_INVALID", "manifest refs must be an array");
  if (value.refs.length > limits.maxRefs) fail("ACCOUNT_ARCHIVE_ENTRY_LIMIT_EXCEEDED", "manifest contains too many save refs");
  const materializedRefs = value.refs.map((entry) => normalizeManifestRef(entry, limits));
  const core = manifestCore({
    exportedAt: value.exportedAt,
    schemaVersion: value.schemaVersion,
    account: value.account,
    refs: materializedRefs,
  }, limits);
  if (!Array.isArray(value.blobs)) fail("ACCOUNT_ARCHIVE_MANIFEST_INVALID", "manifest blobs must be an array");
  if (value.blobs.length + 2 > limits.maxEntries) fail("ACCOUNT_ARCHIVE_ENTRY_LIMIT_EXCEEDED", "manifest contains too many blob descriptors");
  const materializedBlobs = value.blobs.map((entry) => normalizeManifestBlob(entry, limits));
  if (canonicalJson(materializedBlobs) !== canonicalJson(core.blobs)) {
    fail("ACCOUNT_ARCHIVE_MANIFEST_INVALID", "manifest blob index is not the canonical ref-derived index");
  }
  exactKeys(value.integrity, ["algorithm", "canonicalization", "scope", "value"], "manifest integrity");
  const expected = sha256(canonicalJsonBytes(core));
  if (value.integrity.algorithm !== "sha256" || value.integrity.canonicalization !== MANIFEST_CANONICALIZATION ||
    value.integrity.scope !== MANIFEST_INTEGRITY_SCOPE || value.integrity.value !== expected) {
    fail("ACCOUNT_ARCHIVE_MANIFEST_INTEGRITY_INVALID", "manifest SHA-256 integrity check failed");
  }
  return signedManifest(core);
}

function bytesView(value, label = "archive bytes") {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  fail("ACCOUNT_ARCHIVE_INPUT_INVALID", `${label} must be a Buffer or Uint8Array`);
}

function sourceChunk(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (typeof value === "string") return Buffer.from(value, "utf8");
  fail("ACCOUNT_ARCHIVE_PAYLOAD_SOURCE_INVALID", "payload sources must yield strings, Buffers, or Uint8Arrays");
}

async function resolveSource(source) {
  let resolved = source;
  if (typeof resolved === "function") resolved = resolved();
  return await resolved;
}

async function* sourceChunks(source, chunkBytes, signal) {
  const resolved = await resolveSource(source);
  throwIfAborted(signal);
  if (typeof resolved === "string" || Buffer.isBuffer(resolved) || resolved instanceof Uint8Array) {
    const bytes = sourceChunk(resolved);
    for (let offset = 0; offset < bytes.byteLength; offset += chunkBytes) {
      throwIfAborted(signal);
      yield bytes.subarray(offset, Math.min(bytes.byteLength, offset + chunkBytes));
    }
    return;
  }
  const iterator = resolved?.[Symbol.asyncIterator]?.() ?? resolved?.[Symbol.iterator]?.();
  if (!iterator) fail("ACCOUNT_ARCHIVE_PAYLOAD_SOURCE_INVALID", "payload source is not iterable");
  try {
    while (true) {
      throwIfAborted(signal);
      const next = await iterator.next();
      if (next.done) break;
      const bytes = sourceChunk(next.value);
      for (let offset = 0; offset < bytes.byteLength; offset += chunkBytes) {
        throwIfAborted(signal);
        yield bytes.subarray(offset, Math.min(bytes.byteLength, offset + chunkBytes));
      }
    }
  } finally {
    if (typeof iterator.return === "function") await iterator.return();
  }
}

function throwIfAborted(signal) {
  if (signal?.aborted) fail("ACCOUNT_ARCHIVE_ABORTED", "account archive streaming was cancelled");
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

function crc32Update(crc, bytes) {
  let next = crc;
  for (let index = 0; index < bytes.byteLength; index += 1) next = CRC32_TABLE[(next ^ bytes[index]) & 0xff] ^ (next >>> 8);
  return next >>> 0;
}

function crc32(bytes) {
  return (crc32Update(0xffff_ffff, bytes) ^ 0xffff_ffff) >>> 0;
}

function localFileHeader(nameBytes) {
  const header = Buffer.alloc(ZIP_LOCAL_HEADER_BYTES + nameBytes.byteLength);
  header.writeUInt32LE(ZIP_LOCAL_FILE_HEADER_SIGNATURE, 0);
  header.writeUInt16LE(ZIP_VERSION_20, 4);
  header.writeUInt16LE(ZIP_UTF8_DATA_DESCRIPTOR_FLAGS, 6);
  header.writeUInt16LE(ZIP_STORE_METHOD, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(ZIP_DOS_DATE_1980_01_01, 12);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(0, 18);
  header.writeUInt32LE(0, 22);
  header.writeUInt16LE(nameBytes.byteLength, 26);
  header.writeUInt16LE(0, 28);
  nameBytes.copy(header, ZIP_LOCAL_HEADER_BYTES);
  return header;
}

function dataDescriptor(entry) {
  const descriptor = Buffer.alloc(ZIP_DATA_DESCRIPTOR_BYTES);
  descriptor.writeUInt32LE(ZIP_DATA_DESCRIPTOR_SIGNATURE, 0);
  descriptor.writeUInt32LE(entry.crc, 4);
  descriptor.writeUInt32LE(entry.size, 8);
  descriptor.writeUInt32LE(entry.size, 12);
  return descriptor;
}

function centralDirectoryHeader(entry) {
  const header = Buffer.alloc(ZIP_CENTRAL_HEADER_BYTES + entry.nameBytes.byteLength);
  header.writeUInt32LE(ZIP_CENTRAL_DIRECTORY_SIGNATURE, 0);
  header.writeUInt16LE(ZIP_VERSION_20, 4);
  header.writeUInt16LE(ZIP_VERSION_20, 6);
  header.writeUInt16LE(ZIP_UTF8_DATA_DESCRIPTOR_FLAGS, 8);
  header.writeUInt16LE(ZIP_STORE_METHOD, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt16LE(ZIP_DOS_DATE_1980_01_01, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.size, 20);
  header.writeUInt32LE(entry.size, 24);
  header.writeUInt16LE(entry.nameBytes.byteLength, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(entry.localOffset, 42);
  entry.nameBytes.copy(header, ZIP_CENTRAL_HEADER_BYTES);
  return header;
}

function endOfCentralDirectory(entryCount, centralBytes, centralOffset) {
  const footer = Buffer.alloc(ZIP_EOCD_BYTES);
  footer.writeUInt32LE(ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
  footer.writeUInt16LE(0, 4);
  footer.writeUInt16LE(0, 6);
  footer.writeUInt16LE(entryCount, 8);
  footer.writeUInt16LE(entryCount, 10);
  footer.writeUInt32LE(centralBytes, 12);
  footer.writeUInt32LE(centralOffset, 16);
  footer.writeUInt16LE(0, 20);
  return footer;
}

function safeArchiveName(name, limits) {
  if (typeof name !== "string" || name.length === 0 || name.includes("\0") || name.includes("\\") ||
    name.startsWith("/") || /^[A-Za-z]:/.test(name) || name.split("/").some((part) => part === "" || part === "." || part === "..")) {
    fail("ACCOUNT_ARCHIVE_PATH_INVALID", "ZIP entry path is unsafe");
  }
  if (name !== ACCOUNT_ENTRY_PATH && name !== MANIFEST_ENTRY_PATH && !PAYLOAD_PATH_PATTERN.test(name)) {
    fail("ACCOUNT_ARCHIVE_PATH_INVALID", "ZIP entry path is outside the account archive namespace");
  }
  const bytes = Buffer.from(name, "utf8");
  if (bytes.byteLength > limits.maxPathBytes || bytes.byteLength > 65_535) fail("ACCOUNT_ARCHIVE_PATH_INVALID", "ZIP entry path is too long");
  return bytes;
}

function plannedZipSize(entries, limits) {
  if (entries.length > limits.maxEntries || entries.length >= ZIP32_SENTINEL_UINT16) {
    fail("ACCOUNT_ARCHIVE_ENTRY_LIMIT_EXCEEDED", "ZIP32 entry limit would be exceeded");
  }
  let localBytes = 0n;
  let centralBytes = 0n;
  let totalUncompressed = 0n;
  for (const entry of entries) {
    const size = BigInt(entry.size);
    const nameBytes = BigInt(entry.nameBytes.byteLength);
    if (size >= BigInt(ZIP32_SENTINEL_UINT32)) fail("ACCOUNT_ARCHIVE_ZIP32_LIMIT_EXCEEDED", "an entry reaches the ZIP64 sentinel");
    localBytes += BigInt(ZIP_LOCAL_HEADER_BYTES + ZIP_DATA_DESCRIPTOR_BYTES) + nameBytes + size;
    centralBytes += BigInt(ZIP_CENTRAL_HEADER_BYTES) + nameBytes;
    totalUncompressed += size;
  }
  const total = localBytes + centralBytes + BigInt(ZIP_EOCD_BYTES);
  if (localBytes >= BigInt(ZIP32_SENTINEL_UINT32) || centralBytes >= BigInt(ZIP32_SENTINEL_UINT32) ||
    total >= BigInt(ZIP32_SENTINEL_UINT32)) {
    fail("ACCOUNT_ARCHIVE_ZIP32_LIMIT_EXCEEDED", "archive requires ZIP64 and was rejected before streaming");
  }
  if (totalUncompressed > BigInt(limits.maxTotalUncompressedBytes)) {
    fail("ACCOUNT_ARCHIVE_TOTAL_LIMIT_EXCEEDED", "archive uncompressed data exceeds the configured account limit");
  }
  if (total > BigInt(limits.maxArchiveBytes)) {
    fail("ACCOUNT_ARCHIVE_TOTAL_LIMIT_EXCEEDED", "archive exceeds the configured output limit");
  }
  return Number(total);
}

function prepareArchive(input, options) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("ACCOUNT_ARCHIVE_INPUT_INVALID", "archive input must be an object");
  const limits = archiveLimits(options);
  if (!input.accountData || typeof input.accountData !== "object" || Array.isArray(input.accountData)) {
    fail("ACCOUNT_ARCHIVE_INPUT_INVALID", "accountData must be a JSON object");
  }
  if (!Array.isArray(input.saves)) fail("ACCOUNT_ARCHIVE_INPUT_INVALID", "saves must be an array");
  const accountBytes = canonicalJsonBytes(input.accountData);
  if (accountBytes.byteLength > limits.maxAccountBytes) fail("ACCOUNT_ARCHIVE_ACCOUNT_LIMIT_EXCEEDED", "account.json exceeds the configured archive limit");
  const refs = input.saves.map(({ payload: _payload, ...ref }) => ref);
  const manifest = buildAccountArchiveManifest({
    exportedAt: input.exportedAt,
    schemaVersion: input.schemaVersion,
    accountBytes,
    refs,
  }, limits);
  const manifestBytes = canonicalJsonBytes(manifest);
  if (manifestBytes.byteLength > limits.maxManifestBytes) fail("ACCOUNT_ARCHIVE_MANIFEST_LIMIT_EXCEEDED", "manifest.json exceeds the configured archive limit");
  const sources = new Map();
  for (const save of input.saves) {
    if (save?.payload !== undefined && !sources.has(save.checksum)) sources.set(save.checksum, save.payload);
  }
  for (const blob of manifest.blobs) {
    if (!sources.has(blob.checksum)) fail("ACCOUNT_ARCHIVE_PAYLOAD_SOURCE_MISSING", `payload source is missing for ${blob.checksum}`);
  }
  const entries = [
    { name: ACCOUNT_ENTRY_PATH, size: accountBytes.byteLength, source: accountBytes, checksum: manifest.account.integrity.value },
    ...manifest.blobs.map((blob) => ({ name: blob.path, size: blob.size, source: sources.get(blob.checksum), checksum: blob.checksum })),
    { name: MANIFEST_ENTRY_PATH, size: manifestBytes.byteLength, source: manifestBytes, checksum: sha256(manifestBytes) },
  ].map((entry) => ({ ...entry, nameBytes: safeArchiveName(entry.name, limits) }));
  const byteLength = plannedZipSize(entries, limits);
  return { entries, manifest, byteLength, limits, signal: options?.signal };
}

async function* emitEntry(state, planned, limits, signal) {
  throwIfAborted(signal);
  const localOffset = state.offset;
  const local = localFileHeader(planned.nameBytes);
  state.offset += local.byteLength;
  yield local;
  let size = 0;
  let crc = 0xffff_ffff;
  const hash = createHash("sha256");
  for await (const bytes of sourceChunks(planned.source, limits.chunkBytes, signal)) {
    if (size + bytes.byteLength > planned.size) fail("ACCOUNT_ARCHIVE_PAYLOAD_SIZE_MISMATCH", `${planned.name} produced more bytes than declared`);
    size += bytes.byteLength;
    crc = crc32Update(crc, bytes);
    hash.update(bytes);
    state.offset += bytes.byteLength;
    yield bytes;
  }
  crc = (crc ^ 0xffff_ffff) >>> 0;
  if (size !== planned.size) fail("ACCOUNT_ARCHIVE_PAYLOAD_SIZE_MISMATCH", `${planned.name} size does not match its manifest ref`);
  if (hash.digest("hex") !== planned.checksum) fail("ACCOUNT_ARCHIVE_PAYLOAD_CHECKSUM_MISMATCH", `${planned.name} SHA-256 does not match its manifest ref`);
  const entry = { name: planned.name, nameBytes: planned.nameBytes, localOffset, size, crc };
  const descriptor = dataDescriptor(entry);
  state.offset += descriptor.byteLength;
  yield descriptor;
  return entry;
}

async function* generateArchive(plan) {
  const state = { offset: 0 };
  const completed = [];
  for (const entry of plan.entries) completed.push(yield* emitEntry(state, entry, plan.limits, plan.signal));
  throwIfAborted(plan.signal);
  const centralOffset = state.offset;
  for (const entry of completed) {
    const header = centralDirectoryHeader(entry);
    state.offset += header.byteLength;
    yield header;
  }
  const centralBytes = state.offset - centralOffset;
  const footer = endOfCentralDirectory(completed.length, centralBytes, centralOffset);
  state.offset += footer.byteLength;
  yield footer;
  if (state.offset !== plan.byteLength) fail("ACCOUNT_ARCHIVE_INTERNAL_ERROR", "ZIP preflight and streamed byte counts diverged");
}

/**
 * Prepare a single-use, ZIP32/store-only Readable. The async generator only
 * requests the next payload chunk when the Readable has capacity, so piping it
 * to an HTTP response honors Node backpressure. No complete ZIP is buffered.
 *
 * `saves` entries contain mode/slot/revision/updatedAt/size/checksum/payload.
 * `payload` may be bytes, text, an iterable, an async iterable, a promise, or a
 * lazy function returning one of those forms. Duplicate checksums consume only
 * the first supplied source and produce one physical blob entry.
 */
export function createAccountArchiveZipStream(input, options = {}) {
  const plan = prepareArchive(input, options);
  const stream = Readable.from(generateArchive(plan), {
    objectMode: false,
    highWaterMark: Math.max(1, Math.min(plan.limits.chunkBytes, 256 * 1_024)),
  });
  return { stream, manifest: plan.manifest, byteLength: plan.byteLength };
}

function strictUtf8(bytes, label) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("ACCOUNT_ARCHIVE_UTF8_INVALID", `${label} is not valid UTF-8`);
  }
}

function parseJsonBytes(bytes, label) {
  const text = strictUtf8(bytes, label);
  try {
    return { value: JSON.parse(text), text };
  } catch {
    fail("ACCOUNT_ARCHIVE_JSON_INVALID", `${label} is not valid JSON`);
  }
}

function findEocd(buffer) {
  const minimum = Math.max(0, buffer.byteLength - ZIP_EOCD_BYTES - 65_535);
  for (let offset = buffer.byteLength - ZIP_EOCD_BYTES; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) continue;
    const commentBytes = buffer.readUInt16LE(offset + 20);
    if (offset + ZIP_EOCD_BYTES + commentBytes === buffer.byteLength) return offset;
  }
  fail("ACCOUNT_ARCHIVE_ZIP_INVALID", "ZIP end-of-central-directory record is missing");
}

function checkedSlice(buffer, start, length, label) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < 0 || length < 0 || start + length > buffer.byteLength) {
    fail("ACCOUNT_ARCHIVE_ZIP_INVALID", `${label} lies outside the ZIP body`);
  }
  return buffer.subarray(start, start + length);
}

function parseCentralDirectory(buffer, eocdOffset, limits) {
  if (buffer.readUInt16LE(eocdOffset + 4) !== 0 || buffer.readUInt16LE(eocdOffset + 6) !== 0) {
    fail("ACCOUNT_ARCHIVE_ZIP_INVALID", "multi-disk ZIP archives are not supported");
  }
  const entriesOnDisk = buffer.readUInt16LE(eocdOffset + 8);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralBytes = buffer.readUInt32LE(eocdOffset + 12);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  const commentBytes = buffer.readUInt16LE(eocdOffset + 20);
  if (commentBytes !== 0 || entriesOnDisk !== entryCount || entryCount >= ZIP32_SENTINEL_UINT16 || centralBytes >= ZIP32_SENTINEL_UINT32 || centralOffset >= ZIP32_SENTINEL_UINT32) {
    fail("ACCOUNT_ARCHIVE_ZIP_INVALID", "ZIP32 directory metadata is invalid or requires ZIP64");
  }
  if (entryCount < 2 || entryCount > limits.maxEntries) fail("ACCOUNT_ARCHIVE_ENTRY_LIMIT_EXCEEDED", "ZIP entry count is outside the configured limit");
  if (centralOffset + centralBytes !== eocdOffset) fail("ACCOUNT_ARCHIVE_ZIP_INVALID", "ZIP central directory is not contiguous with its footer");
  let cursor = centralOffset;
  const entries = [];
  const names = new Set();
  for (let index = 0; index < entryCount; index += 1) {
    checkedSlice(buffer, cursor, ZIP_CENTRAL_HEADER_BYTES, "central directory header");
    if (buffer.readUInt32LE(cursor) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) fail("ACCOUNT_ARCHIVE_ZIP_INVALID", "ZIP central directory signature is invalid");
    const versionNeeded = buffer.readUInt16LE(cursor + 6);
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameBytesLength = buffer.readUInt16LE(cursor + 28);
    const extraBytes = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const disk = buffer.readUInt16LE(cursor + 34);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    if (versionNeeded !== ZIP_VERSION_20 || flags !== ZIP_UTF8_DATA_DESCRIPTOR_FLAGS || method !== ZIP_STORE_METHOD || compressedSize !== size ||
      compressedSize >= ZIP32_SENTINEL_UINT32 || localOffset >= ZIP32_SENTINEL_UINT32 || extraBytes !== 0 || commentLength !== 0 || disk !== 0) {
      fail("ACCOUNT_ARCHIVE_ZIP_INVALID", "ZIP entry uses an unsupported feature or ZIP64 sentinel");
    }
    const nameBytes = checkedSlice(buffer, cursor + ZIP_CENTRAL_HEADER_BYTES, nameBytesLength, "central directory path");
    const name = strictUtf8(nameBytes, "ZIP entry path");
    safeArchiveName(name, limits);
    if (names.has(name)) fail("ACCOUNT_ARCHIVE_ENTRY_DUPLICATE", "ZIP contains a duplicate entry path");
    names.add(name);
    entries.push({ name, nameBytes: Buffer.from(nameBytes), crc, size, localOffset });
    cursor += ZIP_CENTRAL_HEADER_BYTES + nameBytesLength;
  }
  if (cursor !== eocdOffset) fail("ACCOUNT_ARCHIVE_ZIP_INVALID", "ZIP central directory length does not match its records");
  return { entries, centralOffset };
}

function perEntryLimit(name, limits) {
  if (name === ACCOUNT_ENTRY_PATH) return limits.maxAccountBytes;
  if (name === MANIFEST_ENTRY_PATH) return limits.maxManifestBytes;
  return limits.maxPayloadBytes;
}

function materializeEntries(buffer, directory, limits) {
  const ordered = [...directory.entries].sort((left, right) => left.localOffset - right.localOffset);
  let expectedOffset = 0;
  let totalUncompressed = 0n;
  const result = new Map();
  for (const entry of ordered) {
    if (entry.localOffset !== expectedOffset) fail("ACCOUNT_ARCHIVE_ZIP_INVALID", "ZIP local entries overlap or contain unindexed bytes");
    checkedSlice(buffer, entry.localOffset, ZIP_LOCAL_HEADER_BYTES, "local file header");
    if (buffer.readUInt32LE(entry.localOffset) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) fail("ACCOUNT_ARCHIVE_ZIP_INVALID", "ZIP local file signature is invalid");
    const versionNeeded = buffer.readUInt16LE(entry.localOffset + 4);
    const flags = buffer.readUInt16LE(entry.localOffset + 6);
    const method = buffer.readUInt16LE(entry.localOffset + 8);
    const localCrc = buffer.readUInt32LE(entry.localOffset + 14);
    const localCompressed = buffer.readUInt32LE(entry.localOffset + 18);
    const localSize = buffer.readUInt32LE(entry.localOffset + 22);
    const nameBytesLength = buffer.readUInt16LE(entry.localOffset + 26);
    const extraBytes = buffer.readUInt16LE(entry.localOffset + 28);
    if (versionNeeded !== ZIP_VERSION_20 || flags !== ZIP_UTF8_DATA_DESCRIPTOR_FLAGS || method !== ZIP_STORE_METHOD ||
      localCrc !== 0 || localCompressed !== 0 || localSize !== 0 || extraBytes !== 0) {
      fail("ACCOUNT_ARCHIVE_ZIP_INVALID", "ZIP local entry does not use the required store/data-descriptor form");
    }
    const localNameBytes = checkedSlice(buffer, entry.localOffset + ZIP_LOCAL_HEADER_BYTES, nameBytesLength, "local entry path");
    if (!localNameBytes.equals(entry.nameBytes)) fail("ACCOUNT_ARCHIVE_ZIP_INVALID", "ZIP local and central entry paths differ");
    if (entry.size > perEntryLimit(entry.name, limits)) fail("ACCOUNT_ARCHIVE_ENTRY_LIMIT_EXCEEDED", `${entry.name} exceeds its configured size limit`);
    const dataOffset = entry.localOffset + ZIP_LOCAL_HEADER_BYTES + nameBytesLength;
    const data = checkedSlice(buffer, dataOffset, entry.size, `${entry.name} body`);
    const descriptorOffset = dataOffset + entry.size;
    checkedSlice(buffer, descriptorOffset, ZIP_DATA_DESCRIPTOR_BYTES, `${entry.name} descriptor`);
    if (buffer.readUInt32LE(descriptorOffset) !== ZIP_DATA_DESCRIPTOR_SIGNATURE ||
      buffer.readUInt32LE(descriptorOffset + 4) !== entry.crc ||
      buffer.readUInt32LE(descriptorOffset + 8) !== entry.size ||
      buffer.readUInt32LE(descriptorOffset + 12) !== entry.size) {
      fail("ACCOUNT_ARCHIVE_ZIP_INVALID", `${entry.name} data descriptor does not match its central record`);
    }
    if (crc32(data) !== entry.crc) fail("ACCOUNT_ARCHIVE_CRC_MISMATCH", `${entry.name} failed its CRC-32 check`);
    expectedOffset = descriptorOffset + ZIP_DATA_DESCRIPTOR_BYTES;
    totalUncompressed += BigInt(entry.size);
    if (totalUncompressed > BigInt(limits.maxTotalUncompressedBytes)) fail("ACCOUNT_ARCHIVE_TOTAL_LIMIT_EXCEEDED", "archive uncompressed data exceeds the configured limit");
    result.set(entry.name, data);
  }
  if (expectedOffset !== directory.centralOffset) fail("ACCOUNT_ARCHIVE_ZIP_INVALID", "ZIP local records do not end at the central directory");
  return result;
}

function payloadMode(payloadBytes) {
  const { value: parsed } = parseJsonBytes(payloadBytes, "save payload");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail("ACCOUNT_ARCHIVE_PAYLOAD_INVALID", "save payload root must be an object");
  const state = parsed.state ?? parsed;
  if (!state || typeof state !== "object" || Array.isArray(state)) fail("ACCOUNT_ARCHIVE_PAYLOAD_INVALID", "save payload state must be an object");
  const envelopeMode = parsed.mode;
  const stateMode = state.mode;
  if ((envelopeMode !== undefined && !SAVE_MODES.has(envelopeMode)) || (stateMode !== undefined && !SAVE_MODES.has(stateMode)) ||
    (envelopeMode !== undefined && stateMode !== undefined && envelopeMode !== stateMode)) {
    fail("ACCOUNT_ARCHIVE_MODE_INVALID", "save payload contains an invalid or conflicting mode marker");
  }
  if (envelopeMode !== undefined || stateMode !== undefined) return envelopeMode ?? stateMode;
  const legacySpeedrun = state.speedrun;
  if (legacySpeedrun?.enabled === true && legacySpeedrun.mode === "speedrun" &&
    typeof legacySpeedrun.factoryId === "string" && legacySpeedrun.factoryId.length > 0) return "speedrun";
  return "normal";
}

/**
 * Strict ZIP32 reader/validator for tests and a future staged importer. It
 * accepts an already bounded Buffer/Uint8Array, rejects unsupported ZIP
 * features, unsafe/duplicate paths, CRC or SHA damage, non-canonical manifests,
 * missing/orphan blobs, and payload/ref mode mismatches.
 */
export function readAccountArchiveZip(input, options = {}) {
  const limits = archiveLimits(options);
  const buffer = bytesView(input);
  if (buffer.byteLength < ZIP_EOCD_BYTES || buffer.byteLength > limits.maxArchiveBytes || buffer.byteLength >= ZIP32_SENTINEL_UINT32) {
    fail("ACCOUNT_ARCHIVE_TOTAL_LIMIT_EXCEEDED", "ZIP body is outside the configured archive limit");
  }
  const eocdOffset = findEocd(buffer);
  const directory = parseCentralDirectory(buffer, eocdOffset, limits);
  const entries = materializeEntries(buffer, directory, limits);
  const manifestBytes = entries.get(MANIFEST_ENTRY_PATH);
  if (!manifestBytes) fail("ACCOUNT_ARCHIVE_MANIFEST_MISSING", "manifest.json is missing from the archive");
  const parsedManifest = parseJsonBytes(manifestBytes, "manifest.json");
  const manifest = normalizeAccountArchiveManifest(parsedManifest.value, limits);
  if (!manifestBytes.equals(canonicalJsonBytes(manifest))) fail("ACCOUNT_ARCHIVE_MANIFEST_INVALID", "manifest.json is not in canonical form");
  const accountBytes = entries.get(ACCOUNT_ENTRY_PATH);
  if (!accountBytes) fail("ACCOUNT_ARCHIVE_ACCOUNT_MISSING", "account.json is missing from the archive");
  if (accountBytes.byteLength !== manifest.account.size || sha256(accountBytes) !== manifest.account.integrity.value) {
    fail("ACCOUNT_ARCHIVE_INTEGRITY_INVALID", "account.json does not match its manifest descriptor");
  }
  const parsedAccount = parseJsonBytes(accountBytes, "account.json");
  if (!parsedAccount.value || typeof parsedAccount.value !== "object" || Array.isArray(parsedAccount.value)) {
    fail("ACCOUNT_ARCHIVE_JSON_INVALID", "account.json root must be an object");
  }
  if (!accountBytes.equals(canonicalJsonBytes(parsedAccount.value))) fail("ACCOUNT_ARCHIVE_JSON_INVALID", "account.json is not in canonical form");
  const expectedNames = new Set([ACCOUNT_ENTRY_PATH, MANIFEST_ENTRY_PATH, ...manifest.blobs.map((blob) => blob.path)]);
  for (const name of entries.keys()) if (!expectedNames.has(name)) fail("ACCOUNT_ARCHIVE_BLOB_ORPHANED", `archive contains an unreferenced entry: ${name}`);
  if (entries.size !== expectedNames.size) fail("ACCOUNT_ARCHIVE_BLOB_MISSING", "archive entry set does not match the manifest blob index");
  const refsByChecksum = new Map();
  for (const ref of manifest.refs) {
    const modes = refsByChecksum.get(ref.checksum) ?? new Set();
    modes.add(ref.mode);
    refsByChecksum.set(ref.checksum, modes);
  }
  const payloads = new Map();
  for (const blob of manifest.blobs) {
    const payload = entries.get(blob.path);
    if (!payload) fail("ACCOUNT_ARCHIVE_BLOB_MISSING", `${blob.path} is missing from the archive`);
    if (payload.byteLength !== blob.size || sha256(payload) !== blob.checksum) {
      fail("ACCOUNT_ARCHIVE_BLOB_INTEGRITY_INVALID", `${blob.path} does not match its manifest SHA-256`);
    }
    const modes = refsByChecksum.get(blob.checksum);
    if (!modes || modes.size !== 1 || !modes.has(payloadMode(payload))) {
      fail("ACCOUNT_ARCHIVE_MODE_MISMATCH", `${blob.path} mode does not match its manifest refs`);
    }
    payloads.set(blob.checksum, payload);
  }
  return {
    manifest,
    accountData: parsedAccount.value,
    payloads,
  };
}
