export const PLAYER_ID_STORAGE_KEY = "dsp-idle-network.player-id.v1";

const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{16,96}$/;
let memoryPlayerId: string | null = null;

function createPlayerId(): string {
  if (typeof window.crypto?.randomUUID === "function") {
    return `player_${window.crypto.randomUUID().replaceAll("-", "")}`;
  }
  if (typeof window.crypto?.getRandomValues === "function") {
    const bytes = window.crypto.getRandomValues(new Uint8Array(16));
    return `player_${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
  }
  return `player_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function getOrCreatePlayerId(): string {
  if (memoryPlayerId) return memoryPlayerId;
  try {
    const stored = window.localStorage.getItem(PLAYER_ID_STORAGE_KEY);
    if (stored && PLAYER_ID_PATTERN.test(stored)) {
      memoryPlayerId = stored;
      return stored;
    }
  } catch {
    // A private browser session can still use one in-memory anonymous ID.
  }
  memoryPlayerId = createPlayerId();
  try { window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, memoryPlayerId); } catch { /* optional persistence */ }
  return memoryPlayerId;
}

function presenceApiBase(): string | null {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window === "undefined" || window.location.protocol === "file:") return null;
  return "/api";
}

export async function sendPlayerPresenceHeartbeat(): Promise<void> {
  const base = presenceApiBase();
  if (!base) return;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 5_000);
  try {
    await fetch(`${base}/presence`, {
      method: "POST",
      body: JSON.stringify({ playerId: getOrCreatePlayerId() }),
      headers: { "content-type": "application/json" },
      credentials: "omit",
      keepalive: true,
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
  } catch {
    // Presence is optional telemetry and must never interrupt gameplay.
  } finally {
    window.clearTimeout(timer);
  }
}
