import {
  DYSON_SHELL_CAPACITY_PER_STRUCTURE,
  DYSON_SHELL_SAIL_POWER_KW,
  DYSON_STRUCTURE_POWER_KW,
  SOLAR_SAIL_POWER_KW,
  advanceSimulation,
  createInitialState,
} from "./engine";
import { getBeltConstructionId, getBuilding, getExtractorBuildingId, getTechnology } from "./content";
import type { BeltConnection, BeltTier, BuildingId, ConstructionId, EnergyMode, FactoryEntity, GameState, ItemId, PlanetId, ProliferatorMode, ProliferatorTier, StationMinimumLoad, TechId } from "./types";

const SAVE_KEY = "dsp-idle-network.save.v1";

interface SaveEnvelope {
  savedAt: number;
  state: GameState | Record<string, unknown>;
}

export interface LoadedGame {
  state: GameState;
  offlineSeconds: number;
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
  return value === "home" || value === "ashen" || value === "giant";
}

function validStationMinimumLoad(value: unknown): value is StationMinimumLoad {
  return value === 0.1 || value === 0.25 || value === 0.5 || value === 1;
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

function inferLegacyPlanet(entity: FactoryEntity): PlanetId {
  if (entity.id.startsWith("ashen_")) return "ashen";
  if (entity.resourceId === "silicon_ore" || entity.resourceId === "titanium_ore") return "ashen";
  if (entity.kind !== "vein" && entity.position?.x < -650) return "ashen";
  return "home";
}

function migrateGame(value: unknown): GameState | null {
  if (!value || typeof value !== "object") return null;
  const saved = value as Record<string, any>;
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].includes(saved.version) || !Array.isArray(saved.entities)) return null;
  const initial = createInitialState();
  const entities = saved.entities.map((entity: FactoryEntity) => {
    const planetId = validPlanetId(entity.planetId) ? entity.planetId : inferLegacyPlanet(entity);
    const position = { ...entity.position };
    const sprayCoaterInstalled = Boolean(entity.sprayCoaterInstalled);
    const planetaryStation = entity.buildingId === "planetary_logistics_station";
    const interstellarStation = entity.buildingId === "interstellar_logistics_station";
    const orbitalCollector = entity.buildingId === "orbital_collector";
    const accumulator = entity.buildingId === "accumulator";
    const energyExchanger = entity.buildingId === "energy_exchanger";
    const storedEnergyCapacity = accumulator || energyExchanger
      ? (getBuilding(entity.buildingId!).energyCapacityMj ?? 0) * Math.max(0, Math.floor(entity.machineCount ?? 0))
      : 0;
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
      recipeId: energyExchanger
        ? entity.energyMode === "discharge" ? "accumulator_discharge" : "accumulator_charge"
        : entity.recipeId,
      routingCursor: Math.max(0, Math.floor(entity.routingCursor ?? 0)),
      distributionMode: entity.kind === "splitter" ? entity.distributionMode ?? "balanced" : entity.distributionMode,
      storedItemId: orbitalCollector
        ? entity.storedItemId === "deuterium" ? "deuterium" : "hydrogen"
        : entity.storedItemId,
      stationMode: entity.kind === "station" ? orbitalCollector ? "supply" : entity.stationMode ?? "supply" : entity.stationMode,
      stationProgress: entity.kind === "station" ? Math.max(0, entity.stationProgress ?? 0) : entity.stationProgress,
      stationTrips: entity.kind === "station" ? Math.max(0, Math.floor(entity.stationTrips ?? 0)) : entity.stationTrips,
      stationLastTransfer: entity.kind === "station" ? Math.max(0, Math.floor(entity.stationLastTransfer ?? 0)) : entity.stationLastTransfer,
      stationDrones: planetaryStation ? nonNegativeInteger(entity.stationDrones) : undefined,
      stationVessels: interstellarStation
        ? saved.version < 5 ? 1 : Math.max(0, Math.floor(entity.stationVessels ?? 0))
        : undefined,
      stationWarpers: interstellarStation ? nonNegativeInteger(entity.stationWarpers) : undefined,
      stationWarpEnabled: interstellarStation ? entity.stationWarpEnabled !== false : undefined,
      stationMinimumLoad: entity.kind === "station"
        ? validStationMinimumLoad(entity.stationMinimumLoad) ? entity.stationMinimumLoad : 1
        : entity.stationMinimumLoad,
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
      priority: belt.priority === 1 ? 1 as const : 0 as const,
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
  const planetTrays: GameState["planetTrays"] = {
    home: saved.version < 4 ? savedActiveTray : integerRecord(saved.planetTrays?.home),
    ashen: integerRecord(saved.planetTrays?.ashen),
    giant: integerRecord(saved.planetTrays?.giant),
  };
  if (saved.version >= 4 && saved.tray && typeof saved.tray === "object") planetTrays[activePlanetId] = savedActiveTray;
  const planetMetrics: GameState["planetMetrics"] = {
    home: { ...initial.planetMetrics.home, ...(saved.version < 4 ? saved.metrics ?? {} : saved.planetMetrics?.home ?? {}) },
    ashen: { ...initial.planetMetrics.ashen, ...(saved.planetMetrics?.ashen ?? {}) },
    giant: { ...initial.planetMetrics.giant, ...(saved.planetMetrics?.giant ?? {}) },
  };
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
  const sailsInOrbit = saved.version >= 6 ? nonNegativeInteger(saved.dysonSwarm?.sailsInOrbit) : 0;
  const totalExpired = saved.version >= 6 ? nonNegativeInteger(saved.dysonSwarm?.totalExpired) : 0;
  const totalLaunched = saved.version >= 6
    ? Math.max(sailsInOrbit + totalExpired + totalSailsAbsorbed, nonNegativeInteger(saved.dysonSwarm?.totalLaunched))
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

  return {
    ...initial,
    ...saved,
    version: 11,
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
    metrics: { ...planetMetrics[activePlanetId] },
    planetMetrics,
    dysonSwarm,
    dysonSphere,
  } as GameState;
}

export function loadGame(): LoadedGame {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return { state: createInitialState(), offlineSeconds: 0 };
    const envelope = JSON.parse(raw) as SaveEnvelope;
    const state = migrateGame(envelope.state);
    if (!state) return { state: createInitialState(), offlineSeconds: 0 };
    const offlineSeconds = state.paused
      ? 0
      : Math.min(8 * 60 * 60, Math.max(0, (Date.now() - envelope.savedAt) / 1000));
    return {
      state: offlineSeconds >= 1 ? advanceSimulation(state, offlineSeconds) : state,
      offlineSeconds,
    };
  } catch {
    return { state: createInitialState(), offlineSeconds: 0 };
  }
}

export function saveGame(state: GameState): void {
  const envelope: SaveEnvelope = {
    state: {
      ...state,
      planetTrays: { ...state.planetTrays, [state.activePlanetId]: { ...state.tray } },
    },
    savedAt: Date.now(),
  };
  window.localStorage.setItem(SAVE_KEY, JSON.stringify(envelope));
}

export function clearGame(): void {
  window.localStorage.removeItem(SAVE_KEY);
}
