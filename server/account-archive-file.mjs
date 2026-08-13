import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { open, realpath, stat as statPath } from "node:fs/promises";
import { resolve } from "node:path";
import { TextDecoder } from "node:util";

import {
  AccountArchiveError,
  DEFAULT_ACCOUNT_ARCHIVE_LIMITS,
  normalizeAccountArchiveManifest,
} from "./account-archive.mjs";

const ACCOUNT_ENTRY_PATH = "account.json";
const MANIFEST_ENTRY_PATH = "manifest.json";
const PAYLOAD_PATH_PATTERN = /^payloads\/([a-f0-9]{64})\.json$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAVE_MODES = new Set(["normal", "speedrun"]);
const ZIP32_SENTINEL_UINT32 = 0xffff_ffff;
const ZIP32_SENTINEL_UINT16 = 0xffff;
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
const MAX_JSON_NESTING_DEPTH = 256;

function fail(code, message, options = undefined) {
  throw new AccountArchiveError(code, message, options);
}

function boundedInteger(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail("ACCOUNT_ARCHIVE_LIMIT_INVALID", `${label} is outside its supported range`);
  }
  return value;
}

function normalizeLimit(value, fallback, maximum, label) {
  return value === undefined ? fallback : boundedInteger(value, 1, maximum, label);
}

function archiveLimits(options = {}) {
  const source = options?.limits && typeof options.limits === "object" ? options.limits : options;
  const limits = {
    maxEntries: normalizeLimit(source?.maxEntries, DEFAULT_ACCOUNT_ARCHIVE_LIMITS.maxEntries, ZIP32_SENTINEL_UINT16 - 1, "maxEntries"),
    maxRefs: normalizeLimit(source?.maxRefs, DEFAULT_ACCOUNT_ARCHIVE_LIMITS.maxRefs, ZIP32_SENTINEL_UINT16 - 1, "maxRefs"),
    maxPathBytes: normalizeLimit(source?.maxPathBytes, DEFAULT_ACCOUNT_ARCHIVE_LIMITS.maxPathBytes, 65_535, "maxPathBytes"),
    maxPayloadBytes: normalizeLimit(source?.maxPayloadBytes, DEFAULT_ACCOUNT_ARCHIVE_LIMITS.maxPayloadBytes, ZIP32_SENTINEL_UINT32 - 1, "maxPayloadBytes"),
    maxAccountBytes: normalizeLimit(source?.maxAccountBytes, DEFAULT_ACCOUNT_ARCHIVE_LIMITS.maxAccountBytes, ZIP32_SENTINEL_UINT32 - 1, "maxAccountBytes"),
    maxManifestBytes: normalizeLimit(source?.maxManifestBytes, DEFAULT_ACCOUNT_ARCHIVE_LIMITS.maxManifestBytes, ZIP32_SENTINEL_UINT32 - 1, "maxManifestBytes"),
    maxTotalUncompressedBytes: normalizeLimit(source?.maxTotalUncompressedBytes, DEFAULT_ACCOUNT_ARCHIVE_LIMITS.maxTotalUncompressedBytes, ZIP32_SENTINEL_UINT32 - 1, "maxTotalUncompressedBytes"),
    maxArchiveBytes: normalizeLimit(source?.maxArchiveBytes, DEFAULT_ACCOUNT_ARCHIVE_LIMITS.maxArchiveBytes, ZIP32_SENTINEL_UINT32 - 1, "maxArchiveBytes"),
    chunkBytes: normalizeLimit(source?.chunkBytes, DEFAULT_ACCOUNT_ARCHIVE_LIMITS.chunkBytes, 16 * 1_048_576, "chunkBytes"),
  };
  if (limits.maxEntries < 2) fail("ACCOUNT_ARCHIVE_LIMIT_INVALID", "maxEntries must leave room for account.json and manifest.json");
  return limits;
}

function throwIfAborted(signal) {
  if (signal?.aborted) fail("ACCOUNT_ARCHIVE_ABORTED", "account archive file reading was cancelled");
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
    return JSON.parse(text);
  } catch {
    fail("ACCOUNT_ARCHIVE_JSON_INVALID", `${label} is not valid JSON`);
  }
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
    result = `{${Object.keys(value).sort(compareText).map((key) => `${JSON.stringify(key)}:${canonicalJsonValue(value[key], seen)}`).join(",")}}`;
  }
  seen.delete(value);
  return result;
}

function canonicalJsonBytes(value) {
  return Buffer.from(canonicalJsonValue(value, new Set()), "utf8");
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

function perEntryLimit(name, limits) {
  if (name === ACCOUNT_ENTRY_PATH) return limits.maxAccountBytes;
  if (name === MANIFEST_ENTRY_PATH) return limits.maxManifestBytes;
  return limits.maxPayloadBytes;
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameFixedStat(left, right) {
  return sameFileIdentity(left, right) && left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

async function pathIdentity(path) {
  try {
    return await statPath(path, { bigint: true });
  } catch (error) {
    fail("ACCOUNT_ARCHIVE_FILE_CHANGED", "account archive path disappeared while it was open", { cause: error });
  }
}

async function exactRead(view, position, length, label, signal) {
  throwIfAborted(signal);
  if (!Number.isSafeInteger(position) || !Number.isSafeInteger(length) || position < 0 || length < 0 || position + length > view.size) {
    fail("ACCOUNT_ARCHIVE_ZIP_INVALID", `${label} lies outside the ZIP body`);
  }
  const bytes = Buffer.allocUnsafe(length);
  let offset = 0;
  while (offset < length) {
    throwIfAborted(signal);
    const { bytesRead } = await view.handle.read(bytes, offset, length - offset, position + offset);
    if (bytesRead <= 0) fail("ACCOUNT_ARCHIVE_FILE_CHANGED", `${label} was truncated while being read`);
    offset += bytesRead;
  }
  return bytes;
}

async function assertFixedView(view, signal) {
  throwIfAborted(signal);
  let descriptorStat;
  try {
    descriptorStat = await view.handle.stat({ bigint: true });
  } catch (error) {
    fail("ACCOUNT_ARCHIVE_FILE_CHANGED", "account archive file descriptor is no longer readable", { cause: error });
  }
  if (!sameFixedStat(descriptorStat, view.initialStat)) {
    fail("ACCOUNT_ARCHIVE_FILE_CHANGED", "account archive changed after it was opened");
  }
  const currentPathStat = await pathIdentity(view.path);
  if (!sameFileIdentity(currentPathStat, view.initialStat)) {
    fail("ACCOUNT_ARCHIVE_FILE_CHANGED", "account archive path was replaced after it was opened");
  }
}

async function parseDirectory(view, limits, signal) {
  const footer = await exactRead(view, view.size - ZIP_EOCD_BYTES, ZIP_EOCD_BYTES, "ZIP footer", signal);
  if (footer.readUInt32LE(0) !== ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
    fail("ACCOUNT_ARCHIVE_ZIP_INVALID", "ZIP end-of-central-directory record is missing or has a comment");
  }
  if (footer.readUInt16LE(4) !== 0 || footer.readUInt16LE(6) !== 0) fail("ACCOUNT_ARCHIVE_ZIP_INVALID", "multi-disk ZIP archives are not supported");
  const entriesOnDisk = footer.readUInt16LE(8);
  const entryCount = footer.readUInt16LE(10);
  const centralBytes = footer.readUInt32LE(12);
  const centralOffset = footer.readUInt32LE(16);
  const commentBytes = footer.readUInt16LE(20);
  if (commentBytes !== 0 || entriesOnDisk !== entryCount || entryCount >= ZIP32_SENTINEL_UINT16 ||
    centralBytes >= ZIP32_SENTINEL_UINT32 || centralOffset >= ZIP32_SENTINEL_UINT32) {
    fail("ACCOUNT_ARCHIVE_ZIP_INVALID", "ZIP32 directory metadata is invalid or requires ZIP64");
  }
  if (entryCount < 2 || entryCount > limits.maxEntries) fail("ACCOUNT_ARCHIVE_ENTRY_LIMIT_EXCEEDED", "ZIP entry count is outside the configured limit");
  if (centralOffset + centralBytes !== view.size - ZIP_EOCD_BYTES) fail("ACCOUNT_ARCHIVE_ZIP_INVALID", "ZIP central directory is not contiguous with its footer");
  if (centralBytes < entryCount * ZIP_CENTRAL_HEADER_BYTES) {
    fail("ACCOUNT_ARCHIVE_ZIP_INVALID", "ZIP central directory is too short for its entry count");
  }
  let cursor = centralOffset;
  const entries = [];
  const names = new Set();
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + ZIP_CENTRAL_HEADER_BYTES > centralOffset + centralBytes) {
      fail("ACCOUNT_ARCHIVE_ZIP_INVALID", "ZIP central directory header is truncated");
    }
    const central = await exactRead(view, cursor, ZIP_CENTRAL_HEADER_BYTES, "ZIP central directory header", signal);
    if (central.readUInt32LE(0) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      fail("ACCOUNT_ARCHIVE_ZIP_INVALID", "ZIP central directory signature is invalid");
    }
    const versionNeeded = central.readUInt16LE(6);
    const flags = central.readUInt16LE(8);
    const method = central.readUInt16LE(10);
    const crc = central.readUInt32LE(16);
    const compressedSize = central.readUInt32LE(20);
    const size = central.readUInt32LE(24);
    const nameLength = central.readUInt16LE(28);
    const extraBytes = central.readUInt16LE(30);
    const commentLength = central.readUInt16LE(32);
    const disk = central.readUInt16LE(34);
    const localOffset = central.readUInt32LE(42);
    if (versionNeeded !== ZIP_VERSION_20 || flags !== ZIP_UTF8_DATA_DESCRIPTOR_FLAGS || method !== ZIP_STORE_METHOD ||
      compressedSize !== size || compressedSize >= ZIP32_SENTINEL_UINT32 || localOffset >= ZIP32_SENTINEL_UINT32 ||
      extraBytes !== 0 || commentLength !== 0 || disk !== 0) {
      fail("ACCOUNT_ARCHIVE_ZIP_INVALID", "ZIP entry uses an unsupported feature or ZIP64 sentinel");
    }
    if (cursor + ZIP_CENTRAL_HEADER_BYTES + nameLength > centralOffset + centralBytes) fail("ACCOUNT_ARCHIVE_ZIP_INVALID", "ZIP central directory path is truncated");
    const nameBytes = await exactRead(view, cursor + ZIP_CENTRAL_HEADER_BYTES, nameLength, "ZIP central directory path", signal);
    const name = strictUtf8(nameBytes, "ZIP entry path");
    safeArchiveName(name, limits);
    if (names.has(name)) fail("ACCOUNT_ARCHIVE_ENTRY_DUPLICATE", "ZIP contains a duplicate entry path");
    names.add(name);
    if (size > perEntryLimit(name, limits)) fail("ACCOUNT_ARCHIVE_ENTRY_LIMIT_EXCEEDED", `${name} exceeds its configured size limit`);
    entries.push({ name, nameBytes: Buffer.from(nameBytes), crc, size, localOffset });
    cursor += ZIP_CENTRAL_HEADER_BYTES + nameLength;
  }
  if (cursor !== centralOffset + centralBytes) fail("ACCOUNT_ARCHIVE_ZIP_INVALID", "ZIP central directory length does not match its records");

  const ordered = [...entries].sort((left, right) => left.localOffset - right.localOffset);
  let expectedOffset = 0;
  let total = 0n;
  for (const entry of ordered) {
    if (entry.localOffset !== expectedOffset) fail("ACCOUNT_ARCHIVE_ZIP_INVALID", "ZIP local entries overlap or contain unindexed bytes");
    const header = await exactRead(view, entry.localOffset, ZIP_LOCAL_HEADER_BYTES, `${entry.name} local header`, signal);
    if (header.readUInt32LE(0) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE || header.readUInt16LE(4) !== ZIP_VERSION_20 ||
      header.readUInt16LE(6) !== ZIP_UTF8_DATA_DESCRIPTOR_FLAGS || header.readUInt16LE(8) !== ZIP_STORE_METHOD ||
      header.readUInt32LE(14) !== 0 || header.readUInt32LE(18) !== 0 || header.readUInt32LE(22) !== 0 || header.readUInt16LE(28) !== 0) {
      fail("ACCOUNT_ARCHIVE_ZIP_INVALID", "ZIP local entry does not use the required store/data-descriptor form");
    }
    const localNameLength = header.readUInt16LE(26);
    const localName = await exactRead(view, entry.localOffset + ZIP_LOCAL_HEADER_BYTES, localNameLength, `${entry.name} local path`, signal);
    if (!localName.equals(entry.nameBytes)) fail("ACCOUNT_ARCHIVE_ZIP_INVALID", "ZIP local and central entry paths differ");
    entry.dataOffset = entry.localOffset + ZIP_LOCAL_HEADER_BYTES + localNameLength;
    entry.descriptorOffset = entry.dataOffset + entry.size;
    const descriptor = await exactRead(view, entry.descriptorOffset, ZIP_DATA_DESCRIPTOR_BYTES, `${entry.name} descriptor`, signal);
    if (descriptor.readUInt32LE(0) !== ZIP_DATA_DESCRIPTOR_SIGNATURE || descriptor.readUInt32LE(4) !== entry.crc ||
      descriptor.readUInt32LE(8) !== entry.size || descriptor.readUInt32LE(12) !== entry.size) {
      fail("ACCOUNT_ARCHIVE_ZIP_INVALID", `${entry.name} data descriptor does not match its central record`);
    }
    expectedOffset = entry.descriptorOffset + ZIP_DATA_DESCRIPTOR_BYTES;
    total += BigInt(entry.size);
    if (total > BigInt(limits.maxTotalUncompressedBytes)) fail("ACCOUNT_ARCHIVE_TOTAL_LIMIT_EXCEEDED", "archive uncompressed data exceeds the configured limit");
  }
  if (expectedOffset !== centralOffset) fail("ACCOUNT_ARCHIVE_ZIP_INVALID", "ZIP local records do not end at the central directory");
  return { entries, byName: new Map(entries.map((entry) => [entry.name, entry])) };
}

async function readSmallEntry(view, entry, label, signal) {
  const bytes = await exactRead(view, entry.dataOffset, entry.size, label, signal);
  const crc = (crc32Update(0xffff_ffff, bytes) ^ 0xffff_ffff) >>> 0;
  if (crc !== entry.crc) fail("ACCOUNT_ARCHIVE_CRC_MISMATCH", `${entry.name} failed its CRC-32 check`);
  return bytes;
}

const ABSENT = Symbol("absent");

class JsonStructureParser {
  constructor() {
    this.stack = [];
    this.rootState = "value";
    this.rootType = undefined;
    this.values = new Map();
    this.statePresent = false;
    this.stateIsObject = false;
    this.stateIsNull = false;
  }

  currentPath() {
    if (this.stack.length === 0) return [];
    const parent = this.stack[this.stack.length - 1];
    return parent.type === "object" ? [...parent.path, parent.key] : [...parent.path, "*"];
  }

  expectsValue() {
    if (this.stack.length === 0) return this.rootState === "value";
    const top = this.stack[this.stack.length - 1];
    return top.state === "firstValueOrEnd" || top.state === "valueRequired" || top.state === "value";
  }

  markValueConsumed() {
    if (this.stack.length === 0) this.rootState = "done";
    else this.stack[this.stack.length - 1].state = "commaOrEnd";
  }

  record(path, kind, value) {
    if (path.length === 1 && path[0] === "state") {
      this.statePresent = true;
      this.stateIsObject = kind === "object";
      this.stateIsNull = kind === "null";
    }
    const key = path.join("\u0000");
    const watched = key === "mode" || key === "state\u0000mode" || key === "speedrun\u0000enabled" ||
      key === "speedrun\u0000mode" || key === "speedrun\u0000factoryId" || key === "state\u0000speedrun\u0000enabled" ||
      key === "state\u0000speedrun\u0000mode" || key === "state\u0000speedrun\u0000factoryId";
    if (watched) this.values.set(key, { kind, value });
  }

  beginValue(kind, value) {
    if (!this.expectsValue()) fail("ACCOUNT_ARCHIVE_JSON_INVALID", "save payload has invalid JSON structure");
    const path = this.currentPath();
    if (this.stack.length === 0) this.rootType = kind;
    this.record(path, kind, value);
    this.markValueConsumed();
    if (kind === "object" || kind === "array") {
      if (this.stack.length >= MAX_JSON_NESTING_DEPTH) fail("ACCOUNT_ARCHIVE_JSON_INVALID", "save payload JSON nesting exceeds the supported limit");
      if (kind === "object") this.stack.push({ type: "object", path, state: "firstKeyOrEnd", key: undefined });
      else this.stack.push({ type: "array", path, state: "firstValueOrEnd" });
    }
  }

  token(kind, value = undefined) {
    const top = this.stack[this.stack.length - 1];
    if (kind === "string" && top?.type === "object" && (top.state === "firstKeyOrEnd" || top.state === "keyRequired")) {
      top.key = value.text;
      top.state = "colon";
      return;
    }
    if (kind === ":") {
      if (top?.type !== "object" || top.state !== "colon") fail("ACCOUNT_ARCHIVE_JSON_INVALID", "save payload has an unexpected colon");
      top.state = "value";
      return;
    }
    if (kind === ",") {
      if (!top || top.state !== "commaOrEnd") fail("ACCOUNT_ARCHIVE_JSON_INVALID", "save payload has an unexpected comma");
      top.state = top.type === "object" ? "keyRequired" : "valueRequired";
      return;
    }
    if (kind === "}") {
      if (top?.type !== "object" || (top.state !== "firstKeyOrEnd" && top.state !== "commaOrEnd")) {
        fail("ACCOUNT_ARCHIVE_JSON_INVALID", "save payload has an unexpected object terminator");
      }
      this.stack.pop();
      return;
    }
    if (kind === "]") {
      if (top?.type !== "array" || (top.state !== "firstValueOrEnd" && top.state !== "commaOrEnd")) {
        fail("ACCOUNT_ARCHIVE_JSON_INVALID", "save payload has an unexpected array terminator");
      }
      this.stack.pop();
      return;
    }
    if (kind === "{") return this.beginValue("object");
    if (kind === "[") return this.beginValue("array");
    if (kind === "string") return this.beginValue("string", value);
    if (kind === "number" || kind === "boolean" || kind === "null") return this.beginValue(kind, value);
    fail("ACCOUNT_ARCHIVE_JSON_INVALID", "save payload contains an invalid JSON token");
  }

  finish() {
    if (this.rootState !== "done" || this.stack.length !== 0) fail("ACCOUNT_ARCHIVE_JSON_INVALID", "save payload JSON is incomplete");
    if (this.rootType !== "object") fail("ACCOUNT_ARCHIVE_PAYLOAD_INVALID", "save payload root must be an object");
    if (this.statePresent && !this.stateIsObject && !this.stateIsNull) {
      fail("ACCOUNT_ARCHIVE_PAYLOAD_INVALID", "save payload state must be an object");
    }
  }

  selected(path) {
    return this.values.get(path.join("\u0000")) ?? ABSENT;
  }
}

class StreamingJsonInspector {
  constructor() {
    this.decoder = new TextDecoder("utf-8", { fatal: true });
    this.parser = new JsonStructureParser();
    this.mode = "default";
    this.capture = "";
    this.captureOverflow = false;
    this.nonEmptyString = false;
    this.escape = false;
    this.unicode = "";
    this.literal = "";
    this.literalExpected = "";
    this.numberState = "";
  }

  appendString(character) {
    this.nonEmptyString = true;
    if (!this.captureOverflow) {
      if (this.capture.length < 128) this.capture += character;
      else this.captureOverflow = true;
    }
  }

  emitString() {
    this.parser.token("string", { text: this.captureOverflow ? null : this.capture, nonEmpty: this.nonEmptyString });
    this.mode = "default";
  }

  startNumber(character) {
    this.mode = "number";
    if (character === "-") this.numberState = "minus";
    else if (character === "0") this.numberState = "zero";
    else this.numberState = "int";
  }

  continueNumber(character) {
    if (this.numberState === "minus") {
      if (character === "0") this.numberState = "zero";
      else if (/[1-9]/.test(character)) this.numberState = "int";
      else return false;
      return true;
    }
    if (this.numberState === "zero") {
      if (character === ".") this.numberState = "dot";
      else if (character === "e" || character === "E") this.numberState = "exp";
      else return false;
      return true;
    }
    if (this.numberState === "int") {
      if (/[0-9]/.test(character)) return true;
      if (character === ".") this.numberState = "dot";
      else if (character === "e" || character === "E") this.numberState = "exp";
      else return false;
      return true;
    }
    if (this.numberState === "dot") {
      if (!/[0-9]/.test(character)) return false;
      this.numberState = "frac";
      return true;
    }
    if (this.numberState === "frac") {
      if (/[0-9]/.test(character)) return true;
      if (character === "e" || character === "E") this.numberState = "exp";
      else return false;
      return true;
    }
    if (this.numberState === "exp") {
      if (character === "+" || character === "-") this.numberState = "expSign";
      else if (/[0-9]/.test(character)) this.numberState = "expDigits";
      else return false;
      return true;
    }
    if (this.numberState === "expSign") {
      if (!/[0-9]/.test(character)) return false;
      this.numberState = "expDigits";
      return true;
    }
    if (this.numberState === "expDigits" && /[0-9]/.test(character)) return true;
    return false;
  }

  finishNumber() {
    if (!["zero", "int", "frac", "expDigits"].includes(this.numberState)) fail("ACCOUNT_ARCHIVE_JSON_INVALID", "save payload contains an invalid JSON number");
    this.parser.token("number");
    this.mode = "default";
  }

  processText(text) {
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (this.mode === "string") {
        if (this.unicode.length > 0) {
          if (!/[0-9a-fA-F]/.test(character)) fail("ACCOUNT_ARCHIVE_JSON_INVALID", "save payload contains an invalid Unicode escape");
          this.unicode += character;
          if (this.unicode.length === 5) {
            this.appendString(String.fromCharCode(Number.parseInt(this.unicode.slice(1), 16)));
            this.unicode = "";
            this.escape = false;
          }
          continue;
        }
        if (this.escape) {
          if (character === "u") this.unicode = "u";
          else {
            const escaped = { "\"": "\"", "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" }[character];
            if (escaped === undefined) fail("ACCOUNT_ARCHIVE_JSON_INVALID", "save payload contains an invalid string escape");
            this.appendString(escaped);
            this.escape = false;
          }
          continue;
        }
        if (character === "\\") {
          this.escape = true;
          continue;
        }
        if (character === "\"") {
          this.emitString();
          continue;
        }
        if (character.charCodeAt(0) < 0x20) fail("ACCOUNT_ARCHIVE_JSON_INVALID", "save payload contains an unescaped control character");
        this.appendString(character);
        continue;
      }
      if (this.mode === "literal") {
        this.literal += character;
        if (!this.literalExpected.startsWith(this.literal)) fail("ACCOUNT_ARCHIVE_JSON_INVALID", "save payload contains an invalid literal");
        if (this.literal === this.literalExpected) {
          this.parser.token(this.literal === "null" ? "null" : "boolean", this.literal === "true");
          this.mode = "default";
        }
        continue;
      }
      if (this.mode === "number") {
        if (this.continueNumber(character)) continue;
        this.finishNumber();
        index -= 1;
        continue;
      }
      if (character === " " || character === "\t" || character === "\r" || character === "\n") continue;
      if ("{}[],:".includes(character)) {
        this.parser.token(character);
        continue;
      }
      if (character === "\"") {
        this.mode = "string";
        this.capture = "";
        this.captureOverflow = false;
        this.nonEmptyString = false;
        this.escape = false;
        this.unicode = "";
        continue;
      }
      if (character === "t" || character === "f" || character === "n") {
        this.mode = "literal";
        this.literal = character;
        this.literalExpected = character === "t" ? "true" : character === "f" ? "false" : "null";
        continue;
      }
      if (character === "-" || /[0-9]/.test(character)) {
        this.startNumber(character);
        continue;
      }
      fail("ACCOUNT_ARCHIVE_JSON_INVALID", "save payload contains an invalid JSON character");
    }
  }

  write(bytes) {
    try {
      this.processText(this.decoder.decode(bytes, { stream: true }));
    } catch (error) {
      if (error instanceof AccountArchiveError) throw error;
      fail("ACCOUNT_ARCHIVE_UTF8_INVALID", "save payload is not valid UTF-8", { cause: error });
    }
  }

  finish() {
    try {
      this.processText(this.decoder.decode());
    } catch (error) {
      if (error instanceof AccountArchiveError) throw error;
      fail("ACCOUNT_ARCHIVE_UTF8_INVALID", "save payload is not valid UTF-8", { cause: error });
    }
    if (this.mode === "number") this.finishNumber();
    else if (this.mode !== "default") fail("ACCOUNT_ARCHIVE_JSON_INVALID", "save payload JSON is incomplete");
    this.parser.finish();
    return this.payloadMode();
  }

  scalar(path) {
    const entry = this.parser.selected(path);
    if (entry === ABSENT) return ABSENT;
    if (entry.kind === "string") return entry.value.text === null ? { longString: true, nonEmpty: entry.value.nonEmpty } : entry.value.text;
    if (entry.kind === "boolean") return entry.value;
    if (entry.kind === "null") return null;
    return { invalidType: entry.kind };
  }

  payloadMode() {
    const envelopeMode = this.scalar(["mode"]);
    const stateMode = this.parser.stateIsObject ? this.scalar(["state", "mode"]) : envelopeMode;
    for (const marker of [envelopeMode, stateMode]) {
      if (marker !== ABSENT && (typeof marker !== "string" || !SAVE_MODES.has(marker))) {
        fail("ACCOUNT_ARCHIVE_MODE_INVALID", "save payload contains an invalid or conflicting mode marker");
      }
    }
    if (envelopeMode !== ABSENT && stateMode !== ABSENT && envelopeMode !== stateMode) {
      fail("ACCOUNT_ARCHIVE_MODE_INVALID", "save payload contains an invalid or conflicting mode marker");
    }
    if (envelopeMode !== ABSENT || stateMode !== ABSENT) return envelopeMode !== ABSENT ? envelopeMode : stateMode;
    const prefix = this.parser.stateIsObject ? ["state", "speedrun"] : ["speedrun"];
    const enabled = this.scalar([...prefix, "enabled"]);
    const mode = this.scalar([...prefix, "mode"]);
    const factoryId = this.scalar([...prefix, "factoryId"]);
    const factoryPresent = typeof factoryId === "string" ? factoryId.length > 0 : factoryId?.longString === true && factoryId.nonEmpty;
    return enabled === true && mode === "speedrun" && factoryPresent ? "speedrun" : "normal";
  }
}

function resolveChecksum(input) {
  const checksum = typeof input === "string" ? input : input?.checksum;
  if (typeof checksum !== "string" || !SHA256_PATTERN.test(checksum)) {
    fail("ACCOUNT_ARCHIVE_CHECKSUM_INVALID", "payload checksum must be a lowercase SHA-256 digest");
  }
  return checksum;
}

function createInspection(view, directory, manifest, accountData, limits, defaultSignal) {
  const refsByChecksum = new Map();
  for (const ref of manifest.refs) {
    const modes = refsByChecksum.get(ref.checksum) ?? new Set();
    modes.add(ref.mode);
    refsByChecksum.set(ref.checksum, modes);
  }
  let closed = false;
  let closing = false;
  let active = 0;
  const idleWaiters = new Set();
  const activeIterators = new Set();
  const sessionAbort = new AbortController();

  function activeDone() {
    active -= 1;
    if (active === 0) {
      for (const resolveIdle of idleWaiters) resolveIdle();
      idleWaiters.clear();
    }
  }

  function waitForIdle() {
    if (active === 0) return Promise.resolve();
    return new Promise((resolveIdle) => idleWaiters.add(resolveIdle));
  }

  function effectiveAborted(signal) {
    return signal?.aborted || sessionAbort.signal.aborted;
  }

  function streamPayload(checksum, options = {}) {
    const blob = manifest.blobs.find((candidate) => candidate.checksum === checksum);
    if (!blob) fail("ACCOUNT_ARCHIVE_BLOB_MISSING", "requested payload is not present in the archive manifest");
    const entry = directory.byName.get(blob.path);
    const signal = options.signal ?? defaultSignal;
    let iterator;
    iterator = (async function* payloadChunks() {
      if (closed || closing) fail("ACCOUNT_ARCHIVE_FILE_CLOSED", "account archive inspection is closed");
      if (effectiveAborted(signal)) fail("ACCOUNT_ARCHIVE_ABORTED", "account archive payload reading was cancelled");
      active += 1;
      activeIterators.add(iterator);
      let completed = false;
      let failed = false;
      const cancel = () => {
        void iterator.return().catch(() => undefined);
      };
      signal?.addEventListener("abort", cancel, { once: true });
      sessionAbort.signal.addEventListener("abort", cancel, { once: true });
      try {
        await assertFixedView(view, signal);
        let offset = 0;
        let crc = 0xffff_ffff;
        const hash = createHash("sha256");
        const json = new StreamingJsonInspector();
        while (offset < entry.size) {
          if (effectiveAborted(signal)) fail("ACCOUNT_ARCHIVE_ABORTED", "account archive payload reading was cancelled");
          const length = Math.min(limits.chunkBytes, entry.size - offset);
          const chunk = await exactRead(view, entry.dataOffset + offset, length, `${entry.name} body`, signal);
          offset += chunk.byteLength;
          crc = crc32Update(crc, chunk);
          hash.update(chunk);
          json.write(chunk);
          yield chunk;
        }
        const finalCrc = (crc ^ 0xffff_ffff) >>> 0;
        if (finalCrc !== entry.crc) fail("ACCOUNT_ARCHIVE_CRC_MISMATCH", `${entry.name} failed its CRC-32 check`);
        if (hash.digest("hex") !== blob.checksum) fail("ACCOUNT_ARCHIVE_BLOB_INTEGRITY_INVALID", `${entry.name} does not match its manifest SHA-256`);
        const mode = json.finish();
        const modes = refsByChecksum.get(blob.checksum);
        if (!modes || modes.size !== 1 || !modes.has(mode)) fail("ACCOUNT_ARCHIVE_MODE_MISMATCH", `${entry.name} mode does not match its manifest refs`);
        await assertFixedView(view, signal);
        completed = true;
        return { checksum, size: entry.size, mode };
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        signal?.removeEventListener("abort", cancel);
        sessionAbort.signal.removeEventListener("abort", cancel);
        activeIterators.delete(iterator);
        activeDone();
        if (!completed && !failed && !effectiveAborted(signal)) {
          fail("ACCOUNT_ARCHIVE_STREAM_INCOMPLETE", "payload stream was not consumed to its validated end");
        }
      }
    })();
    return {
      async next(value) {
        if (signal?.aborted) {
          await iterator.return().catch(() => undefined);
          fail("ACCOUNT_ARCHIVE_ABORTED", "account archive payload reading was cancelled");
        }
        const result = await iterator.next(value);
        if (signal?.aborted) {
          await iterator.return().catch(() => undefined);
          fail("ACCOUNT_ARCHIVE_ABORTED", "account archive payload reading was cancelled");
        }
        return result;
      },
      return(value) {
        return iterator.return(value);
      },
      throw(error) {
        return iterator.throw(error);
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }

  const inspection = {
    path: view.path,
    manifest,
    accountData,
    payloads: manifest.blobs.map((blob) => ({ checksum: blob.checksum, size: blob.size, path: blob.path })),
    openPayload(input, options = {}) {
      return streamPayload(resolveChecksum(input), options);
    },
    async validate(options = {}) {
      const validatedPayloads = [];
      for (const blob of manifest.blobs) {
        let size = 0;
        const iterator = streamPayload(blob.checksum, options);
        while (true) {
          const next = await iterator.next();
          if (next.done) {
            validatedPayloads.push(next.value);
            break;
          }
          size += next.value.byteLength;
        }
        if (size !== blob.size) fail("ACCOUNT_ARCHIVE_PAYLOAD_SIZE_MISMATCH", `${blob.path} size does not match its manifest ref`);
      }
      return { manifest, accountData, validatedPayloads };
    },
    async close() {
      if (closed) return;
      if (!closing) {
        closing = true;
        sessionAbort.abort();
      }
      await Promise.allSettled([...activeIterators].map((iterator) => iterator.return()));
      await waitForIdle();
      if (!closed) {
        closed = true;
        await view.handle.close();
      }
    },
    get closed() {
      return closed;
    },
    async [Symbol.asyncDispose]() {
      await this.close();
    },
  };
  return inspection;
}

/**
 * Inspect a ZIP32 account archive through one fixed, read-only file descriptor.
 * Directory, manifest, and account metadata are materialized; payload bodies
 * remain on disk and are exposed as repeatable validating async iterables.
 */
export async function inspectAccountArchiveFile(fileMustExist, options = {}) {
  if (typeof fileMustExist !== "string" || fileMustExist.length === 0 || fileMustExist.includes("\0")) {
    fail("ACCOUNT_ARCHIVE_INPUT_INVALID", "account archive path must name an existing file");
  }
  const limits = archiveLimits(options);
  throwIfAborted(options.signal);
  let canonicalPath;
  try {
    canonicalPath = await realpath(resolve(fileMustExist));
  } catch (error) {
    fail("ACCOUNT_ARCHIVE_FILE_NOT_FOUND", "account archive file does not exist", { cause: error });
  }
  let handle;
  try {
    handle = await open(canonicalPath, fsConstants.O_RDONLY);
    const initialStat = await handle.stat({ bigint: true });
    if (!initialStat.isFile()) fail("ACCOUNT_ARCHIVE_INPUT_INVALID", "account archive path must be a regular file");
    const size = Number(initialStat.size);
    if (!Number.isSafeInteger(size) || size < ZIP_EOCD_BYTES || size > limits.maxArchiveBytes || size >= ZIP32_SENTINEL_UINT32) {
      fail("ACCOUNT_ARCHIVE_TOTAL_LIMIT_EXCEEDED", "ZIP body is outside the configured archive limit");
    }
    const view = { handle, path: canonicalPath, initialStat, size };
    await assertFixedView(view, options.signal);
    const directory = await parseDirectory(view, limits, options.signal);
    const manifestEntry = directory.byName.get(MANIFEST_ENTRY_PATH);
    if (!manifestEntry) fail("ACCOUNT_ARCHIVE_MANIFEST_MISSING", "manifest.json is missing from the archive");
    const manifestBytes = await readSmallEntry(view, manifestEntry, "manifest.json", options.signal);
    const manifest = normalizeAccountArchiveManifest(parseJsonBytes(manifestBytes, "manifest.json"), { limits });
    if (!manifestBytes.equals(canonicalJsonBytes(manifest))) fail("ACCOUNT_ARCHIVE_MANIFEST_INVALID", "manifest.json is not in canonical form");
    const accountEntry = directory.byName.get(ACCOUNT_ENTRY_PATH);
    if (!accountEntry) fail("ACCOUNT_ARCHIVE_ACCOUNT_MISSING", "account.json is missing from the archive");
    const accountBytes = await readSmallEntry(view, accountEntry, "account.json", options.signal);
    if (accountBytes.byteLength !== manifest.account.size || createHash("sha256").update(accountBytes).digest("hex") !== manifest.account.integrity.value) {
      fail("ACCOUNT_ARCHIVE_INTEGRITY_INVALID", "account.json does not match its manifest descriptor");
    }
    const accountData = parseJsonBytes(accountBytes, "account.json");
    if (!accountData || typeof accountData !== "object" || Array.isArray(accountData)) fail("ACCOUNT_ARCHIVE_JSON_INVALID", "account.json root must be an object");
    if (!accountBytes.equals(canonicalJsonBytes(accountData))) fail("ACCOUNT_ARCHIVE_JSON_INVALID", "account.json is not in canonical form");
    const expectedNames = new Set([ACCOUNT_ENTRY_PATH, MANIFEST_ENTRY_PATH, ...manifest.blobs.map((blob) => blob.path)]);
    for (const entry of directory.entries) if (!expectedNames.has(entry.name)) fail("ACCOUNT_ARCHIVE_BLOB_ORPHANED", `archive contains an unreferenced entry: ${entry.name}`);
    if (directory.entries.length !== expectedNames.size) fail("ACCOUNT_ARCHIVE_BLOB_MISSING", "archive entry set does not match the manifest blob index");
    for (const blob of manifest.blobs) {
      const entry = directory.byName.get(blob.path);
      if (!entry) fail("ACCOUNT_ARCHIVE_BLOB_MISSING", `${blob.path} is missing from the archive`);
      if (entry.size !== blob.size) fail("ACCOUNT_ARCHIVE_BLOB_INTEGRITY_INVALID", `${blob.path} size does not match its manifest descriptor`);
    }
    await assertFixedView(view, options.signal);
    return createInspection(view, directory, manifest, accountData, limits, options.signal);
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    if (error instanceof AccountArchiveError) throw error;
    fail("ACCOUNT_ARCHIVE_FILE_READ_FAILED", "account archive file could not be inspected", { cause: error });
  }
}

/** Inspect, stream-validate every unique payload, and always close the file. */
export async function validateAccountArchiveFile(fileMustExist, options = {}) {
  const inspection = await inspectAccountArchiveFile(fileMustExist, options);
  try {
    return await inspection.validate({ signal: options.signal });
  } finally {
    await inspection.close();
  }
}
