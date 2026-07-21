import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promises as fs, realpathSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const scrypt = promisify(scryptCallback);
const BODY_LIMIT_BYTES = 8 * 1024 * 1024;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CLOUD_HISTORY_LIMIT = 20;
const DEFAULT_PLAYER_ONLINE_WINDOW_MS = 120_000;
const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{16,96}$/;
const VALID_CATEGORIES = new Set(["power", "upload", "dyson", "throughput", "galaxy"]);
const VALID_SEASONS = new Set(["season_01", "season_00"]);
const METRIC_KEYS = [
  "energyGeneratedMj",
  "uploadedWhiteMatrix",
  "peakGenerationKw",
  "peakThroughputPerMinute",
  "peakDysonPowerKw",
  "exploredSystems",
  "colonizedPlanets",
];
const DEFAULT_DATA = {
  schemaVersion: 3,
  users: {},
  sessions: {},
  cloudSaves: {},
  cloudSaveHistory: {},
  submissions: {},
  players: {},
  feedback: [],
  errors: [],
  dailyMetrics: {},
};

function cloneDefaultData() {
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function normalizePlayerRecords(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).flatMap(([playerHash, record]) => {
    if (!/^[a-f0-9]{64}$/.test(playerHash) || !record || typeof record !== "object") return [];
    const firstSeenAt = Number.isFinite(record.firstSeenAt) ? Math.max(0, Math.floor(record.firstSeenAt)) : 0;
    const lastSeenAt = Number.isFinite(record.lastSeenAt) ? Math.max(firstSeenAt, Math.floor(record.lastSeenAt)) : firstSeenAt;
    const lastActiveDay = typeof record.lastActiveDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(record.lastActiveDay)
      ? record.lastActiveDay
      : metricDay(lastSeenAt);
    return [[playerHash, { firstSeenAt, lastSeenAt, lastActiveDay }]];
  }));
}

function normalizeStoredData(parsed) {
  const source = parsed && typeof parsed === "object" ? parsed : {};
  const data = {
    ...cloneDefaultData(),
    ...source,
    schemaVersion: DEFAULT_DATA.schemaVersion,
    users: source.users && typeof source.users === "object" ? source.users : {},
    sessions: source.sessions && typeof source.sessions === "object" ? source.sessions : {},
    cloudSaves: source.cloudSaves && typeof source.cloudSaves === "object" ? source.cloudSaves : {},
    cloudSaveHistory: source.cloudSaveHistory && typeof source.cloudSaveHistory === "object" ? source.cloudSaveHistory : {},
    submissions: source.submissions && typeof source.submissions === "object" ? source.submissions : {},
    players: normalizePlayerRecords(source.players),
    feedback: Array.isArray(source.feedback) ? source.feedback.slice(-1000) : [],
    errors: Array.isArray(source.errors) ? source.errors.slice(-1000) : [],
    dailyMetrics: source.dailyMetrics && typeof source.dailyMetrics === "object" ? source.dailyMetrics : {},
  };
  for (const [userId, save] of Object.entries(data.cloudSaves)) {
    const history = Array.isArray(data.cloudSaveHistory[userId]) ? data.cloudSaveHistory[userId] : [];
    if (save && !history.some((entry) => entry.revision === save.revision)) history.push(save);
    data.cloudSaveHistory[userId] = history.sort((left, right) => left.revision - right.revision).slice(-CLOUD_HISTORY_LIMIT);
  }
  return data;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

function normalizedName(value) {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ").slice(0, 24);
  return name.length >= 2 ? name : null;
}

function publicUser(user) {
  return { id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt };
}

function normalizeMetric(value, integer = false, maximum = 1e15) {
  const number = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const normalized = Math.max(0, Math.min(maximum, number));
  return integer ? Math.floor(normalized) : Math.round(normalized * 100) / 100;
}

function normalizeMetrics(value) {
  const source = value && typeof value === "object" ? value : {};
  const metrics = {
    energyGeneratedMj: normalizeMetric(source.energyGeneratedMj),
    uploadedWhiteMatrix: normalizeMetric(source.uploadedWhiteMatrix, true),
    peakGenerationKw: normalizeMetric(source.peakGenerationKw),
    peakThroughputPerMinute: normalizeMetric(source.peakThroughputPerMinute),
    peakDysonPowerKw: normalizeMetric(source.peakDysonPowerKw),
    exploredSystems: normalizeMetric(source.exploredSystems, true, 10_000),
    colonizedPlanets: normalizeMetric(source.colonizedPlanets, true, 100_000),
  };
  metrics.galaxyScore = Math.round(
    metrics.energyGeneratedMj / 1_000_000 +
    metrics.uploadedWhiteMatrix * 12 +
    metrics.peakDysonPowerKw / 100 +
    metrics.peakThroughputPerMinute * 8 +
    metrics.exploredSystems * 10_000 +
    metrics.colonizedPlanets * 2_000,
  );
  return metrics;
}

function categoryValue(metrics, category) {
  if (category === "power") return metrics.energyGeneratedMj;
  if (category === "upload") return metrics.uploadedWhiteMatrix;
  if (category === "dyson") return metrics.peakDysonPowerKw;
  if (category === "throughput") return metrics.peakThroughputPerMinute;
  return metrics.galaxyScore;
}

class JsonStore {
  constructor(file) {
    this.file = file;
    this.data = cloneDefaultData();
    this.writeQueue = Promise.resolve();
  }

  async load() {
    try {
      const parsed = JSON.parse(await fs.readFile(this.file, "utf8"));
      this.data = normalizeStoredData(parsed);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await this.persist();
    }
  }

  persist() {
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const temporary = `${this.file}.${process.pid}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(this.data), { mode: 0o600 });
      await fs.rename(temporary, this.file);
    });
    return this.writeQueue;
  }

  async backup(destination) {
    await this.writeQueue;
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(this.file, destination);
  }
}

class SqliteStore {
  constructor(file) {
    this.file = file;
    this.data = cloneDefaultData();
    this.database = null;
    this.writeQueue = Promise.resolve();
  }

  async load() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    this.database = new Database(this.file);
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("synchronous = NORMAL");
    this.database.exec("CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL, updated_at INTEGER NOT NULL)");
    const row = this.database.prepare("SELECT payload FROM app_state WHERE id = 1").get();
    if (row?.payload) this.data = normalizeStoredData(JSON.parse(row.payload));
    else await this.persist();
  }

  persist() {
    const payload = JSON.stringify(this.data);
    this.writeQueue = this.writeQueue.then(() => {
      this.database.prepare("INSERT INTO app_state (id, payload, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at").run(payload, Date.now());
    });
    return this.writeQueue;
  }

  async backup(destination) {
    await this.writeQueue;
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await this.database.backup(destination);
  }

  close() {
    this.database?.close();
  }
}

function createRateLimiter() {
  const buckets = new Map();
  return (key, maximum, windowMs) => {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= maximum;
  };
}

function requestIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  return (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : request.socket.remoteAddress) || "unknown";
}

function send(response, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    ...extraHeaders,
  });
  response.end(body);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > BODY_LIMIT_BYTES) {
      const error = new Error("请求内容超过 8 MB");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("JSON 格式无效");
    error.statusCode = 400;
    throw error;
  }
}

async function passwordRecord(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return { passwordSalt: salt, passwordHash: Buffer.from(derived).toString("hex") };
}

async function passwordMatches(password, user) {
  const derived = Buffer.from(await scrypt(password, user.passwordSalt, 64));
  const expected = Buffer.from(user.passwordHash, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

function issueSession(store, userId) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = sha256(token);
  store.data.sessions[tokenHash] = { userId, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS };
  return token;
}

function authenticatedUser(request, store) {
  const authorization = request.headers.authorization;
  const token = typeof authorization === "string" && authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return null;
  const tokenHash = sha256(token);
  const session = store.data.sessions[tokenHash];
  if (!session || session.expiresAt <= Date.now()) {
    if (session) delete store.data.sessions[tokenHash];
    return null;
  }
  const user = store.data.users[session.userId];
  return user ? { user, tokenHash } : null;
}

function cloudSaveMetadata(save) {
  return save ? {
    revision: save.revision,
    updatedAt: save.updatedAt,
    size: save.size,
    checksum: save.checksum,
    ...(Number.isInteger(save.restoredFromRevision) ? { restoredFromRevision: save.restoredFromRevision } : {}),
  } : null;
}

function validateSavePayload(payload) {
  if (typeof payload !== "string" || payload.length < 10 || Buffer.byteLength(payload) > BODY_LIMIT_BYTES - 1024) return false;
  try {
    const parsed = JSON.parse(payload);
    const state = parsed?.state ?? parsed;
    return Boolean(state && typeof state === "object" && Array.isArray(state.entities) && typeof state.version === "number");
  } catch {
    return false;
  }
}

function parseSaveState(payload) {
  try {
    const parsed = JSON.parse(payload);
    return parsed?.state ?? parsed;
  } catch {
    return null;
  }
}

function numberAt(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function metricsSupportedBySave(save) {
  const state = parseSaveState(save?.payload);
  if (!state || typeof state !== "object") return null;
  const generationKw = numberAt(state.metrics?.generationKw);
  const elapsedSeconds = numberAt(state.elapsedSeconds);
  const producedWhiteMatrix = Math.floor(numberAt(state.totalProduced?.universe_matrix));
  const exploredSystems = Array.isArray(state.exploration?.unlockedSystemIds) ? new Set(state.exploration.unlockedSystemIds).size : 1;
  const colonizedPlanets = Array.isArray(state.exploration?.colonizedPlanetIds) ? new Set(state.exploration.colonizedPlanetIds).size : 1;
  const dysonPowerKw = Math.max(numberAt(state.dysonSphere?.generationKw), numberAt(state.metrics?.rayGenerationKw));
  const throughput = numberAt(state.metrics?.totalItemsPerMinute);
  return {
    energyGeneratedMj: generationKw * elapsedSeconds / 1000 * 1.25 + 1000,
    uploadedWhiteMatrix: producedWhiteMatrix,
    peakGenerationKw: generationKw * 1.25 + 1,
    peakThroughputPerMinute: throughput * 1.25 + 1,
    peakDysonPowerKw: dysonPowerKw * 1.25 + 1,
    exploredSystems,
    colonizedPlanets,
  };
}

function verifyLeaderboardMetrics(submitted, save, previous) {
  const supported = metricsSupportedBySave(save);
  if (!supported) return { ok: false, error: "云存档无法用于成绩校验" };
  const previousMetrics = previous?.metrics ?? {};
  const violations = METRIC_KEYS.filter((key) => {
    const prior = numberAt(previousMetrics[key]);
    return submitted[key] > Math.max(prior, numberAt(supported[key]));
  });
  if (violations.length > 0) return { ok: false, error: `成绩超过云存档可验证范围：${violations.join(", ")}` };
  return { ok: true, metrics: submitted, supported };
}

function saveHistory(store, userId) {
  return Array.isArray(store.data.cloudSaveHistory[userId]) ? store.data.cloudSaveHistory[userId] : [];
}

function appendSaveRevision(store, userId, save) {
  const history = [...saveHistory(store, userId).filter((entry) => entry.revision !== save.revision), save]
    .sort((left, right) => left.revision - right.revision)
    .slice(-CLOUD_HISTORY_LIMIT);
  store.data.cloudSaveHistory[userId] = history;
  store.data.cloudSaves[userId] = save;
}

function metricDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

function normalizedPlayerId(value) {
  return typeof value === "string" && PLAYER_ID_PATTERN.test(value) ? value : null;
}

function playerMetrics(data, onlineWindowMs, now = Date.now()) {
  const records = Object.values(data.players);
  const onlineSince = now - onlineWindowMs;
  const today = metricDay(now);
  return {
    total: records.length,
    today: records.filter((record) => record.lastActiveDay === today).length,
    online: records.filter((record) => Number.isFinite(record.lastSeenAt) && record.lastSeenAt >= onlineSince).length,
    onlineWindowSeconds: Math.floor(onlineWindowMs / 1000),
  };
}

export async function createCloudServer({
  dataFile = process.env.DSP_CLOUD_DATA_FILE || "",
  databaseFile = process.env.DSP_CLOUD_DATABASE_FILE || (dataFile ? "" : path.join(path.dirname(fileURLToPath(import.meta.url)), "data", "cloud.sqlite")),
  backupDirectory = process.env.DSP_CLOUD_BACKUP_DIRECTORY || "",
  backupIntervalMs = Number(process.env.DSP_CLOUD_BACKUP_INTERVAL_MS || 6 * 60 * 60 * 1000),
  allowedOrigin = process.env.DSP_ALLOWED_ORIGIN || "",
  playerOnlineWindowMs = Number(process.env.DSP_PLAYER_ONLINE_WINDOW_MS || DEFAULT_PLAYER_ONLINE_WINDOW_MS),
  logger = console,
} = {}) {
  const store = databaseFile ? new SqliteStore(databaseFile) : new JsonStore(dataFile || path.join(path.dirname(fileURLToPath(import.meta.url)), "data", "cloud.json"));
  await store.load();
  if (databaseFile && dataFile && Object.keys(store.data.users).length === 0) {
    try {
      const legacy = normalizeStoredData(JSON.parse(await fs.readFile(dataFile, "utf8")));
      if (Object.keys(legacy.users).length > 0 || Object.keys(legacy.cloudSaves).length > 0 || legacy.feedback.length > 0 || legacy.errors.length > 0) {
        store.data = legacy;
        await store.persist();
      }
    } catch (error) {
      if (error?.code !== "ENOENT") logger.error?.("legacy cloud data migration failed", error);
    }
  }
  const startedAt = Date.now();
  const rateLimit = createRateLimiter();
  const runtime = { requests: 0, errors: 0 };
  const onlineWindowMs = Number.isFinite(playerOnlineWindowMs)
    ? Math.max(50, Math.floor(playerOnlineWindowMs))
    : DEFAULT_PLAYER_ONLINE_WINDOW_MS;
  const allowedOrigins = new Set(allowedOrigin.split(",").map((origin) => origin.trim()).filter(Boolean));

  const flushMetrics = setInterval(() => void store.persist().catch((error) => logger.error?.("cloud metrics persistence failed", error)), 60_000);
  flushMetrics.unref?.();
  const createBackup = async () => {
    const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
    const extension = databaseFile ? ".sqlite" : ".json";
    await store.backup(path.join(backupDirectory, `cloud-${stamp}${extension}`));
    const files = (await fs.readdir(backupDirectory)).filter((file) => file.startsWith("cloud-") && file.endsWith(extension)).sort().reverse();
    await Promise.all(files.slice(30).map((file) => fs.unlink(path.join(backupDirectory, file))));
  };
  const backupTimer = backupDirectory && Number.isFinite(backupIntervalMs) && backupIntervalMs >= 60_000
    ? setInterval(() => void createBackup().catch((error) => logger.error?.("cloud backup failed", error)), backupIntervalMs)
    : null;
  backupTimer?.unref?.();
  if (backupDirectory) void createBackup().catch((error) => logger.error?.("initial cloud backup failed", error));

  const server = http.createServer(async (request, response) => {
    runtime.requests += 1;
    const day = metricDay();
    const dayMetric = store.data.dailyMetrics[day] ?? { requests: 0, errors: 0, feedback: 0, leaderboardSubmissions: 0, cloudUploads: 0, players: 0 };
    if (!Number.isFinite(dayMetric.players)) dayMetric.players = 0;
    dayMetric.requests += 1;
    store.data.dailyMetrics[day] = dayMetric;
    const origin = request.headers.origin;
    if (origin && allowedOrigins.has(origin)) response.setHeader("access-control-allow-origin", origin);
    if (origin && allowedOrigins.size > 0 && !allowedOrigins.has(origin)) return send(response, 403, { error: "来源未获授权" });
    response.setHeader("access-control-allow-headers", "authorization, content-type");
    response.setHeader("access-control-allow-methods", "GET, POST, PUT, OPTIONS");
    if (request.method === "OPTIONS") return send(response, 204, {});

    const url = new URL(request.url || "/", "http://localhost");
    const ip = requestIp(request);
    const routeKey = `${ip}:${request.method}:${url.pathname}`;
    const routeLimit = url.pathname.startsWith("/api/auth/") ? 12 : url.pathname === "/api/presence" ? 10 : 120;
    if (!rateLimit(routeKey, routeLimit, 60_000)) {
      return send(response, 429, { error: "请求过于频繁，请稍后再试" }, { "retry-after": "60" });
    }

    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        return send(response, 200, { ok: true, service: "dsp-idle-cloud", schemaVersion: DEFAULT_DATA.schemaVersion, storage: databaseFile ? "sqlite" : "json", uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000), time: Date.now() });
      }
      if (request.method === "GET" && url.pathname === "/api/metrics") {
        return send(response, 200, {
          uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
          requests: runtime.requests,
          errors: runtime.errors,
          users: Object.keys(store.data.users).length,
          cloudSaves: Object.keys(store.data.cloudSaves).length,
          submissions: Object.keys(store.data.submissions).length,
          players: playerMetrics(store.data, onlineWindowMs),
          daily: store.data.dailyMetrics,
          storage: databaseFile ? "sqlite" : "json",
        });
      }

      if (request.method === "POST" && url.pathname === "/api/presence") {
        const body = await readJson(request);
        const playerId = normalizedPlayerId(body.playerId);
        if (!playerId) return send(response, 400, { error: "匿名玩家标识格式无效" });
        const now = Date.now();
        const activeDay = metricDay(now);
        const playerHash = sha256(`player:${playerId}`);
        let player = store.data.players[playerHash];
        let persistRequired = false;
        if (!player) {
          player = { firstSeenAt: now, lastSeenAt: now, lastActiveDay: activeDay };
          store.data.players[playerHash] = player;
          dayMetric.players += 1;
          persistRequired = true;
        } else {
          player.lastSeenAt = now;
          if (player.lastActiveDay !== activeDay) {
            player.lastActiveDay = activeDay;
            dayMetric.players += 1;
            persistRequired = true;
          }
        }
        if (persistRequired) await store.persist();
        return send(response, 202, { accepted: true, players: playerMetrics(store.data, onlineWindowMs, now) });
      }

      if (request.method === "POST" && url.pathname === "/api/auth/register") {
        const body = await readJson(request);
        const email = normalizedEmail(body.email);
        const displayName = normalizedName(body.displayName);
        const password = typeof body.password === "string" ? body.password : "";
        if (!email || !displayName || password.length < 8 || password.length > 128) return send(response, 400, { error: "邮箱、名称或密码格式无效（密码至少 8 位）" });
        if (Object.values(store.data.users).some((user) => user.email === email)) return send(response, 409, { error: "该邮箱已注册" });
        const credentials = await passwordRecord(password);
        if (Object.values(store.data.users).some((user) => user.email === email)) return send(response, 409, { error: "该邮箱已注册" });
        const user = { id: `user_${randomUUID().replaceAll("-", "")}`, email, displayName, createdAt: Date.now(), ...credentials };
        store.data.users[user.id] = user;
        const token = issueSession(store, user.id);
        await store.persist();
        return send(response, 201, { token, user: publicUser(user) });
      }

      if (request.method === "POST" && url.pathname === "/api/auth/login") {
        const body = await readJson(request);
        const email = normalizedEmail(body.email);
        const password = typeof body.password === "string" ? body.password : "";
        const user = email ? Object.values(store.data.users).find((candidate) => candidate.email === email) : null;
        if (!user || !(await passwordMatches(password, user))) return send(response, 401, { error: "邮箱或密码错误" });
        const token = issueSession(store, user.id);
        await store.persist();
        return send(response, 200, { token, user: publicUser(user) });
      }

      if (request.method === "GET" && url.pathname === "/api/account") {
        const auth = authenticatedUser(request, store);
        return auth ? send(response, 200, { user: publicUser(auth.user), cloudSave: cloudSaveMetadata(store.data.cloudSaves[auth.user.id]) }) : send(response, 401, { error: "登录已过期" });
      }

      if (request.method === "POST" && url.pathname === "/api/auth/logout") {
        const auth = authenticatedUser(request, store);
        if (auth) {
          delete store.data.sessions[auth.tokenHash];
          await store.persist();
        }
        return send(response, 200, { ok: true });
      }

      if (request.method === "GET" && url.pathname === "/api/cloud-save/history") {
        const auth = authenticatedUser(request, store);
        if (!auth) return send(response, 401, { error: "请先登录" });
        const history = [...saveHistory(store, auth.user.id)].reverse().map(cloudSaveMetadata);
        return send(response, 200, { history });
      }

      if (request.method === "GET" && url.pathname === "/api/cloud-save") {
        const auth = authenticatedUser(request, store);
        if (!auth) return send(response, 401, { error: "请先登录" });
        const requestedRevision = Number(url.searchParams.get("revision"));
        const save = Number.isInteger(requestedRevision) && requestedRevision > 0
          ? saveHistory(store, auth.user.id).find((entry) => entry.revision === requestedRevision)
          : store.data.cloudSaves[auth.user.id];
        return send(response, 200, { cloudSave: save ? { ...cloudSaveMetadata(save), payload: save.payload } : null });
      }

      if (request.method === "PUT" && url.pathname === "/api/cloud-save") {
        const auth = authenticatedUser(request, store);
        if (!auth) return send(response, 401, { error: "请先登录" });
        const body = await readJson(request);
        if (!validateSavePayload(body.payload)) return send(response, 400, { error: "云存档格式无效或体积过大" });
        const current = store.data.cloudSaves[auth.user.id];
        const expectedRevision = Number.isInteger(body.expectedRevision) ? body.expectedRevision : 0;
        if ((current?.revision ?? 0) !== expectedRevision) return send(response, 409, { error: "云端已有更新版本，请先下载或确认覆盖", cloudSave: cloudSaveMetadata(current) });
        const next = {
          revision: (current?.revision ?? 0) + 1,
          payload: body.payload,
          checksum: sha256(body.payload),
          size: Buffer.byteLength(body.payload),
          updatedAt: Date.now(),
        };
        appendSaveRevision(store, auth.user.id, next);
        dayMetric.cloudUploads += 1;
        await store.persist();
        return send(response, 200, { cloudSave: cloudSaveMetadata(next) });
      }

      if (request.method === "POST" && url.pathname === "/api/cloud-save/restore") {
        const auth = authenticatedUser(request, store);
        if (!auth) return send(response, 401, { error: "请先登录" });
        const body = await readJson(request);
        const current = store.data.cloudSaves[auth.user.id];
        const expectedRevision = Number.isInteger(body.expectedRevision) ? body.expectedRevision : 0;
        if ((current?.revision ?? 0) !== expectedRevision) return send(response, 409, { error: "云端已有更新版本，请刷新历史记录", cloudSave: cloudSaveMetadata(current) });
        const sourceRevision = Number(body.revision);
        const source = saveHistory(store, auth.user.id).find((entry) => entry.revision === sourceRevision);
        if (!source) return send(response, 404, { error: "历史修订不存在或已过期" });
        const restored = {
          ...source,
          revision: (current?.revision ?? 0) + 1,
          updatedAt: Date.now(),
          restoredFromRevision: sourceRevision,
        };
        appendSaveRevision(store, auth.user.id, restored);
        dayMetric.cloudUploads += 1;
        await store.persist();
        return send(response, 200, { cloudSave: cloudSaveMetadata(restored) });
      }

      if (request.method === "GET" && url.pathname === "/api/leaderboard") {
        const category = VALID_CATEGORIES.has(url.searchParams.get("category")) ? url.searchParams.get("category") : "galaxy";
        const seasonId = VALID_SEASONS.has(url.searchParams.get("seasonId")) ? url.searchParams.get("seasonId") : "season_01";
        const entries = Object.values(store.data.submissions)
          .filter((entry) => entry.seasonId === seasonId)
          .map((entry) => ({ ...entry, value: categoryValue(entry.metrics, category), verified: Boolean(entry.verification?.cloudRevision) }))
          .sort((left, right) => right.value - left.value || left.userId.localeCompare(right.userId))
          .slice(0, 100)
          .map((entry, index) => ({ ...entry, rank: index + 1 }));
        return send(response, 200, { category, seasonId, entries, generatedAt: Date.now() });
      }

      if (request.method === "POST" && url.pathname === "/api/leaderboard") {
        const auth = authenticatedUser(request, store);
        if (!auth) return send(response, 401, { error: "请先登录" });
        const body = await readJson(request);
        const seasonId = VALID_SEASONS.has(body.seasonId) ? body.seasonId : "season_01";
        if (seasonId !== "season_01") return send(response, 409, { error: "历史赛季已封存" });
        const metrics = normalizeMetrics(body.metrics);
        if (!METRIC_KEYS.some((key) => metrics[key] > 0)) return send(response, 400, { error: "没有可上传的工业数据" });
        const key = `${seasonId}:${auth.user.id}`;
        const previous = store.data.submissions[key];
        const cloudSave = store.data.cloudSaves[auth.user.id];
        if (!cloudSave) return send(response, 409, { error: "请先上传当前云存档，再提交排行榜成绩" });
        const verification = verifyLeaderboardMetrics(metrics, cloudSave, previous);
        if (!verification.ok) return send(response, 422, { error: verification.error });
        const merged = previous ? normalizeMetrics(Object.fromEntries(METRIC_KEYS.map((metric) => [metric, Math.max(previous.metrics[metric] ?? 0, metrics[metric] ?? 0)]))) : metrics;
        store.data.submissions[key] = {
          userId: auth.user.id,
          accountId: auth.user.id,
          displayName: auth.user.displayName,
          avatar: auth.user.displayName.slice(0, 1).toUpperCase(),
          seasonId,
          metrics: merged,
          submittedAt: Date.now(),
          verification: { cloudRevision: cloudSave.revision, checksum: cloudSave.checksum, checkedAt: Date.now() },
        };
        dayMetric.leaderboardSubmissions += 1;
        await store.persist();
        return send(response, 200, { submission: store.data.submissions[key], verified: true });
      }

      if (request.method === "POST" && (url.pathname === "/api/feedback" || url.pathname === "/api/errors")) {
        const body = await readJson(request);
        const auth = authenticatedUser(request, store);
        const record = {
          id: randomUUID(),
          userId: auth?.user.id ?? null,
          kind: typeof body.kind === "string" ? body.kind.slice(0, 40) : url.pathname === "/api/errors" ? "client-error" : "feedback",
          message: typeof body.message === "string" ? body.message.slice(0, 4000) : "",
          diagnostics: body.diagnostics && typeof body.diagnostics === "object" ? body.diagnostics : null,
          receivedAt: Date.now(),
          ipHash: sha256(ip).slice(0, 16),
        };
        const collection = url.pathname === "/api/errors" ? store.data.errors : store.data.feedback;
        collection.push(record);
        if (collection.length > 1000) collection.splice(0, collection.length - 1000);
        if (url.pathname === "/api/feedback") dayMetric.feedback += 1;
        await store.persist();
        return send(response, 202, { id: record.id, accepted: true });
      }

      return send(response, 404, { error: "接口不存在" });
    } catch (error) {
      runtime.errors += 1;
      dayMetric.errors += 1;
      logger.error?.("cloud request failed", error);
      return send(response, error?.statusCode || 500, { error: error?.statusCode ? error.message : "服务暂时不可用" });
    }
  });

  server.store = store;
  server.on("close", () => {
    clearInterval(flushMetrics);
    if (backupTimer) clearInterval(backupTimer);
    store.close?.();
  });
  return server;
}

async function startFromCli() {
  const port = Number(process.env.PORT || 4320);
  const host = process.env.HOST || "127.0.0.1";
  const server = await createCloudServer();
  server.listen(port, host, () => console.log(`DSP cloud service listening on http://${host}:${port}`));
}

function isDirectInvocation() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  }
}

if (isDirectInvocation()) {
  void startFromCli();
}
