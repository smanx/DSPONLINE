import type { GameSettings, PlanetId, SaveMode } from "./types";
import { getLocalSaveValue, listLocalSaveKeys } from "./localSaveStore";

const SAVE_KEY = "dsp-idle-network.save.v1";
const SAVE_BACKUP_KEY = `${SAVE_KEY}.backup`;
const SAVE_SLOT_KEY_PREFIX = "dsp-idle-network.slot";
const SAVE_SNAPSHOT_KEY_PREFIX = `${SAVE_KEY}.snapshot`;

export type MenuSaveSource = "primary" | "backup" | "snapshot";

export interface MenuSaveSummary {
  mode: SaveMode;
  savedAt: number;
  elapsedSeconds: number;
  completedTechCount: number;
  structurePoints: number;
  activePlanetId: PlanetId;
}

export interface MenuContinueSave {
  source: MenuSaveSource;
  raw: string;
  summary: MenuSaveSummary;
  settings: Partial<GameSettings> | null;
}

export interface MenuSlotSummary extends MenuSaveSummary {
  slotId: 1 | 2 | 3;
  valid: true;
}

export interface MenuSnapshotSummary extends MenuSaveSummary {
  id: string;
  reason: string;
  valid: true;
}

const PLANET_NAMES: Record<PlanetId, string> = {
  home: "澄海 I",
  ashen: "烬原 II",
  giant: "苍岚 III",
  frost: "霜原 I",
  boreal_giant: "青冥 II",
  magnetar: "极夜 I",
  verdant: "翠环 I",
  pelagic: "澜渊 II",
  aurora_giant: "天穹 III",
  dune: "赤砂 I",
  cinder: "灰烬 II",
  ember_giant: "红飓 III",
  crystal: "晶穹 I",
  prairie: "牧云 II",
  sirius_giant: "银冠 III",
  salt: "白盐 I",
  obsidian: "黑曜 II",
  white_giant: "苍白 III",
  tempest: "风暴 I",
  inferno: "炽核 II",
  abyss: "幽冥 III",
  azure_giant: "蓝穹 IV",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function isPlanetId(value: unknown): value is PlanetId {
  return typeof value === "string" && value in PLANET_NAMES;
}

function snapshotKeys(mode: SaveMode = "normal"): string[] {
  const prefix = mode === "normal" ? SAVE_SNAPSHOT_KEY_PREFIX : `${SAVE_SNAPSHOT_KEY_PREFIX}.${mode}`;
  const sequenceKey = `${prefix}.sequence`;
  return listLocalSaveKeys()
    .filter((key) => mode === "speedrun"
      ? key.startsWith(`${prefix}.`) && key !== sequenceKey
      : key.startsWith(`${prefix}.`) && !key.startsWith(`${SAVE_SNAPSHOT_KEY_PREFIX}.speedrun.`) && key !== sequenceKey)
    .sort((left, right) => right.localeCompare(left));
}

function parsePreview(raw: string, fallbackMode: SaveMode = "normal"): { summary: MenuSaveSummary; settings: Partial<GameSettings> | null; reason: string } | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    const state = isRecord(parsed.state) ? parsed.state : parsed;
    if (!Array.isArray(state.entities) || !isRecord(state.research)) return null;
    const envelopeMode = parsed.mode === "speedrun" ? "speedrun" : parsed.mode === "normal" ? "normal" : null;
    const stateMode = state.mode === "speedrun" ? "speedrun" : state.mode === "normal" ? "normal" : null;
    if (envelopeMode && stateMode && envelopeMode !== stateMode) return null;
    const explicitMode = stateMode ?? envelopeMode;
    if (fallbackMode === "speedrun" ? explicitMode !== "speedrun" : explicitMode === "speedrun") return null;
    const completedTechIds = Array.isArray(state.research.completedTechIds) ? state.research.completedTechIds : [];
    const dysonSphere = isRecord(state.dysonSphere) ? state.dysonSphere : null;
    return {
      summary: {
        mode: explicitMode ?? fallbackMode,
        savedAt: nonNegativeInteger(parsed.savedAt),
        elapsedSeconds: nonNegativeInteger(state.elapsedSeconds),
        completedTechCount: completedTechIds.length,
        structurePoints: nonNegativeInteger(dysonSphere?.structurePoints),
        activePlanetId: isPlanetId(state.activePlanetId) ? state.activePlanetId : "home",
      },
      settings: isRecord(state.settings) ? state.settings as Partial<GameSettings> : null,
      reason: typeof parsed.reason === "string" && parsed.reason ? parsed.reason : "自动快照",
    };
  } catch {
    return null;
  }
}

function readPreview(key: string, mode: SaveMode = "normal"): ({ raw: string } & NonNullable<ReturnType<typeof parsePreview>>) | null {
  try {
    const raw = getLocalSaveValue(key);
    const preview = raw ? parsePreview(raw, mode) : null;
    return raw && preview ? { raw, ...preview } : null;
  } catch {
    return null;
  }
}

export function getMenuContinueSave(mode: SaveMode = "normal"): MenuContinueSave | null {
  const candidates: Array<{ source: MenuSaveSource; key: string }> = [
    { source: "primary", key: mode === "normal" ? SAVE_KEY : `${SAVE_KEY}.${mode}` },
    ...(mode === "speedrun" ? [{ source: "primary" as const, key: `${SAVE_KEY}.${mode}.emergency` }] : []),
    { source: "backup", key: mode === "normal" ? SAVE_BACKUP_KEY : `${SAVE_BACKUP_KEY}.${mode}` },
    ...snapshotKeys(mode).map((key) => ({ source: "snapshot" as const, key })),
  ];
  for (const candidate of candidates) {
    const preview = readPreview(candidate.key, mode);
    if (preview) return { source: candidate.source, raw: preview.raw, summary: preview.summary, settings: preview.settings };
  }
  return null;
}

export function getMenuSlotSummaries(mode: SaveMode = "normal"): MenuSlotSummary[] {
  return ([1, 2, 3] as const).flatMap((slotId) => {
    const modeKey = mode === "normal" ? `${SAVE_SLOT_KEY_PREFIX}.${slotId}` : `${SAVE_SLOT_KEY_PREFIX}.${mode}.${slotId}`;
    const preview = readPreview(modeKey, mode);
    return preview ? [{ slotId, ...preview.summary, valid: true as const }] : [];
  });
}

export function getMenuSnapshotSummaries(mode: SaveMode = "normal"): MenuSnapshotSummary[] {
  return snapshotKeys(mode).flatMap((key) => {
    const preview = readPreview(key, mode);
    if (!preview) return [];
    return [{
      id: key.includes(`${SAVE_SNAPSHOT_KEY_PREFIX}.${mode}.`) && mode !== "normal"
        ? key.slice(`${SAVE_SNAPSHOT_KEY_PREFIX}.${mode}.`.length)
        : key.slice(`${SAVE_SNAPSHOT_KEY_PREFIX}.`.length),
      ...preview.summary,
      reason: preview.reason,
      valid: true as const,
    }];
  }).sort((left, right) => right.savedAt - left.savedAt);
}

export function getMenuPlanetName(planetId: PlanetId): string {
  return PLANET_NAMES[planetId];
}
