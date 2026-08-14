import { MIB_BYTES } from "./saveSizePolicy";

export const LARGE_SAVE_AUTOSAVE_THRESHOLD_BYTES = 24 * MIB_BYTES;
export const LARGE_SAVE_AUTOSAVE_MIN_INTERVAL_SECONDS = 10 * 60;

export interface LargeSaveAutosavePolicyInput {
  configuredIntervalSeconds: number;
  /** Verified primary/catalog payload size. Unknown sizes do not guess. */
  persistedByteLength: number | null | undefined;
  /** Device-only preference; defaults to true at the preference boundary. */
  throttleEnabled: boolean;
}

export interface LargeSaveAutosavePolicy {
  configuredIntervalSeconds: number;
  effectiveIntervalSeconds: number;
  persistedByteLength: number | null;
  largeSave: boolean;
  throttled: boolean;
}

/**
 * Keep large-save background writes predictable without changing the saved
 * gameplay setting. Manual save, return-to-menu and export paths do not call
 * this policy and therefore remain immediate.
 */
export function resolveLargeSaveAutosavePolicy(
  input: LargeSaveAutosavePolicyInput,
): LargeSaveAutosavePolicy {
  const configuredIntervalSeconds = Number.isFinite(input.configuredIntervalSeconds)
    ? Math.max(0, Math.floor(input.configuredIntervalSeconds))
    : 0;
  const persistedByteLength = typeof input.persistedByteLength === "number" && Number.isFinite(input.persistedByteLength)
    ? Math.max(0, Math.floor(input.persistedByteLength))
    : null;
  const largeSave = persistedByteLength !== null && persistedByteLength >= LARGE_SAVE_AUTOSAVE_THRESHOLD_BYTES;
  const throttled = input.throttleEnabled && largeSave && configuredIntervalSeconds > 0 &&
    configuredIntervalSeconds < LARGE_SAVE_AUTOSAVE_MIN_INTERVAL_SECONDS;
  return {
    configuredIntervalSeconds,
    effectiveIntervalSeconds: throttled ? LARGE_SAVE_AUTOSAVE_MIN_INTERVAL_SECONDS : configuredIntervalSeconds,
    persistedByteLength,
    largeSave,
    throttled,
  };
}
