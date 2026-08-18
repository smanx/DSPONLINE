/**
 * Selects the runtime save coordinator independently from the persisted save
 * format. The default is the 1.0.43-compatible verified-primary path: the
 * simulation Worker supplies a checkpoint, then the save Worker writes and
 * reads it back with the existing writer lease, backup, and checksum proof.
 *
 * The 1.0.44 durable WAL/recovery-head coordinator remains available only for
 * deliberate development validation. It must never become active merely
 * because an existing player save is opened. A space-station bridge always
 * keeps the stable coordinator, even when the experimental flag is present.
 */
export interface RuntimePersistenceEnvironment {
  VITE_DURABLE_RUNTIME_RECOVERY?: unknown;
  VITE_SPACE_STATION_ENABLED?: unknown;
}

export function resolveDurableSimulationRuntimeEnabled(environment: RuntimePersistenceEnvironment): boolean {
  const station = environment.VITE_SPACE_STATION_ENABLED;
  if (typeof station === "string" && ["false", "0", "off"].includes(station.trim().toLowerCase())) return false;
  const explicit = environment.VITE_DURABLE_RUNTIME_RECOVERY;
  return typeof explicit === "string" && ["true", "1", "on"].includes(explicit.trim().toLowerCase());
}

export function isDurableSimulationRuntimeEnabled(): boolean {
  const environment = typeof import.meta !== "undefined" && import.meta.env
    ? import.meta.env as RuntimePersistenceEnvironment
    : {};
  return resolveDurableSimulationRuntimeEnabled(environment);
}
