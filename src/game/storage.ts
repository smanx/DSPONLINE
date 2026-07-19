import {
  DYSON_SHELL_CAPACITY_PER_STRUCTURE,
  DYSON_SHELL_SAIL_POWER_KW,
  DYSON_STRUCTURE_POWER_KW,
  SOLAR_SAIL_POWER_KW,
  advanceSimulation,
  createInitialState,
} from "./engine";
import { BUILDINGS, ITEMS, PLANET_LIST, STAR_SYSTEMS, getBeltConstructionId, getBuilding, getExtractorBuildingId, getPlanet, getRecipe, getTechnology } from "./content";
import { isAchievementId } from "./progression";
import type { BeltConnection, BeltTier, BlueprintDefinition, BuildingId, ConstructionId, DysonLayerState, DysonSpherePlanState, EnergyMode, FactoryEntity, GameState, ItemId, PlanetId, ProliferatorMode, ProliferatorTier, RecipeId, StarSystemId, StationMinimumLoad, TechId } from "./types";

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
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].includes(saved.version) || !Array.isArray(saved.entities)) return null;
  const initial = createInitialState();
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
        ? entity.storedItemId && (getPlanet(planetId).orbitalYields?.[entity.storedItemId] ?? 0) > 0 ? entity.storedItemId : "hydrogen"
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
          priority: belt.priority === 1 ? 1 as const : 0 as const,
        }];
      }) : [];
      return [{
        id: typeof blueprint.id === "string" && blueprint.id ? blueprint.id : `blueprint_migrated_${blueprintIndex + 1}`,
        name: typeof blueprint.name === "string" && blueprint.name.trim() ? blueprint.name.trim().slice(0, 32) : `蓝图 ${String(blueprintIndex + 1).padStart(2, "0")}`,
        entities: blueprintEntities,
        belts: blueprintBelts,
      } as BlueprintDefinition];
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
  };
  const unlockedAchievementIds = Array.isArray(saved.achievements?.unlockedIds)
    ? [...new Set(saved.achievements.unlockedIds.filter(isAchievementId))]
    : [];

  return {
    ...initial,
    ...saved,
    version: 17,
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
    exploration: { unlockedSystemIds },
    settings,
    achievements: { unlockedIds: unlockedAchievementIds },
    blueprints,
    metrics: { ...planetMetrics[activePlanetId] },
    planetMetrics,
    dysonSwarm,
    dysonSphere,
    dysonPlans,
  } as GameState;
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
  return {
    seconds,
    produced,
    completedTechIds: after.research.completedTechIds.filter((techId) => !beforeTechIds.has(techId)),
    structurePointsAdded: Math.max(0, after.dysonSphere.structurePoints - before.dysonSphere.structurePoints),
    shellSailsAdded: Math.max(0, after.dysonSphere.shellSails - before.dysonSphere.shellSails),
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
    ? Math.min(8 * 60 * 60, Math.max(0, (Date.now() - savedAt) / 1000))
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
