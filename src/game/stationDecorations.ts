import {
  addStationInteger,
  normalizeStationInteger,
  stationInteger,
  subtractStationInteger,
} from "./stationMath";
import type {
  OrbitalStationState,
  StationDecorationLayer,
  StationDecorationPlacement,
  StationDecorationRotation,
} from "./types";

export type StationDecorationCategory =
  | "structure"
  | "light"
  | "cargo"
  | "nature"
  | "robot"
  | "flag"
  | "hologram"
  | "window"
  | "trophy"
  | "monument";

export interface StationDecorationDefinition {
  id: string;
  name: string;
  englishName: string;
  category: StationDecorationCategory;
  description: string;
  markCost: string;
  minimumLevel: number;
  repeatable: boolean;
  width: number;
  height: number;
  layers: StationDecorationLayer[];
  rotations: StationDecorationRotation[];
  variantCount: number;
  animated: boolean;
  publicSafe: boolean;
  glyph: string;
  color: string;
}

export interface StationThemeDefinition {
  id: string;
  name: string;
  minimumLevel: number;
  markCost: string;
  background: string;
  accent: string;
}

export interface StationLevelDefinition {
  level: number;
  reputation: string;
  title: string;
  placementLimit: number;
  halfWidth: number;
  halfHeight: number;
}

export const STATION_LEVELS: StationLevelDefinition[] = [
  { level: 1, reputation: "0", title: "轨道新港", placementLimit: 16, halfWidth: 520, halfHeight: 320 },
  { level: 2, reputation: "100", title: "星际中继站", placementLimit: 32, halfWidth: 650, halfHeight: 380 },
  { level: 3, reputation: "300", title: "深空贸易港", placementLimit: 64, halfWidth: 760, halfHeight: 440 },
  { level: 4, reputation: "800", title: "银河展示枢纽", placementLimit: 112, halfWidth: 860, halfHeight: 500 },
  { level: 5, reputation: "2000", title: "文明纪念站", placementLimit: 176, halfWidth: 960, halfHeight: 560 },
  { level: 6, reputation: "5000", title: "群星会客厅", placementLimit: 256, halfWidth: 1080, halfHeight: 620 },
];

const STANDARD_ROTATIONS: StationDecorationRotation[] = [0, 90, 180, 270];
const FLOOR_LAYERS: StationDecorationLayer[] = [0];
const OBJECT_LAYERS: StationDecorationLayer[] = [1, 2];
const OVERLAY_LAYERS: StationDecorationLayer[] = [2, 3];

export const STATION_DECORATIONS: StationDecorationDefinition[] = [
  { id: "deck_grid", name: "核心甲板网格", englishName: "Core Deck Grid", category: "structure", description: "空间站标准化的发光甲板分区。", markCost: "0", minimumLevel: 1, repeatable: true, width: 160, height: 100, layers: FLOOR_LAYERS, rotations: STANDARD_ROTATIONS, variantCount: 3, animated: false, publicSafe: true, glyph: "▦", color: "#4fb8ac" },
  { id: "bulkhead_arc", name: "弧形舱壁", englishName: "Arc Bulkhead", category: "structure", description: "用于勾勒展示舱轮廓的模块化舱壁。", markCost: "35", minimumLevel: 1, repeatable: true, width: 120, height: 34, layers: OBJECT_LAYERS, rotations: STANDARD_ROTATIONS, variantCount: 2, animated: false, publicSafe: true, glyph: "⌒", color: "#90a9a4" },
  { id: "guide_light", name: "货运引导灯", englishName: "Cargo Guide Light", category: "light", description: "沿甲板连续布置的低亮度引导灯。", markCost: "25", minimumLevel: 1, repeatable: true, width: 52, height: 26, layers: OVERLAY_LAYERS, rotations: STANDARD_ROTATIONS, variantCount: 4, animated: true, publicSafe: true, glyph: "✦", color: "#75e4d2" },
  { id: "cargo_crate", name: "标准货柜组", englishName: "Standard Cargo Crates", category: "cargo", description: "带轨道出口识别码的密封货柜。", markCost: "30", minimumLevel: 1, repeatable: true, width: 72, height: 58, layers: OBJECT_LAYERS, rotations: STANDARD_ROTATIONS, variantCount: 4, animated: false, publicSafe: true, glyph: "▣", color: "#d39a4c" },
  { id: "service_robot", name: "甲板维护机器人", englishName: "Deck Service Robot", category: "robot", description: "按固定巡检动作工作的轻型维护机。", markCost: "80", minimumLevel: 2, repeatable: true, width: 54, height: 54, layers: OBJECT_LAYERS, rotations: STANDARD_ROTATIONS, variantCount: 3, animated: true, publicSafe: true, glyph: "◉", color: "#8bc7ff" },
  { id: "hydroponic_planter", name: "水培绿植舱", englishName: "Hydroponic Planter", category: "nature", description: "封闭循环的观赏植物模块。", markCost: "65", minimumLevel: 2, repeatable: true, width: 76, height: 54, layers: OBJECT_LAYERS, rotations: STANDARD_ROTATIONS, variantCount: 3, animated: false, publicSafe: true, glyph: "♧", color: "#77c77d" },
  { id: "observation_window", name: "深空观景窗", englishName: "Deep-space Window", category: "window", description: "显示当前空间站主题星景的安全舷窗。", markCost: "110", minimumLevel: 2, repeatable: true, width: 150, height: 72, layers: OBJECT_LAYERS, rotations: [0, 180], variantCount: 3, animated: true, publicSafe: true, glyph: "◫", color: "#5f8edb" },
  { id: "factory_flag", name: "工厂旗帜", englishName: "Factory Banner", category: "flag", description: "带有限预设纹样的空间站旗帜。", markCost: "90", minimumLevel: 2, repeatable: true, width: 58, height: 92, layers: OVERLAY_LAYERS, rotations: [0, 180], variantCount: 6, animated: true, publicSafe: true, glyph: "⚑", color: "#ee846f" },
  { id: "route_hologram", name: "航线全息图", englishName: "Route Hologram", category: "hologram", description: "以匿名化轨迹展示银河货运网络。", markCost: "150", minimumLevel: 3, repeatable: true, width: 118, height: 92, layers: OVERLAY_LAYERS, rotations: STANDARD_ROTATIONS, variantCount: 4, animated: true, publicSafe: true, glyph: "◎", color: "#69d9ff" },
  { id: "quantum_sculpture", name: "量子波雕塑", englishName: "Quantum Wave Sculpture", category: "monument", description: "将量子物流相位波转化为纯视觉装置。", markCost: "240", minimumLevel: 3, repeatable: true, width: 92, height: 116, layers: OBJECT_LAYERS, rotations: STANDARD_ROTATIONS, variantCount: 2, animated: true, publicSafe: true, glyph: "≋", color: "#b792ff" },
  { id: "contract_trophy", name: "百单纪念奖杯", englishName: "Contract Centurion Trophy", category: "trophy", description: "纪念持续完成轨道出口合同的唯一展品。", markCost: "400", minimumLevel: 4, repeatable: false, width: 86, height: 108, layers: OBJECT_LAYERS, rotations: STANDARD_ROTATIONS, variantCount: 1, animated: false, publicSafe: true, glyph: "♜", color: "#f2c35f" },
  { id: "dyson_monument", name: "戴森工程纪念碑", englishName: "Dyson Project Monument", category: "monument", description: "以缩尺结构记录恒星工程里程碑。", markCost: "650", minimumLevel: 5, repeatable: false, width: 150, height: 150, layers: OBJECT_LAYERS, rotations: STANDARD_ROTATIONS, variantCount: 1, animated: true, publicSafe: true, glyph: "◌", color: "#ffb86c" },
  { id: "galactic_beacon", name: "群星通讯信标", englishName: "Galactic Signal Beacon", category: "monument", description: "面向公共空间站主页的纯展示通讯信标。", markCost: "900", minimumLevel: 6, repeatable: false, width: 118, height: 170, layers: OBJECT_LAYERS, rotations: STANDARD_ROTATIONS, variantCount: 1, animated: true, publicSafe: true, glyph: "⌁", color: "#7ef0df" },
];

export const STATION_THEMES: StationThemeDefinition[] = [
  { id: "orbital_teal", name: "轨道青", minimumLevel: 1, markCost: "0", background: "#071310", accent: "#65d4c3" },
  { id: "solar_gold", name: "恒星金", minimumLevel: 2, markCost: "180", background: "#171108", accent: "#e7b85f" },
  { id: "nebula_violet", name: "星云紫", minimumLevel: 3, markCost: "260", background: "#100b19", accent: "#b692ef" },
  { id: "deep_blue", name: "深空蓝", minimumLevel: 4, markCost: "380", background: "#07101c", accent: "#72b7ed" },
];

const DECORATION_BY_ID = new Map(STATION_DECORATIONS.map((entry) => [entry.id, entry]));
const THEME_BY_ID = new Map(STATION_THEMES.map((entry) => [entry.id, entry]));
const FUNCTIONAL_ANCHORS = [
  { x: -270, y: -80, width: 260, height: 180 },
  { x: 80, y: -170, width: 250, height: 150 },
  { x: 270, y: 80, width: 230, height: 150 },
  { x: -10, y: 190, width: 250, height: 140 },
  { x: -365, y: 195, width: 210, height: 130 },
  { x: 410, y: -175, width: 220, height: 130 },
];

export function stationPointOverlapsFunctionalAnchor(x: number, y: number): boolean {
  return FUNCTIONAL_ANCHORS.some((anchor) => overlaps({ x, y, width: 0, height: 0 }, anchor));
}

export function getStationLevel(reputation: unknown): StationLevelDefinition {
  const value = stationInteger(reputation);
  return [...STATION_LEVELS].reverse().find((entry) => value >= stationInteger(entry.reputation)) ?? STATION_LEVELS[0];
}

export function getStationDecoration(id: string): StationDecorationDefinition | undefined {
  return DECORATION_BY_ID.get(id);
}

export function getStationTheme(id: string): StationThemeDefinition | undefined {
  return THEME_BY_ID.get(id);
}

function overlaps(left: { x: number; y: number; width: number; height: number }, right: { x: number; y: number; width: number; height: number }): boolean {
  return Math.abs(left.x - right.x) * 2 < left.width + right.width && Math.abs(left.y - right.y) * 2 < left.height + right.height;
}

function placementBounds(definition: StationDecorationDefinition, placement: Pick<StationDecorationPlacement, "x" | "y" | "rotation">) {
  const swapped = placement.rotation === 90 || placement.rotation === 270;
  return {
    x: placement.x,
    y: placement.y,
    width: swapped ? definition.height : definition.width,
    height: swapped ? definition.width : definition.height,
  };
}

export type StationDecorationPlacementCheck =
  | { ok: true; code: "ready" }
  | { ok: false; code: "locked" | "unknown" | "level" | "collection" | "limit" | "unique" | "position" | "rotation" | "layer" | "variant" | "anchor" };

export function getStationDecorationPlacementCheck(
  station: OrbitalStationState,
  decorationId: string,
  placement: Pick<StationDecorationPlacement, "x" | "y" | "rotation" | "layer" | "variant">,
  excludedPlacementId?: string,
): StationDecorationPlacementCheck {
  if (station.status !== "operational") return { ok: false, code: "locked" };
  const definition = getStationDecoration(decorationId);
  if (!definition) return { ok: false, code: "unknown" };
  const level = getStationLevel(station.economy.stationReputation);
  if (level.level < definition.minimumLevel) return { ok: false, code: "level" };
  if (definition.markCost !== "0" && !station.economy.unlockedDecorationIds.includes(decorationId)) return { ok: false, code: "collection" };
  const activeCount = station.layout.placements.filter((entry) => entry.id !== excludedPlacementId).length;
  if (activeCount >= level.placementLimit || activeCount >= 256) return { ok: false, code: "limit" };
  if (!definition.repeatable && station.layout.placements.some((entry) => entry.id !== excludedPlacementId && entry.decorationId === decorationId)) return { ok: false, code: "unique" };
  if (!Number.isFinite(placement.x) || !Number.isFinite(placement.y)) return { ok: false, code: "position" };
  if (!definition.rotations.includes(placement.rotation)) return { ok: false, code: "rotation" };
  if (!definition.layers.includes(placement.layer)) return { ok: false, code: "layer" };
  if (!Number.isSafeInteger(placement.variant) || placement.variant < 0 || placement.variant >= definition.variantCount) return { ok: false, code: "variant" };
  const bounds = placementBounds(definition, placement);
  if (Math.abs(bounds.x) + bounds.width / 2 > level.halfWidth || Math.abs(bounds.y) + bounds.height / 2 > level.halfHeight) return { ok: false, code: "position" };
  if (FUNCTIONAL_ANCHORS.some((anchor) => overlaps(bounds, anchor))) return { ok: false, code: "anchor" };
  return { ok: true, code: "ready" };
}

export function purchaseStationDecoration(station: OrbitalStationState, decorationId: string): OrbitalStationState {
  if (station.status !== "operational" || station.economy.unlockedDecorationIds.includes(decorationId)) return station;
  const definition = getStationDecoration(decorationId);
  if (!definition || getStationLevel(station.economy.stationReputation).level < definition.minimumLevel ||
    stationInteger(station.economy.orbitalMarks) < stationInteger(definition.markCost)) return station;
  return {
    ...station,
    economy: {
      ...station.economy,
      orbitalMarks: subtractStationInteger(station.economy.orbitalMarks, definition.markCost),
      unlockedDecorationIds: [...station.economy.unlockedDecorationIds, decorationId],
    },
  };
}

export function placeStationDecoration(
  station: OrbitalStationState,
  decorationId: string,
  placement: Pick<StationDecorationPlacement, "x" | "y" | "rotation" | "layer" | "variant">,
  nextId: string,
): OrbitalStationState {
  if (!nextId || station.layout.placements.some((entry) => entry.id === nextId) ||
    !getStationDecorationPlacementCheck(station, decorationId, placement).ok) return station;
  return {
    ...station,
    layout: { ...station.layout, placements: [...station.layout.placements, { id: nextId, decorationId, ...placement }] },
  };
}

export function updateStationDecoration(
  station: OrbitalStationState,
  placementId: string,
  patch: Partial<Pick<StationDecorationPlacement, "x" | "y" | "rotation" | "layer" | "variant">>,
): OrbitalStationState {
  const current = station.layout.placements.find((entry) => entry.id === placementId);
  if (!current) return station;
  const updated = { ...current, ...patch };
  if (!getStationDecorationPlacementCheck(station, current.decorationId, updated, placementId).ok) return station;
  return {
    ...station,
    layout: { ...station.layout, placements: station.layout.placements.map((entry) => entry.id === placementId ? updated : entry) },
  };
}

export function removeStationDecoration(station: OrbitalStationState, placementId: string): OrbitalStationState {
  if (!station.layout.placements.some((entry) => entry.id === placementId)) return station;
  return { ...station, layout: { ...station.layout, placements: station.layout.placements.filter((entry) => entry.id !== placementId) } };
}

export function purchaseStationTheme(station: OrbitalStationState, themeId: string): OrbitalStationState {
  const theme = getStationTheme(themeId);
  const licenseId = `theme:${themeId}`;
  if (station.status !== "operational" || !theme || station.economy.unlockedDecorationIds.includes(licenseId) ||
    getStationLevel(station.economy.stationReputation).level < theme.minimumLevel ||
    stationInteger(station.economy.orbitalMarks) < stationInteger(theme.markCost)) return station;
  return {
    ...station,
    economy: {
      ...station.economy,
      orbitalMarks: subtractStationInteger(station.economy.orbitalMarks, theme.markCost),
      unlockedDecorationIds: [...station.economy.unlockedDecorationIds, licenseId],
    },
  };
}

export function setStationTheme(station: OrbitalStationState, themeId: string): OrbitalStationState {
  const theme = getStationTheme(themeId);
  if (!theme || getStationLevel(station.economy.stationReputation).level < theme.minimumLevel ||
    (theme.markCost !== "0" && !station.economy.unlockedDecorationIds.includes(`theme:${themeId}`))) return station;
  return station.layout.themeId === themeId ? station : { ...station, layout: { ...station.layout, themeId } };
}

/** Award helpers are intentionally internal-gameplay only; no social API calls them. */
export function grantStationEconomyForTestingOrContent(
  station: OrbitalStationState,
  marks: unknown,
  reputation: unknown,
): OrbitalStationState {
  return {
    ...station,
    economy: {
      ...station.economy,
      orbitalMarks: addStationInteger(station.economy.orbitalMarks, normalizeStationInteger(marks)),
      stationReputation: addStationInteger(station.economy.stationReputation, normalizeStationInteger(reputation)),
    },
  };
}
