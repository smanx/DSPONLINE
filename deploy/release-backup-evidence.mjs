import { createHash, randomUUID } from "node:crypto";
import { createReadStream, realpathSync } from "node:fs";
import { mkdir, open, readFile, realpath, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectCloudDatabase } from "./sqlite-snapshot.mjs";

export const RELEASE_BACKUP_EVIDENCE_VERSION = 1;
export const DEFAULT_BACKUP_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

export async function sha256File(file) {
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

async function pathExists(file) {
  try { await stat(file); return true; }
  catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

async function assertNoActiveSqliteSidecars(databasePath) {
  for (const suffix of ["-wal", "-shm"]) {
    try {
      const metadata = await stat(`${databasePath}${suffix}`);
      if (metadata.size > 0) throw new Error(`release backup has an active SQLite ${suffix.slice(1).toUpperCase()} sidecar`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

function normalizedEvidence(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("release backup evidence must be an object");
  if (value.version !== RELEASE_BACKUP_EVIDENCE_VERSION) throw new Error(`unsupported release backup evidence version: ${value.version}`);
  if (typeof value.databasePath !== "string" || !path.isAbsolute(value.databasePath)) throw new Error("release backup evidence databasePath must be absolute");
  if (!Number.isSafeInteger(value.bytes) || value.bytes < 1) throw new Error("release backup evidence bytes are invalid");
  if (!Number.isFinite(value.mtimeMs) || value.mtimeMs <= 0) throw new Error("release backup evidence mtimeMs is invalid");
  const hasIdentity = value.device !== undefined || value.inode !== undefined;
  if (hasIdentity && (typeof value.device !== "string" || !/^\d+$/.test(value.device)
    || typeof value.inode !== "string" || !/^[1-9]\d*$/.test(value.inode))) {
    throw new Error("release backup evidence device/inode identity is invalid");
  }
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
    ...(hasIdentity ? { device: value.device, inode: value.inode } : {}),
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
  await assertNoActiveSqliteSidecars(databasePath);
  const before = await stat(databasePath);
  if (!before.isFile() || before.size < 1) throw new Error("release backup must be a non-empty regular file");
  const inspection = inspectCloudDatabase(databasePath);
  const sha256 = await sha256File(databasePath);
  const after = await stat(databasePath);
  await assertNoActiveSqliteSidecars(databasePath);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    throw new Error("release backup changed while verification was running");
  }
  const evidence = normalizedEvidence({
    version: RELEASE_BACKUP_EVIDENCE_VERSION,
    databasePath,
    bytes: after.size,
    mtimeMs: after.mtimeMs,
    device: String(after.dev),
    inode: String(after.ino),
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
  await assertNoActiveSqliteSidecars(databasePath);
  if (!metadata.isFile() || metadata.size !== evidence.bytes || metadata.mtimeMs !== evidence.mtimeMs) {
    throw new Error("release backup metadata changed after verification");
  }
  if ((evidence.device !== undefined && String(metadata.dev) !== evidence.device)
    || (evidence.inode !== undefined && String(metadata.ino) !== evidence.inode)) {
    throw new Error("release backup inode identity changed after verification");
  }
  if (rehash && await sha256File(databasePath) !== evidence.sha256) {
    throw new Error("release backup SHA-256 changed after verification");
  }
  return evidence;
}

export async function prepareReleasePreflightCopy({
  sourceEvidenceFile,
  databaseFile,
  evidenceFile,
  bytesPerSecond = 32 * 1024 * 1024,
  now = Date.now(),
} = {}) {
  if (!sourceEvidenceFile || !databaseFile || !evidenceFile) {
    throw new Error("sourceEvidenceFile, databaseFile and evidenceFile are required");
  }
  if (!Number.isSafeInteger(bytesPerSecond) || bytesPerSecond < 1024 * 1024 || bytesPerSecond > 512 * 1024 * 1024) {
    throw new Error("preflight copy bytesPerSecond must be from 1 MiB/s to 512 MiB/s");
  }
  const source = await verifyReleaseBackupEvidence({ evidenceFile: sourceEvidenceFile, rehash: false, now });
  if (source.device === undefined || source.inode === undefined) {
    throw new Error("source evidence must bind device and inode identity");
  }
  const destination = path.resolve(databaseFile);
  const destinationEvidence = path.resolve(evidenceFile);
  if (destination === source.databasePath) throw new Error("preflight copy cannot overwrite the verified backup");
  if (await pathExists(destination) || await pathExists(destinationEvidence)) {
    throw new Error("preflight database and evidence outputs must not already exist");
  }
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o750 });
  const sourceBefore = await stat(source.databasePath);
  const sourceHandle = await open(source.databasePath, "r");
  let destinationHandle;
  const digest = createHash("sha256");
  const chunk = Buffer.allocUnsafe(1024 * 1024);
  let copied = 0;
  const startedAt = Date.now();
  try {
    destinationHandle = await open(destination, "wx", 0o600);
    while (true) {
      const { bytesRead } = await sourceHandle.read(chunk, 0, chunk.byteLength, null);
      if (bytesRead < 1) break;
      const bytes = chunk.subarray(0, bytesRead);
      let written = 0;
      while (written < bytes.byteLength) {
        const result = await destinationHandle.write(bytes, written, bytes.byteLength - written, null);
        if (result.bytesWritten < 1) throw new Error("preflight copy made no write progress");
        written += result.bytesWritten;
      }
      digest.update(bytes);
      copied += bytesRead;
      const expectedElapsedMs = copied / bytesPerSecond * 1_000;
      const delayMs = Math.ceil(expectedElapsedMs - (Date.now() - startedAt));
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 1_000)));
    }
    await destinationHandle.sync();
    await destinationHandle.close();
    destinationHandle = null;
    const sourceAfter = await stat(source.databasePath);
    if (sourceBefore.size !== sourceAfter.size || sourceBefore.mtimeMs !== sourceAfter.mtimeMs
      || String(sourceBefore.dev) !== String(sourceAfter.dev) || String(sourceBefore.ino) !== String(sourceAfter.ino)) {
      throw new Error("verified backup changed during preflight copy");
    }
    if (copied !== source.bytes || digest.digest("hex") !== source.sha256) {
      throw new Error("preflight copy does not match the verified backup SHA-256 and byte size");
    }
    const databasePath = await realpath(destination);
    const metadata = await stat(databasePath);
    if (databasePath === source.databasePath || (String(metadata.dev) === source.device && String(metadata.ino) === source.inode)) {
      throw new Error("preflight copy is not an independent filesystem object");
    }
    const inspection = inspectCloudDatabase(databasePath);
    if (inspection.integrity !== "ok" || inspection.schemaVersion !== source.schemaVersion
      || (inspection.storageLayoutVersion ?? 1) !== source.storageLayoutVersion) {
      throw new Error("preflight copy SQLite integrity, schema or layout differs from the verified backup");
    }
    const prepared = normalizedEvidence({
      version: RELEASE_BACKUP_EVIDENCE_VERSION,
      databasePath,
      bytes: metadata.size,
      mtimeMs: metadata.mtimeMs,
      device: String(metadata.dev),
      inode: String(metadata.ino),
      sha256: source.sha256,
      verifiedAt: now,
      integrity: inspection.integrity,
      quickCheck: inspection.integrity,
      schemaVersion: inspection.schemaVersion,
      storageLayoutVersion: inspection.storageLayoutVersion ?? 1,
      records: inspection.records,
    });
    await writeAtomically(destinationEvidence, `${JSON.stringify(prepared, null, 2)}\n`);
    return prepared;
  } catch (error) {
    await destinationHandle?.close().catch(() => undefined);
    await rm(destination, { force: true }).catch(() => undefined);
    await rm(destinationEvidence, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await sourceHandle.close();
  }
}

function parseArguments(values) {
  const valueAfter = (flag) => {
    const index = values.indexOf(flag);
    return index >= 0 ? values[index + 1] : undefined;
  };
  if (values.includes("--verify")) {
    return { command: "verify", evidenceFile: valueAfter("--verify"), rehash: values.includes("--rehash") };
  }
  if (values.includes("--prepare-preflight")) {
    return {
      command: "prepare-preflight",
      sourceEvidenceFile: valueAfter("--source-evidence"),
      databaseFile: valueAfter("--database"),
      evidenceFile: valueAfter("--output"),
      bytesPerSecond: Number(valueAfter("--bytes-per-second") || 32 * 1024 * 1024),
    };
  }
  return { command: "create", databaseFile: valueAfter("--database"), evidenceFile: valueAfter("--output") };
}

function directInvocation() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (directInvocation()) {
  const options = parseArguments(process.argv.slice(2));
  const operation = options.command === "verify"
    ? verifyReleaseBackupEvidence(options)
    : options.command === "prepare-preflight"
      ? prepareReleasePreflightCopy(options)
    : createReleaseBackupEvidence(options);
  operation.then(
    (evidence) => console.log(JSON.stringify(evidence)),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    },
  );
}
