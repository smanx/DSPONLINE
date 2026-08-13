import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STALE_VERSIONS = ["1.0.38", "1.0.39"];
const VERSION_KEYS = /^(?:version|versionName|appVersion|releaseId|buildId|productVersion|VERSION_NAME)$/i;

function resolveFromRoot(value) { return path.resolve(root, value); }

function addIssue(issues, file, message) { issues.push(`${file}: ${message}`); }

function assertVersion(issues, file, actual, expected, label) {
  if (actual !== expected) addIssue(issues, file, `${label} is ${JSON.stringify(actual)}, expected ${expected}`);
  if (STALE_VERSIONS.includes(String(actual))) addIssue(issues, file, `${label} contains stale version ${actual}`);
}

function checkVersionBearingValue(issues, file, key, value) {
  if (!VERSION_KEYS.test(String(key))) return;
  for (const stale of STALE_VERSIONS) {
    if (String(value).includes(stale)) addIssue(issues, file, `${key} contains stale version ${stale}`);
  }
}

function walkVersionFields(issues, file, value, key = "") {
  if (value && typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value)) walkVersionFields(issues, file, childValue, childKey);
    return;
  }
  if (key) checkVersionBearingValue(issues, file, key, value);
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function parseProperties(text) {
  return Object.fromEntries(text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const separator = line.indexOf("=");
    return separator >= 0 ? [line.slice(0, separator), line.slice(separator + 1)] : [line, ""];
  }));
}

async function checkJsonFile(issues, file, expectedVersion, kind) {
  let value;
  try { value = await readJson(file); }
  catch (error) { addIssue(issues, file, `invalid JSON: ${error instanceof Error ? error.message : String(error)}`); return; }
  walkVersionFields(issues, file, value);
  if (kind === "version-json") assertVersion(issues, file, value.version, expectedVersion, "version");
  if (kind === "native-feed") assertVersion(issues, file, value.versionName ?? value.version, expectedVersion, "feed version");
  if (kind === "release-manifest") {
    assertVersion(issues, file, value.appVersion, expectedVersion, "appVersion");
    if (value.buildId && !String(value.buildId).startsWith(`${expectedVersion}+`)) addIssue(issues, file, `buildId ${value.buildId} does not start with ${expectedVersion}+`);
    if (value.releaseId && !String(value.releaseId).startsWith(`${expectedVersion}-`)) addIssue(issues, file, `releaseId ${value.releaseId} does not start with ${expectedVersion}-`);
  }
}

async function checkTextFile(issues, file, expectedVersion, kind) {
  let text;
  try { text = await readFile(file, "utf8"); }
  catch (error) { addIssue(issues, file, `cannot read: ${error instanceof Error ? error.message : String(error)}`); return; }
  if (kind === "android-properties") {
    const properties = parseProperties(text);
    assertVersion(issues, file, properties.VERSION_NAME, expectedVersion, "VERSION_NAME");
    return;
  }
  if (kind === "release-notes") {
    if (!text.includes(expectedVersion)) addIssue(issues, file, `release notes do not mention ${expectedVersion}`);
    const heading = text.split(/\r?\n/).find((line) => /^\s*#/.test(line));
    for (const stale of STALE_VERSIONS) if (heading?.includes(stale)) addIssue(issues, file, `current release heading contains stale version ${stale}`);
    return;
  }
  for (const stale of STALE_VERSIONS) if (new RegExp(`(?:version|versionName|appVersion|buildId|releaseId)\\s*[:=]\\s*[^\\r\\n]*${stale}`, "i").test(text)) addIssue(issues, file, `metadata contains stale version ${stale}`);
}

export async function checkVersionConsistency({
  expectedVersion,
  packageJsonPath = "package.json",
  androidVersionPath = "android/native-version.properties",
  versionJsonPath,
  nativeFeedPaths = [],
  releaseManifestPaths = [],
  releaseNotesPaths = [],
  metadataPaths = [],
} = {}) {
  if (!expectedVersion) throw new Error("expectedVersion is required");
  const issues = [];
  const packageFile = resolveFromRoot(packageJsonPath);
  try {
    const packageJson = await readJson(packageFile);
    assertVersion(issues, packageFile, packageJson.version, expectedVersion, "package version");
  } catch (error) { addIssue(issues, packageFile, `invalid package JSON: ${error instanceof Error ? error.message : String(error)}`); }
  if (androidVersionPath) await checkTextFile(issues, resolveFromRoot(androidVersionPath), expectedVersion, "android-properties");
  if (versionJsonPath) await checkJsonFile(issues, resolveFromRoot(versionJsonPath), expectedVersion, "version-json");
  for (const file of nativeFeedPaths) await checkJsonFile(issues, resolveFromRoot(file), expectedVersion, "native-feed");
  for (const file of releaseManifestPaths) await checkJsonFile(issues, resolveFromRoot(file), expectedVersion, "release-manifest");
  for (const file of releaseNotesPaths) await checkTextFile(issues, resolveFromRoot(file), expectedVersion, "release-notes");
  for (const file of metadataPaths) {
    const absolute = resolveFromRoot(file);
    if (/\.json$/i.test(file)) await checkJsonFile(issues, absolute, expectedVersion, "metadata");
    else await checkTextFile(issues, absolute, expectedVersion, "metadata");
  }
  return { ok: issues.length === 0, expectedVersion, checked: { packageJsonPath, androidVersionPath, versionJsonPath, nativeFeedPaths, releaseManifestPaths, releaseNotesPaths, metadataPaths }, issues };
}

function parseArgs(argv) {
  const values = { nativeFeedPaths: [], releaseManifestPaths: [], releaseNotesPaths: [], metadataPaths: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--native-feed" || key === "--release-manifest" || key === "--release-notes" || key === "--metadata") {
      const value = argv[++index];
      if (!value) throw new Error(`${key} requires a path`);
      values[{ "--native-feed": "nativeFeedPaths", "--release-manifest": "releaseManifestPaths", "--release-notes": "releaseNotesPaths", "--metadata": "metadataPaths" }[key]].push(value);
      continue;
    }
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    const value = argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
    values[key.slice(2).replaceAll("-", "")] = value;
  }
  return values;
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
}

if (isMainModule()) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (!args.expectedversion) throw new Error("Usage: node scripts/check-version-consistency.mjs --expected-version VERSION [--version-json PATH] [--native-feed PATH] [--release-manifest PATH] [--release-notes PATH] [--metadata PATH]");
    const result = await checkVersionConsistency({
      expectedVersion: args.expectedversion,
      packageJsonPath: args.packagejson || "package.json",
      androidVersionPath: args.androidversionpath || "android/native-version.properties",
      versionJsonPath: args.versionjson,
      nativeFeedPaths: args.nativeFeedPaths,
      releaseManifestPaths: args.releaseManifestPaths,
      releaseNotesPaths: args.releaseNotesPaths,
      metadataPaths: args.metadataPaths,
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
