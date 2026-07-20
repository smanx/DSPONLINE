import type { DifficultyMode } from "./types";

export interface DifficultyDefinition {
  id: DifficultyMode;
  name: string;
  summary: string;
  productionMultiplier: number;
  miningMultiplier: number;
  logisticsMultiplier: number;
  powerDemandMultiplier: number;
}

/**
 * Balance presets intentionally change a small set of high-leverage values.
 * This keeps the underlying recipes and deterministic simulation identical
 * while making a new run feel meaningfully different.
 */
export const DIFFICULTY_DEFINITIONS: readonly DifficultyDefinition[] = [
  {
    id: "relaxed",
    name: "舒缓",
    summary: "生产与物流更宽松，适合专注布局和生产链。",
    productionMultiplier: 1.15,
    miningMultiplier: 1.15,
    logisticsMultiplier: 1.1,
    powerDemandMultiplier: 0.9,
  },
  {
    id: "standard",
    name: "标准",
    summary: "按当前原型的默认节奏运行。",
    productionMultiplier: 1,
    miningMultiplier: 1,
    logisticsMultiplier: 1,
    powerDemandMultiplier: 1,
  },
  {
    id: "hard",
    name: "高压",
    summary: "生产与物流更紧凑，电网负载更高，适合挑战优化。",
    productionMultiplier: 0.85,
    miningMultiplier: 0.85,
    logisticsMultiplier: 0.9,
    powerDemandMultiplier: 1.2,
  },
] as const;

const BY_ID = new Map(DIFFICULTY_DEFINITIONS.map((definition) => [definition.id, definition]));

export function isDifficultyMode(value: unknown): value is DifficultyMode {
  return typeof value === "string" && BY_ID.has(value as DifficultyMode);
}

export function getDifficultyDefinition(value: DifficultyMode | null | undefined): DifficultyDefinition {
  return BY_ID.get(value ?? "standard") ?? BY_ID.get("standard")!;
}
