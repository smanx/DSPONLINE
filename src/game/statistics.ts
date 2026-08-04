import { FUEL_ENERGY_MJ, ITEMS, PLANET_LIST, getBuilding, getExtractorBuildingId, getFuelEfficiency, getFuelItemIdsForBuilding, getProliferator, getRecipe, getTechnology } from "./content";
import { getEntityExtraProductBonus, getEntityOperatingStatus, getEntityProliferatorItemId, getEntityProliferatorPowerMultiplier, getEntityProliferatorSpeedMultiplier, getProliferatorSprayCost, getRecipeSpeedMultiplier } from "./engine";
import { getInfiniteResearchDefinition } from "./endgame";
import { getPlanetIndustrialProfile, specializationApplies } from "./galaxy";
import type { EntityOperatingStatus, FactoryEntity, GameState, ItemId, PlanetId } from "./types";

export interface ItemStatistics {
  itemId: ItemId;
  productionPerMinute: number;
  consumptionPerMinute: number;
  netPerMinute: number;
  inventory: number;
  producerCount: number;
  consumerCount: number;
  blockedProducerCount: number;
}

export interface EquipmentIssue {
  entityId: string;
  equipmentName: string;
  processName: string;
  status: EntityOperatingStatus;
}

export interface PowerConsumerStatistics {
  entityId: string;
  equipmentName: string;
  ratedDemandKw: number;
  activeDemandKw: number;
  status: EntityOperatingStatus;
}

export interface FactoryStatistics {
  items: ItemStatistics[];
  issues: EquipmentIssue[];
  powerConsumers: PowerConsumerStatistics[];
  totalProductionPerMinute: number;
  totalConsumptionPerMinute: number;
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function equipmentName(entity: FactoryEntity): string {
  if (entity.kind === "vein") {
    const extractorId = getExtractorBuildingId(entity.resourceId!);
    return getBuilding(extractorId).name;
  }
  return entity.buildingId ? getBuilding(entity.buildingId).name : "未知设备";
}

function processName(entity: FactoryEntity, state: GameState): string {
  if (entity.kind === "vein" && entity.resourceId) return ITEMS[entity.resourceId].name;
  if (entity.buildingId && getFuelItemIdsForBuilding(entity.buildingId).length > 0) {
    return entity.fuelItemId ? `燃烧${ITEMS[entity.fuelItemId].name}` : "未选择燃料";
  }
  if (entity.buildingId === "accumulator") return "自动充放电";
  if (entity.buildingId === "energy_exchanger") return entity.energyMode === "discharge" ? "满蓄电器放电" : "空蓄电器充电";
  if (entity.kind === "storage" || entity.kind === "splitter") {
    return entity.storedItemId ? ITEMS[entity.storedItemId].name : "未配置物流物品";
  }
  if (entity.kind === "station") {
    return entity.storedItemId ? `${entity.stationMode === "demand" ? "需求" : "供应"}${ITEMS[entity.storedItemId].name}` : "未配置星际货物";
  }
  if (entity.recipeId === "matrix_research") return getTechnology(state.research.selectedTechId)?.name ?? getInfiniteResearchDefinition(state.endgame?.activeInfiniteResearchId)?.name ?? "科研模式";
  return getRecipe(entity.recipeId)?.name ?? "未选择配方";
}

function isDeployedDevice(entity: FactoryEntity): boolean {
  if (entity.kind === "vein") return entity.minerCount > 0;
  return entity.machineCount > 0;
}

class FactoryStatisticsAccumulator {
  private readonly selectedPlanetId: PlanetId | null;
  private readonly records = new Map<ItemId, ItemStatistics>();
  private readonly issues: EquipmentIssue[] = [];
  private readonly powerConsumers: PowerConsumerStatistics[] = [];

  constructor(private readonly state: GameState, planetScope: PlanetId | "all") {
    this.selectedPlanetId = planetScope === "all" ? null : planetScope;
  }

  includes(entity: FactoryEntity): boolean {
    return !this.selectedPlanetId || entity.planetId === this.selectedPlanetId;
  }

  private recordFor(itemId: ItemId): ItemStatistics {
    const existing = this.records.get(itemId);
    if (existing) return existing;
    const created: ItemStatistics = {
      itemId,
      productionPerMinute: 0,
      consumptionPerMinute: 0,
      netPerMinute: 0,
      inventory: 0,
      producerCount: 0,
      consumerCount: 0,
      blockedProducerCount: 0,
    };
    this.records.set(itemId, created);
    return created;
  }

  addTrayInventory(): void {
    for (const planet of PLANET_LIST) {
      if (this.selectedPlanetId && planet.id !== this.selectedPlanetId) continue;
      const tray = planet.id === this.state.activePlanetId ? this.state.tray : this.state.planetTrays[planet.id];
      for (const [itemId, amount] of Object.entries(tray) as Array<[ItemId, number]>) {
        this.recordFor(itemId).inventory += Math.floor(amount ?? 0);
      }
    }
    if (this.state.cargo && (!this.selectedPlanetId || this.selectedPlanetId === this.state.activePlanetId)) {
      this.recordFor(this.state.cargo.itemId).inventory += Math.floor(this.state.cargo.amount);
    }
  }

  addEntityInventory(entity: FactoryEntity): void {
    for (const [itemId, amount] of Object.entries(entity.inputs) as Array<[ItemId, number]>) {
      this.recordFor(itemId).inventory += Math.floor(amount ?? 0);
    }
    for (const [itemId, amount] of Object.entries(entity.outputs) as Array<[ItemId, number]>) {
      this.recordFor(itemId).inventory += Math.floor(amount ?? 0);
    }
  }

  addEntityMetrics(entity: FactoryEntity): void {
    const status = getEntityOperatingStatus(this.state, entity);
    if (isDeployedDevice(entity) && (status.tone === "blocked" || status.tone === "warning")) {
      this.issues.push({
        entityId: entity.id,
        equipmentName: equipmentName(entity),
        processName: processName(entity, this.state),
        status,
      });
    }

    if (entity.kind === "vein" && entity.resourceId && entity.minerCount > 0) {
      const output = this.recordFor(entity.resourceId);
      output.productionPerMinute += entity.productionRate;
      output.producerCount += 1;
      if (status.tone === "blocked") output.blockedProducerCount += 1;
      const extractorId = getExtractorBuildingId(entity.resourceId);
      const ratedDemandKw = (getBuilding(extractorId).powerDemandKw ?? 0) * entity.minerCount;
      const demanding = ["running", "low-power", "no-power"].includes(status.code);
      if (!this.selectedPlanetId || entity.planetId === this.selectedPlanetId) {
        this.powerConsumers.push({
          entityId: entity.id,
          equipmentName: getBuilding(extractorId).name,
          ratedDemandKw,
          activeDemandKw: demanding ? ratedDemandKw : 0,
          status,
        });
      }
      return;
    }

    if (entity.buildingId && entity.fuelItemId && getFuelItemIdsForBuilding(entity.buildingId).includes(entity.fuelItemId)) {
      const energyMj = FUEL_ENERGY_MJ[entity.fuelItemId] ?? 0;
      const consumption = energyMj > 0
        ? (entity.powerOutputKw ?? 0) * 60 / (1000 * getFuelEfficiency(entity.buildingId) * energyMj)
        : 0;
      const fuel = this.recordFor(entity.fuelItemId);
      fuel.consumptionPerMinute += consumption;
      fuel.consumerCount += 1;
      return;
    }

    if (entity.kind === "power" && (entity.buildingId === "accumulator" || entity.buildingId === "energy_exchanger")) {
      const building = getBuilding(entity.buildingId);
      if (!this.selectedPlanetId || entity.planetId === this.selectedPlanetId) {
        this.powerConsumers.push({
          entityId: entity.id,
          equipmentName: building.name,
          ratedDemandKw: (building.powerChargeKw ?? 0) * entity.machineCount,
          activeDemandKw: entity.powerInputKw ?? 0,
          status,
        });
      }
      if (entity.buildingId === "energy_exchanger") {
        const recipe = getRecipe(entity.recipeId);
        for (const input of recipe?.inputs ?? []) {
          const record = this.recordFor(input.itemId);
          record.consumptionPerMinute += entity.productionRate * input.amount;
          record.consumerCount += 1;
        }
        for (const output of recipe?.outputs ?? []) {
          const record = this.recordFor(output.itemId);
          record.productionPerMinute += entity.productionRate * output.amount;
          record.producerCount += 1;
        }
      }
      return;
    }

    if (entity.buildingId === "orbital_collector" && entity.storedItemId) {
      const output = this.recordFor(entity.storedItemId);
      output.productionPerMinute += entity.productionRate;
      output.producerCount += 1;
      if (status.tone === "blocked") output.blockedProducerCount += 1;
      return;
    }

    if (entity.kind === "station" && entity.buildingId) {
      const ratedDemandKw = (getBuilding(entity.buildingId).powerDemandKw ?? 0) * entity.machineCount;
      const demanding = ["running", "low-power", "no-power"].includes(status.code);
      if (!this.selectedPlanetId || entity.planetId === this.selectedPlanetId) {
        this.powerConsumers.push({
          entityId: entity.id,
          equipmentName: getBuilding(entity.buildingId).name,
          ratedDemandKw,
          activeDemandKw: demanding ? ratedDemandKw : 0,
          status,
        });
      }
      return;
    }

    const recipe = getRecipe(entity.recipeId);
    if (entity.kind !== "machine" || !entity.buildingId || !recipe) return;
    const building = getBuilding(entity.buildingId);
    const planetProfile = getPlanetIndustrialProfile(this.state, entity.planetId);
    const planetSpeed = specializationApplies(planetProfile, building.family, entity.buildingId)
      ? planetProfile.productionSpeedMultiplier
      : 1;
    const cyclesPerMinute = building.speed * entity.machineCount * getRecipeSpeedMultiplier(this.state, recipe.id) * planetSpeed *
      getEntityProliferatorSpeedMultiplier(entity) / recipe.duration * 60 * entity.utilization;
    const ratedDemandKw = (building.powerDemandKw ?? 0) * entity.machineCount *
      getEntityProliferatorPowerMultiplier(entity);
    const demanding = ["running", "low-power", "no-power"].includes(status.code);
    if (ratedDemandKw > 0 && (!this.selectedPlanetId || entity.planetId === this.selectedPlanetId)) {
      this.powerConsumers.push({
        entityId: entity.id,
        equipmentName: getBuilding(entity.buildingId).name,
        ratedDemandKw,
        activeDemandKw: demanding ? ratedDemandKw : 0,
        status,
      });
    }

    if (recipe.id === "matrix_research") {
      const technology = getTechnology(this.state.research.selectedTechId);
      const progress = technology ? this.state.research.progressByTech[technology.id] ?? {} : {};
      let unassignedRate = cyclesPerMinute;
      const researchCosts = technology?.costs ?? (this.state.endgame?.activeInfiniteResearchId ? [{ itemId: "universe_matrix" as ItemId, amount: 1 }] : []);
      for (const cost of researchCosts) {
        const remaining = Math.max(0, cost.amount - (progress[cost.itemId] ?? 0));
        if (remaining <= 0) continue;
        const input = this.recordFor(cost.itemId);
        input.consumerCount += 1;
        if (unassignedRate > 0 && (entity.inputs[cost.itemId] ?? 0) > 0) {
          input.consumptionPerMinute += unassignedRate;
          unassignedRate = 0;
        }
      }
      const proliferatorItemId = getEntityProliferatorItemId(entity);
      if (proliferatorItemId && entity.proliferatorMode === "speed" && getEntityProliferatorPowerMultiplier(entity) > 1) {
        const proliferator = this.recordFor(proliferatorItemId);
        const sprayPoints = entity.proliferatorTier ? getProliferator(entity.proliferatorTier).sprayPoints : 1;
        proliferator.consumptionPerMinute += cyclesPerMinute / sprayPoints;
        proliferator.consumerCount += 1;
      }
      return;
    }

    for (const input of recipe.inputs) {
      const record = this.recordFor(input.itemId);
      record.consumptionPerMinute += cyclesPerMinute * input.amount;
      record.consumerCount += 1;
    }
    const proliferatorItemId = getEntityProliferatorItemId(entity);
    if (proliferatorItemId && getEntityProliferatorPowerMultiplier(entity) > 1) {
      const proliferator = this.recordFor(proliferatorItemId);
      const sprayPoints = entity.proliferatorTier ? getProliferator(entity.proliferatorTier).sprayPoints : 1;
      proliferator.consumptionPerMinute += cyclesPerMinute * getProliferatorSprayCost(recipe) / sprayPoints;
      proliferator.consumerCount += 1;
    }
    const extraProductMultiplier = 1 + getEntityExtraProductBonus(entity);
    for (const output of recipe.outputs) {
      const record = this.recordFor(output.itemId);
      record.productionPerMinute += cyclesPerMinute * output.amount * extraProductMultiplier;
      record.producerCount += 1;
      if (status.tone === "blocked") record.blockedProducerCount += 1;
    }

  }

  finish(): FactoryStatistics {
    const items = [...this.records.values()]
    .map((record) => ({
      ...record,
      productionPerMinute: rounded(record.productionPerMinute),
      consumptionPerMinute: rounded(record.consumptionPerMinute),
      netPerMinute: rounded(record.productionPerMinute - record.consumptionPerMinute),
      inventory: Math.floor(record.inventory),
    }))
    .filter((record) => record.inventory > 0 || record.producerCount > 0 || record.consumerCount > 0);

    return {
      items,
      issues: this.issues.sort((a, b) => Number(b.status.tone === "blocked") - Number(a.status.tone === "blocked")),
      powerConsumers: this.powerConsumers.sort((a, b) => b.ratedDemandKw - a.ratedDemandKw),
      totalProductionPerMinute: rounded(items.reduce((sum, item) => sum + item.productionPerMinute, 0)),
      totalConsumptionPerMinute: rounded(items.reduce((sum, item) => sum + item.consumptionPerMinute, 0)),
    };
  }
}

export function calculateFactoryStatistics(state: GameState, planetScope: PlanetId | "all" = "all"): FactoryStatistics {
  const accumulator = new FactoryStatisticsAccumulator(state, planetScope);
  accumulator.addTrayInventory();
  for (const entity of state.entities) if (accumulator.includes(entity)) accumulator.addEntityInventory(entity);
  for (const entity of state.entities) if (accumulator.includes(entity)) accumulator.addEntityMetrics(entity);
  return accumulator.finish();
}

export interface AsyncFactoryStatisticsOptions {
  signal?: AbortSignal;
  batchSize?: number;
  yieldControl?: () => Promise<void>;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("统计计算已取消");
  error.name = "AbortError";
  throw error;
}

function yieldStatisticsControl(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => resolve(), { timeout: 32 });
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/** Main-thread fallback for browsers without Worker support. */
export async function calculateFactoryStatisticsAsync(
  state: GameState,
  planetScope: PlanetId | "all" = "all",
  options: AsyncFactoryStatisticsOptions = {},
): Promise<FactoryStatistics> {
  const accumulator = new FactoryStatisticsAccumulator(state, planetScope);
  const batchSize = Number.isSafeInteger(options.batchSize) && (options.batchSize ?? 0) > 0 ? options.batchSize! : 100;
  const yieldControl = options.yieldControl ?? yieldStatisticsControl;
  accumulator.addTrayInventory();
  const process = async (operation: (entity: FactoryEntity) => void) => {
    let processed = 0;
    for (const entity of state.entities) {
      if (!accumulator.includes(entity)) continue;
      throwIfAborted(options.signal);
      operation(entity);
      processed += 1;
      if (processed % batchSize === 0) await yieldControl();
    }
  };
  await process((entity) => accumulator.addEntityInventory(entity));
  await process((entity) => accumulator.addEntityMetrics(entity));
  throwIfAborted(options.signal);
  return accumulator.finish();
}
