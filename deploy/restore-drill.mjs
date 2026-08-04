import path from "node:path";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, readFile, readdir, rm, rmdir, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";
import { decryptBackupFile, sha256File } from "./backup-crypto.mjs";
import { inspectCloudDatabase } from "./sqlite-snapshot.mjs";

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function recordsMatch(left, right, allowHistoryRepair = false) {
  const exactKeys = ["users", "sessions", "cloudSaves", "players", "feedback", "errors"];
  const exact = exactKeys.every((key) => Number(left?.[key] ?? 0) === Number(right?.[key] ?? 0));
  const leftSubmissions = Number(left?.submissions ?? 0);
  const rightSubmissions = Number(right?.submissions ?? 0);
  const submissionsMatch = allowHistoryRepair ? leftSubmissions >= rightSubmissions : leftSubmissions === rightSubmissions;
  const leftHistory = Number(left?.cloudSaveRevisions ?? 0);
  const rightHistory = Number(right?.cloudSaveRevisions ?? 0);
  return exact && submissionsMatch && (allowHistoryRepair ? leftHistory >= rightHistory : leftHistory === rightHistory);
}

function cloudServerModulePath(configured) {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    configured,
    path.join(scriptDirectory, "..", "server", "index.mjs"),
    path.join(scriptDirectory, "..", "index.mjs"),
  ].filter(Boolean).map((candidate) => path.resolve(candidate));
  const found = candidates.find(existsSync);
  if (!found) throw new Error("cloud server module is unavailable for restore smoke testing");
  return found;
}

async function smokeTestRestoredServer(databaseFile, serverModule) {
  const { createCloudServer } = await import(pathToFileURL(serverModule).href);
  if (typeof createCloudServer !== "function") throw new Error("restored cloud server module has no createCloudServer export");
  const server = await createCloudServer({
    databaseFile,
    backupDirectory: "",
    adminToken: "restore-drill-admin-token-32-characters-minimum",
    mailer: null,
    logger: { error() {} },
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const healthResponse = await fetch(`${baseUrl}/api/health`);
    const health = await healthResponse.json();
    if (!healthResponse.ok || !health.ok) throw new Error("restored cloud health endpoint failed");
    const publicResponse = await fetch(`${baseUrl}/api/public-status`);
    const publicStatus = await publicResponse.json();
    if (!publicResponse.ok || !publicStatus.ok) throw new Error("restored public status endpoint failed");
    return {
      schemaVersion: health.schemaVersion,
      storage: health.storage,
      records: {
        users: Object.keys(server.store.data.users).length,
        sessions: Object.keys(server.store.data.sessions).length,
        cloudSaves: Object.keys(server.store.data.cloudSaves).length,
        cloudSaveRevisions: Object.values(server.store.data.cloudSaveHistory).reduce((sum, history) => sum + (Array.isArray(history) ? history.length : 0), 0),
        submissions: Object.keys(server.store.data.submissions).length,
        players: Object.keys(server.store.data.players).length,
        feedback: server.store.data.feedback.length,
        errors: server.store.data.errors.length,
      },
    };
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    else server.close();
  }
}

export async function runRestoreDrill({
  artifact,
  manifestFile = artifact ? `${artifact}.manifest.json` : "",
  privateKeyFile,
  workRoot,
  reportsDirectory,
  statusFile,
  serverModule,
  nodeId = hostname(),
  now = new Date(),
} = {}) {
  if (!artifact || !manifestFile || !privateKeyFile || !workRoot || !reportsDirectory) {
    throw new Error("artifact, manifestFile, privateKeyFile, workRoot and reportsDirectory are required");
  }
  const startedAt = Date.now();
  const resolvedWorkRoot = path.resolve(workRoot);
  const reportDirectory = path.resolve(reportsDirectory);
  const statusPath = path.resolve(statusFile || path.join(reportDirectory, "restore-drill-status.json"));
  const drillId = `restore-${now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}-${process.pid}`;
  const drillDirectory = path.join(resolvedWorkRoot, drillId);
  const restoredDatabase = path.join(drillDirectory, "cloud.sqlite");
  if (path.dirname(drillDirectory) !== resolvedWorkRoot) throw new Error("invalid restore drill work directory");
  await mkdir(drillDirectory, { recursive: true, mode: 0o700 });
  await mkdir(reportDirectory, { recursive: true });
  try {
    const manifest = JSON.parse(await readFile(path.resolve(manifestFile), "utf8"));
    if (manifest.format !== "dsp-encrypted-sqlite-backup-v1") throw new Error("unsupported backup manifest format");
    if (path.basename(artifact) !== manifest.artifact) throw new Error("backup artifact does not match manifest");
    const encryptedSha256 = await sha256File(path.resolve(artifact));
    if (encryptedSha256 !== manifest.encryptedSha256) throw new Error("encrypted backup checksum mismatch");
    const privateKey = await readFile(path.resolve(privateKeyFile), "utf8");
    await decryptBackupFile(path.resolve(artifact), restoredDatabase, privateKey);
    const database = inspectCloudDatabase(restoredDatabase);
    if (!recordsMatch(database.records, manifest.database?.records)) throw new Error("restored record counts do not match the backup manifest");
    const smoke = await smokeTestRestoredServer(restoredDatabase, cloudServerModulePath(serverModule));
    if (!recordsMatch(smoke.records, database.records, true)) throw new Error("schema migration reduced protected record counts during restore smoke test");
    const report = {
      ok: true,
      drillId,
      nodeId: String(nodeId).slice(0, 80),
      completedAt: Date.now(),
      completedAtIso: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      artifact: path.basename(artifact),
      encryptedSha256,
      sourceSchemaVersion: database.schemaVersion,
      restoredSchemaVersion: smoke.schemaVersion,
      records: smoke.records,
      health: { storage: smoke.storage, publicStatus: "ok" },
    };
    const reportFile = path.join(reportDirectory, `${drillId}.json`);
    await writeJson(reportFile, report);
    await writeJson(statusPath, { ...report, report: path.basename(reportFile) });
    return report;
  } catch (error) {
    const failure = {
      ok: false,
      drillId,
      failedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      artifact: path.basename(artifact),
      error: error instanceof Error ? error.message.slice(0, 500) : "unknown restore drill error",
    };
    await writeJson(statusPath, failure).catch(() => undefined);
    throw error;
  } finally {
    for (const suffix of ["", "-wal", "-shm"]) await rm(`${restoredDatabase}${suffix}`, { force: true });
    await rmdir(drillDirectory).catch(() => undefined);
  }
}

function parseArguments(values) {
  const options = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error("restore arguments must use --name value pairs");
    options[key.slice(2)] = value;
  }
  return options;
}

async function startFromCli() {
  const args = parseArguments(process.argv.slice(2));
  let artifact = args.artifact || process.env.DSP_RESTORE_ARTIFACT;
  const artifactDirectory = args["artifact-directory"] || process.env.DSP_RESTORE_ARTIFACT_DIRECTORY;
  if (!artifact && artifactDirectory) {
    const directory = path.resolve(artifactDirectory);
    const candidates = (await readdir(directory))
      .filter((name) => /^cloud-\d{8}T\d{6}Z-[a-z0-9_-]+-[a-f0-9]{6}\.sqlite\.dspbak$/.test(name))
      .sort()
      .reverse();
    if (candidates.length === 0) throw new Error("restore artifact directory contains no encrypted backups");
    artifact = path.join(directory, candidates[0]);
  }
  const result = await runRestoreDrill({
    artifact,
    manifestFile: args.manifest || process.env.DSP_RESTORE_MANIFEST,
    privateKeyFile: args["private-key"] || process.env.DSP_OFFSITE_BACKUP_PRIVATE_KEY,
    workRoot: args["work-root"] || process.env.DSP_RESTORE_WORK_ROOT || "/var/lib/dsp-idle-cloud/restore-work",
    reportsDirectory: args.reports || process.env.DSP_RESTORE_REPORTS || "/var/lib/dsp-idle-cloud/restore-reports",
    statusFile: args["status-file"] || process.env.DSP_RESTORE_DRILL_STATUS_FILE,
    serverModule: args["server-module"] || process.env.DSP_CLOUD_SERVER_MODULE,
    nodeId: args["node-id"] || process.env.DSP_BACKUP_NODE_ID,
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
