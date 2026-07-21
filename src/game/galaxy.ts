import { PLANETS } from "./content";
import type {
  GalaxyState,
  ItemId,
  PlanetId,
  PlanetIndustrialProfile,
  PlanetIndustryRole,
  PlanetSpecialization,
  ResourceMode,
} from "./types";

export const DEFAULT_GALAXY_SEED = 240721;

export const PLANET_INDUSTRY_ROLES: PlanetIndustryRole[] = [
  "auto",
  "mining",
  "smelting",
  "manufacturing",
  "chemical",
  "research",
  "logistics",
  "power",
];

export const PLANET_INDUSTRY_ROLE_LABELS: Record<PlanetIndustryRole, string> = {
  auto: "自动识别",
  mining: "采矿前哨",
  smelting: "冶炼基地",
  manufacturing: "制造中心",
  chemical: "化工基地",
  research: "科研中心",
  logistics: "物流枢纽",
  power: "能源基地",
};

interface PlanetProfileBaseline {
  climateName: string;
  windMultiplier: number;
  geothermalMultiplier: number;
  miningMultiplier: number;
  orbitalYieldMultiplier: number;
  reserveScale: number;
  travelTimeMultiplier: number;
  tidalLocked?: boolean;
  sulfuricOcean?: boolean;
  specialization: PlanetSpecialization;
  specializationName: string;
  productionSpeedMultiplier: number;
  colonyCost: PlanetIndustrialProfile["colonyCost"];
  surveyDurationSeconds: number;
}

const BASELINES: Record<PlanetId, PlanetProfileBaseline> = {
  home: {
    climateName: "温带海洋群岛",
    windMultiplier: 1,
    geothermalMultiplier: 0,
    miningMultiplier: 1,
    orbitalYieldMultiplier: 1,
    reserveScale: 1,
    travelTimeMultiplier: 1,
    specialization: "balanced",
    specializationName: "综合工业 · 无偏置",
    productionSpeedMultiplier: 1,
    colonyCost: [],
    surveyDurationSeconds: 0,
  },
  ashen: {
    climateName: "高热熔岩裂谷",
    windMultiplier: 1,
    geothermalMultiplier: 1,
    miningMultiplier: 1.08,
    orbitalYieldMultiplier: 1,
    reserveScale: 1.15,
    travelTimeMultiplier: 1.05,
    sulfuricOcean: true,
    specialization: "smelting",
    specializationName: "高热冶金 · 熔炉 +12%",
    productionSpeedMultiplier: 1.12,
    colonyCost: [],
    surveyDurationSeconds: 0,
  },
  giant: {
    climateName: "冰态氢氦巨行星",
    windMultiplier: 0,
    geothermalMultiplier: 0,
    miningMultiplier: 1,
    orbitalYieldMultiplier: 1,
    reserveScale: 1,
    travelTimeMultiplier: 1.12,
    specialization: "logistics",
    specializationName: "轨道窗口 · 采集器 +15%",
    productionSpeedMultiplier: 1.15,
    colonyCost: [],
    surveyDurationSeconds: 0,
  },
  frost: {
    climateName: "永冻冰川荒漠",
    windMultiplier: 1.32,
    geothermalMultiplier: 0.08,
    miningMultiplier: 0.92,
    orbitalYieldMultiplier: 1,
    reserveScale: 1.28,
    travelTimeMultiplier: 1.18,
    specialization: "chemical",
    specializationName: "低温化工 · 化工设备 +12%",
    productionSpeedMultiplier: 1.12,
    colonyCost: [{ itemId: "titanium_ingot", amount: 2 }],
    surveyDurationSeconds: 24,
  },
  boreal_giant: {
    climateName: "可燃冰富集冰巨星",
    windMultiplier: 0,
    geothermalMultiplier: 0,
    miningMultiplier: 1,
    orbitalYieldMultiplier: 1.25,
    reserveScale: 1,
    travelTimeMultiplier: 1.24,
    specialization: "logistics",
    specializationName: "冰晶环流 · 轨道采集 +25%",
    productionSpeedMultiplier: 1.25,
    colonyCost: [{ itemId: "titanium_alloy", amount: 10 }, { itemId: "logistics_drone", amount: 5 }],
    surveyDurationSeconds: 24,
  },
  magnetar: {
    climateName: "潮汐锁定磁暴荒原",
    windMultiplier: 0.28,
    geothermalMultiplier: 0.18,
    miningMultiplier: 1.35,
    orbitalYieldMultiplier: 1,
    reserveScale: 0.62,
    travelTimeMultiplier: 1.48,
    tidalLocked: true,
    specialization: "particle",
    specializationName: "强磁约束 · 粒子设备 +18%",
    productionSpeedMultiplier: 1.18,
    colonyCost: [{ itemId: "space_warper", amount: 4 }, { itemId: "processor", amount: 20 }],
    surveyDurationSeconds: 42,
  },
};

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed: number, key: string): number {
  let value = (Math.floor(seed) ^ hashText(key)) >>> 0;
  value += 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function jitter(seed: number, key: string, amplitude: number): number {
  return 1 + (seededUnit(seed, key) * 2 - 1) * amplitude;
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

export function createGalaxyState(seed = DEFAULT_GALAXY_SEED, preserveBaseline = false): GalaxyState {
  const normalizedSeed = Math.max(1, Math.abs(Math.floor(seed)) || DEFAULT_GALAXY_SEED);
  const profiles = Object.fromEntries((Object.keys(BASELINES) as PlanetId[]).map((planetId) => {
    const baseline = BASELINES[planetId];
    const variation = preserveBaseline ? 1 : jitter(normalizedSeed, `${planetId}:climate`, 0.12);
    const resourceVariation = preserveBaseline ? 1 : jitter(normalizedSeed, `${planetId}:resources`, 0.2);
    const planet = PLANETS[planetId];
    const profile: PlanetIndustrialProfile = {
      planetId,
      climateName: baseline.climateName,
      windMultiplier: rounded(baseline.windMultiplier * variation),
      solarMultiplier: rounded(planet.solarMultiplier * (preserveBaseline ? 1 : jitter(normalizedSeed, `${planetId}:solar`, 0.1))),
      geothermalMultiplier: rounded(baseline.geothermalMultiplier * variation),
      miningMultiplier: rounded(baseline.miningMultiplier * resourceVariation),
      orbitalYieldMultiplier: rounded(baseline.orbitalYieldMultiplier * resourceVariation),
      reserveScale: rounded(baseline.reserveScale * resourceVariation),
      travelTimeMultiplier: rounded(baseline.travelTimeMultiplier * (preserveBaseline ? 1 : jitter(normalizedSeed, `${planetId}:travel`, 0.08))),
      tidalLocked: Boolean(baseline.tidalLocked),
      sulfuricOcean: Boolean(baseline.sulfuricOcean),
      specialization: baseline.specialization,
      specializationName: baseline.specializationName,
      productionSpeedMultiplier: baseline.productionSpeedMultiplier,
      colonyCost: baseline.colonyCost.map((cost) => ({ ...cost })),
      surveyDurationSeconds: baseline.surveyDurationSeconds,
    };
    return [planetId, profile];
  })) as GalaxyState["profiles"];
  const planetRoles = Object.fromEntries((Object.keys(BASELINES) as PlanetId[]).map((planetId) => [
    planetId,
    "auto" as PlanetIndustryRole,
  ])) as Record<PlanetId, PlanetIndustryRole>;
  return { seed: normalizedSeed, profiles, planetRoles };
}

function profileNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, Math.round(value * 100) / 100))
    : fallback;
}

function isPlanetSpecialization(value: unknown): value is PlanetSpecialization {
  return value === "balanced" || value === "smelting" || value === "chemical" || value === "logistics" ||
    value === "research" || value === "particle";
}

export function normalizeGalaxyState(value: unknown, preserveBaseline = false): GalaxyState {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const seed = typeof source.seed === "number" && Number.isFinite(source.seed) ? source.seed : DEFAULT_GALAXY_SEED;
  const normalized = createGalaxyState(seed, preserveBaseline);
  const sourceProfiles = source.profiles && typeof source.profiles === "object"
    ? source.profiles as Record<string, unknown>
    : {};

  for (const planetId of Object.keys(normalized.profiles) as PlanetId[]) {
    const fallback = normalized.profiles[planetId];
    const raw = sourceProfiles[planetId];
    if (!raw || typeof raw !== "object") continue;
    const profile = raw as Record<string, unknown>;
    normalized.profiles[planetId] = {
      ...fallback,
      climateName: typeof profile.climateName === "string" && profile.climateName.trim()
        ? profile.climateName.trim().slice(0, 40)
        : fallback.climateName,
      windMultiplier: profileNumber(profile.windMultiplier, fallback.windMultiplier, 0, 5),
      solarMultiplier: profileNumber(profile.solarMultiplier, fallback.solarMultiplier, 0, 5),
      geothermalMultiplier: profileNumber(profile.geothermalMultiplier, fallback.geothermalMultiplier, 0, 5),
      miningMultiplier: profileNumber(profile.miningMultiplier, fallback.miningMultiplier, 0.05, 5),
      orbitalYieldMultiplier: profileNumber(profile.orbitalYieldMultiplier, fallback.orbitalYieldMultiplier, 0.05, 5),
      reserveScale: profileNumber(profile.reserveScale, fallback.reserveScale, 0.05, 10),
      travelTimeMultiplier: profileNumber(profile.travelTimeMultiplier, fallback.travelTimeMultiplier, 0.1, 5),
      tidalLocked: typeof profile.tidalLocked === "boolean" ? profile.tidalLocked : fallback.tidalLocked,
      sulfuricOcean: typeof profile.sulfuricOcean === "boolean" ? profile.sulfuricOcean : fallback.sulfuricOcean,
      specialization: isPlanetSpecialization(profile.specialization) ? profile.specialization : fallback.specialization,
      specializationName: typeof profile.specializationName === "string" && profile.specializationName.trim()
        ? profile.specializationName.trim().slice(0, 48)
        : fallback.specializationName,
      productionSpeedMultiplier: profileNumber(profile.productionSpeedMultiplier, fallback.productionSpeedMultiplier, 0.1, 5),
      surveyDurationSeconds: profileNumber(profile.surveyDurationSeconds, fallback.surveyDurationSeconds, 0, 86_400),
    };
  }

  const sourceRoles = source.planetRoles && typeof source.planetRoles === "object"
    ? source.planetRoles as Record<string, unknown>
    : {};
  for (const planetId of Object.keys(normalized.planetRoles) as PlanetId[]) {
    const role = sourceRoles[planetId];
    if (PLANET_INDUSTRY_ROLES.includes(role as PlanetIndustryRole)) normalized.planetRoles[planetId] = role as PlanetIndustryRole;
  }
  return normalized;
}

export function getPlanetIndustrialProfile(state: { galaxy?: GalaxyState }, planetId: PlanetId): PlanetIndustrialProfile {
  return state.galaxy?.profiles?.[planetId] ?? createGalaxyState(DEFAULT_GALAXY_SEED, true).profiles[planetId];
}

export function getRecommendedPlanetRole(
  state: { galaxy?: GalaxyState },
  planetId: PlanetId,
): Exclude<PlanetIndustryRole, "auto"> {
  const specialization = getPlanetIndustrialProfile(state, planetId).specialization;
  if (specialization === "smelting") return "smelting";
  if (specialization === "chemical") return "chemical";
  if (specialization === "logistics") return "logistics";
  if (specialization === "research") return "research";
  if (specialization === "particle") return "manufacturing";
  return "manufacturing";
}

export function isInfiniteResource(itemId: ItemId, planetId: PlanetId, mode: ResourceMode): boolean {
  if (mode === "infinite") return true;
  return itemId === "water" || (itemId === "sulfuric_acid" && BASELINES[planetId].sulfuricOcean === true);
}

export function createVeinReserve(galaxy: GalaxyState, planetId: PlanetId, itemId: ItemId, veinId: string): number {
  const rare = new Set<ItemId>([
    "kimberlite_ore",
    "fractal_silicon",
    "optical_grating_crystal",
    "spiniform_stalagmite_crystal",
    "unipolar_magnet",
    "organic_crystal",
  ]);
  const base = itemId === "crude_oil" ? 420_000 : rare.has(itemId) ? 36_000 : 240_000;
  const profile = galaxy.profiles[planetId];
  return Math.max(1, Math.floor(base * profile.reserveScale * jitter(galaxy.seed, `${veinId}:${itemId}`, 0.16)));
}

export function specializationApplies(profile: PlanetIndustrialProfile, buildingFamily?: string, buildingId?: string): boolean {
  if (profile.specialization === "balanced") return true;
  if (profile.specialization === "smelting") return buildingFamily === "smelter";
  if (profile.specialization === "chemical") return buildingFamily === "chemical";
  if (profile.specialization === "research") return buildingId === "matrix_lab";
  if (profile.specialization === "particle") return buildingId === "miniature_particle_collider" || buildingId === "fractionator";
  return buildingId === "orbital_collector" || buildingId?.includes("logistics_station") === true;
}
