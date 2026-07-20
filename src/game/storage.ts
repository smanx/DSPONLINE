import {
  DYSON_SHELL_CAPACITY_PER_STRUCTURE,
  DYSON_SHELL_SAIL_POWER_KW,
  DYSON_STRUCTURE_POWER_KW,
  SOLAR_SAIL_POWER_KW,
  STATION_SLOT_COUNT,
  advanceSimulation,
  createInitialState,
} from "./engine";
import { BUILDINGS, ITEMS, PLANET_LIST, STAR_SYSTEMS, getBeltConstructionId, getBuilding, getExtractorBuildingId, getPlanet, getRecipe, getTechnology } from "./content";
import { normalizeCampaignState, syncCampaignProgress } from "./campaign";
import { isAchievementId } from "./progression";
import { createGalaxyState, createVeinReserve, isInfiniteResource } from "./galaxy";
import { createEndgameState, getOfflineSimulationLimitSeconds } from "./endgame";
import type { BeltConnection, BeltTier, BlueprintDefinition, BlueprintMirror, BlueprintRotation, BuildingId, CargoStackSize, ConstructionId, DysonEngineeringState, DysonLayerState, DysonLaunchMode, DysonLaunchThrottle, DysonSpherePlanState, DysonSwarmOrbitState, EnergyMode, EndgameState, FactoryEntity, GalacticDispatchThrottle, GalacticExportProjectId, GameState, InfiniteResearchId, ItemId, LogisticsPriority, PlanetId, PowerGridId, PowerPriority, ProliferatorMode, ProliferatorTier, RecipeId, StarSystemId, StationLogisticsMode, StationMinimumLoad, StationRoute, StationSlot, TechId } from "./types";

export const SAVE_KEY = "dsp-idle-network.save.v1";
const SAVE_SLOT_KEY_PREFIX = "dsp-idle-network.slot";

export type SaveSlotId = 1 | 2 | 3;

interface SaveEnvelope {
  savedAt: number;
  state: GameState | Record<string, unknown>;
}

export interface LoadedGame {
  state: GameState;
  offlineSeconds: number;
  offlineReport: OfflineReport | null;
}

export interface OfflineReport {
  seconds: number;
  produced: Array<{ itemId: ItemId; amount: number }>;
  completedTechIds: TechId[];
  structurePointsAdded: number;
  shellSailsAdded: number;
  infiniteResearchLevels?: Array<{ id: InfiniteResearchId; level: number }>;
  exported?: Array<{ projectId: GalacticExportProjectId; amount: number }>;
  galacticCreditsAdded?: number;
}

export interface SaveSlotSummary {
  slotId: SaveSlotId;
  savedAt: number;
  elapsedSeconds: number;
  completedTechCount: number;
  structurePoints: number;
  activePlanetId: PlanetId;
}

function integerRecord(value: unknown): Partial<Record<ItemId, number>> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).map(([key, amount]) => [
    key,
    Math.max(0, Math.floor(typeof amount === "number" ? amount : 0)),
  ])) as Partial<Record<ItemId, number>>;
}

function nonNegativeInteger(value: unknown): number {
  return Math.max(0, Math.floor(typeof value === "number" && Number.isFinite(value) ? value : 0));
}

function nonNegativeNumber(value: unknown): number {
  return Math.max(0, typeof value === "number" && Number.isFinite(value) ? value : 0);
}

function fractionalRecord(value: unknown): Partial<Record<ItemId, number>> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).map(([key, amount]) => [
    key,
    nonNegativeNumber(amount) % 1,
  ])) as Partial<Record<ItemId, number>>;
}

function nonNegativeRecord(value: unknown): Partial<Record<ItemId, number>> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, amount]) =>
    key in ITEMS ? [[key, nonNegativeNumber(amount)]] : [])) as Partial<Record<ItemId, number>>;
}

const STARTER_TOTALS: Partial<Record<ConstructionId, number>> = {
  wind_turbine: 3,
  mining_machine: 2,
  arc_smelter: 3,
  assembling_machine_mk1: 3,
  matrix_lab: 2,
  conveyor_belt_mk1: 10,
};

function researchProgress(value: unknown): GameState["research"]["progressByTech"] {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).map(([techId, progress]) => {
    if (typeof progress === "number") {
      return [techId, { electromagnetic_matrix: Math.max(0, Math.floor(progress)) }];
    }
    return [techId, integerRecord(progress)];
  })) as GameState["research"]["progressByTech"];
}

function deployedCount(entities: FactoryEntity[], buildingId: BuildingId): number {
  if (buildingId === "mining_machine" || buildingId === "oil_extractor" || buildingId === "water_pump") {
    return entities.reduce((sum, entity) => {
      if (entity.kind !== "vein" || entity.minerCount < 1) return sum;
      const extractorId = entity.extractorBuildingId ?? getExtractorBuildingId(entity.resourceId!);
      return sum + (extractorId === buildingId ? entity.minerCount : 0);
    }, 0);
  }
  return entities.reduce((sum, entity) =>
    sum + (entity.buildingId === buildingId ? entity.machineCount : 0), 0);
}

function validPlanetId(value: unknown): value is PlanetId {
  return typeof value === "string" && PLANET_LIST.some((planet) => planet.id === value);
}

function validStarSystemId(value: unknown): value is StarSystemId {
  return typeof value === "string" && value in STAR_SYSTEMS;
}

function validStationMinimumLoad(value: unknown): value is StationMinimumLoad {
  return value === 0.1 || value === 0.25 || value === 0.5 || value === 1;
}

function validStationMode(value: unknown): value is StationLogisticsMode {
  return value === "supply" || value === "demand" || value === "storage";
}

function validPriority(value: unknown): value is LogisticsPriority {
  return value === 0 || value === 1 || value === 2;
}

function validCargoStackSize(value: unknown): value is CargoStackSize {
  return value === 1 || value === 2 || value === 4;
}

function validBlueprintRotation(value: unknown): value is BlueprintRotation {
  return value === 0 || value === 90 || value === 180 || value === 270;
}

function validBlueprintMirror(value: unknown): value is BlueprintMirror {
  return value === "none" || value === "horizontal";
}

function normalizeStationSlots(entity: FactoryEntity): StationSlot[] | undefined {
  if (entity.kind !== "station" || entity.buildingId === "orbital_collector") return undefined;
  const slots: StationSlot[] = Array.isArray(entity.stationSlots)
    ? entity.stationSlots.slice(0, STATION_SLOT_COUNT).map((slot) => ({
      itemId: slot?.itemId && ITEMS[slot.itemId] ? slot.itemId : undefined,
      localMode: validStationMode(slot?.localMode) ? slot.localMode : "storage",
      remoteMode: validStationMode(slot?.remoteMode) ? slot.remoteMode : "storage",
      minimumLoad: validStationMinimumLoad(slot?.minimumLoad) ? slot.minimumLoad : 1,
      minStock: nonNegativeInteger(slot?.minStock),
      maxStock: nonNegativeInteger(slot?.maxStock),
      priority: validPriority(slot?.priority) ? slot.priority : 1,
    }))
    : [];
  if (slots.length === 0 && entity.storedItemId && ITEMS[entity.storedItemId]) {
    const legacyMode: StationLogisticsMode = entity.stationMode === "demand" ? "demand" : "supply";
    slots.push({
      itemId: entity.storedItemId,
      localMode: entity.buildingId === "planetary_logistics_station" ? legacyMode : "storage",
      remoteMode: entity.buildingId === "interstellar_logistics_station" ? legacyMode : "storage",
      minimumLoad: validStationMinimumLoad(entity.stationMinimumLoad) ? entity.stationMinimumLoad : 1,
      minStock: 0,
      maxStock: 0,
      priority: 1,
    });
  }
  while (slots.length < STATION_SLOT_COUNT) {
    slots.push({ localMode: "storage", remoteMode: "storage", minimumLoad: 1, minStock: 0, maxStock: 0, priority: 1 });
  }
  const seen = new Set<ItemId>();
  return slots.map((slot) => {
    if (!slot.itemId || seen.has(slot.itemId)) return { ...slot, itemId: undefined };
    seen.add(slot.itemId);
    return slot;
  });
}

function normalizeStationRoutes(entity: FactoryEntity): StationRoute[] | undefined {
  if (entity.kind !== "station" || entity.buildingId === "orbital_collector") return undefined;
  if (!Array.isArray(entity.stationRoutes)) return [];
  return entity.stationRoutes.flatMap((route) => {
    if (!route || typeof route.id !== "string" || !ITEMS[route.itemId] ||
      (route.scope !== "local" && route.scope !== "remote") || typeof route.peerId !== "string") return [];
    return [{
      id: route.id,
      slotIndex: Math.min(STATION_SLOT_COUNT - 1, nonNegativeInteger(route.slotIndex)),
      peerId: route.peerId,
      itemId: route.itemId,
      scope: route.scope,
      cargo: nonNegativeInteger(route.cargo),
      vehicleCount: Math.max(1, nonNegativeInteger(route.vehicleCount)),
      progress: Math.min(1, nonNegativeNumber(route.progress)),
      duration: Math.max(1, nonNegativeNumber(route.duration)),
      requiresWarp: Boolean(route.requiresWarp),
    } satisfies StationRoute];
  });
}

function validBeltTier(value: unknown): value is BeltTier {
  return value === 1 || value === 2 || value === 3;
}

function validProliferatorTier(value: unknown): value is ProliferatorTier {
  return value === 1 || value === 2 || value === 3;
}

function validProliferatorMode(value: unknown): value is ProliferatorMode {
  return value === "normal" || value === "extra" || value === "speed";
}

function validEnergyMode(value: unknown): value is EnergyMode {
  return value === "auto" || value === "charge" || value === "discharge";
}

function validPowerGridId(value: unknown): value is PowerGridId {
  return value === "grid-a" || value === "grid-b" || value === "grid-c";
}

function validPowerPriority(value: unknown): value is PowerPriority {
  return value === 1 || value === 2 || value === 3;
}

function validDysonLaunchMode(value: unknown): value is DysonLaunchMode {
  return value === "balanced" || value === "swarm" || value === "sphere";
}

function validDysonLaunchThrottle(value: unknown): value is DysonLaunchThrottle {
  return value === 0.25 || value === 0.5 || value === 0.75 || value === 1;
}

function validInfiniteResearchId(value: unknown): value is InfiniteResearchId {
  return value === "matrix_compression" || value === "vein_utilization" || value === "galactic_logistics" ||
    value === "stellar_harnessing" || value === "continuum_simulation";
}

function validGalacticExportProjectId(value: unknown): value is GalacticExportProjectId {
  return value === "universe_archive" || value === "solar_sail_array" || value === "carrier_rocket_fleet" || value === "antimatter_exchange";
}

function validDispatchThrottle(value: unknown): value is GalacticDispatchThrottle {
  return value === 0.25 || value === 0.5 || value === 1;
}

function migrateEndgame(saved: Record<string, any>): EndgameState {
  const defaults = createEndgameState();
  const raw = saved.endgame && typeof saved.endgame === "object" ? saved.endgame : {};
  const infiniteResearch = { ...defaults.infiniteResearch } as EndgameState["infiniteResearch"];
  for (const researchId of Object.keys(defaults.infiniteResearch) as InfiniteResearchId[]) {
    const source = raw.infiniteResearch?.[researchId];
    const level = nonNegativeInteger(source?.level);
    const progress = nonNegativeInteger(source?.progress);
    infiniteResearch[researchId] = { level, progress };
  }
  const exportProjects = { ...defaults.exportProjects } as EndgameState["exportProjects"];
  for (const projectId of Object.keys(defaults.exportProjects) as GalacticExportProjectId[]) {
    const source = raw.exportProjects?.[projectId];
    const priority = validPriority(source?.priority) ? source.priority : 1;
    exportProjects[projectId] = {
      ...defaults.exportProjects[projectId],
      id: projectId,
      enabled: typeof source?.enabled === "boolean" ? source.enabled : false,
      priority,
      level: nonNegativeInteger(source?.level),
      delivered: nonNegativeInteger(source?.delivered),
      totalDelivered: nonNegativeInteger(source?.totalDelivered),
      dispatchProgress: Math.min(2_000_000_000, nonNegativeNumber(source?.dispatchProgress)),
    };
  }
  return {
    ...defaults,
    activeInfiniteResearchId: validInfiniteResearchId(raw.activeInfiniteResearchId) &&
      (saved.research?.completedTechIds ?? []).includes("universe_matrix")
      ? raw.activeInfiniteResearchId
      : null,
    autoResearch: typeof raw.autoResearch === "boolean" ? raw.autoResearch : true,
    autoDispatch: typeof raw.autoDispatch === "boolean" ? raw.autoDispatch : true,
    dispatchThrottle: validDispatchThrottle(raw.dispatchThrottle) ? raw.dispatchThrottle : 1,
    exportProjects,
    galacticCredits: nonNegativeInteger(raw.galacticCredits),
    galacticScore: nonNegativeInteger(raw.galacticScore),
    totalExported: nonNegativeInteger(raw.totalExported),
    exportedLastMinute: nonNegativeNumber(raw.exportedLastMinute),
    exportWindowAmount: nonNegativeInteger(raw.exportWindowAmount),
    exportWindowStartedAt: nonNegativeNumber(raw.exportWindowStartedAt),
    infiniteResearch,
  };
}

function defaultDysonOrbit(systemId: StarSystemId, index = 0): DysonSwarmOrbitState {
  return {
    id: `dyson_orbit_${systemId}_${index + 1}`,
    name: `太阳帆轨道 ${String.fromCharCode(65 + index)}`,
    radius: 12_000 + index * 6_000,
    inclination: index * 12,
    longitude: index * 45,
    sailsInOrbit: 0,
    totalLaunched: 0,
    totalExpired: 0,
    decayProgress: 0,
    generationKw: 0,
  };
}

function validSimulationSpeed(value: unknown): value is GameState["settings"]["simulationSpeed"] {
  return value === 1 || value === 2 || value === 4;
}

function validAutosaveInterval(value: unknown): value is GameState["settings"]["autosaveIntervalSeconds"] {
  return value === 2 || value === 10 || value === 30;
}

function inferLegacyPlanet(entity: FactoryEntity): PlanetId {
  if (entity.id.startsWith("ashen_")) return "ashen";
  if (entity.resourceId === "silicon_ore" || entity.resourceId === "titanium_ore") return "ashen";
  if (entity.kind !== "vein" && entity.position?.x < -650) return "ashen";
  return "home";
}

export function migrateGame(value: unknown): GameState | null {
  if (!value || typeof value !== "object") return null;
  const saved = value as Record<string, any>;
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23].includes(saved.version) || !Array.isArray(saved.entities)) return null;
  const initial = createInitialState();
  const galaxy = createGalaxyState(saved.version >= 20 ? saved.galaxy?.seed : initial.galaxy.seed, saved.version < 20);
  const entities = saved.entities.map((entity: FactoryEntity) => {
    const currentResource = saved.version < 13
      ? initial.entities.find((candidate) => candidate.kind === "vein" && candidate.id === entity.id)
      : undefined;
    const legacyRelocation = currentResource
      ? { planetId: currentResource.planetId, position: currentResource.position }
      : undefined;
    const planetId = legacyRelocation?.planetId ?? (validPlanetId(entity.planetId) ? entity.planetId : inferLegacyPlanet(entity));
    const position = { ...entity.position };
    if (legacyRelocation) Object.assign(position, legacyRelocation.position);
    const sprayCoaterInstalled = Boolean(entity.sprayCoaterInstalled);
    const planetaryStation = entity.buildingId === "planetary_logistics_station";
    const interstellarStation = entity.buildingId === "interstellar_logistics_station";
    const orbitalCollector = entity.buildingId === "orbital_collector";
    const accumulator = entity.buildingId === "accumulator";
    const energyExchanger = entity.buildingId === "energy_exchanger";
    const storedEnergyCapacity = accumulator || energyExchanger
      ? (getBuilding(entity.buildingId!).energyCapacityMj ?? 0) * Math.max(0, Math.floor(entity.machineCount ?? 0))
      : 0;
    const resourceId = entity.kind === "vein" && entity.resourceId && ITEMS[entity.resourceId] ? entity.resourceId : undefined;
    const generatedReserve = resourceId ? createVeinReserve(galaxy, planetId, resourceId, entity.id) : undefined;
    if (saved.version < 4 && position.x < -650 && (planetId === "ashen" || entity.resourceId === "water")) {
      position.x += 640;
    }
    return {
      ...entity,
      planetId,
      position,
      inputs: integerRecord(entity.inputs),
      outputs: integerRecord(entity.outputs),
      machineCount: Math.max(0, Math.floor(entity.machineCount ?? 0)),
      minerCount: Math.max(0, Math.floor(entity.minerCount ?? 0)),
      progress: typeof entity.progress === "number" ? Math.max(0, entity.progress) : 0,
      fuelRemainingMj: typeof entity.fuelRemainingMj === "number" ? Math.max(0, entity.fuelRemainingMj) : 0,
      powerOutputKw: typeof entity.powerOutputKw === "number" ? Math.max(0, entity.powerOutputKw) : 0,
      powerInputKw: typeof entity.powerInputKw === "number" ? Math.max(0, entity.powerInputKw) : 0,
      storedEnergyMj: accumulator || energyExchanger ? Math.min(storedEnergyCapacity, nonNegativeNumber(entity.storedEnergyMj)) : undefined,
      energyMode: accumulator ? "auto" : energyExchanger
        ? validEnergyMode(entity.energyMode) && entity.energyMode !== "auto" ? entity.energyMode : "charge"
        : undefined,
      powerGridId: validPowerGridId(entity.powerGridId) ? entity.powerGridId : "grid-a",
      powerPriority: validPowerPriority(entity.powerPriority) ? entity.powerPriority : 2,
      generationPriority: validPowerPriority(entity.generationPriority) ? entity.generationPriority : undefined,
      resourceCapacity: resourceId && !isInfiniteResource(resourceId, planetId, saved.version >= 20 && saved.settings?.resourceMode === "finite" ? "finite" : "infinite")
        ? Math.max(1, nonNegativeInteger(entity.resourceCapacity) || generatedReserve || 1)
        : undefined,
      resourceRemaining: resourceId && !isInfiniteResource(resourceId, planetId, saved.version >= 20 && saved.settings?.resourceMode === "finite" ? "finite" : "infinite")
        ? Math.min(Math.max(1, nonNegativeInteger(entity.resourceCapacity) || generatedReserve || 1), nonNegativeInteger(entity.resourceRemaining) || generatedReserve || 1)
        : undefined,
      recipeId: energyExchanger
        ? entity.energyMode === "discharge" ? "accumulator_discharge" : "accumulator_charge"
        : entity.recipeId,
      routingCursor: Math.max(0, Math.floor(entity.routingCursor ?? 0)),
      distributionMode: entity.kind === "splitter" ? entity.distributionMode ?? "balanced" : entity.distributionMode,
      storedItemId: orbitalCollector
        ? entity.storedItemId && (getPlanet(planetId).orbitalYields?.[entity.storedItemId] ?? 0) > 0 ? entity.storedItemId : "hydrogen"
        : entity.storedItemId,
      stationMode: entity.kind === "station" ? orbitalCollector ? "supply" : entity.stationMode ?? "supply" : entity.stationMode,
      stationProgress: entity.kind === "station" ? Math.max(0, entity.stationProgress ?? 0) : entity.stationProgress,
      stationTrips: entity.kind === "station" ? Math.max(0, Math.floor(entity.stationTrips ?? 0)) : entity.stationTrips,
      stationLastTransfer: entity.kind === "station" ? Math.max(0, Math.floor(entity.stationLastTransfer ?? 0)) : entity.stationLastTransfer,
      stationDrones: planetaryStation || interstellarStation ? nonNegativeInteger(entity.stationDrones) : undefined,
      stationVessels: interstellarStation
        ? saved.version < 5 ? 1 : Math.max(0, Math.floor(entity.stationVessels ?? 0))
        : undefined,
      stationWarpers: interstellarStation ? nonNegativeInteger(entity.stationWarpers) : undefined,
      stationWarpEnabled: interstellarStation ? entity.stationWarpEnabled !== false : undefined,
      stationMinimumLoad: entity.kind === "station"
        ? validStationMinimumLoad(entity.stationMinimumLoad) ? entity.stationMinimumLoad : 1
        : entity.stationMinimumLoad,
      stationSlots: normalizeStationSlots(entity),
      stationRoutes: normalizeStationRoutes(entity),
      stationDispatchCursor: entity.kind === "station" ? nonNegativeInteger(entity.stationDispatchCursor) : undefined,
      stationCongestion: entity.kind === "station" ? Math.min(1, nonNegativeNumber(entity.stationCongestion)) : undefined,
      sprayCoaterInstalled,
      proliferatorTier: sprayCoaterInstalled
        ? validProliferatorTier(entity.proliferatorTier) ? entity.proliferatorTier : 1
        : undefined,
      proliferatorMode: sprayCoaterInstalled
        ? validProliferatorMode(entity.proliferatorMode) ? entity.proliferatorMode : "normal"
        : undefined,
      proliferatorPoints: sprayCoaterInstalled ? nonNegativeInteger(entity.proliferatorPoints) : 0,
      proliferatorBonusProgress: sprayCoaterInstalled ? fractionalRecord(entity.proliferatorBonusProgress) : {},
      extractorBuildingId: entity.kind === "vein" && entity.minerCount > 0
        ? entity.extractorBuildingId ?? getExtractorBuildingId(entity.resourceId!)
        : entity.extractorBuildingId,
    };
  }) as FactoryEntity[];

  for (const resource of initial.entities.filter((entity) => entity.kind === "vein")) {
    if (!entities.some((entity) => entity.id === resource.id)) {
      entities.push({ ...resource, position: { ...resource.position }, inputs: {}, outputs: { ...resource.outputs } });
    }
  }

  const construction = Object.fromEntries(Object.keys(initial.construction).map((buildingId) => {
    const amount = saved.construction?.[buildingId];
    return [buildingId, Math.max(0, Math.floor(typeof amount === "number" ? amount : 0))];
  })) as GameState["construction"];
  const migratedBelts: BeltConnection[] = Array.isArray(saved.belts) ? saved.belts.map((belt: Record<string, any>) => {
    const source = entities.find((entity) => entity.id === belt.source);
    return {
      ...belt,
      planetId: validPlanetId(belt.planetId) ? belt.planetId : source?.planetId ?? "home",
      lanes: Math.max(1, Math.floor(belt.lanes ?? 1)),
      tier: saved.version >= 8 && validBeltTier(belt.tier) ? belt.tier : 1,
      sorterTier: saved.version >= 10 && validBeltTier(belt.sorterTier) ? belt.sorterTier : 1,
      progress: typeof belt.progress === "number" ? Math.max(0, belt.progress) : 0,
      priority: validPriority(belt.priority) ? belt.priority : 0,
      stackSize: validCargoStackSize(belt.stackSize) ? belt.stackSize : 1,
      monitorEnabled: Boolean(belt.monitorEnabled),
      totalTransferred: nonNegativeInteger(belt.totalTransferred),
      congestion: Math.min(1, nonNegativeNumber(belt.congestion)),
      lastFlow: typeof belt.lastFlow === "number" ? belt.lastFlow : 0,
    } as BeltConnection;
  }) : [];
  const belts = migratedBelts.filter((belt) => {
    const source = entities.find((entity) => entity.id === belt.source);
    const target = entities.find((entity) => entity.id === belt.target);
    return source && target && source.planetId === target.planetId && belt.planetId === source.planetId;
  });
  for (const belt of migratedBelts.filter((candidate) => !belts.includes(candidate))) {
    const constructionId = getBeltConstructionId(belt.tier);
    construction[constructionId] = (construction[constructionId] ?? 0) + belt.lanes;
  }

  if (saved.version < 8) {
    for (const [buildingId, target] of Object.entries(STARTER_TOTALS) as Array<[ConstructionId, number]>) {
      const deployed = buildingId === "conveyor_belt_mk1"
        ? belts.filter((belt) => belt.tier === 1).reduce((sum, belt) => sum + belt.lanes, 0)
        : deployedCount(entities, buildingId as BuildingId);
      construction[buildingId] = Math.max(construction[buildingId] ?? 0, target - deployed);
    }
  }

  const completedTechIds = Array.isArray(saved.research?.completedTechIds)
    ? [...new Set((saved.research.completedTechIds as TechId[]).filter((techId) => Boolean(getTechnology(techId))))]
    : [];
  let selectedTechId = getTechnology(saved.research?.selectedTechId) && !completedTechIds.includes(saved.research.selectedTechId)
    ? saved.research.selectedTechId as TechId
    : null;
  const plannedTechIds = new Set<TechId>([...completedTechIds, ...(selectedTechId ? [selectedTechId] : [])]);
  const queuedTechIds: TechId[] = [];
  if (Array.isArray(saved.research?.queuedTechIds)) {
    for (const techId of saved.research.queuedTechIds as TechId[]) {
      const technology = getTechnology(techId);
      if (!technology || plannedTechIds.has(techId) ||
        !technology.prerequisites.every((prerequisite) => plannedTechIds.has(prerequisite))) continue;
      queuedTechIds.push(techId);
      plannedTechIds.add(techId);
    }
  }
  if (!selectedTechId && queuedTechIds.length > 0) selectedTechId = queuedTechIds.shift()!;

  const activePlanetId = validPlanetId(saved.activePlanetId) ? saved.activePlanetId : "home";
  const savedActiveTray = integerRecord(saved.tray);
  const planetTrays = Object.fromEntries(PLANET_LIST.map((planet) => [
    planet.id,
    planet.id === "home" && saved.version < 4 ? savedActiveTray : integerRecord(saved.planetTrays?.[planet.id]),
  ])) as GameState["planetTrays"];
  if (saved.version >= 4 && saved.tray && typeof saved.tray === "object") planetTrays[activePlanetId] = savedActiveTray;
  const planetMetrics = Object.fromEntries(PLANET_LIST.map((planet) => [
    planet.id,
    {
      ...initial.planetMetrics[planet.id],
      ...(planet.id === "home" && saved.version < 4 ? saved.metrics ?? {} : saved.planetMetrics?.[planet.id] ?? {}),
    },
  ])) as GameState["planetMetrics"];
  const persistedSystems = Array.isArray(saved.exploration?.unlockedSystemIds)
    ? (saved.exploration.unlockedSystemIds as unknown[]).filter(validStarSystemId)
    : [];
  const unlockedSystemIds = [...new Set<StarSystemId>(["helios", ...persistedSystems])];
  if (saved.version < 13 && completedTechIds.includes("rare_resource_utilization")) {
    unlockedSystemIds.push(...(["borealis", "neutron"] as StarSystemId[]).filter((systemId) => !unlockedSystemIds.includes(systemId)));
  }
  const persistedColonies = Array.isArray(saved.exploration?.colonizedPlanetIds)
    ? (saved.exploration.colonizedPlanetIds as unknown[]).filter(validPlanetId)
    : PLANET_LIST.filter((planet) => unlockedSystemIds.includes(planet.systemId)).map((planet) => planet.id);
  const colonizedPlanetIds = [...new Set<PlanetId>(["home", ...persistedColonies])]
    .filter((planetId) => unlockedSystemIds.includes(getPlanet(planetId).systemId));
  const surveyProgressBySystem = Object.fromEntries((Object.keys(STAR_SYSTEMS) as StarSystemId[]).map((systemId) => [
    systemId,
    Math.min(1, nonNegativeNumber(saved.exploration?.surveyProgressBySystem?.[systemId]) || (unlockedSystemIds.includes(systemId) ? 1 : 0)),
  ])) as GameState["exploration"]["surveyProgressBySystem"];
  const missions: GameState["exploration"]["missions"] = Array.isArray(saved.exploration?.missions)
    ? saved.exploration.missions.flatMap((mission: Record<string, any>) => {
      if (!validStarSystemId(mission.systemId) || unlockedSystemIds.includes(mission.systemId)) return [];
      const durationSeconds = Math.max(1, nonNegativeNumber(mission.durationSeconds));
      return [{
        systemId: mission.systemId,
        elapsedSeconds: Math.min(durationSeconds, nonNegativeNumber(mission.elapsedSeconds)),
        durationSeconds,
      }];
    })
    : [];
  const blueprints: BlueprintDefinition[] = saved.version >= 14 && Array.isArray(saved.blueprints)
    ? saved.blueprints.flatMap((blueprint: Record<string, any>, blueprintIndex: number) => {
      if (!Array.isArray(blueprint.entities)) return [];
      const blueprintEntities = blueprint.entities.flatMap((entity: Record<string, any>, entityIndex: number) => {
        if (typeof entity.buildingId !== "string" || !(entity.buildingId in BUILDINGS)) return [];
        const recipeId = typeof entity.recipeId === "string" && getRecipe(entity.recipeId as RecipeId) ? entity.recipeId as RecipeId : undefined;
        const storedItemId = typeof entity.storedItemId === "string" && entity.storedItemId in ITEMS ? entity.storedItemId as ItemId : undefined;
        const fuelItemId = typeof entity.fuelItemId === "string" && entity.fuelItemId in ITEMS ? entity.fuelItemId as ItemId : undefined;
        return [{
          key: typeof entity.key === "string" && entity.key ? entity.key : `node_${entityIndex + 1}`,
          buildingId: entity.buildingId as BuildingId,
          offset: {
            x: typeof entity.offset?.x === "number" && Number.isFinite(entity.offset.x) ? entity.offset.x : 0,
            y: typeof entity.offset?.y === "number" && Number.isFinite(entity.offset.y) ? entity.offset.y : 0,
          },
          machineCount: Math.max(1, nonNegativeInteger(entity.machineCount)),
          recipeId,
          storedItemId,
          distributionMode: entity.distributionMode === "priority" ? "priority" as const : entity.distributionMode === "balanced" ? "balanced" as const : undefined,
          fuelItemId,
          energyMode: validEnergyMode(entity.energyMode) ? entity.energyMode : undefined,
          stationMode: entity.stationMode === "demand" ? "demand" as const : entity.stationMode === "supply" ? "supply" as const : undefined,
          stationMinimumLoad: validStationMinimumLoad(entity.stationMinimumLoad) ? entity.stationMinimumLoad : undefined,
          stationWarpEnabled: typeof entity.stationWarpEnabled === "boolean" ? entity.stationWarpEnabled : undefined,
          stationSlots: getBuilding(entity.buildingId as BuildingId).kind === "station" && entity.buildingId !== "orbital_collector"
            ? normalizeStationSlots({
              kind: "station",
              buildingId: entity.buildingId,
              storedItemId,
              stationMode: entity.stationMode,
              stationMinimumLoad: entity.stationMinimumLoad,
              stationSlots: entity.stationSlots,
            } as FactoryEntity)
            : undefined,
          sprayCoaterInstalled: Boolean(entity.sprayCoaterInstalled),
          proliferatorTier: validProliferatorTier(entity.proliferatorTier) ? entity.proliferatorTier : undefined,
          proliferatorMode: validProliferatorMode(entity.proliferatorMode) ? entity.proliferatorMode : undefined,
        }];
      });
      if (blueprintEntities.length === 0) return [];
      const keys = new Set(blueprintEntities.map((entity) => entity.key));
      const blueprintBelts = Array.isArray(blueprint.belts) ? blueprint.belts.flatMap((belt: Record<string, any>, beltIndex: number) => {
        if (!keys.has(belt.sourceKey) || !keys.has(belt.targetKey) || typeof belt.itemId !== "string" || !(belt.itemId in ITEMS)) return [];
        return [{
          key: typeof belt.key === "string" && belt.key ? belt.key : `line_${beltIndex + 1}`,
          sourceKey: belt.sourceKey as string,
          targetKey: belt.targetKey as string,
          itemId: belt.itemId as ItemId,
          lanes: Math.max(1, nonNegativeInteger(belt.lanes)),
          tier: validBeltTier(belt.tier) ? belt.tier : 1,
          sorterTier: validBeltTier(belt.sorterTier) ? belt.sorterTier : 1,
          priority: validPriority(belt.priority) ? belt.priority : 0,
          stackSize: validCargoStackSize(belt.stackSize) ? belt.stackSize : 1,
          monitorEnabled: Boolean(belt.monitorEnabled),
        }];
      }) : [];
      const externalPorts = Array.isArray(blueprint.externalPorts) ? blueprint.externalPorts.flatMap((port: Record<string, any>, portIndex: number) => {
        if (!keys.has(port.entityKey) || typeof port.itemId !== "string" || !(port.itemId in ITEMS) ||
          (port.direction !== "input" && port.direction !== "output")) return [];
        return [{
          key: typeof port.key === "string" && port.key ? port.key : `port_${portIndex + 1}`,
          entityKey: port.entityKey as string,
          direction: port.direction as "input" | "output",
          itemId: port.itemId as ItemId,
          offset: {
            x: typeof port.offset?.x === "number" && Number.isFinite(port.offset.x) ? port.offset.x : 0,
            y: typeof port.offset?.y === "number" && Number.isFinite(port.offset.y) ? port.offset.y : 0,
          },
        }];
      }) : [];
      const recipeOverrides = Object.fromEntries(Object.entries(blueprint.recipeOverrides ?? {}).flatMap(([sourceId, targetId]) =>
        getRecipe(sourceId as RecipeId) && typeof targetId === "string" && getRecipe(targetId as RecipeId)
          ? [[sourceId, targetId]]
          : [])) as BlueprintDefinition["recipeOverrides"];
      return [{
        id: typeof blueprint.id === "string" && blueprint.id ? blueprint.id : `blueprint_migrated_${blueprintIndex + 1}`,
        name: typeof blueprint.name === "string" && blueprint.name.trim() ? blueprint.name.trim().slice(0, 32) : `蓝图 ${String(blueprintIndex + 1).padStart(2, "0")}`,
        entities: blueprintEntities,
        belts: blueprintBelts,
        externalPorts,
        rotation: validBlueprintRotation(blueprint.rotation) ? blueprint.rotation : 0,
        mirror: validBlueprintMirror(blueprint.mirror) ? blueprint.mirror : "none",
        recipeOverrides,
      } as BlueprintDefinition];
    })
    : [];
  const constructionQueue: GameState["constructionQueue"] = Array.isArray(saved.constructionQueue)
    ? saved.constructionQueue.flatMap((entry: Record<string, any>, index: number) => {
      const blueprint = blueprints.find((candidate) => candidate.id === entry.blueprintId);
      if (!blueprint || !validPlanetId(entry.planetId)) return [];
      return [{
        id: typeof entry.id === "string" && entry.id ? entry.id : `construction_migrated_${index + 1}`,
        blueprintId: blueprint.id,
        blueprintName: typeof entry.blueprintName === "string" && entry.blueprintName.trim()
          ? entry.blueprintName.trim().slice(0, 32)
          : blueprint.name,
        planetId: entry.planetId,
        position: {
          x: typeof entry.position?.x === "number" && Number.isFinite(entry.position.x) ? entry.position.x : 0,
          y: typeof entry.position?.y === "number" && Number.isFinite(entry.position.y) ? entry.position.y : 0,
        },
        rotation: validBlueprintRotation(entry.rotation) ? entry.rotation : blueprint.rotation ?? 0,
        mirror: validBlueprintMirror(entry.mirror) ? entry.mirror : blueprint.mirror ?? "none",
        queuedAt: nonNegativeNumber(entry.queuedAt),
      }];
    })
    : [];
  const productionPlans: GameState["productionPlans"] = Array.isArray(saved.productionPlans)
    ? saved.productionPlans.flatMap((plan: Record<string, any>, index: number) => {
      if (typeof plan.itemId !== "string" || !(plan.itemId in ITEMS)) return [];
      const recipeSelections = Object.fromEntries(Object.entries(plan.recipeSelections ?? {}).flatMap(([itemId, recipeId]) =>
        itemId in ITEMS && typeof recipeId === "string" && getRecipe(recipeId as RecipeId)
          ? [[itemId, recipeId]]
          : []));
      return [{
        id: typeof plan.id === "string" && plan.id ? plan.id : `plan_migrated_${index + 1}`,
        name: typeof plan.name === "string" && plan.name.trim() ? plan.name.trim().slice(0, 40) : `${ITEMS[plan.itemId as ItemId].name}计划`,
        itemId: plan.itemId as ItemId,
        targetPerMinute: Math.max(0.01, nonNegativeNumber(plan.targetPerMinute)),
        planetId: plan.planetId === "all" || validPlanetId(plan.planetId) ? plan.planetId : "all",
        recipeSelections,
        createdAt: nonNegativeNumber(plan.createdAt),
      }];
    })
    : [];
  const productionHistory: GameState["productionHistory"] = Array.isArray(saved.productionHistory)
    ? saved.productionHistory.slice(-180).flatMap((sample: Record<string, any>) => {
      const elapsedSeconds = nonNegativeNumber(sample.elapsedSeconds);
      if (elapsedSeconds <= 0) return [];
      return [{
        elapsedSeconds,
        productionPerMinute: nonNegativeRecord(sample.productionPerMinute),
        consumptionPerMinute: nonNegativeRecord(sample.consumptionPerMinute),
        inventory: integerRecord(sample.inventory),
        generationKw: nonNegativeNumber(sample.generationKw),
        demandKw: nonNegativeNumber(sample.demandKw),
      }];
    })
    : [];
  const structurePoints = saved.version >= 7 ? nonNegativeInteger(saved.dysonSphere?.structurePoints) : 0;
  const shellCapacity = structurePoints * DYSON_SHELL_CAPACITY_PER_STRUCTURE;
  const shellSails = saved.version >= 7
    ? Math.min(shellCapacity, nonNegativeInteger(saved.dysonSphere?.shellSails))
    : 0;
  const totalSailsAbsorbed = saved.version >= 7
    ? Math.max(shellSails, nonNegativeInteger(saved.dysonSphere?.totalSailsAbsorbed))
    : 0;
  const dysonSphere: GameState["dysonSphere"] = {
    structurePoints,
    totalRocketsLaunched: saved.version >= 7
      ? Math.max(structurePoints, nonNegativeInteger(saved.dysonSphere?.totalRocketsLaunched))
      : 0,
    shellSails,
    totalSailsAbsorbed,
    absorptionProgress: saved.version >= 7 ? nonNegativeNumber(saved.dysonSphere?.absorptionProgress) % 1 : 0,
    generationKw: structurePoints * DYSON_STRUCTURE_POWER_KW + shellSails * DYSON_SHELL_SAIL_POWER_KW,
  };
  const dysonPlans = Object.fromEntries((Object.keys(STAR_SYSTEMS) as StarSystemId[]).map((systemId) => {
    const savedPlan = saved.version >= 15 ? saved.dysonPlans?.[systemId] : undefined;
    const layers: DysonLayerState[] = Array.isArray(savedPlan?.layers) ? savedPlan.layers.flatMap((layer: Record<string, any>, layerIndex: number) => {
      const nodes = Array.isArray(layer.nodes) ? layer.nodes.flatMap((node: Record<string, any>, nodeIndex: number) => {
        const required = Math.max(1, nonNegativeInteger(node.requiredStructurePoints));
        const rawAngle = typeof node.angle === "number" && Number.isFinite(node.angle) ? node.angle : 0;
        return [{
          id: typeof node.id === "string" && node.id ? node.id : `dyson_node_migrated_${layerIndex}_${nodeIndex}`,
          angle: ((rawAngle % 360) + 360) % 360,
          requiredStructurePoints: required,
          completedStructurePoints: Math.min(required, nonNegativeInteger(node.completedStructurePoints)),
        }];
      }) : [];
      const nodeIds = new Set(nodes.map((node) => node.id));
      const frames = Array.isArray(layer.frames) ? layer.frames.flatMap((frame: Record<string, any>, frameIndex: number) => {
        if (!nodeIds.has(frame.sourceNodeId) || !nodeIds.has(frame.targetNodeId) || frame.sourceNodeId === frame.targetNodeId) return [];
        const required = Math.max(1, nonNegativeInteger(frame.requiredStructurePoints));
        return [{
          id: typeof frame.id === "string" && frame.id ? frame.id : `dyson_frame_migrated_${layerIndex}_${frameIndex}`,
          sourceNodeId: frame.sourceNodeId as string,
          targetNodeId: frame.targetNodeId as string,
          requiredStructurePoints: required,
          completedStructurePoints: Math.min(required, nonNegativeInteger(frame.completedStructurePoints)),
        }];
      }) : [];
      const frameIds = new Set(frames.map((frame) => frame.id));
      const shells = Array.isArray(layer.shells) ? layer.shells.flatMap((shell: Record<string, any>, shellIndex: number) => {
        const boundaryFrameIds = Array.isArray(shell.boundaryFrameIds)
          ? [...new Set((shell.boundaryFrameIds as unknown[]).filter((frameId): frameId is string => typeof frameId === "string" && frameIds.has(frameId)))]
          : [];
        if (!nodeIds.has(shell.sourceNodeId) || !nodeIds.has(shell.targetNodeId) || boundaryFrameIds.length === 0) return [];
        const capacity = Math.max(1, nonNegativeInteger(shell.sailCapacity));
        return [{
          id: typeof shell.id === "string" && shell.id ? shell.id : `dyson_shell_migrated_${layerIndex}_${shellIndex}`,
          sourceNodeId: shell.sourceNodeId as string,
          targetNodeId: shell.targetNodeId as string,
          boundaryFrameIds,
          sailCapacity: capacity,
          absorbedSails: Math.min(capacity, nonNegativeInteger(shell.absorbedSails)),
        }];
      }) : [];
      const radius = typeof layer.radius === "number" && Number.isFinite(layer.radius) ? layer.radius : 10_000;
      const inclination = typeof layer.inclination === "number" && Number.isFinite(layer.inclination) ? layer.inclination : 0;
      const longitude = typeof layer.longitude === "number" && Number.isFinite(layer.longitude) ? layer.longitude : 0;
      return [{
        id: typeof layer.id === "string" && layer.id ? layer.id : `dyson_layer_migrated_${layerIndex}`,
        name: typeof layer.name === "string" && layer.name.trim() ? layer.name.trim().slice(0, 32) : `壳层 ${layerIndex + 1}`,
        radius: Math.max(5_000, Math.min(50_000, Math.round(radius))),
        inclination: Math.max(-90, Math.min(90, Math.round(inclination))),
        longitude: ((longitude % 360) + 360) % 360,
        nodes,
        frames,
        shells,
      }];
    }) : [];
    const activeLayerId = typeof savedPlan?.activeLayerId === "string" && layers.some((layer) => layer.id === savedPlan.activeLayerId)
      ? savedPlan.activeLayerId as string
      : layers[0]?.id ?? null;
    return [systemId, {
      systemId,
      activeLayerId,
      structurePoints: saved.version >= 15
        ? nonNegativeInteger(savedPlan?.structurePoints)
        : systemId === "helios" ? structurePoints : 0,
      shellSails: saved.version >= 15
        ? nonNegativeInteger(savedPlan?.shellSails)
        : systemId === "helios" ? shellSails : 0,
      layers,
    } satisfies DysonSpherePlanState];
  })) as GameState["dysonPlans"];
  const plannedStructurePoints = Object.values(dysonPlans).reduce((sum, plan) => sum + plan.structurePoints, 0);
  const plannedShellSails = Object.values(dysonPlans).reduce((sum, plan) => sum + plan.shellSails, 0);
  dysonSphere.structurePoints = Math.max(dysonSphere.structurePoints, plannedStructurePoints);
  dysonSphere.shellSails = Math.max(dysonSphere.shellSails, plannedShellSails);
  dysonSphere.totalRocketsLaunched = Math.max(dysonSphere.totalRocketsLaunched, dysonSphere.structurePoints);
  dysonSphere.totalSailsAbsorbed = Math.max(dysonSphere.totalSailsAbsorbed, dysonSphere.shellSails);
  dysonSphere.generationKw = dysonSphere.structurePoints * DYSON_STRUCTURE_POWER_KW + dysonSphere.shellSails * DYSON_SHELL_SAIL_POWER_KW;
  const sailsInOrbit = saved.version >= 6 ? nonNegativeInteger(saved.dysonSwarm?.sailsInOrbit) : 0;
  const totalExpired = saved.version >= 6 ? nonNegativeInteger(saved.dysonSwarm?.totalExpired) : 0;
  const totalLaunched = saved.version >= 6
    ? Math.max(sailsInOrbit + totalExpired + dysonSphere.totalSailsAbsorbed, nonNegativeInteger(saved.dysonSwarm?.totalLaunched))
    : 0;
  const swarmGenerationKw = sailsInOrbit * SOLAR_SAIL_POWER_KW;
  const dysonSwarm: GameState["dysonSwarm"] = {
    sailsInOrbit,
    totalLaunched,
    totalExpired,
    decayProgress: saved.version >= 6 ? nonNegativeNumber(saved.dysonSwarm?.decayProgress) % 1 : 0,
    generationKw: swarmGenerationKw,
    receiverLoadKw: saved.version >= 6
      ? Math.min(swarmGenerationKw + dysonSphere.generationKw, nonNegativeNumber(saved.dysonSwarm?.receiverLoadKw))
      : 0,
  };
  const dysonEngineering: DysonEngineeringState = {
    ...initial.dysonEngineering,
    launchMode: validDysonLaunchMode(saved.dysonEngineering?.launchMode) ? saved.dysonEngineering.launchMode : initial.dysonEngineering.launchMode,
    launchThrottle: validDysonLaunchThrottle(saved.dysonEngineering?.launchThrottle) ? saved.dysonEngineering.launchThrottle : initial.dysonEngineering.launchThrottle,
    launchEnabled: typeof saved.dysonEngineering?.launchEnabled === "boolean" ? saved.dysonEngineering.launchEnabled : true,
    activeOrbitBySystem: { ...initial.dysonEngineering.activeOrbitBySystem },
    orbitsBySystem: { ...initial.dysonEngineering.orbitsBySystem },
    absorptionProgressBySystem: { ...initial.dysonEngineering.absorptionProgressBySystem },
    launchEnergySpentMj: saved.version >= 22 ? nonNegativeNumber(saved.dysonEngineering?.launchEnergySpentMj) : 0,
  };
  const persistedOrbitData = saved.version >= 22 &&
    saved.dysonEngineering?.orbitsBySystem &&
    Object.values(saved.dysonEngineering.orbitsBySystem).some((value) => Array.isArray(value));
  for (const systemId of Object.keys(STAR_SYSTEMS) as StarSystemId[]) {
    const rawOrbits = saved.version >= 22 ? saved.dysonEngineering?.orbitsBySystem?.[systemId] : undefined;
    const parsedOrbits: DysonSwarmOrbitState[] = Array.isArray(rawOrbits) ? rawOrbits.flatMap((orbit: Record<string, any>, index: number) => {
      if (typeof orbit.id !== "string" || !orbit.id) return [];
      return [{
        id: orbit.id,
        name: typeof orbit.name === "string" && orbit.name.trim() ? orbit.name.trim().slice(0, 24) : defaultDysonOrbit(systemId, index).name,
        radius: Math.max(5_000, Math.min(50_000, Math.round(typeof orbit.radius === "number" ? orbit.radius : defaultDysonOrbit(systemId, index).radius))),
        inclination: Math.max(-90, Math.min(90, Math.round(typeof orbit.inclination === "number" ? orbit.inclination : 0))),
        longitude: ((typeof orbit.longitude === "number" ? orbit.longitude : 0) % 360 + 360) % 360,
        sailsInOrbit: nonNegativeInteger(orbit.sailsInOrbit),
        totalLaunched: nonNegativeInteger(orbit.totalLaunched),
        totalExpired: nonNegativeInteger(orbit.totalExpired),
        decayProgress: nonNegativeNumber(orbit.decayProgress) % 1,
        generationKw: nonNegativeNumber(orbit.sailsInOrbit) * SOLAR_SAIL_POWER_KW,
      } satisfies DysonSwarmOrbitState];
    }) : [];
    const orbits = parsedOrbits.length > 0 ? parsedOrbits.slice(0, 8) : [defaultDysonOrbit(systemId)];
    dysonEngineering.orbitsBySystem[systemId] = orbits;
    const active = saved.version >= 22 ? saved.dysonEngineering?.activeOrbitBySystem?.[systemId] : undefined;
    dysonEngineering.activeOrbitBySystem[systemId] = typeof active === "string" && orbits.some((orbit) => orbit.id === active)
      ? active
      : orbits[0].id;
    dysonEngineering.absorptionProgressBySystem[systemId] = persistedOrbitData
      ? nonNegativeNumber(saved.dysonEngineering?.absorptionProgressBySystem?.[systemId]) % 1
      : systemId === "helios" ? dysonSphere.absorptionProgress : 0;
  }
  if (!persistedOrbitData) {
    const legacyOrbit = dysonEngineering.orbitsBySystem.helios[0];
    legacyOrbit.sailsInOrbit = sailsInOrbit;
    legacyOrbit.totalLaunched = totalLaunched;
    legacyOrbit.totalExpired = totalExpired;
    legacyOrbit.decayProgress = dysonSwarm.decayProgress;
    legacyOrbit.generationKw = swarmGenerationKw;
  }
  const settings: GameState["settings"] = {
    simulationSpeed: validSimulationSpeed(saved.settings?.simulationSpeed)
      ? saved.settings.simulationSpeed
      : initial.settings.simulationSpeed,
    performanceMode: typeof saved.settings?.performanceMode === "boolean"
      ? saved.settings.performanceMode
      : initial.settings.performanceMode,
    reducedMotion: typeof saved.settings?.reducedMotion === "boolean"
      ? saved.settings.reducedMotion
      : initial.settings.reducedMotion,
    soundEnabled: typeof saved.settings?.soundEnabled === "boolean"
      ? saved.settings.soundEnabled
      : initial.settings.soundEnabled,
    autosaveIntervalSeconds: validAutosaveInterval(saved.settings?.autosaveIntervalSeconds)
      ? saved.settings.autosaveIntervalSeconds
      : initial.settings.autosaveIntervalSeconds,
    resourceMode: saved.version >= 20 && saved.settings?.resourceMode === "finite" ? "finite" : "infinite",
  };

  const recipeFocus: GameState["recipeFocus"] = {
    itemId: typeof saved.recipeFocus?.itemId === "string" && saved.recipeFocus.itemId in ITEMS ? saved.recipeFocus.itemId as ItemId : null,
    mode: saved.recipeFocus?.mode === "full" ? "full" : "two-level",
    position: {
      x: typeof saved.recipeFocus?.position?.x === "number" && Number.isFinite(saved.recipeFocus.position.x) ? Math.max(8, Math.round(saved.recipeFocus.position.x)) : initial.recipeFocus.position.x,
      y: typeof saved.recipeFocus?.position?.y === "number" && Number.isFinite(saved.recipeFocus.position.y) ? Math.max(8, Math.round(saved.recipeFocus.position.y)) : initial.recipeFocus.position.y,
    },
  };

  const powerGridMetrics: GameState["powerGridMetrics"] = Object.fromEntries(PLANET_LIST.map((planet) => [
    planet.id,
    Object.fromEntries(Object.entries(initial.powerGridMetrics[planet.id]).map(([gridId, metrics]) => [
      gridId,
      { ...metrics, ...(saved.powerGridMetrics?.[planet.id]?.[gridId] ?? {}) },
    ])),
  ])) as GameState["powerGridMetrics"];
  const unlockedAchievementIds = Array.isArray(saved.achievements?.unlockedIds)
    ? [...new Set(saved.achievements.unlockedIds.filter(isAchievementId))]
    : [];
  const endgame = migrateEndgame(saved);

  const migrated = {
    ...initial,
    ...saved,
    version: 23,
    activePlanetId,
    entities,
    belts,
    cargo: saved.cargo ? { ...saved.cargo, amount: Math.max(1, Math.floor(saved.cargo.amount ?? 1)) } : null,
    tray: { ...planetTrays[activePlanetId] },
    planetTrays,
    construction,
    totalProduced: integerRecord(saved.totalProduced),
    research: {
      selectedTechId,
      queuedTechIds,
      progressByTech: researchProgress(saved.research?.progressByTech),
      completedTechIds,
    },
    exploration: { unlockedSystemIds, colonizedPlanetIds, missions, surveyProgressBySystem },
    galaxy,
    recipeFocus,
    settings,
    achievements: { unlockedIds: unlockedAchievementIds },
    campaign: normalizeCampaignState(saved.campaign),
    blueprints,
    constructionQueue,
    productionPlans,
    productionHistory,
    historyRecordedAt: Math.max(
      nonNegativeNumber(saved.historyRecordedAt),
      productionHistory.at(-1)?.elapsedSeconds ?? 0,
    ),
    metrics: { ...planetMetrics[activePlanetId] },
    planetMetrics,
    powerGridMetrics,
    dysonSwarm,
    dysonSphere,
    dysonEngineering,
    dysonPlans,
    endgame,
  } as GameState;
  return syncCampaignProgress(migrated, { grantRewards: saved.version >= 18 });
}

function persistentState(state: GameState): GameState {
  return {
    ...state,
    planetTrays: { ...state.planetTrays, [state.activePlanetId]: { ...state.tray } },
  };
}

function saveEnvelope(state: GameState, savedAt = Date.now()): SaveEnvelope {
  return { state: persistentState(state), savedAt };
}

function buildOfflineReport(before: GameState, after: GameState, seconds: number): OfflineReport {
  const produced = (Object.keys(ITEMS) as ItemId[]).flatMap((itemId) => {
    const amount = Math.max(0, Math.floor((after.totalProduced[itemId] ?? 0) - (before.totalProduced[itemId] ?? 0)));
    return amount > 0 ? [{ itemId, amount }] : [];
  }).sort((left, right) => right.amount - left.amount);
  const beforeTechIds = new Set(before.research.completedTechIds);
  const infiniteResearchLevels = (Object.keys(after.endgame.infiniteResearch) as InfiniteResearchId[]).flatMap((id) => {
    const beforeLevel = before.endgame.infiniteResearch[id]?.level ?? 0;
    const afterLevel = after.endgame.infiniteResearch[id]?.level ?? 0;
    return afterLevel > beforeLevel ? [{ id, level: afterLevel - beforeLevel }] : [];
  });
  const exported = (Object.keys(after.endgame.exportProjects) as GalacticExportProjectId[]).flatMap((projectId) => {
    const amount = Math.max(0, (after.endgame.exportProjects[projectId]?.totalDelivered ?? 0) -
      (before.endgame.exportProjects[projectId]?.totalDelivered ?? 0));
    return amount > 0 ? [{ projectId, amount }] : [];
  });
  return {
    seconds,
    produced,
    completedTechIds: after.research.completedTechIds.filter((techId) => !beforeTechIds.has(techId)),
    structurePointsAdded: Math.max(0, after.dysonSphere.structurePoints - before.dysonSphere.structurePoints),
    shellSailsAdded: Math.max(0, after.dysonSphere.shellSails - before.dysonSphere.shellSails),
    infiniteResearchLevels,
    exported,
    galacticCreditsAdded: Math.max(0, after.endgame.galacticCredits - before.endgame.galacticCredits),
  };
}

function parseEnvelope(raw: string, advanceOffline: boolean): LoadedGame | null {
  const parsed = JSON.parse(raw) as SaveEnvelope | Record<string, unknown>;
  const envelope = "state" in parsed
    ? parsed as SaveEnvelope
    : { state: parsed, savedAt: Date.now() } satisfies SaveEnvelope;
  const state = migrateGame(envelope.state);
  if (!state) return null;
  const savedAt = typeof envelope.savedAt === "number" && Number.isFinite(envelope.savedAt)
    ? envelope.savedAt
    : Date.now();
  const offlineSeconds = advanceOffline && !state.paused
    ? Math.min(getOfflineSimulationLimitSeconds(state), Math.max(0, (Date.now() - savedAt) / 1000))
    : 0;
  const advanced = offlineSeconds >= 1 ? advanceSimulation(state, offlineSeconds) : state;
  return {
    state: advanced,
    offlineSeconds,
    offlineReport: offlineSeconds >= 1 ? buildOfflineReport(state, advanced, offlineSeconds) : null,
  };
}

export function loadGame(): LoadedGame {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return { state: createInitialState(), offlineSeconds: 0, offlineReport: null };
    return parseEnvelope(raw, true) ?? { state: createInitialState(), offlineSeconds: 0, offlineReport: null };
  } catch {
    return { state: createInitialState(), offlineSeconds: 0, offlineReport: null };
  }
}

export function saveGame(state: GameState): void {
  window.localStorage.setItem(SAVE_KEY, JSON.stringify(saveEnvelope(state)));
}

export function exportGame(state: GameState): string {
  return JSON.stringify(saveEnvelope(state), null, 2);
}

export function importGame(raw: string): GameState | null {
  try {
    return parseEnvelope(raw, false)?.state ?? null;
  } catch {
    return null;
  }
}

function saveSlotKey(slotId: SaveSlotId): string {
  return `${SAVE_SLOT_KEY_PREFIX}.${slotId}`;
}

export function saveGameSlot(slotId: SaveSlotId, state: GameState): void {
  window.localStorage.setItem(saveSlotKey(slotId), JSON.stringify(saveEnvelope(state)));
}

export function loadGameSlot(slotId: SaveSlotId): LoadedGame | null {
  try {
    const raw = window.localStorage.getItem(saveSlotKey(slotId));
    return raw ? parseEnvelope(raw, true) : null;
  } catch {
    return null;
  }
}

export function clearGameSlot(slotId: SaveSlotId): void {
  window.localStorage.removeItem(saveSlotKey(slotId));
}

export function getSaveSlotSummaries(): SaveSlotSummary[] {
  return ([1, 2, 3] as SaveSlotId[]).flatMap((slotId) => {
    try {
      const raw = window.localStorage.getItem(saveSlotKey(slotId));
      if (!raw) return [];
      const parsed = JSON.parse(raw) as SaveEnvelope;
      const state = migrateGame(parsed.state);
      if (!state) return [];
      return [{
        slotId,
        savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
        elapsedSeconds: state.elapsedSeconds,
        completedTechCount: state.research.completedTechIds.length,
        structurePoints: state.dysonSphere.structurePoints,
        activePlanetId: state.activePlanetId,
      }];
    } catch {
      return [];
    }
  });
}

export function clearGame(): void {
  window.localStorage.removeItem(SAVE_KEY);
}
