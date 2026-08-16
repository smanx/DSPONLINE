/**
 * M0 compatibility bridge switch for the global orbital station expansion.
 *
 * The 1.0.45 feature release enables the station by default. A bridge build
 * can be produced by setting VITE_SPACE_STATION_ENABLED=false (or "0"); that
 * build can read and preserve v47 saves without upgrading ordinary v46 saves.
 */

let featureEnabledOverride: boolean | undefined;

export function setSpaceStationFeatureEnabledForTest(value: boolean | undefined): void {
  featureEnabledOverride = value;
}

export function isSpaceStationFeatureEnabled(): boolean {
  if (featureEnabledOverride !== undefined) return featureEnabledOverride;
  if (typeof import.meta !== "undefined" && import.meta.env && typeof import.meta.env.VITE_SPACE_STATION_ENABLED === "string") {
    const raw = import.meta.env.VITE_SPACE_STATION_ENABLED.trim().toLowerCase();
    return raw !== "false" && raw !== "0";
  }
  return true;
}

export const SPACE_STATION_STATE_VERSION = 47 as const;
