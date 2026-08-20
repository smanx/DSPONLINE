import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, copyFile, mkdtemp, mkdir, readFile, readdir, rm, stat, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { createReleaseSwitchOptions, SystemReleaseRuntime } from "./release-switch.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isLinux = process.platform === "linux";
const requireLinuxGate = process.env.DSP_REQUIRE_LINUX_RELEASE_GATE === "1";
let directory;

function requireLinux(context, label) {
  if (isLinux) return true;
  if (requireLinuxGate) assert.fail(`${label} requires a Linux release-gate host`);
  context.skip(`${label} requires Linux`);
  return false;
}

async function linuxIdentity() {
  const root = typeof process.getuid === "function" && process.getuid() === 0;
  if (!root) {
    const [{ stdout: user }, { stdout: group }] = await Promise.all([execFileAsync("id", ["-un"]), execFileAsync("id", ["-gn"])]);
    return { user: user.trim(), group: group.trim(), root: false };
  }
  const { stdout } = await execFileAsync("getent", ["passwd", "nobody"]);
  const [user, , , groupId] = stdout.trim().split(":");
  const { stdout: groupLine } = await execFileAsync("getent", ["group", groupId]);
  return { user, group: groupLine.trim().split(":")[0], root: true };
}

async function runAs(identity, command, args, options = {}) {
  return identity.root
    ? execFileAsync("runuser", ["-u", identity.user, "--", command, ...args], options)
    : execFileAsync(command, args, options);
}

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "dsp-linux-release-control-"));
});

after(async () => {
  await rm(directory, { recursive: true, force: true });
});

function fixtureOptions(name, extra = {}) {
  const root = path.join(directory, name);
  return createReleaseSwitchOptions({
    DSP_WEB_ROOT: path.join(root, "web"),
    DSP_API_ROOT: path.join(root, "api"),
    DSP_RELEASE_STATE_ROOT: path.join(root, "state"),
    DSP_RELEASE_RUNTIME_ROOT: path.join(root, "run"),
    DSP_RELEASE_PREFLIGHT_ROOT: path.join(root, "preflight"),
    DSP_CLOUD_DATABASE_FILE: path.join(root, "cloud.sqlite"),
    DSP_CLOUD_DATA_FILE: path.join(root, "cloud.json"),
    DSP_CLOUD_BACKUP_DIRECTORY: path.join(root, "backups"),
    ...extra,
  });
}

class NoReflinkRuntime extends SystemReleaseRuntime {
  async command() { return { stdout: "", stderr: "" }; }
  async reflinkClone() {
    const error = new Error("synthetic ext4 without reflink");
    error.code = "EOPNOTSUPP";
    throw error;
  }
}

test("an ext4-style no-reflink 3.2 GiB backup is rejected before a full copy and preserves WAL", async () => {
  const options = fixtureOptions("large-no-reflink", { DSP_RELEASE_PREFLIGHT_INLINE_COPY_LIMIT_BYTES: String(512 * 1024 * 1024) });
  await mkdir(options.preflightRoot, { recursive: true });
  const backup = path.join(directory, "large-no-reflink", "verified-3.2g.sqlite");
  const wal = `${backup}-wal`;
  await mkdir(path.dirname(backup), { recursive: true });
  await writeFile(backup, "SQLite format 3\0");
  await truncate(backup, 3_200 * 1024 * 1024);
  await writeFile(wal, "concurrent-wal-must-survive");
  const backupBefore = await stat(backup);
  const walBefore = await readFile(wal);
  const runtime = new NoReflinkRuntime(options);
  const evidence = {
    databasePath: backup,
    bytes: backupBefore.size,
    mtimeMs: backupBefore.mtimeMs,
    device: String(backupBefore.dev),
    inode: String(backupBefore.ino),
    sha256: "a".repeat(64),
    schemaVersion: 7,
    storageLayoutVersion: 2,
  };
  const target = { apiPath: path.join(options.apiRoot, "releases", "new"), apiReleaseId: "new" };
  const startedAt = Date.now();
  await assert.rejects(() => runtime.preparePreflight(evidence, target), /create a separately verified --preflight-evidence/);
  assert.ok(Date.now() - startedAt < 2_000, "large backup refusal must not stream the 3.2 GiB source");
  const backupAfter = await stat(backup);
  assert.equal(backupAfter.size, backupBefore.size);
  assert.equal(backupAfter.mtimeMs, backupBefore.mtimeMs);
  assert.deepEqual(await readFile(wal), walBefore);
  assert.deepEqual((await readdir(options.preflightRoot)).filter((file) => file.endsWith(".sqlite")), []);
});

test("a separately verified preflight copy is atomically adopted without touching the immutable backup", async () => {
  const options = fixtureOptions("prepared-copy");
  await mkdir(options.preflightRoot, { recursive: true });
  const backup = path.join(directory, "prepared-copy", "backup.sqlite");
  const prepared = path.join(options.preflightRoot, "prepared.sqlite");
  await mkdir(path.dirname(backup), { recursive: true });
  await writeFile(backup, "prepared-copy-bytes");
  await copyFile(backup, prepared);
  const [backupMetadata, preparedMetadata] = await Promise.all([stat(backup), stat(prepared)]);
  const runtime = new NoReflinkRuntime(options);
  const evidence = {
    databasePath: backup,
    bytes: backupMetadata.size,
    mtimeMs: backupMetadata.mtimeMs,
    device: String(backupMetadata.dev),
    inode: String(backupMetadata.ino),
    sha256: "b".repeat(64),
    schemaVersion: 7,
    storageLayoutVersion: 2,
  };
  const preparedEvidence = {
    ...evidence,
    databasePath: prepared,
    mtimeMs: preparedMetadata.mtimeMs,
    device: String(preparedMetadata.dev),
    inode: String(preparedMetadata.ino),
  };
  const result = await runtime.preparePreflight(evidence, { apiPath: path.join(options.apiRoot, "releases", "new"), apiReleaseId: "new" }, preparedEvidence);
  assert.equal(await readFile(backup, "utf8"), "prepared-copy-bytes");
  assert.equal(await readFile(result.databaseFile, "utf8"), "prepared-copy-bytes");
  assert.equal((await stat(result.databaseFile)).ino, preparedMetadata.ino);
  await runtime.cleanupPreflight(result);
});

test("writer lock script returns 78 for an unwritable lock and 75 for a held lock", async (context) => {
  if (!requireLinux(context, "writer lock exit-code gate")) return;
  const identity = await linuxIdentity();
  const lockDirectory = path.join(directory, "writer-lock");
  const lockFile = path.join(lockDirectory, "writer.lock");
  const marker = path.join(lockDirectory, "ran");
  await mkdir(lockDirectory, { recursive: true, mode: 0o750 });
  if (identity.root) await execFileAsync("chown", [`${identity.user}:${identity.group}`, lockDirectory]);
  await writeFile(lockFile, "");
  if (identity.root) await execFileAsync("chown", [`root:${identity.group}`, lockFile]);
  await chmod(lockFile, 0o440);
  await assert.rejects(
    () => runAs(identity, "bash", [path.join(repositoryRoot, "deploy", "api-writer-lock.sh"), "touch", marker], { env: { ...process.env, DSP_API_WRITER_LOCK_FILE: lockFile } }),
    (error) => error.code === 78,
  );
  await assert.rejects(() => stat(marker));

  await chmod(lockFile, 0o660);
  if (identity.root) await execFileAsync("chown", [`${identity.user}:${identity.group}`, lockFile]);
  const holderArgs = [path.join(repositoryRoot, "deploy", "api-writer-lock.sh"), "sleep", "30"];
  const holder = spawn(identity.root ? "runuser" : "bash", identity.root ? ["-u", identity.user, "--", "bash", ...holderArgs] : holderArgs, {
    env: { ...process.env, DSP_API_WRITER_LOCK_FILE: lockFile },
    stdio: "ignore",
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await assert.rejects(
      () => runAs(identity, "bash", [path.join(repositoryRoot, "deploy", "api-writer-lock.sh"), "true"], { env: { ...process.env, DSP_API_WRITER_LOCK_FILE: lockFile } }),
      (error) => error.code === 75,
    );
  } finally {
    holder.kill("SIGTERM");
    await once(holder, "exit");
  }
});

test("active entry maps missing or invalid switch state to configuration exit 78", async (context) => {
  if (!requireLinux(context, "active entry exit-code gate")) return;
  const options = fixtureOptions("active-entry-invalid");
  await mkdir(options.apiRoot, { recursive: true });
  await assert.rejects(
    () => execFileAsync("bash", [path.join(repositoryRoot, "deploy", "api-active-entry.sh")], {
      env: {
        ...process.env,
        DSP_RELEASE_CONTROL_ROOT: path.join(repositoryRoot, "deploy"),
        DSP_RELEASE_SWITCH_STATE_FILE: path.join(directory, "missing-switch-state.json"),
        DSP_RELEASE_ACTIVE_START_FILE: path.join(directory, "missing-pending-state.json"),
        DSP_API_ROOT: options.apiRoot,
      },
    }),
    (error) => error.code === 78 && /could not be read/.test(error.stderr),
  );
});

test("interrupted recovery refuses to start without a backup window", async (context) => {
  if (!requireLinux(context, "recovery backup-window gate")) return;
  const options = fixtureOptions("active-entry-recovery-window");
  const release = path.join(options.apiRoot, "releases", "old");
  await mkdir(release, { recursive: true });
  const active = {
    version: 1,
    generation: 1,
    current: { webPath: path.join(options.webRoot, "releases", "old"), apiPath: release, slot: "legacy", port: 4320, unit: "legacy.service" },
    previous: null,
    updatedAt: Date.now(),
  };
  await mkdir(path.dirname(options.activeStartFile), { recursive: true });
  await writeFile(options.activeStartFile, JSON.stringify({
    pendingVersion: 1,
    phase: "recovering",
    base: active,
    target: {
      version: 1,
      generation: 2,
      current: { ...active.current, apiPath: path.join(options.apiRoot, "releases", "new"), slot: "blue", port: 4321, unit: "active.service" },
      previous: active.current,
      updatedAt: Date.now(),
    },
    updatedAt: Date.now(),
  }));
  await mkdir(path.join(options.apiRoot, "releases", "new"), { recursive: true });
  await assert.rejects(
    () => execFileAsync("bash", [path.join(repositoryRoot, "deploy", "api-active-entry.sh")], {
      env: {
        ...process.env,
        DSP_RELEASE_CONTROL_ROOT: path.join(repositoryRoot, "deploy"),
        DSP_RELEASE_SWITCH_STATE_FILE: options.switchStateFile,
        DSP_RELEASE_ACTIVE_START_FILE: options.activeStartFile,
        DSP_API_ROOT: options.apiRoot,
        DSP_CLOUD_BACKUP_WINDOW: "",
      },
    }),
    (error) => error.code === 78 && /must protect an interrupted recovery/.test(error.stderr),
  );
});

test("writer lock preparation creates a real service-owned 0660 inode", async (context) => {
  if (!requireLinux(context, "writer lock ownership gate")) return;
  const identity = await linuxIdentity();
  if (!identity.root) {
    context.skip("writer lock ownership repair requires root on this Linux host");
    if (requireLinuxGate) assert.fail("Linux release gate must run the ownership repair test as root");
    return;
  }
  await chmod(directory, 0o755);
  const options = fixtureOptions("writer-owner", { DSP_SERVICE_USER: identity.user, DSP_SERVICE_GROUP: identity.group });
  const runtime = new SystemReleaseRuntime(options);
  await runtime.ensureWriterLockFile();
  const metadata = await stat(options.writerLockFile);
  assert.equal(metadata.isFile(), true);
  assert.equal(metadata.mode & 0o777, 0o660);
  await runtime.writerLockAvailable(1_000);
  await runAs(identity, "bash", [path.join(repositoryRoot, "deploy", "api-writer-lock.sh"), "true"], {
    env: { ...process.env, DSP_API_WRITER_LOCK_FILE: options.writerLockFile },
  });
});

test("release state journal directory is root-owned and readable by the service group", async (context) => {
  if (!requireLinux(context, "release state ownership gate")) return;
  const identity = await linuxIdentity();
  if (!identity.root) {
    context.skip("release state ownership repair requires root on this Linux host");
    if (requireLinuxGate) assert.fail("Linux release gate must run the release-state ownership test as root");
    return;
  }
  await chmod(directory, 0o755);
  const options = fixtureOptions("release-state-owner", { DSP_SERVICE_USER: identity.user, DSP_SERVICE_GROUP: identity.group });
  const runtime = new SystemReleaseRuntime(options);
  await runtime.ensureReleaseStateAccess();
  const journal = path.join(options.stateRoot, "pending-switch.json");
  await writeFile(journal, "{\"phase\":\"recovering\"}\n", { mode: 0o640 });
  const metadata = await stat(options.stateRoot);
  const journalMetadata = await stat(journal);
  assert.equal(metadata.mode & 0o2777, 0o2750);
  assert.equal(journalMetadata.gid, metadata.gid);
  const { stdout } = await runAs(identity, "bash", ["-lc", `test -r \"$1\" && cat \"$1\"`, "bash", journal]);
  assert.match(stdout, /recovering/);
});

test("systemd templates pass systemd-analyze syntax verification", async (context) => {
  if (!requireLinux(context, "systemd template gate")) return;
  try { await execFileAsync("systemd-analyze", ["--version"]); }
  catch {
    if (requireLinuxGate) assert.fail("systemd-analyze is required by the Linux release gate");
    context.skip("systemd-analyze is unavailable on this Linux host");
    return;
  }
  const identity = await linuxIdentity();
  const unitRoot = path.join(directory, "systemd-units");
  await mkdir(unitRoot, { recursive: true });
  const names = ["dsp-idle-api-handoff-proxy.service", "dsp-idle-api-active.service", "dsp-idle-api-preflight.service"];
  for (const name of names) {
    let source = await readFile(path.join(repositoryRoot, "deploy", name), "utf8");
    source = source
      .replaceAll("/usr/local/lib/dsp-idle-release/current", path.join(repositoryRoot, "deploy"))
      .replaceAll("/usr/bin/node", process.execPath.replaceAll("\\", "/"))
      .replace(/^User=.*$/gm, `User=${identity.user}`)
      .replace(/^Group=.*$/gm, `Group=${identity.group}`)
      .replace(/^WorkingDirectory=.*$/gm, `WorkingDirectory=-${repositoryRoot.replaceAll("\\", "/")}`)
      .replace(/^EnvironmentFile=\/etc\/dsp-idle-cloud\/runtime\.env$/gm, `EnvironmentFile=${path.join(unitRoot, "runtime.env").replaceAll("\\", "/")}`)
      .replace(/^EnvironmentFile=-\/etc\/dsp-idle-cloud\/admin\.env$/gm, "");
    await writeFile(path.join(unitRoot, name), source);
  }
  await writeFile(path.join(unitRoot, "runtime.env"), "DSP_CLOUD_BACKUP_WINDOW=03:00-04:00\nDSP_API_RELEASE_DIR=/tmp\n");
  await execFileAsync("systemd-analyze", ["verify", ...names.map((name) => path.join(unitRoot, name))]);
});
