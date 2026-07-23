import { getBuilding, getRecipe } from "./content";
import { getBeltCapacity, getBeltNetworkIds, getEntityItemInputCapacity, getEntityProliferatorSpeedMultiplier, getMiningSpeedMultiplier, getRecipeSpeedMultiplier } from "./engine";
import type { BeltConnection, BeltTier, FactoryEntity, GameState, ItemId, PlanetId } from "./types";

export type BeltHealth = "healthy" | "underused" | "starved" | "congested" | "idle";

export interface BeltDiagnostic {
  beltId: string;
  health: BeltHealth;
  label: string;
  flow: number;
  capacity: number;
  utilization: number;
  congestion: number;
  sourceStock: number;
  targetFree: number;
  capacityDeficit: number;
}

export interface BeltNetworkSnapshot {
  originBeltId: string;
  planetId: BeltConnection["planetId"];
  itemId: ItemId;
  beltIds: string[];
  entityIds: string[];
  upstreamBeltIds: string[];
  downstreamBeltIds: string[];
  sourceEntityIds: string[];
  sinkEntityIds: string[];
  totalFlow: number;
  totalCapacity: number;
  utilization: number;
  maxCongestion: number;
  health: BeltHealth;
  label: string;
  bottleneckBeltId: string;
  capacityDeficit: number;
  diagnostics: BeltDiagnostic[];
}

export interface PortOccupancy {
  input: Map<string, Partial<Record<ItemId, number>>>;
  output: Map<string, Partial<Record<ItemId, number>>>;
}

export interface BeltBundleInfo {
  index: number;
  size: number;
}

export type ConnectionForecastTone = "balanced" | "starved" | "capacity" | "unknown";

export interface ConnectionThroughputForecast {
  itemId: ItemId;
  capacityPerSecond: number;
  sourcePerSecond: number | null;
  demandPerSecond: number | null;
  expectedPerSecond: number;
  utilization: number;
  tone: ConnectionForecastTone;
  label: string;
}

function entityItemRatePerSecond(state: GameState, entity: FactoryEntity, itemId: ItemId, direction: "output" | "input"): number | null {
  if (entity.kind === "vein") {
    return direction === "output" && entity.resourceId === itemId && entity.minerCount > 0
      ? Math.max(0, entity.productionRate * getMiningSpeedMultiplier(state) / 60)
      : null;
  }
  const recipe = getRecipe(entity.recipeId);
  if (entity.buildingId && recipe) {
    const amounts = direction === "output" ? recipe.outputs : recipe.inputs;
    const amount = amounts.find((entry) => entry.itemId === itemId)?.amount;
    if (!amount) return null;
    return getBuilding(entity.buildingId).speed * Math.max(1, entity.machineCount) * getRecipeSpeedMultiplier(state, recipe.id) *
      getEntityProliferatorSpeedMultiplier(entity) / Math.max(0.05, recipe.duration) * amount;
  }
  const stock = direction === "output" ? entity.outputs[itemId] : entity.inputs[itemId];
  return (stock ?? 0) > 0 ? Number.POSITIVE_INFINITY : null;
}

/** Estimates the useful rate before a belt is committed to the save. */
export function predictBeltConnection(
  state: GameState,
  sourceId: string,
  targetId: string,
  itemId: ItemId,
  tier: BeltTier,
): ConnectionThroughputForecast | null {
  const source = state.entities.find((entity) => entity.id === sourceId);
  const target = state.entities.find((entity) => entity.id === targetId);
  if (!source || !target) return null;
  const capacityPerSecond = getBeltCapacity({ tier, lanes: 1, stackSize: 1 } as BeltConnection);
  const rawSource = entityItemRatePerSecond(state, source, itemId, "output");
  const rawDemand = entityItemRatePerSecond(state, target, itemId, "input");
  const sourcePerSecond = rawSource === Number.POSITIVE_INFINITY ? capacityPerSecond : rawSource;
  const demandPerSecond = rawDemand === Number.POSITIVE_INFINITY ? capacityPerSecond : rawDemand;
  const expectedPerSecond = Math.max(0, Math.min(capacityPerSecond, sourcePerSecond ?? capacityPerSecond, demandPerSecond ?? capacityPerSecond));
  const utilization = capacityPerSecond > 0 ? Math.min(1, expectedPerSecond / capacityPerSecond) : 0;
  let tone: ConnectionForecastTone = "balanced";
  let label = `预计 ${expectedPerSecond.toFixed(2)}/s · 线路 ${Math.round(utilization * 100)}%`;
  if (sourcePerSecond == null || demandPerSecond == null) {
    tone = "unknown";
    label = `预计上限 ${capacityPerSecond.toFixed(2)}/s · 配方确定后复算`;
  } else if (sourcePerSecond > capacityPerSecond * 1.05 || demandPerSecond > capacityPerSecond * 1.05) {
    tone = "capacity";
    label = `线路上限 ${capacityPerSecond.toFixed(2)}/s · 建议升级或并联`;
  } else if (sourcePerSecond < demandPerSecond * 0.8) {
    tone = "starved";
    label = `上游仅 ${sourcePerSecond.toFixed(2)}/s · 下游可能缺料`;
  }
  return { itemId, capacityPerSecond, sourcePerSecond, demandPerSecond, expectedPerSecond, utilization, tone, label };
}

function targetFreeCapacity(state: GameState, entity: FactoryEntity | undefined, itemId: ItemId): number {
  if (!entity?.buildingId) return 0;
  const capacity = getEntityItemInputCapacity(state, entity, itemId);
  return Math.max(0, Math.floor(capacity - (entity.inputs[itemId] ?? 0)));
}

export function diagnoseBelt(state: GameState, belt: BeltConnection): BeltDiagnostic {
  const source = state.entities.find((entity) => entity.id === belt.source);
  const target = state.entities.find((entity) => entity.id === belt.target);
  const capacity = getBeltCapacity(belt);
  const flow = Math.max(0, belt.lastFlow ?? 0);
  const utilization = capacity > 0 ? Math.min(1, flow / capacity) : 0;
  const congestion = Math.max(0, Math.min(1, belt.congestion ?? 0));
  const sourceStock = Math.max(0, Math.floor(source?.outputs[belt.itemId] ?? 0));
  const targetFree = targetFreeCapacity(state, target, belt.itemId);
  const estimatedDemand = flow > 0 && congestion > 0
    ? Math.min(capacity * 4, flow / Math.max(0.05, 1 - congestion))
    : congestion >= 0.8 && sourceStock > 0 ? capacity * 1.25 : flow;
  const capacityDeficit = Math.max(0, estimatedDemand - capacity);
  let health: BeltHealth;
  let label: string;
  if (!source || !target) {
    health = "idle";
    label = "端点不存在";
  } else if (targetFree < 1 || congestion >= 0.8) {
    health = "congested";
    label = targetFree < 1 ? "下游缓存已满" : "线路持续拥堵";
  } else if (sourceStock < 1 && flow < 0.001) {
    health = "starved";
    label = "上游暂无可运输库存";
  } else if (flow < 0.001) {
    health = "idle";
    label = "等待生产或运输周期";
  } else if (utilization < 0.25) {
    health = "underused";
    label = "线路容量利用率偏低";
  } else {
    health = "healthy";
    label = "运输稳定";
  }
  return { beltId: belt.id, health, label, flow, capacity, utilization, congestion, sourceStock, targetFree, capacityDeficit };
}

function directionalBelts(
  belts: BeltConnection[],
  startNodeId: string,
  direction: "upstream" | "downstream",
): string[] {
  const result = new Set<string>();
  const visitedNodes = new Set<string>([startNodeId]);
  const queue = [startNodeId];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    for (const belt of belts) {
      const matches = direction === "upstream" ? belt.target === nodeId : belt.source === nodeId;
      if (!matches || result.has(belt.id)) continue;
      result.add(belt.id);
      const nextNodeId = direction === "upstream" ? belt.source : belt.target;
      if (!visitedNodes.has(nextNodeId)) {
        visitedNodes.add(nextNodeId);
        queue.push(nextNodeId);
      }
    }
  }
  return [...result];
}

function networkHealth(diagnostics: BeltDiagnostic[]): { health: BeltHealth; label: string } {
  if (diagnostics.some((diagnostic) => diagnostic.health === "congested")) return { health: "congested", label: "下游拥堵限制网络吞吐" };
  if (diagnostics.some((diagnostic) => diagnostic.health === "starved")) return { health: "starved", label: "上游供料不足" };
  if (diagnostics.some((diagnostic) => diagnostic.health === "idle")) return { health: "idle", label: "网络存在等待线路" };
  if (diagnostics.some((diagnostic) => diagnostic.health === "underused")) return { health: "underused", label: "网络容量利用率偏低" };
  return { health: "healthy", label: "网络运输稳定" };
}

export function analyzeBeltNetwork(state: GameState, beltId: string): BeltNetworkSnapshot | null {
  const origin = state.belts.find((belt) => belt.id === beltId);
  if (!origin) return null;
  const beltIds = getBeltNetworkIds(state, beltId);
  const idSet = new Set(beltIds);
  const belts = state.belts.filter((belt) => idSet.has(belt.id));
  const entityIds = [...new Set(belts.flatMap((belt) => [belt.source, belt.target]))];
  const incoming = new Set(belts.map((belt) => belt.target));
  const outgoing = new Set(belts.map((belt) => belt.source));
  const sourceEntityIds = entityIds.filter((entityId) => !incoming.has(entityId));
  const sinkEntityIds = entityIds.filter((entityId) => !outgoing.has(entityId));
  const diagnostics = belts.map((belt) => diagnoseBelt(state, belt));
  const totalFlow = diagnostics.reduce((sum, diagnostic) => sum + diagnostic.flow, 0);
  const totalCapacity = diagnostics.reduce((sum, diagnostic) => sum + diagnostic.capacity, 0);
  const health = networkHealth(diagnostics);
  const bottleneck = [...diagnostics].sort((a, b) => {
    const severity = (diagnostic: BeltDiagnostic) => diagnostic.health === "congested" ? 4 : diagnostic.health === "starved" ? 3 : diagnostic.health === "idle" ? 2 : diagnostic.health === "underused" ? 1 : 0;
    return severity(b) - severity(a) || b.congestion - a.congestion || b.utilization - a.utilization;
  })[0];
  return {
    originBeltId: beltId,
    planetId: origin.planetId,
    itemId: origin.itemId,
    beltIds,
    entityIds,
    upstreamBeltIds: directionalBelts(belts, origin.source, "upstream").filter((id) => id !== origin.id),
    downstreamBeltIds: directionalBelts(belts, origin.target, "downstream").filter((id) => id !== origin.id),
    sourceEntityIds,
    sinkEntityIds,
    totalFlow,
    totalCapacity,
    utilization: totalCapacity > 0 ? Math.min(1, totalFlow / totalCapacity) : 0,
    maxCongestion: diagnostics.reduce((maximum, diagnostic) => Math.max(maximum, diagnostic.congestion), 0),
    health: health.health,
    label: health.label,
    bottleneckBeltId: bottleneck?.beltId ?? beltId,
    capacityDeficit: diagnostics.reduce((sum, diagnostic) => sum + diagnostic.capacityDeficit, 0),
    diagnostics,
  };
}

export function listBeltNetworks(state: GameState, planetId?: PlanetId): BeltNetworkSnapshot[] {
  const seen = new Set<string>();
  const snapshots: BeltNetworkSnapshot[] = [];
  const belts = state.belts
    .filter((belt) => !planetId || belt.planetId === planetId)
    .sort((a, b) => a.planetId.localeCompare(b.planetId) || a.itemId.localeCompare(b.itemId) || a.id.localeCompare(b.id));
  for (const belt of belts) {
    if (seen.has(belt.id)) continue;
    const snapshot = analyzeBeltNetwork(state, belt.id);
    if (!snapshot) continue;
    snapshot.beltIds.forEach((beltId) => seen.add(beltId));
    const originBeltId = [...snapshot.beltIds].sort((a, b) => a.localeCompare(b))[0] ?? belt.id;
    snapshots.push({ ...snapshot, originBeltId });
  }
  const severity = (health: BeltHealth) => health === "congested" ? 4 : health === "starved" ? 3 : health === "idle" ? 2 : health === "underused" ? 1 : 0;
  return snapshots.sort((a, b) => severity(b.health) - severity(a.health) || b.utilization - a.utilization || a.itemId.localeCompare(b.itemId));
}

export function getPortOccupancy(state: GameState, planetId = state.activePlanetId): PortOccupancy {
  const input = new Map<string, Partial<Record<ItemId, number>>>();
  const output = new Map<string, Partial<Record<ItemId, number>>>();
  for (const belt of state.belts) {
    if (belt.planetId !== planetId) continue;
    const source = output.get(belt.source) ?? {};
    source[belt.itemId] = (source[belt.itemId] ?? 0) + belt.lanes;
    output.set(belt.source, source);
    const target = input.get(belt.target) ?? {};
    target[belt.itemId] = (target[belt.itemId] ?? 0) + belt.lanes;
    input.set(belt.target, target);
  }
  return { input, output };
}

export function getBeltBundleMap(state: GameState, planetId = state.activePlanetId): Map<string, BeltBundleInfo> {
  const groups = new Map<string, BeltConnection[]>();
  for (const belt of state.belts) {
    if (belt.planetId !== planetId) continue;
    const key = `${belt.source}:${belt.target}`;
    const group = groups.get(key) ?? [];
    group.push(belt);
    groups.set(key, group);
  }
  const result = new Map<string, BeltBundleInfo>();
  for (const belts of groups.values()) {
    belts.sort((a, b) => a.itemId.localeCompare(b.itemId) || a.id.localeCompare(b.id));
    belts.forEach((belt, index) => result.set(belt.id, { index, size: belts.length }));
  }
  return result;
}
