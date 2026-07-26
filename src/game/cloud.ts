import type { LeaderboardCategoryId, LeaderboardMetrics } from "./leaderboard";
import { apiFetch } from "./apiTransport";

export const CLOUD_TOKEN_STORAGE_KEY = "dsp-idle-network.cloud-token.v1";
export const CLOUD_SYNC_STORAGE_KEY = "dsp-idle-network.cloud-sync.v1";
export const CLOUD_AUTO_SYNC_STORAGE_KEY = "dsp-idle-network.cloud-auto-sync.v1";
export const CLOUD_AUTO_SYNC_INTERVAL_MS = 10 * 60 * 1000;
export const CLOUD_SAVE_SLOTS = ["main", "1", "2", "3"] as const;
export type CloudSaveSlot = typeof CLOUD_SAVE_SLOTS[number];

let inMemoryCloudToken: string | null = null;
let preferInMemoryCloudToken = false;

export interface CloudUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  createdAt: number;
  emailVerified: boolean;
  emailVerifiedAt: number | null;
  passwordChangedAt: number;
  leaderboardVisible: boolean;
}

export interface CloudAccountSession {
  id: string;
  deviceName: string;
  clientType: "desktop" | "mobile-web" | "desktop-web" | string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  current: boolean;
}

export interface CloudAccountExport {
  exportedAt: number;
  schemaVersion: number;
  user: CloudUser;
  cloudSave: CloudSave | null;
  cloudSaveHistory: CloudSaveMetadata[];
  cloudSaveSlots?: Partial<Record<Exclude<CloudSaveSlot, "main">, CloudSave>>;
  cloudSaveSlotHistory?: Partial<Record<Exclude<CloudSaveSlot, "main">, CloudSaveMetadata[]>>;
  submissions: unknown[];
  feedback: unknown[];
  errors: unknown[];
}

export interface CloudSaveMetadata {
  slot?: CloudSaveSlot;
  revision: number;
  updatedAt: number;
  size: number;
  checksum: string;
  summary: CloudSaveSummary | null;
  restoredFromRevision?: number;
}

export interface CloudSaveSummary {
  stateVersion: number;
  savedAt: number;
  elapsedSeconds: number;
  activePlanetId: string;
  entityCount: number;
  completedTechCount: number;
  structurePoints: number;
  uploadedWhiteMatrix: number;
  stateChecksum: string | null;
}

export interface CloudSyncMarker {
  userId: string;
  slot?: CloudSaveSlot;
  revision: number;
  cloudChecksum: string;
  stateChecksum: string | null;
  syncedAt: number;
}

export type CloudSyncState = "empty" | "local-only" | "cloud-only" | "synced" | "local-newer" | "cloud-newer" | "conflict" | "unbound";

export interface CloudSyncComparison {
  state: CloudSyncState;
  marker: CloudSyncMarker | null;
  local: CloudSaveSummary | null;
  cloud: CloudSaveMetadata | null;
  localChanged: boolean;
  cloudChanged: boolean;
}

export interface CloudSave extends CloudSaveMetadata {
  payload: string;
}

export interface CloudSession {
  status: "checking" | "offline" | "anonymous" | "authenticated";
  user: CloudUser | null;
  cloudSave: CloudSaveMetadata | null;
  cloudSaves?: Record<CloudSaveSlot, CloudSaveMetadata | null>;
  mailAvailable: boolean;
  message: string | null;
}

export interface CloudAutoSyncStatus {
  userId: string;
  state: "success" | "error" | "conflict" | "skipped";
  attemptedAt: number;
  uploadedAt: number | null;
  revision: number | null;
  message: string;
}

export interface CloudLeaderboardEntry {
  userId: string;
  accountId: string;
  displayName: string;
  avatar: string;
  seasonId: string;
  metrics: LeaderboardMetrics;
  submittedAt: number;
  value: number;
  verified: boolean;
  rank: number;
}

export interface CloudPublicStatus {
  ok: boolean;
  timeZone: string;
  today: string;
  uptimeSeconds: number;
  players: {
    total: number;
    today: number;
    online: number;
    onlineWindowSeconds: number;
  };
  activity?: {
    enabled: boolean;
    status: "disabled" | "scheduled" | "active" | "ended";
    serverNow: number;
    reason?: string | null;
    id?: string;
    revision?: string | null;
    startsAtMs?: number;
    endsAtMs?: number;
    personalTargets?: Record<"universe_matrix" | "solar_sail" | "small_carrier_rocket" | "antimatter_fuel_rod", number>;
    globalTargets?: Record<"universe_matrix" | "solar_sail" | "small_carrier_rocket" | "antimatter_fuel_rod", number>;
    globalDelivered?: Record<"universe_matrix" | "solar_sail" | "small_carrier_rocket" | "antimatter_fuel_rod", number>;
  };
}

export class CloudApiError extends Error {
  constructor(message: string, readonly status: number, readonly payload: Record<string, unknown> = {}) {
    super(message);
  }
}

function apiBase(allowInsecurePublicRead = false): string | null {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (typeof __APP_PLATFORM__ !== "undefined" && __APP_PLATFORM__ !== "web") return null;
  if (typeof window === "undefined" || window.location.protocol === "file:") return null;
  const localDevelopment = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  if (window.location.protocol !== "https:" && !localDevelopment && !allowInsecurePublicRead) return null;
  return "/api";
}

export function getCloudToken(): string | null {
  try {
    const storedToken = window.localStorage.getItem(CLOUD_TOKEN_STORAGE_KEY);
    if (preferInMemoryCloudToken) {
      if (storedToken === inMemoryCloudToken) preferInMemoryCloudToken = false;
      return inMemoryCloudToken;
    }
    inMemoryCloudToken = storedToken;
    return storedToken;
  } catch {
    return inMemoryCloudToken;
  }
}

function setCloudToken(token: string | null): void {
  inMemoryCloudToken = token;
  try {
    if (token) window.localStorage.setItem(CLOUD_TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(CLOUD_TOKEN_STORAGE_KEY);
    preferInMemoryCloudToken = false;
  } catch {
    // Keep the current session usable without allowing a stale persisted token
    // to override an explicit login or logout while storage is unavailable.
    preferInMemoryCloudToken = true;
  }
}

function readCloudSyncMarkers(): Record<string, CloudSyncMarker> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CLOUD_SYNC_STORAGE_KEY) ?? "{}") as Record<string, CloudSyncMarker>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeCloudSyncMarkers(markers: Record<string, CloudSyncMarker>): void {
  try { window.localStorage.setItem(CLOUD_SYNC_STORAGE_KEY, JSON.stringify(markers)); } catch { /* optional sync metadata */ }
}

function cloudMarkerKey(userId: string, slot: CloudSaveSlot): string {
  return `${userId}:${slot}`;
}

export function emptyCloudSaveSlots(main: CloudSaveMetadata | null = null): Record<CloudSaveSlot, CloudSaveMetadata | null> {
  return { main, "1": null, "2": null, "3": null };
}

function normalizedCloudSaveSlots(
  main: CloudSaveMetadata | null,
  slots?: Partial<Record<CloudSaveSlot, CloudSaveMetadata | null>>,
): Record<CloudSaveSlot, CloudSaveMetadata | null> {
  return Object.fromEntries(CLOUD_SAVE_SLOTS.map((slot) => {
    const save = slots?.[slot] ?? (slot === "main" ? main : null);
    return [slot, save ? { ...save, slot } : null];
  })) as Record<CloudSaveSlot, CloudSaveMetadata | null>;
}

export function summarizeCloudPayload(payload: string): CloudSaveSummary | null {
  try {
    const parsed = JSON.parse(payload) as Record<string, any>;
    const state = parsed?.state ?? parsed;
    if (!state || typeof state !== "object" || !Array.isArray(state.entities)) return null;
    return {
      stateVersion: typeof state.version === "number" ? Math.max(0, Math.floor(state.version)) : 0,
      savedAt: typeof parsed.savedAt === "number" ? Math.max(0, Math.floor(parsed.savedAt)) : 0,
      elapsedSeconds: typeof state.elapsedSeconds === "number" ? Math.max(0, Math.floor(state.elapsedSeconds)) : 0,
      activePlanetId: typeof state.activePlanetId === "string" ? state.activePlanetId : "home",
      entityCount: state.entities.length,
      completedTechCount: Array.isArray(state.research?.completedTechIds) ? state.research.completedTechIds.length : 0,
      structurePoints: typeof state.dysonSphere?.structurePoints === "number" ? Math.max(0, Math.floor(state.dysonSphere.structurePoints)) : 0,
      uploadedWhiteMatrix: typeof state.totalProduced?.universe_matrix === "number" ? Math.max(0, Math.floor(state.totalProduced.universe_matrix)) : 0,
      stateChecksum: typeof parsed.checksum === "string" ? parsed.checksum : null,
    };
  } catch {
    return null;
  }
}

export function getCloudSyncMarker(userId: string, slot: CloudSaveSlot = "main"): CloudSyncMarker | null {
  const markers = readCloudSyncMarkers();
  const marker = markers[cloudMarkerKey(userId, slot)] ?? (slot === "main" ? markers[userId] : undefined);
  return marker && marker.userId === userId && (!marker.slot || marker.slot === slot) ? { ...marker, slot } : null;
}

export function markCloudSaveSynchronized(userId: string, cloudSave: CloudSaveMetadata, payload?: string, requestedSlot?: CloudSaveSlot): void {
  const slot = requestedSlot ?? cloudSave.slot ?? "main";
  const markers = readCloudSyncMarkers();
  markers[cloudMarkerKey(userId, slot)] = {
    userId,
    slot,
    revision: cloudSave.revision,
    cloudChecksum: cloudSave.checksum,
    stateChecksum: cloudSave.summary?.stateChecksum ?? (payload ? summarizeCloudPayload(payload)?.stateChecksum ?? null : null),
    syncedAt: Date.now(),
  };
  writeCloudSyncMarkers(markers);
}

export function clearCloudSyncMarker(userId: string, slot?: CloudSaveSlot): void {
  const markers = readCloudSyncMarkers();
  if (slot) {
    delete markers[cloudMarkerKey(userId, slot)];
    if (slot === "main") delete markers[userId];
  } else {
    delete markers[userId];
    for (const candidate of CLOUD_SAVE_SLOTS) delete markers[cloudMarkerKey(userId, candidate)];
  }
  writeCloudSyncMarkers(markers);
}

export function compareCloudSave(userId: string, localPayload: string | null, cloudSave: CloudSaveMetadata | null, slot: CloudSaveSlot = "main"): CloudSyncComparison {
  const marker = getCloudSyncMarker(userId, slot);
  const local = localPayload ? summarizeCloudPayload(localPayload) : null;
  if (!local && !cloudSave) return { state: "empty", marker, local, cloud: cloudSave, localChanged: false, cloudChanged: false };
  if (local && !cloudSave) return { state: "local-only", marker, local, cloud: cloudSave, localChanged: true, cloudChanged: false };
  if (!local && cloudSave) return { state: "cloud-only", marker, local, cloud: cloudSave, localChanged: false, cloudChanged: true };
  if (!local || !cloudSave) return { state: "unbound", marker, local, cloud: cloudSave, localChanged: true, cloudChanged: true };
  if (!marker) {
    const sameState = Boolean(local.stateChecksum && cloudSave.summary?.stateChecksum && local.stateChecksum === cloudSave.summary.stateChecksum);
    return { state: sameState ? "synced" : "unbound", marker, local, cloud: cloudSave, localChanged: !sameState, cloudChanged: !sameState };
  }
  const localChanged = local.stateChecksum !== marker.stateChecksum;
  const cloudChanged = cloudSave.revision !== marker.revision || cloudSave.checksum !== marker.cloudChecksum;
  const state: CloudSyncState = localChanged && cloudChanged
    ? "conflict"
    : localChanged ? "local-newer"
      : cloudChanged ? "cloud-newer"
        : "synced";
  return { state, marker, local, cloud: cloudSave, localChanged, cloudChanged };
}

export function readCloudAutoSyncStatus(userId?: string): CloudAutoSyncStatus | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CLOUD_AUTO_SYNC_STORAGE_KEY) ?? "null") as CloudAutoSyncStatus | null;
    return parsed && (!userId || parsed.userId === userId) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCloudAutoSyncStatus(status: CloudAutoSyncStatus): void {
  try { window.localStorage.setItem(CLOUD_AUTO_SYNC_STORAGE_KEY, JSON.stringify(status)); } catch { /* optional status */ }
}

async function cloudRequest<T>(path: string, options: RequestInit = {}, authenticated = false, allowInsecurePublicRead = false): Promise<T> {
  const base = apiBase(allowInsecurePublicRead);
  if (!base) throw new CloudApiError(
    typeof window !== "undefined" && window.location.protocol === "http:"
      ? "云账户仅在 HTTPS 安全入口开放"
      : "原生应用未配置云服务地址",
    0,
  );
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8_000);
  const token = authenticated ? getCloudToken() : null;
  try {
    const response = await apiFetch(`${base}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new CloudApiError(typeof payload.error === "string" ? payload.error : `云服务返回 ${response.status}`, response.status, payload);
    return payload as T;
  } catch (error) {
    if (error instanceof CloudApiError) throw error;
    throw new CloudApiError(error instanceof DOMException && error.name === "AbortError" ? "云服务连接超时" : "无法连接云服务", 0);
  } finally {
    window.clearTimeout(timer);
  }
}

export async function resumeCloudSession(): Promise<CloudSession> {
  try {
    const health = await cloudRequest<{ ok: boolean; mailProvider?: string }>("/health", {}, false, true);
    const mailAvailable = Boolean(health.mailProvider && health.mailProvider !== "disabled");
    const token = getCloudToken();
    if (!token) return { status: "anonymous", user: null, cloudSave: null, mailAvailable, message: null };
    try {
      const account = await cloudRequest<{ user: CloudUser; cloudSave: CloudSaveMetadata | null; cloudSaves?: Partial<Record<CloudSaveSlot, CloudSaveMetadata | null>> }>("/account", {}, true);
      const cloudSaves = normalizedCloudSaveSlots(account.cloudSave, account.cloudSaves);
      return { status: "authenticated", user: account.user, cloudSave: cloudSaves.main, cloudSaves, mailAvailable, message: null };
    } catch (error) {
      if (error instanceof CloudApiError && error.status === 401) setCloudToken(null);
      return { status: "anonymous", user: null, cloudSave: null, mailAvailable, message: error instanceof Error ? error.message : null };
    }
  } catch (error) {
    return { status: "offline", user: null, cloudSave: null, mailAvailable: false, message: error instanceof Error ? error.message : "云服务离线" };
  }
}

export async function registerCloudAccount(username: string, password: string, displayName: string): Promise<CloudSession> {
  const result = await cloudRequest<{ token: string; user: CloudUser; mailAvailable?: boolean }>("/auth/register", { method: "POST", body: JSON.stringify({ username, password, displayName }) });
  setCloudToken(result.token);
  return { status: "authenticated", user: result.user, cloudSave: null, cloudSaves: emptyCloudSaveSlots(), mailAvailable: result.mailAvailable === true, message: null };
}

export async function loginCloudAccount(identifier: string, password: string): Promise<CloudSession> {
  const result = await cloudRequest<{ token: string; user: CloudUser }>("/auth/login", { method: "POST", body: JSON.stringify({ identifier, password }) });
  setCloudToken(result.token);
  const resumed = await resumeCloudSession();
  return resumed.status === "authenticated" ? resumed : { status: "authenticated", user: result.user, cloudSave: null, cloudSaves: emptyCloudSaveSlots(), mailAvailable: resumed.mailAvailable, message: null };
}

export async function logoutCloudAccount(): Promise<void> {
  try { await cloudRequest("/auth/logout", { method: "POST" }, true); } finally { setCloudToken(null); }
}

export async function verifyCloudEmail(token: string): Promise<CloudUser> {
  const result = await cloudRequest<{ user: CloudUser }>("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
  return result.user;
}

export async function resendCloudVerification(): Promise<void> {
  await cloudRequest("/auth/resend-verification", { method: "POST" }, true);
}

export async function bindCloudEmail(email: string): Promise<CloudUser> {
  const result = await cloudRequest<{ user: CloudUser }>("/account/email", {
    method: "POST",
    body: JSON.stringify({ email }),
  }, true);
  return result.user;
}

export async function requestCloudPasswordReset(email: string): Promise<string> {
  const result = await cloudRequest<{ message: string }>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
  return result.message;
}

export async function resetCloudPassword(token: string, password: string): Promise<CloudSession> {
  const result = await cloudRequest<{ token: string; user: CloudUser }>("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
  setCloudToken(result.token);
  const resumed = await resumeCloudSession();
  return resumed.status === "authenticated" ? resumed : { status: "authenticated", user: result.user, cloudSave: null, cloudSaves: emptyCloudSaveSlots(), mailAvailable: resumed.mailAvailable, message: null };
}

export async function changeCloudPassword(currentPassword: string, newPassword: string): Promise<CloudUser> {
  const result = await cloudRequest<{ user: CloudUser }>("/account/password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  }, true);
  return result.user;
}

export async function fetchCloudSessions(): Promise<CloudAccountSession[]> {
  const result = await cloudRequest<{ sessions: CloudAccountSession[] }>("/account/sessions", {}, true);
  return result.sessions;
}

export async function revokeCloudSession(sessionId: string): Promise<{ currentSessionRevoked: boolean }> {
  const result = await cloudRequest<{ currentSessionRevoked: boolean }>("/account/sessions/revoke", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  }, true);
  if (result.currentSessionRevoked) setCloudToken(null);
  return result;
}

export async function exportCloudAccountData(): Promise<CloudAccountExport> {
  return cloudRequest<CloudAccountExport>("/account/export", {}, true);
}

export async function deleteCloudAccount(password: string): Promise<void> {
  await cloudRequest("/account/delete", {
    method: "POST",
    body: JSON.stringify({ password, confirmation: "DELETE" }),
  }, true);
  setCloudToken(null);
}

function cloudSaveQuery(slot: CloudSaveSlot, revision?: number): string {
  const parameters = new URLSearchParams();
  if (slot !== "main") parameters.set("slot", slot);
  if (revision) parameters.set("revision", String(revision));
  const query = parameters.toString();
  return query ? `?${query}` : "";
}

export async function uploadCloudSave(payload: string, expectedRevision: number, slot: CloudSaveSlot = "main"): Promise<CloudSaveMetadata> {
  const result = await cloudRequest<{ cloudSave: CloudSaveMetadata }>(`/cloud-save${cloudSaveQuery(slot)}`, { method: "PUT", body: JSON.stringify({ payload, expectedRevision }) }, true);
  return { ...result.cloudSave, slot };
}

export async function downloadCloudSave(revision?: number, slot: CloudSaveSlot = "main"): Promise<CloudSave | null> {
  const result = await cloudRequest<{ cloudSave: CloudSave | null }>(`/cloud-save${cloudSaveQuery(slot, revision)}`, {}, true);
  return result.cloudSave ? { ...result.cloudSave, slot } : null;
}

export async function fetchCloudSaveHistory(slot: CloudSaveSlot = "main"): Promise<CloudSaveMetadata[]> {
  const result = await cloudRequest<{ history: CloudSaveMetadata[] }>(`/cloud-save/history${cloudSaveQuery(slot)}`, {}, true);
  return result.history.map((save) => ({ ...save, slot }));
}

export async function restoreCloudSaveRevision(revision: number, expectedRevision: number, slot: CloudSaveSlot = "main"): Promise<CloudSaveMetadata> {
  const result = await cloudRequest<{ cloudSave: CloudSaveMetadata }>(`/cloud-save/restore${cloudSaveQuery(slot)}`, { method: "POST", body: JSON.stringify({ revision, expectedRevision }) }, true);
  return { ...result.cloudSave, slot };
}

export async function fetchCloudLeaderboard(category: LeaderboardCategoryId, seasonId: string): Promise<CloudLeaderboardEntry[]> {
  const result = await cloudRequest<{ entries: CloudLeaderboardEntry[] }>(`/leaderboard?category=${encodeURIComponent(category)}&seasonId=${encodeURIComponent(seasonId)}`, {}, false, true);
  return result.entries;
}

export async function fetchCloudPublicStatus(): Promise<CloudPublicStatus> {
  // This endpoint is anonymous and read-only. Account credentials remain blocked on public HTTP origins.
  return cloudRequest<CloudPublicStatus>("/public-status", {}, false, true);
}

export async function submitCloudLeaderboard(seasonId: string): Promise<void> {
  await cloudRequest("/leaderboard", { method: "POST", body: JSON.stringify({ seasonId }) }, true);
}

export async function setCloudLeaderboardVisibility(visible: boolean): Promise<CloudUser> {
  const result = await cloudRequest<{ user: CloudUser }>("/leaderboard/visibility", {
    method: "POST",
    body: JSON.stringify({ visible }),
  }, true);
  return result.user;
}

export async function sendCloudFeedback(kind: string, message: string, diagnostics: Record<string, unknown>): Promise<string> {
  const result = await cloudRequest<{ id: string }>("/feedback", { method: "POST", body: JSON.stringify({ kind, message, diagnostics }) }, Boolean(getCloudToken()));
  return result.id;
}

export async function reportCloudError(message: string, diagnostics: Record<string, unknown>): Promise<void> {
  try {
    await cloudRequest("/errors", { method: "POST", body: JSON.stringify({ kind: "client-error", message, diagnostics }) }, Boolean(getCloudToken()));
  } catch {
    // Error reporting must never cause another user-facing error.
  }
}
