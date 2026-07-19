import { FUEL_ENERGY_MJ, ITEMS, PLANET_LIST, getBuilding, getExtractorBuildingId, getFuelEfficiency, getFuelItemIdsForBuilding, getProliferator, getRecipe, getTechnology } from "./content";
import { getEntityExtraProductBonus, getEntityOperatingStatus, getEntityProliferatorItemId, getEntityProliferatorPowerMultiplier, getEntityProliferatorSpeedMultiplier, getProliferatorSprayCost, getRecipeSpeedMultiplier } from "./engine";
import type { EntityOperatingStatus, FactoryEntity, GameState, ItemId } from "./types";

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
  if (entity.recipeId === "matrix_research") return getTechnology(state.research.selectedTechId)?.name ?? "科研模式";
  return getRecipe(entity.recipeId)?.name ?? "未选择配方";
}

function isDeployedDevice(entity: FactoryEntity): boolean {
  if (entity.kind === "vein") return entity.minerCount > 0;
  return entity.machineCount > 0;
}

export function calculateFactoryStatistics(state: GameState): FactoryStatistics {
  const records = new Map<ItemId, ItemStatistics>();
  const recordFor = (itemId: ItemId) => {
    const existing = records.get(itemId);
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
    records.set(itemId, created);
    return created;
  };

  for (const planet of PLANET_LIST) {
    const tray = planet.id === state.activePlanetId ? state.tray : state.planetTrays[planet.id];
    for (const [itemId, amount] of Object.entries(tray) as Array<[ItemId, number]>) {
      recordFor(itemId).inventory += Math.floor(amount ?? 0);
    }
  }
  if (state.cargo) recordFor(state.cargo.itemId).inventory += Math.floor(state.cargo.amount);
  for (const entity of state.entities) {
    for (const [itemId, amount] of Object.entries(entity.inputs) as Array<[ItemId, number]>) {
      recordFor(itemId).inventory += Math.floor(amount ?? 0);
    }
    for (const [itemId, amount] of Object.entries(entity.outputs) as Array<[ItemId, number]>) {
      recordFor(itemId).inventory += Math.floor(amount ?? 0);
    }
  }

  const issues: EquipmentIssue[] = [];
  const powerConsumers: PowerConsumerStatistics[] = [];

  for (const entity of state.entities) {
    const status = getEntityOperatingStatus(state, entity);
    if (isDeployedDevice(entity) && (status.tone === "blocked" || status.tone === "warning")) {
      issues.push({
        entityId: entity.id,
        equipmentName: equipmentName(entity),
        processName: processName(entity, state),
        status,
      });
    }

    if (entity.kind === "vein" && entity.resourceId && entity.minerCount > 0) {
      const output = recordFor(entity.resourceId);
      output.productionPerMinute += entity.productionRate;
      output.producerCount += 1;
      if (status.tone === "blocked") output.blockedProducerCount += 1;
      const extractorId = getExtractorBuildingId(entity.resourceId);
      const ratedDemandKw = (getBuilding(extractorId).powerDemandKw ?? 0) * entity.minerCount;
      const demanding = ["running", "low-power", "no-power"].includes(status.code);
      if (entity.planetId === state.activePlanetId) {
        powerConsumers.push({
          entityId: entity.id,
          equipmentName: getBuilding(extractorId).name,
          ratedDemandKw,
          activeDemandKw: demanding ? ratedDemandKw : 0,
          status,
        });
      }
      continue;
    }

    if (entity.buildingId && entity.fuelItemId && getFuelItemIdsForBuilding(entity.buildingId).includes(entity.fuelItemId)) {
      const energyMj = FUEL_ENERGY_MJ[entity.fuelItemId] ?? 0;
      const consumption = energyMj > 0
        ? (entity.powerOutputKw ?? 0) * 60 / (1000 * getFuelEfficiency(entity.buildingId) * energyMj)
        : 0;
      const fuel = recordFor(entity.fuelItemId);
      fuel.consumptionPerMinute += consumption;
      fuel.consumerCount += 1;
      continue;
    }

    if (entity.kind === "power" && (entity.buildingId === "accumulator" || entity.buildingId === "energy_exchanger")) {
      const building = getBuilding(entity.buildingId);
      if (entity.planetId === state.activePlanetId) {
        powerConsumers.push({
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
          const record = recordFor(input.itemId);
          record.consumptionPerMinute += entity.productionRate * input.amount;
          record.consumerCount += 1;
        }
        for (const output of recipe?.outputs ?? []) {
          const record = recordFor(output.itemId);
          record.productionPerMinute += entity.productionRate * output.amount;
          record.producerCount += 1;
        }
      }
      continue;
    }

    if (entity.buildingId === "orbital_collector" && entity.storedItemId) {
      const output = recordFor(entity.storedItemId);
      output.productionPerMinute += entity.productionRate;
      output.producerCount += 1;
      if (status.tone === "blocked") output.blockedProducerCount += 1;
      continue;
    }

    if (entity.kind === "station" && entity.buildingId) {
      const ratedDemandKw = (getBuilding(entity.buildingId).powerDemandKw ?? 0) * entity.machineCount;
      const demanding = ["running", "low-power", "no-power"].includes(status.code);
      if (entity.planetId === state.activePlanetId) {
        powerConsumers.push({
          entityId: entity.id,
          equipmentName: getBuilding(entity.buildingId).name,
          ratedDemandKw,
          activeDemandKw: demanding ? ratedDemandKw : 0,
          status,
        });
      }
      continue;
    }

    const recipe = getRecipe(entity.recipeId);
    if (entity.kind !== "machine" || !entity.buildingId || !recipe) continue;
    const cyclesPerMinute = getBuilding(entity.buildingId).speed * entity.machineCount * getRecipeSpeedMultiplier(state, recipe.id) *
      getEntityProliferatorSpeedMultiplier(entity) / recipe.duration * 60 * entity.utilization;
    const ratedDemandKw = (getBuilding(entity.buildingId).powerDemandKw ?? 0) * entity.machineCount *
      getEntityProliferatorPowerMultiplier(entity);
    const demanding = ["running", "low-power", "no-power"].includes(status.code);
    if (ratedDemandKw > 0 && entity.planetId === state.activePlanetId) {
      powerConsumers.push({
        entityId: entity.id,
        equipmentName: getBuilding(entity.buildingId).name,
        ratedDemandKw,
        activeDemandKw: demanding ? ratedDemandKw : 0,
        status,
      });
    }

    if (recipe.id === "matrix_research") {
      const technology = getTechnology(state.research.selectedTechId);
      const progress = technology ? state.research.progressByTech[technology.id] ?? {} : {};
      let unassignedRate = cyclesPerMinute;
      for (const cost of technology?.costs ?? []) {
        const remaining = Math.max(0, cost.amount - (progress[cost.itemId] ?? 0));
        if (remaining <= 0) continue;
        const input = recordFor(cost.itemId);
        input.consumerCount += 1;
        if (unassignedRate > 0 && (entity.inputs[cost.itemId] ?? 0) > 0) {
          input.consumptionPerMinute += unassignedRate;
          unassignedRate = 0;
        }
      }
      continue;
    }

    for (const input of recipe.inputs) {
      const record = recordFor(input.itemId);
      record.consumptionPerMinute += cyclesPerMinute * input.amount;
      record.consumerCount += 1;
    }
    const proliferatorItemId = getEntityProliferatorItemId(entity);
    if (proliferatorItemId && getEntityProliferatorPowerMultiplier(entity) > 1) {
      const proliferator = recordFor(proliferatorItemId);
      const sprayPoints = entity.proliferatorTier ? getProliferator(entity.proliferatorTier).sprayPoints : 1;
      proliferator.consumptionPerMinute += cyclesPerMinute * getProliferatorSprayCost(recipe) / sprayPoints;
      proliferator.consumerCount += 1;
    }
    const extraProductMultiplier = 1 + getEntityExtraProductBonus(entity);
    for (const output of recipe.outputs) {
      const record = recordFor(output.itemId);
      record.productionPerMinute += cyclesPerMinute * output.amount * extraProductMultiplier;
      record.producerCount += 1;
      if (status.tone === "blocked") record.blockedProducerCount += 1;
    }

  }

  const items = [...records.values()]
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
    issues: issues.sort((a, b) => Number(b.status.tone === "blocked") - Number(a.status.tone === "blocked")),
    powerConsumers: powerConsumers.sort((a, b) => b.ratedDemandKw - a.ratedDemandKw),
    totalProductionPerMinute: rounded(items.reduce((sum, item) => sum + item.productionPerMinute, 0)),
    totalConsumptionPerMinute: rounded(items.reduce((sum, item) => sum + item.consumptionPerMinute, 0)),
  };
}
