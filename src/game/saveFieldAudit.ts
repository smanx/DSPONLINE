export type SaveFieldClass = "authority" | "runtime-cache" | "ui-observation" | "migration-only";

export interface SaveFieldAuditEntry {
  path: string;
  classification: SaveFieldClass;
  persisted: boolean;
  rationale: string;
}

/**
 * 1.0.36 P2 audit prototype. This is documentation-as-data only: it does not
 * remove, rewrite, or migrate a field. Runtime entries are reconstructed from
 * authoritative state whenever a simulation or Canvas session starts.
 */
export const SAVE_FIELD_AUDIT_V136: readonly SaveFieldAuditEntry[] = Object.freeze([
  { path: "GameState.entities[*].inputs/outputs", classification: "authority", persisted: true, rationale: "Exact inventory and conservation boundary." },
  { path: "GameState.belts[*].progress", classification: "authority", persisted: true, rationale: "Deterministic transport credit across save/load boundaries." },
  { path: "GameState.belts[*].lastFlow/congestion", classification: "authority", persisted: true, rationale: "Existing deterministic diagnostics; retained for v46 compatibility." },
  { path: "GameState.belts[*].totalTransferred", classification: "authority", persisted: true, rationale: "Lifetime throughput statistic." },
  { path: "GameState.entities[*].stationRoutes", classification: "authority", persisted: true, rationale: "In-flight cargo, vehicles and warpers." },
  { path: "GameState.quantumLogisticsNetwork.inventory", classification: "authority", persisted: true, rationale: "Exact shared material inventory." },
  { path: "SimulationLookupContext.beltRuntime", classification: "runtime-cache", persisted: false, rationale: "Active/blocked/source/target/item indexes rebuilt from belts and entities." },
  { path: "SimulationLookupContext.blockedStationDispatch", classification: "runtime-cache", persisted: false, rationale: "Dirty-slot snapshot; invalidated by topology or route-environment changes." },
  { path: "SimulationLookupContext.machineRuntimesByPlanet", classification: "runtime-cache", persisted: false, rationale: "Static recipe/building dimensions rebuilt per Worker state." },
  { path: "CanvasBeltHitIndex", classification: "runtime-cache", persisted: false, rationale: "Topology-scoped hit-test buckets." },
  { path: "BeltConnection.recentFlow*", classification: "ui-observation", persisted: false, rationale: "Storage migration intentionally strips transient sampling." },
  { path: "CanvasRenderSnapshot revisions", classification: "ui-observation", persisted: false, rationale: "Render publication counters only." },
  { path: "legacy missing save mode", classification: "migration-only", persisted: false, rationale: "Resolved safely to normal mode by the existing idempotent migration." },
]);

export function getSaveFieldAuditByClass(classification: SaveFieldClass): readonly SaveFieldAuditEntry[] {
  return SAVE_FIELD_AUDIT_V136.filter((entry) => entry.classification === classification);
}
