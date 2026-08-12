export type PwaUpdateStatus =
  | "idle"
  | "checking"
  | "up-to-date"
  | "downloaded-await-restart"
  | "network-unavailable"
  | "version-check-failed"
  | "stable-fallback";

export interface PwaRuntimeState {
  supported: boolean;
  installed: boolean;
  installAvailable: boolean;
  updateAvailable: boolean;
  updateStatus: PwaUpdateStatus;
  latestBuildId: string | null;
  lastCheckedAt: number | null;
  networkAvailable: boolean | null;
  usingStableFallback: boolean;
  registration: ServiceWorkerRegistration | null;
}

export interface PwaRouteContext {
  basePath: string;
  routeKey: string;
  register: boolean;
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaWorkerStatusMessage {
  type: "DSP_PWA_STATUS";
  status: "network-unavailable" | "version-check-failed" | "stable-fallback";
  previousStable?: boolean;
  usedLastKnownVersion?: boolean;
}

interface VersionMetadata {
  version: string;
  buildId: string;
}

const VERSION_STATUS_HEADER = "X-DSP-PWA-Status";
const VERSION_FALLBACK_HEADER = "X-DSP-PWA-Fallback";
const CURRENT_BUILD_ID = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "development";
const CURRENT_APP_PLATFORM = typeof __APP_PLATFORM__ === "string" ? __APP_PLATFORM__ : "web";

let installPrompt: InstallPromptEvent | null = null;
let state: PwaRuntimeState = {
  supported: typeof navigator !== "undefined" && "serviceWorker" in navigator,
  installed: typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(display-mode: standalone)").matches,
  installAvailable: false,
  updateAvailable: false,
  updateStatus: "idle",
  latestBuildId: null,
  lastCheckedAt: null,
  networkAvailable: typeof navigator !== "undefined" && typeof navigator.onLine === "boolean" ? navigator.onLine : null,
  usingStableFallback: false,
  registration: null,
};
const listeners = new Set<(value: PwaRuntimeState) => void>();
let updateReloadPending = false;
let runtimeListenersInstalled = false;
let registrationPromise: Promise<void> | null = null;
let updateTimer: number | null = null;

function publish(changes: Partial<PwaRuntimeState>): void {
  state = { ...state, ...changes };
  listeners.forEach((listener) => listener(state));
}

function normalizedDirectory(pathname: string): string {
  const normalized = pathname.replace(/\/{2,}/g, "/");
  const directory = normalized.endsWith("/") ? normalized : normalized.slice(0, normalized.lastIndexOf("/") + 1);
  return directory || "/";
}

export function resolvePwaRouteContext(baseUri: string): PwaRouteContext {
  const pathname = normalizedDirectory(new URL(baseUri, "https://pwa.invalid/").pathname);
  if (/^\/canary\/previous\/$/i.test(pathname)) {
    return { basePath: pathname, routeKey: "previous", register: false };
  }
  const canary = pathname.match(/^\/canary\/([^/]+)\//i);
  if (canary) {
    const releaseId = canary[1].replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 160) || "unknown";
    return { basePath: pathname, routeKey: `canary-${releaseId}`, register: false };
  }
  return { basePath: "/", routeKey: "root", register: true };
}

export function createPwaWorkerUrl(buildId: string, context: PwaRouteContext): string {
  const parameters = new URLSearchParams({
    v: buildId,
    route: context.routeKey,
    base: context.basePath,
  });
  return `/sw.js?${parameters.toString()}`;
}

export function shouldRegisterPwa(
  platform: "web" | "desktop" | "android",
  production: boolean,
  supported: boolean,
  context: PwaRouteContext,
): boolean {
  return platform === "web" && production && supported && context.register;
}

function parseVersionMetadata(value: unknown): VersionMetadata | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.version !== "string" || !record.version.trim()) return null;
  if (typeof record.buildId !== "string" || !record.buildId.trim()) return null;
  return { version: record.version, buildId: record.buildId };
}

function downloadedStatus(registration: ServiceWorkerRegistration | null): Partial<PwaRuntimeState> | null {
  if (!registration?.waiting) return null;
  return {
    registration,
    updateAvailable: true,
    updateStatus: "downloaded-await-restart",
    networkAvailable: typeof navigator.onLine === "boolean" ? navigator.onLine : null,
  };
}

function pwaVersionUrl(): URL {
  const context = resolvePwaRouteContext(document.baseURI);
  const url = new URL("version.json", new URL(context.basePath, window.location.origin));
  url.searchParams.set("t", String(Date.now()));
  return url;
}

function isNetworkUnavailable(): boolean {
  return typeof navigator.onLine === "boolean" && !navigator.onLine;
}

export function getPwaRuntimeState(): PwaRuntimeState {
  return state;
}

export function subscribePwaRuntime(listener: (value: PwaRuntimeState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export async function checkPwaVersion(
  registration: ServiceWorkerRegistration | null = state.registration,
  fetchVersion: typeof fetch = fetch,
): Promise<PwaUpdateStatus> {
  const waiting = downloadedStatus(registration);
  if (waiting) {
    publish(waiting);
    return "downloaded-await-restart";
  }

  publish({
    updateStatus: "checking",
    networkAvailable: typeof navigator.onLine === "boolean" ? navigator.onLine : null,
  });

  try {
    const response = await fetchVersion(pwaVersionUrl(), {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    const workerStatus = response.headers.get(VERSION_STATUS_HEADER);
    const fallback = response.headers.get(VERSION_FALLBACK_HEADER) === "last-known-version";
    if (!response.ok) throw new Error(`PWA version check returned HTTP ${response.status}`);
    const metadata = parseVersionMetadata(await response.json());
    if (!metadata) throw new Error("PWA version metadata is invalid");

    if (workerStatus === "network-unavailable") {
      publish({
        latestBuildId: metadata.buildId,
        lastCheckedAt: Date.now(),
        networkAvailable: false,
        updateStatus: state.usingStableFallback ? "stable-fallback" : "network-unavailable",
      });
      return state.usingStableFallback ? "stable-fallback" : "network-unavailable";
    }
    if (workerStatus === "version-check-failed" || fallback) {
      publish({
        latestBuildId: metadata.buildId,
        lastCheckedAt: Date.now(),
        networkAvailable: !isNetworkUnavailable(),
        updateStatus: "version-check-failed",
      });
      return "version-check-failed";
    }

    if (registration) {
      await registration.update();
      const afterUpdate = downloadedStatus(registration);
      if (afterUpdate) {
        publish({ ...afterUpdate, latestBuildId: metadata.buildId, lastCheckedAt: Date.now() });
        return "downloaded-await-restart";
      }
    }

    const nextStatus: PwaUpdateStatus = metadata.buildId === CURRENT_BUILD_ID ? "up-to-date" : "checking";
    publish({
      latestBuildId: metadata.buildId,
      lastCheckedAt: Date.now(),
      networkAvailable: true,
      updateStatus: nextStatus,
      usingStableFallback: false,
    });
    return nextStatus;
  } catch (error) {
    const nextStatus: PwaUpdateStatus = state.usingStableFallback
      ? "stable-fallback"
      : isNetworkUnavailable() || error instanceof TypeError
      ? "network-unavailable"
      : "version-check-failed";
    publish({
      lastCheckedAt: Date.now(),
      networkAvailable: nextStatus === "network-unavailable" || nextStatus === "stable-fallback" ? false : state.networkAvailable,
      updateStatus: nextStatus,
    });
    return nextStatus;
  }
}

export function consumePwaWorkerStatus(value: unknown): boolean {
  const message = value as Partial<PwaWorkerStatusMessage> | null;
  if (message?.type !== "DSP_PWA_STATUS") return false;
  if (message.status === "stable-fallback") {
    publish({
      updateStatus: state.updateStatus === "downloaded-await-restart" ? state.updateStatus : "stable-fallback",
      networkAvailable: false,
      usingStableFallback: true,
    });
    return true;
  }
  if (message.status === "network-unavailable" || message.status === "version-check-failed") {
    if (state.updateStatus === "downloaded-await-restart") return true;
    publish({
      updateStatus: message.status,
      networkAvailable: message.status === "network-unavailable" ? false : state.networkAvailable,
    });
    return true;
  }
  return false;
}

function handleWorkerStatus(event: MessageEvent<unknown>): void {
  consumePwaWorkerStatus(event.data);
}

function installRuntimeListeners(): void {
  if (runtimeListenersInstalled) return;
  runtimeListenersInstalled = true;
  navigator.serviceWorker.addEventListener("message", handleWorkerStatus);
  window.addEventListener("offline", () => {
    if (state.updateStatus === "downloaded-await-restart") return;
    publish({ networkAvailable: false, updateStatus: "network-unavailable" });
  });
  window.addEventListener("online", () => {
    publish({ networkAvailable: true, usingStableFallback: false });
    void checkPwaVersion();
  });
  navigator.serviceWorker.controller?.postMessage({ type: "GET_PWA_STATUS" });
}

function observeRegistration(registration: ServiceWorkerRegistration): void {
  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        publish({
          registration,
          updateAvailable: true,
          updateStatus: "downloaded-await-restart",
        });
      } else if (worker.state === "redundant" && !registration.waiting && state.updateStatus === "checking") {
        publish({ updateStatus: isNetworkUnavailable() ? "network-unavailable" : "version-check-failed" });
      }
    });
  });
}

async function registerPwaOnce(): Promise<void> {
  const context = resolvePwaRouteContext(document.baseURI);
  // Canary and previous-stable pages are intentionally Web-only. They must
  // never replace the root registration; the active root worker also ignores
  // /canary/* requests, keeping all three route families isolated.
  if (!shouldRegisterPwa(CURRENT_APP_PLATFORM, import.meta.env.PROD, state.supported, context)) return;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    publish({ installAvailable: true });
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    publish({ installed: true, installAvailable: false });
  });
  installRuntimeListeners();

  try {
    const registration = await navigator.serviceWorker.register(createPwaWorkerUrl(CURRENT_BUILD_ID, context), {
      scope: context.basePath,
      updateViaCache: "none",
    });
    const waiting = downloadedStatus(registration);
    publish({
      registration,
      updateAvailable: Boolean(registration.waiting),
      updateStatus: waiting ? "downloaded-await-restart" : "checking",
    });
    observeRegistration(registration);
    await checkPwaVersion(registration);
    if (updateTimer != null) window.clearInterval(updateTimer);
    updateTimer = window.setInterval(() => void checkPwaVersion(registration), 30 * 60 * 1000);
  } catch {
    publish({
      registration: null,
      updateStatus: isNetworkUnavailable() ? "network-unavailable" : "version-check-failed",
      networkAvailable: isNetworkUnavailable() ? false : state.networkAvailable,
    });
  }
}

export async function registerPwa(): Promise<void> {
  registrationPromise ??= registerPwaOnce();
  await registrationPromise;
}

export async function requestPwaInstall(): Promise<boolean> {
  if (!installPrompt) return false;
  await installPrompt.prompt();
  const choice = await installPrompt.userChoice;
  if (choice.outcome === "accepted") {
    installPrompt = null;
    publish({ installAvailable: false });
    return true;
  }
  return false;
}

export function activateWaitingPwaWorker(
  worker: Pick<ServiceWorker, "postMessage">,
  serviceWorker: Pick<ServiceWorkerContainer, "addEventListener"> = navigator.serviceWorker,
): boolean {
  if (!updateReloadPending) {
    updateReloadPending = true;
    serviceWorker.addEventListener("controllerchange", () => {
      updateReloadPending = false;
      window.location.reload();
    }, { once: true });
  }
  worker.postMessage({ type: "SKIP_WAITING" });
  return true;
}

export function applyPwaUpdate(): boolean {
  const worker = state.registration?.waiting;
  return worker ? activateWaitingPwaWorker(worker) : false;
}
