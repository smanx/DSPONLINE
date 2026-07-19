import type { XYPosition } from "@xyflow/react";

export type PlanetId = "home" | "ashen";

export type ItemId =
  | "iron_ore"
  | "copper_ore"
  | "coal"
  | "stone"
  | "crude_oil"
  | "silicon_ore"
  | "titanium_ore"
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
  | "logistics_vessel"
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
  | "high_efficiency_plasma_control"
  | "energy_matrix"
  | "xray_cracking"
  | "high_strength_crystal"
  | "basic_chemical_engineering"
  | "polymer_chemistry"
  | "structure_matrix"
  | "titanium_alloy"
  | "processor"
  | "interstellar_logistics"
  | "nanomaterials"
  | "information_matrix"
  | "research_speed_1"
  | "miniature_particle_collider"
  | "quantum_chip"
  | "gravity_matrix"
  | "research_speed_2"
  | "dyson_swarm"
  | "ray_receiver"
  | "antimatter"
  | "universe_matrix"
  | "research_speed_3"
  | "high_speed_assembling"
  | "high_speed_logistics"
  | "mining_speed_1"
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
  | "thermal_power_plant"
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
  | "miniature_particle_collider"
  | "em_rail_ejector"
  | "ray_receiver"
  | "vertical_launching_silo"
  | "interstellar_logistics_station"
  | "storage_mk1"
  | "storage_tank"
  | "splitter_4way";

export type BeltTier = 1 | 2 | 3;
export type ProliferatorTier = 1 | 2 | 3;
export type ProliferatorMode = "normal" | "extra" | "speed";
export type ConveyorBeltId = "conveyor_belt_mk1" | "conveyor_belt_mk2" | "conveyor_belt_mk3";
export type ConstructionId = BuildingId | ConveyorBeltId;

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
  | "logistics_vessel"
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
  speed: number;
  inputCapacity: number;
  outputCapacity: number;
  accepts?: "solid" | "fluid" | "any";
  tier?: BeltTier;
  family?: "smelter" | "assembler";
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
  stationMode?: "supply" | "demand";
  stationProgress?: number;
  stationTrips?: number;
  stationLastTransfer?: number;
  stationPeerId?: string;
  stationVessels?: number;
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
  thermalGenerationKw: number;
  rayGenerationKw: number;
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
    | "waiting-load"
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

export interface GameState {
  version: 9;
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
  elapsedSeconds: number;
  metrics: FactoryMetrics;
  planetMetrics: Record<PlanetId, FactoryMetrics>;
  dysonSwarm: DysonSwarmState;
  dysonSphere: DysonSphereState;
  paused: boolean;
}

export interface SimulationResult {
  state: GameState;
  completedItems: Partial<Record<ItemId, number>>;
}
