import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promises as fs, realpathSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import {
  DEFAULT_METRIC_TIME_ZONE,
  analyticsSummary,
  metricDay,
  normalizeAnalyticsState,
  recordAnalyticsBatch,
} from "./analytics.mjs";
import { createTencentSesMailer, createWebhookMailer } from "./mail.mjs";

const scrypt = promisify(scryptCallback);
const BODY_LIMIT_BYTES = 8 * 1024 * 1024;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CLOUD_HISTORY_LIMIT = 20;
const CLOUD_SAVE_SLOTS = ["main", "1", "2", "3"];
const MANUAL_CLOUD_SAVE_SLOTS = CLOUD_SAVE_SLOTS.slice(1);
const EMAIL_ACTION_TTL_MS = 30 * 60 * 1000;
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
  schemaVersion: 6,
  users: {},
  sessions: {},
  emailVerifications: {},
  passwordResets: {},
  auditLog: [],
  cloudSaves: {},
  cloudSaveHistory: {},
  cloudSaveSlots: {},
  cloudSaveSlotHistory: {},
  submissions: {},
  players: {},
  feedback: [],
  errors: [],
  dailyMetrics: {},
  analytics: { visitors: {}, sessions: {}, daily: {} },
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

function normalizeUserRecords(value, sourceSchemaVersion) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, record]) => {
    if (!record || typeof record !== "object") return [];
    const id = typeof record.id === "string" && record.id ? record.id : key;
    if (!id) return [];
    const createdAt = Number.isFinite(record.createdAt) ? Math.max(0, Math.floor(record.createdAt)) : 0;
    const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
    const emailVerifiedAt = !email
      ? null
      : sourceSchemaVersion < 5
        ? createdAt
        : Number.isFinite(record.emailVerifiedAt) ? Math.max(0, Math.floor(record.emailVerifiedAt)) : null;
    return [[id, {
      ...record,
      id,
      email,
      displayName: typeof record.displayName === "string" ? record.displayName : "星际工程师",
      createdAt,
      emailVerifiedAt,
      passwordChangedAt: Number.isFinite(record.passwordChangedAt) ? Math.max(createdAt, Math.floor(record.passwordChangedAt)) : createdAt,
    }]];
  }));
}

function normalizeSessionRecords(value, users) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).flatMap(([tokenHash, record]) => {
    if (!/^[a-f0-9]{64}$/.test(tokenHash) || !record || typeof record !== "object" || !users[record.userId]) return [];
    const createdAt = Number.isFinite(record.createdAt) ? Math.max(0, Math.floor(record.createdAt)) : 0;
    const expiresAt = Number.isFinite(record.expiresAt) ? Math.max(createdAt, Math.floor(record.expiresAt)) : createdAt;
    return [[tokenHash, {
      id: typeof record.id === "string" && /^session_[A-Za-z0-9_-]{16,80}$/.test(record.id)
        ? record.id
        : `session_${tokenHash.slice(0, 24)}`,
      userId: record.userId,
      createdAt,
      lastSeenAt: Number.isFinite(record.lastSeenAt) ? Math.max(createdAt, Math.floor(record.lastSeenAt)) : createdAt,
      expiresAt,
      deviceName: typeof record.deviceName === "string" ? record.deviceName.slice(0, 80) : "未知设备",
      clientType: typeof record.clientType === "string" ? record.clientType.slice(0, 32) : "unknown",
      ipHash: typeof record.ipHash === "string" && /^[a-f0-9]{16}$/.test(record.ipHash) ? record.ipHash : null,
    }]];
  }));
}

function normalizeActionTokens(value, users) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).flatMap(([tokenHash, record]) => (
    /^[a-f0-9]{64}$/.test(tokenHash) && record && typeof record === "object" && users[record.userId] && Number.isFinite(record.expiresAt)
      ? [[tokenHash, { userId: record.userId, createdAt: Math.max(0, Math.floor(record.createdAt ?? 0)), expiresAt: Math.max(0, Math.floor(record.expiresAt)) }]]
      : []
  )));
}

function summarizeSavePayload(payload) {
  if (typeof payload !== "string") return null;
  try {
    const parsed = JSON.parse(payload);
    const state = parsed?.state ?? parsed;
    if (!state || typeof state !== "object" || !Array.isArray(state.entities)) return null;
    return {
      stateVersion: Number.isFinite(state.version) ? Math.max(0, Math.floor(state.version)) : 0,
      savedAt: Number.isFinite(parsed?.savedAt) ? Math.max(0, Math.floor(parsed.savedAt)) : 0,
      elapsedSeconds: Number.isFinite(state.elapsedSeconds) ? Math.max(0, Math.floor(state.elapsedSeconds)) : 0,
      activePlanetId: typeof state.activePlanetId === "string" ? state.activePlanetId.slice(0, 80) : "home",
      entityCount: state.entities.length,
      completedTechCount: Array.isArray(state.research?.completedTechIds) ? state.research.completedTechIds.length : 0,
      structurePoints: Number.isFinite(state.dysonSphere?.structurePoints) ? Math.max(0, Math.floor(state.dysonSphere.structurePoints)) : 0,
      uploadedWhiteMatrix: Number.isFinite(state.totalProduced?.universe_matrix) ? Math.max(0, Math.floor(state.totalProduced.universe_matrix)) : 0,
      stateChecksum: typeof parsed?.checksum === "string" ? parsed.checksum.slice(0, 128) : null,
    };
  } catch {
    return null;
  }
}

function normalizeSaveRecord(save) {
  if (!save || typeof save !== "object") return save;
  return { ...save, summary: summarizeSavePayload(save.payload) };
}

function normalizeManualSaveSlots(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).flatMap(([userId, slots]) => {
    if (!slots || typeof slots !== "object") return [];
    const normalized = Object.fromEntries(MANUAL_CLOUD_SAVE_SLOTS.flatMap((slot) =>
      slots[slot] && typeof slots[slot] === "object" ? [[slot, normalizeSaveRecord(slots[slot])]] : []));
    return Object.keys(normalized).length > 0 ? [[userId, normalized]] : [];
  }));
}

function normalizeManualSaveSlotHistory(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).flatMap(([userId, slots]) => {
    if (!slots || typeof slots !== "object") return [];
    const normalized = Object.fromEntries(MANUAL_CLOUD_SAVE_SLOTS.flatMap((slot) =>
      Array.isArray(slots[slot]) ? [[slot, slots[slot].map(normalizeSaveRecord)]] : []));
    return Object.keys(normalized).length > 0 ? [[userId, normalized]] : [];
  }));
}

function normalizeStoredData(parsed) {
  const source = parsed && typeof parsed === "object" ? parsed : {};
  const sourceSchemaVersion = Number.isInteger(source.schemaVersion) ? source.schemaVersion : 1;
  const users = normalizeUserRecords(source.users, sourceSchemaVersion);
  const data = {
    ...cloneDefaultData(),
    ...source,
    schemaVersion: DEFAULT_DATA.schemaVersion,
    users,
    sessions: normalizeSessionRecords(source.sessions, users),
    emailVerifications: normalizeActionTokens(source.emailVerifications, users),
    passwordResets: normalizeActionTokens(source.passwordResets, users),
    auditLog: Array.isArray(source.auditLog) ? source.auditLog.slice(-2000).flatMap((entry) => (
      entry && typeof entry === "object" && typeof entry.action === "string" && Number.isFinite(entry.occurredAt)
        ? [{
            action: entry.action.slice(0, 80),
            occurredAt: Math.max(0, Math.floor(entry.occurredAt)),
            actorHash: typeof entry.actorHash === "string" ? entry.actorHash.slice(0, 16) : null,
            ipHash: typeof entry.ipHash === "string" ? entry.ipHash.slice(0, 16) : null,
            clientType: typeof entry.clientType === "string" ? entry.clientType.slice(0, 32) : "unknown",
          }]
        : []
    )) : [],
    cloudSaves: source.cloudSaves && typeof source.cloudSaves === "object"
      ? Object.fromEntries(Object.entries(source.cloudSaves).map(([userId, save]) => [userId, normalizeSaveRecord(save)]))
      : {},
    cloudSaveHistory: source.cloudSaveHistory && typeof source.cloudSaveHistory === "object"
      ? Object.fromEntries(Object.entries(source.cloudSaveHistory).map(([userId, history]) => [userId, Array.isArray(history) ? history.map(normalizeSaveRecord) : []]))
      : {},
    cloudSaveSlots: normalizeManualSaveSlots(source.cloudSaveSlots),
    cloudSaveSlotHistory: normalizeManualSaveSlotHistory(source.cloudSaveSlotHistory),
    submissions: source.submissions && typeof source.submissions === "object" ? source.submissions : {},
    players: normalizePlayerRecords(source.players),
    feedback: Array.isArray(source.feedback) ? source.feedback.slice(-1000) : [],
    errors: Array.isArray(source.errors) ? source.errors.slice(-1000) : [],
    dailyMetrics: source.dailyMetrics && typeof source.dailyMetrics === "object" ? source.dailyMetrics : {},
    analytics: normalizeAnalyticsState(source.analytics),
  };
  for (const [userId, save] of Object.entries(data.cloudSaves)) {
    const history = Array.isArray(data.cloudSaveHistory[userId]) ? data.cloudSaveHistory[userId] : [];
    if (save && !history.some((entry) => entry.revision === save.revision)) history.push(save);
    data.cloudSaveHistory[userId] = history.sort((left, right) => left.revision - right.revision).slice(-CLOUD_HISTORY_LIMIT);
  }
  for (const [userId, slots] of Object.entries(data.cloudSaveSlots)) {
    data.cloudSaveSlotHistory[userId] ??= {};
    for (const slot of MANUAL_CLOUD_SAVE_SLOTS) {
      const save = slots?.[slot];
      if (!save) continue;
      const history = Array.isArray(data.cloudSaveSlotHistory[userId][slot]) ? data.cloudSaveSlotHistory[userId][slot] : [];
      if (!history.some((entry) => entry.revision === save.revision)) history.push(save);
      data.cloudSaveSlotHistory[userId][slot] = history
        .sort((left, right) => left.revision - right.revision)
        .slice(-CLOUD_HISTORY_LIMIT);
    }
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
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
    emailVerified: Number.isFinite(user.emailVerifiedAt),
    emailVerifiedAt: Number.isFinite(user.emailVerifiedAt) ? user.emailVerifiedAt : null,
    passwordChangedAt: user.passwordChangedAt,
  };
}

function normalizedDeviceName(value, request) {
  if (typeof value === "string") {
    const name = value.trim().replace(/\s+/g, " ").slice(0, 80);
    if (name) return name;
  }
  const userAgent = typeof request?.headers?.["user-agent"] === "string" ? request.headers["user-agent"] : "";
  if (/Electron/i.test(userAgent)) return "DSP极简网络桌面版";
  if (/Android/i.test(userAgent)) return "Android 浏览器";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS 浏览器";
  if (/Mobile/i.test(userAgent)) return "移动浏览器";
  return "网页浏览器";
}

function clientTypeForRequest(request) {
  const userAgent = typeof request?.headers?.["user-agent"] === "string" ? request.headers["user-agent"] : "";
  if (/Electron/i.test(userAgent)) return "desktop";
  if (/Mobile|Android|iPhone|iPad|iPod/i.test(userAgent)) return "mobile-web";
  return "desktop-web";
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

function appendAudit(store, request, action, userId = null) {
  store.data.auditLog.push({
    action: String(action).slice(0, 80),
    occurredAt: Date.now(),
    actorHash: userId ? sha256(`audit-user:${userId}`).slice(0, 16) : null,
    ipHash: sha256(`audit-ip:${requestIp(request)}`).slice(0, 16),
    clientType: clientTypeForRequest(request),
  });
  if (store.data.auditLog.length > 2000) store.data.auditLog.splice(0, store.data.auditLog.length - 2000);
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

function issueSession(store, userId, request, deviceName) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = sha256(token);
  const now = Date.now();
  store.data.sessions[tokenHash] = {
    id: `session_${randomUUID().replaceAll("-", "")}`,
    userId,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: now + SESSION_TTL_MS,
    deviceName: normalizedDeviceName(deviceName, request),
    clientType: clientTypeForRequest(request),
    ipHash: sha256(`session-ip:${requestIp(request)}`).slice(0, 16),
  };
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
  if (!user) return null;
  session.lastSeenAt = Date.now();
  return { user, tokenHash, session };
}

function issueActionToken(collection, userId) {
  for (const [tokenHash, record] of Object.entries(collection)) {
    if (record.userId === userId || record.expiresAt <= Date.now()) delete collection[tokenHash];
  }
  const token = randomBytes(32).toString("base64url");
  collection[sha256(token)] = { userId, createdAt: Date.now(), expiresAt: Date.now() + EMAIL_ACTION_TTL_MS };
  return token;
}

function validActionToken(collection, token) {
  if (typeof token !== "string" || token.length < 32 || token.length > 256) return null;
  const tokenHash = sha256(token);
  const record = collection[tokenHash];
  if (!record || record.expiresAt <= Date.now()) {
    if (record) delete collection[tokenHash];
    return null;
  }
  return { tokenHash, record };
}

function revokeUserSessions(store, userId, exceptTokenHash = null) {
  for (const [tokenHash, session] of Object.entries(store.data.sessions)) {
    if (session.userId === userId && tokenHash !== exceptTokenHash) delete store.data.sessions[tokenHash];
  }
}

function removeUserActionTokens(store, userId) {
  for (const collection of [store.data.emailVerifications, store.data.passwordResets]) {
    for (const [tokenHash, record] of Object.entries(collection)) {
      if (record.userId === userId) delete collection[tokenHash];
    }
  }
}

function requireVerifiedUser(response, auth) {
  if (Number.isFinite(auth.user.emailVerifiedAt)) return true;
  send(response, 403, { error: "请先验证邮箱后再写入云端数据", code: "EMAIL_VERIFICATION_REQUIRED" });
  return false;
}

function publicSession(session, currentTokenHash, tokenHash) {
  return {
    id: session.id,
    deviceName: session.deviceName,
    clientType: session.clientType,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    expiresAt: session.expiresAt,
    current: tokenHash === currentTokenHash,
  };
}

function cloudSaveMetadata(save, slot = "main") {
  return save ? {
    slot,
    revision: save.revision,
    updatedAt: save.updatedAt,
    size: save.size,
    checksum: save.checksum,
    summary: save.summary ?? summarizeSavePayload(save.payload),
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

function normalizedCloudSaveSlot(value) {
  return typeof value === "string" && CLOUD_SAVE_SLOTS.includes(value) ? value : null;
}

function currentCloudSave(store, userId, slot = "main") {
  return slot === "main" ? store.data.cloudSaves[userId] : store.data.cloudSaveSlots[userId]?.[slot];
}

function saveHistory(store, userId, slot = "main") {
  if (slot === "main") return Array.isArray(store.data.cloudSaveHistory[userId]) ? store.data.cloudSaveHistory[userId] : [];
  return Array.isArray(store.data.cloudSaveSlotHistory[userId]?.[slot]) ? store.data.cloudSaveSlotHistory[userId][slot] : [];
}

function appendSaveRevision(store, userId, save, slot = "main") {
  const history = [...saveHistory(store, userId, slot).filter((entry) => entry.revision !== save.revision), save]
    .sort((left, right) => left.revision - right.revision)
    .slice(-CLOUD_HISTORY_LIMIT);
  if (slot === "main") {
    store.data.cloudSaveHistory[userId] = history;
    store.data.cloudSaves[userId] = save;
    return;
  }
  store.data.cloudSaveSlots[userId] ??= {};
  store.data.cloudSaveSlotHistory[userId] ??= {};
  store.data.cloudSaveSlots[userId][slot] = save;
  store.data.cloudSaveSlotHistory[userId][slot] = history;
}

function cloudSaveSlotMetadata(store, userId) {
  return Object.fromEntries(CLOUD_SAVE_SLOTS.map((slot) => [slot, cloudSaveMetadata(currentCloudSave(store, userId, slot), slot)]));
}

function normalizedPlayerId(value) {
  return typeof value === "string" && PLAYER_ID_PATTERN.test(value) ? value : null;
}

function playerMetrics(data, onlineWindowMs, now = Date.now(), timeZone = DEFAULT_METRIC_TIME_ZONE) {
  const records = Object.values(data.players);
  const onlineSince = now - onlineWindowMs;
  const today = metricDay(now, timeZone);
  return {
    total: records.length,
    today: records.filter((record) => record.lastActiveDay === today).length,
    online: records.filter((record) => Number.isFinite(record.lastSeenAt) && record.lastSeenAt >= onlineSince).length,
    onlineWindowSeconds: Math.floor(onlineWindowMs / 1000),
  };
}

function adminAuthorized(request, adminToken) {
  if (!adminToken) return false;
  const authorization = request.headers.authorization;
  const provided = typeof authorization === "string" && authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";
  if (!provided) return false;
  return timingSafeEqual(Buffer.from(sha256(provided), "hex"), Buffer.from(sha256(adminToken), "hex"));
}

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] * 100) / 100;
}

async function operationalStatus(file) {
  if (!file) return { configured: false, ok: false, state: "disabled" };
  try {
    const source = JSON.parse(await fs.readFile(file, "utf8"));
    return {
      configured: true,
      ok: source.ok === true,
      state: source.ok === true ? "ready" : "failed",
      completedAt: Number.isFinite(source.completedAt) ? source.completedAt : null,
      failedAt: Number.isFinite(source.failedAt) ? source.failedAt : null,
      durationMs: Number.isFinite(source.durationMs) ? source.durationMs : null,
      transported: source.transported === true,
      transport: typeof source.transport === "string" ? source.transport.slice(0, 20) : null,
      schemaVersion: Number.isInteger(source.schemaVersion ?? source.restoredSchemaVersion) ? (source.schemaVersion ?? source.restoredSchemaVersion) : null,
      artifact: typeof source.artifact === "string" ? path.basename(source.artifact).slice(0, 160) : null,
      error: typeof source.error === "string" ? source.error.slice(0, 300) : null,
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      state: error?.code === "ENOENT" ? "pending" : "unreadable",
      completedAt: null,
      failedAt: null,
      error: error?.code === "ENOENT" ? null : "状态文件无法读取",
    };
  }
}

async function nodeHealthStatus(file) {
  if (!file) return { configured: false, ok: false, state: "disabled" };
  try {
    const source = JSON.parse(await fs.readFile(file, "utf8"));
    return {
      configured: true,
      ok: source.ok === true,
      state: source.ok === true ? "ready" : "failed",
      checkedAt: Number.isFinite(source.checkedAt) ? source.checkedAt : null,
      failedChecks: Array.isArray(source.failedChecks) ? source.failedChecks.slice(0, 20).map((value) => String(value).slice(0, 160)) : [],
      endpoints: Array.isArray(source.endpoints) ? source.endpoints.slice(0, 10).map((entry) => ({
        url: typeof entry.url === "string" ? entry.url.slice(0, 240) : "",
        ok: entry.ok === true,
        status: Number.isInteger(entry.status) ? entry.status : 0,
        latencyMs: Number.isFinite(entry.latencyMs) ? entry.latencyMs : null,
        contentEncoding: typeof entry.contentEncoding === "string" ? entry.contentEncoding.slice(0, 30) : null,
      })) : [],
      disk: source.disk && typeof source.disk === "object" ? {
        ok: source.disk.ok === true,
        freeBytes: Number.isFinite(source.disk.freeBytes) ? source.disk.freeBytes : null,
        totalBytes: Number.isFinite(source.disk.totalBytes) ? source.disk.totalBytes : null,
        freeRatio: Number.isFinite(source.disk.freeRatio) ? source.disk.freeRatio : null,
      } : null,
      tls: source.tls && typeof source.tls === "object" ? {
        configured: source.tls.configured === true,
        ok: source.tls.ok === true,
        expiresAt: Number.isFinite(source.tls.expiresAt) ? source.tls.expiresAt : null,
        daysRemaining: Number.isFinite(source.tls.daysRemaining) ? source.tls.daysRemaining : null,
      } : null,
      alertSent: source.alertSent === true,
    };
  } catch (error) {
    return { configured: true, ok: false, state: error?.code === "ENOENT" ? "pending" : "unreadable", checkedAt: null, failedChecks: [] };
  }
}

export async function createCloudServer({
  dataFile = process.env.DSP_CLOUD_DATA_FILE || "",
  databaseFile = process.env.DSP_CLOUD_DATABASE_FILE || (dataFile ? "" : path.join(path.dirname(fileURLToPath(import.meta.url)), "data", "cloud.sqlite")),
  backupDirectory = process.env.DSP_CLOUD_BACKUP_DIRECTORY || "",
  backupIntervalMs = Number(process.env.DSP_CLOUD_BACKUP_INTERVAL_MS || 6 * 60 * 60 * 1000),
  allowedOrigin = process.env.DSP_ALLOWED_ORIGIN || "",
  playerOnlineWindowMs = Number(process.env.DSP_PLAYER_ONLINE_WINDOW_MS || DEFAULT_PLAYER_ONLINE_WINDOW_MS),
  metricTimeZone = process.env.DSP_METRIC_TIME_ZONE || DEFAULT_METRIC_TIME_ZONE,
  adminToken = process.env.DSP_ADMIN_TOKEN || "",
  mailer,
  mailWebhookUrl = process.env.DSP_MAIL_WEBHOOK_URL || "",
  mailWebhookToken = process.env.DSP_MAIL_WEBHOOK_TOKEN || "",
  mailTencentSecretId = process.env.DSP_MAIL_TENCENT_SECRET_ID || "",
  mailTencentSecretKey = process.env.DSP_MAIL_TENCENT_SECRET_KEY || "",
  mailTencentRegion = process.env.DSP_MAIL_TENCENT_REGION || "ap-hongkong",
  mailTencentFrom = process.env.DSP_MAIL_TENCENT_FROM || "",
  mailTencentVerificationTemplateId = process.env.DSP_MAIL_TENCENT_VERIFY_TEMPLATE_ID || "",
  mailTencentResetTemplateId = process.env.DSP_MAIL_TENCENT_RESET_TEMPLATE_ID || "",
  mailReplyTo = process.env.DSP_MAIL_REPLY_TO || "",
  publicBaseUrl = process.env.DSP_PUBLIC_BASE_URL || "",
  offsiteBackupStatusFile = process.env.DSP_OFFSITE_BACKUP_STATUS_FILE || "",
  restoreDrillStatusFile = process.env.DSP_RESTORE_DRILL_STATUS_FILE || "",
  nodeHealthStatusFile = process.env.DSP_NODE_HEALTH_STATUS_FILE || "",
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
  const runtime = {
    requests: 0,
    errors: 0,
    rateLimited: 0,
    cloudConflicts: 0,
    latencies: [],
    lastBackupAt: null,
    lastBackupErrorAt: null,
  };
  const onlineWindowMs = Number.isFinite(playerOnlineWindowMs)
    ? Math.max(50, Math.floor(playerOnlineWindowMs))
    : DEFAULT_PLAYER_ONLINE_WINDOW_MS;
  let metricsTimeZone = DEFAULT_METRIC_TIME_ZONE;
  try {
    metricDay(Date.now(), metricTimeZone);
    metricsTimeZone = metricTimeZone;
  } catch {
    logger.error?.(`invalid metric time zone ${metricTimeZone}; using ${DEFAULT_METRIC_TIME_ZONE}`);
  }
  const secureAdminToken = typeof adminToken === "string" && adminToken.length >= 32 ? adminToken : "";
  if (adminToken && !secureAdminToken) logger.error?.("DSP_ADMIN_TOKEN must contain at least 32 characters; admin metrics remain disabled");
  const allowedOrigins = new Set(allowedOrigin.split(",").map((origin) => origin.trim()).filter(Boolean));
  const tencentSesMailer = mailer === undefined ? createTencentSesMailer({
    secretId: mailTencentSecretId,
    secretKey: mailTencentSecretKey,
    region: mailTencentRegion,
    fromEmailAddress: mailTencentFrom,
    verificationTemplateId: mailTencentVerificationTemplateId,
    resetTemplateId: mailTencentResetTemplateId,
    replyToAddresses: mailReplyTo,
    publicBaseUrl,
    logger,
  }) : null;
  const webhookMailer = mailer === undefined && !tencentSesMailer
    ? createWebhookMailer({ url: mailWebhookUrl, token: mailWebhookToken, publicBaseUrl, logger })
    : null;
  const accountMailer = mailer === undefined
    ? tencentSesMailer ?? webhookMailer
    : typeof mailer === "function" ? mailer : null;
  const accountMailProvider = typeof mailer === "function"
    ? "custom"
    : tencentSesMailer ? "tencent-ses" : webhookMailer ? "webhook" : "disabled";

  const flushMetrics = setInterval(() => void store.persist().catch((error) => logger.error?.("cloud metrics persistence failed", error)), 60_000);
  flushMetrics.unref?.();
  const createBackup = async () => {
    try {
      const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
      const extension = databaseFile ? ".sqlite" : ".json";
      await store.backup(path.join(backupDirectory, `cloud-${stamp}${extension}`));
      const files = (await fs.readdir(backupDirectory)).filter((file) => file.startsWith("cloud-") && file.endsWith(extension)).sort().reverse();
      await Promise.all(files.slice(30).map((file) => fs.unlink(path.join(backupDirectory, file))));
      runtime.lastBackupAt = Date.now();
    } catch (error) {
      runtime.lastBackupErrorAt = Date.now();
      throw error;
    }
  };
  const backupTimer = backupDirectory && Number.isFinite(backupIntervalMs) && backupIntervalMs >= 60_000
    ? setInterval(() => void createBackup().catch((error) => logger.error?.("cloud backup failed", error)), backupIntervalMs)
    : null;
  backupTimer?.unref?.();
  if (backupDirectory) void createBackup().catch((error) => logger.error?.("initial cloud backup failed", error));

  const server = http.createServer(async (request, response) => {
    const requestStartedAt = performance.now();
    response.once("finish", () => {
      const durationMs = Math.max(0, performance.now() - requestStartedAt);
      runtime.latencies.push(durationMs);
      if (runtime.latencies.length > 2000) runtime.latencies.splice(0, runtime.latencies.length - 2000);
      if (response.statusCode === 429) runtime.rateLimited += 1;
    });
    runtime.requests += 1;
    const day = metricDay(Date.now(), metricsTimeZone);
    const dayMetric = store.data.dailyMetrics[day] ?? { requests: 0, errors: 0, feedback: 0, leaderboardSubmissions: 0, cloudUploads: 0, players: 0 };
    for (const key of ["requests", "errors", "feedback", "leaderboardSubmissions", "cloudUploads", "players"]) {
      if (!Number.isFinite(dayMetric[key])) dayMetric[key] = 0;
    }
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
    const routeLimit = url.pathname.startsWith("/api/auth/")
      ? 12
      : url.pathname === "/api/presence"
        ? 10
        : url.pathname === "/api/analytics"
          ? 30
          : 120;
    if (!rateLimit(routeKey, routeLimit, 60_000)) {
      return send(response, 429, { error: "请求过于频繁，请稍后再试" }, { "retry-after": "60" });
    }

    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        return send(response, 200, { ok: true, service: "dsp-idle-cloud", schemaVersion: DEFAULT_DATA.schemaVersion, storage: databaseFile ? "sqlite" : "json", mailProvider: accountMailProvider, uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000), time: Date.now() });
      }
      if (request.method === "GET" && url.pathname === "/api/public-status") {
        return send(response, 200, {
          ok: true,
          timeZone: metricsTimeZone,
          today: metricDay(Date.now(), metricsTimeZone),
          uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
          players: playerMetrics(store.data, onlineWindowMs, Date.now(), metricsTimeZone),
        });
      }
      if (request.method === "GET" && (url.pathname === "/api/metrics" || url.pathname === "/api/admin/metrics")) {
        if (!secureAdminToken) return send(response, 503, { error: "管理员监控尚未配置" });
        if (!adminAuthorized(request, secureAdminToken)) return send(response, 401, { error: "管理员凭据无效" });
        const requestedDays = Number(url.searchParams.get("days"));
        const days = Number.isInteger(requestedDays) ? Math.max(1, Math.min(365, requestedDays)) : 30;
        const now = Date.now();
        const activeSessions = Object.values(store.data.sessions).filter((session) => session.expiresAt > now).length;
        const serviceDaily = Object.entries(store.data.dailyMetrics)
          .sort(([left], [right]) => left.localeCompare(right))
          .slice(-days)
          .map(([metricDayId, metrics]) => ({ day: metricDayId, ...metrics }));
        const [offsiteBackup, restoreDrill, infrastructure] = await Promise.all([
          operationalStatus(offsiteBackupStatusFile),
          operationalStatus(restoreDrillStatusFile),
          nodeHealthStatus(nodeHealthStatusFile),
        ]);
        return send(response, 200, {
          generatedAt: now,
          timeZone: metricsTimeZone,
          schemaVersion: DEFAULT_DATA.schemaVersion,
          uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
          runtime: {
            requests: runtime.requests,
            errors: runtime.errors,
            rateLimited: runtime.rateLimited,
            cloudConflicts: runtime.cloudConflicts,
            p50LatencyMs: percentile(runtime.latencies, 0.5),
            p95LatencyMs: percentile(runtime.latencies, 0.95),
          },
          accounts: {
            users: Object.keys(store.data.users).length,
            activeSessions,
            cloudSaves: Object.keys(store.data.cloudSaves).length,
            submissions: Object.keys(store.data.submissions).length,
          },
          players: playerMetrics(store.data, onlineWindowMs, now, metricsTimeZone),
          analytics: analyticsSummary(store.data.analytics, { now, timeZone: metricsTimeZone, days }),
          reports: { feedback: store.data.feedback.length, clientErrors: store.data.errors.length },
          audit: {
            entries: store.data.auditLog.length,
            recent: [...store.data.auditLog].reverse().slice(0, 20),
          },
          backups: {
            configured: Boolean(backupDirectory),
            lastSuccessAt: runtime.lastBackupAt,
            lastErrorAt: runtime.lastBackupErrorAt,
            offsite: offsiteBackup,
            restoreDrill,
          },
          infrastructure,
          daily: serviceDaily,
          storage: databaseFile ? "sqlite" : "json",
        });
      }

      if (request.method === "POST" && url.pathname === "/api/analytics") {
        const result = recordAnalyticsBatch(store.data.analytics, await readJson(request), { timeZone: metricsTimeZone });
        if (!result.ok) return send(response, 400, { error: result.error });
        return send(response, 202, { accepted: true, duplicate: result.duplicate, day: result.day });
      }

      if (request.method === "POST" && url.pathname === "/api/presence") {
        const body = await readJson(request);
        const playerId = normalizedPlayerId(body.playerId);
        if (!playerId) return send(response, 400, { error: "匿名玩家标识格式无效" });
        const now = Date.now();
        const activeDay = metricDay(now, metricsTimeZone);
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
        return send(response, 202, { accepted: true, players: playerMetrics(store.data, onlineWindowMs, now, metricsTimeZone) });
      }

      if (request.method === "POST" && url.pathname === "/api/auth/register") {
        if (!accountMailer) return send(response, 503, { error: "邮件验证服务尚未配置，暂时无法创建新账号", code: "EMAIL_SERVICE_UNAVAILABLE" });
        const body = await readJson(request);
        const email = normalizedEmail(body.email);
        const displayName = normalizedName(body.displayName);
        const password = typeof body.password === "string" ? body.password : "";
        if (!email || !displayName || password.length < 8 || password.length > 128) return send(response, 400, { error: "邮箱、名称或密码格式无效（密码至少 8 位）" });
        if (Object.values(store.data.users).some((user) => user.email === email)) return send(response, 409, { error: "该邮箱已注册" });
        const credentials = await passwordRecord(password);
        if (Object.values(store.data.users).some((user) => user.email === email)) return send(response, 409, { error: "该邮箱已注册" });
        const now = Date.now();
        const user = {
          id: `user_${randomUUID().replaceAll("-", "")}`,
          email,
          displayName,
          createdAt: now,
          emailVerifiedAt: null,
          passwordChangedAt: now,
          ...credentials,
        };
        store.data.users[user.id] = user;
        const verificationToken = issueActionToken(store.data.emailVerifications, user.id);
        const token = issueSession(store, user.id, request, body.deviceName);
        appendAudit(store, request, "account.register", user.id);
        await store.persist();
        const delivered = await accountMailer({ kind: "verify", email: user.email, actionToken: verificationToken });
        if (!delivered) return send(response, 502, { error: "账号已创建，但验证邮件发送失败；请登录后重试发送", code: "EMAIL_DELIVERY_FAILED", accountCreated: true });
        return send(response, 201, { token, user: publicUser(user), verificationRequired: true });
      }

      if (request.method === "POST" && url.pathname === "/api/auth/login") {
        const body = await readJson(request);
        const email = normalizedEmail(body.email);
        const password = typeof body.password === "string" ? body.password : "";
        const user = email ? Object.values(store.data.users).find((candidate) => candidate.email === email) : null;
        if (!user || !(await passwordMatches(password, user))) return send(response, 401, { error: "邮箱或密码错误" });
        const token = issueSession(store, user.id, request, body.deviceName);
        appendAudit(store, request, "account.login", user.id);
        await store.persist();
        return send(response, 200, { token, user: publicUser(user) });
      }

      if (request.method === "POST" && url.pathname === "/api/auth/verify-email") {
        const body = await readJson(request);
        const action = validActionToken(store.data.emailVerifications, body.token);
        if (!action) return send(response, 400, { error: "验证链接无效或已过期", code: "EMAIL_TOKEN_INVALID" });
        const user = store.data.users[action.record.userId];
        if (!user) return send(response, 400, { error: "验证链接无效或已过期", code: "EMAIL_TOKEN_INVALID" });
        user.emailVerifiedAt = Date.now();
        removeUserActionTokens(store, user.id);
        appendAudit(store, request, "account.email_verified", user.id);
        await store.persist();
        return send(response, 200, { verified: true, user: publicUser(user) });
      }

      if (request.method === "POST" && url.pathname === "/api/auth/resend-verification") {
        const auth = authenticatedUser(request, store);
        if (!auth) return send(response, 401, { error: "请先登录" });
        if (Number.isFinite(auth.user.emailVerifiedAt)) return send(response, 200, { verified: true, user: publicUser(auth.user) });
        if (!normalizedEmail(auth.user.email)) return send(response, 400, { error: "请先绑定邮箱", code: "EMAIL_NOT_BOUND" });
        if (!accountMailer) return send(response, 503, { error: "邮件验证服务尚未配置", code: "EMAIL_SERVICE_UNAVAILABLE" });
        const verificationToken = issueActionToken(store.data.emailVerifications, auth.user.id);
        appendAudit(store, request, "account.verification_requested", auth.user.id);
        await store.persist();
        const delivered = await accountMailer({ kind: "verify", email: auth.user.email, actionToken: verificationToken });
        if (!delivered) return send(response, 502, { error: "验证邮件发送失败，请稍后重试", code: "EMAIL_DELIVERY_FAILED" });
        return send(response, 202, { sent: true });
      }

      if (request.method === "POST" && url.pathname === "/api/auth/forgot-password") {
        if (!accountMailer) return send(response, 503, { error: "密码重置邮件服务尚未配置", code: "EMAIL_SERVICE_UNAVAILABLE" });
        const body = await readJson(request);
        const email = normalizedEmail(body.email);
        if (!email) return send(response, 400, { error: "邮箱格式无效" });
        const user = Object.values(store.data.users).find((candidate) => candidate.email === email);
        if (user && Number.isFinite(user.emailVerifiedAt)) {
          const resetToken = issueActionToken(store.data.passwordResets, user.id);
          appendAudit(store, request, "account.password_reset_requested", user.id);
          await store.persist();
          const delivered = await accountMailer({ kind: "reset", email: user.email, actionToken: resetToken });
          if (!delivered) return send(response, 503, { error: "密码重置邮件暂时无法发送，请稍后重试", code: "EMAIL_DELIVERY_FAILED" });
        }
        return send(response, 202, { accepted: true, message: "如果该邮箱已注册，重置链接会发送到邮箱" });
      }

      if (request.method === "POST" && url.pathname === "/api/auth/reset-password") {
        const body = await readJson(request);
        const password = typeof body.password === "string" ? body.password : "";
        if (password.length < 8 || password.length > 128) return send(response, 400, { error: "新密码必须为 8 至 128 位" });
        const action = validActionToken(store.data.passwordResets, body.token);
        if (!action) return send(response, 400, { error: "重置链接无效或已过期", code: "PASSWORD_TOKEN_INVALID" });
        const user = store.data.users[action.record.userId];
        if (!user) return send(response, 400, { error: "重置链接无效或已过期", code: "PASSWORD_TOKEN_INVALID" });
        Object.assign(user, await passwordRecord(password), { passwordChangedAt: Date.now() });
        revokeUserSessions(store, user.id);
        removeUserActionTokens(store, user.id);
        const token = issueSession(store, user.id, request, body.deviceName);
        appendAudit(store, request, "account.password_reset", user.id);
        await store.persist();
        return send(response, 200, { token, user: publicUser(user) });
      }

      if (request.method === "GET" && url.pathname === "/api/account") {
        const auth = authenticatedUser(request, store);
        return auth ? send(response, 200, {
          user: publicUser(auth.user),
          cloudSave: cloudSaveMetadata(store.data.cloudSaves[auth.user.id], "main"),
          cloudSaves: cloudSaveSlotMetadata(store, auth.user.id),
        }) : send(response, 401, { error: "登录已过期" });
      }

      if (request.method === "POST" && url.pathname === "/api/auth/logout") {
        const auth = authenticatedUser(request, store);
        if (auth) {
          delete store.data.sessions[auth.tokenHash];
          appendAudit(store, request, "account.logout", auth.user.id);
          await store.persist();
        }
        return send(response, 200, { ok: true });
      }

      if (request.method === "GET" && url.pathname === "/api/account/sessions") {
        const auth = authenticatedUser(request, store);
        if (!auth) return send(response, 401, { error: "请先登录" });
        const sessions = Object.entries(store.data.sessions)
          .filter(([, session]) => session.userId === auth.user.id && session.expiresAt > Date.now())
          .sort(([, left], [, right]) => right.lastSeenAt - left.lastSeenAt)
          .map(([tokenHash, session]) => publicSession(session, auth.tokenHash, tokenHash));
        return send(response, 200, { sessions });
      }

      if (request.method === "POST" && url.pathname === "/api/account/sessions/revoke") {
        const auth = authenticatedUser(request, store);
        if (!auth) return send(response, 401, { error: "请先登录" });
        const body = await readJson(request);
        const target = Object.entries(store.data.sessions).find(([, session]) => session.userId === auth.user.id && session.id === body.sessionId);
        if (!target) return send(response, 404, { error: "会话不存在或已结束" });
        delete store.data.sessions[target[0]];
        appendAudit(store, request, "account.session_revoked", auth.user.id);
        await store.persist();
        return send(response, 200, { revoked: true, currentSessionRevoked: target[0] === auth.tokenHash });
      }

      if (request.method === "POST" && url.pathname === "/api/account/password") {
        const auth = authenticatedUser(request, store);
        if (!auth) return send(response, 401, { error: "请先登录" });
        const body = await readJson(request);
        const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
        const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
        if (!(await passwordMatches(currentPassword, auth.user))) return send(response, 401, { error: "当前密码错误" });
        if (newPassword.length < 8 || newPassword.length > 128) return send(response, 400, { error: "新密码必须为 8 至 128 位" });
        Object.assign(auth.user, await passwordRecord(newPassword), { passwordChangedAt: Date.now() });
        revokeUserSessions(store, auth.user.id, auth.tokenHash);
        appendAudit(store, request, "account.password_changed", auth.user.id);
        await store.persist();
        return send(response, 200, { changed: true, user: publicUser(auth.user) });
      }

      if (request.method === "POST" && url.pathname === "/api/account/email") {
        const auth = authenticatedUser(request, store);
        if (!auth) return send(response, 401, { error: "请先登录" });
        if (!accountMailer) return send(response, 503, { error: "邮件验证服务尚未配置", code: "EMAIL_SERVICE_UNAVAILABLE" });
        if (Number.isFinite(auth.user.emailVerifiedAt)) return send(response, 409, { error: "当前账号已经绑定并验证邮箱" });
        const body = await readJson(request);
        const email = normalizedEmail(body.email);
        if (!email) return send(response, 400, { error: "邮箱格式无效" });
        if (Object.values(store.data.users).some((user) => user.id !== auth.user.id && user.email === email)) {
          return send(response, 409, { error: "该邮箱已绑定其他账号" });
        }
        auth.user.email = email;
        auth.user.emailVerifiedAt = null;
        removeUserActionTokens(store, auth.user.id);
        const verificationToken = issueActionToken(store.data.emailVerifications, auth.user.id);
        appendAudit(store, request, "account.email_bound", auth.user.id);
        await store.persist();
        const delivered = await accountMailer({ kind: "verify", email, actionToken: verificationToken });
        if (!delivered) return send(response, 502, { error: "邮箱已绑定，但验证邮件发送失败；请稍后重发", code: "EMAIL_DELIVERY_FAILED", user: publicUser(auth.user) });
        return send(response, 202, { sent: true, user: publicUser(auth.user) });
      }

      if (request.method === "GET" && url.pathname === "/api/account/export") {
        const auth = authenticatedUser(request, store);
        if (!auth) return send(response, 401, { error: "请先登录" });
        const userId = auth.user.id;
        const submissions = Object.values(store.data.submissions).filter((entry) => entry.userId === userId);
        const feedback = store.data.feedback.filter((entry) => entry.userId === userId).map(({ ipHash: _ipHash, ...entry }) => entry);
        const errors = store.data.errors.filter((entry) => entry.userId === userId).map(({ ipHash: _ipHash, ...entry }) => entry);
        appendAudit(store, request, "account.data_exported", userId);
        await store.persist();
        return send(response, 200, {
          exportedAt: Date.now(),
          schemaVersion: DEFAULT_DATA.schemaVersion,
          user: publicUser(auth.user),
          cloudSave: store.data.cloudSaves[userId] ?? null,
          cloudSaveHistory: [...saveHistory(store, userId)].reverse().map((save) => cloudSaveMetadata(save, "main")),
          cloudSaveSlots: store.data.cloudSaveSlots[userId] ?? {},
          cloudSaveSlotHistory: store.data.cloudSaveSlotHistory[userId] ?? {},
          submissions,
          feedback,
          errors,
        }, { "content-disposition": `attachment; filename="dsp-account-${userId}.json"` });
      }

      if (request.method === "POST" && url.pathname === "/api/account/delete") {
        const auth = authenticatedUser(request, store);
        if (!auth) return send(response, 401, { error: "请先登录" });
        const body = await readJson(request);
        if (body.confirmation !== "DELETE" || !(await passwordMatches(typeof body.password === "string" ? body.password : "", auth.user))) {
          return send(response, 400, { error: "密码或注销确认文字不正确" });
        }
        const userId = auth.user.id;
        revokeUserSessions(store, userId);
        removeUserActionTokens(store, userId);
        delete store.data.cloudSaves[userId];
        delete store.data.cloudSaveHistory[userId];
        delete store.data.cloudSaveSlots[userId];
        delete store.data.cloudSaveSlotHistory[userId];
        for (const [key, submission] of Object.entries(store.data.submissions)) {
          if (submission.userId === userId) delete store.data.submissions[key];
        }
        store.data.feedback = store.data.feedback.filter((entry) => entry.userId !== userId);
        store.data.errors = store.data.errors.filter((entry) => entry.userId !== userId);
        appendAudit(store, request, "account.deleted", userId);
        delete store.data.users[userId];
        await store.persist();
        return send(response, 200, { deleted: true });
      }

      if (request.method === "GET" && url.pathname === "/api/cloud-save/history") {
        const auth = authenticatedUser(request, store);
        if (!auth) return send(response, 401, { error: "请先登录" });
        const slot = normalizedCloudSaveSlot(url.searchParams.get("slot") ?? "main");
        if (!slot) return send(response, 400, { error: "云存档槽位无效" });
        const history = [...saveHistory(store, auth.user.id, slot)].reverse().map((save) => cloudSaveMetadata(save, slot));
        return send(response, 200, { history });
      }

      if (request.method === "GET" && url.pathname === "/api/cloud-save") {
        const auth = authenticatedUser(request, store);
        if (!auth) return send(response, 401, { error: "请先登录" });
        const slot = normalizedCloudSaveSlot(url.searchParams.get("slot") ?? "main");
        if (!slot) return send(response, 400, { error: "云存档槽位无效" });
        const requestedRevision = Number(url.searchParams.get("revision"));
        const save = Number.isInteger(requestedRevision) && requestedRevision > 0
          ? saveHistory(store, auth.user.id, slot).find((entry) => entry.revision === requestedRevision)
          : currentCloudSave(store, auth.user.id, slot);
        return send(response, 200, { cloudSave: save ? { ...cloudSaveMetadata(save, slot), payload: save.payload } : null });
      }

      if (request.method === "PUT" && url.pathname === "/api/cloud-save") {
        const auth = authenticatedUser(request, store);
        if (!auth) return send(response, 401, { error: "请先登录" });
        if (!requireVerifiedUser(response, auth)) return;
        const slot = normalizedCloudSaveSlot(url.searchParams.get("slot") ?? "main");
        if (!slot) return send(response, 400, { error: "云存档槽位无效" });
        const body = await readJson(request);
        if (!validateSavePayload(body.payload)) return send(response, 400, { error: "云存档格式无效或体积过大" });
        const current = currentCloudSave(store, auth.user.id, slot);
        const expectedRevision = Number.isInteger(body.expectedRevision) ? body.expectedRevision : 0;
        if ((current?.revision ?? 0) !== expectedRevision) {
          runtime.cloudConflicts += 1;
          return send(response, 409, { error: "云端已有更新版本，请先下载或确认覆盖", cloudSave: cloudSaveMetadata(current, slot) });
        }
        const next = {
          revision: (current?.revision ?? 0) + 1,
          payload: body.payload,
          checksum: sha256(body.payload),
          size: Buffer.byteLength(body.payload),
          updatedAt: Date.now(),
          summary: summarizeSavePayload(body.payload),
        };
        appendSaveRevision(store, auth.user.id, next, slot);
        dayMetric.cloudUploads += 1;
        await store.persist();
        return send(response, 200, { cloudSave: cloudSaveMetadata(next, slot) });
      }

      if (request.method === "POST" && url.pathname === "/api/cloud-save/restore") {
        const auth = authenticatedUser(request, store);
        if (!auth) return send(response, 401, { error: "请先登录" });
        if (!requireVerifiedUser(response, auth)) return;
        const slot = normalizedCloudSaveSlot(url.searchParams.get("slot") ?? "main");
        if (!slot) return send(response, 400, { error: "云存档槽位无效" });
        const body = await readJson(request);
        const current = currentCloudSave(store, auth.user.id, slot);
        const expectedRevision = Number.isInteger(body.expectedRevision) ? body.expectedRevision : 0;
        if ((current?.revision ?? 0) !== expectedRevision) {
          runtime.cloudConflicts += 1;
          return send(response, 409, { error: "云端已有更新版本，请刷新历史记录", cloudSave: cloudSaveMetadata(current, slot) });
        }
        const sourceRevision = Number(body.revision);
        const source = saveHistory(store, auth.user.id, slot).find((entry) => entry.revision === sourceRevision);
        if (!source) return send(response, 404, { error: "历史修订不存在或已过期" });
        const restored = {
          ...source,
          revision: (current?.revision ?? 0) + 1,
          updatedAt: Date.now(),
          restoredFromRevision: sourceRevision,
        };
        appendSaveRevision(store, auth.user.id, restored, slot);
        dayMetric.cloudUploads += 1;
        appendAudit(store, request, "cloud.revision_restored", auth.user.id);
        await store.persist();
        return send(response, 200, { cloudSave: cloudSaveMetadata(restored, slot) });
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
        if (!requireVerifiedUser(response, auth)) return;
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
