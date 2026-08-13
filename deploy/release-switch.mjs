import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants, realpathSync } from "node:fs";
import {
  appendFile,
  copyFile,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  utimes,
  chmod,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  API_PROXY_STATE_VERSION,
  readApiProxyState,
  readApiProxyStatus,
  writeApiProxyState,
} from "./api-handoff-proxy.mjs";
import {
  DEFAULT_BACKUP_EVIDENCE_MAX_AGE_MS,
  verifyReleaseBackupEvidence,
} from "./release-backup-evidence.mjs";

const execFileAsync = promisify(execFile);
export const RELEASE_SWITCH_STATE_VERSION = 1;
export const RELEASE_PENDING_STATE_VERSION = 1;

const RELEASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/;
const SERVICE_ACCOUNT_PATTERN = /^[a-z_][a-z0-9_-]{0,31}$/i;
const SLOT_NAMES = Object.freeze(["blue", "green"]);
const MIB_BYTES = 1024 * 1024;

function integer(value, fallback, minimum, maximum, label) {
  const parsed = value === undefined || value === null || value === "" ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return parsed;
}

function releaseId(value, label) {
  const normalized = String(value ?? "").trim();
  if (!RELEASE_ID_PATTERN.test(normalized)) throw new Error(`${label} is invalid`);
  return normalized;
}

function serviceAccount(value, label) {
  const normalized = String(value ?? "").trim();
  if (!SERVICE_ACCOUNT_PATTERN.test(normalized)) throw new Error(`${label} is invalid`);
  return normalized;
}

function withinRoot(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function releaseIdFromPath(root, target) {
  const releasesRoot = path.resolve(root, "releases");
  const resolved = path.resolve(target);
  if (!withinRoot(releasesRoot, resolved) || path.dirname(resolved) !== releasesRoot) {
    throw new Error(`release target escapes configured root: ${target}`);
  }
  return releaseId(path.basename(target), "release directory name");
}

async function pathExists(target) {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function atomicText(file, text, mode = 0o640) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o750 });
  const temporary = `${file}.tmp.${process.pid}.${Date.now()}`;
  let handle;
  try {
    handle = await open(temporary, "wx", mode);
    await handle.writeFile(text, "utf8");
    await handle.chmod(mode);
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, file);
    // fsync the directory entry as well as the file. A switch journal must
    // survive a process or host interruption after rename returns.
    let directoryHandle;
    try {
      directoryHandle = await open(path.dirname(file), "r");
      await directoryHandle.sync();
    } catch (error) {
      // Windows does not consistently allow directory handles. Linux release
      // hosts do, and failures there must remain fatal.
      if (process.platform !== "win32") throw error;
    } finally {
      await directoryHandle?.close().catch(() => undefined);
    }
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function atomicLink(target, current) {
  const temporary = `${current}.next.${process.pid}.${Date.now()}`;
  await symlink(target, temporary, process.platform === "win32" ? "junction" : "dir");
  try {
    await rename(temporary, current);
  } catch (error) {
    if (process.platform === "win32" && ["EEXIST", "EPERM"].includes(error?.code)) {
      const previous = `${current}.previous.${process.pid}.${Date.now()}`;
      await rename(current, previous);
      try {
        await rename(temporary, current);
      } catch (switchError) {
        await rename(previous, current).catch(() => undefined);
        throw switchError;
      }
      await rm(previous, { force: true });
      return;
    }
    throw error;
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

function normalizedActive(value, options) {
  if (!value || typeof value !== "object") throw new Error("release switch active state is missing");
  const webPath = path.resolve(value.webPath);
  const apiPath = path.resolve(value.apiPath);
  releaseIdFromPath(options.webRoot, webPath);
  releaseIdFromPath(options.apiRoot, apiPath);
  const slot = value.slot === "legacy" || SLOT_NAMES.includes(value.slot) ? value.slot : "legacy";
  const port = integer(value.port, options.legacyPort, 1, 65_535, "active API port");
  const unit = typeof value.unit === "string" && /^[A-Za-z0-9@_.+-]{1,128}$/.test(value.unit)
    ? value.unit
    : options.legacyServiceUnit;
  return Object.freeze({
    webPath,
    apiPath,
    webReleaseId: releaseIdFromPath(options.webRoot, webPath),
    apiReleaseId: releaseIdFromPath(options.apiRoot, apiPath),
    slot,
    port,
    unit,
  });
}

function normalizeSwitchState(value, options) {
  if (!value || typeof value !== "object" || value.version !== RELEASE_SWITCH_STATE_VERSION) {
    throw new Error("release switch state is invalid or unsupported");
  }
  return Object.freeze({
    version: RELEASE_SWITCH_STATE_VERSION,
    generation: integer(value.generation, 1, 1, Number.MAX_SAFE_INTEGER, "release switch generation"),
    current: normalizedActive(value.current, options),
    previous: value.previous ? normalizedActive(value.previous, options) : null,
    updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt : 0,
  });
}

function normalizePendingSwitchState(value, options) {
  if (!value || typeof value !== "object" || value.pendingVersion !== RELEASE_PENDING_STATE_VERSION) {
    throw new Error("release pending state is invalid or unsupported");
  }
  if (!["prepared", "publishing", "published", "recovering"].includes(value.phase)) {
    throw new Error("release pending state phase is invalid");
  }
  const base = normalizeSwitchState(value.base, options);
  const target = normalizeSwitchState(value.target, options);
  if (target.generation <= base.generation || !target.previous
    || target.previous.webPath !== base.current.webPath
    || target.previous.apiPath !== base.current.apiPath
    || target.previous.port !== base.current.port) {
    throw new Error("release pending state does not bind its base and target generations");
  }
  return Object.freeze({
    pendingVersion: RELEASE_PENDING_STATE_VERSION,
    phase: value.phase,
    base,
    target,
    updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt : 0,
  });
}

async function readPendingSwitchState(options) {
  try {
    return normalizePendingSwitchState(JSON.parse(await readFile(options.activeStartFile, "utf8")), options);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function writePendingSwitchState(options, pending, phase = pending.phase) {
  const normalized = normalizePendingSwitchState({ ...pending, phase, updatedAt: Date.now() }, options);
  await atomicText(options.activeStartFile, `${JSON.stringify(normalized, null, 2)}\n`, 0o640);
  const verified = await readPendingSwitchState(options);
  if (!verified || verified.phase !== normalized.phase
    || verified.base.current.apiPath !== normalized.base.current.apiPath
    || verified.target.current.apiPath !== normalized.target.current.apiPath
    || verified.target.generation !== normalized.target.generation) {
    throw new Error("release pending state failed durable read-back verification");
  }
  return verified;
}

function nextSwitchState(state, target, options) {
  return normalizeSwitchState({
    version: RELEASE_SWITCH_STATE_VERSION,
    generation: state.generation + 1,
    current: target,
    previous: state.current,
    updatedAt: Date.now(),
  }, options);
}

function activeMatches(active, candidate) {
  return active.webPath === candidate.webPath
    && active.apiPath === candidate.apiPath
    && active.port === candidate.port
    && active.unit === candidate.unit;
}

function activeLocationMatches(active, candidate) {
  return active.webPath === candidate.webPath
    && active.apiPath === candidate.apiPath
    && active.port === candidate.port;
}

function recoverySwitchState(state, options) {
  return normalizeSwitchState({
    ...state,
    current: { ...state.current, unit: options.activeServiceUnit },
    updatedAt: Date.now(),
  }, options);
}

async function reconcileInterruptedSwitch(options, state, currentWeb, currentApi, {
  switchStateExisted = true,
  persistRecovery = true,
} = {}) {
  const pending = await readPendingSwitchState(options);
  const linksMatchState = state.current.webPath === currentWeb && state.current.apiPath === currentApi;
  if (!pending) {
    if (!linksMatchState) throw new Error("release switch state disagrees with current symlinks; inspect and reconcile before switching");
    return { state, pending: null, pendingNeedsPersistence: false };
  }

  const knownWeb = new Set([pending.base.current.webPath, pending.target.current.webPath]);
  const knownApi = new Set([pending.base.current.apiPath, pending.target.current.apiPath]);
  const stateKnown = activeLocationMatches(state.current, pending.base.current) || activeLocationMatches(state.current, pending.target.current);
  if (!knownWeb.has(currentWeb) || !knownApi.has(currentApi) || (switchStateExisted && !stateKnown)) {
    throw new Error("interrupted release state contains paths outside the durable base/target journal");
  }

  const targetCommitted = pending.phase === "published"
    && activeMatches(state.current, pending.target.current)
    && currentWeb === pending.target.current.webPath
    && currentApi === pending.target.current.apiPath;
  let selectedPending = pending;
  if (!targetCommitted && pending.phase !== "recovering") {
    selectedPending = persistRecovery
      ? await writePendingSwitchState(options, pending, "recovering")
      : normalizePendingSwitchState({ ...pending, phase: "recovering" }, options);
  }
  const selected = targetCommitted ? pending.target : recoverySwitchState(pending.base, options);
  // Before the durable published marker, or whenever link/state disagree,
  // recover conservatively to the base. After that marker, a fully consistent
  // target is completed instead of needlessly rolling back a committed switch.
  const restored = normalizeSwitchState({
    version: RELEASE_SWITCH_STATE_VERSION,
    generation: Math.max(state.generation, pending.target.generation) + 1,
    current: selected.current,
    previous: selected.previous,
    updatedAt: Date.now(),
  }, options);
  return {
    state: restored,
    pending: selectedPending,
    pendingNeedsPersistence: selectedPending.phase !== pending.phase,
  };
}

async function readExistingSwitchState(options, currentWeb, currentApi) {
  try {
    return normalizeSwitchState(JSON.parse(await readFile(options.switchStateFile, "utf8")), options);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return Object.freeze({
      version: RELEASE_SWITCH_STATE_VERSION,
      generation: 1,
      current: normalizedActive({
        webPath: currentWeb,
        apiPath: currentApi,
        slot: "legacy",
        port: options.legacyPort,
        unit: options.legacyServiceUnit,
      }, options),
      previous: null,
      updatedAt: 0,
    });
  }
}

function inactiveSlot(activeSlot) {
  return activeSlot === "blue" ? "green" : "blue";
}

function slotPort(slot, options) {
  return slot === "blue" ? options.bluePort : options.greenPort;
}

function publicTarget(targetWeb, targetApi, state, options) {
  const apiChanges = targetApi !== state.current.apiPath;
  const slot = apiChanges ? inactiveSlot(state.current.slot) : state.current.slot;
  return Object.freeze({
    webPath: targetWeb,
    apiPath: targetApi,
    webReleaseId: releaseIdFromPath(options.webRoot, targetWeb),
    apiReleaseId: releaseIdFromPath(options.apiRoot, targetApi),
    slot,
    port: apiChanges ? slotPort(slot, options) : state.current.port,
    unit: apiChanges ? options.activeServiceUnit : state.current.unit,
  });
}

function parsePreviousReleaseText(text, options) {
  const [webPath, apiPath] = text.split(/\r?\n/).filter(Boolean);
  if (!webPath || !apiPath) throw new Error("previous release pointer is incomplete");
  const resolvedWeb = path.resolve(webPath);
  const resolvedApi = path.resolve(apiPath);
  releaseIdFromPath(options.webRoot, resolvedWeb);
  releaseIdFromPath(options.apiRoot, resolvedApi);
  return { webPath: resolvedWeb, apiPath: resolvedApi };
}

async function resolveTarget(options, state, input) {
  if (input.rollbackLast) {
    if (state.previous) return { webPath: state.previous.webPath, apiPath: state.previous.apiPath };
    try {
      return parsePreviousReleaseText(await readFile(options.previousStateFile, "utf8"), options);
    } catch (error) {
      if (error?.code === "ENOENT") throw new Error(`no previous release state exists at ${options.previousStateFile}`);
      throw error;
    }
  }
  if (!input.webRelease && !input.apiRelease) throw new Error("at least one release target is required");
  const webPath = input.webRelease
    ? path.join(options.webRoot, "releases", releaseId(input.webRelease, "web release"))
    : state.current.webPath;
  const apiPath = input.apiRelease
    ? path.join(options.apiRoot, "releases", releaseId(input.apiRelease, "API release"))
    : state.current.apiPath;
  return { webPath: path.resolve(webPath), apiPath: path.resolve(apiPath) };
}

async function archiveReleaseAssets(release, options) {
  const sourceRoot = path.join(release, "assets");
  if (!await pathExists(sourceRoot)) return;
  await mkdir(options.sharedAssetsRoot, { recursive: true, mode: 0o755 });
  const stack = [sourceRoot];
  while (stack.length > 0) {
    const directory = stack.pop();
    const children = await readdir(directory, { withFileTypes: true });
    for (const child of children) {
      const source = path.join(directory, child.name);
      const relative = path.relative(sourceRoot, source);
      const destination = path.join(options.sharedAssetsRoot, relative);
      if (child.isDirectory()) {
        await mkdir(destination, { recursive: true, mode: 0o755 });
        stack.push(source);
      } else if (child.isFile()) {
        await mkdir(path.dirname(destination), { recursive: true, mode: 0o755 });
        if (!await pathExists(destination)) await copyFile(source, destination, fsConstants.COPYFILE_EXCL);
        const now = new Date();
        await utimes(destination, now, now);
      }
    }
  }
}

async function pruneSharedAssets(options, now = Date.now()) {
  if (!await pathExists(options.sharedAssetsRoot)) return;
  const cutoff = now - options.sharedAssetRetentionDays * 24 * 60 * 60 * 1_000;
  const directories = [];
  const stack = [options.sharedAssetsRoot];
  while (stack.length > 0) {
    const directory = stack.pop();
    directories.push(directory);
    for (const child of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, child.name);
      if (child.isDirectory()) stack.push(target);
      else if (child.isFile() && (await stat(target)).mtimeMs < cutoff) await unlink(target);
    }
  }
  for (const directory of directories.reverse()) {
    if (directory === options.sharedAssetsRoot) continue;
    if ((await readdir(directory)).length === 0) await rm(directory, { recursive: false });
  }
}

async function appendAudit(options, event, details = {}) {
  const safeDetails = Object.fromEntries(Object.entries(details).filter(([, value]) => (
    typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null
  )));
  await mkdir(path.dirname(options.auditFile), { recursive: true, mode: 0o750 });
  await appendFile(options.auditFile, `${JSON.stringify({
    version: RELEASE_SWITCH_STATE_VERSION,
    event,
    at: Date.now(),
    ...safeDetails,
  })}\n`, { encoding: "utf8", mode: 0o640 });
}

export function createReleaseSwitchOptions(environment = process.env) {
  const webRoot = path.resolve(environment.DSP_WEB_ROOT || "/var/www/dsp-idle");
  const apiRoot = path.resolve(environment.DSP_API_ROOT || "/opt/dsp-idle-cloud");
  const stateRoot = path.resolve(environment.DSP_RELEASE_STATE_ROOT || "/var/lib/dsp-idle-cloud/release-state");
  const runtimeRoot = path.resolve(environment.DSP_RELEASE_RUNTIME_ROOT || "/run/dsp-idle-cloud");
  const preflightRoot = path.resolve(environment.DSP_RELEASE_PREFLIGHT_ROOT || "/var/lib/dsp-idle-cloud/release-preflight");
  return Object.freeze({
    webRoot,
    apiRoot,
    stateRoot,
    runtimeRoot,
    preflightRoot,
    preflightInlineCopyLimitBytes: integer(
      environment.DSP_RELEASE_PREFLIGHT_INLINE_COPY_LIMIT_BYTES,
      512 * MIB_BYTES,
      MIB_BYTES,
      4 * 1024 * MIB_BYTES,
      "preflight inline copy limit",
    ),
    preflightCopyBytesPerSecond: integer(
      environment.DSP_RELEASE_PREFLIGHT_COPY_BYTES_PER_SECOND,
      32 * MIB_BYTES,
      MIB_BYTES,
      512 * MIB_BYTES,
      "preflight copy rate",
    ),
    sharedAssetsRoot: path.resolve(environment.DSP_SHARED_ASSETS_ROOT || path.join(webRoot, "shared", "assets")),
    sharedAssetRetentionDays: integer(environment.DSP_SHARED_ASSET_RETENTION_DAYS, 30, 0, 3_650, "shared asset retention days"),
    switchStateFile: path.join(stateRoot, "switch-state.json"),
    previousStateFile: path.join(stateRoot, "previous-release"),
    proxyStateFile: path.resolve(environment.DSP_API_PROXY_STATE_FILE || path.join(stateRoot, "api-proxy.json")),
    proxyStatusFile: path.resolve(environment.DSP_API_PROXY_STATUS_FILE || path.join(runtimeRoot, "api-proxy-status.json")),
    auditFile: path.join(stateRoot, "switch-audit.ndjson"),
    // The handoff journal must outlive every participating systemd unit. It is
    // deliberately not stored in RuntimeDirectory (/run).
    activeStartFile: path.resolve(environment.DSP_RELEASE_ACTIVE_START_FILE || path.join(stateRoot, "pending-switch.json")),
    preflightEnvironmentFile: path.join(runtimeRoot, "preflight.env"),
    databaseFile: path.resolve(environment.DSP_CLOUD_DATABASE_FILE || "/var/lib/dsp-idle-cloud/cloud.sqlite"),
    dataFile: path.resolve(environment.DSP_CLOUD_DATA_FILE || "/var/lib/dsp-idle-cloud/cloud.json"),
    backupDirectory: path.resolve(environment.DSP_CLOUD_BACKUP_DIRECTORY || "/var/lib/dsp-idle-cloud/backups"),
    legacyPort: integer(environment.DSP_LEGACY_API_PORT, 4320, 1, 65_535, "legacy API port"),
    bluePort: integer(environment.DSP_BLUE_API_PORT, 4321, 1, 65_535, "blue API port"),
    greenPort: integer(environment.DSP_GREEN_API_PORT, 4322, 1, 65_535, "green API port"),
    proxyPort: integer(environment.DSP_API_PROXY_PORT, 4330, 1, 65_535, "API proxy port"),
    preflightPort: integer(environment.DSP_PREFLIGHT_API_PORT, 4390, 1, 65_535, "preflight API port"),
    proxyUnit: environment.DSP_PROXY_SERVICE_NAME || "dsp-idle-api-handoff-proxy.service",
    preflightUnit: environment.DSP_PREFLIGHT_SERVICE_NAME || "dsp-idle-api-preflight.service",
    activeServiceUnit: environment.DSP_ACTIVE_SERVICE_NAME || "dsp-idle-api-active.service",
    legacyServiceUnit: environment.DSP_LEGACY_SERVICE_NAME || "dsp-idle-cloud.service",
    readinessTimeoutMs: integer(environment.DSP_RELEASE_READINESS_TIMEOUT_MS, 180_000, 1_000, 10 * 60_000, "readiness timeout"),
    drainTimeoutMs: integer(environment.DSP_RELEASE_DRAIN_TIMEOUT_MS, 85_000, 1_000, 10 * 60_000, "drain timeout"),
    proxyTimeoutMs: integer(environment.DSP_RELEASE_PROXY_TIMEOUT_MS, 10_000, 1_000, 60_000, "proxy timeout"),
    writerLockTimeoutMs: integer(environment.DSP_RELEASE_WRITER_LOCK_TIMEOUT_MS, 10_000, 1_000, 60_000, "writer lock timeout"),
    backupEvidenceMaximumAgeMs: integer(
      environment.DSP_RELEASE_BACKUP_EVIDENCE_MAX_AGE_MS,
      DEFAULT_BACKUP_EVIDENCE_MAX_AGE_MS,
      60_000,
      7 * 24 * 60 * 60 * 1_000,
      "backup evidence maximum age",
    ),
    expectedSchemaVersion: integer(environment.DSP_EXPECTED_CLOUD_SCHEMA_VERSION, 7, 1, 1_000, "expected cloud schema"),
    expectedStorageLayoutVersion: integer(environment.DSP_EXPECTED_SQLITE_LAYOUT_VERSION, 2, 1, 1_000, "expected SQLite layout"),
    writerLockFile: path.resolve(environment.DSP_API_WRITER_LOCK_FILE || path.join(runtimeRoot, "writer.lock")),
    serviceUser: serviceAccount(environment.DSP_SERVICE_USER || "ubuntu", "service user"),
    serviceGroup: serviceAccount(environment.DSP_SERVICE_GROUP || "ubuntu", "service group"),
  });
}

export class SystemReleaseRuntime {
  constructor(options, { logger = console } = {}) {
    this.options = options;
    this.logger = logger;
  }

  async command(file, args, options = {}) {
    return execFileAsync(file, args, {
      windowsHide: true,
      timeout: options.timeout ?? 120_000,
      maxBuffer: options.maxBuffer ?? 4 * 1024 * 1024,
      env: options.env ?? process.env,
    });
  }

  async startService(unit) {
    await this.command("systemctl", ["reset-failed", unit]).catch(() => undefined);
    await this.command("systemctl", ["start", unit]);
  }

  async enableService(unit) {
    await this.command("systemctl", ["enable", unit]);
  }

  async disableService(unit) {
    await this.command("systemctl", ["disable", unit]);
  }

  async stopService(unit) {
    await this.command("systemctl", ["stop", unit], { timeout: 90_000 });
  }

  async nginxTest() {
    await this.command("nginx", ["-t"]);
  }

  async reloadNginx() {
    await this.command("systemctl", ["reload", "nginx"]);
  }

  async sleep(milliseconds) {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async waitForJson(url, predicate, timeoutMs, label) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(1_000) });
        const value = await response.json();
        if (predicate(response, value)) return value;
        lastError = new Error(`${label} returned HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
      }
      await this.sleep(50);
    }
    throw new Error(`${label} timed out${lastError?.message ? `: ${lastError.message}` : ""}`);
  }

  async waitReady(port, timeoutMs, label = "API readiness") {
    return this.waitForJson(
      `http://127.0.0.1:${port}/api/ready`,
      (response, value) => response.status === 200 && value?.writable === true && value?.shuttingDown === false,
      timeoutMs,
      label,
    );
  }

  async waitServiceReady(active, timeoutMs, label = "API service") {
    const startedAt = Date.now();
    const health = await this.waitHealth(active.port, timeoutMs, `${label} health`);
    const remainingMs = Math.max(1_000, timeoutMs - (Date.now() - startedAt));
    try {
      const response = await fetch(`http://127.0.0.1:${active.port}/api/ready`, {
        cache: "no-store",
        signal: AbortSignal.timeout(Math.min(1_000, remainingMs)),
      });
      let value = null;
      try { value = await response.json(); } catch { value = null; }
      if (response.status === 404) {
        return { ...health, writable: true, legacyHealthFallback: true };
      }
      if (response.status === 200 && value?.writable === true && value?.shuttingDown === false) return value;
    } catch {
      // Health is already authoritative for process availability. A transient
      // readiness request now receives only the remaining bounded budget.
    }
    return this.waitReady(active.port, remainingMs, `${label} readiness`);
  }

  async waitHealth(port, timeoutMs, label = "API health") {
    return this.waitForJson(
      `http://127.0.0.1:${port}/api/health`,
      (response, value) => response.status === 200 && value?.ok === true && value?.storage === "sqlite",
      timeoutMs,
      label,
    );
  }

  async waitProxy(expected, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
      try {
        const status = await readApiProxyStatus(this.options.proxyStatusFile);
        if (status.listening === true
          && status.generation >= expected.generation
          && status.mode === expected.mode
          && status.upstream?.port === expected.upstream.port) return status;
      } catch (error) {
        lastError = error;
      }
      await this.sleep(25);
    }
    throw new Error(`handoff proxy did not apply generation ${expected.generation}${lastError?.message ? `: ${lastError.message}` : ""}`);
  }

  async waitProxyIdle({ writersOnly }, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const status = await readApiProxyStatus(this.options.proxyStatusFile);
      if (writersOnly ? status.activeWriterRequests === 0 : status.activeRequests === 0) return status;
      await this.sleep(25);
    }
    throw new Error(writersOnly ? "active writer drain timed out" : "active request drain timed out");
  }

  async writerLockAvailable(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        await this.command("flock", ["--nonblock", this.options.writerLockFile, "true"], { timeout: 2_000 });
        return;
      } catch {
        await this.sleep(50);
      }
    }
    throw new Error("single-writer lock remained held after the active API stopped");
  }

  async ensureWriterLockFile() {
    await mkdir(this.options.runtimeRoot, { recursive: true, mode: 0o750 });
    await this.command("chown", ["--", `${this.options.serviceUser}:${this.options.serviceGroup}`, this.options.runtimeRoot]);
    await chmod(this.options.runtimeRoot, 0o750);
    if (!withinRoot(this.options.runtimeRoot, this.options.writerLockFile)) {
      throw new Error("writer lock file must remain inside the managed runtime root");
    }
    if (!await pathExists(this.options.writerLockFile)) {
      const handle = await open(this.options.writerLockFile, "wx", 0o660);
      await handle.close();
    }
    const metadata = await lstat(this.options.writerLockFile);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("writer lock path must be a regular non-symlink file");
    await this.command("chown", ["--", `${this.options.serviceUser}:${this.options.serviceGroup}`, this.options.writerLockFile]);
    await chmod(this.options.writerLockFile, 0o660);
    const [user, group] = await Promise.all([
      this.command("id", ["-u", this.options.serviceUser]),
      this.command("getent", ["group", this.options.serviceGroup]),
    ]);
    const expectedGroup = Number(String(group.stdout).trim().split(":")[2]);
    const verified = await stat(this.options.writerLockFile);
    if (!Number.isSafeInteger(expectedGroup)
      || verified.uid !== Number(String(user.stdout).trim()) || verified.gid !== expectedGroup
      || (verified.mode & 0o777) !== 0o660) {
      throw new Error("writer lock ownership or permissions do not match the configured service account");
    }
  }

  async ensureReleaseStateAccess() {
    await mkdir(this.options.stateRoot, { recursive: true, mode: 0o2750 });
    await this.command("chown", ["--", `root:${this.options.serviceGroup}`, this.options.stateRoot]);
    await chmod(this.options.stateRoot, 0o2750);
    for (const file of [
      this.options.switchStateFile,
      this.options.previousStateFile,
      this.options.proxyStateFile,
      this.options.auditFile,
      this.options.activeStartFile,
    ]) {
      if (!await pathExists(file)) continue;
      const metadata = await lstat(file);
      if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw new Error(`release control state must be a regular non-symlink file: ${file}`);
      }
      await this.command("chown", ["--", `root:${this.options.serviceGroup}`, file]);
      await chmod(file, 0o640);
    }
    const group = await this.command("getent", ["group", this.options.serviceGroup]);
    const expectedGroup = Number(String(group.stdout).trim().split(":")[2]);
    const verified = await stat(this.options.stateRoot);
    if (!verified.isDirectory() || !Number.isSafeInteger(expectedGroup)
      || verified.uid !== 0 || verified.gid !== expectedGroup
      || (verified.mode & 0o2777) !== 0o2750) {
      throw new Error("release state directory ownership or permissions do not allow durable service recovery");
    }
  }

  async boundedCopy(source, destination, evidence) {
    const sourceBefore = await stat(source);
    const sourceHandle = await open(source, "r");
    let destinationHandle;
    const digest = createHash("sha256");
    const chunk = Buffer.allocUnsafe(MIB_BYTES);
    let copied = 0;
    const startedAt = Date.now();
    try {
      destinationHandle = await open(destination, "wx", 0o660);
      while (true) {
        const { bytesRead } = await sourceHandle.read(chunk, 0, chunk.byteLength, null);
        if (bytesRead < 1) break;
        const bytes = chunk.subarray(0, bytesRead);
        let written = 0;
        while (written < bytes.byteLength) {
          const result = await destinationHandle.write(bytes, written, bytes.byteLength - written, null);
          if (result.bytesWritten < 1) throw new Error("bounded preflight copy made no write progress");
          written += result.bytesWritten;
        }
        digest.update(bytes);
        copied += bytesRead;
        const expectedElapsedMs = copied / this.options.preflightCopyBytesPerSecond * 1_000;
        const delayMs = Math.ceil(expectedElapsedMs - (Date.now() - startedAt));
        if (delayMs > 0) await this.sleep(Math.min(delayMs, 1_000));
      }
      await destinationHandle.sync();
    } catch (error) {
      await rm(destination, { force: true }).catch(() => undefined);
      throw error;
    } finally {
      await sourceHandle.close();
      await destinationHandle?.close().catch(() => undefined);
    }
    const sourceAfter = await stat(source);
    if (sourceBefore.size !== sourceAfter.size || sourceBefore.mtimeMs !== sourceAfter.mtimeMs
      || sourceBefore.dev !== sourceAfter.dev || sourceBefore.ino !== sourceAfter.ino) {
      await rm(destination, { force: true }).catch(() => undefined);
      throw new Error("verified backup changed during bounded preflight copy");
    }
    if (copied !== evidence.bytes || digest.digest("hex") !== evidence.sha256) {
      await rm(destination, { force: true }).catch(() => undefined);
      throw new Error("bounded preflight copy failed byte or SHA-256 verification");
    }
  }

  async reflinkClone(source, destination) {
    await copyFile(source, destination, fsConstants.COPYFILE_FICLONE_FORCE | fsConstants.COPYFILE_EXCL);
  }

  async preparePreflight(evidence, target, preparedEvidence = null) {
    await mkdir(this.options.preflightRoot, { recursive: true, mode: 0o750 });
    await this.command("chown", ["--", `${this.options.serviceUser}:${this.options.serviceGroup}`, this.options.preflightRoot]);
    const databaseFile = path.join(this.options.preflightRoot, `candidate-${target.apiReleaseId}-${Date.now()}-${randomUUID()}.sqlite`);
    if (!withinRoot(this.options.preflightRoot, databaseFile)) throw new Error("preflight database path escaped the configured root");
    try {
      if (preparedEvidence) {
        if (!withinRoot(this.options.preflightRoot, preparedEvidence.databasePath)) {
          throw new Error("prepared preflight database is outside the configured preflight root");
        }
        await rename(preparedEvidence.databasePath, databaseFile);
        const moved = await stat(databaseFile);
        if (String(moved.dev) !== preparedEvidence.device || String(moved.ino) !== preparedEvidence.inode
          || moved.size !== preparedEvidence.bytes || moved.mtimeMs !== preparedEvidence.mtimeMs) {
          throw new Error("prepared preflight database identity changed during atomic adoption");
        }
      } else {
        try {
          await this.reflinkClone(evidence.databasePath, databaseFile);
        } catch (error) {
          if (!["ENOSYS", "ENOTSUP", "EINVAL", "EXDEV", "EOPNOTSUPP", "ENOTTY"].includes(error?.code)) throw error;
          await rm(databaseFile, { force: true }).catch(() => undefined);
          if (evidence.bytes > this.options.preflightInlineCopyLimitBytes) {
            throw new Error(`verified backup is ${evidence.bytes} bytes and reflink is unavailable; create a separately verified --preflight-evidence outside the release handoff window`);
          }
          await this.boundedCopy(evidence.databasePath, databaseFile, evidence);
        }
        // FICLONE_FORCE either creates a copy-on-write clone of the already
        // verified immutable backup or fails. The bounded fallback verifies
        // SHA-256 while copying. Do not re-read a multi-gigabyte clone during
        // the release handoff window.
      }
      await atomicText(this.options.preflightEnvironmentFile, [
        `DSP_API_RELEASE_DIR=${target.apiPath}`,
        "HOST=127.0.0.1",
        `PORT=${this.options.preflightPort}`,
        `DSP_CLOUD_DATABASE_FILE=${databaseFile}`,
        "DSP_CLOUD_DATA_FILE=",
        "DSP_CLOUD_BACKUP_DIRECTORY=",
        "DSP_CLOUD_BACKUP_INTERVAL_MS=0",
        "DSP_CLOUD_PRUNE_INTERVAL_MS=0",
        "DSP_API_PREFLIGHT=1",
        "",
      ].join("\n"), 0o644);
      await chmod(databaseFile, 0o660);
      await this.command("chown", ["--", `${this.options.serviceUser}:${this.options.serviceGroup}`, databaseFile]);
      return { databaseFile };
    } catch (error) {
      for (const suffix of ["", "-wal", "-shm"]) await rm(`${databaseFile}${suffix}`, { force: true }).catch(() => undefined);
      await rm(this.options.preflightEnvironmentFile, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async cleanupPreflight(preflight) {
    if (!preflight?.databaseFile || !withinRoot(this.options.preflightRoot, preflight.databaseFile)) {
      throw new Error("refusing to clean an unexpected preflight database path");
    }
    for (const suffix of ["", "-wal", "-shm"]) await rm(`${preflight.databaseFile}${suffix}`, { force: true });
    await rm(this.options.preflightEnvironmentFile, { force: true });
  }

}

function proxyState(generation, mode, active) {
  return {
    version: API_PROXY_STATE_VERSION,
    generation,
    mode,
    changedAt: Date.now(),
    upstream: {
      host: "127.0.0.1",
      port: active.port,
      slot: active.slot,
      releaseId: active.apiReleaseId,
    },
  };
}

async function setProxyMode(options, runtime, currentProxyState, mode, active) {
  const next = await writeApiProxyState(options.proxyStateFile, proxyState(currentProxyState.generation + 1, mode, active));
  await runtime.waitProxy(next, options.proxyTimeoutMs);
  return next;
}

function injectFault(input, phase) {
  if (input.fault === phase) throw new Error(`injected release switch fault: ${phase}`);
}

async function ensureProxy(options, runtime, state, input, interruptedPending = null) {
  let currentProxyState;
  try {
    currentProxyState = await readApiProxyState(options.proxyStateFile);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    currentProxyState = await writeApiProxyState(options.proxyStateFile, proxyState(1, "forward", state.current));
  }
  await runtime.startService(options.proxyUnit);
  await runtime.enableService(options.proxyUnit);
  await runtime.waitProxy(currentProxyState, options.proxyTimeoutMs);
  const proxyMatchesCurrent = currentProxyState.mode === "forward"
    && currentProxyState.upstream.port === state.current.port
    && currentProxyState.upstream.releaseId === state.current.apiReleaseId;
  if (interruptedPending || !proxyMatchesCurrent) {
    currentProxyState = await setProxyMode(options, runtime, currentProxyState, "hold", state.current);
    await runtime.waitProxyIdle({ writersOnly: false }, options.drainTimeoutMs);
    let selectedWriterWasStopped = false;
    if (interruptedPending) {
      const unitsToStop = new Set();
      if (!activeMatches(interruptedPending.target.current, state.current)) {
        unitsToStop.add(interruptedPending.target.current.unit);
      }
      if (interruptedPending.base.current.unit !== state.current.unit) {
        unitsToStop.add(interruptedPending.base.current.unit);
      }
      for (const unit of unitsToStop) {
        await runtime.stopService(unit);
        if (unit === state.current.unit) selectedWriterWasStopped = true;
      }
      if (selectedWriterWasStopped) {
        await runtime.ensureWriterLockFile();
        await runtime.writerLockAvailable(options.writerLockTimeoutMs);
      }
    }
    await atomicLink(state.current.webPath, path.join(options.webRoot, "current"));
    await atomicLink(state.current.apiPath, path.join(options.apiRoot, "current"));
    await atomicText(options.switchStateFile, `${JSON.stringify(state, null, 2)}\n`, 0o640);
    await runtime.startService(state.current.unit);
    await runtime.waitServiceReady(state.current, options.readinessTimeoutMs, "interrupted switch recovery");
    currentProxyState = await setProxyMode(options, runtime, currentProxyState, "forward", state.current);
    await rm(options.activeStartFile, { force: true });
    await appendAudit(options, "release_switch_recovered", {
      api: state.current.apiReleaseId,
      slot: state.current.slot,
      interrupted: Boolean(interruptedPending),
    });
  }
  injectFault(input, "nginx-test");
  await runtime.nginxTest();
  injectFault(input, "nginx-reload");
  await runtime.reloadNginx();
  return currentProxyState;
}

async function verifyEvidence(options, input) {
  if (!input.backupEvidence) throw new Error("an API switch requires --backup-evidence from a verified pre-release SQLite snapshot");
  const evidence = await verifyReleaseBackupEvidence({
    evidenceFile: input.backupEvidence,
    maximumAgeMs: options.backupEvidenceMaximumAgeMs,
    rehash: false,
  });
  if (evidence.device === undefined || evidence.inode === undefined) {
    throw new Error("release backup evidence must bind device and inode identity; regenerate evidence without replacing the backup");
  }
  if (evidence.schemaVersion !== options.expectedSchemaVersion) {
    throw new Error(`backup schema v${evidence.schemaVersion} does not match required v${options.expectedSchemaVersion}`);
  }
  if (evidence.storageLayoutVersion !== options.expectedStorageLayoutVersion) {
    throw new Error(`backup SQLite layout v${evidence.storageLayoutVersion} does not match required v${options.expectedStorageLayoutVersion}`);
  }
  return evidence;
}

async function verifyPreparedPreflightEvidence(options, input, backupEvidence) {
  if (!input.preflightEvidence) return null;
  const prepared = await verifyReleaseBackupEvidence({
    evidenceFile: input.preflightEvidence,
    maximumAgeMs: options.backupEvidenceMaximumAgeMs,
    rehash: false,
  });
  if (prepared.device === undefined || prepared.inode === undefined) {
    throw new Error("prepared preflight evidence must bind device and inode identity");
  }
  if (prepared.databasePath === backupEvidence.databasePath
    || (prepared.device === backupEvidence.device && prepared.inode === backupEvidence.inode)) {
    throw new Error("prepared preflight database must be an independent file, not the authoritative backup");
  }
  if (prepared.bytes !== backupEvidence.bytes || prepared.sha256 !== backupEvidence.sha256
    || prepared.schemaVersion !== backupEvidence.schemaVersion
    || prepared.storageLayoutVersion !== backupEvidence.storageLayoutVersion) {
    throw new Error("prepared preflight evidence does not match the verified release backup");
  }
  if (!withinRoot(options.preflightRoot, prepared.databasePath)) {
    throw new Error("prepared preflight database must be staged under the configured preflight root");
  }
  return prepared;
}

async function preflightCandidate(options, runtime, target, evidence, preparedEvidence, input) {
  const preflight = await runtime.preparePreflight(evidence, target, preparedEvidence);
  let startAttempted = false;
  try {
    injectFault(input, "preflight-start");
    startAttempted = true;
    await runtime.startService(options.preflightUnit);
    injectFault(input, "preflight-readiness-timeout");
    const [health] = await Promise.all([
      runtime.waitHealth(options.preflightPort, options.readinessTimeoutMs, "candidate preflight health"),
      runtime.waitReady(options.preflightPort, options.readinessTimeoutMs, "candidate preflight readiness"),
    ]);
    if (health.schemaVersion !== options.expectedSchemaVersion || health.storageLayoutVersion !== options.expectedStorageLayoutVersion) {
      throw new Error("candidate preflight returned an unexpected schema or SQLite layout");
    }
  } finally {
    if (startAttempted) await runtime.stopService(options.preflightUnit);
    await runtime.cleanupPreflight(preflight);
  }
}

async function publishState(options, state, target) {
  await atomicText(options.previousStateFile, `${state.current.webPath}\n${state.current.apiPath}\n`, 0o640);
  await atomicLink(target.webPath, path.join(options.webRoot, "current"));
  await atomicLink(target.apiPath, path.join(options.apiRoot, "current"));
  const nextState = nextSwitchState(state, target, options);
  await atomicText(options.switchStateFile, `${JSON.stringify(nextState, null, 2)}\n`, 0o640);
  return nextState;
}

export async function runReleaseSwitch({
  options = createReleaseSwitchOptions(),
  runtime = new SystemReleaseRuntime(options),
  input,
} = {}) {
  if (!input || typeof input !== "object") throw new Error("release switch input is required");
  if (input.fault && input.enableFaultInjection !== true) throw new Error("fault injection requires explicit test-only enablement");
  const currentWeb = await realpath(path.join(options.webRoot, "current"));
  const currentApi = await realpath(path.join(options.apiRoot, "current"));
  const switchStateExisted = await pathExists(options.switchStateFile);
  const existingState = await readExistingSwitchState(options, currentWeb, currentApi);
  const reconciled = await reconcileInterruptedSwitch(options, existingState, currentWeb, currentApi, {
    switchStateExisted,
    persistRecovery: false,
  });
  const state = reconciled.state;
  let interruptedPending = reconciled.pending;
  const resolved = await resolveTarget(options, state, input);
  for (const [label, target] of [["web", resolved.webPath], ["API", resolved.apiPath]]) {
    const metadata = await stat(target);
    if (!metadata.isDirectory()) throw new Error(`${label} release is not a directory: ${target}`);
  }
  const target = publicTarget(resolved.webPath, resolved.apiPath, state, options);
  const apiChanges = target.apiPath !== state.current.apiPath;
  const webChanges = target.webPath !== state.current.webPath;
  const plan = Object.freeze({
    noOp: !apiChanges && !webChanges,
    apiChanges,
    webChanges,
    current: state.current,
    target,
  });
  if (plan.noOp && !interruptedPending) return { plan, state, dryRun: input.dryRun === true, noOp: true };
  if (plan.noOp && interruptedPending) {
    if (input.dryRun) return { plan, state, dryRun: true, noOp: false, recoveryRequired: true };
    await runtime.ensureReleaseStateAccess();
    if (reconciled.pendingNeedsPersistence) {
      interruptedPending = await writePendingSwitchState(options, interruptedPending);
    }
    await ensureProxy(options, runtime, state, input, interruptedPending);
    return { plan, state, dryRun: false, noOp: true, recovered: true };
  }

  const evidence = apiChanges ? await verifyEvidence(options, input) : null;
  const preparedEvidence = apiChanges ? await verifyPreparedPreflightEvidence(options, input, evidence) : null;
  if (input.dryRun) return { plan, state, dryRun: true, noOp: false, evidence, preparedEvidence };
  await runtime.ensureReleaseStateAccess();
  if (reconciled.pendingNeedsPersistence) {
    interruptedPending = await writePendingSwitchState(options, interruptedPending);
  }
  await appendAudit(options, "release_switch_started", {
    fromApi: state.current.apiReleaseId,
    toApi: target.apiReleaseId,
    fromWeb: state.current.webReleaseId,
    toWeb: target.webReleaseId,
    rollback: input.rollbackLast === true,
  });
  await archiveReleaseAssets(state.current.webPath, options);
  await archiveReleaseAssets(target.webPath, options);
  await pruneSharedAssets(options);

  let currentProxyState = null;
  let proxyEnteredDrain = false;
  let oldStopAttempted = false;
  let newStartAttempted = false;
  let publishAttempted = false;
  let pending = null;
  let interruptedRecoveryCompleted = false;
  try {
    currentProxyState = await ensureProxy(options, runtime, state, input, interruptedPending);
    interruptedRecoveryCompleted = true;
    if (apiChanges) await preflightCandidate(options, runtime, target, evidence, preparedEvidence, input);
    if (apiChanges) {
      currentProxyState = await setProxyMode(options, runtime, currentProxyState, "drain", state.current);
      proxyEnteredDrain = true;
      await runtime.waitProxyIdle({ writersOnly: true }, options.drainTimeoutMs);
      currentProxyState = await setProxyMode(options, runtime, currentProxyState, "hold", state.current);
      await runtime.waitProxyIdle({ writersOnly: false }, options.drainTimeoutMs);
      injectFault(input, "after-hold");
      const targetState = nextSwitchState(state, target, options);
      pending = await writePendingSwitchState(options, {
        pendingVersion: RELEASE_PENDING_STATE_VERSION,
        phase: "prepared",
        base: state,
        target: targetState,
        updatedAt: Date.now(),
      });
      injectFault(input, "after-pending");
      oldStopAttempted = true;
      await runtime.stopService(state.current.unit);
      injectFault(input, "sqlite-lock");
      await runtime.ensureWriterLockFile();
      await runtime.writerLockAvailable(options.writerLockTimeoutMs);
      injectFault(input, "new-start");
      newStartAttempted = true;
      await runtime.startService(target.unit);
      injectFault(input, "new-readiness-timeout");
      await runtime.waitReady(target.port, options.readinessTimeoutMs, "new production API readiness");
    }
    publishAttempted = true;
    if (pending) pending = await writePendingSwitchState(options, pending, "publishing");
    const nextState = await publishState(options, state, target);
    if (pending) pending = await writePendingSwitchState(options, pending, "published");
    if (apiChanges) {
      currentProxyState = await setProxyMode(options, runtime, currentProxyState, "forward", target);
      injectFault(input, "proxy-switch");
      await runtime.enableService(target.unit);
      if (state.current.unit !== target.unit) {
        await runtime.disableService(state.current.unit);
      }
      if (!interruptedPending || interruptedRecoveryCompleted || pending) {
        await rm(options.activeStartFile, { force: true });
      }
    }
    injectFault(input, "after-publish");
    await appendAudit(options, "release_switch_completed", {
      api: target.apiReleaseId,
      web: target.webReleaseId,
      slot: target.slot,
      generation: nextState.generation,
    });
    return { plan, state: nextState, dryRun: false, noOp: false };
  } catch (error) {
    await appendAudit(options, "release_switch_failed", {
      fromApi: state.current.apiReleaseId,
      toApi: target.apiReleaseId,
      phase: oldStopAttempted ? "writer_handoff" : proxyEnteredDrain ? "drain" : "preflight",
      errorCategory: String(error?.message ?? "error").startsWith("injected") ? "fault_injection" : "runtime_failure",
    }).catch(() => undefined);
    let recoveryError = null;
    try {
      const recoveredState = oldStopAttempted ? recoverySwitchState(state, options) : state;
      if (oldStopAttempted && pending) {
        pending = await writePendingSwitchState(options, pending, "recovering");
      }
      if (currentProxyState && proxyEnteredDrain) {
        currentProxyState = await setProxyMode(options, runtime, currentProxyState, "hold", state.current);
        await runtime.waitProxyIdle({ writersOnly: false }, options.drainTimeoutMs);
      }
      if (newStartAttempted) await runtime.stopService(target.unit);
      if (oldStopAttempted) {
        // systemctl can report an error after its stop side effect, or before
        // the service actually stops. Repeat the stop before moving the old
        // release onto the active unit so recovery can never run two writers.
        if (state.current.unit !== options.activeServiceUnit) {
          await runtime.stopService(state.current.unit);
        }
        await runtime.enableService(options.activeServiceUnit);
        if (state.current.unit !== options.activeServiceUnit) await runtime.disableService(state.current.unit);
      }
      if (publishAttempted || oldStopAttempted) {
        await atomicLink(recoveredState.current.webPath, path.join(options.webRoot, "current"));
        await atomicLink(recoveredState.current.apiPath, path.join(options.apiRoot, "current"));
        await atomicText(options.switchStateFile, `${JSON.stringify(recoveredState, null, 2)}\n`, 0o640);
      }
      if (oldStopAttempted) {
        await runtime.startService(options.activeServiceUnit);
        await runtime.waitServiceReady(recoveredState.current, options.readinessTimeoutMs, "rollback API");
      }
      if (currentProxyState && proxyEnteredDrain) {
        await setProxyMode(options, runtime, currentProxyState, "forward", recoveredState.current);
      }
      if (!interruptedPending || interruptedRecoveryCompleted || pending) {
        await rm(options.activeStartFile, { force: true });
      }
    } catch (candidate) {
      recoveryError = candidate;
    }
    if (recoveryError) {
      throw new AggregateError([error, recoveryError], `release switch failed and the previous writer did not complete verified recovery: ${recoveryError.message ?? recoveryError}`);
    }
    throw error;
  }
}

export function parseReleaseSwitchArguments(values, environment = process.env) {
  const input = {
    webRelease: null,
    apiRelease: null,
    rollbackLast: false,
    backupEvidence: null,
    preflightEvidence: null,
    dryRun: false,
    fault: null,
    enableFaultInjection: environment.DSP_ENABLE_RELEASE_FAULT_INJECTION === "1",
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const next = () => {
      const candidate = values[index + 1];
      if (!candidate || candidate.startsWith("--")) throw new Error(`${value} requires a value`);
      index += 1;
      return candidate;
    };
    if (value === "--web-release") input.webRelease = next();
    else if (value === "--api-release") input.apiRelease = next();
    else if (value === "--backup-evidence") input.backupEvidence = next();
    else if (value === "--preflight-evidence") input.preflightEvidence = next();
    else if (value === "--fault") input.fault = next();
    else if (value === "--rollback-last") input.rollbackLast = true;
    else if (value === "--dry-run") input.dryRun = true;
    else if (value === "--help" || value === "-h") input.help = true;
    else throw new Error(`unknown release switch argument: ${value}`);
  }
  if (input.rollbackLast && (input.webRelease || input.apiRelease)) throw new Error("--rollback-last cannot be combined with explicit release targets");
  return input;
}

export function releaseSwitchUsage() {
  return `Usage:\n  dsp-idle-switch-release --web-release <id> --api-release <id> --backup-evidence <file> [--preflight-evidence <file>] [--dry-run]\n  dsp-idle-switch-release --rollback-last --backup-evidence <file> [--preflight-evidence <file>] [--dry-run]\n\nBackups larger than the inline-copy limit require an independently verified, disposable preflight copy. The verified backup remains immutable. Code rollback never restores the production database.`;
}

function directInvocation() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (directInvocation()) {
  try {
    const input = parseReleaseSwitchArguments(process.argv.slice(2));
    if (input.help) {
      console.log(releaseSwitchUsage());
    } else {
      const result = await runReleaseSwitch({ input });
      console.log(JSON.stringify({
        dryRun: result.dryRun,
        noOp: result.noOp,
        web: result.plan.target.webReleaseId,
        api: result.plan.target.apiReleaseId,
        slot: result.plan.target.slot,
        rollback: "dsp-idle-switch-release --rollback-last --backup-evidence <verified-evidence-file>",
      }));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
