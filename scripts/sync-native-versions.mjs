import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(packageJson.version);
if (!match) throw new Error(`Unsupported package version: ${packageJson.version}`);

const [, majorText, minorText, patchText, prerelease] = match;
const major = Number(majorText);
const minor = Number(minorText);
const patch = Number(patchText);
if (minor > 999 || patch > 999) throw new Error("Android version mapping supports minor and patch values up to 999");

const requestedChannel = process.env.DSP_RELEASE_CHANNEL?.trim().toLowerCase() || "stable";
const channel = ["stable", "beta", "nightly"].includes(requestedChannel) ? requestedChannel : "stable";
const explicitVersionCode = process.env.DSP_ANDROID_VERSION_CODE?.trim();
if ((prerelease || channel !== "stable") && !explicitVersionCode) {
  throw new Error("Prerelease and non-stable Android builds require DSP_ANDROID_VERSION_CODE to avoid upgrade collisions");
}
const versionCode = explicitVersionCode ? Number(explicitVersionCode) : major * 1_000_000 + minor * 1_000 + patch;
if (!Number.isSafeInteger(versionCode) || versionCode <= 0 || versionCode > 2_100_000_000) {
  throw new Error("DSP_ANDROID_VERSION_CODE must be a positive Android-compatible integer");
}

const contents = `VERSION_NAME=${packageJson.version}\nVERSION_CODE=${versionCode}\nRELEASE_CHANNEL=${channel}\n`;
const target = path.join(root, "android", "native-version.properties");
let current = "";
try { current = await readFile(target, "utf8"); } catch { /* First native sync creates the file. */ }
if (current !== contents) await writeFile(target, contents, "utf8");
console.log(`Android version synchronized: ${packageJson.version} (${versionCode}, ${channel})`);
