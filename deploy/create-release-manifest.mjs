import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function gitText(args) {
  try {
    return execFileSync("git", args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function collectFiles(relativePath) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  const entry = await stat(absolutePath);
  if (entry.isFile()) return [relativePath.replaceAll("\\", "/")];
  const children = await readdir(absolutePath);
  const files = [];
  for (const child of children.sort()) {
    files.push(...await collectFiles(path.join(relativePath, child)));
  }
  return files;
}

async function describeFile(relativePath) {
  const normalizedPath = relativePath.replaceAll("\\", "/");
  const buffer = await readFile(path.join(repositoryRoot, normalizedPath));
  return { path: normalizedPath, size: buffer.byteLength, sha256: sha256(buffer) };
}

async function describeReleaseFiles() {
  const paths = [
    ...await collectFiles("dist"),
    ...await collectFiles("deploy/mail-templates"),
    "deploy/backup-crypto.mjs",
    "deploy/backup-sqlite.mjs",
    "deploy/create-offsite-backup.mjs",
    "deploy/probe-node-health.mjs",
    "deploy/restore-drill.mjs",
    "deploy/sqlite-snapshot.mjs",
    "server/activity.mjs",
    "server/activity.test.mjs",
    "server/analytics.mjs",
    "server/analytics.test.mjs",
    "server/index.mjs",
    "server/leaderboard-moderation.mjs",
    "server/leaderboard-moderation.test.mjs",
    "server/mail.mjs",
    "server/mail.test.mjs",
    "server/moderate-leaderboard.mjs",
    "server/package.json",
    "server/package-lock.json",
    "server/save-integrity.mjs",
    "server/server.test.mjs",
    "server/speedrun.test.mjs",
  ];
  return Promise.all(paths.sort().map(describeFile));
}

function aggregateHash(files) {
  return sha256(Buffer.from(files.map((file) => `${file.sha256} ${file.size} ${file.path}\n`).join("")));
}

async function verifyManifest(manifestPath) {
  if (!manifestPath) throw new Error("Usage: npm run release:verify -- <manifest.json>");
  const absoluteManifestPath = path.resolve(repositoryRoot, manifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  const actualFiles = await Promise.all(manifest.files.map((file) => describeFile(file.path)));
  const mismatches = actualFiles.filter((file, index) => (
    file.size !== manifest.files[index].size || file.sha256 !== manifest.files[index].sha256
  ));
  if ((manifest.fileCount != null && manifest.fileCount !== actualFiles.length) || aggregateHash(actualFiles) !== manifest.aggregateSha256 || mismatches.length > 0) {
    for (const mismatch of mismatches) console.error(`Mismatch: ${mismatch.path}`);
    throw new Error("Release manifest verification failed");
  }
  console.log(`Verified ${actualFiles.length} files for ${manifest.releaseId}`);
}

async function createManifest({ allowDirty, output, bundleRoot }) {
  const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
  const gitSha = gitText(["rev-parse", "HEAD"]);
  if (!gitSha) throw new Error("A Git checkout is required to create a release manifest");
  const dirty = Boolean(gitText(["status", "--porcelain"]));
  if (dirty && !allowDirty) throw new Error("Refusing to create a release manifest from a dirty worktree; pass --allow-dirty only for diagnostics");
  const shortSha = gitSha.slice(0, 12);
  const releaseId = `${packageJson.version}-${shortSha}${dirty ? "-dirty" : ""}`;
  const files = bundleRoot ? await collectFiles(bundleRoot) : await describeReleaseFiles();
  const manifest = {
    formatVersion: 1,
    releaseId,
    appVersion: packageJson.version,
    buildId: `${packageJson.version}+${shortSha}${dirty ? ".dirty" : ""}`,
    generatedAt: new Date().toISOString(),
    git: { sha: gitSha, clean: !dirty },
    fileCount: files.length,
    aggregateSha256: aggregateHash(files),
    files,
  };
  const outputPath = path.resolve(repositoryRoot, output || `artifacts/release-manifests/${releaseId}.json`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(path.relative(repositoryRoot, outputPath));
}

const args = process.argv.slice(2);
const verifyIndex = args.indexOf("--verify");
if (verifyIndex >= 0) {
  await verifyManifest(args[verifyIndex + 1]);
} else {
  const outputIndex = args.indexOf("--output");
  const bundleRootIndex = args.indexOf("--bundle-root");
  await createManifest({
    allowDirty: args.includes("--allow-dirty"),
    output: outputIndex >= 0 ? args[outputIndex + 1] : null,
    bundleRoot: bundleRootIndex >= 0 ? args[bundleRootIndex + 1]?.replaceAll("\\", "/") : null,
  });
}
