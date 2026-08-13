import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, readFile, realpath, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectCloudDatabase } from "./sqlite-snapshot.mjs";

export const RELEASE_BACKUP_EVIDENCE_VERSION = 1;
export const DEFAULT_BACKUP_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

async function sha256File(file) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest("hex");
}

async function atomicRename(source, destination) {
  const retryable = new Set(["EACCES", "EBUSY", "EPERM"]);
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      if (!retryable.has(error?.code) || attempt >= 20) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.min(50, 5 + attempt * 2)));
    }
  }
}

async function writeAtomically(file, text) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o750 });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(text, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await atomicRename(temporary, file);
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

function normalizedEvidence(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("release backup evidence must be an object");
  if (value.version !== RELEASE_BACKUP_EVIDENCE_VERSION) throw new Error(`unsupported release backup evidence version: ${value.version}`);
  if (typeof value.databasePath !== "string" || !path.isAbsolute(value.databasePath)) throw new Error("release backup evidence databasePath must be absolute");
  if (!Number.isSafeInteger(value.bytes) || value.bytes < 1) throw new Error("release backup evidence bytes are invalid");
  if (!Number.isFinite(value.mtimeMs) || value.mtimeMs <= 0) throw new Error("release backup evidence mtimeMs is invalid");
  if (typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256)) throw new Error("release backup evidence sha256 is invalid");
  if (!Number.isFinite(value.verifiedAt) || value.verifiedAt <= 0) throw new Error("release backup evidence verifiedAt is invalid");
  if (value.integrity !== "ok" || value.quickCheck !== "ok") throw new Error("release backup evidence does not prove SQLite integrity");
  if (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 1) throw new Error("release backup evidence schemaVersion is invalid");
  if (!Number.isInteger(value.storageLayoutVersion) || value.storageLayoutVersion < 1) throw new Error("release backup evidence storageLayoutVersion is invalid");
  return Object.freeze({
    version: RELEASE_BACKUP_EVIDENCE_VERSION,
    databasePath: value.databasePath,
    bytes: value.bytes,
    mtimeMs: value.mtimeMs,
    sha256: value.sha256,
    verifiedAt: value.verifiedAt,
    integrity: "ok",
    quickCheck: "ok",
    schemaVersion: value.schemaVersion,
    storageLayoutVersion: value.storageLayoutVersion,
    records: value.records && typeof value.records === "object" ? value.records : {},
  });
}

export async function createReleaseBackupEvidence({ databaseFile, evidenceFile, now = Date.now() } = {}) {
  if (!databaseFile || !evidenceFile) throw new Error("databaseFile and evidenceFile are required");
  const databasePath = await realpath(path.resolve(databaseFile));
  const before = await stat(databasePath);
  if (!before.isFile() || before.size < 1) throw new Error("release backup must be a non-empty regular file");
  const inspection = inspectCloudDatabase(databasePath);
  const sha256 = await sha256File(databasePath);
  const after = await stat(databasePath);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    throw new Error("release backup changed while verification was running");
  }
  const evidence = normalizedEvidence({
    version: RELEASE_BACKUP_EVIDENCE_VERSION,
    databasePath,
    bytes: after.size,
    mtimeMs: after.mtimeMs,
    sha256,
    verifiedAt: now,
    integrity: inspection.integrity,
    quickCheck: inspection.integrity,
    schemaVersion: inspection.schemaVersion,
    storageLayoutVersion: inspection.storageLayoutVersion ?? 1,
    records: inspection.records,
  });
  await writeAtomically(path.resolve(evidenceFile), `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

export async function verifyReleaseBackupEvidence({
  evidenceFile,
  maximumAgeMs = DEFAULT_BACKUP_EVIDENCE_MAX_AGE_MS,
  rehash = false,
  now = Date.now(),
} = {}) {
  if (!evidenceFile) throw new Error("evidenceFile is required");
  const evidence = normalizedEvidence(JSON.parse(await readFile(path.resolve(evidenceFile), "utf8")));
  if (!Number.isFinite(maximumAgeMs) || maximumAgeMs < 1) throw new Error("maximumAgeMs must be positive");
  if (now - evidence.verifiedAt > maximumAgeMs || evidence.verifiedAt > now + 60_000) {
    throw new Error("release backup evidence is stale or from the future");
  }
  const databasePath = await realpath(evidence.databasePath);
  if (databasePath !== evidence.databasePath) throw new Error("release backup evidence path no longer resolves to the verified file");
  const metadata = await stat(databasePath);
  if (!metadata.isFile() || metadata.size !== evidence.bytes || metadata.mtimeMs !== evidence.mtimeMs) {
    throw new Error("release backup metadata changed after verification");
  }
  if (rehash && await sha256File(databasePath) !== evidence.sha256) {
    throw new Error("release backup SHA-256 changed after verification");
  }
  return evidence;
}

function parseArguments(values) {
  const valueAfter = (flag) => {
    const index = values.indexOf(flag);
    return index >= 0 ? values[index + 1] : undefined;
  };
  if (values.includes("--verify")) {
    return { command: "verify", evidenceFile: valueAfter("--verify"), rehash: values.includes("--rehash") };
  }
  return { command: "create", databaseFile: valueAfter("--database"), evidenceFile: valueAfter("--output") };
}

function directInvocation() {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (directInvocation()) {
  const options = parseArguments(process.argv.slice(2));
  const operation = options.command === "verify"
    ? verifyReleaseBackupEvidence(options)
    : createReleaseBackupEvidence(options);
  operation.then(
    (evidence) => console.log(JSON.stringify(evidence)),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    },
  );
}
