import { ITEMS, PLANET_LIST, PLANETS, STAR_SYSTEM_LIST, STAR_SYSTEMS } from "./content";
import { PLANET_TEMPLATE_POOLS, PLANET_TEMPLATES, STAR_CLASS_TEMPLATES, SYSTEM_POSITIONS } from "./galaxyCatalog";
import type {
  GalaxyState,
  ItemAmount,
  ItemId,
  PlanetId,
  PlanetIndustrialProfile,
  PlanetIndustryRole,
  PlanetOceanType,
  PlanetSpecialization,
  PlanetTemplateId,
  ResourceMode,
  StarClassId,
  StarSystemId,
  StarSystemProfile,
} from "./types";

export const GUARANTEED_CRUDE_OIL_PLANETS = ["pelagic", "dune", "prairie"] as const satisfies readonly PlanetId[];

function guaranteePlanetResources(planetId: PlanetId, resourceIds: ItemId[]): ItemId[] {
  if (!GUARANTEED_CRUDE_OIL_PLANETS.includes(planetId as typeof GUARANTEED_CRUDE_OIL_PLANETS[number]) || resourceIds.includes("crude_oil")) {
    return [...resourceIds];
  }
  return [...resourceIds, "crude_oil"];
}

export const DEFAULT_GALAXY_SEED = 240721;
export const TIDAL_LOCKED_SOLAR_BONUS = 1.25;

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

const LEGACY_COLONY_COSTS: Partial<Record<PlanetId, ItemAmount[]>> = {
  home: [],
  ashen: [],
  giant: [],
  frost: [{ itemId: "titanium_ingot", amount: 2 }],
  boreal_giant: [{ itemId: "titanium_alloy", amount: 10 }, { itemId: "logistics_drone", amount: 5 }],
  magnetar: [{ itemId: "space_warper", amount: 4 }, { itemId: "processor", amount: 20 }],
};

const LEGACY_PROFILE_OVERRIDES: Partial<Record<PlanetId, {
  orbitalYields?: Partial<Record<ItemId, number>>;
  orbitalYieldMultiplier?: number;
  specializationName?: string;
  productionSpeedMultiplier?: number;
  surveyDurationSeconds?: number;
}>> = {
  home: { surveyDurationSeconds: 0 },
  ashen: { surveyDurationSeconds: 0 },
  giant: {
    orbitalYields: { hydrogen: 1, deuterium: 0.2, fire_ice: 0.5 },
    orbitalYieldMultiplier: 1,
    specializationName: "轨道窗口 · 采集器 +15%",
    productionSpeedMultiplier: 1.15,
    surveyDurationSeconds: 0,
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

function normalizedSeed(seed: number): number {
  return Math.max(1, Math.abs(Math.floor(seed)) || DEFAULT_GALAXY_SEED);
}

export function createPlayerGalaxySeed(): number {
  try {
    const values = new Uint32Array(1);
    globalThis.crypto?.getRandomValues(values);
    if (values[0] > 0) return values[0];
  } catch {
    // The persisted seed is chosen once; simulation never reads wall-clock randomness.
  }
  return normalizedSeed(Date.now() ^ Math.floor(performance.now() * 1_000));
}

function chooseTemplate(seed: number, planetId: PlanetId, preserveBaseline: boolean): PlanetTemplateId {
  const planet = PLANETS[planetId];
  const pool = PLANET_TEMPLATE_POOLS[planetId];
  if (preserveBaseline || pool.length < 2) return planet.defaultTemplateId;
  return pool[Math.floor(seededUnit(seed, `${planetId}:template`) * pool.length) % pool.length];
}

function chooseRareResources(seed: number, planetId: PlanetId, templateId: PlanetTemplateId): ItemId[] {
  const template = PLANET_TEMPLATES[templateId];
  return [...template.rareResourcePool]
    .sort((left, right) => seededUnit(seed, `${planetId}:rare:${left}`) - seededUnit(seed, `${planetId}:rare:${right}`))
    .slice(0, template.rareResourceCount);
}

function profileColonyCost(seed: number, planetId: PlanetId, templateId: PlanetTemplateId, preserveBaseline: boolean): ItemAmount[] {
  const legacy = LEGACY_COLONY_COSTS[planetId];
  const source = legacy ?? PLANET_TEMPLATES[templateId].colonyCost;
  return source.map((cost) => ({
    ...cost,
    amount: legacy || preserveBaseline ? cost.amount : Math.max(1, Math.round(cost.amount * jitter(seed, `${planetId}:colony:${cost.itemId}`, 0.12))),
  }));
}

function createStarSystemProfiles(seed: number, preserveBaseline: boolean): GalaxyState["systemProfiles"] {
  return Object.fromEntries(STAR_SYSTEM_LIST.map((system) => {
    const star = STAR_CLASS_TEMPLATES[system.defaultStarClassId];
    const basePosition = SYSTEM_POSITIONS[system.id];
    const positionX = system.id === "helios" ? 0 : rounded(basePosition.x + (preserveBaseline ? 0 : (seededUnit(seed, `${system.id}:x`) * 2 - 1) * 0.7));
    const positionY = system.id === "helios" ? 0 : rounded(basePosition.y + (preserveBaseline ? 0 : (seededUnit(seed, `${system.id}:y`) * 2 - 1) * 0.7));
    const profile: StarSystemProfile = {
      systemId: system.id,
      starClassId: star.id,
      starTypeName: star.name,
      luminosity: rounded(star.luminosity * (preserveBaseline ? 1 : jitter(seed, `${system.id}:luminosity`, 0.06))),
      massMultiplier: rounded(star.massMultiplier * (preserveBaseline ? 1 : jitter(seed, `${system.id}:mass`, 0.04))),
      radiusMultiplier: rounded(star.radiusMultiplier * (preserveBaseline ? 1 : jitter(seed, `${system.id}:radius`, 0.04))),
      positionX,
      positionY,
      distanceFromOriginLy: rounded(Math.hypot(positionX, positionY)),
    };
    return [system.id, profile];
  })) as GalaxyState["systemProfiles"];
}

export function createGalaxyState(seed = DEFAULT_GALAXY_SEED, preserveBaseline = false): GalaxyState {
  const normalized = normalizedSeed(seed);
  const systemProfiles = createStarSystemProfiles(normalized, preserveBaseline);
  const profiles = Object.fromEntries(PLANET_LIST.map((planet) => {
    const templateId = chooseTemplate(normalized, planet.id, preserveBaseline);
    const template = PLANET_TEMPLATES[templateId];
    const variation = preserveBaseline ? 1 : jitter(normalized, `${planet.id}:climate`, 0.12);
    const resourceVariation = preserveBaseline ? 1 : jitter(normalized, `${planet.id}:resources`, 0.2);
    const rareResourceIds = chooseRareResources(normalized, planet.id, templateId);
    const legacyOverride = LEGACY_PROFILE_OVERRIDES[planet.id];
    const orbitalYields = Object.fromEntries(Object.entries(legacyOverride?.orbitalYields ?? template.orbitalYields).map(([itemId, rate]) => [
      itemId,
      rounded((rate ?? 0) * (preserveBaseline ? 1 : jitter(normalized, `${planet.id}:orbit:${itemId}`, 0.14))),
    ])) as Partial<Record<ItemId, number>>;
    const profile: PlanetIndustrialProfile = {
      planetId: planet.id,
      templateId,
      climateName: template.name,
      resourceIds: guaranteePlanetResources(planet.id, [...template.resourceIds, ...rareResourceIds]),
      rareResourceIds,
      oceanType: template.oceanType,
      orbitalYields,
      windMultiplier: rounded(template.windMultiplier * variation),
      solarMultiplier: rounded(template.solarMultiplier * (preserveBaseline ? 1 : jitter(normalized, `${planet.id}:solar`, 0.1))),
      geothermalMultiplier: rounded(template.geothermalMultiplier * variation),
      miningMultiplier: rounded(template.miningMultiplier * resourceVariation),
      orbitalYieldMultiplier: rounded((legacyOverride?.orbitalYieldMultiplier ?? template.orbitalYieldMultiplier) * resourceVariation),
      reserveScale: rounded(template.reserveScale * resourceVariation),
      travelTimeMultiplier: rounded(template.travelTimeMultiplier * (preserveBaseline ? 1 : jitter(normalized, `${planet.id}:travel`, 0.08))),
      tidalLocked: Boolean(template.tidalLocked),
      sulfuricOcean: template.oceanType === "sulfuric-acid",
      specialization: template.specialization,
      specializationName: legacyOverride?.specializationName ?? template.specializationName,
      productionSpeedMultiplier: legacyOverride?.productionSpeedMultiplier ?? template.productionSpeedMultiplier,
      colonyCost: profileColonyCost(normalized, planet.id, templateId, preserveBaseline),
      surveyDurationSeconds: preserveBaseline
        ? legacyOverride?.surveyDurationSeconds ?? template.surveyDurationSeconds
        : Math.max(0, Math.round((legacyOverride?.surveyDurationSeconds ?? template.surveyDurationSeconds) * jitter(normalized, `${planet.id}:survey`, 0.1))),
    };
    return [planet.id, profile];
  })) as GalaxyState["profiles"];
  const planetRoles = Object.fromEntries(PLANET_LIST.map((planet) => [planet.id, "auto" as PlanetIndustryRole])) as Record<PlanetId, PlanetIndustryRole>;
  return { seed: normalized, profiles, systemProfiles, planetRoles };
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

function isPlanetTemplateId(value: unknown): value is PlanetTemplateId {
  return typeof value === "string" && value in PLANET_TEMPLATES;
}

function isStarClassId(value: unknown): value is StarClassId {
  return typeof value === "string" && value in STAR_CLASS_TEMPLATES;
}

function isOceanType(value: unknown): value is PlanetOceanType {
  return value === "water" || value === "sulfuric-acid" || value === "lava" || value === "ice" || value === "none";
}

function itemIds(value: unknown, fallback: ItemId[]): ItemId[] {
  if (!Array.isArray(value)) return [...fallback];
  const valid = [...new Set(value.filter((itemId): itemId is ItemId => typeof itemId === "string" && itemId in ITEMS))];
  return valid.length > 0 ? valid : [...fallback];
}

function itemAmounts(value: unknown, fallback: ItemAmount[]): ItemAmount[] {
  if (!Array.isArray(value)) return fallback.map((cost) => ({ ...cost }));
  const valid = value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const cost = entry as Record<string, unknown>;
    if (typeof cost.itemId !== "string" || !(cost.itemId in ITEMS)) return [];
    const amount = profileNumber(cost.amount, 0, 0, 1_000_000);
    return amount > 0 ? [{ itemId: cost.itemId as ItemId, amount: Math.floor(amount) }] : [];
  });
  return valid.length > 0 || value.length === 0 ? valid : fallback.map((cost) => ({ ...cost }));
}

function orbitalYields(value: unknown, fallback: Partial<Record<ItemId, number>>): Partial<Record<ItemId, number>> {
  if (!value || typeof value !== "object") return { ...fallback };
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([itemId, rate]) =>
    itemId in ITEMS ? [[itemId, profileNumber(rate, 0, 0, 10)]] : [])) as Partial<Record<ItemId, number>>;
}

export function normalizeGalaxyState(value: unknown, preserveBaseline = false): GalaxyState {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const seed = typeof source.seed === "number" && Number.isFinite(source.seed) ? source.seed : DEFAULT_GALAXY_SEED;
  const normalized = createGalaxyState(seed, preserveBaseline);
  const sourceProfiles = source.profiles && typeof source.profiles === "object" ? source.profiles as Record<string, unknown> : {};

  for (const planetId of Object.keys(normalized.profiles) as PlanetId[]) {
    const fallback = normalized.profiles[planetId];
    const raw = sourceProfiles[planetId];
    if (!raw || typeof raw !== "object") continue;
    const profile = raw as Record<string, unknown>;
    const templateId = isPlanetTemplateId(profile.templateId) && PLANET_TEMPLATES[profile.templateId].kind === PLANETS[planetId].kind
      ? profile.templateId
      : fallback.templateId;
    const template = PLANET_TEMPLATES[templateId];
    const resources = guaranteePlanetResources(planetId, itemIds(profile.resourceIds, fallback.resourceIds));
    const rareResources = itemIds(profile.rareResourceIds, fallback.rareResourceIds).filter((itemId) => resources.includes(itemId));
    const oceanType = isOceanType(profile.oceanType) ? profile.oceanType : typeof profile.sulfuricOcean === "boolean" && profile.sulfuricOcean ? "sulfuric-acid" : fallback.oceanType;
    normalized.profiles[planetId] = {
      ...fallback,
      templateId,
      climateName: typeof profile.climateName === "string" && profile.climateName.trim() ? profile.climateName.trim().slice(0, 40) : template.name,
      resourceIds: resources,
      rareResourceIds: rareResources,
      oceanType,
      orbitalYields: orbitalYields(profile.orbitalYields, fallback.orbitalYields),
      windMultiplier: profileNumber(profile.windMultiplier, fallback.windMultiplier, 0, 5),
      solarMultiplier: profileNumber(profile.solarMultiplier, fallback.solarMultiplier, 0, 5),
      geothermalMultiplier: profileNumber(profile.geothermalMultiplier, fallback.geothermalMultiplier, 0, 5),
      miningMultiplier: profileNumber(profile.miningMultiplier, fallback.miningMultiplier, 0.05, 5),
      orbitalYieldMultiplier: profileNumber(profile.orbitalYieldMultiplier, fallback.orbitalYieldMultiplier, 0.05, 5),
      reserveScale: profileNumber(profile.reserveScale, fallback.reserveScale, 0.05, 10),
      travelTimeMultiplier: profileNumber(profile.travelTimeMultiplier, fallback.travelTimeMultiplier, 0.1, 5),
      tidalLocked: typeof profile.tidalLocked === "boolean" ? profile.tidalLocked : fallback.tidalLocked,
      sulfuricOcean: oceanType === "sulfuric-acid",
      specialization: isPlanetSpecialization(profile.specialization) ? profile.specialization : fallback.specialization,
      specializationName: typeof profile.specializationName === "string" && profile.specializationName.trim() ? profile.specializationName.trim().slice(0, 48) : fallback.specializationName,
      productionSpeedMultiplier: profileNumber(profile.productionSpeedMultiplier, fallback.productionSpeedMultiplier, 0.1, 5),
      colonyCost: itemAmounts(profile.colonyCost, fallback.colonyCost),
      surveyDurationSeconds: profileNumber(profile.surveyDurationSeconds, fallback.surveyDurationSeconds, 0, 86_400),
    };
  }

  const sourceSystems = source.systemProfiles && typeof source.systemProfiles === "object" ? source.systemProfiles as Record<string, unknown> : {};
  for (const systemId of Object.keys(normalized.systemProfiles) as StarSystemId[]) {
    const fallback = normalized.systemProfiles[systemId];
    const raw = sourceSystems[systemId];
    if (!raw || typeof raw !== "object") continue;
    const profile = raw as Record<string, unknown>;
    const starClassId = isStarClassId(profile.starClassId) ? profile.starClassId : fallback.starClassId;
    const star = STAR_CLASS_TEMPLATES[starClassId];
    const positionX = profileNumber(profile.positionX, fallback.positionX, -100, 100);
    const positionY = profileNumber(profile.positionY, fallback.positionY, -100, 100);
    normalized.systemProfiles[systemId] = {
      systemId,
      starClassId,
      starTypeName: typeof profile.starTypeName === "string" && profile.starTypeName.trim() ? profile.starTypeName.trim().slice(0, 36) : star.name,
      luminosity: profileNumber(profile.luminosity, fallback.luminosity, 0.01, 20),
      massMultiplier: profileNumber(profile.massMultiplier, fallback.massMultiplier, 0.01, 20),
      radiusMultiplier: profileNumber(profile.radiusMultiplier, fallback.radiusMultiplier, 0.01, 20),
      positionX,
      positionY,
      distanceFromOriginLy: rounded(Math.hypot(positionX, positionY)),
    };
  }

  const sourceRoles = source.planetRoles && typeof source.planetRoles === "object" ? source.planetRoles as Record<string, unknown> : {};
  for (const planetId of Object.keys(normalized.planetRoles) as PlanetId[]) {
    const role = sourceRoles[planetId];
    if (PLANET_INDUSTRY_ROLES.includes(role as PlanetIndustryRole)) normalized.planetRoles[planetId] = role as PlanetIndustryRole;
  }
  return normalized;
}

let baselineGalaxy: GalaxyState | undefined;

function fallbackGalaxy(): GalaxyState {
  baselineGalaxy ??= createGalaxyState(DEFAULT_GALAXY_SEED, true);
  return baselineGalaxy;
}

export function getPlanetIndustrialProfile(state: { galaxy?: GalaxyState }, planetId: PlanetId): PlanetIndustrialProfile {
  return state.galaxy?.profiles?.[planetId] ?? fallbackGalaxy().profiles[planetId];
}

export function getStarSystemProfile(state: { galaxy?: GalaxyState }, systemId: StarSystemId): StarSystemProfile {
  return state.galaxy?.systemProfiles?.[systemId] ?? fallbackGalaxy().systemProfiles[systemId];
}

export function getStarLuminosity(state: { galaxy?: GalaxyState }, systemId: StarSystemId): number {
  return getStarSystemProfile(state, systemId).luminosity;
}

export function getPlanetSolarPowerMultiplier(state: { galaxy?: GalaxyState }, planetId: PlanetId): number {
  const profile = getPlanetIndustrialProfile(state, planetId);
  const luminosity = getStarLuminosity(state, PLANETS[planetId].systemId);
  return rounded(profile.solarMultiplier * luminosity * (profile.tidalLocked ? TIDAL_LOCKED_SOLAR_BONUS : 1));
}

export function getSystemDistanceLy(state: { galaxy?: GalaxyState }, sourceSystemId: StarSystemId, targetSystemId: StarSystemId): number {
  if (sourceSystemId === targetSystemId) return 0;
  const source = getStarSystemProfile(state, sourceSystemId);
  const target = getStarSystemProfile(state, targetSystemId);
  return rounded(Math.max(0.1, Math.hypot(source.positionX - target.positionX, source.positionY - target.positionY)));
}

export function getPlanetOrbitalYields(state: { galaxy?: GalaxyState }, planetId: PlanetId): Partial<Record<ItemId, number>> {
  return getPlanetIndustrialProfile(state, planetId).orbitalYields;
}

export function getRecommendedPlanetRole(state: { galaxy?: GalaxyState }, planetId: PlanetId): Exclude<PlanetIndustryRole, "auto"> {
  const specialization = getPlanetIndustrialProfile(state, planetId).specialization;
  if (specialization === "smelting") return "smelting";
  if (specialization === "chemical") return "chemical";
  if (specialization === "logistics") return "logistics";
  if (specialization === "research") return "research";
  if (specialization === "particle") return "manufacturing";
  return "manufacturing";
}

export function isInfiniteResource(itemId: ItemId, planetId: PlanetId, mode: ResourceMode, galaxy?: GalaxyState): boolean {
  if (mode === "infinite") return true;
  const oceanType = getPlanetIndustrialProfile({ galaxy }, planetId).oceanType;
  return (itemId === "water" && oceanType === "water") || (itemId === "sulfuric_acid" && oceanType === "sulfuric-acid");
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
  const oilMultiplier = itemId !== "crude_oil" ? 1 : planetId === "dune" ? 2.4 : planetId === "prairie" ? 1.5 : planetId === "pelagic" ? 1.15 : 1;
  const base = itemId === "crude_oil" ? 420_000 * oilMultiplier : rare.has(itemId) ? 36_000 : 240_000;
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

export function getSystemStarTypeName(state: { galaxy?: GalaxyState }, systemId: StarSystemId): string {
  return getStarSystemProfile(state, systemId).starTypeName || STAR_SYSTEMS[systemId].starType;
}
