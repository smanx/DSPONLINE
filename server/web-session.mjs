import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const WEB_SESSION_COOKIE_NAME = "__Secure-dspidle_session_v1";
export const WEB_SESSION_COOKIE_PATH = "/api";
export const WEB_SESSION_MODE_HEADER = "x-dsp-session-mode";
export const WEB_SESSION_MODE_COOKIE = "cookie-v1";
export const WEB_SESSION_CSRF_HEADER = "x-dsp-csrf-token";
export const WEB_SESSION_MIGRATION_PATH = "/api/auth/web-session/migrate";
export const WEB_SESSION_STATUS_PATH = "/api/auth/web-session";
export const WEB_SESSION_DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
export const WEB_SESSION_REQUEST_HEADER_NAMES = Object.freeze([
  WEB_SESSION_MODE_HEADER,
  WEB_SESSION_CSRF_HEADER,
]);

const TOKEN_HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const CSRF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const VALID_METHOD_PATTERN = /^[A-Z]{3,16}$/;
const VALID_SAME_SITE = new Set(["Lax", "Strict"]);
const CSRF_DOMAIN = "dspidle-web-csrf-v1";

export class WebSessionError extends Error {
  constructor(code, publicMessage, statusCode = 400) {
    super(publicMessage);
    this.name = "WebSessionError";
    this.code = code;
    this.publicMessage = publicMessage;
    this.statusCode = statusCode;
  }
}

function fail(code, message, statusCode = 400) {
  throw new WebSessionError(code, message, statusCode);
}

function ownDataValue(value, key) {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function ownEnumerableKeys(value) {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return [];
  try { return Object.keys(value); } catch { return []; }
}

function requestHeadersSource(request) {
  const candidate = ownDataValue(request, "headers");
  return candidate && typeof candidate === "object" ? candidate : request;
}

function rawHeaderPairs(request) {
  const rawHeaders = ownDataValue(request, "rawHeaders");
  if (rawHeaders === undefined) return null;
  if (!Array.isArray(rawHeaders) || rawHeaders.length % 2 !== 0) {
    fail("WEB_SESSION_HEADERS_INVALID", "请求头结构无效");
  }
  const pairs = [];
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (typeof rawHeaders[index] !== "string" || typeof rawHeaders[index + 1] !== "string") {
      fail("WEB_SESSION_HEADERS_INVALID", "请求头结构无效");
    }
    pairs.push([rawHeaders[index], rawHeaders[index + 1]]);
  }
  return pairs;
}

function headerValues(request, requestedName) {
  const target = requestedName.toLowerCase();
  const raw = rawHeaderPairs(request);
  if (raw) return raw.filter(([name]) => name.toLowerCase() === target).map(([, value]) => value);

  const distinct = ownDataValue(request, "headersDistinct");
  if (distinct && typeof distinct === "object") {
    const values = ownEnumerableKeys(distinct).flatMap((name) => {
      if (name.toLowerCase() !== target) return [];
      const value = ownDataValue(distinct, name);
      return Array.isArray(value) ? value : [value];
    });
    if (values.length > 0) return values;
  }

  const headers = requestHeadersSource(request);
  if (typeof headers?.get === "function") {
    let value = null;
    try { value = headers.get(target); } catch { fail("WEB_SESSION_HEADERS_INVALID", "请求头结构无效"); }
    return value === null || value === undefined ? [] : [value];
  }
  return ownEnumerableKeys(headers).flatMap((name) => {
    if (name.toLowerCase() !== target) return [];
    const value = ownDataValue(headers, name);
    return Array.isArray(value) ? value : [value];
  });
}

function validVisibleHeader(value, maximumLength) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximumLength) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code > 0x7e) return false;
  }
  return true;
}

function singleHeader(request, name, { maximumLength = 8_192, trim = true } = {}) {
  const values = headerValues(request, name);
  if (values.length === 0) return null;
  if (values.length !== 1) fail("WEB_SESSION_HEADER_DUPLICATE", `请求包含重复的 ${name} 请求头`);
  const value = values[0];
  if (!validVisibleHeader(value, maximumLength)) fail("WEB_SESSION_HEADER_INVALID", `${name} 请求头格式无效`);
  return trim ? value.trim() : value;
}

function normalizedOrigin(value, configuration = false) {
  if (typeof value !== "string" || value === "null" || value === "*" || !validVisibleHeader(value, 2_048) || value.includes(",")) {
    fail(
      configuration ? "WEB_SESSION_POLICY_INVALID" : "WEB_SESSION_ORIGIN_INVALID",
      configuration ? "Web 会话 Origin 配置无效" : "Web 会话请求来源格式无效",
      configuration ? 500 : 403,
    );
  }
  let parsed;
  try { parsed = new URL(value); } catch {
    fail(
      configuration ? "WEB_SESSION_POLICY_INVALID" : "WEB_SESSION_ORIGIN_INVALID",
      configuration ? "Web 会话 Origin 配置无效" : "Web 会话请求来源格式无效",
      configuration ? 500 : 403,
    );
  }
  if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.username || parsed.password ||
    parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.origin !== value) {
    fail(
      configuration ? "WEB_SESSION_POLICY_INVALID" : "WEB_SESSION_ORIGIN_INVALID",
      configuration ? "Web 会话 Origin 配置无效" : "Web 会话请求来源格式无效",
      configuration ? 500 : 403,
    );
  }
  return parsed.origin;
}

function parseMethod(request) {
  const value = ownDataValue(request, "method") ?? "GET";
  if (typeof value !== "string" || !VALID_METHOD_PATTERN.test(value)) {
    fail("WEB_SESSION_METHOD_INVALID", "Web 会话请求方法无效", 405);
  }
  return value;
}

function validatedSessionToken(value, code = "WEB_SESSION_TOKEN_INVALID") {
  if (typeof value !== "string" || !SESSION_TOKEN_PATTERN.test(value)) {
    fail(code, "Web 会话凭据格式无效", 401);
  }
  return value;
}

function parseBearerAuthorization(request) {
  const value = singleHeader(request, "authorization", { maximumLength: 320 });
  if (value === null) return null;
  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(value);
  if (!match) fail("WEB_SESSION_AUTHORIZATION_INVALID", "Authorization 请求头无效", 400);
  return match[1];
}

function parseSessionCookie(request, policy) {
  const value = singleHeader(request, "cookie", { maximumLength: 8_192, trim: false });
  if (value === null) return null;
  let result = null;
  for (const rawPair of value.split(";")) {
    const pair = rawPair.trim();
    if (!pair) continue;
    const separator = pair.indexOf("=");
    if (separator < 1) fail("WEB_SESSION_COOKIE_HEADER_INVALID", "Cookie 请求头格式无效", 400);
    const name = pair.slice(0, separator).trim();
    const cookieValue = pair.slice(separator + 1).trim();
    if (!TOKEN_HEADER_NAME_PATTERN.test(name)) fail("WEB_SESSION_COOKIE_HEADER_INVALID", "Cookie 请求头格式无效", 400);
    if (name !== policy.cookieName) continue;
    if (result !== null) fail("WEB_SESSION_COOKIE_DUPLICATE", "Web 会话 Cookie 重复", 400);
    result = validatedSessionToken(cookieValue, "WEB_SESSION_COOKIE_INVALID");
  }
  return result;
}

function secureEqual(left, right) {
  const leftDigest = createHash("sha256").update(typeof left === "string" ? left : "").digest();
  const rightDigest = createHash("sha256").update(typeof right === "string" ? right : "").digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function assertSameOrigin(request, policy) {
  const supplied = singleHeader(request, "origin", { maximumLength: 2_048 });
  if (supplied === null) fail("WEB_SESSION_ORIGIN_REQUIRED", "Cookie 会话写入要求同源 Origin", 403);
  const origin = normalizedOrigin(supplied);
  if (!policy.allowedOrigins.includes(origin)) fail("WEB_SESSION_ORIGIN_DENIED", "Cookie 会话请求来源未获授权", 403);

  const fetchSite = singleHeader(request, "sec-fetch-site", { maximumLength: 32 });
  if (fetchSite !== null && fetchSite !== "same-origin") {
    fail("WEB_SESSION_FETCH_SITE_DENIED", "Cookie 会话只接受同源浏览器请求", 403);
  }
  return origin;
}

function webSessionMode(request) {
  const value = singleHeader(request, WEB_SESSION_MODE_HEADER, { maximumLength: 32 });
  if (value === null) return "bearer";
  if (value !== WEB_SESSION_MODE_COOKIE) {
    fail("WEB_SESSION_MODE_INVALID", "Web 会话模式请求头无效", 400);
  }
  return "cookie";
}

function cookieExpiry(sessionExpiresAt, now, policy) {
  if (!Number.isSafeInteger(sessionExpiresAt) || sessionExpiresAt <= now) {
    fail("WEB_SESSION_EXPIRY_INVALID", "Web 会话过期时间无效", 500);
  }
  const effectiveExpiresAt = Math.min(sessionExpiresAt, now + policy.maximumAgeSeconds * 1_000);
  const maximumAgeSeconds = Math.max(1, Math.floor((effectiveExpiresAt - now) / 1_000));
  return { effectiveExpiresAt, maximumAgeSeconds };
}

export function createWebSessionPolicy({
  allowedOrigins,
  sameSite = "Lax",
  maximumAgeSeconds = Math.floor(WEB_SESSION_DEFAULT_TTL_MS / 1_000),
} = {}) {
  if (!Array.isArray(allowedOrigins) || allowedOrigins.length < 1) {
    fail("WEB_SESSION_POLICY_INVALID", "Web 会话必须配置至少一个同源 Origin", 500);
  }
  const origins = [...new Set(allowedOrigins.map((origin) => normalizedOrigin(origin, true)))];
  if (!VALID_SAME_SITE.has(sameSite)) fail("WEB_SESSION_POLICY_INVALID", "Web 会话 SameSite 配置无效", 500);
  if (!Number.isSafeInteger(maximumAgeSeconds) || maximumAgeSeconds < 300 || maximumAgeSeconds > 90 * 24 * 60 * 60) {
    fail("WEB_SESSION_POLICY_INVALID", "Web 会话有效期配置无效", 500);
  }
  return Object.freeze({
    allowedOrigins: Object.freeze(origins),
    cookieName: WEB_SESSION_COOKIE_NAME,
    cookiePath: WEB_SESSION_COOKIE_PATH,
    sameSite,
    maximumAgeSeconds,
  });
}

export function deriveWebCsrfToken(sessionToken) {
  const validated = validatedSessionToken(sessionToken);
  return createHmac("sha256", validated).update(CSRF_DOMAIN).digest("base64url").slice(0, 32);
}

export function createWebSessionCookie(sessionToken, sessionExpiresAt, policy, { now = Date.now() } = {}) {
  if (!policy || !Array.isArray(policy.allowedOrigins)) fail("WEB_SESSION_POLICY_INVALID", "Web 会话策略无效", 500);
  const token = validatedSessionToken(sessionToken);
  if (!Number.isSafeInteger(now) || now < 0) fail("WEB_SESSION_CLOCK_INVALID", "Web 会话时钟无效", 500);
  const expiry = cookieExpiry(sessionExpiresAt, now, policy);
  return [
    `${policy.cookieName}=${token}`,
    `Path=${policy.cookiePath}`,
    `Max-Age=${expiry.maximumAgeSeconds}`,
    `Expires=${new Date(expiry.effectiveExpiresAt).toUTCString()}`,
    "HttpOnly",
    "Secure",
    `SameSite=${policy.sameSite}`,
    "Priority=High",
  ].join("; ");
}

export function clearWebSessionCookie(policy) {
  if (!policy || policy.cookieName !== WEB_SESSION_COOKIE_NAME || policy.cookiePath !== WEB_SESSION_COOKIE_PATH) {
    fail("WEB_SESSION_POLICY_INVALID", "Web 会话策略无效", 500);
  }
  return [
    `${policy.cookieName}=`,
    `Path=${policy.cookiePath}`,
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    "Secure",
    `SameSite=${policy.sameSite}`,
    "Priority=High",
  ].join("; ");
}

export function inspectSessionCredential(request, policy) {
  if (!request || (typeof request !== "object" && typeof request !== "function")) {
    fail("WEB_SESSION_REQUEST_INVALID", "Web 会话请求无效");
  }
  if (!policy || !Array.isArray(policy.allowedOrigins)) fail("WEB_SESSION_POLICY_INVALID", "Web 会话策略无效", 500);

  // Bearer deliberately wins without parsing Cookie. Native and legacy clients
  // must not become CSRF-gated merely because a browser or proxy also supplied
  // an unrelated or stale cookie.
  const bearer = parseBearerAuthorization(request);
  if (bearer) return Object.freeze({ kind: "bearer", token: bearer });
  const cookie = parseSessionCookie(request, policy);
  if (cookie) return Object.freeze({ kind: "cookie", token: cookie });
  return Object.freeze({ kind: "none", token: null });
}

export function protectSessionRequest(request, credential, policy) {
  const resolved = credential ?? inspectSessionCredential(request, policy);
  if (resolved.kind !== "cookie") {
    return Object.freeze({ credential: resolved, csrfRequired: false, origin: null });
  }
  const method = parseMethod(request);
  if (SAFE_METHODS.has(method)) {
    return Object.freeze({ credential: resolved, csrfRequired: false, origin: null });
  }
  const origin = assertSameOrigin(request, policy);
  const supplied = singleHeader(request, WEB_SESSION_CSRF_HEADER, { maximumLength: 128 });
  const expected = deriveWebCsrfToken(resolved.token);
  if (supplied === null) fail("WEB_SESSION_CSRF_REQUIRED", "Cookie 会话写入缺少 CSRF 校验值", 403);
  if (!CSRF_TOKEN_PATTERN.test(supplied) || !secureEqual(supplied, expected)) {
    fail("WEB_SESSION_CSRF_INVALID", "Cookie 会话 CSRF 校验失败", 403);
  }
  return Object.freeze({ credential: resolved, csrfRequired: true, origin });
}

export function createSessionDelivery(request, {
  sessionToken,
  sessionExpiresAt,
  now = Date.now(),
} = {}, policy) {
  const token = validatedSessionToken(sessionToken);
  const transport = webSessionMode(request);
  if (transport === "bearer") {
    return Object.freeze({
      transport,
      headers: Object.freeze({}),
      publicCredentials: Object.freeze({ token }),
    });
  }

  assertSameOrigin(request, policy);
  const setCookie = createWebSessionCookie(token, sessionExpiresAt, policy, { now });
  const effectiveExpiresAt = Math.min(sessionExpiresAt, now + policy.maximumAgeSeconds * 1_000);
  const session = Object.freeze({
    transport: "cookie",
    csrfToken: deriveWebCsrfToken(token),
    expiresAt: effectiveExpiresAt,
  });
  return Object.freeze({
    transport,
    headers: Object.freeze({ "set-cookie": setCookie }),
    publicCredentials: Object.freeze({ session }),
  });
}

export function inspectSessionIssuanceRequest(request, policy) {
  if (parseMethod(request) !== "POST") {
    fail("WEB_SESSION_ISSUANCE_METHOD_INVALID", "会话签发只接受 POST", 405);
  }
  const transport = webSessionMode(request);
  const origin = transport === "cookie" ? assertSameOrigin(request, policy) : null;
  return Object.freeze({ transport, origin });
}

export function publicCookieSession(credential, sessionExpiresAt, { now = Date.now() } = {}) {
  if (!credential || credential.kind !== "cookie") {
    fail("WEB_SESSION_COOKIE_REQUIRED", "当前接口要求 Cookie 会话", 401);
  }
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(sessionExpiresAt) || sessionExpiresAt <= now) {
    fail("WEB_SESSION_EXPIRY_INVALID", "Web 会话已过期", 401);
  }
  return Object.freeze({
    transport: "cookie",
    csrfToken: deriveWebCsrfToken(credential.token),
    expiresAt: sessionExpiresAt,
  });
}

export function assertLegacyWebSessionMigrationRequest(request, policy) {
  if (parseMethod(request) !== "POST") {
    fail("WEB_SESSION_MIGRATION_METHOD_INVALID", "旧 Web 会话迁移只接受 POST", 405);
  }
  if (webSessionMode(request) !== "cookie") {
    fail("WEB_SESSION_MIGRATION_MODE_REQUIRED", "旧 Web 会话迁移必须显式请求 Cookie 模式", 400);
  }
  assertSameOrigin(request, policy);
  const credential = inspectSessionCredential(request, policy);
  if (credential.kind !== "bearer") {
    fail("WEB_SESSION_MIGRATION_BEARER_REQUIRED", "旧 Web 会话迁移要求有效 Bearer 凭据", 401);
  }
  return credential;
}

export function requireCookieSessionCredential(request, policy) {
  const credential = inspectSessionCredential(request, policy);
  if (credential.kind !== "cookie") {
    fail("WEB_SESSION_COOKIE_REQUIRED", "当前接口要求 Cookie 会话", 401);
  }
  return credential;
}
