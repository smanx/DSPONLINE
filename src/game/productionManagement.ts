import {
  ITEMS,
  PLANET_LIST,
  getBuilding,
  getExtractorBuildingId,
  getFuelItemIdsForBuilding,
  getPlanet,
  getRecipe,
  getTechnology,
} from "./content";
import { getEntityOperatingStatus, getStationSlots } from "./engine";
import { diagnoseBelt } from "./network";
import type {
  BeltConnection,
  EntityOperatingStatus,
  FactoryEntity,
  GameState,
  ItemId,
  PlanetId,
  RecipeId,
} from "./types";

export type ProductionManagementGroup =
  | "mining"
  | "smelting"
  | "manufacturing"
  | "chemical"
  | "research"
  | "logistics"
  | "power"
  | "other";

export type ProductionManagementState = "running" | "missing" | "blocked" | "power" | "idle" | "unconfigured";

export interface MaterialSourceTrace {
  itemId: ItemId;
  required: number;
  buffered: number;
  inboundBeltIds: string[];
  upstreamEntityIds: string[];
  rootSourceEntityIds: string[];
  focusBeltId?: string;
  focusEntityId?: string;
  label: string;
}

export interface MaterialOutputTrace {
  itemId: ItemId;
  buffered: number;
  outboundBeltIds: string[];
  downstreamEntityIds: string[];
  focusBeltId?: string;
  focusEntityId?: string;
  label: string;
}

export interface ProductionManagementRow {
  entityId: string;
  planetId: PlanetId;
  buildingId?: FactoryEntity["buildingId"];
  recipeId?: RecipeId;
  equipmentName: string;
  processName: string;
  group: ProductionManagementGroup;
  state: ProductionManagementState;
  status: EntityOperatingStatus;
  unitCount: number;
  utilization: number;
  productionRate: number;
  inputItemIds: ItemId[];
  outputItemIds: ItemId[];
  inputTraces: MaterialSourceTrace[];
  outputTraces: MaterialOutputTrace[];
  diagnosis: string;
}

export interface PlanetProductionSummary {
  planetId: PlanetId;
  entityCount: number;
  runningCount: number;
  issueCount: number;
  productionRate: number;
  averageUtilization: number;
}

export interface ProductionManagementSnapshot {
  rows: ProductionManagementRow[];
  planets: PlanetProductionSummary[];
  runningCount: number;
  issueCount: number;
  blockedCount: number;
  missingCount: number;
}

interface TraceContext {
  state: GameState;
  entityById: Map<string, FactoryEntity>;
  inboundByKey: Map<string, BeltConnection[]>;
  outboundByKey: Map<string, BeltConnection[]>;
  statusByEntityId: Map<string, EntityOperatingStatus>;
}

function beltKey(entityId: string, itemId: ItemId): string {
  return `${entityId}\u0000${itemId}`;
}

function entityStatus(context: TraceContext, entity: FactoryEntity): EntityOperatingStatus {
  const existing = context.statusByEntityId.get(entity.id);
  if (existing) return existing;
  const status = getEntityOperatingStatus(context.state, entity);
  context.statusByEntityId.set(entity.id, status);
  return status;
}

function equipmentName(entity: FactoryEntity): string {
  if (entity.kind === "vein" && entity.resourceId) return getBuilding(getExtractorBuildingId(entity.resourceId)).name;
  return entity.buildingId ? getBuilding(entity.buildingId).name : "未知设备";
}

function processName(state: GameState, entity: FactoryEntity): string {
  if (entity.kind === "vein" && entity.resourceId) return ITEMS[entity.resourceId].name;
  if (entity.buildingId && getFuelItemIdsForBuilding(entity.buildingId).length > 0) {
    return entity.fuelItemId ? `燃烧${ITEMS[entity.fuelItemId].name}` : "未选择燃料";
  }
  if (entity.kind === "station") {
    const items = getStationSlots(entity).flatMap((slot) => slot.itemId ? [ITEMS[slot.itemId].name] : []);
    return items.length > 0 ? items.join("、") : "未配置物流槽位";
  }
  if (entity.kind === "storage" || entity.kind === "splitter") {
    return entity.storedItemId ? ITEMS[entity.storedItemId].name : "未配置物流物品";
  }
  if (entity.recipeId === "matrix_research") {
    return getTechnology(state.research.selectedTechId)?.name ?? "科研模式";
  }
  return getRecipe(entity.recipeId)?.name ?? "未选择配方";
}

function managementGroup(entity: FactoryEntity): ProductionManagementGroup {
  if (entity.kind === "vein") return "mining";
  if (entity.kind === "station" || entity.kind === "storage" || entity.kind === "splitter") return "logistics";
  if (entity.kind === "power") return "power";
  if (entity.recipeId === "matrix_research" || entity.buildingId?.includes("matrix_lab")) return "research";
  const family = entity.buildingId ? getBuilding(entity.buildingId).family : undefined;
  if (family === "smelter") return "smelting";
  if (family === "assembler") return "manufacturing";
  if (family === "chemical") return "chemical";
  return "other";
}

function managementState(status: EntityOperatingStatus): ProductionManagementState {
  if (status.code === "running" || status.code === "collecting") return "running";
  if (status.code === "output-blocked") return "blocked";
  if (["missing-input", "missing-fuel", "missing-proliferator", "waiting-load", "missing-route", "missing-vessel", "missing-drone", "missing-warper", "missing-hub"].includes(status.code)) return "missing";
  if (status.code === "no-power" || status.code === "low-power") return "power";
  if (["missing-recipe", "missing-research", "no-fuel-selected", "unconfigured"].includes(status.code)) return "unconfigured";
  return "idle";
}

function isDeployed(entity: FactoryEntity): boolean {
  return entity.kind === "vein" ? entity.minerCount > 0 : entity.machineCount > 0;
}

function isManagedIssue(state: ProductionManagementState): boolean {
  return state === "missing" || state === "blocked" || state === "power" || state === "unconfigured";
}

function uniqueItems(items: ItemId[]): ItemId[] {
  return [...new Set(items)];
}

function entityInputs(state: GameState, entity: FactoryEntity): Array<{ itemId: ItemId; amount: number }> {
  if (entity.buildingId && entity.fuelItemId && getFuelItemIdsForBuilding(entity.buildingId).includes(entity.fuelItemId)) {
    return [{ itemId: entity.fuelItemId, amount: 1 }];
  }
  if (entity.kind === "station") {
    return uniqueItems(getStationSlots(entity).flatMap((slot) => {
      if (!slot.itemId || (slot.localMode !== "demand" && slot.remoteMode !== "demand")) return [];
      return [slot.itemId];
    })).map((itemId) => ({ itemId, amount: 1 }));
  }
  if ((entity.kind === "storage" || entity.kind === "splitter") && entity.storedItemId) {
    return [{ itemId: entity.storedItemId, amount: 1 }];
  }
  const recipe = getRecipe(entity.recipeId);
  if (!recipe) return [];
  if (recipe.id === "matrix_research") {
    return (getTechnology(state.research.selectedTechId)?.costs ?? []).map((cost) => ({ itemId: cost.itemId, amount: 1 }));
  }
  return recipe.inputs;
}

function entityOutputs(entity: FactoryEntity): ItemId[] {
  if (entity.kind === "vein" && entity.resourceId) return [entity.resourceId];
  if (entity.kind === "station") {
    return uniqueItems(getStationSlots(entity).flatMap((slot) => {
      if (!slot.itemId || (slot.localMode !== "supply" && slot.remoteMode !== "supply")) return [];
      return [slot.itemId];
    }));
  }
  if ((entity.kind === "storage" || entity.kind === "splitter") && entity.storedItemId) return [entity.storedItemId];
  return uniqueItems((getRecipe(entity.recipeId)?.outputs ?? []).map((output) => output.itemId));
}

function matchingStationSuppliers(context: TraceContext, station: FactoryEntity, itemId: ItemId): FactoryEntity[] {
  const targetSlot = getStationSlots(station).find((slot) => slot.itemId === itemId);
  if (!targetSlot) return [];
  return context.state.entities.filter((candidate) => {
    if (candidate.id === station.id || candidate.kind !== "station" || candidate.buildingId === "orbital_collector") return false;
    const supplySlot = getStationSlots(candidate).find((slot) => slot.itemId === itemId);
    if (!supplySlot) return false;
    const localMatch = candidate.planetId === station.planetId && targetSlot.localMode === "demand" && supplySlot.localMode === "supply";
    const remoteMatch = candidate.planetId !== station.planetId && station.buildingId === "interstellar_logistics_station" &&
      candidate.buildingId === "interstellar_logistics_station" && targetSlot.remoteMode === "demand" && supplySlot.remoteMode === "supply";
    return localMatch || remoteMatch;
  });
}

function traceUpstream(
  context: TraceContext,
  targetEntityId: string,
  itemId: ItemId,
): { beltIds: string[]; immediateBeltIds: string[]; entityIds: string[]; roots: string[] } {
  const beltIds = new Set<string>();
  const entityIds = new Set<string>();
  const roots = new Set<string>();
  const immediateBeltIds = (context.inboundByKey.get(beltKey(targetEntityId, itemId)) ?? []).map((belt) => belt.id);
  const visited = new Set<string>();

  const visit = (targetId: string, requiredItemId: ItemId, depth: number) => {
    if (depth > 10) return;
    const visitKey = beltKey(targetId, requiredItemId);
    if (visited.has(visitKey)) return;
    visited.add(visitKey);
    const target = context.entityById.get(targetId);
    const incoming = context.inboundByKey.get(visitKey) ?? [];
    const stationSuppliers = target?.kind === "station" ? matchingStationSuppliers(context, target, requiredItemId) : [];
    if (incoming.length === 0 && stationSuppliers.length === 0) {
      if (target && target.id !== targetEntityId) roots.add(target.id);
      return;
    }
    for (const belt of incoming) {
      beltIds.add(belt.id);
      const source = context.entityById.get(belt.source);
      if (!source) continue;
      entityIds.add(source.id);
      if (source.kind === "vein") {
        roots.add(source.id);
        continue;
      }
      const recipe = getRecipe(source.recipeId);
      if (recipe?.outputs.some((output) => output.itemId === requiredItemId) && recipe.inputs.length > 0) {
        for (const input of recipe.inputs) visit(source.id, input.itemId, depth + 1);
      } else {
        visit(source.id, requiredItemId, depth + 1);
      }
    }
    for (const supplier of stationSuppliers) {
      entityIds.add(supplier.id);
      visit(supplier.id, requiredItemId, depth + 1);
    }
  };

  visit(targetEntityId, itemId, 0);
  return { beltIds: [...beltIds], immediateBeltIds, entityIds: [...entityIds], roots: [...roots] };
}

function sourceTrace(
  context: TraceContext,
  entity: FactoryEntity,
  requirement: { itemId: ItemId; amount: number },
): MaterialSourceTrace {
  const buffered = Math.floor((entity.inputs[requirement.itemId] ?? 0) + (entity.outputs[requirement.itemId] ?? 0));
  const trace = traceUpstream(context, entity.id, requirement.itemId);
  const immediateBelts = trace.immediateBeltIds
    .map((beltId) => context.state.belts.find((belt) => belt.id === beltId))
    .filter((belt): belt is BeltConnection => Boolean(belt));
  const diagnostics = immediateBelts.map((belt) => diagnoseBelt(context.state, belt));
  const focusDiagnostic = diagnostics.find((diagnostic) => diagnostic.health === "starved" || diagnostic.health === "idle") ?? diagnostics[0];
  const immediateSources = immediateBelts.flatMap((belt) => context.entityById.get(belt.source) ?? []);
  const upstreamProblem = [...immediateSources, ...trace.entityIds.flatMap((id) => context.entityById.get(id) ?? [])]
    .find((candidate) => entityStatus(context, candidate).tone !== "running");
  const flowing = immediateBelts.some((belt) => belt.lastFlow > 0.001);
  let label = "输入库存充足";
  if (buffered < requirement.amount) {
    if (immediateBelts.length === 0) label = trace.entityIds.length > 0 ? "等待物流站调度" : "未连接输入线路";
    else if (flowing) label = "输入线路有流量，但当前吞吐不足";
    else if (upstreamProblem) label = `上游${equipmentName(upstreamProblem)}：${entityStatus(context, upstreamProblem).label}`;
    else label = "输入线路无流量";
  }
  return {
    itemId: requirement.itemId,
    required: requirement.amount,
    buffered,
    inboundBeltIds: trace.immediateBeltIds,
    upstreamEntityIds: trace.entityIds,
    rootSourceEntityIds: trace.roots,
    focusBeltId: focusDiagnostic?.beltId,
    focusEntityId: upstreamProblem?.id ?? immediateSources[0]?.id,
    label,
  };
}

function outputTrace(context: TraceContext, entity: FactoryEntity, itemId: ItemId): MaterialOutputTrace {
  const buffered = Math.floor(entity.outputs[itemId] ?? 0);
  const outbound = context.outboundByKey.get(beltKey(entity.id, itemId)) ?? [];
  const diagnostics = outbound.map((belt) => diagnoseBelt(context.state, belt));
  const focusDiagnostic = diagnostics.find((diagnostic) => diagnostic.health === "congested") ?? diagnostics[0];
  const downstream = outbound.flatMap((belt) => context.entityById.get(belt.target) ?? []);
  const blockedTarget = downstream.find((target) => entityStatus(context, target).code === "output-blocked" ||
    diagnostics.some((diagnostic) => diagnostic.beltId === outbound.find((belt) => belt.target === target.id)?.id && diagnostic.targetFree < 1));
  let label = "输出物流稳定";
  if (outbound.length === 0) label = "未连接输出线路，缓存无法卸载";
  else if (focusDiagnostic?.health === "congested") label = focusDiagnostic.label;
  else if (!outbound.some((belt) => belt.lastFlow > 0.001)) label = "下游暂未取货";
  return {
    itemId,
    buffered,
    outboundBeltIds: outbound.map((belt) => belt.id),
    downstreamEntityIds: downstream.map((target) => target.id),
    focusBeltId: focusDiagnostic?.beltId,
    focusEntityId: blockedTarget?.id ?? downstream[0]?.id,
    label,
  };
}

function rowDiagnosis(status: EntityOperatingStatus, inputs: MaterialSourceTrace[], outputs: MaterialOutputTrace[]): string {
  if (status.code === "missing-input" || status.code === "missing-fuel" || status.code === "missing-proliferator") {
    return inputs.find((trace) => trace.buffered < trace.required)?.label ?? status.label;
  }
  if (status.code === "output-blocked") return outputs[0]?.label ?? status.label;
  return status.label;
}

export function getProductionManagementSnapshot(state: GameState): ProductionManagementSnapshot {
  const entityById = new Map(state.entities.map((entity) => [entity.id, entity]));
  const inboundByKey = new Map<string, BeltConnection[]>();
  const outboundByKey = new Map<string, BeltConnection[]>();
  for (const belt of state.belts) {
    const inboundKey = beltKey(belt.target, belt.itemId);
    const outboundKey = beltKey(belt.source, belt.itemId);
    inboundByKey.set(inboundKey, [...(inboundByKey.get(inboundKey) ?? []), belt]);
    outboundByKey.set(outboundKey, [...(outboundByKey.get(outboundKey) ?? []), belt]);
  }
  const context: TraceContext = { state, entityById, inboundByKey, outboundByKey, statusByEntityId: new Map() };
  const rows = state.entities.filter(isDeployed).map((entity): ProductionManagementRow => {
    const status = entityStatus(context, entity);
    const inputRequirements = entityInputs(state, entity);
    const outputItemIds = entityOutputs(entity);
    const inputTraces = inputRequirements.map((requirement) => sourceTrace(context, entity, requirement));
    const outputTraces = outputItemIds.map((itemId) => outputTrace(context, entity, itemId));
    return {
      entityId: entity.id,
      planetId: entity.planetId,
      buildingId: entity.buildingId,
      recipeId: entity.recipeId,
      equipmentName: equipmentName(entity),
      processName: processName(state, entity),
      group: managementGroup(entity),
      state: managementState(status),
      status,
      unitCount: Math.max(1, entity.kind === "vein" ? entity.minerCount : entity.machineCount),
      utilization: Math.max(0, Math.min(1, entity.utilization)),
      productionRate: Math.max(0, entity.productionRate),
      inputItemIds: inputRequirements.map((requirement) => requirement.itemId),
      outputItemIds,
      inputTraces,
      outputTraces,
      diagnosis: rowDiagnosis(status, inputTraces, outputTraces),
    };
  });
  const colonized = new Set<PlanetId>([state.activePlanetId, ...state.exploration.colonizedPlanetIds, ...rows.map((row) => row.planetId)]);
  const planets = PLANET_LIST.filter((planet) => colonized.has(planet.id)).map((planet): PlanetProductionSummary => {
    const planetRows = rows.filter((row) => row.planetId === planet.id);
    const utilized = planetRows.filter((row) => row.group !== "power" && row.group !== "logistics");
    return {
      planetId: planet.id,
      entityCount: planetRows.length,
      runningCount: planetRows.filter((row) => row.state === "running").length,
      issueCount: planetRows.filter((row) => isManagedIssue(row.state)).length,
      productionRate: planetRows.reduce((sum, row) => sum + row.productionRate, 0),
      averageUtilization: utilized.length > 0 ? utilized.reduce((sum, row) => sum + row.utilization, 0) / utilized.length : 0,
    };
  });
  return {
    rows: rows.sort((a, b) => getPlanet(a.planetId).name.localeCompare(getPlanet(b.planetId).name, "zh-CN") ||
      Number(b.status.tone === "blocked") - Number(a.status.tone === "blocked") || a.equipmentName.localeCompare(b.equipmentName, "zh-CN")),
    planets,
    runningCount: rows.filter((row) => row.state === "running").length,
    issueCount: rows.filter((row) => isManagedIssue(row.state)).length,
    blockedCount: rows.filter((row) => row.state === "blocked").length,
    missingCount: rows.filter((row) => row.state === "missing").length,
  };
}
