import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { realpathSync } from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { encryptBackupFile, sha256File } from "./backup-crypto.mjs";
import { backupSqlite, inspectCloudDatabase } from "./sqlite-snapshot.mjs";

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function safeNodeId(value) {
  const normalized = String(value || hostname()).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  if (!normalized) throw new Error("backup node id is invalid");
  return normalized;
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function spawnChecked(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let errorText = "";
    child.stderr.on("data", (chunk) => { errorText = `${errorText}${chunk}`.slice(-2000); });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}: ${errorText.trim()}`)));
  });
}

async function transportFiles({ transport, target, artifact, manifest, sshIdentityFile, sshKnownHostsFile }) {
  if (transport === "none") return { transported: false, transport: "none" };
  if (!target) throw new Error(`offsite target is required for ${transport}`);
  const names = [path.basename(artifact), path.basename(manifest)];
  if (transport === "local") {
    const targetDirectory = path.resolve(target);
    await mkdir(targetDirectory, { recursive: true });
    await copyFile(artifact, path.join(targetDirectory, names[0]));
    await copyFile(manifest, path.join(targetDirectory, names[1]));
    return { transported: true, transport };
  }
  const normalizedTarget = target.replace(/\/$/, "");
  if (transport === "rclone") {
    await spawnChecked("rclone", ["copyto", artifact, `${normalizedTarget}/${names[0]}`]);
    await spawnChecked("rclone", ["copyto", manifest, `${normalizedTarget}/${names[1]}`]);
    return { transported: true, transport };
  }
  if (transport === "scp") {
    if (!sshIdentityFile || !sshKnownHostsFile) throw new Error("scp transport requires an identity file and pinned known-hosts file");
    const common = ["-q", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", `UserKnownHostsFile=${path.resolve(sshKnownHostsFile)}`, "-i", path.resolve(sshIdentityFile)];
    await spawnChecked("scp", [...common, artifact, `${normalizedTarget}/${names[0]}`]);
    await spawnChecked("scp", [...common, manifest, `${normalizedTarget}/${names[1]}`]);
    return { transported: true, transport };
  }
  throw new Error(`unsupported offsite transport ${transport}`);
}

async function pruneStaging(directory, keep) {
  if (!Number.isInteger(keep) || keep < 1) return;
  const artifacts = (await readdir(directory))
    .filter((name) => /^cloud-\d{8}T\d{6}Z-[a-z0-9_-]+-[a-f0-9]{6}\.sqlite\.dspbak$/.test(name))
    .sort()
    .reverse();
  for (const artifactName of artifacts.slice(keep)) {
    const artifact = path.join(directory, artifactName);
    const manifest = `${artifact}.manifest.json`;
    if (path.dirname(path.resolve(artifact)) !== directory) throw new Error("refusing to prune outside backup staging directory");
    await rm(artifact, { force: true });
    await rm(manifest, { force: true });
  }
}

export async function createEncryptedOffsiteBackup({
  source,
  destinationDirectory,
  publicKeyFile,
  nodeId = hostname(),
  statusFile,
  transport = "none",
  transportTarget = "",
  sshIdentityFile = "",
  sshKnownHostsFile = "",
  keep = 14,
  now = new Date(),
} = {}) {
  if (!source || !destinationDirectory || !publicKeyFile) throw new Error("source, destinationDirectory and publicKeyFile are required");
  const startedAt = Date.now();
  const sourceFile = path.resolve(source);
  const destination = path.resolve(destinationDirectory);
  const statusPath = path.resolve(statusFile || path.join(destination, "offsite-backup-status.json"));
  await mkdir(destination, { recursive: true });
  const baseName = `cloud-${stamp(now)}-${safeNodeId(nodeId)}-${randomBytes(3).toString("hex")}.sqlite.dspbak`;
  const artifact = path.join(destination, baseName);
  const manifestFile = `${artifact}.manifest.json`;
  const plainSnapshot = path.join(destination, `.${baseName}.plaintext.tmp`);
  if (path.dirname(plainSnapshot) !== destination) throw new Error("invalid backup staging path");
  try {
    await backupSqlite(sourceFile, plainSnapshot);
    const database = inspectCloudDatabase(plainSnapshot);
    const publicKey = await readFile(path.resolve(publicKeyFile), "utf8");
    await encryptBackupFile(plainSnapshot, artifact, publicKey);
    const artifactStat = await stat(artifact);
    const manifest = {
      format: "dsp-encrypted-sqlite-backup-v1",
      createdAt: now.getTime(),
      createdAtIso: now.toISOString(),
      nodeId: safeNodeId(nodeId),
      artifact: baseName,
      encryptedBytes: artifactStat.size,
      encryptedSha256: await sha256File(artifact),
      database,
    };
    await writeJson(manifestFile, manifest);
    const transferred = await transportFiles({ transport, target: transportTarget, artifact, manifest: manifestFile, sshIdentityFile, sshKnownHostsFile });
    const result = {
      ok: true,
      completedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      artifact: baseName,
      manifest: path.basename(manifestFile),
      schemaVersion: database.schemaVersion,
      records: database.records,
      ...transferred,
    };
    await writeJson(statusPath, result);
    await pruneStaging(destination, Number(keep));
    return result;
  } catch (error) {
    const failure = {
      ok: false,
      failedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      transport,
      error: error instanceof Error ? error.message.slice(0, 500) : "unknown backup error",
    };
    await writeJson(statusPath, failure).catch(() => undefined);
    throw error;
  } finally {
    await rm(plainSnapshot, { force: true });
  }
}

function parseArguments(values) {
  const options = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error("backup arguments must use --name value pairs");
    options[key.slice(2)] = value;
  }
  return options;
}

async function startFromCli() {
  const args = parseArguments(process.argv.slice(2));
  const result = await createEncryptedOffsiteBackup({
    source: args.source || process.env.DSP_CLOUD_DATABASE_FILE,
    destinationDirectory: args.destination || process.env.DSP_OFFSITE_BACKUP_STAGING,
    publicKeyFile: args["public-key"] || process.env.DSP_OFFSITE_BACKUP_PUBLIC_KEY,
    nodeId: args["node-id"] || process.env.DSP_BACKUP_NODE_ID,
    statusFile: args["status-file"] || process.env.DSP_OFFSITE_BACKUP_STATUS_FILE,
    transport: args.transport || process.env.DSP_OFFSITE_BACKUP_TRANSPORT || "none",
    transportTarget: args.target || process.env.DSP_OFFSITE_BACKUP_TARGET || "",
    sshIdentityFile: args["ssh-identity"] || process.env.DSP_OFFSITE_SSH_IDENTITY || "",
    sshKnownHostsFile: args["ssh-known-hosts"] || process.env.DSP_OFFSITE_SSH_KNOWN_HOSTS || "",
    keep: Number(args.keep || process.env.DSP_OFFSITE_BACKUP_KEEP || 14),
  });
  console.log(JSON.stringify(result));
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try { return realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
}

if (isMainModule()) {
  startFromCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
