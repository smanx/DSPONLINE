import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { AccountArchiveImportError } from "./account-archive-import.mjs";
import {
  LEGACY_JSON_ACCOUNT_IMPORT_FORMAT,
  LEGACY_JSON_ACCOUNT_IMPORT_VERSION,
  prepareLegacyJsonAccountImport,
} from "./account-archive-legacy-json.mjs";

const EXPORTED_AT = 1_786_588_900_000;
const ACCOUNT_ID = "legacy_json_synthetic_account";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function save(mode, slot, revision, marker) {
  const payload = JSON.stringify({
    formatVersion: 2,
    savedAt: EXPORTED_AT,
    mode,
    checksum: "synthetic-envelope-checksum",
    state: { version: 46, mode, entities: [], marker },
  });
  return {
    mode,
    slot,
    revision,
    updatedAt: EXPORTED_AT + revision,
    size: Buffer.byteLength(payload),
    checksum: sha256(Buffer.from(payload)),
    payload,
  };
}

function legacyExport(overrides = {}) {
  const normalMain = save("normal", "main", 2, "normal-main");
  const normalSlot = save("normal", "1", 3, "normal-slot");
  const speedrunMain = save("speedrun", "main", 4, "speedrun-main");
  const speedrunSlot = save("speedrun", "2", 5, "speedrun-slot");
  return {
    exportedAt: EXPORTED_AT,
    schemaVersion: 7,
    user: { id: ACCOUNT_ID, displayName: "Synthetic" },
    cloudSave: normalMain,
    cloudSaveHistory: [{ ...normalMain, payload: undefined }],
    cloudSaveSlots: { "1": normalSlot },
    cloudSaveSlotHistory: { "1": [{ ...normalSlot, payload: undefined }] },
    cloudSavesByMode: {
      normal: { main: normalMain, slots: { "1": normalSlot } },
      speedrun: { main: speedrunMain, slots: { "2": speedrunSlot } },
    },
    cloudSaveHistoriesByMode: {
      normal: { main: [{ ...normalMain, payload: undefined }], slots: { "1": [{ ...normalSlot, payload: undefined }] } },
      speedrun: { main: [{ ...speedrunMain, payload: undefined }], slots: { "2": [{ ...speedrunSlot, payload: undefined }] } },
    },
    submissions: [{ never: "imported" }],
    sessions: [{ never: "imported" }],
    ...overrides,
  };
}

function inspector({ payload, checksum, size, mode }) {
  const parsed = JSON.parse(payload);
  return {
    validPayload: true,
    payloadChecksum: checksum,
    payloadSize: size,
    payloadMode: parsed.mode,
    summary: { marker: parsed.state.marker, mode },
  };
}

function importError(code, statusCode = undefined) {
  return (error) => {
    assert.ok(error instanceof AccountArchiveImportError, String(error));
    assert.equal(error.code, code);
    if (statusCode !== undefined) assert.equal(error.statusCode, statusCode);
    return true;
  };
}

test("legacy JSON prepares duplicated normal aliases and explicit speedrun records without importing identity boundaries", async () => {
  const input = legacyExport();
  const result = await prepareLegacyJsonAccountImport(JSON.stringify(input), {
    expectedAccountId: ACCOUNT_ID,
    inspectPayload: inspector,
  });

  assert.equal(result.format, LEGACY_JSON_ACCOUNT_IMPORT_FORMAT);
  assert.equal(result.version, LEGACY_JSON_ACCOUNT_IMPORT_VERSION);
  assert.deepEqual(result.source, { accountId: ACCOUNT_ID, exportedAt: EXPORTED_AT, schemaVersion: 7 });
  assert.deepEqual(result.refs.map((entry) => `${entry.mode}:${entry.slot}:${entry.revision}`), [
    "normal:main:2", "normal:1:3", "speedrun:main:4", "speedrun:2:5",
  ]);
  assert.equal(result.redundantHistoryRevisions, 6);
  assert.equal(JSON.stringify(result).includes("never"), false);
  assert.equal(result.refs.every((entry) => typeof entry.payload === "string"), true);
  assert.deepEqual(result.refs.map((entry) => entry.summary.marker), ["normal-main", "normal-slot", "speedrun-main", "speedrun-slot"]);
});

test("legacy JSON supports the pre-mode normal-only shape and never infers speedrun from an unmarked namespace", async () => {
  const input = legacyExport();
  delete input.cloudSavesByMode;
  delete input.cloudSaveHistoriesByMode;
  const result = await prepareLegacyJsonAccountImport(JSON.stringify(input), { expectedAccountId: ACCOUNT_ID, inspectPayload: inspector });
  assert.deepEqual(result.refs.map((entry) => `${entry.mode}:${entry.slot}`), ["normal:main", "normal:1"]);

  const disguised = legacyExport({ cloudSave: { ...input.cloudSave, payload: save("speedrun", "main", 2, "disguised").payload } });
  disguised.cloudSave.size = Buffer.byteLength(disguised.cloudSave.payload);
  disguised.cloudSave.checksum = sha256(Buffer.from(disguised.cloudSave.payload));
  delete disguised.cloudSavesByMode;
  delete disguised.cloudSaveHistory;
  delete disguised.cloudSaveSlotHistory;
  delete disguised.cloudSaveHistoriesByMode;
  await assert.rejects(prepareLegacyJsonAccountImport(JSON.stringify(disguised), { expectedAccountId: ACCOUNT_ID, inspectPayload: inspector }), importError("ACCOUNT_ARCHIVE_SAVE_FORMAT_INVALID"));
});

test("legacy JSON rejects invalid UTF-8 and BOM-prefixed byte input before any candidate inspection", async () => {
  const valid = Buffer.from(JSON.stringify(legacyExport()), "utf8");
  for (const [name, bytes] of [
    ["invalid", Buffer.from([0xc3, 0x28])],
    ["bom", Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), valid])],
  ]) {
    await test(name, async () => {
      let inspected = false;
      await assert.rejects(prepareLegacyJsonAccountImport(bytes, {
        expectedAccountId: ACCOUNT_ID,
        inspectPayload: async (record) => { inspected = true; return inspector(record); },
      }), importError("ACCOUNT_ARCHIVE_LEGACY_JSON_UTF8_INVALID"));
      assert.equal(inspected, false);
    });
  }
});

test("legacy JSON rejects historical metadata that cannot be restored from a current payload", async () => {
  const input = legacyExport();
  input.cloudSaveHistoriesByMode.speedrun.main = [{
    ...input.cloudSavesByMode.speedrun.main,
    revision: 1,
    updatedAt: EXPORTED_AT + 1,
    checksum: sha256("historic-body-not-exported"),
    size: 123,
    payload: undefined,
  }];
  let inspected = false;
  await assert.rejects(prepareLegacyJsonAccountImport(JSON.stringify(input), {
    expectedAccountId: ACCOUNT_ID,
    inspectPayload: async (record) => { inspected = true; return inspector(record); },
  }), importError("ACCOUNT_ARCHIVE_LEGACY_JSON_HISTORY_UNRESTORABLE", 409));
  assert.equal(inspected, false);
});

test("legacy JSON rejects malformed, over-limit, account-mismatched, integrity-damaged, and conflicting aliases before producing a candidate", async () => {
  const cases = [
    ["malformed", "{", {}, "ACCOUNT_ARCHIVE_LEGACY_JSON_INVALID", 400],
    ["too-large", JSON.stringify(legacyExport()), { maximumBytes: 8 }, "ACCOUNT_ARCHIVE_LEGACY_JSON_TOO_LARGE", 413],
    ["account", JSON.stringify(legacyExport({ user: { id: "other_account" } })), {}, "ACCOUNT_ARCHIVE_ACCOUNT_MISMATCH", 409],
    ["schema", JSON.stringify(legacyExport({ schemaVersion: 6 })), {}, "ACCOUNT_ARCHIVE_LEGACY_JSON_SCHEMA_UNSUPPORTED", 400],
  ];
  for (const [name, input, options, code, status] of cases) {
    await test(name, async () => {
      let candidateCreated = false;
      await assert.rejects(prepareLegacyJsonAccountImport(input, {
        expectedAccountId: ACCOUNT_ID,
        inspectPayload: async (record) => { candidateCreated = true; return inspector(record); },
        ...options,
      }), importError(code, status));
      assert.equal(candidateCreated, false, `${name} must reject before any candidate payload validation`);
    });
  }

  const integrity = legacyExport();
  integrity.cloudSave = { ...integrity.cloudSave, checksum: sha256("tampered") };
  let integrityCandidate = false;
  await assert.rejects(prepareLegacyJsonAccountImport(JSON.stringify(integrity), {
    expectedAccountId: ACCOUNT_ID,
    inspectPayload: async (record) => { integrityCandidate = true; return inspector(record); },
  }), importError("ACCOUNT_ARCHIVE_LEGACY_JSON_INTEGRITY_INVALID"));
  assert.equal(integrityCandidate, false);

  const conflict = legacyExport();
  conflict.cloudSavesByMode.normal.main = save("normal", "main", 9, "conflicting-main");
  await assert.rejects(prepareLegacyJsonAccountImport(JSON.stringify(conflict), { expectedAccountId: ACCOUNT_ID, inspectPayload: inspector }), importError("ACCOUNT_ARCHIVE_LEGACY_JSON_CONFLICT"));
});

test("legacy JSON validates every candidate before returning it and leaves no partial candidate on authority or mode failure", async () => {
  const input = legacyExport();
  let calls = 0;
  await assert.rejects(prepareLegacyJsonAccountImport(JSON.stringify(input), {
    expectedAccountId: ACCOUNT_ID,
    inspectPayload: async (record) => {
      calls += 1;
      if (calls === 3) return { ...inspector(record), payloadMode: "normal" };
      return inspector(record);
    },
  }), importError("ACCOUNT_ARCHIVE_SAVE_FORMAT_INVALID"));
  assert.equal(calls, 3);
});

test("legacy JSON quota and mode namespaces remain isolated", async () => {
  const input = legacyExport();
  const normalBytes = input.cloudSave.size + input.cloudSaveSlots["1"].size;
  const speedrunBytes = input.cloudSavesByMode.speedrun.main.size + input.cloudSavesByMode.speedrun.slots["2"].size;
  const revisionBytes = Math.max(
    input.cloudSave.size,
    input.cloudSaveSlots["1"].size,
    input.cloudSavesByMode.speedrun.main.size,
    input.cloudSavesByMode.speedrun.slots["2"].size,
  );
  const result = await prepareLegacyJsonAccountImport(JSON.stringify(input), {
    expectedAccountId: ACCOUNT_ID,
    inspectPayload: inspector,
    quotaPolicy: {
      revisionBytes,
      slotBytes: normalBytes + speedrunBytes,
      modeBytes: Math.max(normalBytes, speedrunBytes),
      accountBytes: normalBytes + speedrunBytes,
      historyRevisions: 20,
    },
  });
  assert.equal(result.quota.logicalBytes, normalBytes + speedrunBytes);

  await assert.rejects(prepareLegacyJsonAccountImport(JSON.stringify(input), {
    expectedAccountId: ACCOUNT_ID,
    inspectPayload: inspector,
    quotaPolicy: {
      revisionBytes,
      slotBytes: revisionBytes,
      modeBytes: normalBytes - 1,
      accountBytes: normalBytes + speedrunBytes,
      historyRevisions: 20,
    },
  }), importError("CLOUD_MODE_BYTES_QUOTA_EXCEEDED", 507));
});
