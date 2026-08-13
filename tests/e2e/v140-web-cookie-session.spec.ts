import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { createServer as createHttpsServer, type Server as HttpsServer } from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCloudServer } from "../../server/index.mjs";

test.describe.configure({ mode: "serial" });
test.use({ ignoreHTTPSErrors: true });

const webPort = Number(process.env.DSP_E2E_PORT ?? 4319);
let directory = "";
let apiBaseUrl = "";
let pageOrigin = "";
let sequence = 0;
let cloudServer: Awaited<ReturnType<typeof createCloudServer>>;
let httpsServer: HttpsServer;

function opensslExecutable(): string {
  const configured = process.env.OPENSSL_BIN?.trim();
  const candidates = [
    configured,
    process.platform === "win32" ? "C:\\Program Files\\Git\\usr\\bin\\openssl.exe" : "openssl",
    process.platform === "win32" ? "C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe" : null,
  ].filter((candidate): candidate is string => Boolean(candidate));
  const executable = candidates.find((candidate) => candidate === "openssl" || existsSync(candidate));
  if (!executable) throw new Error("OpenSSL is required for the local HTTPS Cookie E2E");
  return executable;
}

function proxyRequest(request: IncomingMessage, response: ServerResponse): void {
  const requestUrl = new URL(request.url ?? "/", pageOrigin);
  const targetBase = requestUrl.pathname.startsWith("/api/") ? apiBaseUrl : `http://127.0.0.1:${webPort}`;
  const target = new URL(`${requestUrl.pathname}${requestUrl.search}`, targetBase);
  const upstream = httpRequest(target, {
    method: request.method,
    headers: { ...request.headers, host: target.host },
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  upstream.on("error", (error) => {
    if (!response.headersSent) response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    response.end(`local test proxy failed: ${error.message}`);
  });
  request.pipe(upstream);
}

test.beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "dsp-v140-web-cookie-"));
  const certificateFile = path.join(directory, "localhost.crt");
  const privateKeyFile = path.join(directory, "localhost.key");
  execFileSync(opensslExecutable(), [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", privateKeyFile,
    "-out", certificateFile,
    "-days", "1",
    "-subj", "/CN=localhost",
    "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1",
  ], { stdio: "ignore" });
  httpsServer = createHttpsServer({
    cert: await readFile(certificateFile),
    key: await readFile(privateKeyFile),
  }, proxyRequest);
  await new Promise<void>((resolve) => httpsServer.listen(0, "127.0.0.1", resolve));
  pageOrigin = `https://localhost:${(httpsServer.address() as { port: number }).port}`;
  cloudServer = await createCloudServer({
    databaseFile: path.join(directory, "cloud.sqlite"),
    allowedOrigin: pageOrigin,
    registrationLimit: 100,
    historyPruneIntervalMs: 0,
    mailer: null,
    logger: { error() {} },
  });
  await new Promise<void>((resolve) => cloudServer.listen(0, "127.0.0.1", resolve));
  apiBaseUrl = `http://127.0.0.1:${(cloudServer.address() as { port: number }).port}`;
});

test.afterAll(async () => {
  if (cloudServer?.listening) await cloudServer.shutdown();
  if (httpsServer?.listening) await new Promise<void>((resolve, reject) => httpsServer.close((error) => error ? reject(error) : resolve()));
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function openIsolatedPage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("dsp-idle-network.release-notes.seen.v1", "2026-08-13-v1.0.41-cookie-test");
  });
  await page.goto(`${pageOrigin}/?menu=1`);
}

function nextIdentity(prefix: string) {
  sequence += 1;
  return {
    username: `${prefix}_${sequence}`,
    password: "synthetic-pass-123",
    displayName: `Cookie 合成账号 ${sequence}`,
  };
}

test("real Chrome keeps Web session secrets HttpOnly and sends CSRF only on writes", async ({ page, context }) => {
  await openIsolatedPage(page);
  const requests: Array<{ path: string; method: string; headers: Record<string, string> }> = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return;
    requests.push({ path: url.pathname, method: request.method(), headers: request.headers() });
  });
  const identity = nextIdentity("v140_cookie_browser");

  const registered = await page.evaluate(async (credentials) => {
    const cloud = await import("/src/game/cloud.ts");
    const session = await cloud.registerCloudAccount(credentials.username, credentials.password, credentials.displayName);
    const account = await cloud.resumeCloudSession();
    const visibility = await cloud.setCloudLeaderboardVisibility(false);
    return {
      registeredStatus: session.status,
      accountStatus: account.status,
      userId: account.user?.id ?? null,
      visible: visibility.leaderboardVisible,
      localToken: localStorage.getItem(cloud.CLOUD_TOKEN_STORAGE_KEY),
      jsCookie: document.cookie,
      authenticated: cloud.hasCloudAuthentication(),
      cookieTransport: cloud.getWebCookieSession()?.transport ?? null,
    };
  }, identity);

  expect(registered).toMatchObject({
    registeredStatus: "authenticated",
    accountStatus: "authenticated",
    visible: false,
    localToken: null,
    authenticated: true,
    cookieTransport: "cookie",
  });
  expect(registered.userId).toMatch(/^user_/);
  expect(registered.jsCookie).not.toContain("dspidle_session");

  const browserCookies = await context.cookies();
  const sessionCookie = browserCookies.find((cookie) => cookie.name === "__Secure-dspidle_session_v1");
  expect(sessionCookie, JSON.stringify({ pageOrigin, browserCookies, requests }, null, 2)).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/api",
  });

  const issuance = requests.find((request) => request.path === "/api/auth/register")!;
  expect(issuance.headers["x-dsp-session-mode"]).toBe("cookie-v1");
  expect(issuance.headers.authorization).toBeUndefined();
  expect(issuance.headers["x-dsp-csrf-token"]).toBeUndefined();

  const accountRead = requests.find((request) => request.path === "/api/account")!;
  expect(accountRead.method).toBe("GET");
  expect(accountRead.headers["x-dsp-session-mode"]).toBe("cookie-v1");
  expect(accountRead.headers.authorization).toBeUndefined();
  expect(accountRead.headers["x-dsp-csrf-token"]).toBeUndefined();

  const visibilityWrite = requests.find((request) => request.path === "/api/leaderboard/visibility")!;
  expect(visibilityWrite.method).toBe("POST");
  expect(visibilityWrite.headers["x-dsp-session-mode"]).toBe("cookie-v1");
  expect(visibilityWrite.headers["x-dsp-csrf-token"]).toMatch(/^[A-Za-z0-9_-]{32}$/);
  expect(visibilityWrite.headers.authorization).toBeUndefined();

  await page.evaluate(async () => {
    const cloud = await import("/src/game/cloud.ts");
    await cloud.logoutCloudAccount();
  });
  expect((await context.cookies()).some((cookie) => cookie.name === "__Secure-dspidle_session_v1")).toBe(false);
  const postLogout = await page.evaluate(async () => {
    const cloud = await import("/src/game/cloud.ts");
    return { authenticated: cloud.hasCloudAuthentication(), token: cloud.getCloudToken() };
  });
  expect(postLogout).toEqual({ authenticated: false, token: null });
});

test("real Chrome migrates a legacy Bearer only after Cookie confirmation", async ({ page, context }) => {
  await openIsolatedPage(page);
  const identity = nextIdentity("v140_cookie_migration");
  const legacy = await page.evaluate(async (credentials) => {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(credentials),
    });
    const body = await response.json() as { token: string };
    localStorage.setItem("dsp-idle-network.cloud-token.v1", body.token);
    return { status: response.status, token: body.token };
  }, identity);
  expect(legacy.status).toBe(201);
  expect(legacy.token).toMatch(/^[A-Za-z0-9_-]{32,256}$/);

  const result = await page.evaluate(async () => {
    const cloud = await import("/src/game/cloud.ts");
    const session = await cloud.resumeCloudSession();
    return {
      status: session.status,
      token: localStorage.getItem(cloud.CLOUD_TOKEN_STORAGE_KEY),
      authenticated: cloud.hasCloudAuthentication(),
      transport: cloud.getWebCookieSession()?.transport ?? null,
    };
  });
  expect(result).toEqual({ status: "authenticated", token: null, authenticated: true, transport: "cookie" });
  expect((await context.cookies()).find((cookie) => cookie.name === "__Secure-dspidle_session_v1"))
    .toMatchObject({ httpOnly: true, secure: true, path: "/api" });
});
