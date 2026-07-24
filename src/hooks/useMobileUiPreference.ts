import { useCallback, useEffect, useState } from "react";

export type MobileUiPreference = "legacy" | "next";

export const MOBILE_UI_PREFERENCE_KEY = "dsp-idle-network.mobile-ui.v1";

function queryPreference(): MobileUiPreference | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("mobileUi");
  return value === "next" || value === "legacy" ? value : null;
}

function storedPreference(): MobileUiPreference | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(MOBILE_UI_PREFERENCE_KEY);
    return value === "next" || value === "legacy" ? value : null;
  } catch {
    return null;
  }
}

function initialPreference(): MobileUiPreference {
  return queryPreference() ?? storedPreference() ?? (__APP_PLATFORM__ === "android" ? "next" : "legacy");
}

export function useMobileUiPreference(): [MobileUiPreference, (preference: MobileUiPreference) => void] {
  const [preference, setPreferenceState] = useState<MobileUiPreference>(initialPreference);

  useEffect(() => {
    try { window.localStorage.setItem(MOBILE_UI_PREFERENCE_KEY, preference); } catch { /* UI preference is best-effort. */ }
  }, [preference]);

  useEffect(() => {
    const onPopState = () => {
      const explicit = queryPreference();
      if (explicit) setPreferenceState(explicit);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const setPreference = useCallback((next: MobileUiPreference) => {
    setPreferenceState(next);
    const url = new URL(window.location.href);
    url.searchParams.set("mobileUi", next);
    window.history.replaceState(window.history.state, "", url);
  }, []);

  return [preference, setPreference];
}
