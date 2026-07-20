import type { XYPosition } from "@xyflow/react";

export type StarSystemId = "helios" | "borealis" | "neutron";
export type PlanetId = "home" | "ashen" | "giant" | "frost" | "boreal_giant" | "magnetar";

export type ItemId =
  | "iron_ore"
  | "copper_ore"
  | "coal"
  | "stone"
  | "crude_oil"
  | "silicon_ore"
  | "titanium_ore"
  | "fire_ice"
  | "kimberlite_ore"
  | "fractal_silicon"
  | "optical_grating_crystal"
  | "spiniform_stalagmite_crystal"
  | "unipolar_magnet"
  | "water"
  | "sulfuric_acid"
  | "iron_ingot"
  | "copper_ingot"
  | "magnet"
  | "stone_brick"
  | "glass"
  | "steel"
  | "gear"
  | "magnetic_coil"
  | "circuit_board"
  | "prism"
  | "plasma_exciter"
  | "energetic_graphite"
  | "refined_oil"
  | "hydrogen"
  | "high_purity_silicon"
  | "titanium_ingot"
  | "titanium_alloy"
  | "microcrystalline_component"
  | "processor"
  | "logistics_drone"
  | "logistics_vessel"
  | "space_warper"
  | "accumulator"
  | "charged_accumulator"
  | "graphene"
  | "carbon_nanotube"
  | "proliferator_mk1"
  | "proliferator_mk2"
  | "proliferator_mk3"
  | "crystal_silicon"
  | "particle_broadband"
  | "electric_motor"
  | "electromagnetic_turbine"
  | "super_magnetic_ring"
  | "particle_container"
  | "deuterium"
  | "hydrogen_fuel_rod"
  | "deuteron_fuel_rod"
  | "titanium_glass"
  | "casimir_crystal"
  | "plane_filter"
  | "quantum_chip"
  | "strange_matter"
  | "graviton_lens"
  | "photon_combiner"
  | "solar_sail"
  | "critical_photon"
  | "antimatter"
  | "annihilation_constraint_sphere"
  | "antimatter_fuel_rod"
  | "frame_material"
  | "dyson_sphere_component"
  | "small_carrier_rocket"
  | "diamond"
  | "plastic"
  | "organic_crystal"
  | "titanium_crystal"
  | "electromagnetic_matrix"
  | "energy_matrix"
  | "structure_matrix"
  | "information_matrix"
  | "gravity_matrix"
  | "universe_matrix";

export type TechId =
  | "electromagnetic_matrix"
  | "electromagnetism"
  | "automatic_metallurgy"
  | "basic_assembling"
  | "basic_logistics"
  | "thermal_power"
  | "solar_energy"
  | "energy_storage"
  | "geothermal_power"
  | "fractionation"
  | "high_efficiency_plasma_control"
  | "energy_matrix"
  | "xray_cracking"
  | "high_strength_crystal"
  | "basic_chemical_engineering"
  | "polymer_chemistry"
  | "structure_matrix"
  | "titanium_alloy"
  | "processor"
  | "planetary_logistics"
  | "interstellar_logistics"
  | "orbital_collection"
  | "space_warp"
  | "stellar_exploration"
  | "nanomaterials"
  | "rare_resource_utilization"
  | "quantum_chemical_engineering"
  | "information_matrix"
  | "research_speed_1"
  | "miniature_particle_collider"
  | "fusion_power"
  | "quantum_chip"
  | "gravity_matrix"
  | "research_speed_2"
  | "dyson_swarm"
  | "ray_receiver"
  | "antimatter"
  | "artificial_star"
  | "universe_matrix"
  | "research_speed_3"
  | "high_speed_assembling"
  | "high_speed_logistics"
  | "mining_speed_1"
  | "mining_speed_2"
  | "mining_speed_3"
  | "logistics_engine_1"
  | "logistics_engine_2"
  | "logistics_capacity_1"
  | "logistics_capacity_2"
  | "solar_sail_life_1"
  | "solar_sail_life_2"
  | "ray_transmission_1"
  | "ray_transmission_2"
  | "dyson_absorption_1"
  | "plane_smelting"
  | "quantum_printing"
  | "super_magnetic_logistics"
  | "proliferator_1"
  | "proliferator_2"
  | "proliferator_3"
  | "dyson_sphere_program"
  | "vertical_launching_silo"
  | "dyson_shell";

export type BuildingId =
  | "wind_turbine"
  | "solar_panel"
  | "geothermal_power_station"
  | "thermal_power_plant"
  | "mini_fusion_power_plant"
  | "artificial_star"
  | "accumulator"
  | "energy_exchanger"
  | "mining_machine"
  | "arc_smelter"
  | "plane_smelter"
  | "assembling_machine_mk1"
  | "assembling_machine_mk2"
  | "assembling_machine_mk3"
  | "spray_coater"
  | "matrix_lab"
  | "oil_extractor"
  | "oil_refinery"
  | "water_pump"
  | "chemical_plant"
  | "quantum_chemical_plant"
  | "fractionator"
  | "miniature_particle_collider"
  | "em_rail_ejector"
  | "ray_receiver"
  | "vertical_launching_silo"
  | "planetary_logistics_station"
  | "interstellar_logistics_station"
  | "orbital_collector"
  | "storage_mk1"
  | "storage_tank"
  | "splitter_4way";

export type BeltTier = 1 | 2 | 3;
export type SorterTier = 1 | 2 | 3;
export type ProliferatorTier = 1 | 2 | 3;
export type ProliferatorMode = "normal" | "extra" | "speed";
export type ConveyorBeltId = "conveyor_belt_mk1" | "conveyor_belt_mk2" | "conveyor_belt_mk3";
export type SorterId = "sorter_mk1" | "sorter_mk2" | "sorter_mk3";
export type ConstructionId = BuildingId | ConveyorBeltId | SorterId;

export type RecipeId =
  | "iron_ingot"
  | "copper_ingot"
  | "magnet"
  | "stone_brick"
  | "glass"
  | "steel"
  | "gear"
  | "magnetic_coil"
  | "circuit_board"
  | "prism"
  | "plasma_exciter"
  | "energetic_graphite"
  | "plasma_refining"
  | "xray_cracking"
  | "high_purity_silicon"
  | "silicon_ore_from_stone"
  | "titanium_ingot"
  | "sulfuric_acid"
  | "titanium_alloy"
  | "microcrystalline_component"
  | "processor"
  | "logistics_drone"
  | "logistics_vessel"
  | "space_warper"
  | "accumulator"
  | "accumulator_charge"
  | "accumulator_discharge"
  | "hydrogen_fuel_rod"
  | "deuterium_fractionation"
  | "graphene_from_fire_ice"
  | "diamond_from_kimberlite"
  | "crystal_silicon_from_fractal"
  | "photon_combiner_from_grating"
  | "casimir_crystal_advanced"
  | "carbon_nanotube_from_spiniform"
  | "particle_container_from_unipolar"
  | "graphene"
  | "carbon_nanotube"
  | "proliferator_mk1"
  | "proliferator_mk2"
  | "proliferator_mk3"
  | "crystal_silicon"
  | "particle_broadband"
  | "electric_motor"
  | "electromagnetic_turbine"
  | "super_magnetic_ring"
  | "particle_container"
  | "deuterium"
  | "deuteron_fuel_rod"
  | "titanium_glass"
  | "casimir_crystal"
  | "plane_filter"
  | "quantum_chip"
  | "strange_matter"
  | "graviton_lens"
  | "photon_combiner"
  | "solar_sail"
  | "solar_sail_launch"
  | "ray_power"
  | "critical_photon"
  | "antimatter"
  | "annihilation_constraint_sphere"
  | "antimatter_fuel_rod"
  | "frame_material"
  | "dyson_sphere_component"
  | "small_carrier_rocket"
  | "carrier_rocket_launch"
  | "diamond"
  | "plastic"
  | "organic_crystal"
  | "titanium_crystal"
  | "electromagnetic_matrix"
  | "energy_matrix"
  | "structure_matrix"
  | "information_matrix"
  | "gravity_matrix"
  | "universe_matrix"
  | "matrix_research";

export type EntityKind = "vein" | "machine" | "power" | "storage" | "splitter" | "station";
export type PlacementCount = 1 | 2 | 5 | 10;
export type StationMinimumLoad = 0.1 | 0.25 | 0.5 | 1;
export type EnergyMode = "auto" | "charge" | "discharge";
export type SimulationSpeed = 1 | 2 | 4;
export type AutosaveIntervalSeconds = 2 | 10 | 30;

export type AchievementId =
  | "first_manual_mine"
  | "automated_mining"
  | "first_logistics_line"
  | "stable_power_grid"
  | "electromagnetic_matrix_online"
  | "energy_matrix_online"
  | "six_matrix_mastery"
  | "planetary_logistics_online"
  | "interstellar_delivery"
  | "rare_resource_harvest"
  | "dyson_swarm_online"
  | "permanent_dyson_structure"
  | "multi_system_industry";

export type CampaignChapterId =
  | "foundation"
  | "blue_matrix"
  | "red_matrix"
  | "planetary_logistics"
  | "interstellar_logistics"
  | "matrix_mastery"
  | "dyson_program";

export type CampaignTaskId =
  | "mine_first_ore"
  | "smelt_iron"
  | "deploy_miner"
  | "lay_first_belt"
  | "deploy_matrix_lab"
  | "produce_blue_matrix"
  | "refine_oil"
  | "produce_plastic"
  | "produce_red_matrix"
  | "deploy_planetary_station"
  | "complete_planetary_trip"
  | "produce_structure_matrix"
  | "unlock_borealis"
  | "deploy_interstellar_station"
  | "complete_interstellar_trip"
  | "produce_information_matrix"
  | "produce_gravity_matrix"
  | "produce_universe_matrix"
  | "launch_solar_sail"
  | "launch_carrier_rocket"
  | "build_dyson_structure"
  | "absorb_shell_sail"
  | "side_storage"
  | "side_stable_power"
  | "side_belt_upgrade"
  | "side_rare_resource"
  | "side_spray_coater"
  | "side_blueprint";

export interface CampaignState {
  activeChapterId: CampaignChapterId;
  activeTaskId: CampaignTaskId | null;
  completedTaskIds: CampaignTaskId[];
  rewardedTaskIds: CampaignTaskId[];
}

export interface ItemAmount {
  itemId: ItemId;
  amount: number;
}

export interface ItemDefinition {
  id: ItemId;
  name: string;
  symbol: string;
  color: string;
  kind: "solid" | "fluid" | "matrix";
  description: string;
}

export interface PlanetDefinition {
  id: PlanetId;
  name: string;
  code: string;
  color: string;
  environment: string;
  resources: string;
  kind: "terrestrial" | "gas-giant";
  systemId: StarSystemId;
  orbitIndex: number;
  solarMultiplier: number;
  orbitalYields?: Partial<Record<ItemId, number>>;
}

export interface StarSystemDefinition {
  id: StarSystemId;
  name: string;
  code: string;
  starType: string;
  color: string;
  distanceLy: number;
  description: string;
  planetIds: PlanetId[];
  explorationCost: ItemAmount[];
  requiredTechId?: TechId;
  prerequisiteSystemId?: StarSystemId;
}

export interface RecipeDefinition {
  id: RecipeId;
  name: string;
  buildingId: BuildingId;
  duration: number;
  inputs: ItemAmount[];
  outputs: ItemAmount[];
  requiredTechId?: TechId;
}

export interface BuildingDefinition {
  id: BuildingId;
  name: string;
  shortName: string;
  kind: "machine" | "miner" | "power" | "storage" | "splitter" | "station";
  powerDemandKw?: number;
  powerGenerationKw?: number;
  powerChargeKw?: number;
  energyCapacityMj?: number;
  speed: number;
  inputCapacity: number;
  outputCapacity: number;
  accepts?: "solid" | "fluid" | "any";
  tier?: BeltTier;
  family?: "smelter" | "assembler" | "chemical";
  description: string;
}

export interface ConstructionDefinition {
  buildingId: ConstructionId;
  name: string;
  outputAmount: number;
  costs: ItemAmount[];
  requiredTechId?: TechId;
}

export interface TechnologyDefinition {
  id: TechId;
  name: string;
  summary: string;
  costs: ItemAmount[];
  tier: number;
  prerequisites: TechId[];
  unlocks: string[];
}

export interface FactoryEntity {
  id: string;
  kind: EntityKind;
  planetId: PlanetId;
  position: XYPosition;
  resourceId?: ItemId;
  buildingId?: BuildingId;
  extractorBuildingId?: BuildingId;
  recipeId?: RecipeId;
  storedItemId?: ItemId;
  distributionMode?: "balanced" | "priority";
  fuelItemId?: ItemId;
  fuelRemainingMj?: number;
  powerOutputKw?: number;
  powerInputKw?: number;
  storedEnergyMj?: number;
  energyMode?: EnergyMode;
  stationMode?: "supply" | "demand";
  stationProgress?: number;
  stationTrips?: number;
  stationLastTransfer?: number;
  stationPeerId?: string;
  stationDrones?: number;
  stationVessels?: number;
  stationWarpers?: number;
  stationWarpEnabled?: boolean;
  stationMinimumLoad?: StationMinimumLoad;
  sprayCoaterInstalled?: boolean;
  proliferatorTier?: ProliferatorTier;
  proliferatorMode?: ProliferatorMode;
  proliferatorPoints?: number;
  proliferatorBonusProgress?: Partial<Record<ItemId, number>>;
  routingCursor: number;
  machineCount: number;
  minerCount: number;
  inputs: Partial<Record<ItemId, number>>;
  outputs: Partial<Record<ItemId, number>>;
  progress: number;
  utilization: number;
  productionRate: number;
}

export interface BeltConnection {
  id: string;
  planetId: PlanetId;
  source: string;
  target: string;
  itemId: ItemId;
  lanes: number;
  tier: BeltTier;
  sorterTier: SorterTier;
  progress: number;
  priority: 0 | 1;
  lastFlow: number;
}

export type DraggedItemSourceKind = "node" | "node-input" | "tray";

export interface CargoStack {
  itemId: ItemId;
  amount: number;
  origin?: { kind: "node-output" | "node-input" | "tray"; id?: string };
}

export interface FactoryMetrics {
  generationKw: number;
  demandKw: number;
  powerFactor: number;
  windGenerationKw: number;
  solarGenerationKw: number;
  geothermalGenerationKw: number;
  thermalGenerationKw: number;
  fusionGenerationKw: number;
  artificialStarGenerationKw: number;
  rayGenerationKw: number;
  storageDischargeKw: number;
  storageChargeKw: number;
  storedEnergyMj: number;
  storageCapacityMj: number;
  fuelReserveSeconds: number;
  totalItemsPerMinute: number;
}

export interface DysonSwarmState {
  sailsInOrbit: number;
  totalLaunched: number;
  totalExpired: number;
  decayProgress: number;
  generationKw: number;
  receiverLoadKw: number;
}

export interface DysonSphereState {
  structurePoints: number;
  totalRocketsLaunched: number;
  shellSails: number;
  totalSailsAbsorbed: number;
  absorptionProgress: number;
  generationKw: number;
}

export interface DysonNodeState {
  id: string;
  angle: number;
  requiredStructurePoints: number;
  completedStructurePoints: number;
}

export interface DysonFrameState {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  requiredStructurePoints: number;
  completedStructurePoints: number;
}

export interface DysonShellState {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  boundaryFrameIds: string[];
  sailCapacity: number;
  absorbedSails: number;
}

export interface DysonLayerState {
  id: string;
  name: string;
  radius: number;
  inclination: number;
  longitude: number;
  nodes: DysonNodeState[];
  frames: DysonFrameState[];
  shells: DysonShellState[];
}

export interface DysonSpherePlanState {
  systemId: StarSystemId;
  activeLayerId: string | null;
  structurePoints: number;
  shellSails: number;
  layers: DysonLayerState[];
}

export interface EntityOperatingStatus {
  code:
    | "running"
    | "idle"
    | "paused"
    | "missing-recipe"
    | "missing-research"
    | "missing-input"
    | "output-blocked"
    | "no-power"
    | "low-power"
    | "missing-fuel"
    | "missing-proliferator"
    | "no-fuel-selected"
    | "grid-standby"
    | "missing-route"
    | "missing-vessel"
    | "missing-drone"
    | "missing-warper"
    | "waiting-load"
    | "collecting"
    | "missing-dyson-swarm"
    | "unconfigured";
  label: string;
  tone: "running" | "warning" | "blocked" | "idle";
}

export interface ResearchState {
  selectedTechId: TechId | null;
  queuedTechIds: TechId[];
  progressByTech: Partial<Record<TechId, Partial<Record<ItemId, number>>>>;
  completedTechIds: TechId[];
}

export interface ExplorationState {
  unlockedSystemIds: StarSystemId[];
}

export interface GameSettings {
  simulationSpeed: SimulationSpeed;
  performanceMode: boolean;
  reducedMotion: boolean;
  soundEnabled: boolean;
  autosaveIntervalSeconds: AutosaveIntervalSeconds;
}

export interface AchievementState {
  unlockedIds: AchievementId[];
}

export interface BlueprintEntityTemplate {
  key: string;
  buildingId: BuildingId;
  offset: XYPosition;
  machineCount: number;
  recipeId?: RecipeId;
  storedItemId?: ItemId;
  distributionMode?: "balanced" | "priority";
  fuelItemId?: ItemId;
  energyMode?: EnergyMode;
  stationMode?: "supply" | "demand";
  stationMinimumLoad?: StationMinimumLoad;
  stationWarpEnabled?: boolean;
  sprayCoaterInstalled?: boolean;
  proliferatorTier?: ProliferatorTier;
  proliferatorMode?: ProliferatorMode;
}

export interface BlueprintBeltTemplate {
  key: string;
  sourceKey: string;
  targetKey: string;
  itemId: ItemId;
  lanes: number;
  tier: BeltTier;
  sorterTier: SorterTier;
  priority: 0 | 1;
}

export interface BlueprintDefinition {
  id: string;
  name: string;
  entities: BlueprintEntityTemplate[];
  belts: BlueprintBeltTemplate[];
}

export interface GameState {
  version: 18;
  nextId: number;
  activePlanetId: PlanetId;
  entities: FactoryEntity[];
  belts: BeltConnection[];
  cargo: CargoStack | null;
  tray: Partial<Record<ItemId, number>>;
  planetTrays: Record<PlanetId, Partial<Record<ItemId, number>>>;
  construction: Partial<Record<ConstructionId, number>>;
  manualMined: number;
  totalProduced: Partial<Record<ItemId, number>>;
  research: ResearchState;
  exploration: ExplorationState;
  settings: GameSettings;
  achievements: AchievementState;
  campaign: CampaignState;
  blueprints: BlueprintDefinition[];
  elapsedSeconds: number;
  metrics: FactoryMetrics;
  planetMetrics: Record<PlanetId, FactoryMetrics>;
  dysonSwarm: DysonSwarmState;
  dysonSphere: DysonSphereState;
  dysonPlans: Record<StarSystemId, DysonSpherePlanState>;
  paused: boolean;
}

export interface SimulationResult {
  state: GameState;
  completedItems: Partial<Record<ItemId, number>>;
}
