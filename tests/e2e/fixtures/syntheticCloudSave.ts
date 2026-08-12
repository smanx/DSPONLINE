export interface SyntheticCloudSaveOptions {
  targetBytes?: number;
  savedAt?: number;
  mode?: "normal" | "speedrun";
}

function stateChecksum(formatVersion: number, state: unknown): string {
  const source = JSON.stringify({ formatVersion, state });
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createSyntheticCloudSave(options: SyntheticCloudSaveOptions = {}): string {
  const formatVersion = 2;
  const mode = options.mode ?? "normal";
  const targetBytes = Math.max(1_000_000, Math.floor(options.targetBytes ?? 7 * 1024 * 1024));
  const savedAt = options.savedAt ?? 1_800_000_000_000;
  const state = {
    version: 46,
    mode,
    paused: true,
    elapsedSeconds: 86_400,
    activePlanetId: "home",
    entities: [{ id: "synthetic-storage", kind: "building", buildingId: "storage_mk1", machineCount: 1, inventory: { iron_ore: 42 } }],
    belts: [],
    settings: {
      simulationSpeed: 1,
      autosaveIntervalSeconds: 60,
      productionBufferLimit: 1_000_000,
      logisticsBufferLimit: 1_000_000,
      beltBufferLimit: 100_000_000,
      proliferatorBufferLimit: 600,
      defaultBeltStackSize: 1,
      defaultBeltRouteMode: "direct",
      resourceMode: "finite",
      difficulty: "normal",
    },
    research: { completedTechIds: [], queue: [], activeTechId: null, progress: 0 },
    dysonSphere: { structurePoints: 0 },
    totalProduced: { iron_ore: 42 },
    totalConsumed: {},
    exploration: { unlockedSystemIds: ["helios"], colonizedPlanetIds: ["home"] },
    metrics: { generationKw: 0, totalItemsPerMinute: 0, rayGenerationKw: 0 },
    contentPacks: [],
    galaxy: { planetMetadata: {}, systemMetadata: {} },
    blueprints: [],
    blueprintVersions: [],
    constructionQueue: [],
    dysonPlans: {},
    padding: "",
  };
  let payload = "";
  let padding = Math.max(0, targetBytes - 2_000);
  do {
    state.padding = "x".repeat(padding);
    const envelope = { formatVersion, kind: "primary", savedAt, mode, slot: "main", state };
    payload = JSON.stringify({ ...envelope, checksum: stateChecksum(formatVersion, state) });
    padding += targetBytes - new TextEncoder().encode(payload).byteLength;
  } while (Math.abs(new TextEncoder().encode(payload).byteLength - targetBytes) > 8);
  return payload;
}
