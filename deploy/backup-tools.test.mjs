import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { createEncryptedOffsiteBackup } from "./create-offsite-backup.mjs";
import { runRestoreDrill } from "./restore-drill.mjs";

const requireFromServer = createRequire(path.resolve("server/package.json"));
const Database = requireFromServer("better-sqlite3");
let directory;
let sourceDatabase;
let publicKeyFile;
let privateKeyFile;

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "dsp-backup-tools-"));
  sourceDatabase = path.join(directory, "source.sqlite");
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  publicKeyFile = path.join(directory, "backup-public.pem");
  privateKeyFile = path.join(directory, "backup-private.pem");
  await writeFile(publicKeyFile, publicKey, { mode: 0o600 });
  await writeFile(privateKeyFile, privateKey, { mode: 0o600 });

  const database = new Database(sourceDatabase);
  database.exec("CREATE TABLE app_state (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL, updated_at INTEGER NOT NULL)");
  const savePayload = JSON.stringify({ state: { version: 24, elapsedSeconds: 12, entities: [], research: { completedTechIds: [] } } });
  const payload = {
    schemaVersion: 3,
    users: { user_legacy: { id: "user_legacy", email: "legacy@example.com", displayName: "Legacy", createdAt: 1, passwordSalt: "00", passwordHash: "00" } },
    sessions: {},
    cloudSaves: { user_legacy: { revision: 1, payload: savePayload, checksum: "save-checksum", size: savePayload.length, updatedAt: 2 } },
    cloudSaveHistory: { user_legacy: [] },
    submissions: {},
    players: { ["a".repeat(64)]: { firstSeenAt: 1, lastSeenAt: 2, lastActiveDay: "2026-07-22" } },
    feedback: [],
    errors: [],
    dailyMetrics: {},
  };
  database.prepare("INSERT INTO app_state (id, payload, updated_at) VALUES (1, ?, ?)").run(JSON.stringify(payload), Date.now());
  database.close();
});

after(async () => {
  await rm(directory, { recursive: true, force: true });
});

test("creates, transports and restores an authenticated encrypted SQLite backup", async () => {
  const staging = path.join(directory, "staging");
  const offsite = path.join(directory, "offsite");
  const result = await createEncryptedOffsiteBackup({
    source: sourceDatabase,
    destinationDirectory: staging,
    publicKeyFile,
    nodeId: "test-hk",
    transport: "local",
    transportTarget: offsite,
    keep: 3,
    now: new Date("2026-07-22T00:00:00.000Z"),
  });
  assert.equal(result.ok, true);
  assert.equal(result.transported, true);
  assert.equal(result.schemaVersion, 3);
  assert.equal(result.records.users, 1);
  assert.equal((await readdir(staging)).some((name) => name.includes("plaintext")), false);
  assert.deepEqual((await readdir(offsite)).sort(), [result.artifact, result.manifest].sort());

  const report = await runRestoreDrill({
    artifact: path.join(offsite, result.artifact),
    manifestFile: path.join(offsite, result.manifest),
    privateKeyFile,
    workRoot: path.join(directory, "restore-work"),
    reportsDirectory: path.join(directory, "restore-reports"),
    serverModule: path.resolve("server/index.mjs"),
    nodeId: "test-recovery",
    now: new Date("2026-07-22T01:00:00.000Z"),
  });
  assert.equal(report.ok, true);
  assert.equal(report.sourceSchemaVersion, 3);
  assert.equal(report.restoredSchemaVersion, 5);
  assert.equal(report.records.users, 1);
  assert.equal(report.records.cloudSaves, 1);
  assert.deepEqual(await readdir(path.join(directory, "restore-work")), []);
});

test("rejects a tampered encrypted backup before decrypting user data", async () => {
  const staging = path.join(directory, "tamper-staging");
  const result = await createEncryptedOffsiteBackup({
    source: sourceDatabase,
    destinationDirectory: staging,
    publicKeyFile,
    nodeId: "test-hk",
    now: new Date("2026-07-22T02:00:00.000Z"),
  });
  const artifact = path.join(staging, result.artifact);
  const bytes = await readFile(artifact);
  bytes[bytes.length - 1] ^= 0xff;
  await writeFile(artifact, bytes);
  await assert.rejects(() => runRestoreDrill({
    artifact,
    manifestFile: path.join(staging, result.manifest),
    privateKeyFile,
    workRoot: path.join(directory, "tamper-work"),
    reportsDirectory: path.join(directory, "tamper-reports"),
    serverModule: path.resolve("server/index.mjs"),
  }), /checksum mismatch/);
  assert.deepEqual(await readdir(path.join(directory, "tamper-work")), []);
});
