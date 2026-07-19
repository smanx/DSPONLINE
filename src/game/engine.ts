import {
  BUILDINGS,
  CONSTRUCTION,
  FUEL_ENERGY_MJ,
  ITEMS,
  PLANET_LIST,
  PROLIFERATOR_ITEM_IDS,
  buildingSupportsRecipe,
  getBeltConstructionId,
  getBuilding,
  getBuildingUpgradeTarget,
  getConstructionDefinition,
  getExtractorBuildingId,
  getFuelEfficiency,
  getFuelItemIdsForBuilding,
  getPlanet,
  getProliferator,
  getRecipe,
  getRecipesForBuilding,
  getSorterConstructionId,
  getTechnology,
} from "./content";
import type {
  BeltTier,
  BeltConnection,
  BuildingId,
  ConstructionId,
  EnergyMode,
  EntityOperatingStatus,
  FactoryEntity,
  GameState,
  ItemId,
  PlanetId,
  ProliferatorMode,
  ProliferatorTier,
  RecipeDefinition,
  RecipeId,
  SorterTier,
  StationMinimumLoad,
  TechId,
} from "./types";

const BELT_CAPACITY_PER_SECOND: Record<BeltTier, number> = { 1: 6, 2: 12, 3: 30 };
const SORTER_CAPACITY_PER_SECOND: Record<SorterTier, number> = { 1: 3, 2: 6, 3: 12 };
export const ACCUMULATOR_ENERGY_MJ = 90;
export const SOLAR_SAIL_POWER_KW = 36;
export const SOLAR_SAIL_LIFETIME_SECONDS = 1200;
export const RAY_RECEIVER_CAPACITY_KW = 6000;
export const DYSON_STRUCTURE_POWER_KW = 960;
export const DYSON_SHELL_SAIL_POWER_KW = 36;
export const DYSON_SHELL_CAPACITY_PER_STRUCTURE = 20;
export const DYSON_SAIL_ABSORPTION_PER_STRUCTURE_PER_SECOND = 0.1;
export const INTERSTELLAR_TRIP_SECONDS = 30;
export const INTERSTELLAR_CARGO_PER_VESSEL = 100;
export const STATION_VESSELS_PER_BUILDING = 10;
export const PLANETARY_TRIP_SECONDS = 8;
export const PLANETARY_CARGO_PER_DRONE = 25;
export const STATION_DRONES_PER_BUILDING = 50;
export const STATION_WARPER_CAPACITY_PER_BUILDING = 50;
export const STATION_MINIMUM_LOAD_OPTIONS: StationMinimumLoad[] = [0.1, 0.25, 0.5, 1];
const EPSILON = 0.0001;

function round(value: number, digits = 4): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function copyState(state: GameState): GameState {
  const planetTrays = Object.fromEntries(Object.entries(state.planetTrays).map(([planetId, tray]) => [
    planetId,
    { ...(planetId === state.activePlanetId ? state.tray : tray) },
  ])) as GameState["planetTrays"];
  return {
    ...state,
    entities: state.entities.map((entity) => ({
      ...entity,
      position: { ...entity.position },
      inputs: { ...entity.inputs },
      outputs: { ...entity.outputs },
      proliferatorBonusProgress: { ...entity.proliferatorBonusProgress },
    })),
    belts: state.belts.map((belt) => ({ ...belt })),
    cargo: state.cargo ? { ...state.cargo, origin: state.cargo.origin ? { ...state.cargo.origin } : undefined } : null,
    tray: { ...state.tray },
    planetTrays,
    construction: { ...state.construction },
    totalProduced: { ...state.totalProduced },
    research: {
      ...state.research,
      queuedTechIds: [...state.research.queuedTechIds],
      progressByTech: Object.fromEntries(Object.entries(state.research.progressByTech).map(([techId, progress]) => [
        techId,
        { ...progress },
      ])),
      completedTechIds: [...state.research.completedTechIds],
    },
    metrics: { ...state.metrics },
    planetMetrics: Object.fromEntries(Object.entries(state.planetMetrics).map(([planetId, metrics]) => [
      planetId,
      { ...metrics },
    ])) as GameState["planetMetrics"],
    dysonSwarm: { ...state.dysonSwarm },
    dysonSphere: { ...state.dysonSphere },
  };
}

function emptyMetrics(): GameState["metrics"] {
  return {
    generationKw: 0,
    demandKw: 0,
    powerFactor: 1,
    windGenerationKw: 0,
    solarGenerationKw: 0,
    geothermalGenerationKw: 0,
    thermalGenerationKw: 0,
    fusionGenerationKw: 0,
    artificialStarGenerationKw: 0,
    rayGenerationKw: 0,
    storageDischargeKw: 0,
    storageChargeKw: 0,
    storedEnergyMj: 0,
    storageCapacityMj: 0,
    fuelReserveSeconds: 0,
    totalItemsPerMinute: 0,
  };
}

function makeVein(id: string, planetId: PlanetId, resourceId: ItemId, x: number, y: number): FactoryEntity {
  return {
    id,
    kind: "vein",
    planetId,
    position: { x, y },
    resourceId,
    machineCount: 0,
    minerCount: 0,
    inputs: {},
    outputs: { [resourceId]: 0 },
    progress: 0,
    routingCursor: 0,
    utilization: 0,
    productionRate: 0,
  };
}

export function createInitialState(): GameState {
  const homeMetrics = emptyMetrics();
  const ashenMetrics = emptyMetrics();
  const giantMetrics = emptyMetrics();
  return {
    version: 12,
    nextId: 1,
    activePlanetId: "home",
    entities: [
      makeVein("vein_iron", "home", "iron_ore", -470, -250),
      makeVein("vein_copper", "home", "copper_ore", -470, 35),
      makeVein("vein_stone", "home", "stone", -470, 320),
      makeVein("vein_water", "home", "water", -150, -250),
      makeVein("vein_oil", "home", "crude_oil", -150, 35),
      makeVein("vein_coal", "home", "coal", -150, 320),
      makeVein("vein_optical_grating", "home", "optical_grating_crystal", 490, 320),
      makeVein("ashen_iron", "ashen", "iron_ore", -470, -250),
      makeVein("ashen_copper", "ashen", "copper_ore", -470, 35),
      makeVein("ashen_stone", "ashen", "stone", -470, 320),
      makeVein("vein_silicon", "ashen", "silicon_ore", -150, -250),
      makeVein("vein_titanium", "ashen", "titanium_ore", -150, 35),
      makeVein("ashen_coal", "ashen", "coal", -150, 320),
      makeVein("ashen_sulfuric", "ashen", "sulfuric_acid", 170, -250),
      makeVein("ashen_kimberlite", "ashen", "kimberlite_ore", 490, -250),
      makeVein("ashen_fractal_silicon", "ashen", "fractal_silicon", 490, 35),
      makeVein("ashen_organic_crystal", "ashen", "organic_crystal", 490, 320),
      makeVein("ashen_spiniform", "ashen", "spiniform_stalagmite_crystal", 810, -250),
      makeVein("ashen_unipolar", "ashen", "unipolar_magnet", 810, 35),
    ],
    belts: [],
    cargo: null,
    tray: {},
    planetTrays: { home: {}, ashen: {}, giant: {} },
    construction: {
      wind_turbine: 3,
      solar_panel: 0,
      geothermal_power_station: 0,
      thermal_power_plant: 0,
      mini_fusion_power_plant: 0,
      artificial_star: 0,
      accumulator: 0,
      energy_exchanger: 0,
      mining_machine: 2,
      arc_smelter: 3,
      plane_smelter: 0,
      assembling_machine_mk1: 3,
      assembling_machine_mk2: 0,
      assembling_machine_mk3: 0,
      spray_coater: 0,
      matrix_lab: 2,
      conveyor_belt_mk1: 10,
      conveyor_belt_mk2: 0,
      conveyor_belt_mk3: 0,
      sorter_mk1: 0,
      sorter_mk2: 0,
      sorter_mk3: 0,
      oil_extractor: 0,
      oil_refinery: 0,
      water_pump: 0,
      chemical_plant: 0,
      quantum_chemical_plant: 0,
      fractionator: 0,
      miniature_particle_collider: 0,
      em_rail_ejector: 0,
      ray_receiver: 0,
      vertical_launching_silo: 0,
      planetary_logistics_station: 0,
      interstellar_logistics_station: 0,
      orbital_collector: 0,
      storage_mk1: 0,
      storage_tank: 0,
      splitter_4way: 0,
    },
    manualMined: 0,
    totalProduced: {},
    research: {
      selectedTechId: null,
      queuedTechIds: [],
      progressByTech: {},
      completedTechIds: [],
    },
    elapsedSeconds: 0,
    metrics: homeMetrics,
    planetMetrics: { home: homeMetrics, ashen: ashenMetrics, giant: giantMetrics },
    dysonSwarm: {
      sailsInOrbit: 0,
      totalLaunched: 0,
      totalExpired: 0,
      decayProgress: 0,
      generationKw: 0,
      receiverLoadKw: 0,
    },
    dysonSphere: {
      structurePoints: 0,
      totalRocketsLaunched: 0,
      shellSails: 0,
      totalSailsAbsorbed: 0,
      absorptionProgress: 0,
      generationKw: 0,
    },
    paused: false,
  };
}

function remainingResearchCosts(state: GameState): Array<{ itemId: ItemId; amount: number }> {
  const technology = getTechnology(state.research.selectedTechId);
  if (!technology) return [];
  const progress = state.research.progressByTech[technology.id] ?? {};
  return technology.costs
    .map((cost) => ({ itemId: cost.itemId, amount: Math.max(0, cost.amount - (progress[cost.itemId] ?? 0)) }))
    .filter((cost) => cost.amount > 0);
}

export function getRecipeSpeedMultiplier(state: GameState, recipeId: RecipeId | undefined): number {
  if (recipeId !== "matrix_research") return 1;
  return 1 + (state.research.completedTechIds.includes("research_speed_1") ? 0.25 : 0) +
    (state.research.completedTechIds.includes("research_speed_2") ? 0.25 : 0) +
    (state.research.completedTechIds.includes("research_speed_3") ? 0.25 : 0);
}

export function getMiningSpeedMultiplier(state: GameState): number {
  return state.research.completedTechIds.includes("mining_speed_1") ? 1.5 : 1;
}

function proliferatorApplies(entity: FactoryEntity, recipe: RecipeDefinition | undefined): boolean {
  return Boolean(entity.sprayCoaterInstalled && entity.proliferatorTier && entity.proliferatorMode &&
    entity.proliferatorMode !== "normal" && recipe && recipe.inputs.length > 0 && recipe.outputs.length > 0);
}

export function isProliferatorEligible(entity: FactoryEntity): boolean {
  const recipe = getRecipe(entity.recipeId);
  return entity.kind === "machine" && entity.buildingId !== "spray_coater" && Boolean(recipe?.inputs.length && recipe.outputs.length);
}

export function getEntityProliferatorItemId(entity: FactoryEntity): ItemId | undefined {
  return entity.proliferatorTier ? getProliferator(entity.proliferatorTier).itemId : undefined;
}

export function getEntityProliferatorSpeedMultiplier(entity: FactoryEntity): number {
  const recipe = getRecipe(entity.recipeId);
  if (!proliferatorApplies(entity, recipe) || entity.proliferatorMode !== "speed") return 1;
  return 1 + getProliferator(entity.proliferatorTier!).speedBonus;
}

export function getEntityProliferatorPowerMultiplier(entity: FactoryEntity): number {
  const recipe = getRecipe(entity.recipeId);
  return proliferatorApplies(entity, recipe) ? getProliferator(entity.proliferatorTier!).powerMultiplier : 1;
}

export function getEntityExtraProductBonus(entity: FactoryEntity): number {
  const recipe = getRecipe(entity.recipeId);
  if (!proliferatorApplies(entity, recipe) || entity.proliferatorMode !== "extra") return 0;
  return getProliferator(entity.proliferatorTier!).extraProductBonus;
}

export function getProliferatorSprayCost(recipe: RecipeDefinition | undefined): number {
  return recipe ? Math.max(1, recipe.inputs.reduce((sum, input) => sum + input.amount, 0)) : 1;
}

function availableProliferatorPoints(entity: FactoryEntity): number {
  const definition = entity.proliferatorTier ? getProliferator(entity.proliferatorTier) : undefined;
  if (!definition) return 0;
  return Math.max(0, entity.proliferatorPoints ?? 0) +
    Math.floor((entity.inputs[definition.itemId] ?? 0) + EPSILON) * definition.sprayPoints;
}

function availableProliferatorCycles(entity: FactoryEntity, recipe: RecipeDefinition): number {
  if (!proliferatorApplies(entity, recipe)) return Number.POSITIVE_INFINITY;
  return availableProliferatorPoints(entity) / getProliferatorSprayCost(recipe);
}

function availableInputCycles(state: GameState, entity: FactoryEntity): number {
  const recipe = getRecipe(entity.recipeId);
  if (!recipe) return 0;
  if (recipe.id === "matrix_research") {
    return remainingResearchCosts(state).reduce((available, cost) =>
      available + Math.min(cost.amount, Math.floor((entity.inputs[cost.itemId] ?? 0) + EPSILON)), 0);
  }
  return recipe.inputs.reduce((available, input) =>
    Math.min(available, (entity.inputs[input.itemId] ?? 0) / input.amount), Number.POSITIVE_INFINITY);
}

function availableOutputCycles(entity: FactoryEntity): number {
  const recipe = getRecipe(entity.recipeId);
  if (!recipe || !entity.buildingId) return 0;
  const capacity = getBuilding(entity.buildingId).outputCapacity * Math.max(1, entity.machineCount);
  const extraProductBonus = getEntityExtraProductBonus(entity);
  return recipe.outputs.reduce((available, output) => {
    const free = Math.floor(Math.max(0, capacity - (entity.outputs[output.itemId] ?? 0)) + EPSILON);
    let low = 0;
    let high = Math.floor(free / output.amount);
    const bonusProgress = entity.proliferatorBonusProgress?.[output.itemId] ?? 0;
    while (low < high) {
      const candidate = Math.ceil((low + high) / 2);
      const bonus = Math.floor(bonusProgress + output.amount * candidate * extraProductBonus + EPSILON);
      if (output.amount * candidate + bonus <= free) low = candidate;
      else high = candidate - 1;
    }
    return Math.min(available, low);
  }, Number.POSITIVE_INFINITY);
}

function canMachineRun(state: GameState, entity: FactoryEntity): boolean {
  if (entity.recipeId === "matrix_research" && !state.research.selectedTechId) return false;
  const recipe = getRecipe(entity.recipeId);
  if (recipe?.requiredTechId && !isTechnologyCompleted(state, recipe.requiredTechId)) return false;
  if (proliferatorApplies(entity, recipe)) {
    const definition = getProliferator(entity.proliferatorTier!);
    if (!isTechnologyCompleted(state, definition.requiredTechId) ||
      Math.floor(availableProliferatorCycles(entity, recipe!) + EPSILON) < 1) return false;
  }
  return entity.kind === "machine" && Boolean(recipe) &&
    Math.floor(availableInputCycles(state, entity) + EPSILON) >= 1 &&
    Math.floor(availableOutputCycles(entity) + EPSILON) >= 1;
}

function extractorFor(entity: FactoryEntity) {
  const buildingId = entity.extractorBuildingId ?? getExtractorBuildingId(entity.resourceId!);
  return getBuilding(buildingId);
}

export function getPlanetMetrics(state: GameState, planetId: PlanetId): GameState["metrics"] {
  return state.planetMetrics[planetId] ?? emptyMetrics();
}

export function findInterstellarPeer(state: GameState, station: FactoryEntity): FactoryEntity | undefined {
  if (station.kind !== "station" || station.buildingId === "planetary_logistics_station" ||
    !station.storedItemId || !station.stationMode) return undefined;
  const peerMode = station.stationMode === "supply" ? "demand" : "supply";
  return state.entities.find((candidate) => {
    const compatible = station.buildingId === "orbital_collector"
      ? candidate.buildingId === "interstellar_logistics_station"
      : candidate.buildingId === "interstellar_logistics_station" ||
        (station.stationMode === "demand" && candidate.buildingId === "orbital_collector");
    return candidate.kind === "station" && compatible && candidate.planetId !== station.planetId &&
      candidate.stationMode === peerMode && candidate.storedItemId === station.storedItemId;
  });
}

export function findPlanetaryPeer(state: GameState, station: FactoryEntity): FactoryEntity | undefined {
  if (station.kind !== "station" || station.buildingId !== "planetary_logistics_station" ||
    !station.storedItemId || !station.stationMode) return undefined;
  const peerMode = station.stationMode === "supply" ? "demand" : "supply";
  return state.entities.find((candidate) => candidate.kind === "station" &&
    candidate.buildingId === "planetary_logistics_station" && candidate.id !== station.id &&
    candidate.planetId === station.planetId && candidate.stationMode === peerMode &&
    candidate.storedItemId === station.storedItemId);
}

export function getStationDroneCapacity(station: FactoryEntity): number {
  return station.buildingId === "planetary_logistics_station"
    ? STATION_DRONES_PER_BUILDING * Math.max(0, Math.floor(station.machineCount))
    : 0;
}

export function getStationVesselCapacity(station: FactoryEntity): number {
  return station.buildingId === "interstellar_logistics_station"
    ? STATION_VESSELS_PER_BUILDING * Math.max(0, Math.floor(station.machineCount))
    : 0;
}

export function getStationWarperCapacity(station: FactoryEntity): number {
  return station.buildingId === "interstellar_logistics_station"
    ? STATION_WARPER_CAPACITY_PER_BUILDING * Math.max(0, Math.floor(station.machineCount))
    : 0;
}

export function getStationMinimumLoad(station: FactoryEntity): StationMinimumLoad {
  return STATION_MINIMUM_LOAD_OPTIONS.includes(station.stationMinimumLoad as StationMinimumLoad)
    ? station.stationMinimumLoad as StationMinimumLoad
    : 1;
}

export function getStationMinimumCargo(station: FactoryEntity): number {
  const vehicleCapacity = station.buildingId === "planetary_logistics_station"
    ? PLANETARY_CARGO_PER_DRONE
    : INTERSTELLAR_CARGO_PER_VESSEL;
  return Math.ceil(vehicleCapacity * getStationMinimumLoad(station));
}

export function stationRouteRequiresWarp(station: FactoryEntity, peer: FactoryEntity | undefined): boolean {
  return Boolean(peer && getPlanet(station.planetId).systemId !== getPlanet(peer.planetId).systemId);
}

function planetaryDispatchableDrones(state: GameState, station: FactoryEntity): number {
  const peer = findPlanetaryPeer(state, station);
  if (!peer || !station.storedItemId) return 0;
  const supply = station.stationMode === "supply" ? station : peer;
  const demand = station.stationMode === "demand" ? station : peer;
  const itemId = station.storedItemId;
  const capacity = getBuilding("planetary_logistics_station").outputCapacity * Math.max(1, demand.machineCount);
  const available = Math.floor((supply.outputs[itemId] ?? 0) + EPSILON);
  const free = Math.floor(Math.max(0, capacity - (demand.outputs[itemId] ?? 0)) + EPSILON);
  const minimumCargo = getStationMinimumCargo(demand);
  const drones = Math.min(getStationDroneCapacity(demand), Math.max(0, Math.floor(demand.stationDrones ?? 0)));
  return Math.max(0, Math.min(drones, Math.floor(available / minimumCargo), Math.floor(free / minimumCargo)));
}

function stationDispatchableVessels(state: GameState, station: FactoryEntity): number {
  const peer = findInterstellarPeer(state, station);
  if (!peer || !station.storedItemId) return 0;
  const supply = station.stationMode === "supply" ? station : peer;
  const demand = station.stationMode === "demand" ? station : peer;
  const itemId = station.storedItemId;
  const capacity = getBuilding("interstellar_logistics_station").outputCapacity * Math.max(1, demand.machineCount);
  const available = Math.floor((supply.outputs[itemId] ?? 0) + EPSILON);
  const free = Math.floor(Math.max(0, capacity - (demand.outputs[itemId] ?? 0)) + EPSILON);
  const minimumCargo = getStationMinimumCargo(demand);
  const vessels = Math.min(
    getStationVesselCapacity(demand),
    Math.max(0, Math.floor(demand.stationVessels ?? 0)),
  );
  const warpLimit = stationRouteRequiresWarp(demand, supply)
    ? demand.stationWarpEnabled && isTechnologyCompleted(state, "space_warp")
      ? Math.max(0, Math.floor(demand.stationWarpers ?? 0))
      : 0
    : Number.POSITIVE_INFINITY;
  return Math.max(0, Math.min(vessels, warpLimit, Math.floor(available / minimumCargo), Math.floor(free / minimumCargo)));
}

function stationRouteReady(state: GameState, station: FactoryEntity): boolean {
  if (station.buildingId === "planetary_logistics_station") return planetaryDispatchableDrones(state, station) > 0;
  if (station.buildingId === "interstellar_logistics_station") return stationDispatchableVessels(state, station) > 0;
  return false;
}

interface PowerPlan {
  generationKw: number;
  demandKw: number;
  factor: number;
  windGenerationKw: number;
  solarGenerationKw: number;
  geothermalGenerationKw: number;
  thermalGenerationKw: number;
  fusionGenerationKw: number;
  artificialStarGenerationKw: number;
  rayGenerationKw: number;
  storageDischargeKw: number;
  storageChargeKw: number;
  powerOutputByEntity: Map<string, number>;
  powerInputByEntity: Map<string, number>;
}

interface DysonReceptionPlan {
  efficiency: number;
  receiverLoadKw: number;
  allocationByEntity: Map<string, number>;
  rayPowerByPlanet: Map<PlanetId, number>;
}

function decayDysonSwarm(state: GameState, seconds: number): void {
  const sails = Math.max(0, Math.floor(state.dysonSwarm.sailsInOrbit));
  if (sails < 1 || seconds <= EPSILON) {
    state.dysonSwarm.sailsInOrbit = sails;
    state.dysonSwarm.generationKw = sails * SOLAR_SAIL_POWER_KW;
    return;
  }
  const accumulatedDecay = Math.max(0, state.dysonSwarm.decayProgress) +
    sails * seconds / SOLAR_SAIL_LIFETIME_SECONDS;
  const expired = Math.min(sails, Math.floor(accumulatedDecay + EPSILON));
  state.dysonSwarm.sailsInOrbit = sails - expired;
  state.dysonSwarm.totalExpired = Math.floor(state.dysonSwarm.totalExpired + expired);
  state.dysonSwarm.decayProgress = round(Math.max(0, accumulatedDecay - expired), 6);
  state.dysonSwarm.generationKw = state.dysonSwarm.sailsInOrbit * SOLAR_SAIL_POWER_KW;
}

function updateDysonSphereGeneration(state: GameState): void {
  state.dysonSphere.generationKw =
    Math.floor(state.dysonSphere.structurePoints) * DYSON_STRUCTURE_POWER_KW +
    Math.floor(state.dysonSphere.shellSails) * DYSON_SHELL_SAIL_POWER_KW;
}

function absorbDysonSails(state: GameState, seconds: number): void {
  const structurePoints = Math.max(0, Math.floor(state.dysonSphere.structurePoints));
  const shellSails = Math.max(0, Math.floor(state.dysonSphere.shellSails));
  state.dysonSphere.structurePoints = structurePoints;
  state.dysonSphere.shellSails = shellSails;
  if (!isTechnologyCompleted(state, "dyson_shell") || structurePoints < 1 || seconds <= EPSILON) {
    updateDysonSphereGeneration(state);
    return;
  }

  const capacity = structurePoints * DYSON_SHELL_CAPACITY_PER_STRUCTURE;
  const free = Math.max(0, capacity - shellSails);
  const sailsInOrbit = Math.max(0, Math.floor(state.dysonSwarm.sailsInOrbit));
  if (free < 1 || sailsInOrbit < 1) {
    if (free < 1) state.dysonSphere.absorptionProgress = 0;
    updateDysonSphereGeneration(state);
    return;
  }

  const accumulated = Math.max(0, state.dysonSphere.absorptionProgress) +
    structurePoints * DYSON_SAIL_ABSORPTION_PER_STRUCTURE_PER_SECOND * seconds;
  const absorbed = Math.min(free, sailsInOrbit, Math.floor(accumulated + EPSILON));
  state.dysonSwarm.sailsInOrbit = sailsInOrbit - absorbed;
  state.dysonSphere.shellSails = shellSails + absorbed;
  state.dysonSphere.totalSailsAbsorbed = Math.floor(state.dysonSphere.totalSailsAbsorbed + absorbed);
  state.dysonSphere.absorptionProgress = round(Math.min(0.999999, Math.max(0, accumulated - absorbed)), 6);
  updateDysonSphereGeneration(state);
}

function totalDysonGenerationKw(state: GameState): number {
  return Math.max(0, state.dysonSwarm.generationKw) + Math.max(0, state.dysonSphere.generationKw);
}

function calculateDysonReception(state: GameState): DysonReceptionPlan {
  const receivers = state.entities.filter((entity) =>
    entity.kind === "machine" && entity.buildingId === "ray_receiver" && entity.machineCount > 0 &&
    (entity.recipeId === "ray_power" || entity.recipeId === "critical_photon") && canMachineRun(state, entity));
  const receiverCapacityKw = receivers.reduce((sum, entity) =>
    sum + RAY_RECEIVER_CAPACITY_KW * entity.machineCount, 0);
  const generationKw = totalDysonGenerationKw(state);
  const efficiency = receiverCapacityKw <= EPSILON ? 0 : Math.min(1, generationKw / receiverCapacityKw);
  const allocationByEntity = new Map<string, number>();
  const rayPowerByPlanet = new Map<PlanetId, number>();

  for (const receiver of receivers) {
    const allocationKw = RAY_RECEIVER_CAPACITY_KW * receiver.machineCount * efficiency;
    allocationByEntity.set(receiver.id, allocationKw);
    if (receiver.recipeId === "ray_power") {
      rayPowerByPlanet.set(receiver.planetId, (rayPowerByPlanet.get(receiver.planetId) ?? 0) + allocationKw);
    }
  }

  state.dysonSwarm.receiverLoadKw = Math.min(generationKw, receiverCapacityKw);
  return {
    efficiency,
    receiverLoadKw: state.dysonSwarm.receiverLoadKw,
    allocationByEntity,
    rayPowerByPlanet,
  };
}

const FUEL_GENERATOR_IDS: BuildingId[] = ["thermal_power_plant", "mini_fusion_power_plant", "artificial_star"];

function isFuelGenerator(entity: FactoryEntity): boolean {
  return Boolean(entity.buildingId && FUEL_GENERATOR_IDS.includes(entity.buildingId));
}

function fuelEnergyAvailable(entity: FactoryEntity): number {
  if (!entity.fuelItemId || !entity.buildingId ||
    !getFuelItemIdsForBuilding(entity.buildingId).includes(entity.fuelItemId)) return 0;
  const energyPerItem = FUEL_ENERGY_MJ[entity.fuelItemId] ?? 0;
  return Math.max(0, entity.fuelRemainingMj ?? 0) +
    Math.floor((entity.inputs[entity.fuelItemId] ?? 0) + EPSILON) * energyPerItem;
}

function fuelGeneratorCapacityForStep(entity: FactoryEntity, seconds: number): number {
  if (!isFuelGenerator(entity) || !entity.buildingId || seconds <= EPSILON) return 0;
  const rated = (getBuilding(entity.buildingId).powerGenerationKw ?? 0) * entity.machineCount;
  const fuelLimited = fuelEnergyAvailable(entity) * getFuelEfficiency(entity.buildingId) * 1000 / seconds;
  return Math.min(rated, fuelLimited);
}

function energyCapacity(entity: FactoryEntity): number {
  return (entity.buildingId ? getBuilding(entity.buildingId).energyCapacityMj ?? 0 : 0) * entity.machineCount;
}

function storedEnergy(entity: FactoryEntity): number {
  return Math.min(energyCapacity(entity), Math.max(0, entity.storedEnergyMj ?? 0));
}

function itemOutputFree(entity: FactoryEntity, itemId: ItemId): number {
  if (!entity.buildingId) return 0;
  const capacity = getBuilding(entity.buildingId).outputCapacity * Math.max(1, entity.machineCount);
  return Math.floor(Math.max(0, capacity - (entity.outputs[itemId] ?? 0)) + EPSILON);
}

function accumulatorDischargeCapacityForStep(entity: FactoryEntity, seconds: number): number {
  if (entity.buildingId !== "accumulator" || seconds <= EPSILON) return 0;
  const rated = (getBuilding("accumulator").powerGenerationKw ?? 0) * entity.machineCount;
  return Math.min(rated, storedEnergy(entity) * 1000 / seconds);
}

function accumulatorChargeCapacityForStep(entity: FactoryEntity, seconds: number): number {
  if (entity.buildingId !== "accumulator" || seconds <= EPSILON) return 0;
  const rated = (getBuilding("accumulator").powerChargeKw ?? 0) * entity.machineCount;
  return Math.min(rated, Math.max(0, energyCapacity(entity) - storedEnergy(entity)) * 1000 / seconds);
}

function exchangerDischargeCapacityForStep(entity: FactoryEntity, seconds: number): number {
  if (entity.buildingId !== "energy_exchanger" || entity.energyMode !== "discharge" || seconds <= EPSILON) return 0;
  const activeEnergy = storedEnergy(entity);
  const activeCells = activeEnergy > EPSILON ? 1 : 0;
  const queuedCells = Math.floor((entity.inputs.charged_accumulator ?? 0) + EPSILON);
  const usableCells = Math.min(activeCells + queuedCells, itemOutputFree(entity, "accumulator"));
  const availableEnergyMj = usableCells > 0
    ? activeEnergy + Math.max(0, usableCells - activeCells) * ACCUMULATOR_ENERGY_MJ
    : 0;
  const rated = (getBuilding("energy_exchanger").powerGenerationKw ?? 0) * entity.machineCount;
  return Math.min(rated, availableEnergyMj * 1000 / seconds);
}

function exchangerChargeCapacityForStep(entity: FactoryEntity, seconds: number): number {
  if (entity.buildingId !== "energy_exchanger" || entity.energyMode !== "charge" || seconds <= EPSILON) return 0;
  const activeEnergy = storedEnergy(entity);
  const activeCells = activeEnergy > EPSILON ? 1 : 0;
  const queuedCells = Math.floor((entity.inputs.accumulator ?? 0) + EPSILON);
  const usableCells = Math.min(activeCells + queuedCells, itemOutputFree(entity, "charged_accumulator"));
  const availableCapacityMj = usableCells > 0
    ? usableCells * ACCUMULATOR_ENERGY_MJ - activeEnergy
    : 0;
  const rated = (getBuilding("energy_exchanger").powerChargeKw ?? 0) * entity.machineCount;
  return Math.min(rated, Math.max(0, availableCapacityMj) * 1000 / seconds);
}

interface PowerCandidate {
  entity: FactoryEntity;
  capacity: number;
}

function allocatePower(candidates: PowerCandidate[], requestedKw: number, outputs: Map<string, number>): number {
  const capacity = candidates.reduce((sum, candidate) => sum + candidate.capacity, 0);
  const allocated = Math.min(Math.max(0, requestedKw), capacity);
  for (const candidate of candidates) {
    outputs.set(candidate.entity.id, capacity > EPSILON ? allocated * candidate.capacity / capacity : 0);
  }
  return allocated;
}

function calculatePower(state: GameState, seconds: number, planetId: PlanetId, reception: DysonReceptionPlan): PowerPlan {
  let windGenerationKw = 0;
  let solarGenerationKw = 0;
  let geothermalGenerationKw = 0;
  let demandKw = 0;
  const rayGenerationKw = reception.rayPowerByPlanet.get(planetId) ?? 0;
  const fuelCandidates: PowerCandidate[] = [];
  const accumulatorCandidates: PowerCandidate[] = [];
  const exchangerDischargeCandidates: PowerCandidate[] = [];
  const accumulatorChargeCandidates: PowerCandidate[] = [];
  const exchangerChargeCandidates: PowerCandidate[] = [];
  const powerOutputByEntity = new Map<string, number>();
  const powerInputByEntity = new Map<string, number>();

  for (const entity of state.entities) {
    if (entity.planetId !== planetId) continue;
    if (entity.kind === "power" && entity.buildingId) {
      if (isFuelGenerator(entity)) {
        const capacity = fuelGeneratorCapacityForStep(entity, seconds);
        if (capacity > EPSILON) fuelCandidates.push({ entity, capacity });
      } else if (entity.buildingId === "accumulator") {
        const discharge = accumulatorDischargeCapacityForStep(entity, seconds);
        const charge = accumulatorChargeCapacityForStep(entity, seconds);
        if (discharge > EPSILON) accumulatorCandidates.push({ entity, capacity: discharge });
        if (charge > EPSILON) accumulatorChargeCandidates.push({ entity, capacity: charge });
      } else if (entity.buildingId === "energy_exchanger") {
        const discharge = exchangerDischargeCapacityForStep(entity, seconds);
        const charge = exchangerChargeCapacityForStep(entity, seconds);
        if (discharge > EPSILON) exchangerDischargeCandidates.push({ entity, capacity: discharge });
        if (charge > EPSILON) exchangerChargeCandidates.push({ entity, capacity: charge });
      } else {
        const rated = (getBuilding(entity.buildingId).powerGenerationKw ?? 0) * entity.machineCount;
        const output = entity.buildingId === "solar_panel" && entity.planetId === "ashen" ? rated * 1.5 : rated;
        powerOutputByEntity.set(entity.id, output);
        if (entity.buildingId === "solar_panel") solarGenerationKw += output;
        else if (entity.buildingId === "geothermal_power_station") geothermalGenerationKw += output;
        else windGenerationKw += output;
      }
    } else if (entity.kind === "vein" && entity.minerCount > 0) {
      const extractor = extractorFor(entity);
      const capacity = extractor.outputCapacity * entity.minerCount;
      if ((entity.outputs[entity.resourceId!] ?? 0) < capacity - EPSILON) {
        demandKw += (extractor.powerDemandKw ?? 0) * entity.minerCount;
      }
    } else if (entity.buildingId === "ray_receiver") {
      continue;
    } else if (canMachineRun(state, entity) && entity.buildingId) {
      demandKw += (getBuilding(entity.buildingId).powerDemandKw ?? 0) * entity.machineCount *
        getEntityProliferatorPowerMultiplier(entity);
    } else if (entity.kind === "station" && entity.buildingId && stationRouteReady(state, entity)) {
      demandKw += (getBuilding(entity.buildingId).powerDemandKw ?? 0) * entity.machineCount;
    }
  }

  const baseGenerationKw = windGenerationKw + solarGenerationKw + geothermalGenerationKw + rayGenerationKw;
  const exchangerCapacityKw = exchangerDischargeCandidates.reduce((sum, candidate) => sum + candidate.capacity, 0);
  const fuelCapacityKw = fuelCandidates.reduce((sum, candidate) => sum + candidate.capacity, 0);
  const accumulatorCapacityKw = accumulatorCandidates.reduce((sum, candidate) => sum + candidate.capacity, 0);
  const generationKw = baseGenerationKw + exchangerCapacityKw + fuelCapacityKw + accumulatorCapacityKw;
  let missingKw = Math.max(0, Math.min(demandKw, generationKw) - baseGenerationKw);
  const exchangerGenerationKw = allocatePower(exchangerDischargeCandidates, missingKw, powerOutputByEntity);
  missingKw -= exchangerGenerationKw;
  const fuelGenerationKw = allocatePower(fuelCandidates, missingKw, powerOutputByEntity);
  missingKw -= fuelGenerationKw;
  const accumulatorGenerationKw = allocatePower(accumulatorCandidates, missingKw, powerOutputByEntity);

  let surplusKw = Math.max(0, baseGenerationKw - demandKw);
  const exchangerChargeKw = allocatePower(exchangerChargeCandidates, surplusKw, powerInputByEntity);
  surplusKw -= exchangerChargeKw;
  const accumulatorChargeKw = allocatePower(accumulatorChargeCandidates, surplusKw, powerInputByEntity);
  const fuelOutput = (buildingId: BuildingId) => fuelCandidates.reduce((sum, candidate) =>
    candidate.entity.buildingId === buildingId ? sum + (powerOutputByEntity.get(candidate.entity.id) ?? 0) : sum, 0);

  return {
    generationKw,
    demandKw,
    factor: demandKw <= EPSILON ? 1 : Math.min(1, generationKw / demandKw),
    windGenerationKw,
    solarGenerationKw,
    geothermalGenerationKw,
    thermalGenerationKw: fuelOutput("thermal_power_plant"),
    fusionGenerationKw: fuelOutput("mini_fusion_power_plant"),
    artificialStarGenerationKw: fuelOutput("artificial_star"),
    rayGenerationKw,
    storageDischargeKw: exchangerGenerationKw + accumulatorGenerationKw,
    storageChargeKw: exchangerChargeKw + accumulatorChargeKw,
    powerOutputByEntity,
    powerInputByEntity,
  };
}

function burnFuel(entity: FactoryEntity, outputKw: number, seconds: number): void {
  if (!entity.buildingId || !entity.fuelItemId || outputKw <= EPSILON) return;
  const energyPerItem = FUEL_ENERGY_MJ[entity.fuelItemId] ?? 0;
  let requiredHeatMj = outputKw * seconds / (1000 * getFuelEfficiency(entity.buildingId));
  let remainingHeatMj = Math.max(0, entity.fuelRemainingMj ?? 0);
  while (requiredHeatMj > EPSILON) {
    if (remainingHeatMj <= EPSILON) {
      const queuedFuel = Math.floor((entity.inputs[entity.fuelItemId] ?? 0) + EPSILON);
      if (queuedFuel < 1 || energyPerItem <= EPSILON) break;
      entity.inputs[entity.fuelItemId] = queuedFuel - 1;
      remainingHeatMj += energyPerItem;
    }
    const burned = Math.min(requiredHeatMj, remainingHeatMj);
    requiredHeatMj -= burned;
    remainingHeatMj -= burned;
  }
  entity.fuelRemainingMj = round(Math.max(0, remainingHeatMj), 6);
}

function chargeExchanger(state: GameState, entity: FactoryEntity, energyMj: number): number {
  let remaining = Math.max(0, energyMj);
  let stored = storedEnergy(entity);
  let completed = 0;
  while (remaining > EPSILON) {
    if (stored <= EPSILON) {
      const queued = Math.floor((entity.inputs.accumulator ?? 0) + EPSILON);
      if (queued < 1 || itemOutputFree(entity, "charged_accumulator") < 1) break;
      entity.inputs.accumulator = queued - 1;
    }
    const charged = Math.min(remaining, ACCUMULATOR_ENERGY_MJ - stored);
    stored += charged;
    remaining -= charged;
    if (stored + EPSILON >= ACCUMULATOR_ENERGY_MJ) {
      entity.outputs.charged_accumulator = Math.floor((entity.outputs.charged_accumulator ?? 0) + 1);
      state.totalProduced.charged_accumulator = Math.floor((state.totalProduced.charged_accumulator ?? 0) + 1);
      stored = 0;
      completed += 1;
    }
  }
  entity.storedEnergyMj = round(stored, 6);
  entity.progress = stored / ACCUMULATOR_ENERGY_MJ;
  return completed;
}

function dischargeExchanger(state: GameState, entity: FactoryEntity, energyMj: number): number {
  let remaining = Math.max(0, energyMj);
  let stored = storedEnergy(entity);
  let completed = 0;
  while (remaining > EPSILON) {
    if (stored <= EPSILON) {
      const queued = Math.floor((entity.inputs.charged_accumulator ?? 0) + EPSILON);
      if (queued < 1 || itemOutputFree(entity, "accumulator") < 1) break;
      entity.inputs.charged_accumulator = queued - 1;
      stored = ACCUMULATOR_ENERGY_MJ;
    }
    const discharged = Math.min(remaining, stored);
    stored -= discharged;
    remaining -= discharged;
    if (stored <= EPSILON) {
      entity.outputs.accumulator = Math.floor((entity.outputs.accumulator ?? 0) + 1);
      state.totalProduced.accumulator = Math.floor((state.totalProduced.accumulator ?? 0) + 1);
      stored = 0;
      completed += 1;
    }
  }
  entity.storedEnergyMj = round(stored, 6);
  entity.progress = stored > EPSILON ? 1 - stored / ACCUMULATOR_ENERGY_MJ : 0;
  return completed;
}

function runPowerFacilities(state: GameState, seconds: number, power: PowerPlan, planetId: PlanetId): void {
  for (const entity of state.entities) {
    if (entity.planetId !== planetId || entity.kind !== "power" || !entity.buildingId) continue;
    const outputKw = power.powerOutputByEntity.get(entity.id) ?? 0;
    const inputKw = power.powerInputByEntity.get(entity.id) ?? 0;
    const building = getBuilding(entity.buildingId);
    const ratedKw = (building.powerGenerationKw ?? 0) * entity.machineCount;
    entity.powerOutputKw = round(outputKw, 2);
    entity.powerInputKw = round(inputKw, 2);
    entity.utilization = ratedKw > EPSILON ? round(Math.max(outputKw, inputKw) / ratedKw, 4) : 0;
    entity.productionRate = 0;

    if (isFuelGenerator(entity)) {
      burnFuel(entity, outputKw, seconds);
    } else if (entity.buildingId === "accumulator") {
      const capacity = energyCapacity(entity);
      entity.storedEnergyMj = round(Math.min(capacity, Math.max(0,
        storedEnergy(entity) + inputKw * seconds / 1000 - outputKw * seconds / 1000)), 6);
      entity.progress = capacity > EPSILON ? entity.storedEnergyMj / capacity : 0;
    } else if (entity.buildingId === "energy_exchanger") {
      const completed = entity.energyMode === "discharge"
        ? dischargeExchanger(state, entity, outputKw * seconds / 1000)
        : chargeExchanger(state, entity, inputKw * seconds / 1000);
      entity.productionRate = seconds > EPSILON ? round(completed * 60 / seconds, 2) : 0;
    }
  }
}

function fuelReserveSeconds(state: GameState, planetId: PlanetId): number {
  let electricEnergyMj = 0;
  let ratedGeneratorKw = 0;
  for (const entity of state.entities) {
    if (entity.planetId !== planetId || !isFuelGenerator(entity) || !entity.buildingId) continue;
    electricEnergyMj += fuelEnergyAvailable(entity) * getFuelEfficiency(entity.buildingId);
    ratedGeneratorKw += (getBuilding(entity.buildingId).powerGenerationKw ?? 0) * entity.machineCount;
  }
  return ratedGeneratorKw > EPSILON ? round(electricEnergyMj * 1000 / ratedGeneratorKw, 1) : 0;
}

function gridStoredEnergy(state: GameState, planetId: PlanetId): { stored: number; capacity: number } {
  return state.entities.reduce((total, entity) => {
    if (entity.planetId !== planetId || (entity.buildingId !== "accumulator" && entity.buildingId !== "energy_exchanger")) return total;
    total.stored += storedEnergy(entity);
    total.capacity += energyCapacity(entity);
    return total;
  }, { stored: 0, capacity: 0 });
}

function transferLogisticsBuffers(state: GameState): void {
  for (const entity of state.entities) {
    if ((entity.kind !== "storage" && entity.kind !== "splitter" && entity.kind !== "station") || !entity.buildingId || !entity.storedItemId) continue;
    const capacity = getBuilding(entity.buildingId).outputCapacity * Math.max(1, entity.machineCount);
    const incoming = Math.floor((entity.inputs[entity.storedItemId] ?? 0) + EPSILON);
    const stored = Math.floor((entity.outputs[entity.storedItemId] ?? 0) + EPSILON);
    const moved = Math.min(incoming, Math.max(0, capacity - stored));
    entity.inputs[entity.storedItemId] = incoming - moved;
    entity.outputs[entity.storedItemId] = stored + moved;
  }
}

interface BeltTransferCandidate {
  belt: BeltConnection;
  target: FactoryEntity;
  allowance: number;
  moved: number;
  capacity: number;
}

function targetFreeCapacity(target: FactoryEntity, itemId: ItemId): number {
  if (!target.buildingId) return 0;
  const capacity = getBuilding(target.buildingId).inputCapacity * Math.max(1, target.machineCount);
  return Math.floor(Math.max(0, capacity - (target.inputs[itemId] ?? 0)) + EPSILON);
}

function transferBelts(state: GameState, seconds: number): void {
  const groups = new Map<string, { source: FactoryEntity; itemId: ItemId; candidates: BeltTransferCandidate[] }>();

  for (const belt of state.belts) {
    belt.lastFlow = round(belt.lastFlow * 0.8, 3);
    const source = state.entities.find((entity) => entity.id === belt.source);
    const target = state.entities.find((entity) => entity.id === belt.target);
    if (!source || !target || source.planetId !== target.planetId || belt.planetId !== source.planetId ||
      !sourceProduces(source, belt.itemId) || !targetConsumes(state, target, belt.itemId)) {
      belt.progress = 0;
      continue;
    }
    const available = Math.floor((source.outputs[belt.itemId] ?? 0) + EPSILON);
    if (available < 1 || targetFreeCapacity(target, belt.itemId) < 1) {
      belt.progress = 0;
      continue;
    }
    const capacity = getBeltCapacity(belt);
    belt.progress = round((belt.progress ?? 0) + capacity * seconds);
    const key = `${belt.source}:${belt.itemId}`;
    const group = groups.get(key) ?? { source, itemId: belt.itemId, candidates: [] };
    group.candidates.push({ belt, target, allowance: Math.floor(belt.progress + EPSILON), moved: 0, capacity });
    groups.set(key, group);
  }

  const moveOne = (group: { source: FactoryEntity; itemId: ItemId }, candidate: BeltTransferCandidate) => {
    if (candidate.allowance < 1 || targetFreeCapacity(candidate.target, group.itemId) < 1) return false;
    candidate.allowance -= 1;
    candidate.moved += 1;
    candidate.target.inputs[group.itemId] = Math.floor((candidate.target.inputs[group.itemId] ?? 0) + 1);
    return true;
  };

  for (const group of groups.values()) {
    let available = Math.floor((group.source.outputs[group.itemId] ?? 0) + EPSILON);
    const usable = (candidate: BeltTransferCandidate) => candidate.allowance > 0 && targetFreeCapacity(candidate.target, group.itemId) > 0;

    if (group.source.kind === "splitter") {
      const distribute = (candidates: BeltTransferCandidate[]) => {
        if (candidates.length === 0) return;
        let cursor = group.source.routingCursor % candidates.length;
        let stalled = 0;
        while (available > 0 && stalled < candidates.length) {
          const candidate = candidates[cursor];
          cursor = (cursor + 1) % candidates.length;
          if (moveOne(group, candidate)) {
            available -= 1;
            stalled = 0;
          } else {
            stalled += 1;
          }
        }
        group.source.routingCursor = cursor;
      };
      if (group.source.distributionMode === "priority") {
        const priority = group.candidates.filter((candidate) => candidate.belt.priority === 1 && usable(candidate));
        if (priority.length > 0) distribute(priority);
        distribute(group.candidates.filter((candidate) => candidate.belt.priority === 0 && usable(candidate)));
      } else {
        distribute(group.candidates.filter(usable));
      }
    } else {
      for (const candidate of [...group.candidates].sort((a, b) => b.belt.priority - a.belt.priority)) {
        const moved = Math.min(available, candidate.allowance, targetFreeCapacity(candidate.target, group.itemId));
        if (moved <= 0) continue;
        candidate.allowance -= moved;
        candidate.moved += moved;
        candidate.target.inputs[group.itemId] = Math.floor((candidate.target.inputs[group.itemId] ?? 0) + moved);
        available -= moved;
        if (available <= 0) break;
      }
    }

    group.source.outputs[group.itemId] = available;
    for (const candidate of group.candidates) {
      candidate.belt.progress = available <= 0 || targetFreeCapacity(candidate.target, group.itemId) <= 0
        ? 0
        : round(Math.max(0, candidate.belt.progress - candidate.moved));
      if (candidate.moved > 0 && seconds > 0) {
        candidate.belt.lastFlow = round(Math.min(candidate.capacity, candidate.moved / seconds), 3);
      }
    }
  }
}

function runMiners(state: GameState, seconds: number, powerFactor: number, planetId: PlanetId): void {
  const researchedMiningSpeed = getMiningSpeedMultiplier(state);
  for (const entity of state.entities) {
    if (entity.planetId !== planetId || entity.kind !== "vein" || entity.minerCount <= 0 || !entity.resourceId) continue;
    const miner = extractorFor(entity);
    const miningSpeed = ITEMS[entity.resourceId].kind === "solid" ? researchedMiningSpeed : 1;
    const capacity = miner.outputCapacity * entity.minerCount;
    const current = Math.floor((entity.outputs[entity.resourceId] ?? 0) + EPSILON);
    const free = Math.max(0, capacity - current);
    if (free < 1 || powerFactor <= EPSILON) {
      entity.progress = 0;
      entity.utilization = 0;
      entity.productionRate = 0;
      continue;
    }
    entity.progress = round((entity.progress ?? 0) + miner.speed * miningSpeed * entity.minerCount * seconds * powerFactor);
    const produced = Math.min(free, Math.floor(entity.progress + EPSILON));
    entity.outputs[entity.resourceId] = current + produced;
    entity.progress = produced >= free ? 0 : round(entity.progress - produced);
    entity.utilization = powerFactor;
    entity.productionRate = round(miner.speed * miningSpeed * entity.minerCount * powerFactor * 60, 2);
    state.totalProduced[entity.resourceId] = Math.floor((state.totalProduced[entity.resourceId] ?? 0) + produced);
  }
}

function consumeProliferatorPoints(entity: FactoryEntity, recipe: RecipeDefinition, cycles: number): void {
  if (!proliferatorApplies(entity, recipe) || cycles < 1) return;
  const definition = getProliferator(entity.proliferatorTier!);
  const requiredPoints = getProliferatorSprayCost(recipe) * cycles;
  let points = Math.max(0, entity.proliferatorPoints ?? 0);
  if (points < requiredPoints) {
    const requiredItems = Math.ceil((requiredPoints - points) / definition.sprayPoints);
    const availableItems = Math.floor((entity.inputs[definition.itemId] ?? 0) + EPSILON);
    const consumedItems = Math.min(requiredItems, availableItems);
    entity.inputs[definition.itemId] = availableItems - consumedItems;
    points += consumedItems * definition.sprayPoints;
  }
  entity.proliferatorPoints = Math.max(0, points - requiredPoints);
}

function runMachines(state: GameState, seconds: number, powerFactor: number, planetId: PlanetId): void {
  for (const entity of state.entities) {
    const recipe = getRecipe(entity.recipeId);
    if (entity.planetId !== planetId || entity.kind !== "machine" || entity.buildingId === "ray_receiver" || !entity.buildingId || !recipe) continue;
    if (recipe.id === "matrix_research" && !state.research.selectedTechId) {
      entity.progress = 0;
      entity.utilization = 0;
      entity.productionRate = 0;
      continue;
    }
    const building = getBuilding(entity.buildingId);
    const cyclesPerSecond = building.speed * entity.machineCount * getRecipeSpeedMultiplier(state, recipe.id) *
      getEntityProliferatorSpeedMultiplier(entity) / recipe.duration;
    const potentialCycles = cyclesPerSecond * seconds * powerFactor;
    if (recipe.requiredTechId && !isTechnologyCompleted(state, recipe.requiredTechId)) {
      entity.progress = 0;
      entity.utilization = 0;
      entity.productionRate = 0;
      continue;
    }
    const fullInputCycles = Math.floor(availableInputCycles(state, entity) + EPSILON);
    const fullOutputCycles = Math.floor(availableOutputCycles(entity) + EPSILON);
    let maximumCycles = Math.min(fullInputCycles, fullOutputCycles, Math.floor(availableProliferatorCycles(entity, recipe) + EPSILON));
    if (maximumCycles < 1 || potentialCycles <= EPSILON) {
      entity.utilization = 0;
      entity.productionRate = 0;
      continue;
    }

    const work = Math.min(potentialCycles, Math.max(0, maximumCycles - (entity.progress ?? 0)));
    entity.progress = round((entity.progress ?? 0) + work, 6);
    const cycles = Math.min(maximumCycles, Math.floor(entity.progress + EPSILON));

    if (recipe.id === "matrix_research") {
      const techId = state.research.selectedTechId;
      const technology = getTechnology(techId);
      if (techId && technology && cycles > 0) {
        const progress = { ...(state.research.progressByTech[techId] ?? {}) };
        let remainingCycles = cycles;
        for (const cost of technology.costs) {
          if (remainingCycles < 1) break;
          const remainingCost = Math.max(0, cost.amount - (progress[cost.itemId] ?? 0));
          const consumed = Math.min(
            remainingCycles,
            remainingCost,
            Math.floor((entity.inputs[cost.itemId] ?? 0) + EPSILON),
          );
          if (consumed < 1) continue;
          entity.inputs[cost.itemId] = Math.floor((entity.inputs[cost.itemId] ?? 0) - consumed);
          progress[cost.itemId] = Math.floor((progress[cost.itemId] ?? 0) + consumed);
          remainingCycles -= consumed;
        }
        state.research.progressByTech[techId] = progress;
        const completed = technology.costs.every((cost) => (progress[cost.itemId] ?? 0) >= cost.amount);
        if (completed) {
          state.research.completedTechIds.push(techId);
          const [nextTechId, ...remainingQueue] = state.research.queuedTechIds;
          state.research.selectedTechId = nextTechId ?? null;
          state.research.queuedTechIds = remainingQueue;
          for (const researchEntity of state.entities) {
            if (researchEntity.recipeId === "matrix_research") researchEntity.progress = 0;
          }
        }
      }
    } else {
      for (const input of recipe.inputs) {
        entity.inputs[input.itemId] = Math.max(0, Math.floor((entity.inputs[input.itemId] ?? 0) - input.amount * cycles));
      }
      consumeProliferatorPoints(entity, recipe, cycles);
      if (recipe.id === "solar_sail_launch" && cycles > 0) {
        state.dysonSwarm.sailsInOrbit = Math.floor(state.dysonSwarm.sailsInOrbit + cycles);
        state.dysonSwarm.totalLaunched = Math.floor(state.dysonSwarm.totalLaunched + cycles);
      }
      if (recipe.id === "carrier_rocket_launch" && cycles > 0) {
        state.dysonSphere.structurePoints = Math.floor(state.dysonSphere.structurePoints + cycles);
        state.dysonSphere.totalRocketsLaunched = Math.floor(state.dysonSphere.totalRocketsLaunched + cycles);
      }
      const extraProductBonus = getEntityExtraProductBonus(entity);
      for (const output of recipe.outputs) {
        const baseProduced = output.amount * cycles;
        const accumulatedBonus = (entity.proliferatorBonusProgress?.[output.itemId] ?? 0) +
          baseProduced * extraProductBonus;
        const bonusProduced = Math.floor(accumulatedBonus + EPSILON);
        entity.proliferatorBonusProgress ??= {};
        entity.proliferatorBonusProgress[output.itemId] = round(Math.max(0, accumulatedBonus - bonusProduced), 6);
        const produced = baseProduced + bonusProduced;
        entity.outputs[output.itemId] = Math.floor((entity.outputs[output.itemId] ?? 0) + produced);
        state.totalProduced[output.itemId] = Math.floor((state.totalProduced[output.itemId] ?? 0) + produced);
      }
    }

    entity.progress = Math.max(0, round(entity.progress - cycles, 6));
    const activityFactor = potentialCycles > EPSILON ? Math.min(1, work / potentialCycles) : 0;
    entity.utilization = round(powerFactor * activityFactor, 4);
    const unitsPerCycle = recipe.id === "matrix_research" || recipe.id === "solar_sail_launch" || recipe.id === "carrier_rocket_launch"
      ? 1
      : recipe.outputs.reduce((sum, output) => sum + output.amount, 0) * (1 + getEntityExtraProductBonus(entity));
    entity.productionRate = round(cyclesPerSecond * unitsPerCycle * 60 * entity.utilization, 2);
  }
}

function runRayReceivers(
  state: GameState,
  seconds: number,
  reception: DysonReceptionPlan,
  planetId: PlanetId,
): void {
  for (const entity of state.entities) {
    if (entity.planetId !== planetId || entity.kind !== "machine" || entity.buildingId !== "ray_receiver") continue;
    const recipe = getRecipe(entity.recipeId);
    const allocationKw = reception.allocationByEntity.get(entity.id) ?? 0;
    entity.powerOutputKw = round(allocationKw, 2);
    entity.productionRate = 0;
    entity.utilization = 0;
    if (!recipe || (recipe.requiredTechId && !isTechnologyCompleted(state, recipe.requiredTechId))) {
      entity.progress = 0;
      continue;
    }
    if (recipe.id === "ray_power") {
      entity.progress = 0;
      entity.utilization = reception.efficiency;
      continue;
    }
    if (recipe.id !== "critical_photon" || allocationKw <= EPSILON) continue;

    const building = getBuilding("ray_receiver");
    const cyclesPerSecond = building.speed * entity.machineCount / recipe.duration;
    const potentialCycles = cyclesPerSecond * seconds * reception.efficiency;
    const maximumCycles = Math.floor(availableOutputCycles(entity) + EPSILON);
    if (maximumCycles < 1 || potentialCycles <= EPSILON) continue;
    const work = Math.min(potentialCycles, Math.max(0, maximumCycles - entity.progress));
    entity.progress = round(entity.progress + work, 6);
    const cycles = Math.min(maximumCycles, Math.floor(entity.progress + EPSILON));
    if (cycles > 0) {
      entity.outputs.critical_photon = Math.floor((entity.outputs.critical_photon ?? 0) + cycles);
      state.totalProduced.critical_photon = Math.floor((state.totalProduced.critical_photon ?? 0) + cycles);
      entity.progress = Math.max(0, round(entity.progress - cycles, 6));
    }
    const activityFactor = potentialCycles > EPSILON ? Math.min(1, work / potentialCycles) : 0;
    entity.utilization = round(reception.efficiency * activityFactor, 4);
    entity.productionRate = round(cyclesPerSecond * 60 * entity.utilization, 2);
  }
}

function resetStationRuntime(state: GameState): void {
  for (const station of state.entities.filter((entity) => entity.kind === "station")) {
    station.utilization = 0;
    station.productionRate = 0;
    station.stationPeerId = undefined;
  }
}

function runOrbitalCollectors(state: GameState, seconds: number): void {
  for (const collector of state.entities.filter((entity) => entity.buildingId === "orbital_collector")) {
    const itemId = collector.storedItemId === "deuterium" || collector.storedItemId === "fire_ice"
      ? collector.storedItemId
      : "hydrogen";
    collector.storedItemId = itemId;
    collector.stationMode = "supply";
    const capacity = getBuilding("orbital_collector").outputCapacity * Math.max(1, collector.machineCount);
    const current = Math.floor((collector.outputs[itemId] ?? 0) + EPSILON);
    const free = Math.max(0, capacity - current);
    if (free < 1) {
      collector.progress = 0;
      continue;
    }
    const rate = (itemId === "deuterium" ? 0.2 : itemId === "fire_ice" ? 0.5 : 1) * collector.machineCount;
    collector.progress = round((collector.progress ?? 0) + rate * seconds, 6);
    const produced = Math.min(free, Math.floor(collector.progress + EPSILON));
    collector.outputs[itemId] = current + produced;
    collector.progress = produced >= free ? 0 : round(collector.progress - produced, 6);
    collector.utilization = 1;
    collector.productionRate = round(rate * 60, 2);
    state.totalProduced[itemId] = Math.floor((state.totalProduced[itemId] ?? 0) + produced);
  }
}

function runPlanetaryStations(state: GameState, seconds: number, powerByPlanet: Map<PlanetId, PowerPlan>): void {
  const demands = state.entities.filter((entity) => entity.buildingId === "planetary_logistics_station" && entity.stationMode === "demand");
  for (const demand of demands) {
    const supply = findPlanetaryPeer(state, demand);
    const itemId = demand.storedItemId;
    if (!supply || !itemId) {
      demand.stationProgress = 0;
      continue;
    }
    demand.stationPeerId = supply.id;
    supply.stationPeerId = demand.id;
    const capacity = getBuilding("planetary_logistics_station").outputCapacity * Math.max(1, demand.machineCount);
    const available = Math.floor((supply.outputs[itemId] ?? 0) + EPSILON);
    const free = Math.floor(Math.max(0, capacity - (demand.outputs[itemId] ?? 0)) + EPSILON);
    const dispatchableDrones = planetaryDispatchableDrones(state, demand);
    if (dispatchableDrones < 1) {
      demand.stationProgress = 0;
      supply.stationProgress = 0;
      continue;
    }
    const powerFactor = powerByPlanet.get(demand.planetId)?.factor ?? 0;
    if (powerFactor <= EPSILON) continue;
    demand.stationProgress = round((demand.stationProgress ?? 0) + seconds * powerFactor / PLANETARY_TRIP_SECONDS, 6);
    supply.stationProgress = demand.stationProgress;
    demand.utilization = powerFactor;
    supply.utilization = powerFactor;
    if ((demand.stationProgress ?? 0) + EPSILON < 1) continue;

    const cargoLimit = PLANETARY_CARGO_PER_DRONE * dispatchableDrones;
    const transferred = Math.min(available, free, cargoLimit);
    supply.outputs[itemId] = available - transferred;
    demand.outputs[itemId] = Math.floor((demand.outputs[itemId] ?? 0) + transferred);
    demand.stationProgress = Math.max(0, round((demand.stationProgress ?? 0) - 1, 6));
    supply.stationProgress = demand.stationProgress;
    demand.stationTrips = Math.floor((demand.stationTrips ?? 0) + dispatchableDrones);
    supply.stationTrips = Math.floor((supply.stationTrips ?? 0) + dispatchableDrones);
    demand.stationLastTransfer = transferred;
    supply.stationLastTransfer = transferred;
  }
}

function runInterstellarStations(state: GameState, seconds: number, powerByPlanet: Map<PlanetId, PowerPlan>): void {

  const demands = state.entities.filter((entity) => entity.buildingId === "interstellar_logistics_station" && entity.stationMode === "demand");
  for (const demand of demands) {
    const supply = findInterstellarPeer(state, demand);
    const itemId = demand.storedItemId;
    if (!supply || !itemId) {
      demand.stationProgress = 0;
      continue;
    }
    demand.stationPeerId = supply.id;
    supply.stationPeerId = demand.id;
    const capacity = getBuilding("interstellar_logistics_station").outputCapacity * Math.max(1, demand.machineCount);
    const available = Math.floor((supply.outputs[itemId] ?? 0) + EPSILON);
    const free = Math.floor(Math.max(0, capacity - (demand.outputs[itemId] ?? 0)) + EPSILON);
    const dispatchableVessels = stationDispatchableVessels(state, demand);
    if (dispatchableVessels < 1) {
      demand.stationProgress = 0;
      supply.stationProgress = 0;
      continue;
    }

    const sourcePower = powerByPlanet.get(supply.planetId)?.factor ?? 0;
    const targetPower = powerByPlanet.get(demand.planetId)?.factor ?? 0;
    const powerFactor = Math.min(sourcePower, targetPower);
    if (powerFactor <= EPSILON) continue;
    const requiresWarp = stationRouteRequiresWarp(demand, supply);
    const tripSeconds = requiresWarp ? Math.max(4, INTERSTELLAR_TRIP_SECONDS / 4) : INTERSTELLAR_TRIP_SECONDS;
    demand.stationProgress = round((demand.stationProgress ?? 0) + seconds * powerFactor / tripSeconds, 6);
    supply.stationProgress = demand.stationProgress;
    demand.utilization = powerFactor;
    supply.utilization = powerFactor;

    if ((demand.stationProgress ?? 0) + EPSILON < 1) continue;
    const cargoLimit = INTERSTELLAR_CARGO_PER_VESSEL * dispatchableVessels;
    const transferred = Math.min(available, free, cargoLimit);
    supply.outputs[itemId] = available - transferred;
    demand.outputs[itemId] = Math.floor((demand.outputs[itemId] ?? 0) + transferred);
    demand.stationProgress = Math.max(0, round((demand.stationProgress ?? 0) - 1, 6));
    supply.stationProgress = demand.stationProgress;
    demand.stationTrips = Math.floor((demand.stationTrips ?? 0) + dispatchableVessels);
    supply.stationTrips = Math.floor((supply.stationTrips ?? 0) + dispatchableVessels);
    demand.stationLastTransfer = transferred;
    supply.stationLastTransfer = transferred;
    if (requiresWarp) demand.stationWarpers = Math.max(0, Math.floor((demand.stationWarpers ?? 0) - dispatchableVessels));
  }
}

function simulateStep(state: GameState, seconds: number): void {
  absorbDysonSails(state, seconds);
  decayDysonSwarm(state, seconds);
  resetStationRuntime(state);
  runOrbitalCollectors(state, seconds);
  transferLogisticsBuffers(state);
  transferBelts(state, seconds);
  const reception = calculateDysonReception(state);
  const powerByPlanet = new Map<PlanetId, PowerPlan>();
  for (const planet of PLANET_LIST) {
    const power = calculatePower(state, seconds, planet.id, reception);
    powerByPlanet.set(planet.id, power);
    runPowerFacilities(state, seconds, power, planet.id);
    runMiners(state, seconds, power.factor, planet.id);
    runMachines(state, seconds, power.factor, planet.id);
    runRayReceivers(state, seconds, reception, planet.id);
    const storage = gridStoredEnergy(state, planet.id);
    state.planetMetrics[planet.id] = {
      generationKw: round(power.generationKw, 2),
      demandKw: round(power.demandKw, 2),
      powerFactor: round(power.factor, 4),
      windGenerationKw: round(power.windGenerationKw, 2),
      solarGenerationKw: round(power.solarGenerationKw, 2),
      geothermalGenerationKw: round(power.geothermalGenerationKw, 2),
      thermalGenerationKw: round(power.thermalGenerationKw, 2),
      fusionGenerationKw: round(power.fusionGenerationKw, 2),
      artificialStarGenerationKw: round(power.artificialStarGenerationKw, 2),
      rayGenerationKw: round(power.rayGenerationKw, 2),
      storageDischargeKw: round(power.storageDischargeKw, 2),
      storageChargeKw: round(power.storageChargeKw, 2),
      storedEnergyMj: round(storage.stored, 3),
      storageCapacityMj: round(storage.capacity, 3),
      fuelReserveSeconds: fuelReserveSeconds(state, planet.id),
      totalItemsPerMinute: round(state.entities.reduce((sum, entity) =>
        entity.planetId === planet.id ? sum + entity.productionRate : sum, 0), 2),
    };
  }
  runPlanetaryStations(state, seconds, powerByPlanet);
  runInterstellarStations(state, seconds, powerByPlanet);
  state.dysonSwarm.generationKw = state.dysonSwarm.sailsInOrbit * SOLAR_SAIL_POWER_KW;
  updateDysonSphereGeneration(state);
  state.dysonSwarm.receiverLoadKw = round(reception.receiverLoadKw, 2);
  state.elapsedSeconds = round(state.elapsedSeconds + seconds);
  state.metrics = { ...state.planetMetrics[state.activePlanetId] };
}

export function advanceSimulation(state: GameState, seconds: number): GameState {
  if (state.paused || seconds <= 0) return state;
  const next = copyState(state);
  let remaining = Math.min(seconds, 8 * 60 * 60);
  while (remaining > EPSILON) {
    const step = Math.min(1, remaining);
    simulateStep(next, step);
    remaining -= step;
  }
  return next;
}

export function setPaused(state: GameState, paused: boolean): GameState {
  return { ...state, paused };
}

export function setActivePlanet(state: GameState, planetId: PlanetId): GameState {
  if (!PLANET_LIST.some((planet) => planet.id === planetId) || state.activePlanetId === planetId) return state;
  const next = copyState(state);
  next.planetTrays[next.activePlanetId] = { ...next.tray };
  next.activePlanetId = planetId;
  next.tray = { ...next.planetTrays[planetId] };
  next.metrics = { ...getPlanetMetrics(next, planetId) };
  return next;
}

export function manualMine(state: GameState, entityId: string, amount = 1): GameState {
  const next = copyState(state);
  const entity = next.entities.find((item) => item.id === entityId);
  if (!entity || entity.kind !== "vein" || !entity.resourceId || ITEMS[entity.resourceId].kind === "fluid") return state;
  const capacity = Math.max(60, extractorFor(entity).outputCapacity * Math.max(1, entity.minerCount));
  const current = Math.floor((entity.outputs[entity.resourceId] ?? 0) + EPSILON);
  const mined = Math.max(0, Math.floor(Math.min(amount, capacity - current)));
  entity.outputs[entity.resourceId] = current + mined;
  next.manualMined = Math.floor(next.manualMined + mined);
  next.totalProduced[entity.resourceId] = Math.floor((next.totalProduced[entity.resourceId] ?? 0) + mined);
  return next;
}

export function moveEntity(state: GameState, entityId: string, position: { x: number; y: number }): GameState {
  return {
    ...state,
    entities: state.entities.map((entity) => entity.id === entityId ? { ...entity, position } : entity),
  };
}

export function canPlaceBuildingOnPlanet(buildingId: BuildingId, planetId: PlanetId): boolean {
  if (planetId === "giant") return buildingId === "orbital_collector";
  if (buildingId === "orbital_collector") return false;
  return buildingId !== "geothermal_power_station" || planetId === "ashen";
}

export function placeBuilding(state: GameState, buildingId: BuildingId, position: { x: number; y: number }, count = 1): GameState {
  const building = getBuilding(buildingId);
  const amount = Math.max(1, Math.floor(count));
  if (building.kind === "miner" || !canPlaceBuildingOnPlanet(buildingId, state.activePlanetId) ||
    (state.construction[buildingId] ?? 0) < amount) return state;
  const next = copyState(state);
  const recipe = getRecipesForBuilding(buildingId).find((candidate) =>
    !candidate.requiredTechId || isTechnologyCompleted(state, candidate.requiredTechId));
  next.construction[buildingId] = (next.construction[buildingId] ?? 0) - amount;
  next.entities.push({
    id: `entity_${next.nextId}`,
    kind: building.kind === "power" ? "power" : building.kind === "storage" ? "storage" :
      building.kind === "splitter" ? "splitter" : building.kind === "station" ? "station" : "machine",
    planetId: state.activePlanetId,
    position,
    buildingId,
    recipeId: recipe?.id,
    machineCount: amount,
    minerCount: 0,
    inputs: {},
    outputs: {},
    progress: 0,
    routingCursor: 0,
    distributionMode: building.kind === "splitter" ? "balanced" : undefined,
    storedItemId: buildingId === "orbital_collector" ? "hydrogen" : undefined,
    stationMode: building.kind === "station" ? "supply" : undefined,
    stationProgress: building.kind === "station" ? 0 : undefined,
    stationTrips: building.kind === "station" ? 0 : undefined,
    stationLastTransfer: building.kind === "station" ? 0 : undefined,
    stationDrones: buildingId === "planetary_logistics_station" ? 0 : undefined,
    stationVessels: building.kind === "station" ? 0 : undefined,
    stationWarpers: buildingId === "interstellar_logistics_station" ? 0 : undefined,
    stationWarpEnabled: buildingId === "interstellar_logistics_station" ? true : undefined,
    stationMinimumLoad: building.kind === "station" ? 1 : undefined,
    fuelRemainingMj: getFuelItemIdsForBuilding(buildingId).length > 0 ? 0 : undefined,
    powerOutputKw: building.kind === "power" ? 0 : undefined,
    powerInputKw: building.kind === "power" ? 0 : undefined,
    storedEnergyMj: buildingId === "accumulator" || buildingId === "energy_exchanger" ? 0 : undefined,
    energyMode: buildingId === "accumulator" ? "auto" : buildingId === "energy_exchanger" ? "charge" : undefined,
    utilization: 0,
    productionRate: 0,
  });
  next.nextId += 1;
  return next;
}

export function addBuildingToGroup(state: GameState, entityId: string, buildingId: BuildingId, count = 1): GameState {
  const amount = Math.max(1, Math.floor(count));
  if (getBuilding(buildingId).kind === "miner" || (state.construction[buildingId] ?? 0) < amount) return state;
  const next = copyState(state);
  const entity = next.entities.find((item) => item.id === entityId && item.buildingId === buildingId);
  if (!entity) return state;
  entity.machineCount += amount;
  next.construction[buildingId] = (next.construction[buildingId] ?? 0) - amount;
  return next;
}

export function installMiner(state: GameState, entityId: string, count = 1): GameState {
  const source = state.entities.find((item) => item.id === entityId && item.kind === "vein");
  if (!source?.resourceId) return state;
  const extractorId = getExtractorBuildingId(source.resourceId);
  const amount = Math.max(1, Math.floor(count));
  if ((state.construction[extractorId] ?? 0) < amount) return state;
  const next = copyState(state);
  const entity = next.entities.find((item) => item.id === entityId && item.kind === "vein");
  if (!entity) return state;
  entity.minerCount += amount;
  entity.extractorBuildingId = extractorId;
  next.construction[extractorId] = (next.construction[extractorId] ?? 0) - amount;
  return next;
}

function addToTray(state: GameState, itemId: ItemId, amount: number): void {
  state.tray[itemId] = Math.floor((state.tray[itemId] ?? 0) + amount + EPSILON);
}

function refundBelts(state: GameState, belts: BeltConnection[]): void {
  for (const belt of belts) {
    const constructionId = getBeltConstructionId(belt.tier);
    state.construction[constructionId] = (state.construction[constructionId] ?? 0) + belt.lanes;
    if (belt.sorterTier > 1) {
      const sorterId = getSorterConstructionId(belt.sorterTier);
      state.construction[sorterId] = (state.construction[sorterId] ?? 0) + belt.lanes;
    }
  }
}

function logisticsAccepts(entity: FactoryEntity, itemId: ItemId): boolean {
  if ((entity.kind !== "storage" && entity.kind !== "splitter" && entity.kind !== "station") || !entity.buildingId) return false;
  if (entity.buildingId === "orbital_collector") {
    return (itemId === "hydrogen" || itemId === "deuterium" || itemId === "fire_ice") && (!entity.storedItemId || entity.storedItemId === itemId);
  }
  const accepts = getBuilding(entity.buildingId).accepts ?? "any";
  const itemKind = ITEMS[itemId].kind;
  const compatibleKind = accepts === "any" || accepts === itemKind || (accepts === "solid" && itemKind === "matrix");
  return compatibleKind && (!entity.storedItemId || entity.storedItemId === itemId);
}

function fuelGeneratorAccepts(entity: FactoryEntity, itemId: ItemId): boolean {
  return Boolean(entity.buildingId && getFuelItemIdsForBuilding(entity.buildingId).includes(itemId) &&
    (!entity.fuelItemId || entity.fuelItemId === itemId));
}

function targetConsumes(state: GameState, entity: FactoryEntity, itemId: ItemId): boolean {
  if (logisticsAccepts(entity, itemId)) return true;
  if (fuelGeneratorAccepts(entity, itemId)) return true;
  if (entity.sprayCoaterInstalled && getEntityProliferatorItemId(entity) === itemId) return true;
  const recipe = getRecipe(entity.recipeId);
  if (recipe?.id === "matrix_research") {
    return remainingResearchCosts(state).some((cost) => cost.itemId === itemId);
  }
  return recipe?.inputs.some((input) => input.itemId === itemId) ?? false;
}

function configureTargetItem(entity: FactoryEntity, itemId: ItemId): void {
  if ((entity.kind === "storage" || entity.kind === "splitter" || entity.kind === "station") && !entity.storedItemId) {
    entity.storedItemId = itemId;
  }
  if (entity.buildingId && !entity.fuelItemId && getFuelItemIdsForBuilding(entity.buildingId).includes(itemId)) {
    entity.fuelItemId = itemId;
  }
}

export function setEntityRecipe(state: GameState, entityId: string, recipeId: RecipeId): GameState {
  const next = copyState(state);
  const entity = next.entities.find((item) => item.id === entityId);
  const recipe = getRecipe(recipeId);
  if (!entity?.buildingId || !recipe || !buildingSupportsRecipe(entity.buildingId, recipe) ||
    (recipe.requiredTechId && !isTechnologyCompleted(state, recipe.requiredTechId))) return state;

  for (const [itemId, amount] of Object.entries(entity.inputs)) addToTray(next, itemId as ItemId, amount ?? 0);
  for (const [itemId, amount] of Object.entries(entity.outputs)) addToTray(next, itemId as ItemId, amount ?? 0);
  entity.inputs = {};
  entity.outputs = {};
  entity.progress = 0;
  entity.proliferatorBonusProgress = {};
  if (entity.buildingId === "ray_receiver") entity.powerOutputKw = 0;
  entity.recipeId = recipeId;

  const removedBelts = next.belts.filter((belt) => belt.source === entityId || belt.target === entityId);
  refundBelts(next, removedBelts);
  next.belts = next.belts.filter((belt) => belt.source !== entityId && belt.target !== entityId);
  return next;
}

export function canInstallSprayCoater(state: GameState, entityId: string): boolean {
  const entity = state.entities.find((item) => item.id === entityId);
  return Boolean(entity && !entity.sprayCoaterInstalled && isProliferatorEligible(entity) &&
    isTechnologyCompleted(state, "proliferator_1") && (state.construction.spray_coater ?? 0) >= 1);
}

export function installSprayCoater(state: GameState, entityId: string): GameState {
  if (!canInstallSprayCoater(state, entityId)) return state;
  const next = copyState(state);
  const entity = next.entities.find((candidate) => candidate.id === entityId)!;
  entity.sprayCoaterInstalled = true;
  entity.proliferatorMode = "normal";
  entity.proliferatorTier = 1;
  entity.proliferatorPoints = 0;
  entity.proliferatorBonusProgress = {};
  next.construction.spray_coater = (next.construction.spray_coater ?? 0) - 1;
  return next;
}

export function setProliferatorConfiguration(
  state: GameState,
  entityId: string,
  tier: ProliferatorTier,
  mode: ProliferatorMode,
): GameState {
  const current = state.entities.find((entity) => entity.id === entityId);
  const definition = getProliferator(tier);
  if (!current?.sprayCoaterInstalled || !isProliferatorEligible(current) ||
    !isTechnologyCompleted(state, definition.requiredTechId)) return state;
  if (current.proliferatorTier === tier && current.proliferatorMode === mode) return state;
  const next = copyState(state);
  const entity = next.entities.find((candidate) => candidate.id === entityId)!;
  if (entity.proliferatorTier !== tier) {
    const previousItemId = getEntityProliferatorItemId(entity);
    if (previousItemId) {
      addToTray(next, previousItemId, Math.floor(entity.inputs[previousItemId] ?? 0));
      entity.inputs[previousItemId] = 0;
    }
    const removedBelts = next.belts.filter((belt) => belt.target === entityId && PROLIFERATOR_ITEM_IDS.includes(belt.itemId));
    refundBelts(next, removedBelts);
    next.belts = next.belts.filter((belt) => !removedBelts.includes(belt));
    entity.proliferatorPoints = 0;
  }
  entity.proliferatorTier = tier;
  entity.proliferatorMode = mode;
  return next;
}

export function pickFromEntity(state: GameState, entityId: string, itemId: ItemId, amount = 100): GameState {
  const entity = state.entities.find((item) => item.id === entityId);
  const available = Math.floor((entity?.outputs[itemId] ?? 0) + EPSILON);
  if (!entity || available < 1 || (state.cargo && state.cargo.itemId !== itemId)) return state;
  const next = copyState(state);
  const target = next.entities.find((item) => item.id === entityId)!;
  const currentCargo = next.cargo?.amount ?? 0;
  const taken = Math.floor(Math.min(available, amount, 100 - currentCargo));
  target.outputs[itemId] = available - taken;
  next.cargo = {
    itemId,
    amount: Math.floor(currentCargo + taken),
    origin: { kind: "node-output", id: entityId },
  };
  return next;
}

export function pickFromEntityInput(state: GameState, entityId: string, itemId: ItemId, amount = 100): GameState {
  const entity = state.entities.find((item) => item.id === entityId);
  const available = Math.floor((entity?.inputs[itemId] ?? 0) + EPSILON);
  if (!entity || available < 1 || (state.cargo && state.cargo.itemId !== itemId)) return state;
  const next = copyState(state);
  const target = next.entities.find((item) => item.id === entityId)!;
  const currentCargo = next.cargo?.amount ?? 0;
  const taken = Math.floor(Math.min(available, amount, 100 - currentCargo));
  target.inputs[itemId] = available - taken;
  next.cargo = {
    itemId,
    amount: Math.floor(currentCargo + taken),
    origin: { kind: "node-input", id: entityId },
  };
  return next;
}

export function moveEntityOutputToTray(state: GameState, entityId: string, itemId: ItemId): GameState {
  const entity = state.entities.find((item) => item.id === entityId);
  const available = Math.floor((entity?.outputs[itemId] ?? 0) + EPSILON);
  if (!entity || available < 1) return state;
  const next = copyState(state);
  const source = next.entities.find((item) => item.id === entityId)!;
  source.outputs[itemId] = 0;
  addToTray(next, itemId, available);
  return next;
}

export function moveEntityInputToTray(state: GameState, entityId: string, itemId: ItemId): GameState {
  const entity = state.entities.find((item) => item.id === entityId);
  const available = Math.floor((entity?.inputs[itemId] ?? 0) + EPSILON);
  if (!entity || available < 1) return state;
  const next = copyState(state);
  const source = next.entities.find((item) => item.id === entityId)!;
  source.inputs[itemId] = 0;
  addToTray(next, itemId, available);
  return next;
}

export function moveEntityOutputToEntity(
  state: GameState,
  sourceId: string,
  targetId: string,
  itemId: ItemId,
): GameState {
  const source = state.entities.find((item) => item.id === sourceId);
  const target = state.entities.find((item) => item.id === targetId);
  const available = Math.floor((source?.outputs[itemId] ?? 0) + EPSILON);
  if (!source || !target?.buildingId || available < 1 || !targetConsumes(state, target, itemId)) return state;
  const capacity = getBuilding(target.buildingId).inputCapacity * Math.max(1, target.machineCount);
  const current = Math.floor((target.inputs[itemId] ?? 0) + EPSILON);
  const moved = Math.floor(Math.min(available, Math.max(0, capacity - current)));
  if (moved < 1) return state;
  const next = copyState(state);
  next.entities.find((item) => item.id === sourceId)!.outputs[itemId] = available - moved;
  const nextTarget = next.entities.find((item) => item.id === targetId)!;
  configureTargetItem(nextTarget, itemId);
  nextTarget.inputs[itemId] = current + moved;
  return next;
}

export function moveEntityInputToEntity(
  state: GameState,
  sourceId: string,
  targetId: string,
  itemId: ItemId,
): GameState {
  if (sourceId === targetId) return state;
  const source = state.entities.find((item) => item.id === sourceId);
  const target = state.entities.find((item) => item.id === targetId);
  const available = Math.floor((source?.inputs[itemId] ?? 0) + EPSILON);
  if (!source || !target?.buildingId || available < 1 || !targetConsumes(state, target, itemId)) return state;
  const capacity = getBuilding(target.buildingId).inputCapacity * Math.max(1, target.machineCount);
  const current = Math.floor((target.inputs[itemId] ?? 0) + EPSILON);
  const moved = Math.floor(Math.min(available, Math.max(0, capacity - current)));
  if (moved < 1) return state;
  const next = copyState(state);
  next.entities.find((item) => item.id === sourceId)!.inputs[itemId] = available - moved;
  const nextTarget = next.entities.find((item) => item.id === targetId)!;
  configureTargetItem(nextTarget, itemId);
  nextTarget.inputs[itemId] = current + moved;
  return next;
}

export function moveTrayItemToEntity(state: GameState, targetId: string, itemId: ItemId): GameState {
  const target = state.entities.find((item) => item.id === targetId);
  const available = Math.floor((state.tray[itemId] ?? 0) + EPSILON);
  if (!target?.buildingId || available < 1 || !targetConsumes(state, target, itemId)) return state;
  const capacity = getBuilding(target.buildingId).inputCapacity * Math.max(1, target.machineCount);
  const current = Math.floor((target.inputs[itemId] ?? 0) + EPSILON);
  const moved = Math.floor(Math.min(available, Math.max(0, capacity - current)));
  if (moved < 1) return state;
  const next = copyState(state);
  next.tray[itemId] = available - moved;
  const nextTarget = next.entities.find((item) => item.id === targetId)!;
  configureTargetItem(nextTarget, itemId);
  nextTarget.inputs[itemId] = current + moved;
  return next;
}

export function dropCargoToEntity(state: GameState, entityId: string): GameState {
  if (!state.cargo) return state;
  const entity = state.entities.find((item) => item.id === entityId);
  if (!entity?.buildingId || !targetConsumes(state, entity, state.cargo.itemId)) return state;
  const next = copyState(state);
  const target = next.entities.find((item) => item.id === entityId)!;
  const cargo = next.cargo;
  if (!cargo) return state;
  const capacity = getBuilding(target.buildingId!).inputCapacity * Math.max(1, target.machineCount);
  const current = target.inputs[cargo.itemId] ?? 0;
  const moved = Math.floor(Math.min(cargo.amount, Math.max(0, capacity - current)));
  configureTargetItem(target, cargo.itemId);
  target.inputs[cargo.itemId] = Math.floor(current + moved);
  cargo.amount = Math.floor(cargo.amount - moved);
  if (cargo.amount < 1) next.cargo = null;
  return next;
}

export function dropCargoToTray(state: GameState): GameState {
  if (!state.cargo) return state;
  const next = copyState(state);
  addToTray(next, next.cargo!.itemId, next.cargo!.amount);
  next.cargo = null;
  return next;
}

export function pickFromTray(state: GameState, itemId: ItemId, amount = 100): GameState {
  const available = Math.floor((state.tray[itemId] ?? 0) + EPSILON);
  if (available < 1 || (state.cargo && state.cargo.itemId !== itemId)) return state;
  const next = copyState(state);
  const currentCargo = next.cargo?.amount ?? 0;
  const taken = Math.floor(Math.min(available, amount, 100 - currentCargo));
  next.tray[itemId] = available - taken;
  next.cargo = { itemId, amount: Math.floor(currentCargo + taken), origin: { kind: "tray" } };
  return next;
}

export function craftConstruction(state: GameState, buildingId: ConstructionId): GameState {
  const definition = CONSTRUCTION.find((item) => item.buildingId === buildingId);
  if (!definition || (definition.requiredTechId && !isTechnologyCompleted(state, definition.requiredTechId)) ||
    definition.costs.some((cost) => (state.tray[cost.itemId] ?? 0) + EPSILON < cost.amount)) return state;
  const next = copyState(state);
  for (const cost of definition.costs) {
    next.tray[cost.itemId] = Math.floor((next.tray[cost.itemId] ?? 0) - cost.amount);
  }
  next.construction[buildingId] = (next.construction[buildingId] ?? 0) + definition.outputAmount;
  return next;
}

function sourceProduces(entity: FactoryEntity, itemId: ItemId): boolean {
  if (entity.kind === "vein") return entity.resourceId === itemId;
  if (entity.kind === "storage" || entity.kind === "splitter" || entity.kind === "station") return entity.storedItemId === itemId;
  return getRecipe(entity.recipeId)?.outputs.some((output) => output.itemId === itemId) ?? false;
}

export function connectBelt(state: GameState, sourceId: string, targetId: string, itemId: ItemId, tier: BeltTier = 1): GameState {
  const constructionId = getBeltConstructionId(tier);
  if ((state.construction[constructionId] ?? 0) < 1 || sourceId === targetId) return state;
  const source = state.entities.find((entity) => entity.id === sourceId);
  const target = state.entities.find((entity) => entity.id === targetId);
  if (!source || !target || source.planetId !== target.planetId ||
    !sourceProduces(source, itemId) || !targetConsumes(state, target, itemId)) return state;
  const next = copyState(state);
  configureTargetItem(next.entities.find((entity) => entity.id === targetId)!, itemId);
  const existing = next.belts.find((belt) => belt.source === sourceId && belt.target === targetId && belt.itemId === itemId);
  if (existing) {
    if (existing.tier !== tier) return state;
    existing.lanes += 1;
  } else {
    next.belts.push({
      id: `belt_${next.nextId}`,
      planetId: source.planetId,
      source: sourceId,
      target: targetId,
      itemId,
      lanes: 1,
      tier,
      sorterTier: 1,
      progress: 0,
      priority: 0,
      lastFlow: 0,
    });
    next.nextId += 1;
  }
  next.construction[constructionId] = (next.construction[constructionId] ?? 0) - 1;
  return next;
}

export function removeBelt(state: GameState, beltId: string): GameState {
  const belt = state.belts.find((item) => item.id === beltId);
  if (!belt) return state;
  const next = copyState(state);
  next.belts = next.belts.filter((item) => item.id !== beltId);
  const constructionId = getBeltConstructionId(belt.tier);
  next.construction[constructionId] = (next.construction[constructionId] ?? 0) + belt.lanes;
  if (belt.sorterTier > 1) {
    const sorterId = getSorterConstructionId(belt.sorterTier);
    next.construction[sorterId] = (next.construction[sorterId] ?? 0) + belt.lanes;
  }
  return next;
}

export function setBeltPriority(state: GameState, beltId: string, priority: 0 | 1): GameState {
  if (!state.belts.some((belt) => belt.id === beltId)) return state;
  return {
    ...state,
    belts: state.belts.map((belt) => belt.id === beltId ? { ...belt, priority } : belt),
  };
}

export function setLogisticsItem(state: GameState, entityId: string, itemId: ItemId): GameState {
  const current = state.entities.find((entity) => entity.id === entityId);
  if (!current || !logisticsAccepts({ ...current, storedItemId: undefined }, itemId)) return state;
  if (current.storedItemId === itemId) return state;
  const next = copyState(state);
  const entity = next.entities.find((candidate) => candidate.id === entityId)!;
  for (const [bufferedItemId, amount] of Object.entries(entity.inputs)) addToTray(next, bufferedItemId as ItemId, amount ?? 0);
  for (const [bufferedItemId, amount] of Object.entries(entity.outputs)) addToTray(next, bufferedItemId as ItemId, amount ?? 0);
  entity.inputs = {};
  entity.outputs = {};
  entity.storedItemId = itemId;
  entity.routingCursor = 0;
  entity.stationProgress = 0;
  entity.stationPeerId = undefined;
  const removedBelts = next.belts.filter((belt) => belt.source === entityId || belt.target === entityId);
  refundBelts(next, removedBelts);
  next.belts = next.belts.filter((belt) => belt.source !== entityId && belt.target !== entityId);
  return next;
}

export function setStationMode(state: GameState, entityId: string, mode: "supply" | "demand"): GameState {
  if (!state.entities.some((entity) => entity.id === entityId && entity.kind === "station" && entity.buildingId !== "orbital_collector")) return state;
  return {
    ...state,
    entities: state.entities.map((entity) => entity.id === entityId ? {
      ...entity,
      stationMode: mode,
      stationProgress: 0,
      stationPeerId: undefined,
    } : entity),
  };
}

export function adjustStationVessels(state: GameState, entityId: string, delta: number): GameState {
  const current = state.entities.find((entity) => entity.id === entityId && entity.buildingId === "interstellar_logistics_station");
  const requested = Math.trunc(delta);
  if (!current || current.planetId !== state.activePlanetId || requested === 0) return state;
  const loaded = Math.max(0, Math.floor(current.stationVessels ?? 0));
  const capacity = getStationVesselCapacity(current);
  const available = Math.max(0, Math.floor(state.tray.logistics_vessel ?? 0));
  const change = requested > 0
    ? Math.min(requested, capacity - loaded, available)
    : -Math.min(-requested, loaded);
  if (change === 0) return state;

  const next = copyState(state);
  const station = next.entities.find((entity) => entity.id === entityId)!;
  station.stationVessels = loaded + change;
  station.stationProgress = 0;
  if (change > 0) {
    next.tray.logistics_vessel = available - change;
  } else {
    addToTray(next, "logistics_vessel", -change);
  }
  if (station.stationPeerId) {
    const peer = next.entities.find((entity) => entity.id === station.stationPeerId);
    if (peer) peer.stationProgress = 0;
  }
  return next;
}

export function adjustStationDrones(state: GameState, entityId: string, delta: number): GameState {
  const current = state.entities.find((entity) => entity.id === entityId && entity.buildingId === "planetary_logistics_station");
  const requested = Math.trunc(delta);
  if (!current || current.planetId !== state.activePlanetId || requested === 0) return state;
  const loaded = Math.max(0, Math.floor(current.stationDrones ?? 0));
  const capacity = getStationDroneCapacity(current);
  const available = Math.max(0, Math.floor(state.tray.logistics_drone ?? 0));
  const change = requested > 0
    ? Math.min(requested, capacity - loaded, available)
    : -Math.min(-requested, loaded);
  if (change === 0) return state;

  const next = copyState(state);
  const station = next.entities.find((entity) => entity.id === entityId)!;
  station.stationDrones = loaded + change;
  station.stationProgress = 0;
  if (change > 0) next.tray.logistics_drone = available - change;
  else addToTray(next, "logistics_drone", -change);
  if (station.stationPeerId) {
    const peer = next.entities.find((entity) => entity.id === station.stationPeerId);
    if (peer) peer.stationProgress = 0;
  }
  return next;
}

export function adjustStationWarpers(state: GameState, entityId: string, delta: number): GameState {
  const current = state.entities.find((entity) => entity.id === entityId && entity.buildingId === "interstellar_logistics_station");
  const requested = Math.trunc(delta);
  if (!current || current.planetId !== state.activePlanetId || requested === 0 ||
    !isTechnologyCompleted(state, "space_warp")) return state;
  const loaded = Math.max(0, Math.floor(current.stationWarpers ?? 0));
  const capacity = getStationWarperCapacity(current);
  const available = Math.max(0, Math.floor(state.tray.space_warper ?? 0));
  const change = requested > 0
    ? Math.min(requested, capacity - loaded, available)
    : -Math.min(-requested, loaded);
  if (change === 0) return state;
  const next = copyState(state);
  const station = next.entities.find((entity) => entity.id === entityId)!;
  station.stationWarpers = loaded + change;
  if (change > 0) next.tray.space_warper = available - change;
  else addToTray(next, "space_warper", -change);
  return next;
}

export function setStationWarpEnabled(state: GameState, entityId: string, enabled: boolean): GameState {
  if (!state.entities.some((entity) => entity.id === entityId && entity.buildingId === "interstellar_logistics_station") ||
    (enabled && !isTechnologyCompleted(state, "space_warp"))) return state;
  return {
    ...state,
    entities: state.entities.map((entity) => entity.id === entityId ? { ...entity, stationWarpEnabled: enabled } : entity),
  };
}

export function setStationMinimumLoad(state: GameState, entityId: string, minimumLoad: StationMinimumLoad): GameState {
  const current = state.entities.find((entity) => entity.id === entityId && entity.kind === "station");
  if (!current || !STATION_MINIMUM_LOAD_OPTIONS.includes(minimumLoad) || getStationMinimumLoad(current) === minimumLoad) return state;
  const next = copyState(state);
  const station = next.entities.find((entity) => entity.id === entityId)!;
  station.stationMinimumLoad = minimumLoad;
  station.stationProgress = 0;
  if (station.stationPeerId) {
    const peer = next.entities.find((entity) => entity.id === station.stationPeerId);
    if (peer) peer.stationProgress = 0;
  }
  return next;
}

export function setFuelItem(state: GameState, entityId: string, itemId: ItemId): GameState {
  const current = state.entities.find((entity) => entity.id === entityId);
  if (!current?.buildingId || !getFuelItemIdsForBuilding(current.buildingId).includes(itemId)) return state;
  if (current.fuelItemId === itemId) return state;
  const next = copyState(state);
  const entity = next.entities.find((candidate) => candidate.id === entityId)!;
  for (const [bufferedItemId, amount] of Object.entries(entity.inputs)) addToTray(next, bufferedItemId as ItemId, amount ?? 0);
  entity.inputs = {};
  entity.fuelItemId = itemId;
  entity.powerOutputKw = 0;
  const removedBelts = next.belts.filter((belt) => belt.source === entityId || belt.target === entityId);
  refundBelts(next, removedBelts);
  next.belts = next.belts.filter((belt) => belt.source !== entityId && belt.target !== entityId);
  return next;
}

export function setEnergyMode(state: GameState, entityId: string, mode: EnergyMode): GameState {
  const current = state.entities.find((entity) => entity.id === entityId);
  if (!current || current.buildingId !== "energy_exchanger" || mode === "auto" ||
    current.energyMode === mode || storedEnergy(current) > EPSILON) return state;
  const next = copyState(state);
  const entity = next.entities.find((candidate) => candidate.id === entityId)!;
  for (const [itemId, amount] of Object.entries(entity.inputs)) addToTray(next, itemId as ItemId, amount ?? 0);
  for (const [itemId, amount] of Object.entries(entity.outputs)) addToTray(next, itemId as ItemId, amount ?? 0);
  entity.inputs = {};
  entity.outputs = {};
  entity.energyMode = mode;
  entity.recipeId = mode === "discharge" ? "accumulator_discharge" : "accumulator_charge";
  entity.progress = 0;
  entity.powerInputKw = 0;
  entity.powerOutputKw = 0;
  const removedBelts = next.belts.filter((belt) => belt.source === entityId || belt.target === entityId);
  refundBelts(next, removedBelts);
  next.belts = next.belts.filter((belt) => belt.source !== entityId && belt.target !== entityId);
  return next;
}

export function setSplitterMode(state: GameState, entityId: string, mode: "balanced" | "priority"): GameState {
  if (!state.entities.some((entity) => entity.id === entityId && entity.kind === "splitter")) return state;
  return {
    ...state,
    entities: state.entities.map((entity) => entity.id === entityId ? { ...entity, distributionMode: mode } : entity),
  };
}

export function removeEntity(state: GameState, entityId: string): GameState {
  const entity = state.entities.find((item) => item.id === entityId);
  if (!entity || entity.kind === "vein") return state;
  const next = copyState(state);
  const target = next.entities.find((item) => item.id === entityId)!;
  for (const [itemId, amount] of Object.entries(target.inputs)) addToTray(next, itemId as ItemId, amount ?? 0);
  for (const [itemId, amount] of Object.entries(target.outputs)) addToTray(next, itemId as ItemId, amount ?? 0);
  if (target.kind === "station" && (target.stationVessels ?? 0) > 0) {
    addToTray(next, "logistics_vessel", Math.floor(target.stationVessels ?? 0));
  }
  if (target.kind === "station" && (target.stationDrones ?? 0) > 0) {
    addToTray(next, "logistics_drone", Math.floor(target.stationDrones ?? 0));
  }
  if (target.kind === "station" && (target.stationWarpers ?? 0) > 0) {
    addToTray(next, "space_warper", Math.floor(target.stationWarpers ?? 0));
  }
  if (target.sprayCoaterInstalled) {
    next.construction.spray_coater = (next.construction.spray_coater ?? 0) + 1;
  }
  if (target.buildingId) {
    next.construction[target.buildingId] = (next.construction[target.buildingId] ?? 0) + target.machineCount;
  }
  const removedBelts = next.belts.filter((belt) => belt.source === entityId || belt.target === entityId);
  refundBelts(next, removedBelts);
  next.entities = next.entities.filter((item) => item.id !== entityId);
  next.belts = next.belts.filter((belt) => belt.source !== entityId && belt.target !== entityId);
  return next;
}

export function canUpgradeEntity(state: GameState, entityId: string): boolean {
  const entity = state.entities.find((item) => item.id === entityId);
  if (!entity?.buildingId || entity.kind === "vein") return false;
  const targetId = getBuildingUpgradeTarget(entity.buildingId);
  const definition = targetId ? getConstructionDefinition(targetId) : undefined;
  return Boolean(targetId && definition &&
    (!definition.requiredTechId || isTechnologyCompleted(state, definition.requiredTechId)) &&
    (state.construction[targetId] ?? 0) >= entity.machineCount);
}

export function upgradeEntity(state: GameState, entityId: string): GameState {
  if (!canUpgradeEntity(state, entityId)) return state;
  const current = state.entities.find((entity) => entity.id === entityId)!;
  const sourceId = current.buildingId!;
  const targetId = getBuildingUpgradeTarget(sourceId)!;
  const next = copyState(state);
  const entity = next.entities.find((candidate) => candidate.id === entityId)!;
  next.construction[targetId] = (next.construction[targetId] ?? 0) - entity.machineCount;
  next.construction[sourceId] = (next.construction[sourceId] ?? 0) + entity.machineCount;
  entity.buildingId = targetId;
  return next;
}

export function canUpgradeBelt(state: GameState, beltId: string): boolean {
  const belt = state.belts.find((item) => item.id === beltId);
  if (!belt || belt.tier >= 3) return false;
  const targetId = getBeltConstructionId((belt.tier + 1) as BeltTier);
  const definition = getConstructionDefinition(targetId);
  return Boolean(definition &&
    (!definition.requiredTechId || isTechnologyCompleted(state, definition.requiredTechId)) &&
    (state.construction[targetId] ?? 0) >= belt.lanes);
}

export function upgradeBelt(state: GameState, beltId: string): GameState {
  if (!canUpgradeBelt(state, beltId)) return state;
  const current = state.belts.find((belt) => belt.id === beltId)!;
  const sourceId = getBeltConstructionId(current.tier);
  const targetTier = (current.tier + 1) as BeltTier;
  const targetId = getBeltConstructionId(targetTier);
  const next = copyState(state);
  const belt = next.belts.find((candidate) => candidate.id === beltId)!;
  next.construction[targetId] = (next.construction[targetId] ?? 0) - belt.lanes;
  next.construction[sourceId] = (next.construction[sourceId] ?? 0) + belt.lanes;
  belt.tier = targetTier;
  return next;
}

export function canUpgradeSorter(state: GameState, beltId: string): boolean {
  const belt = state.belts.find((item) => item.id === beltId);
  if (!belt || belt.sorterTier >= 3) return false;
  const targetId = getSorterConstructionId((belt.sorterTier + 1) as SorterTier);
  const definition = getConstructionDefinition(targetId);
  return Boolean(definition && (!definition.requiredTechId || isTechnologyCompleted(state, definition.requiredTechId)) &&
    (state.construction[targetId] ?? 0) >= belt.lanes);
}

export function upgradeSorter(state: GameState, beltId: string): GameState {
  if (!canUpgradeSorter(state, beltId)) return state;
  const current = state.belts.find((belt) => belt.id === beltId)!;
  const targetTier = (current.sorterTier + 1) as SorterTier;
  const targetId = getSorterConstructionId(targetTier);
  const next = copyState(state);
  const belt = next.belts.find((candidate) => candidate.id === beltId)!;
  next.construction[targetId] = (next.construction[targetId] ?? 0) - belt.lanes;
  if (belt.sorterTier > 1) {
    const sourceId = getSorterConstructionId(belt.sorterTier);
    next.construction[sourceId] = (next.construction[sourceId] ?? 0) + belt.lanes;
  }
  belt.sorterTier = targetTier;
  return next;
}

export function getSorterCapacity(belt: BeltConnection): number {
  return SORTER_CAPACITY_PER_SECOND[belt.sorterTier] * belt.lanes;
}

export function getBeltCapacity(belt: BeltConnection): number {
  return Math.min(BELT_CAPACITY_PER_SECOND[belt.tier], SORTER_CAPACITY_PER_SECOND[belt.sorterTier]) * belt.lanes;
}

export function canCraftConstruction(state: GameState, buildingId: ConstructionId): boolean {
  const definition = CONSTRUCTION.find((item) => item.buildingId === buildingId);
  return Boolean(definition && (!definition.requiredTechId || isTechnologyCompleted(state, definition.requiredTechId)) &&
    definition.costs.every((cost) => (state.tray[cost.itemId] ?? 0) + EPSILON >= cost.amount));
}

export function canHandcraftRecipe(state: GameState, recipeId: RecipeId, batches = 1): boolean {
  const recipe = getRecipe(recipeId);
  const amount = Math.max(1, Math.floor(batches));
  return Boolean(recipe && recipe.buildingId === "assembling_machine_mk1" && recipe.outputs.length > 0 &&
    (!recipe.requiredTechId || isTechnologyCompleted(state, recipe.requiredTechId)) &&
    recipe.inputs.every((input) => (state.tray[input.itemId] ?? 0) + EPSILON >= input.amount * amount));
}

export function handcraftRecipe(state: GameState, recipeId: RecipeId, batches = 1): GameState {
  const amount = Math.max(1, Math.floor(batches));
  const recipe = getRecipe(recipeId);
  if (!recipe || !canHandcraftRecipe(state, recipeId, amount)) return state;
  const next = copyState(state);
  for (const input of recipe.inputs) {
    next.tray[input.itemId] = Math.max(0, Math.floor((next.tray[input.itemId] ?? 0) - input.amount * amount));
  }
  for (const output of recipe.outputs) {
    const produced = output.amount * amount;
    addToTray(next, output.itemId, produced);
    next.totalProduced[output.itemId] = Math.floor((next.totalProduced[output.itemId] ?? 0) + produced);
  }
  return next;
}

export function isTechnologyCompleted(state: GameState, techId: TechId): boolean {
  return state.research.completedTechIds.includes(techId);
}

export function canSelectTechnology(state: GameState, techId: TechId): boolean {
  const technology = getTechnology(techId);
  return Boolean(technology && !isTechnologyCompleted(state, techId) && state.research.selectedTechId !== techId &&
    !state.research.queuedTechIds.includes(techId) &&
    technology.prerequisites.every((prerequisite) => isTechnologyCompleted(state, prerequisite)));
}

export function canQueueTechnology(state: GameState, techId: TechId): boolean {
  const technology = getTechnology(techId);
  if (!technology || isTechnologyCompleted(state, techId) || state.research.selectedTechId === techId ||
    state.research.queuedTechIds.includes(techId)) return false;
  const planned = new Set<TechId>([
    ...state.research.completedTechIds,
    ...(state.research.selectedTechId ? [state.research.selectedTechId] : []),
    ...state.research.queuedTechIds,
  ]);
  return technology.prerequisites.every((prerequisite) => planned.has(prerequisite));
}

export function selectTechnology(state: GameState, techId: TechId): GameState {
  if (state.research.selectedTechId) {
    if (!canQueueTechnology(state, techId)) return state;
    const next = copyState(state);
    next.research.queuedTechIds.push(techId);
    return next;
  }
  if (!canSelectTechnology(state, techId)) return state;
  const next = copyState(state);
  next.research.selectedTechId = techId;
  for (const entity of next.entities) {
    if (entity.recipeId === "matrix_research") entity.progress = 0;
  }
  return next;
}

export function removeQueuedTechnology(state: GameState, techId: TechId): GameState {
  if (!state.research.queuedTechIds.includes(techId)) return state;
  const next = copyState(state);
  const planned = new Set<TechId>([
    ...next.research.completedTechIds,
    ...(next.research.selectedTechId ? [next.research.selectedTechId] : []),
  ]);
  const validQueue: TechId[] = [];
  for (const queuedTechId of next.research.queuedTechIds.filter((queued) => queued !== techId)) {
    const technology = getTechnology(queuedTechId);
    if (!technology?.prerequisites.every((prerequisite) => planned.has(prerequisite))) continue;
    validQueue.push(queuedTechId);
    planned.add(queuedTechId);
  }
  next.research.queuedTechIds = validQueue;
  return next;
}

export function getEntityOperatingStatus(state: GameState, entity: FactoryEntity): EntityOperatingStatus {
  if (state.paused) return { code: "paused", label: "模拟已暂停", tone: "idle" };
  const planetMetrics = getPlanetMetrics(state, entity.planetId);

  if (entity.kind === "vein") {
    if (entity.minerCount < 1) return {
      code: "idle",
      label: ITEMS[entity.resourceId!].kind === "fluid" ? `等待${extractorFor(entity).shortName}` : "可手动采集",
      tone: "idle",
    };
    const extractor = extractorFor(entity);
    const capacity = extractor.outputCapacity * entity.minerCount;
    if ((entity.outputs[entity.resourceId!] ?? 0) >= capacity - EPSILON) {
      return { code: "output-blocked", label: "输出缓存已满", tone: "blocked" };
    }
    if (planetMetrics.powerFactor <= EPSILON) return { code: "no-power", label: "电网断电", tone: "blocked" };
    if (planetMetrics.powerFactor < 0.999) {
      return { code: "low-power", label: `供电不足 · ${Math.round(planetMetrics.powerFactor * 100)}%`, tone: "warning" };
    }
    return { code: "running", label: "采矿中", tone: "running" };
  }

  if (isFuelGenerator(entity)) {
    if (!entity.fuelItemId) return { code: "no-fuel-selected", label: "未选择燃料", tone: "blocked" };
    if (fuelEnergyAvailable(entity) <= EPSILON) return { code: "missing-fuel", label: `缺少${ITEMS[entity.fuelItemId].name}`, tone: "blocked" };
    if ((entity.powerOutputKw ?? 0) > EPSILON) {
      const label = entity.buildingId === "artificial_star" ? "反物质湮灭中" : entity.buildingId === "mini_fusion_power_plant" ? "聚变发电中" : "燃烧发电中";
      return { code: "running", label, tone: "running" };
    }
    return { code: "grid-standby", label: "电网暂无缺口", tone: "idle" };
  }

  if (entity.buildingId === "accumulator") {
    const stored = storedEnergy(entity);
    const capacity = energyCapacity(entity);
    if ((entity.powerInputKw ?? 0) > EPSILON) return { code: "running", label: "吸收富余电力", tone: "running" };
    if ((entity.powerOutputKw ?? 0) > EPSILON) return { code: "running", label: "补充电网缺口", tone: "running" };
    if (stored >= capacity - EPSILON) return { code: "grid-standby", label: "储能已满", tone: "idle" };
    if (stored <= EPSILON) return { code: "grid-standby", label: "储能已空", tone: "idle" };
    return { code: "grid-standby", label: "电网平衡待机", tone: "idle" };
  }

  if (entity.buildingId === "energy_exchanger") {
    const charging = entity.energyMode !== "discharge";
    const inputId: ItemId = charging ? "accumulator" : "charged_accumulator";
    const outputId: ItemId = charging ? "charged_accumulator" : "accumulator";
    if (itemOutputFree(entity, outputId) < 1) return { code: "output-blocked", label: `${ITEMS[outputId].name}输出已满`, tone: "blocked" };
    if ((entity.inputs[inputId] ?? 0) < 1 && storedEnergy(entity) <= EPSILON) {
      return { code: "missing-input", label: `等待${ITEMS[inputId].name}`, tone: "idle" };
    }
    if (charging && (entity.powerInputKw ?? 0) > EPSILON) return { code: "running", label: "蓄电器充电中", tone: "running" };
    if (!charging && (entity.powerOutputKw ?? 0) > EPSILON) return { code: "running", label: "蓄电器放电中", tone: "running" };
    return { code: "grid-standby", label: charging ? "等待电网富余" : "电网暂无缺口", tone: "idle" };
  }

  if (entity.kind === "power") return { code: "running", label: "持续发电", tone: "running" };

  if (entity.kind === "station") {
    if (entity.buildingId === "orbital_collector") {
      const itemId = entity.storedItemId === "deuterium" || entity.storedItemId === "fire_ice"
        ? entity.storedItemId
        : "hydrogen";
      const capacity = getBuilding("orbital_collector").outputCapacity * Math.max(1, entity.machineCount);
      if ((entity.outputs[itemId] ?? 0) >= capacity - EPSILON) {
        return { code: "output-blocked", label: `${ITEMS[itemId].name}储量已满`, tone: "blocked" };
      }
      return { code: "collecting", label: `轨道采集${ITEMS[itemId].name}中`, tone: "running" };
    }
    if (!entity.storedItemId) return { code: "unconfigured", label: "未选择物流货物", tone: "blocked" };
    if (!entity.stationMode) return { code: "unconfigured", label: "未设置供需模式", tone: "blocked" };
    const planetary = entity.buildingId === "planetary_logistics_station";
    const peer = planetary ? findPlanetaryPeer(state, entity) : findInterstellarPeer(state, entity);
    if (!peer) {
      return {
        code: "missing-route",
        label: entity.stationMode === "supply"
          ? planetary ? "等待本地需求站" : "等待异星需求站"
          : planetary ? "等待本地供应站" : "等待异星供应站",
        tone: "blocked",
      };
    }
    const supply = entity.stationMode === "supply" ? entity : peer;
    const demand = entity.stationMode === "demand" ? entity : peer;
    const itemId = entity.storedItemId;
    const stationBuildingId = planetary ? "planetary_logistics_station" : "interstellar_logistics_station";
    const capacity = getBuilding(stationBuildingId).outputCapacity * Math.max(1, demand.machineCount);
    const free = Math.floor(Math.max(0, capacity - (demand.outputs[itemId] ?? 0)) + EPSILON);
    const minimumCargo = getStationMinimumCargo(demand);
    if (planetary) {
      const drones = Math.min(getStationDroneCapacity(demand), Math.max(0, Math.floor(demand.stationDrones ?? 0)));
      if (drones < 1) return { code: "missing-drone", label: "缺少物流运输机", tone: "blocked" };
    }
    const vessels = Math.min(getStationVesselCapacity(demand), Math.max(0, Math.floor(demand.stationVessels ?? 0)));
    if (!planetary && stationRouteRequiresWarp(demand, supply) &&
      (!demand.stationWarpEnabled || !isTechnologyCompleted(state, "space_warp") || (demand.stationWarpers ?? 0) < 1)) {
      return { code: "missing-warper", label: "跨恒星航线缺少空间翘曲器", tone: "blocked" };
    }
    if (!planetary && vessels < 1) {
      return { code: "missing-vessel", label: "缺少物流运输船", tone: "blocked" };
    }
    if (free < minimumCargo) {
      return { code: "output-blocked", label: `${planetary ? "本地" : "异星"}需求站空位不足 ${minimumCargo} 件`, tone: "blocked" };
    }
    if ((supply.outputs[itemId] ?? 0) < minimumCargo) {
      return { code: "waiting-load", label: `等待货物达到 ${minimumCargo} 件`, tone: "idle" };
    }
    const routePower = planetary
      ? planetMetrics.powerFactor
      : Math.min(planetMetrics.powerFactor, getPlanetMetrics(state, peer.planetId).powerFactor);
    if (routePower <= EPSILON) return { code: "no-power", label: "航线一侧电网断电", tone: "blocked" };
    if (routePower < 0.999) {
      return { code: "low-power", label: `航线供电不足 · ${Math.round(routePower * 100)}%`, tone: "warning" };
    }
    return {
      code: "running",
      label: planetary ? "运输机配送中" : `运输船航行中 · ${getPlanet(peer.planetId).name}`,
      tone: "running",
    };
  }

  if (entity.kind === "storage" || entity.kind === "splitter") {
    if (!entity.storedItemId) return { code: "unconfigured", label: "未选择物流物品", tone: "blocked" };
    const flowing = state.belts.some((belt) => (belt.source === entity.id || belt.target === entity.id) && belt.lastFlow > 0.001);
    if (flowing) return { code: "running", label: "物流运行中", tone: "running" };
    const buffered = (entity.inputs[entity.storedItemId] ?? 0) + (entity.outputs[entity.storedItemId] ?? 0);
    return buffered > 0
      ? { code: "idle", label: "等待下游取货", tone: "idle" }
      : { code: "missing-input", label: "等待物料", tone: "idle" };
  }

  const recipe = getRecipe(entity.recipeId);
  if (!recipe) return { code: "missing-recipe", label: "未选择配方", tone: "blocked" };
  if (recipe.requiredTechId && !isTechnologyCompleted(state, recipe.requiredTechId)) {
    return { code: "missing-recipe", label: "配方科技未解锁", tone: "blocked" };
  }
  if (recipe.id === "matrix_research" && !state.research.selectedTechId) {
    return { code: "missing-research", label: "未选择研究科技", tone: "blocked" };
  }

  if (entity.buildingId === "ray_receiver") {
    const capacity = getBuilding("ray_receiver").outputCapacity * Math.max(1, entity.machineCount);
    const blocked = recipe.outputs.some((output) =>
      capacity - (entity.outputs[output.itemId] ?? 0) + EPSILON < output.amount);
    if (blocked) return { code: "output-blocked", label: "临界光子缓存已满", tone: "blocked" };
    const ratedKw = RAY_RECEIVER_CAPACITY_KW * entity.machineCount;
    const receivedKw = Math.max(0, entity.powerOutputKw ?? 0);
    if (totalDysonGenerationKw(state) <= EPSILON || receivedKw <= EPSILON) {
      return { code: "missing-dyson-swarm", label: "等待戴森系统能量", tone: "blocked" };
    }
    const reception = ratedKw > EPSILON ? receivedKw / ratedKw : 0;
    if (reception < 0.999) {
      return { code: "low-power", label: `戴森云接收率 · ${Math.round(reception * 100)}%`, tone: "warning" };
    }
    return recipe.id === "ray_power"
      ? { code: "running", label: `向电网输出 ${receivedKw.toFixed(0)} kW`, tone: "running" }
      : { code: "running", label: "临界光子生成中", tone: "running" };
  }

  if (entity.buildingId) {
    const capacity = getBuilding(entity.buildingId).outputCapacity * Math.max(1, entity.machineCount);
    const extraProductBonus = getEntityExtraProductBonus(entity);
    const blocked = recipe.outputs.filter((output) => {
      const bonus = Math.floor((entity.proliferatorBonusProgress?.[output.itemId] ?? 0) +
        output.amount * extraProductBonus + EPSILON);
      return capacity - (entity.outputs[output.itemId] ?? 0) + EPSILON < output.amount + bonus;
    });
    if (blocked.length > 0) {
      return { code: "output-blocked", label: `输出堵塞：${blocked.map((output) => ITEMS[output.itemId].name).join("、")}`, tone: "blocked" };
    }
  }

  const requirements = recipe.id === "matrix_research"
    ? remainingResearchCosts(state).map((cost) => ({ itemId: cost.itemId, amount: 1 }))
    : recipe.inputs;
  const missing = requirements.filter((input) => (entity.inputs[input.itemId] ?? 0) + EPSILON < input.amount);
  if (missing.length > 0) {
    return { code: "missing-input", label: `缺少${missing.map((input) => ITEMS[input.itemId].name).join("、")}`, tone: "blocked" };
  }

  if (proliferatorApplies(entity, recipe) && Math.floor(availableProliferatorCycles(entity, recipe) + EPSILON) < 1) {
    const itemId = getEntityProliferatorItemId(entity)!;
    return { code: "missing-proliferator", label: `缺少${ITEMS[itemId].name}`, tone: "blocked" };
  }

  if (planetMetrics.powerFactor <= EPSILON) return { code: "no-power", label: "电网断电", tone: "blocked" };
  if (planetMetrics.powerFactor < 0.999) {
    return { code: "low-power", label: `供电不足 · ${Math.round(planetMetrics.powerFactor * 100)}%`, tone: "warning" };
  }
  return { code: "running", label: "运行中", tone: "running" };
}

export function getAcceptedInputs(entity: FactoryEntity, state?: GameState): ItemId[] {
  if ((entity.kind === "storage" || entity.kind === "splitter" || entity.kind === "station") && entity.storedItemId) return [entity.storedItemId];
  if (entity.buildingId === "thermal_power_plant" && entity.fuelItemId) return [entity.fuelItemId];
  if (entity.recipeId === "matrix_research" && state) return remainingResearchCosts(state).map((cost) => cost.itemId);
  const recipeInputs = getRecipe(entity.recipeId)?.inputs.map((input) => input.itemId) ?? [];
  const proliferatorItemId = entity.sprayCoaterInstalled ? getEntityProliferatorItemId(entity) : undefined;
  return proliferatorItemId ? [...recipeInputs, proliferatorItemId] : recipeInputs;
}

export function getProducedOutputs(entity: FactoryEntity): ItemId[] {
  if (entity.kind === "vein" && entity.resourceId) return [entity.resourceId];
  if ((entity.kind === "storage" || entity.kind === "splitter" || entity.kind === "station") && entity.storedItemId) return [entity.storedItemId];
  return getRecipe(entity.recipeId)?.outputs.map((output) => output.itemId) ?? [];
}
