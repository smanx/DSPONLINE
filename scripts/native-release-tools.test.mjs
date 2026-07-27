import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("native feed generator creates bounded Android and desktop update feeds", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "dsp-native-feed-"));
  try {
    const apk = path.join(temporary, "app-debug.apk");
    const desktopSource = path.join(temporary, "desktop-source");
    const output = path.join(temporary, "feed");
    await writeFile(apk, Buffer.from("debug apk fixture"));
    await mkdir(desktopSource);
    await writeFile(path.join(desktopSource, "dsp-idle-1.0.1-x64-setup.exe"), Buffer.from("desktop fixture"));
    await writeFile(path.join(desktopSource, "latest.yml"), "version: 1.0.1\npath: dsp-idle-1.0.1-x64-setup.exe\nsha512: fixture\n");
    await execFileAsync(process.execPath, [
      path.join(root, "scripts", "create-native-update-manifests.mjs"),
      "--channel", "stable",
      "--base-url", "https://dsponline.cn/downloads/",
      "--android-apk", apk,
      "--allow-debug", "true",
      "--desktop-source", desktopSource,
      "--output", output,
      "--notes", "原生测试|更新机制",
    ], { cwd: root });

    const android = JSON.parse(await readFile(path.join(output, "android", "stable.json"), "utf8"));
    assert.equal(android.packageId, "cn.dsponline.network");
    assert.equal(android.versionName, "1.0.5");
    assert.match(android.apk.url, /^https:\/\/dsponline\.cn\/downloads\/android\/dsp-idle-1\.0\.5-1000005\.apk$/);
    assert.match(android.apk.sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(android.notes, ["原生测试", "更新机制"]);

    const desktop = JSON.parse(await readFile(path.join(output, "desktop", "stable", "release.json"), "utf8"));
    assert.equal(desktop.channel, "stable");
    assert.equal(desktop.version, "1.0.5");
    assert.deepEqual(desktop.files.map((file) => file.name), ["latest.yml", "dsp-idle-1.0.1-x64-setup.exe"]);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("native feed generator refuses a debug APK by default", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "dsp-native-feed-reject-"));
  try {
    const apk = path.join(temporary, "app-debug.apk");
    await writeFile(apk, Buffer.from("debug apk fixture"));
    await assert.rejects(execFileAsync(process.execPath, [
      path.join(root, "scripts", "create-native-update-manifests.mjs"),
      "--base-url", "https://updates.example.test/downloads/",
      "--android-apk", apk,
      "--output", path.join(temporary, "feed"),
    ], { cwd: root }), /Refusing to publish a debug-signed or unsigned APK/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("native feed generator requires an explicit update base URL", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "dsp-native-feed-base-url-"));
  try {
    const apk = path.join(temporary, "app-debug.apk");
    await writeFile(apk, Buffer.from("debug apk fixture"));
    await assert.rejects(execFileAsync(process.execPath, [
      path.join(root, "scripts", "create-native-update-manifests.mjs"),
      "--android-apk", apk,
      "--allow-debug", "true",
      "--output", path.join(temporary, "feed"),
    ], { cwd: root, env: { ...process.env, DSP_NATIVE_UPDATE_BASE_URL: "" } }), /base-url.*required/i);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
