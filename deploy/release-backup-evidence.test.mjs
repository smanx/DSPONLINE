import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import {
  createReleaseBackupEvidence,
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
