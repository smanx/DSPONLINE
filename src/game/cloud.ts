import type { LeaderboardCategoryId, LeaderboardMetrics } from "./leaderboard";

export const CLOUD_TOKEN_STORAGE_KEY = "dsp-idle-network.cloud-token.v1";
export const CLOUD_SYNC_STORAGE_KEY = "dsp-idle-network.cloud-sync.v1";

export interface CloudUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: number;
  emailVerified: boolean;
  emailVerifiedAt: number | null;
  passwordChangedAt: number;
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
  submissions: unknown[];
  feedback: unknown[];
  errors: unknown[];
}

export interface CloudSaveMetadata {
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
  message: string | null;
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
}

export class CloudApiError extends Error {
  constructor(message: string, readonly status: number, readonly payload: Record<string, unknown> = {}) {
    super(message);
  }
}

function apiBase(): string | null {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window === "undefined" || window.location.protocol === "file:") return null;
  const localDevelopment = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  if (window.location.protocol !== "https:" && !localDevelopment) return null;
  return "/api";
}

export function getCloudToken(): string | null {
  try { return window.localStorage.getItem(CLOUD_TOKEN_STORAGE_KEY); } catch { return null; }
}

function setCloudToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(CLOUD_TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(CLOUD_TOKEN_STORAGE_KEY);
  } catch {
    // A non-persistent session can still be used until the page is closed.
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

export function getCloudSyncMarker(userId: string): CloudSyncMarker | null {
  const marker = readCloudSyncMarkers()[userId];
  return marker && marker.userId === userId ? marker : null;
}

export function markCloudSaveSynchronized(userId: string, cloudSave: CloudSaveMetadata, payload?: string): void {
  const markers = readCloudSyncMarkers();
  markers[userId] = {
    userId,
    revision: cloudSave.revision,
    cloudChecksum: cloudSave.checksum,
    stateChecksum: cloudSave.summary?.stateChecksum ?? (payload ? summarizeCloudPayload(payload)?.stateChecksum ?? null : null),
    syncedAt: Date.now(),
  };
  writeCloudSyncMarkers(markers);
}

export function clearCloudSyncMarker(userId: string): void {
  const markers = readCloudSyncMarkers();
  delete markers[userId];
  writeCloudSyncMarkers(markers);
}

export function compareCloudSave(userId: string, localPayload: string | null, cloudSave: CloudSaveMetadata | null): CloudSyncComparison {
  const marker = getCloudSyncMarker(userId);
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

async function cloudRequest<T>(path: string, options: RequestInit = {}, authenticated = false): Promise<T> {
  const base = apiBase();
  if (!base) throw new CloudApiError(
    typeof window !== "undefined" && window.location.protocol === "http:"
      ? "云账户仅在 HTTPS 安全入口开放"
      : "桌面离线版本未配置云服务地址",
    0,
  );
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8_000);
  const token = authenticated ? getCloudToken() : null;
  try {
    const response = await fetch(`${base}${path}`, {
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
    await cloudRequest<{ ok: boolean }>("/health");
    const token = getCloudToken();
    if (!token) return { status: "anonymous", user: null, cloudSave: null, message: null };
    try {
      const account = await cloudRequest<{ user: CloudUser; cloudSave: CloudSaveMetadata | null }>("/account", {}, true);
      return { status: "authenticated", user: account.user, cloudSave: account.cloudSave, message: null };
    } catch (error) {
      if (error instanceof CloudApiError && error.status === 401) setCloudToken(null);
      return { status: "anonymous", user: null, cloudSave: null, message: error instanceof Error ? error.message : null };
    }
  } catch (error) {
    return { status: "offline", user: null, cloudSave: null, message: error instanceof Error ? error.message : "云服务离线" };
  }
}

export async function registerCloudAccount(email: string, password: string, displayName: string): Promise<CloudSession> {
  const result = await cloudRequest<{ token: string; user: CloudUser }>("/auth/register", { method: "POST", body: JSON.stringify({ email, password, displayName }) });
  setCloudToken(result.token);
  return { status: "authenticated", user: result.user, cloudSave: null, message: null };
}

export async function loginCloudAccount(email: string, password: string): Promise<CloudSession> {
  const result = await cloudRequest<{ token: string; user: CloudUser }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  setCloudToken(result.token);
  const resumed = await resumeCloudSession();
  return resumed.status === "authenticated" ? resumed : { status: "authenticated", user: result.user, cloudSave: null, message: null };
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

export async function requestCloudPasswordReset(email: string): Promise<string> {
  const result = await cloudRequest<{ message: string }>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
  return result.message;
}

export async function resetCloudPassword(token: string, password: string): Promise<CloudSession> {
  const result = await cloudRequest<{ token: string; user: CloudUser }>("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
  setCloudToken(result.token);
  const resumed = await resumeCloudSession();
  return resumed.status === "authenticated" ? resumed : { status: "authenticated", user: result.user, cloudSave: null, message: null };
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

export async function uploadCloudSave(payload: string, expectedRevision: number): Promise<CloudSaveMetadata> {
  const result = await cloudRequest<{ cloudSave: CloudSaveMetadata }>("/cloud-save", { method: "PUT", body: JSON.stringify({ payload, expectedRevision }) }, true);
  return result.cloudSave;
}

export async function downloadCloudSave(revision?: number): Promise<CloudSave | null> {
  const suffix = revision ? `?revision=${encodeURIComponent(revision)}` : "";
  const result = await cloudRequest<{ cloudSave: CloudSave | null }>(`/cloud-save${suffix}`, {}, true);
  return result.cloudSave;
}

export async function fetchCloudSaveHistory(): Promise<CloudSaveMetadata[]> {
  const result = await cloudRequest<{ history: CloudSaveMetadata[] }>("/cloud-save/history", {}, true);
  return result.history;
}

export async function restoreCloudSaveRevision(revision: number, expectedRevision: number): Promise<CloudSaveMetadata> {
  const result = await cloudRequest<{ cloudSave: CloudSaveMetadata }>("/cloud-save/restore", { method: "POST", body: JSON.stringify({ revision, expectedRevision }) }, true);
  return result.cloudSave;
}

export async function fetchCloudLeaderboard(category: LeaderboardCategoryId, seasonId: string): Promise<CloudLeaderboardEntry[]> {
  const result = await cloudRequest<{ entries: CloudLeaderboardEntry[] }>(`/leaderboard?category=${encodeURIComponent(category)}&seasonId=${encodeURIComponent(seasonId)}`);
  return result.entries;
}

export async function fetchCloudPublicStatus(): Promise<CloudPublicStatus> {
  return cloudRequest<CloudPublicStatus>("/public-status");
}

export async function submitCloudLeaderboard(metrics: LeaderboardMetrics, seasonId: string): Promise<void> {
  await cloudRequest("/leaderboard", { method: "POST", body: JSON.stringify({ metrics, seasonId }) }, true);
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
