import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
  args.set(key.slice(2), value);
  index += 1;
}

const channel = (args.get("channel") || process.env.DSP_RELEASE_CHANNEL || "stable").toLowerCase();
if (!["stable", "beta", "nightly"].includes(channel)) throw new Error(`Unsupported release channel: ${channel}`);
const configuredBaseUrl = args.get("base-url") || process.env.DSP_NATIVE_UPDATE_BASE_URL;
if (!configuredBaseUrl) throw new Error("--base-url or DSP_NATIVE_UPDATE_BASE_URL is required");
const baseUrl = new URL(configuredBaseUrl);
if (baseUrl.protocol !== "https:") throw new Error("Native update base URL must use HTTPS");

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const versionProperties = Object.fromEntries((await readFile(path.join(root, "android", "native-version.properties"), "utf8"))
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => line.split("=", 2)));
if (versionProperties.VERSION_NAME !== packageJson.version) throw new Error("Run npm run android:sync before creating update manifests");
const versionCode = Number(versionProperties.VERSION_CODE);
if (!Number.isSafeInteger(versionCode) || versionCode <= 0) throw new Error("Android versionCode is invalid");

const outputRoot = path.resolve(root, args.get("output") || "release/update-feed");
const releaseNotes = (args.get("notes") || `DSP极简网络 ${packageJson.version}`)
  .split("|")
  .map((note) => note.trim())
  .filter(Boolean)
  .slice(0, 12);

async function sha256(file) {
  const contents = await readFile(file);
  return createHash("sha256").update(contents).digest("hex");
}

async function verifyAndroidSignature(apk, expectedCertificate) {
  const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Android", "Sdk") : "");
  if (!androidHome) throw new Error("ANDROID_HOME is required to verify the Android release signature");
  const buildToolsRoot = path.join(androidHome, "build-tools");
  const versions = (await readdir(buildToolsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  const signerJar = path.join(buildToolsRoot, versions[0] || "", "lib", "apksigner.jar");
  await access(signerJar).catch(() => { throw new Error("Android apksigner.jar was not found in the SDK build-tools"); });
  const javaExecutable = process.env.JAVA_HOME
    ? path.join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java")
    : "java";
  const { stdout } = await execFileAsync(javaExecutable, ["-jar", signerJar, "verify", "--verbose", "--print-certs", apk], { windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
  if (!/Verified using v[234] scheme[^:]*:\s*true/i.test(stdout)) throw new Error("Android release APK must use APK Signature Scheme v2 or newer");
  const actualCertificate = /Signer #1 certificate SHA-256 digest:\s*([a-f0-9]{64})/i.exec(stdout)?.[1]?.toLowerCase();
  if (!actualCertificate || actualCertificate !== expectedCertificate) throw new Error("Android release certificate fingerprint does not match the approved signer");
}

async function createAndroidFeed(apkArgument) {
  if (!apkArgument) return null;
  const source = path.resolve(root, apkArgument);
  const sourceStats = await stat(source);
  if (!sourceStats.isFile() || path.extname(source).toLowerCase() !== ".apk") throw new Error("Android update artifact must be an APK file");
  const allowDebug = args.get("allow-debug") === "true";
  if (/(?:debug|unsigned)/i.test(path.basename(source)) && !allowDebug) {
    throw new Error("Refusing to publish a debug-signed or unsigned APK; pass --allow-debug true only for an isolated test feed");
  }
  if (!allowDebug) {
    const expectedCertificate = args.get("android-certificate-sha256")?.trim().toLowerCase();
    if (!expectedCertificate || !/^[a-f0-9]{64}$/.test(expectedCertificate)) throw new Error("--android-certificate-sha256 is required for a production Android feed");
    await verifyAndroidSignature(source, expectedCertificate);
  }
  const directory = path.join(outputRoot, "android");
  await mkdir(directory, { recursive: true });
  const fileName = `dsp-idle-${packageJson.version}-${versionCode}.apk`;
  const target = path.join(directory, fileName);
  await copyFile(source, target);
  const digest = await sha256(target);
  const minimumSupportedVersionCode = Number(args.get("minimum-android-code") || 1);
  if (!Number.isSafeInteger(minimumSupportedVersionCode) || minimumSupportedVersionCode <= 0 || minimumSupportedVersionCode > versionCode) {
    throw new Error("minimum-android-code must be between 1 and the release versionCode");
  }
  const manifest = {
    schemaVersion: 1,
    packageId: "cn.dsponline.network",
    channel,
    versionName: packageJson.version,
    versionCode,
    minimumSupportedVersionCode,
    publishedAt: new Date().toISOString(),
    apk: {
      url: new URL(`android/${fileName}`, baseUrl).toString(),
      sha256: digest,
      size: sourceStats.size,
    },
    notes: releaseNotes,
  };
  await writeFile(path.join(directory, `${channel}.json`), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

async function createDesktopFeed(desktopArgument) {
  if (!desktopArgument) return null;
  const sourceDirectory = path.resolve(root, desktopArgument);
  const sourceManifest = path.join(sourceDirectory, "latest.yml");
  const yaml = await readFile(sourceManifest, "utf8");
  const artifactName = /^path:\s*['\"]?([^'\"\r\n]+)['\"]?\s*$/m.exec(yaml)?.[1]?.trim();
  if (!artifactName || path.basename(artifactName) !== artifactName) throw new Error("Desktop latest.yml contains an unsafe artifact path");
  const targetDirectory = path.join(outputRoot, "desktop", channel);
  await mkdir(targetDirectory, { recursive: true });
  const files = ["latest.yml", artifactName, `${artifactName}.blockmap`];
  const copied = [];
  for (const fileName of files) {
    const source = path.join(sourceDirectory, fileName);
    try {
      await copyFile(source, path.join(targetDirectory, fileName));
      copied.push({ name: fileName, sha256: await sha256(source), size: (await stat(source)).size });
    } catch (error) {
      if (fileName.endsWith(".blockmap") && error?.code === "ENOENT") continue;
      throw error;
    }
  }
  await writeFile(path.join(targetDirectory, "release.json"), `${JSON.stringify({
    schemaVersion: 1,
    channel,
    version: packageJson.version,
    publishedAt: new Date().toISOString(),
    files: copied,
  }, null, 2)}\n`, "utf8");
  return copied;
}

const android = await createAndroidFeed(args.get("android-apk"));
const desktop = await createDesktopFeed(args.get("desktop-source"));
if (!android && !desktop) throw new Error("Provide --android-apk and/or --desktop-source");
console.log(`Native update feed created in ${path.relative(root, outputRoot)}`);
