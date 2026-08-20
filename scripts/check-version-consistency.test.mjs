import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { checkVersionConsistency } from "./check-version-consistency.mjs";

test("checks package, Android, version JSON, feeds and release manifest as one version", async () => {
  const root = await mkdtemp(path.join(process.cwd(), ".tmp-version-check-"));
  try {
    await writeFile(path.join(root, "package.json"), JSON.stringify({ version: "1.0.40" }));
    await writeFile(path.join(root, "android.properties"), "VERSION_NAME=1.0.40\nVERSION_CODE=1000040\n");
    await writeFile(path.join(root, "version.json"), JSON.stringify({ version: "1.0.40", buildId: "1.0.40+abc" }));
    await writeFile(path.join(root, "feed.json"), JSON.stringify({ versionName: "1.0.40", versionCode: 1000040 }));
    await writeFile(path.join(root, "release.json"), JSON.stringify({ appVersion: "1.0.40", buildId: "1.0.40+abc", releaseId: "1.0.40-abc" }));
    await writeFile(path.join(root, "notes.md"), "# 1.0.40\n本批修复云存档与排行榜。\n");
    const result = await checkVersionConsistency({
      expectedVersion: "1.0.40",
      packageJsonPath: path.relative(process.cwd(), path.join(root, "package.json")),
      androidVersionPath: path.relative(process.cwd(), path.join(root, "android.properties")),
      versionJsonPath: path.relative(process.cwd(), path.join(root, "version.json")),
      nativeFeedPaths: [path.relative(process.cwd(), path.join(root, "feed.json"))],
      releaseManifestPaths: [path.relative(process.cwd(), path.join(root, "release.json"))],
      releaseNotesPaths: [path.relative(process.cwd(), path.join(root, "notes.md"))],
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.issues, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails stale package/native/release metadata and accepts historical mentions in notes body", async () => {
  const root = await mkdtemp(path.join(process.cwd(), ".tmp-version-check-stale-"));
  try {
    await writeFile(path.join(root, "package.json"), JSON.stringify({ version: "1.0.39" }));
    await writeFile(path.join(root, "android.properties"), "VERSION_NAME=1.0.38\n");
    await writeFile(path.join(root, "notes.md"), "# 1.0.40\n修复从 1.0.39 升级时的兼容问题。\n");
    const result = await checkVersionConsistency({
      expectedVersion: "1.0.40",
      packageJsonPath: path.relative(process.cwd(), path.join(root, "package.json")),
      androidVersionPath: path.relative(process.cwd(), path.join(root, "android.properties")),
      releaseNotesPaths: [path.relative(process.cwd(), path.join(root, "notes.md"))],
    });
    assert.equal(result.ok, false);
    assert.match(result.issues.join("\n"), /stale version 1\.0\.39/);
    assert.match(result.issues.join("\n"), /stale version 1\.0\.38/);
    assert.equal(result.issues.some((issue) => issue.includes("notes.md") && issue.includes("1.0.39")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
