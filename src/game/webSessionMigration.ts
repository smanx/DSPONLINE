export const LEGACY_WEB_SESSION_STORAGE_KEY = "dsp-idle-network.cloud-token.v1";
export const WEB_SESSION_MODE_HEADER = "x-dsp-session-mode";
export const WEB_SESSION_MODE_COOKIE = "cookie-v1";
export const WEB_SESSION_CSRF_HEADER = "x-dsp-csrf-token";
export const WEB_SESSION_MIGRATION_PATH = "/auth/web-session/migrate";
export const WEB_SESSION_STATUS_PATH = "/auth/web-session";

const LEGACY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const CSRF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const MAXIMUM_SESSION_RESPONSE_BYTES = 64 * 1024;

export interface WebCookieSession {
  transport: "cookie";
  csrfToken: string;
  expiresAt: number;
}

export type WebSessionMigrationPhase =
  | "idle"
  | "checking_cookie"
  | "migrating"
  | "confirming_cookie"
  | "ready"
  | "anonymous"
  | "retryable"
  | "unsupported"
  | "reauthentication_required"
  | "cleanup_pending";

export type WebSessionMigrationReason =
  | "COOKIE_STATUS_UNAVAILABLE"
  | "LEGACY_STORAGE_UNAVAILABLE"
  | "LEGACY_TOKEN_INVALID"
  | "MIGRATION_UNSUPPORTED"
  | "LEGACY_SESSION_REJECTED"
  | "MIGRATION_ABORTED"
  | "MIGRATION_NETWORK_ERROR"
  | "MIGRATION_REJECTED"
  | "MIGRATION_RESPONSE_INVALID"
  | "COOKIE_CONFIRMATION_FAILED"
  | "LEGACY_STORAGE_CHANGED"
  | "LEGACY_STORAGE_CLEANUP_FAILED";

export interface WebSessionMigrationState {
  phase: WebSessionMigrationPhase;
  session: WebCookieSession | null;
  legacyTokenPresent: boolean;
  attempt: number;
  reason: WebSessionMigrationReason | null;
  retryable: boolean;
}

export type WebSessionMigrationEvent =
  | { type: "CHECK_COOKIE" }
  | { type: "START_MIGRATION" }
  | { type: "CONFIRM_COOKIE" }
  | { type: "COOKIE_READY"; session: WebCookieSession; legacyTokenPresent: boolean }
  | { type: "ANONYMOUS" }
  | { type: "FAIL"; phase: "retryable" | "unsupported" | "reauthentication_required"; reason: WebSessionMigrationReason; legacyTokenPresent: boolean }
  | { type: "CLEANUP_PENDING"; session: WebCookieSession; reason: "LEGACY_STORAGE_CHANGED" | "LEGACY_STORAGE_CLEANUP_FAILED" };

export interface WebSessionStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

export interface WebSessionMigrationOptions {
  apiBase: string;
  pageUrl: string;
  storage: WebSessionStorage;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  now?: () => number;
}

export interface WebSessionMigrationCoordinator {
  run(options: WebSessionMigrationOptions): Promise<WebSessionMigrationState>;
  inFlight(): boolean;
}

export const INITIAL_WEB_SESSION_MIGRATION_STATE: WebSessionMigrationState = Object.freeze({
  phase: "idle",
  session: null,
  legacyTokenPresent: false,
  attempt: 0,
  reason: null,
  retryable: false,
});

function state(value: WebSessionMigrationState): WebSessionMigrationState {
  return Object.freeze(value);
}

export function reduceWebSessionMigration(
  current: WebSessionMigrationState,
  event: WebSessionMigrationEvent,
): WebSessionMigrationState {
  const attempt = event.type === "START_MIGRATION" ? current.attempt + 1 : current.attempt;
  switch (event.type) {
    case "CHECK_COOKIE":
      return state({ ...current, phase: "checking_cookie", session: null, reason: null, retryable: false });
    case "START_MIGRATION":
      return state({ ...current, phase: "migrating", session: null, legacyTokenPresent: true, attempt, reason: null, retryable: false });
    case "CONFIRM_COOKIE":
      return state({ ...current, phase: "confirming_cookie", session: null, reason: null, retryable: false });
    case "COOKIE_READY":
      return state({ ...current, phase: "ready", session: event.session, legacyTokenPresent: event.legacyTokenPresent, reason: null, retryable: false });
    case "ANONYMOUS":
      return state({ ...current, phase: "anonymous", session: null, legacyTokenPresent: false, reason: null, retryable: false });
    case "FAIL":
      return state({
        ...current,
        phase: event.phase,
        session: null,
        legacyTokenPresent: event.legacyTokenPresent,
        reason: event.reason,
        retryable: event.phase === "retryable" || event.phase === "unsupported",
      });
    case "CLEANUP_PENDING":
      return state({
        ...current,
        phase: "cleanup_pending",
        session: event.session,
        legacyTokenPresent: true,
        reason: event.reason,
        retryable: true,
      });
  }
}

function normalizedApiBase(apiBase: string, pageUrl: string): string {
  let page: URL;
  let target: URL;
  try {
    page = new URL(pageUrl);
    target = new URL(apiBase, page);
  } catch {
    throw new TypeError("Web 会话 API 地址无效");
  }
  const localDevelopment = page.protocol === "http:" && (page.hostname === "localhost" || page.hostname === "127.0.0.1");
  if ((page.protocol !== "https:" && !localDevelopment) || target.origin !== page.origin || target.username || target.password ||
    target.search || target.hash || target.pathname.replace(/\/+$/, "") !== "/api") {
    throw new TypeError("Web Cookie 会话只允许当前安全站点的 /api");
  }
  return `${target.origin}/api`;
}

function validSessionPayload(value: unknown, now: number): WebCookieSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.transport !== "cookie" || typeof candidate.csrfToken !== "string" ||
    !CSRF_TOKEN_PATTERN.test(candidate.csrfToken) || !Number.isSafeInteger(candidate.expiresAt) ||
    (candidate.expiresAt as number) <= now || (candidate.expiresAt as number) > now + 90 * 24 * 60 * 60 * 1_000) {
    return null;
  }
  return Object.freeze({
    transport: "cookie",
    csrfToken: candidate.csrfToken,
    expiresAt: candidate.expiresAt as number,
  });
}

export function parseWebCookieSessionPayload(payload: unknown, now = Date.now()): WebCookieSession | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const root = payload as Record<string, unknown>;
  return validSessionPayload(root.session, now);
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^(?:0|[1-9][0-9]*)$/.test(declared) || Number(declared) > MAXIMUM_SESSION_RESPONSE_BYTES)) {
    throw new TypeError("Web 会话响应过大");
  }
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") throw new TypeError("Web 会话响应格式无效");
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAXIMUM_SESSION_RESPONSE_BYTES) throw new TypeError("Web 会话响应过大");
      chunks.push(next.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return JSON.parse(text) as unknown;
}

async function fetchCookieStatus(
  base: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal | undefined,
  now: number,
): Promise<{ kind: "ready"; session: WebCookieSession } | { kind: "anonymous" } | { kind: "failed" }> {
  let response: Response;
  try {
    response = await fetchImpl(`${base}${WEB_SESSION_STATUS_PATH}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      headers: { [WEB_SESSION_MODE_HEADER]: WEB_SESSION_MODE_COOKIE },
      signal,
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 401) return { kind: "anonymous" };
  if (!response.ok) return { kind: "failed" };
  try {
    const session = parseWebCookieSessionPayload(await readBoundedJson(response), now);
    return session ? { kind: "ready", session } : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}

function failState(
  current: WebSessionMigrationState,
  phase: "retryable" | "unsupported" | "reauthentication_required",
  reason: WebSessionMigrationReason,
  legacyTokenPresent: boolean,
): WebSessionMigrationState {
  return reduceWebSessionMigration(current, { type: "FAIL", phase, reason, legacyTokenPresent });
}

function aborted(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

export async function migrateLegacyWebSession(options: WebSessionMigrationOptions): Promise<WebSessionMigrationState> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const nowProvider = options.now ?? Date.now;
  const base = normalizedApiBase(options.apiBase, options.pageUrl);
  let current = INITIAL_WEB_SESSION_MIGRATION_STATE;
  let legacyToken: string | null;
  try {
    legacyToken = options.storage.getItem(LEGACY_WEB_SESSION_STORAGE_KEY);
  } catch {
    return failState(current, "retryable", "LEGACY_STORAGE_UNAVAILABLE", true);
  }

  if (!legacyToken) {
    current = reduceWebSessionMigration(current, { type: "CHECK_COOKIE" });
    const status = await fetchCookieStatus(base, fetchImpl, options.signal, nowProvider());
    if (status.kind === "ready") {
      return reduceWebSessionMigration(current, { type: "COOKIE_READY", session: status.session, legacyTokenPresent: false });
    }
    if (status.kind === "anonymous") return reduceWebSessionMigration(current, { type: "ANONYMOUS" });
    return failState(current, "retryable", "COOKIE_STATUS_UNAVAILABLE", false);
  }

  if (!LEGACY_TOKEN_PATTERN.test(legacyToken)) {
    return failState(current, "reauthentication_required", "LEGACY_TOKEN_INVALID", true);
  }
  current = reduceWebSessionMigration(current, { type: "START_MIGRATION" });
  let response: Response;
  try {
    response = await fetchImpl(`${base}${WEB_SESSION_MIGRATION_PATH}`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      headers: {
        authorization: `Bearer ${legacyToken}`,
        [WEB_SESSION_MODE_HEADER]: WEB_SESSION_MODE_COOKIE,
      },
      signal: options.signal,
    });
  } catch {
    return failState(current, "retryable", aborted(options.signal) ? "MIGRATION_ABORTED" : "MIGRATION_NETWORK_ERROR", true);
  }

  if (response.status === 404 || response.status === 501) {
    return failState(current, "unsupported", "MIGRATION_UNSUPPORTED", true);
  }
  if (response.status === 401 || response.status === 403) {
    return failState(current, "reauthentication_required", "LEGACY_SESSION_REJECTED", true);
  }
  if (!response.ok) return failState(current, "retryable", "MIGRATION_REJECTED", true);

  let issued: WebCookieSession | null = null;
  try { issued = parseWebCookieSessionPayload(await readBoundedJson(response), nowProvider()); } catch { /* rejected below */ }
  if (!issued) return failState(current, "retryable", "MIGRATION_RESPONSE_INVALID", true);

  current = reduceWebSessionMigration(current, { type: "CONFIRM_COOKIE" });
  const confirmed = await fetchCookieStatus(base, fetchImpl, options.signal, nowProvider());
  if (confirmed.kind !== "ready" || confirmed.session.csrfToken !== issued.csrfToken || confirmed.session.expiresAt !== issued.expiresAt) {
    return failState(current, "retryable", aborted(options.signal) ? "MIGRATION_ABORTED" : "COOKIE_CONFIRMATION_FAILED", true);
  }

  try {
    if (options.storage.getItem(LEGACY_WEB_SESSION_STORAGE_KEY) !== legacyToken) {
      return reduceWebSessionMigration(current, {
        type: "CLEANUP_PENDING",
        session: confirmed.session,
        reason: "LEGACY_STORAGE_CHANGED",
      });
    }
    options.storage.removeItem(LEGACY_WEB_SESSION_STORAGE_KEY);
    if (options.storage.getItem(LEGACY_WEB_SESSION_STORAGE_KEY) !== null) {
      return reduceWebSessionMigration(current, {
        type: "CLEANUP_PENDING",
        session: confirmed.session,
        reason: "LEGACY_STORAGE_CLEANUP_FAILED",
      });
    }
  } catch {
    return reduceWebSessionMigration(current, {
      type: "CLEANUP_PENDING",
      session: confirmed.session,
      reason: "LEGACY_STORAGE_CLEANUP_FAILED",
    });
  }
  return reduceWebSessionMigration(current, { type: "COOKIE_READY", session: confirmed.session, legacyTokenPresent: false });
}

export function createWebSessionMigrationCoordinator(): WebSessionMigrationCoordinator {
  let pending: Promise<WebSessionMigrationState> | null = null;
  return Object.freeze({
    run(options: WebSessionMigrationOptions): Promise<WebSessionMigrationState> {
      if (pending) return pending;
      pending = migrateLegacyWebSession(options).finally(() => { pending = null; });
      return pending;
    },
    inFlight() { return pending !== null; },
  });
}

export function webSessionIssuanceHeaders(headers?: HeadersInit): Headers {
  const result = new Headers(headers);
  if (result.has("authorization")) throw new TypeError("新 Web Cookie 会话签发不得发送 Bearer token");
  result.set(WEB_SESSION_MODE_HEADER, WEB_SESSION_MODE_COOKIE);
  return result;
}

export function webCookieSessionRequest(session: WebCookieSession, init: RequestInit = {}): RequestInit {
  const method = (init.method ?? "GET").toUpperCase();
  if (!/^[A-Z]{3,16}$/.test(method)) throw new TypeError("Web 会话请求方法无效");
  const normalized = validSessionPayload(session, Date.now());
  if (!normalized) throw new TypeError("Web Cookie 会话无效或已过期");
  const headers = new Headers(init.headers);
  if (headers.has("authorization")) throw new TypeError("Web Cookie 会话不得混用 Bearer token");
  headers.set(WEB_SESSION_MODE_HEADER, WEB_SESSION_MODE_COOKIE);
  if (!SAFE_METHODS.has(method)) headers.set(WEB_SESSION_CSRF_HEADER, normalized.csrfToken);
  else headers.delete(WEB_SESSION_CSRF_HEADER);
  return {
    ...init,
    method,
    headers,
    credentials: "include",
  };
}

export function clearWebCookieSessionState(): WebSessionMigrationState {
  return state({ ...INITIAL_WEB_SESSION_MIGRATION_STATE, phase: "anonymous" });
}
