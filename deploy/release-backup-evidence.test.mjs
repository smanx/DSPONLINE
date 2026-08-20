import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { appendFile, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import {
  createReleaseBackupEvidence,
  prepareReleasePreflightCopy,
  verifyReleaseBackupEvidence,
} from "./release-backup-evidence.mjs";

const requireFromServer = createRequire(path.resolve("server/package.json"));
const Database = requireFromServer("better-sqlite3");
let directory;

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "dsp-release-backup-evidence-"));
});

after(async () => {
  await rm(directory, { recursive: true, force: true });
});

function createDatabase(file) {
  const database = new Database(file);
  database.exec("CREATE TABLE app_state (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)");
  database.prepare("INSERT INTO app_state VALUES (1, ?, ?)").run(JSON.stringify({
    schemaVersion: 7,
    storageLayoutVersion: 2,
    users: {},
    sessions: {},
    cloudSaves: {},
    cloudSaveHistory: {},
    submissions: {},
    players: {},
    feedback: [],
    errors: [],
  }), Date.now());
  database.close();
}

test("binds release evidence to an immutable SQLite backup, schema and layout", async () => {
  const databaseFile = path.join(directory, "verified.sqlite");
  const evidenceFile = path.join(directory, "verified.json");
  createDatabase(databaseFile);
  const created = await createReleaseBackupEvidence({ databaseFile, evidenceFile, now: 1_786_575_000_000 });
  assert.equal(created.integrity, "ok");
  assert.equal(created.quickCheck, "ok");
  assert.equal(created.schemaVersion, 7);
  assert.equal(created.storageLayoutVersion, 2);
  const verified = await verifyReleaseBackupEvidence({
    evidenceFile,
    rehash: true,
    now: 1_786_575_000_500,
  });
  assert.equal(verified.sha256, created.sha256);
});

test("rejects stale or modified release backup evidence", async () => {
  const databaseFile = path.join(directory, "modified.sqlite");
  const evidenceFile = path.join(directory, "modified.json");
  createDatabase(databaseFile);
  await createReleaseBackupEvidence({ databaseFile, evidenceFile, now: 1_786_575_000_000 });
  await assert.rejects(() => verifyReleaseBackupEvidence({
    evidenceFile,
    maximumAgeMs: 1_000,
    now: 1_786_575_002_000,
  }), /stale/);
  await appendFile(databaseFile, "changed");
  await assert.rejects(() => verifyReleaseBackupEvidence({
    evidenceFile,
    now: 1_786_575_000_500,
  }), /metadata changed/);
});

test("prepares an independently verified bounded preflight copy without changing the backup", async () => {
  const databaseFile = path.join(directory, "preflight-source.sqlite");
  const sourceEvidenceFile = path.join(directory, "preflight-source.json");
  const preparedFile = path.join(directory, "prepared", "copy.sqlite");
  const preparedEvidenceFile = path.join(directory, "prepared", "copy.json");
  createDatabase(databaseFile);
  const source = await createReleaseBackupEvidence({ databaseFile, evidenceFile: sourceEvidenceFile });
  const before = await stat(databaseFile);
  const prepared = await prepareReleasePreflightCopy({
    sourceEvidenceFile,
    databaseFile: preparedFile,
    evidenceFile: preparedEvidenceFile,
    bytesPerSecond: 512 * 1024 * 1024,
  });
  const after = await stat(databaseFile);
  assert.equal(prepared.sha256, source.sha256);
  assert.equal(prepared.bytes, source.bytes);
  assert.notEqual(prepared.inode, source.inode);
  assert.equal(after.size, before.size);
  assert.equal(after.mtimeMs, before.mtimeMs);
  assert.deepEqual(await readFile(preparedFile), await readFile(databaseFile));
  const verified = await verifyReleaseBackupEvidence({ evidenceFile: preparedEvidenceFile, rehash: true });
  assert.equal(verified.sha256, source.sha256);
});

test("refuses a verified path that later gains active WAL/SHM without modifying either sidecar", async () => {
  const databaseFile = path.join(directory, "wal-source.sqlite");
  const sourceEvidenceFile = path.join(directory, "wal-source.json");
  const preparedFile = path.join(directory, "wal-prepared.sqlite");
  const preparedEvidenceFile = path.join(directory, "wal-prepared.json");
  createDatabase(databaseFile);
  await createReleaseBackupEvidence({ databaseFile, evidenceFile: sourceEvidenceFile });
  const wal = Buffer.from("concurrent-wal-growth");
  const shm = Buffer.from("concurrent-shm-state");
  await writeFile(`${databaseFile}-wal`, wal);
  await writeFile(`${databaseFile}-shm`, shm);
  await assert.rejects(() => prepareReleasePreflightCopy({
    sourceEvidenceFile,
    databaseFile: preparedFile,
    evidenceFile: preparedEvidenceFile,
    bytesPerSecond: 512 * 1024 * 1024,
  }), /active SQLite WAL sidecar/);
  assert.deepEqual(await readFile(`${databaseFile}-wal`), wal);
  assert.deepEqual(await readFile(`${databaseFile}-shm`), shm);
  await assert.rejects(() => stat(preparedFile), /ENOENT/);
  await assert.rejects(() => stat(preparedEvidenceFile), /ENOENT/);
});

test("refuses a live SQLite writer whose committed WAL is still growing", async () => {
  const databaseFile = path.join(directory, "live-wal.sqlite");
  const evidenceFile = path.join(directory, "live-wal.json");
  createDatabase(databaseFile);
  const database = new Database(databaseFile);
  try {
    database.pragma("journal_mode = WAL");
    database.pragma("wal_autocheckpoint = 0");
    database.exec("CREATE TABLE live_writes (id INTEGER PRIMARY KEY, value BLOB NOT NULL)");
    const insert = database.prepare("INSERT INTO live_writes(value) VALUES (?)");
    const transaction = database.transaction(() => {
      for (let index = 0; index < 128; index += 1) insert.run(Buffer.alloc(32 * 1024, index));
    });
    transaction();
    const walBefore = await stat(`${databaseFile}-wal`);
    assert.ok(walBefore.size > 1024 * 1024);
    await assert.rejects(() => createReleaseBackupEvidence({ databaseFile, evidenceFile }), /active SQLite WAL sidecar/);
    insert.run(Buffer.alloc(64 * 1024, 255));
    const walAfter = await stat(`${databaseFile}-wal`);
    assert.ok(walAfter.size > walBefore.size);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM live_writes").get().count, 129);
    await assert.rejects(() => stat(evidenceFile), /ENOENT/);
  } finally {
    database.close();
  }
});
