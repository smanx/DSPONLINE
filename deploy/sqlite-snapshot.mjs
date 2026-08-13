import { createRequire } from "node:module";
import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

function loadDatabaseConstructor() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const packageFiles = [
    process.env.DSP_API_PACKAGE_FILE,
    path.join(process.cwd(), "package.json"),
    path.join(process.env.DSP_API_ROOT || "/opt/dsp-idle-cloud", "current", "package.json"),
    path.join(scriptDirectory, "..", "server", "package.json"),
  ].filter(Boolean);
  for (const packageFile of packageFiles) {
    if (!existsSync(packageFile)) continue;
    try {
      return createRequire(packageFile)("better-sqlite3");
    } catch {
      // Try the next known package root.
    }
  }
  throw new Error("better-sqlite3 is unavailable; run from the cloud service release directory");
}

const Database = loadDatabaseConstructor();

function objectCount(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).length : 0;
}

function historyCount(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  return Object.values(value).reduce((sum, history) => sum + (Array.isArray(history) ? history.length : 0), 0);
}

export async function backupSqlite(source, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  const database = new Database(source, { fileMustExist: true, readonly: true });
  try {
    await database.backup(destination);
  } finally {
    database.close();
  }
}

export function inspectCloudDatabase(file) {
  const database = new Database(file, { fileMustExist: true, readonly: true });
  try {
    const check = database.pragma("quick_check");
    if (!Array.isArray(check) || check.some((entry) => entry.quick_check !== "ok")) throw new Error("SQLite quick_check failed");
    const table = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'app_state'").get();
    if (!table) throw new Error("cloud backup does not contain app_state");
    const row = database.prepare("SELECT payload, updated_at AS updatedAt FROM app_state WHERE id = 1").get();
    if (!row?.payload) throw new Error("cloud backup app_state is empty");
    const data = JSON.parse(row.payload);
    if (!data || typeof data !== "object") throw new Error("cloud backup payload is invalid");
    return {
      integrity: "ok",
      schemaVersion: Number.isInteger(data.schemaVersion) ? data.schemaVersion : 1,
      storageLayoutVersion: Number.isInteger(data.storageLayoutVersion) ? data.storageLayoutVersion : 1,
      updatedAt: Number.isFinite(row.updatedAt) ? row.updatedAt : 0,
      records: {
        users: objectCount(data.users),
        sessions: objectCount(data.sessions),
        cloudSaves: objectCount(data.cloudSaves),
        cloudSaveRevisions: historyCount(data.cloudSaveHistory),
        submissions: objectCount(data.submissions),
        players: objectCount(data.players),
        feedback: Array.isArray(data.feedback) ? data.feedback.length : 0,
        errors: Array.isArray(data.errors) ? data.errors.length : 0,
      },
    };
  } finally {
    database.close();
  }
}
