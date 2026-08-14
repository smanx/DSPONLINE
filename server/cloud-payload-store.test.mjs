import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import {
  CLOUD_PAYLOAD_ALIAS_PREFIX,
  CLOUD_PAYLOAD_BLOB_TABLE,
  CloudPayloadStoreError,
  auditCloudPayloadAliasReferences,
  backfillCloudPayloadAliases,
  collectCloudPayloadStoreStats,
  createCloudPayloadAlias,
  deleteCloudPayload,
  deleteCloudPayloadsForUser,
  garbageCollectCloudPayloadBlobCandidates,
  garbageCollectCloudPayloadBlobs,
  initializeCloudPayloadStore,
  linkVerifiedCloudPayload,
  materializeCloudPayloadAliases,
  parseCloudPayloadAlias,
  readCloudPayload,
  writeCloudPayload,
  writeInspectedCloudPayload,
} from "./cloud-payload-store.mjs";

function sha256(payload) {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

function createLegacyDatabase(filename = ":memory:") {
  const database = new Database(filename);
  database.exec(`
    CREATE TABLE cloud_save_payloads (
      user_id TEXT NOT NULL,
      slot TEXT NOT NULL,
      revision INTEGER NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY (user_id, slot, revision)
    ) WITHOUT ROWID
  `);
  return database;
}

function runTransaction(database, callback) {
  return database.transaction(callback)();
}

function expectCode(code) {
  return (error) => error instanceof CloudPayloadStoreError && error.code === code;
}

test("initializes a layout-v2 legacy table and uses an alias that cannot be legal JSON", () => {
  const database = createLegacyDatabase();
  try {
    const initialized = initializeCloudPayloadStore(database);
    assert.equal(initialized.sqliteLayoutVersion, 2);
    assert.equal(initialized.internalVersion, 1);
    assert.equal(database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?").get(CLOUD_PAYLOAD_BLOB_TABLE).count, 1);
    assert.deepEqual(initializeCloudPayloadStore(database), initialized, "initialization must be idempotent");

    const body = JSON.stringify({ version: 46, marker: "legacy-compatible" });
    const alias = createCloudPayloadAlias(sha256(body), Buffer.byteLength(body));
    assert.ok(alias.startsWith(CLOUD_PAYLOAD_ALIAS_PREFIX));
    assert.deepEqual(parseCloudPayloadAlias(alias), {
      version: 1,
      checksum: sha256(body),
      sizeBytes: Buffer.byteLength(body),
    });
    assert.throws(() => JSON.parse(alias), SyntaxError);
    assert.equal(parseCloudPayloadAlias(body), null);
    assert.throws(() => parseCloudPayloadAlias(`${alias}extra`), expectCode("CLOUD_PAYLOAD_ALIAS_INVALID"));
    assert.throws(() => createCloudPayloadAlias("ABC", body.length), expectCode("CLOUD_PAYLOAD_CHECKSUM_INVALID"));
  } finally {
    database.close();
  }
});

test("deduplicates identical content across normal and speedrun slots while preserving exact reads", () => {
  const database = createLegacyDatabase();
  try {
    initializeCloudPayloadStore(database);
    const body = JSON.stringify({ formatVersion: 2, state: { version: 46, mode: "normal", note: "量子" } });
    const digest = sha256(body);
    const writes = runTransaction(database, () => [
      writeCloudPayload(database, { userId: "user_a", slot: "main", revision: 1, payload: body, checksum: digest }),
      writeCloudPayload(database, { userId: "user_a", slot: "speedrun:main", revision: 1, payload: body, checksum: digest }),
      writeCloudPayload(database, { userId: "user_a", slot: "1", revision: 3, payload: body }),
    ]);
    assert.deepEqual(writes.map((entry) => entry.blob), ["inserted", "reused", "reused"]);
    assert.equal(database.prepare(`SELECT count(*) AS count FROM ${CLOUD_PAYLOAD_BLOB_TABLE}`).get().count, 1);
    assert.equal(readCloudPayload(database, { userId: "user_a", slot: "main", revision: 1 }), body);
    assert.equal(readCloudPayload(database, { userId: "user_a", slot: "speedrun:main", revision: 1 }), body);
    assert.equal(readCloudPayload(database, { userId: "user_a", slot: "1", revision: 3 }), body);
    assert.equal(readCloudPayload(database, { userId: "user_a", slot: "2", revision: 1 }), null);

    const stats = collectCloudPayloadStoreStats(database);
    assert.deepEqual(stats.rows, {
      total: 3,
      legacy: 0,
      aliases: 3,
      invalidAliases: 0,
      conflictingAliasMetadata: 0,
    });
    assert.deepEqual(stats.blobs, { total: 1, referenced: 1, orphan: 0, missingReferences: 0 });
    assert.equal(stats.bytes.logical, Buffer.byteLength(body) * 3);
    assert.equal(stats.bytes.blobStored, Buffer.byteLength(body));
    assert.equal(stats.bytes.deduplicated, Buffer.byteLength(body) * 2);
    assert.equal(JSON.stringify(stats).includes(body), false, "aggregate statistics must not expose save text");
    assert.equal(JSON.stringify(stats).includes(digest), false, "aggregate statistics must not expose content addresses");
  } finally {
    database.close();
  }
});

test("writes an inspector-verified body without weakening size or collision constraints", () => {
  const database = createLegacyDatabase();
  try {
    initializeCloudPayloadStore(database);
    const payload = JSON.stringify({ formatVersion: 2, state: { version: 46, mode: "normal" }, inspected: true });
    const checksum = sha256(payload);
    const sizeBytes = Buffer.byteLength(payload);
    database.transaction(() => {
      writeInspectedCloudPayload(database, { userId: "user_a", slot: "main", revision: 1, payload, checksum, sizeBytes });
      writeInspectedCloudPayload(database, { userId: "user_a", slot: "speedrun:main", revision: 1, payload, checksum, sizeBytes });
    })();
    assert.equal(readCloudPayload(database, { userId: "user_a", slot: "main", revision: 1 }), payload);
    assert.equal(database.prepare(`SELECT count(*) AS count FROM ${CLOUD_PAYLOAD_BLOB_TABLE}`).get().count, 1);
    assert.throws(() => database.transaction(() => writeInspectedCloudPayload(database, {
      userId: "user_a", slot: "1", revision: 1, payload, checksum, sizeBytes: sizeBytes + 1,
    }))(), /constraint|size/i);
    assert.throws(() => database.transaction(() => writeInspectedCloudPayload(database, {
      userId: "user_a", slot: "2", revision: 1, payload: `${payload}x`, checksum, sizeBytes: sizeBytes + 1,
    }))(), expectCode("CLOUD_PAYLOAD_CHECKSUM_COLLISION"));
  } finally {
    database.close();
  }
});

test("requires caller-owned transactions and never commits a blob independently", () => {
  const database = createLegacyDatabase();
  try {
    initializeCloudPayloadStore(database);
    const body = JSON.stringify({ state: { version: 46 }, atomic: true });
    assert.throws(
      () => writeCloudPayload(database, { userId: "user_a", slot: "main", revision: 1, payload: body }),
      expectCode("CLOUD_PAYLOAD_TRANSACTION_REQUIRED"),
    );
    assert.throws(() => backfillCloudPayloadAliases(database), expectCode("CLOUD_PAYLOAD_TRANSACTION_REQUIRED"));
    assert.throws(() => materializeCloudPayloadAliases(database), expectCode("CLOUD_PAYLOAD_TRANSACTION_REQUIRED"));
    assert.throws(() => garbageCollectCloudPayloadBlobCandidates(database, new Map()), expectCode("CLOUD_PAYLOAD_TRANSACTION_REQUIRED"));
    assert.throws(() => garbageCollectCloudPayloadBlobs(database), expectCode("CLOUD_PAYLOAD_TRANSACTION_REQUIRED"));
    assert.throws(() => deleteCloudPayloadsForUser(database, "user_a"), expectCode("CLOUD_PAYLOAD_TRANSACTION_REQUIRED"));
    assert.throws(() => runTransaction(database, () => {
      writeCloudPayload(database, { userId: "user_a", slot: "main", revision: 1, payload: body });
      throw new Error("caller aborts the transaction");
    }), /caller aborts/);
    assert.equal(database.prepare("SELECT count(*) AS count FROM cloud_save_payloads").get().count, 0);
    assert.equal(database.prepare(`SELECT count(*) AS count FROM ${CLOUD_PAYLOAD_BLOB_TABLE}`).get().count, 0);
  } finally {
    database.close();
  }
});

test("hard-fails supplied checksum mismatches and same-address different-content collisions", () => {
  const database = createLegacyDatabase();
  try {
    initializeCloudPayloadStore(database);
    const incoming = JSON.stringify({ value: "incoming" });
    assert.throws(() => runTransaction(database, () => writeCloudPayload(database, {
      userId: "user_a",
      slot: "main",
      revision: 1,
      payload: incoming,
      checksum: "f".repeat(64),
    })), expectCode("CLOUD_PAYLOAD_INPUT_CHECKSUM_MISMATCH"));

    const conflicting = JSON.stringify({ value: "conflict" });
    const incomingChecksum = sha256(incoming);
    runTransaction(database, () => {
      database.prepare(`INSERT INTO ${CLOUD_PAYLOAD_BLOB_TABLE} (checksum, size_bytes, payload) VALUES (?, ?, ?)`)
        .run(incomingChecksum, Buffer.byteLength(conflicting), conflicting);
    });
    assert.throws(() => runTransaction(database, () => writeCloudPayload(database, {
      userId: "user_a",
      slot: "main",
      revision: 1,
      payload: incoming,
      checksum: incomingChecksum,
    })), expectCode("CLOUD_PAYLOAD_CHECKSUM_COLLISION"));
    assert.equal(database.prepare(`SELECT payload FROM ${CLOUD_PAYLOAD_BLOB_TABLE} WHERE checksum = ?`).get(incomingChecksum).payload, conflicting);
    assert.equal(database.prepare("SELECT count(*) AS count FROM cloud_save_payloads").get().count, 0);
  } finally {
    database.close();
  }
});

test("dual-reads legacy bodies and reports malformed aliases, missing blobs, size mismatches, and hash corruption", async (t) => {
  const cases = [
    {
      name: "malformed alias",
      setup(database) {
        database.prepare("INSERT INTO cloud_save_payloads VALUES (?, ?, ?, ?)").run("user_a", "main", 1, `${CLOUD_PAYLOAD_ALIAS_PREFIX}broken`);
      },
      code: "CLOUD_PAYLOAD_ALIAS_INVALID",
    },
    {
      name: "missing blob",
      setup(database, body) {
        database.prepare("INSERT INTO cloud_save_payloads VALUES (?, ?, ?, ?)").run(
          "user_a", "main", 1, createCloudPayloadAlias(sha256(body), Buffer.byteLength(body)),
        );
      },
      code: "CLOUD_PAYLOAD_BLOB_MISSING",
    },
    {
      name: "alias size mismatch",
      setup(database, body) {
        const digest = sha256(body);
        database.prepare(`INSERT INTO ${CLOUD_PAYLOAD_BLOB_TABLE} VALUES (?, ?, ?)`).run(digest, Buffer.byteLength(body), body);
        database.prepare("INSERT INTO cloud_save_payloads VALUES (?, ?, ?, ?)").run(
          "user_a", "main", 1, createCloudPayloadAlias(digest, Buffer.byteLength(body) + 1),
        );
      },
      code: "CLOUD_PAYLOAD_ALIAS_SIZE_MISMATCH",
    },
    {
      name: "blob checksum mismatch",
      setup(database, body) {
        const digest = sha256(body);
        const corrupt = body.replace("original", "tampered");
        assert.equal(Buffer.byteLength(corrupt), Buffer.byteLength(body));
        database.prepare(`INSERT INTO ${CLOUD_PAYLOAD_BLOB_TABLE} VALUES (?, ?, ?)`).run(digest, Buffer.byteLength(corrupt), corrupt);
        database.prepare("INSERT INTO cloud_save_payloads VALUES (?, ?, ?, ?)").run(
          "user_a", "main", 1, createCloudPayloadAlias(digest, Buffer.byteLength(corrupt)),
        );
      },
      code: "CLOUD_PAYLOAD_BLOB_CHECKSUM_MISMATCH",
    },
    {
      name: "blob body size mismatch",
      setup(database, body) {
        const digest = sha256(body);
        database.pragma("ignore_check_constraints = ON");
        try {
          database.prepare(`INSERT INTO ${CLOUD_PAYLOAD_BLOB_TABLE} VALUES (?, ?, ?)`).run(
            digest,
            Buffer.byteLength(body) + 1,
            body,
          );
        } finally {
          database.pragma("ignore_check_constraints = OFF");
        }
        database.prepare("INSERT INTO cloud_save_payloads VALUES (?, ?, ?, ?)").run(
          "user_a", "main", 1, createCloudPayloadAlias(digest, Buffer.byteLength(body) + 1),
        );
      },
      code: "CLOUD_PAYLOAD_BLOB_SIZE_MISMATCH",
    },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const database = createLegacyDatabase();
      try {
        initializeCloudPayloadStore(database);
        const body = JSON.stringify({ value: "original" });
        scenario.setup(database, body);
        assert.throws(
          () => readCloudPayload(database, { userId: "user_a", slot: "main", revision: 1 }),
          expectCode(scenario.code),
        );
      } finally {
        database.close();
      }
    });
  }

  const legacy = createLegacyDatabase();
  try {
    initializeCloudPayloadStore(legacy);
    const body = JSON.stringify({ state: { version: 46 }, legacy: true });
    legacy.prepare("INSERT INTO cloud_save_payloads VALUES (?, ?, ?, ?)").run("user_legacy", "main", 7, body);
    assert.equal(readCloudPayload(legacy, { userId: "user_legacy", slot: "main", revision: 7 }), body);
  } finally {
    legacy.close();
  }
});

test("backfill is idempotent, deduplicates all mode slots, and rolls back as one caller transaction on corruption", () => {
  const database = createLegacyDatabase();
  try {
    initializeCloudPayloadStore(database);
    const shared = JSON.stringify({ state: { version: 46 }, shared: true });
    const manual = JSON.stringify({ state: { version: 46 }, manual: 1 });
    database.prepare("INSERT INTO cloud_save_payloads VALUES (?, ?, ?, ?)").run("user_a", "main", 1, shared);
    database.prepare("INSERT INTO cloud_save_payloads VALUES (?, ?, ?, ?)").run("user_a", "speedrun:main", 1, shared);
    database.prepare("INSERT INTO cloud_save_payloads VALUES (?, ?, ?, ?)").run("user_a", "1", 2, manual);

    const first = runTransaction(database, () => backfillCloudPayloadAliases(database, { batchSize: 2 }));
    assert.deepEqual(first, {
      scannedRows: 3,
      backfilledRows: 3,
      alreadyAliasedRows: 0,
      blobsInserted: 2,
      blobsReused: 1,
      logicalBytes: Buffer.byteLength(shared) * 2 + Buffer.byteLength(manual),
    });
    assert.equal(database.prepare(`SELECT count(*) AS count FROM ${CLOUD_PAYLOAD_BLOB_TABLE}`).get().count, 2);
    assert.equal(readCloudPayload(database, { userId: "user_a", slot: "main", revision: 1 }), shared);
    assert.equal(readCloudPayload(database, { userId: "user_a", slot: "speedrun:main", revision: 1 }), shared);
    assert.equal(readCloudPayload(database, { userId: "user_a", slot: "1", revision: 2 }), manual);

    const second = runTransaction(database, () => backfillCloudPayloadAliases(database));
    assert.equal(second.scannedRows, 3);
    assert.equal(second.backfilledRows, 0);
    assert.equal(second.alreadyAliasedRows, 3);
    assert.equal(second.blobsInserted, 0);
    assert.equal(second.blobsReused, 0);

    const pending = JSON.stringify({ state: { version: 46 }, pending: "must-roll-back" });
    database.prepare("INSERT INTO cloud_save_payloads VALUES (?, ?, ?, ?)").run("user_b", "main", 1, pending);
    database.prepare("INSERT INTO cloud_save_payloads VALUES (?, ?, ?, ?)").run("zz_corrupt", "main", 1, `${CLOUD_PAYLOAD_ALIAS_PREFIX}damaged`);
    const blobCountBeforeFailure = database.prepare(`SELECT count(*) AS count FROM ${CLOUD_PAYLOAD_BLOB_TABLE}`).get().count;
    assert.throws(
      () => runTransaction(database, () => backfillCloudPayloadAliases(database)),
      expectCode("CLOUD_PAYLOAD_ALIAS_INVALID"),
    );
    assert.equal(
      database.prepare("SELECT payload FROM cloud_save_payloads WHERE user_id = 'user_b' AND slot = 'main'").get().payload,
      pending,
      "a legacy row changed before the later failure must be rolled back",
    );
    assert.equal(
      database.prepare(`SELECT count(*) AS count FROM ${CLOUD_PAYLOAD_BLOB_TABLE}`).get().count,
      blobCountBeforeFailure,
      "a blob inserted before the later failure must be rolled back",
    );
  } finally {
    database.close();
  }
});

test("materialize rollback is idempotent and restores exact JSON for direct 1.0.39 SELECT consumers", () => {
  const database = createLegacyDatabase();
  try {
    initializeCloudPayloadStore(database);
    const normal = JSON.stringify({ formatVersion: 2, state: { version: 46, saveMode: "normal" } });
    const speedrun = JSON.stringify({ formatVersion: 2, state: { version: 46, saveMode: "speedrun" } });
    runTransaction(database, () => {
      writeCloudPayload(database, { userId: "user_a", slot: "main", revision: 5, payload: normal });
      writeCloudPayload(database, { userId: "user_a", slot: "speedrun:main", revision: 8, payload: speedrun });
    });

    const first = runTransaction(database, () => materializeCloudPayloadAliases(database, { batchSize: 1 }));
    assert.equal(first.scannedRows, 2);
    assert.equal(first.materializedRows, 2);
    assert.equal(first.alreadyMaterializedRows, 0);
    const rows = database.prepare("SELECT slot, payload FROM cloud_save_payloads ORDER BY slot").all();
    assert.deepEqual(rows, [
      { slot: "main", payload: normal },
      { slot: "speedrun:main", payload: speedrun },
    ]);
    for (const row of rows) assert.doesNotThrow(() => JSON.parse(row.payload));

    const second = runTransaction(database, () => materializeCloudPayloadAliases(database));
    assert.equal(second.materializedRows, 0);
    assert.equal(second.alreadyMaterializedRows, 2);
    assert.deepEqual(database.prepare("SELECT slot, payload FROM cloud_save_payloads ORDER BY slot").all(), rows);
  } finally {
    database.close();
  }
});

test("materialize rollback leaves every alias intact when a later row is corrupt", () => {
  const database = createLegacyDatabase();
  try {
    initializeCloudPayloadStore(database);
    const body = JSON.stringify({ formatVersion: 2, state: { version: 46 }, atomicRollback: true });
    runTransaction(database, () => writeCloudPayload(database, {
      userId: "user_a",
      slot: "main",
      revision: 1,
      payload: body,
    }));
    const aliasBefore = database.prepare("SELECT payload FROM cloud_save_payloads WHERE user_id = 'user_a'").get().payload;
    database.prepare("INSERT INTO cloud_save_payloads VALUES (?, ?, ?, ?)").run(
      "zz_corrupt",
      "main",
      1,
      `${CLOUD_PAYLOAD_ALIAS_PREFIX}damaged`,
    );

    assert.throws(
      () => runTransaction(database, () => materializeCloudPayloadAliases(database)),
      expectCode("CLOUD_PAYLOAD_ALIAS_INVALID"),
    );
    assert.equal(
      database.prepare("SELECT payload FROM cloud_save_payloads WHERE user_id = 'user_a'").get().payload,
      aliasBefore,
      "the earlier materialized row must roll back to its alias",
    );
    assert.equal(readCloudPayload(database, { userId: "user_a", slot: "main", revision: 1 }), body);
  } finally {
    database.close();
  }
});

test("deletes individual and per-user rows while orphan GC preserves referenced blobs", () => {
  const database = createLegacyDatabase();
  try {
    initializeCloudPayloadStore(database);
    const shared = JSON.stringify({ payload: "shared" });
    const other = JSON.stringify({ payload: "other" });
    runTransaction(database, () => {
      writeCloudPayload(database, { userId: "user_a", slot: "main", revision: 1, payload: shared });
      writeCloudPayload(database, { userId: "user_a", slot: "speedrun:main", revision: 1, payload: shared });
      writeCloudPayload(database, { userId: "user_b", slot: "main", revision: 1, payload: other });
    });

    const first = runTransaction(database, () => {
      assert.equal(deleteCloudPayload(database, { userId: "user_a", slot: "main", revision: 1 }), 1);
      return garbageCollectCloudPayloadBlobs(database);
    });
    assert.deepEqual(first, { referencedBlobs: 2, orphanBlobs: 0, deletedBlobs: 0 });
    assert.equal(readCloudPayload(database, { userId: "user_a", slot: "speedrun:main", revision: 1 }), shared);

    const second = runTransaction(database, () => {
      assert.equal(deleteCloudPayloadsForUser(database, "user_a"), 1);
      return garbageCollectCloudPayloadBlobs(database);
    });
    assert.deepEqual(second, { referencedBlobs: 1, orphanBlobs: 1, deletedBlobs: 1 });
    assert.equal(readCloudPayload(database, { userId: "user_b", slot: "main", revision: 1 }), other);

    const third = runTransaction(database, () => {
      assert.equal(deleteCloudPayload(database, { userId: "user_b", slot: "main", revision: 1 }), 1);
      return garbageCollectCloudPayloadBlobs(database);
    });
    assert.deepEqual(third, { referencedBlobs: 0, orphanBlobs: 1, deletedBlobs: 1 });
    assert.equal(database.prepare(`SELECT count(*) AS count FROM ${CLOUD_PAYLOAD_BLOB_TABLE}`).get().count, 0);
  } finally {
    database.close();
  }
});

test("targeted orphan cleanup touches only deleted aliases and preserves shared blobs without auditing unrelated rows", () => {
  const database = createLegacyDatabase();
  try {
    initializeCloudPayloadStore(database);
    const shared = JSON.stringify({ payload: "targeted-shared" });
    const sharedChecksum = sha256(shared);
    const direct = JSON.stringify({ payload: "x".repeat(8 * 1024 * 1024) });
    const corruptChecksum = sha256("original");
    runTransaction(database, () => {
      writeCloudPayload(database, { userId: "user_a", slot: "main", revision: 1, payload: shared });
      writeCloudPayload(database, { userId: "user_b", slot: "speedrun:main", revision: 9, payload: shared });
      database.prepare("INSERT INTO cloud_save_payloads VALUES (?, ?, ?, ?)")
        .run("unrelated_direct", "main", 1, direct);
      database.prepare("INSERT INTO cloud_save_payloads VALUES (?, ?, ?, ?)")
        .run("unrelated_corrupt", "main", 1, `${CLOUD_PAYLOAD_ALIAS_PREFIX}malformed`);
      database.prepare(`INSERT INTO ${CLOUD_PAYLOAD_BLOB_TABLE} (checksum, size_bytes, payload) VALUES (?, ?, ?)`)
        .run(corruptChecksum, Buffer.byteLength("tampered"), "tampered");
    });

    const firstCandidates = new Map();
    const first = runTransaction(database, () => {
      assert.equal(deleteCloudPayload(database, { userId: "user_a", slot: "main", revision: 1 }, {
        blobCleanupCandidates: firstCandidates,
      }), 1);
      return garbageCollectCloudPayloadBlobCandidates(database, firstCandidates, new Map([[sharedChecksum, 1]]));
    });
    assert.deepEqual(first, { candidateBlobs: 1, referencedBlobs: 1, missingBlobs: 0, deletedBlobs: 0 });
    assert.equal(readCloudPayload(database, { userId: "user_b", slot: "speedrun:main", revision: 9 }), shared);

    const secondCandidates = new Map();
    const second = runTransaction(database, () => {
      assert.equal(deleteCloudPayloadsForUser(database, "user_b", { blobCleanupCandidates: secondCandidates }), 1);
      return garbageCollectCloudPayloadBlobCandidates(database, secondCandidates, new Map([[sharedChecksum, 0]]));
    });
    assert.deepEqual(second, { candidateBlobs: 1, referencedBlobs: 0, missingBlobs: 0, deletedBlobs: 1 });
    assert.equal(database.prepare(`SELECT count(*) AS count FROM ${CLOUD_PAYLOAD_BLOB_TABLE} WHERE checksum = ?`).get(sharedChecksum).count, 0);
    assert.equal(database.prepare(`SELECT payload FROM ${CLOUD_PAYLOAD_BLOB_TABLE} WHERE checksum = ?`).get(corruptChecksum).payload, "tampered");
    assert.equal(database.prepare("SELECT length(payload) AS size FROM cloud_save_payloads WHERE user_id = 'unrelated_direct'").get().size, direct.length);
    assert.equal(database.prepare("SELECT payload FROM cloud_save_payloads WHERE user_id = 'unrelated_corrupt'").get().payload, `${CLOUD_PAYLOAD_ALIAS_PREFIX}malformed`);

    const directCandidates = new Map();
    const directCleanup = runTransaction(database, () => {
      assert.equal(deleteCloudPayload(database, { userId: "unrelated_direct", slot: "main", revision: 1 }, {
        blobCleanupCandidates: directCandidates,
      }), 1);
      return garbageCollectCloudPayloadBlobCandidates(database, directCandidates);
    });
    assert.deepEqual(directCleanup, { candidateBlobs: 0, referencedBlobs: 0, missingBlobs: 0, deletedBlobs: 0 });
    assert.equal(database.prepare(`SELECT payload FROM ${CLOUD_PAYLOAD_BLOB_TABLE} WHERE checksum = ?`).get(corruptChecksum).payload, "tampered");
  } finally {
    database.close();
  }
});

test("startup alias audit indexes actual fixed prefixes and fails closed on malformed aliases", () => {
  const database = createLegacyDatabase();
  try {
    initializeCloudPayloadStore(database);
    const body = JSON.stringify({ payload: "audited-alias" });
    runTransaction(database, () => {
      writeCloudPayload(database, { userId: "aliased", slot: "main", revision: 1, payload: body });
      database.prepare("INSERT INTO cloud_save_payloads VALUES (?, ?, ?, ?)")
        .run("legacy_direct", "main", 1, JSON.stringify({ padding: "x".repeat(2 * 1024 * 1024) }));
      database.prepare("INSERT INTO cloud_save_payloads VALUES (?, ?, ?, ?)")
        .run("malformed", "main", 1, `${CLOUD_PAYLOAD_ALIAS_PREFIX}${"z".repeat(2 * 1024 * 1024)}`);
    });

    const result = auditCloudPayloadAliasReferences(database);
    assert.deepEqual(result.audit, {
      complete: false,
      scannedRows: 3,
      aliasRows: 1,
      directRows: 1,
      invalidAliasRows: 1,
      invalidStorageTypeRows: 0,
      maximumProjectedCharacters: 161,
    });
    assert.deepEqual(result.references, [{
      userId: "aliased",
      slot: "main",
      revision: 1,
      checksum: sha256(body),
      sizeBytes: Buffer.byteLength(body),
    }]);
  } finally {
    database.close();
  }
});

test("targeted single-row cleanup stays primary-key bounded at the observed 8,287-row production scale", () => {
  const database = createLegacyDatabase();
  try {
    initializeCloudPayloadStore(database);
    const insert = database.prepare("INSERT INTO cloud_save_payloads VALUES (?, ?, ?, ?)");
    runTransaction(database, () => {
      for (let index = 0; index < 8_285; index += 1) {
        insert.run(`legacy_${String(index).padStart(5, "0")}`, "main", 1, JSON.stringify({ index }));
      }
      insert.run("legacy_oversized", "main", 1, JSON.stringify({ padding: "x".repeat(32 * 1024 * 1024) }));
      writeCloudPayload(database, {
        userId: "target_user",
        slot: "main",
        revision: 21,
        payload: JSON.stringify({ bounded: true }),
      });
    });
    assert.equal(database.prepare("SELECT count(*) AS count FROM cloud_save_payloads").get().count, 8_287);
    const databaseBytes = database.pragma("page_count", { simple: true }) * database.pragma("page_size", { simple: true });
    assert.ok(databaseBytes > 32 * 1024 * 1024, `expected a multi-page large database, received ${databaseBytes} bytes`);
    const startupAudit = auditCloudPayloadAliasReferences(database);
    assert.deepEqual(startupAudit.audit, {
      complete: true,
      scannedRows: 8_287,
      aliasRows: 1,
      directRows: 8_286,
      invalidAliasRows: 0,
      invalidStorageTypeRows: 0,
      maximumProjectedCharacters: 161,
    });
    assert.equal(startupAudit.references.length, 1);
    assert.equal(startupAudit.references[0].userId, "target_user");
    const plan = database.prepare(`
      EXPLAIN QUERY PLAN
      SELECT
        typeof(payload),
        CASE
          WHEN typeof(payload) <> 'text' THEN NULL
          WHEN substr(payload, 1, 1) = ? THEN substr(payload, 1, 161)
          ELSE NULL
        END
      FROM cloud_save_payloads
      WHERE user_id = ? AND slot = ? AND revision = ?
    `).all(CLOUD_PAYLOAD_ALIAS_PREFIX[0], "target_user", "main", 21);
    assert.match(plan.map((entry) => entry.detail).join("\n"), /SEARCH cloud_save_payloads USING PRIMARY KEY \(user_id=\? AND slot=\? AND revision=\?\)/);

    const candidates = new Map();
    const result = runTransaction(database, () => {
      assert.equal(deleteCloudPayload(database, { userId: "target_user", slot: "main", revision: 21 }, {
        blobCleanupCandidates: candidates,
      }), 1);
      return garbageCollectCloudPayloadBlobCandidates(database, candidates);
    });
    assert.deepEqual(result, { candidateBlobs: 1, referencedBlobs: 0, missingBlobs: 0, deletedBlobs: 1 });
    assert.equal(database.prepare("SELECT count(*) AS count FROM cloud_save_payloads").get().count, 8_286);
    assert.equal(database.prepare("SELECT length(payload) AS size FROM cloud_save_payloads WHERE user_id = 'legacy_oversized'").get().size, 32 * 1024 * 1024 + JSON.stringify({ padding: "" }).length);
  } finally {
    database.close();
  }
});

test("links repeated imported revisions to one already verified blob without accepting missing metadata", () => {
  const database = createLegacyDatabase();
  try {
    initializeCloudPayloadStore(database);
    const payload = JSON.stringify({ formatVersion: 2, state: { version: 46 }, repeated: true });
    const checksum = sha256(payload);
    const sizeBytes = Buffer.byteLength(payload);
    runTransaction(database, () => {
      writeInspectedCloudPayload(database, {
        userId: "synthetic_user",
        slot: "main",
        revision: 1,
        payload,
        checksum,
        sizeBytes,
      });
      assert.deepEqual(linkVerifiedCloudPayload(database, {
        userId: "synthetic_user",
        slot: "1",
        revision: 9,
        checksum,
        sizeBytes,
      }), { checksum, sizeBytes, blob: "linked", rowChanges: 1 });
    });
    assert.equal(readCloudPayload(database, { userId: "synthetic_user", slot: "main", revision: 1 }), payload);
    assert.equal(readCloudPayload(database, { userId: "synthetic_user", slot: "1", revision: 9 }), payload);
    assert.equal(database.prepare(`SELECT count(*) AS count FROM ${CLOUD_PAYLOAD_BLOB_TABLE}`).get().count, 1);

    assert.throws(() => runTransaction(database, () => linkVerifiedCloudPayload(database, {
      userId: "synthetic_user",
      slot: "2",
      revision: 2,
      checksum: "f".repeat(64),
      sizeBytes,
    })), (error) => error instanceof CloudPayloadStoreError && error.code === "CLOUD_PAYLOAD_BLOB_MISSING");
    assert.throws(() => runTransaction(database, () => linkVerifiedCloudPayload(database, {
      userId: "synthetic_user",
      slot: "2",
      revision: 2,
      checksum,
      sizeBytes: sizeBytes + 1,
    })), (error) => error instanceof CloudPayloadStoreError && error.code === "CLOUD_PAYLOAD_BLOB_SIZE_MISMATCH");
  } finally {
    database.close();
  }
});

test("reopens a file-backed process boundary with aliases and blobs intact", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dsp-cloud-payload-store-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "cloud.sqlite");
  const body = JSON.stringify({ formatVersion: 2, state: { version: 46 }, reopened: true });

  let database = createLegacyDatabase(filename);
  initializeCloudPayloadStore(database);
  runTransaction(database, () => writeCloudPayload(database, {
    userId: "synthetic_user",
    slot: "speedrun:2",
    revision: 11,
    payload: body,
  }));
  database.close();

  database = new Database(filename);
  try {
    initializeCloudPayloadStore(database);
    assert.equal(readCloudPayload(database, {
      userId: "synthetic_user",
      slot: "speedrun:2",
      revision: 11,
    }), body);
    const stats = collectCloudPayloadStoreStats(database);
    assert.equal(stats.rows.aliases, 1);
    assert.equal(stats.blobs.referenced, 1);
  } finally {
    database.close();
  }
});
