import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { writeApiProxyState } from "./api-handoff-proxy.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deployRoot = path.join(repositoryRoot, "deploy");
let directory;
let linkedDeployRoot;

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "dsp-direct-symlink-"));
  linkedDeployRoot = path.join(directory, "current");
  await symlink(deployRoot, linkedDeployRoot, process.platform === "win32" ? "junction" : "dir");
});

after(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForFile(file, child, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`linked CLI exited before becoming ready: ${child.exitCode}`);
    try { return JSON.parse(await readFile(file, "utf8")); }
    catch { await new Promise((resolve) => setTimeout(resolve, 20)); }
  }
  throw new Error("linked CLI did not produce its expected status file");
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

test("handoff proxy executes through a current-directory symlink instead of silently exiting", async () => {
  const stateFile = path.join(directory, "proxy-state.json");
  const statusFile = path.join(directory, "proxy-status.json");
  const port = await reservePort();
  await writeApiProxyState(stateFile, {
    version: 1,
    generation: 1,
    mode: "forward",
    changedAt: Date.now(),
    upstream: { host: "127.0.0.1", port: 65_530, slot: "legacy", releaseId: "old" },
  });
  const child = spawn(process.execPath, [path.join(linkedDeployRoot, "api-handoff-proxy.mjs")], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      DSP_API_PROXY_STATE_FILE: stateFile,
      DSP_API_PROXY_STATUS_FILE: statusFile,
    },
  });
  try {
    const status = await waitForFile(statusFile, child);
    assert.equal(status.listening, true);
    assert.equal(status.port, port);
  } finally {
    await stopChild(child);
  }
  assert.ok(child.exitCode === 0 || child.signalCode === "SIGTERM", `unexpected linked proxy exit: ${child.exitCode ?? child.signalCode}`);
});

test("active environment and release switch CLIs execute through the same symlink", async () => {
  const apiRoot = path.join(directory, "api");
  const releaseDirectory = path.join(apiRoot, "releases", "old");
  const stateFile = path.join(directory, "switch-state.json");
  await mkdir(releaseDirectory, { recursive: true });
  await writeFile(stateFile, JSON.stringify({
    version: 1,
    generation: 1,
    current: {
      webPath: path.join(directory, "web", "releases", "old"),
      apiPath: releaseDirectory,
      slot: "legacy",
      port: 43_20,
      unit: "dsp-idle-cloud.service",
    },
    previous: null,
    updatedAt: Date.now(),
  }));
  const active = await execFileAsync(process.execPath, [path.join(linkedDeployRoot, "active-api-environment.mjs"), stateFile, apiRoot], { windowsHide: true });
  assert.equal(active.stdout.trim(), `${releaseDirectory}\t4320\tsteady`);

  const help = await execFileAsync(process.execPath, [path.join(linkedDeployRoot, "release-switch.mjs"), "--help"], { windowsHide: true });
  assert.match(help.stdout, /dsp-idle-switch-release/);

  await assert.rejects(
    () => execFileAsync(process.execPath, [path.join(linkedDeployRoot, "release-backup-evidence.mjs")], { windowsHide: true }),
    (error) => error.code === 1 && /databaseFile and evidenceFile are required/.test(error.stderr),
  );
});

test("release and server CLIs contain no path-string-only direct-invocation checks", async () => {
  const { stdout } = await execFileAsync("git", ["ls-files", "*.mjs", "*.cjs", "*.js"], { cwd: repositoryRoot, windowsHide: true });
  const unsafe = [];
  for (const relative of stdout.split(/\r?\n/).filter(Boolean)) {
    if (!/^(?:deploy|scripts|server)\//.test(relative)) continue;
    const source = await readFile(path.join(repositoryRoot, relative), "utf8");
    if (/path\.resolve\(process\.argv\[1\]\)\s*={2,3}\s*(?:path\.resolve\()?fileURLToPath\(import\.meta\.url\)/.test(source)
      || /fileURLToPath\(import\.meta\.url\)\s*={2,3}\s*path\.resolve\(process\.argv\[1\]\)/.test(source)
      || /fileURLToPath\(new URL\(`file:\/\/\/\$\{process\.argv\[1\]/.test(source)) {
      unsafe.push(relative);
    }
  }
  assert.deepEqual(unsafe, []);
});
