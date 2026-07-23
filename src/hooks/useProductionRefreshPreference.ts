import { useCallback, useEffect, useState } from "react";
import { isProductionRefreshPreference, type ProductionRefreshPreference } from "../game/productionRefresh";

export const PRODUCTION_REFRESH_PREFERENCE_KEY = "dsp-idle-network.production-refresh.v1";

function initialPreference(): ProductionRefreshPreference {
  if (typeof window === "undefined") return "auto";
  try {
    const value = window.localStorage.getItem(PRODUCTION_REFRESH_PREFERENCE_KEY);
    return isProductionRefreshPreference(value) ? value : "auto";
  } catch {
    return "auto";
  }
}

export function useProductionRefreshPreference(): [ProductionRefreshPreference, (preference: ProductionRefreshPreference) => void] {
  const [preference, setPreferenceState] = useState<ProductionRefreshPreference>(initialPreference);

  useEffect(() => {
    try { window.localStorage.setItem(PRODUCTION_REFRESH_PREFERENCE_KEY, preference); } catch { /* Device UI preference is best-effort. */ }
  }, [preference]);

  const setPreference = useCallback((next: ProductionRefreshPreference) => setPreferenceState(next), []);
  return [preference, setPreference];
}
