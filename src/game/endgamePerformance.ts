export const ENDGAME_EXTREME_MODE_KEY = "dsp-idle-network.endgame-extreme.v1";
export const ENDGAME_EXTREME_MODE_ACK_KEY = "dsp-idle-network.endgame-extreme-ack.v1";

function readBoolean(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

export function readEndgameExtremeMode(): boolean {
  return readBoolean(ENDGAME_EXTREME_MODE_KEY);
}

export function writeEndgameExtremeMode(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled) window.localStorage.setItem(ENDGAME_EXTREME_MODE_KEY, "true");
    else window.localStorage.removeItem(ENDGAME_EXTREME_MODE_KEY);
  } catch {
    // Device-only preferences are best effort and never block gameplay.
  }
}

export function hasAcknowledgedEndgameExtremeMode(): boolean {
  return readBoolean(ENDGAME_EXTREME_MODE_ACK_KEY);
}

export function acknowledgeEndgameExtremeMode(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(ENDGAME_EXTREME_MODE_ACK_KEY, "true"); } catch { /* optional preference */ }
}
