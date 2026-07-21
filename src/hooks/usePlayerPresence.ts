import { useEffect } from "react";
import { sendPlayerPresenceHeartbeat } from "../game/presence";

const HEARTBEAT_INTERVAL_MS = 45_000;
const MINIMUM_IMMEDIATE_INTERVAL_MS = 10_000;
let lastHeartbeatAt = 0;

export function usePlayerPresence(): void {
  useEffect(() => {
    const heartbeat = () => {
      if (document.visibilityState === "hidden" || Date.now() - lastHeartbeatAt < MINIMUM_IMMEDIATE_INTERVAL_MS) return;
      lastHeartbeatAt = Date.now();
      void sendPlayerPresenceHeartbeat();
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
    document.addEventListener("visibilitychange", heartbeat);
    window.addEventListener("focus", heartbeat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", heartbeat);
      window.removeEventListener("focus", heartbeat);
    };
  }, []);
}
