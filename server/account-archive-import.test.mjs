import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import test from "node:test";

import { createAccountArchiveZipStream } from "./account-archive.mjs";
import {
  ACCOUNT_ARCHIVE_IMPORT_CONFIRMATION_HEADER,
  ACCOUNT_ARCHIVE_IMPORT_CONTENT_TYPE,
  ACCOUNT_ARCHIVE_IMPORT_GUARD_HEADER,
  ACCOUNT_ARCHIVE_IMPORT_GUARD_VERSION,
  AccountArchiveImportError,
  accountArchiveImportConfirmation,
  accountArchiveImportGuard,
  inspectAccountArchivePayloadFile,
  maximumAccountArchiveImportBytes,
  prepareAccountArchiveImport,
  receiveAccountArchiveRequest,
} from "./account-archive-import.mjs";

const MIB = 1_048_576;
const EXPORTED_AT = 1_786_588_900_000;
const ACCOUNT_ID = "synthetic_archive_import_user";
const MODES = ["normal", "speedrun"];
const SLOTS = ["main", "1", "2", "3"];

const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_EOCD_SIGNATURE = 0x06054b50;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function validAccountData(overrides = {}) {
  const accountId = overrides.accountId ?? ACCOUNT_ID;
  return {
    format: "dspidle-account-data",
    version: 2,
    exportedAt: EXPORTED_AT,
    accountId,
    user: { id: accountId, displayName: "Synthetic Archive Import" },
    submissions: [{ privateMarker: "submission-must-not-be-imported" }],
    speedrunSubmissions: [{ privateMarker: "speedrun-submission-must-not-be-imported" }],
    sessions: [{ privateMarker: "session-must-not-be-imported" }],
    ...overrides,
  };
}

function smallPayload(mode, marker = `${mode}-fixture`) {
  const bytes = Buffer.from(JSON.stringify({
    formatVersion: 2,
    savedAt: EXPORTED_AT,
    mode,
    checksum: "synthetic-envelope-checksum",
    state: {
      version: 46,
      mode,
      entities: [],
      marker,
    },
  }), "utf8");
  return {
    mode,
    marker,
    size: bytes.byteLength,
    checksum: sha256(bytes),
    payload: bytes,
    bytes,
  };
}

function largePayload(mode, targetBytes) {
  const prefix = Buffer.from(
    `{"formatVersion":2,"savedAt":${EXPORTED_AT},"mode":"${mode}","checksum":"synthetic-envelope-checksum","state":{"version":46,"mode":"${mode}","entities":[],"marker":"large-chunked","padding":"`,
    "utf8",
  );
  const suffix = Buffer.from('"}}', "utf8");
  const paddingBytes = targetBytes - prefix.byteLength - suffix.byteLength;
  assert.ok(paddingBytes > 0);
  const block = Buffer.alloc(64 * 1_024, 0x78);
  const digest = createHash("sha256");
  digest.update(prefix);
  for (let remaining = paddingBytes; remaining > 0;) {
    const length = Math.min(remaining, block.byteLength);
    digest.update(block.subarray(0, length));
    remaining -= length;
  }
  digest.update(suffix);
  async function* source() {
    yield prefix;
    for (let remaining = paddingBytes; remaining > 0;) {
      const length = Math.min(remaining, block.byteLength);
      yield block.subarray(0, length);
      remaining -= length;
    }
    yield suffix;
  }
  return {
    mode,
    marker: "large-chunked",
    size: targetBytes,
    checksum: digest.digest("hex"),
    payload: source,
  };
}

function saveRef(payload, overrides = {}) {
  return {
    mode: payload.mode,
    slot: "main",
    revision: 1,
    updatedAt: EXPORTED_AT,
    size: payload.size,
    checksum: payload.checksum,
    payload: payload.payload,
    ...overrides,
  };
}

async function temporaryDirectory(t, prefix) {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function writeArchive(directory, saves, options = {}) {
  await mkdir(directory, { recursive: true });
  const archiveFile = path.join(directory, options.name ?? "account.dspaccount.zip");
  const prepared = createAccountArchiveZipStream({
    exportedAt: options.exportedAt ?? EXPORTED_AT,
    schemaVersion: options.schemaVersion ?? 7,
    accountData: options.accountData ?? validAccountData(),
    saves,
  }, options.writerOptions);
  await pipeline(
    prepared.stream,
    createWriteStream(archiveFile, { flags: "wx", mode: 0o600 }),
  );
  assert.equal((await stat(archiveFile)).size, prepared.byteLength);
  return { archiveFile, manifest: prepared.manifest, byteLength: prepared.byteLength };
}

function requestStream(chunks, headers) {
  return {
    headers,
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

function assertImportError(code, statusCode = undefined) {
  return (error) => {
    assert.ok(error instanceof AccountArchiveImportError, String(error));
    assert.equal(error.code, code);
    if (statusCode !== undefined) assert.equal(error.statusCode, statusCode);
    return true;
  };
}

async function assertDirectoryEmpty(directory, message = "failed import must not leave temporary files") {
  assert.deepEqual(await readdir(directory), [], message);
}

async function assertPrepareRejectsWithoutResidue({
  archiveFile,
  workspaceDirectory,
  code,
  statusCode,
  options = {},
}) {
  await assert.rejects(prepareAccountArchiveImport(archiveFile, {
    workspaceDirectory,
    inspectPayload: validSyntheticInspector(),
    ...options,
  }), assertImportError(code, statusCode));
  await assertDirectoryEmpty(workspaceDirectory);
}

function validSyntheticInspector(expected = new Map()) {
  return async ({ file, checksum, size, mode }) => {
    const body = await readFile(file);
    assert.equal(body.byteLength, size);
    assert.equal(sha256(body), checksum);
    const parsed = JSON.parse(body.toString("utf8"));
    const expectedBody = expected.get(checksum);
    if (expectedBody) assert.ok(body.equals(expectedBody));
    assert.equal(parsed.mode ?? parsed.state?.mode, mode);
    return {
      validPayload: true,
      payloadChecksum: checksum,
      payloadSize: size,
      payloadMode: mode,
      summary: { marker: parsed.state?.marker ?? "synthetic" },
    };
  };
}

function locateZipEntries(zip) {
  const eocdOffset = zip.byteLength - 22;
  assert.equal(zip.readUInt32LE(eocdOffset), ZIP_EOCD_SIGNATURE);
  const count = zip.readUInt16LE(eocdOffset + 10);
  let cursor = zip.readUInt32LE(eocdOffset + 16);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    assert.equal(zip.readUInt32LE(cursor), ZIP_CENTRAL_SIGNATURE);
    const size = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    const localNameLength = zip.readUInt16LE(localOffset + 26);
    const localExtraLength = zip.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    entries.push({ name, size, dataOffset, centralOffset: cursor });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
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
  for (const byte of bytes) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffff_ffff) >>> 0;
}

function rewriteEntryCrc(zip, entry) {
  const value = crc32(zip.subarray(entry.dataOffset, entry.dataOffset + entry.size));
  zip.writeUInt32LE(value, entry.dataOffset + entry.size + 4);
  zip.writeUInt32LE(value, entry.centralOffset + 16);
}

test("archive import guard is deterministic and isolates every mode, slot, and revision", () => {
  const records = MODES.flatMap((mode, modeIndex) => SLOTS.flatMap((slot, slotIndex) => [1, 2].map((revision) => ({
    mode,
    slot,
    revision,
    updatedAt: EXPORTED_AT + modeIndex * 100 + slotIndex * 10 + revision,
    size: 100 + revision,
    checksum: sha256(`${mode}:${slot}:${revision}`),
  }))));
  const expected = accountArchiveImportGuard(records);
  assert.match(expected, /^[a-f0-9]{64}$/);
  assert.equal(accountArchiveImportGuard([...records].reverse()), expected);
  assert.equal(accountArchiveImportGuard([records[3], ...records.slice(0, 3), ...records.slice(4)]), expected);
  assert.notEqual(accountArchiveImportGuard([
    { ...records[0], mode: "speedrun" },
    ...records.slice(1).filter((record) => !(record.mode === "speedrun" && record.slot === records[0].slot && record.revision === records[0].revision)),
  ]), expected);
  assert.notEqual(accountArchiveImportGuard([
    { ...records[0], slot: "3" },
    ...records.slice(1).filter((record) => !(record.mode === records[0].mode && record.slot === "3" && record.revision === records[0].revision)),
  ]), expected);
  assert.notEqual(accountArchiveImportGuard([{ ...records[0], revision: 3 }, ...records.slice(1)]), expected);
  assert.notEqual(accountArchiveImportGuard(records.map((record, index) => index === 0 ? { ...record, updatedAt: record.updatedAt + 1 } : record)), expected);
  assert.notEqual(accountArchiveImportGuard(records.map((record, index) => index === 0 ? { ...record, size: record.size + 1 } : record)), expected);
  assert.notEqual(accountArchiveImportGuard(records.map((record, index) => index === 0 ? { ...record, checksum: sha256("changed") } : record)), expected);
  assert.equal(accountArchiveImportGuard([{ ...records[0], updatedAt: undefined }]), accountArchiveImportGuard([{ ...records[0], updatedAt: 0 }]));
  assert.equal(ACCOUNT_ARCHIVE_IMPORT_GUARD_VERSION, "cloud-account-import-guard-v1");
});

test("archive import guard rejects invalid and duplicate revision identities", () => {
  const valid = {
    mode: "normal",
    slot: "main",
    revision: 1,
    updatedAt: EXPORTED_AT,
    size: 10,
    checksum: sha256("guard"),
  };
  assert.throws(() => accountArchiveImportGuard("not-an-array"), assertImportError("ACCOUNT_ARCHIVE_IMPORT_GUARD_INVALID"));
  assert.throws(() => accountArchiveImportGuard([{ ...valid, mode: "modded" }]), assertImportError("ACCOUNT_ARCHIVE_IMPORT_GUARD_INVALID"));
  assert.throws(() => accountArchiveImportGuard([{ ...valid, slot: "4" }]), assertImportError("ACCOUNT_ARCHIVE_IMPORT_GUARD_INVALID"));
  assert.throws(() => accountArchiveImportGuard([{ ...valid, revision: 0 }]), assertImportError("ACCOUNT_ARCHIVE_IMPORT_GUARD_INVALID"));
  assert.throws(() => accountArchiveImportGuard([{ ...valid, checksum: "ABC" }]), assertImportError("ACCOUNT_ARCHIVE_IMPORT_GUARD_INVALID"));
  assert.throws(() => accountArchiveImportGuard([valid, { ...valid, checksum: sha256("duplicate") }]), assertImportError("ACCOUNT_ARCHIVE_IMPORT_GUARD_INVALID"));
});

test("confirmation binds exactly to the guard and exposes stable header names", () => {
  const guard = accountArchiveImportGuard([]);
  assert.equal(accountArchiveImportConfirmation(guard), `REPLACE_CLOUD_SAVES:${guard}`);
  assert.equal(ACCOUNT_ARCHIVE_IMPORT_GUARD_HEADER, "x-dsp-account-import-guard");
  assert.equal(ACCOUNT_ARCHIVE_IMPORT_CONFIRMATION_HEADER, "x-dsp-account-import-confirmation");
  assert.throws(() => accountArchiveImportConfirmation("ABC"), assertImportError("ACCOUNT_ARCHIVE_IMPORT_GUARD_INVALID"));
  assert.throws(() => accountArchiveImportConfirmation(null), assertImportError("ACCOUNT_ARCHIVE_IMPORT_GUARD_INVALID"));
});

test("HTTP request body streams to an exact private file and explicit cleanup is idempotent", async (t) => {
  const root = await temporaryDirectory(t, "dspidle-import-receive-success-");
  const body = Buffer.from("synthetic-account-archive-body", "utf8");
  const received = await receiveAccountArchiveRequest(requestStream([
    body.subarray(0, 3),
    new Uint8Array(body.subarray(3, 17)),
    body.subarray(17),
  ], {
    "content-type": `${ACCOUNT_ARCHIVE_IMPORT_CONTENT_TYPE}; charset=binary`,
    "content-length": String(body.byteLength),
  }), { temporaryRoot: root, maximumBytes: body.byteLength });

  assert.equal(received.byteLength, body.byteLength);
  assert.ok(path.relative(root, received.archiveFile).startsWith("dspidle-account-import-"));
  assert.ok((await readFile(received.archiveFile)).equals(body));
  assert.deepEqual(await readdir(root), [path.basename(received.directory)]);
  await received.cleanup();
  await received.cleanup();
  await assertDirectoryEmpty(root);
});

test("HTTP receive rejects invalid type or length before leaving a temporary directory", async (t) => {
  const cases = [
    {
      name: "type",
      headers: { "content-type": "application/zip", "content-length": "1" },
      code: "ACCOUNT_ARCHIVE_IMPORT_CONTENT_TYPE_INVALID",
      status: 415,
    },
    {
      name: "missing-length",
      headers: { "content-type": ACCOUNT_ARCHIVE_IMPORT_CONTENT_TYPE },
      code: "ACCOUNT_ARCHIVE_IMPORT_LENGTH_REQUIRED",
      status: 411,
    },
    {
      name: "zero-length",
      headers: { "content-type": ACCOUNT_ARCHIVE_IMPORT_CONTENT_TYPE, "content-length": "0" },
      code: "ACCOUNT_ARCHIVE_IMPORT_LENGTH_REQUIRED",
      status: 411,
    },
    {
      name: "non-decimal-length",
      headers: { "content-type": ACCOUNT_ARCHIVE_IMPORT_CONTENT_TYPE, "content-length": "1e3" },
      code: "ACCOUNT_ARCHIVE_IMPORT_LENGTH_REQUIRED",
      status: 411,
    },
  ];
  for (const fixture of cases) {
    await t.test(fixture.name, async (t) => {
      const root = await temporaryDirectory(t, `dspidle-import-receive-${fixture.name}-`);
      await assert.rejects(receiveAccountArchiveRequest(requestStream([Buffer.from("x")], fixture.headers), {
        temporaryRoot: root,
      }), assertImportError(fixture.code, fixture.status));
      await assertDirectoryEmpty(root);
    });
  }
});

test("HTTP receive rejects declared and observed size mismatches without residue", async (t) => {
  const cases = [
    {
      name: "declared-too-large",
      chunks: [Buffer.from("x")],
      declared: 11,
      maximum: 10,
      code: "ACCOUNT_ARCHIVE_IMPORT_TOO_LARGE",
      status: 413,
    },
    {
      name: "body-longer-than-declared",
      chunks: [Buffer.from("abc"), Buffer.from("def")],
      declared: 5,
      maximum: 10,
      code: "ACCOUNT_ARCHIVE_IMPORT_LENGTH_MISMATCH",
      status: 400,
    },
    {
      name: "body-shorter-than-declared",
      chunks: [Buffer.from("abc")],
      declared: 4,
      maximum: 10,
      code: "ACCOUNT_ARCHIVE_IMPORT_LENGTH_MISMATCH",
      status: 400,
    },
  ];
  for (const fixture of cases) {
    await t.test(fixture.name, async (t) => {
      const root = await temporaryDirectory(t, `dspidle-import-receive-${fixture.name}-`);
      await assert.rejects(receiveAccountArchiveRequest(requestStream(fixture.chunks, {
        "content-type": ACCOUNT_ARCHIVE_IMPORT_CONTENT_TYPE,
        "content-length": String(fixture.declared),
      }), {
        temporaryRoot: root,
        maximumBytes: fixture.maximum,
      }), assertImportError(fixture.code, fixture.status));
      await assertDirectoryEmpty(root);
    });
  }
});

test("HTTP receive cancellation and source failure close handles and remove partial files", async (t) => {
  await t.test("mid-stream cancellation", async (t) => {
    const root = await temporaryDirectory(t, "dspidle-import-receive-abort-");
    const controller = new AbortController();
    const request = {
      headers: {
        "content-type": ACCOUNT_ARCHIVE_IMPORT_CONTENT_TYPE,
        "content-length": "6",
      },
      async *[Symbol.asyncIterator]() {
        yield Buffer.from("abc");
        controller.abort();
        yield Buffer.from("def");
      },
    };
    await assert.rejects(receiveAccountArchiveRequest(request, {
      temporaryRoot: root,
      signal: controller.signal,
    }), assertImportError("ACCOUNT_ARCHIVE_IMPORT_ABORTED", 499));
    await assertDirectoryEmpty(root);
  });

  await t.test("request stream failure", async (t) => {
    const root = await temporaryDirectory(t, "dspidle-import-receive-source-failure-");
    const request = {
      headers: {
        "content-type": ACCOUNT_ARCHIVE_IMPORT_CONTENT_TYPE,
        "content-length": "6",
      },
      async *[Symbol.asyncIterator]() {
        yield Buffer.from("abc");
        throw new Error("synthetic request failure");
      },
    };
    await assert.rejects(receiveAccountArchiveRequest(request, {
      temporaryRoot: root,
    }), assertImportError("ACCOUNT_ARCHIVE_IMPORT_RECEIVE_FAILED", 500));
    await assertDirectoryEmpty(root);
  });
});

test("prepare preserves all eight mode/slot histories and returns metadata plus file paths only", async (t) => {
  const sourceDirectory = await temporaryDirectory(t, "dspidle-import-matrix-source-");
  const workspaceDirectory = await temporaryDirectory(t, "dspidle-import-matrix-workspace-");
  const normal = smallPayload("normal", "normal-shared");
  const speedrun = smallPayload("speedrun", "speedrun-shared");
  const payloadByMode = { normal, speedrun };
  const expectedBodies = new Map([[normal.checksum, normal.bytes], [speedrun.checksum, speedrun.bytes]]);
  const saves = [];
  for (const mode of MODES) {
    for (const slot of SLOTS) {
      for (const revision of [3, 9]) {
        saves.push(saveRef(payloadByMode[mode], {
          mode,
          slot,
          revision,
          updatedAt: EXPORTED_AT + revision,
        }));
      }
    }
  }
  const archive = await writeArchive(sourceDirectory, [...saves].reverse());
  const result = await prepareAccountArchiveImport(archive.archiveFile, {
    workspaceDirectory,
    inspectPayload: validSyntheticInspector(expectedBodies),
  });

  assert.deepEqual(Object.keys(result).sort(), ["format", "quota", "refs", "source", "version"]);
  assert.equal(result.format, "dspidle-account-archive-import");
  assert.equal(result.version, 1);
  assert.deepEqual(result.source, {
    accountId: ACCOUNT_ID,
    exportedAt: EXPORTED_AT,
    archiveExportedAt: EXPORTED_AT,
    schemaVersion: 7,
  });
  assert.equal(result.refs.length, 16);
  assert.equal(result.quota.revisionCount, 16);
  assert.equal(result.quota.logicalBytes, 8 * normal.size + 8 * speedrun.size);
  for (const mode of MODES) {
    for (const slot of SLOTS) {
      assert.deepEqual(result.refs.filter((ref) => ref.mode === mode && ref.slot === slot).map((ref) => ref.revision), [3, 9]);
    }
  }
  for (const ref of result.refs) {
    assert.deepEqual(Object.keys(ref).sort(), [
      "checksum", "mode", "payloadFile", "revision", "size", "slot", "summary", "updatedAt",
    ]);
    assert.equal(typeof ref.payloadFile, "string");
    assert.equal(path.dirname(ref.payloadFile), workspaceDirectory);
    assert.equal((await stat(ref.payloadFile)).size, ref.size);
    assert.equal("payload" in ref, false);
    assert.equal("body" in ref, false);
  }
  assert.deepEqual((await readdir(workspaceDirectory)).sort(), [
    `${normal.checksum}.payload.json`,
    `${speedrun.checksum}.payload.json`,
  ].sort());
  assert.equal(JSON.stringify(result).includes("submission-must-not-be-imported"), false);
  assert.equal(JSON.stringify(result).includes("session-must-not-be-imported"), false);
  assert.equal(JSON.stringify(result, (_key, value) => {
    assert.equal(Buffer.isBuffer(value), false, "prepared import must not return a payload Buffer");
    return value;
  }).length > 0, true);
});

test("prepare rejects malformed account descriptors and account identity mismatches without residue", async (t) => {
  const cases = [
    ["format", { format: "unknown-account-data" }],
    ["version", { version: 1 }],
    ["exported-at", { exportedAt: -1 }],
    ["account-id-type", { accountId: 123 }],
    ["account-id-empty", { accountId: "" }],
    ["user-missing", { user: null }],
    ["user-id-type", { user: { id: 123 } }],
    ["user-account-mismatch", { user: { id: "different_synthetic_account" } }],
  ];
  for (const [name, overrides] of cases) {
    await t.test(name, async (t) => {
      const sourceDirectory = await temporaryDirectory(t, `dspidle-import-account-${name}-source-`);
      const workspaceDirectory = await temporaryDirectory(t, `dspidle-import-account-${name}-workspace-`);
      const archive = await writeArchive(sourceDirectory, [], {
        accountData: validAccountData(overrides),
      });
      await assertPrepareRejectsWithoutResidue({
        archiveFile: archive.archiveFile,
        workspaceDirectory,
        code: "ACCOUNT_ARCHIVE_ACCOUNT_INVALID",
      });
    });
  }
});

test("prepare rejects unsupported cloud schema before copying any payload", async (t) => {
  const sourceDirectory = await temporaryDirectory(t, "dspidle-import-schema-source-");
  const workspaceDirectory = await temporaryDirectory(t, "dspidle-import-schema-workspace-");
  const archive = await writeArchive(sourceDirectory, [saveRef(smallPayload("normal"))], { schemaVersion: 6 });
  await assertPrepareRejectsWithoutResidue({
    archiveFile: archive.archiveFile,
    workspaceDirectory,
    code: "ACCOUNT_ARCHIVE_SCHEMA_UNSUPPORTED",
  });
});

test("prepare enforces revision, history, slot, mode, and account quotas before extraction", async (t) => {
  const normal = smallPayload("normal", "quota-normal");
  const speedrun = smallPayload("speedrun", "quota-speedrun");
  const maximum = Math.max(normal.size, speedrun.size);
  const cases = [
    {
      name: "revision",
      saves: [saveRef(normal)],
      policy: {
        revisionBytes: normal.size - 1,
        slotBytes: normal.size * 10,
        modeBytes: normal.size * 20,
        accountBytes: normal.size * 40,
        historyRevisions: 20,
      },
      code: "CLOUD_REVISION_QUOTA_EXCEEDED",
      status: 413,
    },
    {
      name: "history",
      saves: [1, 2, 3].map((revision) => saveRef(normal, { revision })),
      policy: {
        revisionBytes: normal.size,
        slotBytes: normal.size * 10,
        modeBytes: normal.size * 20,
        accountBytes: normal.size * 40,
        historyRevisions: 2,
      },
      code: "CLOUD_HISTORY_REVISIONS_QUOTA_EXCEEDED",
      status: 507,
    },
    {
      name: "slot",
      saves: [1, 2].map((revision) => saveRef(normal, { revision })),
      policy: {
        revisionBytes: normal.size,
        slotBytes: normal.size,
        modeBytes: normal.size * 10,
        accountBytes: normal.size * 20,
        historyRevisions: 20,
      },
      code: "CLOUD_SLOT_BYTES_QUOTA_EXCEEDED",
      status: 507,
    },
    {
      name: "mode",
      saves: [saveRef(normal), saveRef(normal, { slot: "1" })],
      policy: {
        revisionBytes: normal.size,
        slotBytes: normal.size,
        modeBytes: normal.size,
        accountBytes: normal.size * 10,
        historyRevisions: 20,
      },
      code: "CLOUD_MODE_BYTES_QUOTA_EXCEEDED",
      status: 507,
    },
    {
      name: "account",
      saves: [saveRef(normal), saveRef(speedrun, { mode: "speedrun" })],
      policy: {
        revisionBytes: maximum,
        slotBytes: maximum,
        modeBytes: maximum,
        accountBytes: maximum,
        historyRevisions: 20,
      },
      code: "CLOUD_ACCOUNT_BYTES_QUOTA_EXCEEDED",
      status: 507,
    },
  ];
  for (const fixture of cases) {
    await t.test(fixture.name, async (t) => {
      const sourceDirectory = await temporaryDirectory(t, `dspidle-import-quota-${fixture.name}-source-`);
      const workspaceDirectory = await temporaryDirectory(t, `dspidle-import-quota-${fixture.name}-workspace-`);
      const archive = await writeArchive(sourceDirectory, fixture.saves);
      await assertPrepareRejectsWithoutResidue({
        archiveFile: archive.archiveFile,
        workspaceDirectory,
        code: fixture.code,
        statusCode: fixture.status,
        options: { quotaPolicy: fixture.policy },
      });
    });
  }
});

test("prepare rejects CRC- or SHA-damaged payloads and removes every extracted fragment", async (t) => {
  const cases = [
    { name: "crc", rewriteCrc: false, code: "ACCOUNT_ARCHIVE_CRC_MISMATCH" },
    { name: "sha", rewriteCrc: true, code: "ACCOUNT_ARCHIVE_BLOB_INTEGRITY_INVALID" },
  ];
  for (const fixture of cases) {
    await t.test(fixture.name, async (t) => {
      const sourceDirectory = await temporaryDirectory(t, `dspidle-import-${fixture.name}-source-`);
      const workspaceDirectory = await temporaryDirectory(t, `dspidle-import-${fixture.name}-workspace-`);
      const payload = smallPayload("normal", `${fixture.name}-integrity-marker`);
      const archive = await writeArchive(sourceDirectory, [saveRef(payload)]);
      const zip = await readFile(archive.archiveFile);
      const entry = locateZipEntries(zip).find(({ name }) => name.startsWith("payloads/"));
      assert.ok(entry);
      const marker = Buffer.from(`${fixture.name}-integrity-marker`, "utf8");
      const markerOffset = zip.indexOf(marker, entry.dataOffset);
      assert.ok(markerOffset >= entry.dataOffset && markerOffset < entry.dataOffset + entry.size);
      zip[markerOffset] = zip[markerOffset] === 0x78 ? 0x79 : 0x78;
      if (fixture.rewriteCrc) rewriteEntryCrc(zip, entry);
      const damagedFile = path.join(sourceDirectory, `${fixture.name}-damaged.zip`);
      await writeFile(damagedFile, zip);
      await assertPrepareRejectsWithoutResidue({
        archiveFile: damagedFile,
        workspaceDirectory,
        code: fixture.code,
      });
    });
  }
});

test("prepare rejects payload/ref mode conflicts and removes the copied payload", async (t) => {
  const sourceDirectory = await temporaryDirectory(t, "dspidle-import-mode-source-");
  const workspaceDirectory = await temporaryDirectory(t, "dspidle-import-mode-workspace-");
  const speedrun = smallPayload("speedrun", "speedrun-body-normal-ref");
  const archive = await writeArchive(sourceDirectory, [saveRef(speedrun, { mode: "normal" })]);
  await assertPrepareRejectsWithoutResidue({
    archiveFile: archive.archiveFile,
    workspaceDirectory,
    code: "ACCOUNT_ARCHIVE_MODE_MISMATCH",
  });
});

test("prepare propagates authoritative save inspection failure and removes staged payloads", async (t) => {
  const sourceDirectory = await temporaryDirectory(t, "dspidle-import-authority-source-");
  const workspaceDirectory = await temporaryDirectory(t, "dspidle-import-authority-workspace-");
  const invalidEnvelope = smallPayload("normal", "invalid-authoritative-checksum");
  const archive = await writeArchive(sourceDirectory, [saveRef(invalidEnvelope)]);
  await assertPrepareRejectsWithoutResidue({
    archiveFile: archive.archiveFile,
    workspaceDirectory,
    code: "ACCOUNT_ARCHIVE_SAVE_FORMAT_INVALID",
    options: { inspectPayload: inspectAccountArchivePayloadFile },
  });
});

test("prepare removes all prior payload files when a later authoritative inspection throws", async (t) => {
  const sourceDirectory = await temporaryDirectory(t, "dspidle-import-authority-throw-source-");
  const workspaceDirectory = await temporaryDirectory(t, "dspidle-import-authority-throw-workspace-");
  const first = smallPayload("normal", "authority-first");
  const second = smallPayload("normal", "authority-second");
  const archive = await writeArchive(sourceDirectory, [
    saveRef(first),
    saveRef(second, { slot: "1" }),
  ]);
  let calls = 0;
  const inspectPayload = async ({ checksum, size, mode }) => {
    calls += 1;
    if (calls === 2) throw new Error("synthetic authoritative inspector failure");
    return {
      validPayload: true,
      payloadChecksum: checksum,
      payloadSize: size,
      payloadMode: mode,
      summary: { marker: "first-valid" },
    };
  };
  await assertPrepareRejectsWithoutResidue({
    archiveFile: archive.archiveFile,
    workspaceDirectory,
    code: "ACCOUNT_ARCHIVE_IMPORT_VALIDATION_FAILED",
    options: { inspectPayload },
  });
  assert.equal(calls, 2);
});

test("30 MiB payload is prepared through bounded chunks without returning its body", async (t) => {
  const sourceDirectory = await temporaryDirectory(t, "dspidle-import-large-source-");
  const workspaceDirectory = await temporaryDirectory(t, "dspidle-import-large-workspace-");
  const payload = largePayload("normal", 30 * MIB);
  const archive = await writeArchive(sourceDirectory, [saveRef(payload)], {
    writerOptions: {
      limits: {
        maxPayloadBytes: 32 * MIB,
        maxArchiveBytes: 64 * MIB,
        maxTotalUncompressedBytes: 64 * MIB,
        chunkBytes: 64 * 1_024,
      },
    },
  });
  let inspectedChunks = 0;
  let largestChunk = 0;
  const inspectPayload = async ({ file, checksum, size, mode }) => {
    const digest = createHash("sha256");
    let observedBytes = 0;
    for await (const chunk of createReadStream(file, { highWaterMark: 64 * 1_024 })) {
      inspectedChunks += 1;
      largestChunk = Math.max(largestChunk, chunk.byteLength);
      observedBytes += chunk.byteLength;
      digest.update(chunk);
    }
    assert.equal(observedBytes, size);
    assert.equal(digest.digest("hex"), checksum);
    return {
      validPayload: true,
      payloadChecksum: checksum,
      payloadSize: size,
      payloadMode: mode,
      summary: { marker: "large-chunked" },
    };
  };
  const result = await prepareAccountArchiveImport(archive.archiveFile, {
    workspaceDirectory,
    inspectPayload,
    maximumArchiveBytes: 64 * MIB,
    maximumPayloadBytes: 32 * MIB,
  });

  assert.equal(result.refs.length, 1);
  assert.equal(result.refs[0].size, 30 * MIB);
  assert.equal((await stat(result.refs[0].payloadFile)).size, 30 * MIB);
  assert.equal("payload" in result.refs[0], false);
  assert.equal("body" in result.refs[0], false);
  assert.ok(inspectedChunks > 400);
  assert.ok(largestChunk <= 64 * 1_024);
});

test("maximum archive request size follows account quota with bounded overhead", () => {
  const policy = {
    revisionBytes: 1 * MIB,
    slotBytes: 2 * MIB,
    modeBytes: 3 * MIB,
    accountBytes: 4 * MIB,
    historyRevisions: 2,
  };
  assert.equal(maximumAccountArchiveImportBytes(policy), 28 * MIB);
  assert.ok(maximumAccountArchiveImportBytes() < 0xffff_ffff);
});
