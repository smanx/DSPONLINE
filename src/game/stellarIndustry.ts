import { getBuilding, getPlanet, getStarSystem, PLANET_LIST, STAR_SYSTEM_LIST } from "./content";
import {
  findStationSlotPeer,
  getEntityOperatingStatus,
  getInterstellarCargoCapacity,
  getInterstellarRouteEconomics,
  getPlanetMetrics,
  getPlanetaryCargoCapacity,
  getPlanetaryTripSeconds,
  getStationMinimumCargo,
  getStationSlotCapacity,
  getStationSlots,
  isTechnologyCompleted,
  stationRouteRequiresWarp,
} from "./engine";
import { PLANET_INDUSTRY_ROLE_LABELS, isInfiniteResource } from "./galaxy";
import type {
  FactoryEntity,
  GameState,
  ItemId,
  LogisticsPriority,
  PlanetId,
  PlanetIndustryRole,
  StarSystemId,
  StationLogisticsScope,
  StationMinimumLoad,
} from "./types";

export type StellarRouteStatus =
  | "active"
  | "ready"
  | "missing-source"
  | "missing-vehicle"
  | "missing-warper"
  | "missing-stock"
  | "target-full"
  | "no-power";

export interface StellarRouteSnapshot {
  id: string;
  scope: StationLogisticsScope;
  itemId: ItemId;
  sourceStationId?: string;
  sourceSlotIndex?: number;
  sourcePlanetId?: PlanetId;
  targetStationId: string;
  targetSlotIndex: number;
  targetPlanetId: PlanetId;
  sourceStock: number;
  sourceReserve: number;
  targetStock: number;
  targetLimit: number;
  minimumLoad: StationMinimumLoad;
  minimumCargo: number;
  priority: LogisticsPriority;
  installedVehicles: number;
  activeVehicles: number;
  distanceLy: number;
  orbitSpan: number;
  durationSeconds: number;
  throughputPerMinute: number;
  powerKw: number;
  energyMjPerTrip: number;
  warpersPerTrip: number;
  availableWarpers: number;
  status: StellarRouteStatus;
  statusLabel: string;
}

export interface PlanetIndustryIssue {
  code: "power" | "depleted" | "route" | "congestion";
  label: string;
  entityId?: string;
}

export interface PlanetIndustrySummary {
  planetId: PlanetId;
  role: PlanetIndustryRole;
  roleLabel: string;
  detectedRole: Exclude<PlanetIndustryRole, "auto">;
  tags: string[];
  deviceCount: number;
  activeDeviceCount: number;
  stationCount: number;
  configuredImports: number;
  configuredExports: number;
  reserveRemaining: number;
  miningPerMinute: number;
  depletionSeconds: number | null;
  depletedVeins: number;
  powerFactor: number;
  generationKw: number;
  demandKw: number;
  issues: PlanetIndustryIssue[];
}

export interface StarSystemIndustrySummary {
  systemId: StarSystemId;
  planetIds: PlanetId[];
  deviceCount: number;
  routeCount: number;
  blockedRouteCount: number;
  reserveRemaining: number;
  generationKw: number;
  demandKw: number;
  soonestDepletionSeconds: number | null;
}

const STATUS_LABELS: Record<StellarRouteStatus, string> = {
  active: "运输中",
  ready: "等待发船",
  "missing-source": "缺少供应站",
  "missing-vehicle": "缺少运输载具",
  "missing-warper": "缺少翘曲器",
  "missing-stock": "供应库存不足",
  "target-full": "需求库存已满",
  "no-power": "站点电力不足",
};

function stationInstalledVehicles(station: FactoryEntity, scope: StationLogisticsScope): number {
  return Math.max(0, Math.floor(scope === "local" ? station.stationDrones ?? 0 : station.stationVessels ?? 0));
}

function getRouteStatus(
  game: GameState,
  source: FactoryEntity | undefined,
  target: FactoryEntity,
  scope: StationLogisticsScope,
  activeVehicles: number,
  installedVehicles: number,
  requiresWarp: boolean,
  sourceStock: number,
  minimumCargo: number,
  targetFree: number,
): StellarRouteStatus {
  if (!source) return "missing-source";
  if (activeVehicles > 0) return "active";
  if (installedVehicles < 1) return "missing-vehicle";
  if (requiresWarp && (!target.stationWarpEnabled || !isTechnologyCompleted(game, "space_warp") || (target.stationWarpers ?? 0) < 1)) {
    return "missing-warper";
  }
  if (getPlanetMetrics(game, target.planetId).powerFactor <= 0 || getPlanetMetrics(game, source.planetId).powerFactor <= 0) return "no-power";
  if (sourceStock < minimumCargo) return "missing-stock";
  if (targetFree < minimumCargo) return "target-full";
  return "ready";
}

export function getStellarRouteSnapshots(game: GameState): StellarRouteSnapshot[] {
  const snapshots: StellarRouteSnapshot[] = [];
  const demands = game.entities.filter((entity) => entity.kind === "station" && entity.buildingId !== "orbital_collector");
  for (const target of demands) {
    const scopes: StationLogisticsScope[] = target.buildingId === "interstellar_logistics_station"
      ? ["local", "remote"]
      : ["local"];
    const targetSlots = getStationSlots(target);
    for (const scope of scopes) {
      targetSlots.forEach((targetSlot, targetSlotIndex) => {
        const mode = scope === "local" ? targetSlot.localMode : targetSlot.remoteMode;
        if (!targetSlot.itemId || mode !== "demand") return;
        const match = findStationSlotPeer(game, target, targetSlotIndex, scope);
        const source = match?.peer;
        const sourceSlot = source
          ? source.buildingId === "orbital_collector"
            ? { minStock: 0 }
            : getStationSlots(source)[match!.peerSlotIndex]
          : undefined;
        const active = (target.stationRoutes ?? []).filter((route) => route.scope === scope &&
          route.slotIndex === targetSlotIndex && (!source || route.peerId === source.id));
        const activeVehicles = active.reduce((sum, route) => sum + route.vehicleCount, 0);
        const installedVehicles = stationInstalledVehicles(target, scope);
        const minimumCargo = getStationMinimumCargo(game, target, targetSlotIndex, scope);
        const sourceReserve = Math.max(0, Math.floor(sourceSlot?.minStock ?? 0));
        const sourceStock = source ? Math.max(0, Math.floor((source.outputs[targetSlot.itemId!] ?? 0) - sourceReserve)) : 0;
        const targetStock = Math.max(0, Math.floor(target.outputs[targetSlot.itemId!] ?? 0));
        const targetLimit = getStationSlotCapacity(target, targetSlot);
        const targetFree = Math.max(0, targetLimit - targetStock - active.reduce((sum, route) => sum + route.cargo, 0));
        const requiresWarp = scope === "remote" && stationRouteRequiresWarp(target, source);
        const economics = source && scope === "remote"
          ? getInterstellarRouteEconomics(game, source, target, Math.max(1, installedVehicles))
          : null;
        const durationSeconds = economics?.durationSeconds ?? getPlanetaryTripSeconds(game);
        const cargoPerVehicle = scope === "remote" ? getInterstellarCargoCapacity(game) : getPlanetaryCargoCapacity(game);
        const throughputPerMinute = installedVehicles > 0
          ? cargoPerVehicle * installedVehicles * 60 / Math.max(1, durationSeconds)
          : 0;
        const status = getRouteStatus(game, source, target, scope, activeVehicles, installedVehicles, requiresWarp,
          sourceStock, minimumCargo, targetFree);
        snapshots.push({
          id: `${scope}:${target.id}:${targetSlotIndex}:${source?.id ?? "unbound"}`,
          scope,
          itemId: targetSlot.itemId!,
          sourceStationId: source?.id,
          sourceSlotIndex: match?.peerSlotIndex,
          sourcePlanetId: source?.planetId,
          targetStationId: target.id,
          targetSlotIndex,
          targetPlanetId: target.planetId,
          sourceStock,
          sourceReserve,
          targetStock,
          targetLimit,
          minimumLoad: targetSlot.minimumLoad,
          minimumCargo,
          priority: targetSlot.priority,
          installedVehicles,
          activeVehicles,
          distanceLy: economics?.distanceLy ?? 0,
          orbitSpan: economics?.orbitSpan ?? 0,
          durationSeconds,
          throughputPerMinute,
          powerKw: economics?.powerKw ?? ((getBuilding(target.buildingId!).powerDemandKw ?? 0) + 120 * installedVehicles),
          energyMjPerTrip: economics?.energyMjPerTrip ?? ((getBuilding(target.buildingId!).powerDemandKw ?? 0) + 120 * installedVehicles) * durationSeconds / 1_000,
          warpersPerTrip: economics?.warpersPerTrip ?? 0,
          availableWarpers: Math.max(0, Math.floor(target.stationWarpers ?? 0)),
          status,
          statusLabel: STATUS_LABELS[status],
        });
      });
    }
  }
  return snapshots.sort((a, b) => {
    const statusOrder = Number(a.status === "active") - Number(b.status === "active");
    return statusOrder !== 0 ? -statusOrder : b.priority - a.priority || a.id.localeCompare(b.id);
  });
}

function detectedPlanetRole(game: GameState, planetId: PlanetId): Exclude<PlanetIndustryRole, "auto"> {
  const scores: Record<Exclude<PlanetIndustryRole, "auto">, number> = {
    mining: 0,
    smelting: 0,
    manufacturing: 0,
    chemical: 0,
    research: 0,
    logistics: 0,
    power: 0,
  };
  for (const entity of game.entities) {
    if (entity.planetId !== planetId) continue;
    const count = Math.max(1, entity.machineCount + entity.minerCount);
    if (entity.kind === "vein" && entity.minerCount > 0) scores.mining += entity.minerCount;
    if (entity.kind === "power") scores.power += count;
    if (entity.kind === "station") scores.logistics += count * 1.5;
    if (!entity.buildingId) continue;
    const building = getBuilding(entity.buildingId);
    if (building.family === "smelter") scores.smelting += count;
    if (building.family === "assembler") scores.manufacturing += count;
    if (building.family === "chemical") scores.chemical += count;
    if (entity.buildingId === "matrix_lab") scores.research += count * 1.5;
  }
  return (Object.entries(scores) as Array<[Exclude<PlanetIndustryRole, "auto">, number]>)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "mining";
}

export function getPlanetIndustrySummaries(game: GameState, routes = getStellarRouteSnapshots(game)): PlanetIndustrySummary[] {
  return PLANET_LIST.map((planet) => {
    const entities = game.entities.filter((entity) => entity.planetId === planet.id);
    const veins = entities.filter((entity) => entity.kind === "vein" && entity.resourceId &&
      !isInfiniteResource(entity.resourceId, planet.id, game.settings.resourceMode));
    const reserveRemaining = veins.reduce((sum, vein) => sum + Math.max(0, Math.floor(vein.resourceRemaining ?? 0)), 0);
    const miningPerMinute = veins.reduce((sum, vein) => sum + Math.max(0, vein.productionRate), 0);
    const depletedVeins = veins.filter((vein) => (vein.resourceRemaining ?? 0) <= 0).length;
    const detectedRole = detectedPlanetRole(game, planet.id);
    const role = game.galaxy.planetRoles?.[planet.id] ?? "auto";
    const metrics = getPlanetMetrics(game, planet.id);
    const planetRoutes = routes.filter((route) => route.targetPlanetId === planet.id || route.sourcePlanetId === planet.id);
    const issues: PlanetIndustryIssue[] = [];
    if (metrics.demandKw > 0 && metrics.powerFactor < 0.85) issues.push({ code: "power", label: `电力仅 ${Math.round(metrics.powerFactor * 100)}%` });
    const depleted = veins.find((vein) => (vein.resourceRemaining ?? 0) <= 0);
    if (depleted) issues.push({ code: "depleted", label: "存在枯竭矿脉", entityId: depleted.id });
    const blockedRoute = planetRoutes.find((route) => route.status !== "active" && route.status !== "ready" && route.status !== "missing-stock" && route.status !== "target-full");
    if (blockedRoute) issues.push({ code: "route", label: blockedRoute.statusLabel, entityId: blockedRoute.targetStationId });
    const congested = entities.find((entity) => (entity.stationCongestion ?? 0) >= 0.8);
    if (congested) issues.push({ code: "congestion", label: "物流站拥堵", entityId: congested.id });
    const categoryTags = new Set<string>();
    if (entities.some((entity) => entity.kind === "vein" && entity.minerCount > 0)) categoryTags.add("采矿");
    if (entities.some((entity) => entity.buildingId && getBuilding(entity.buildingId).family === "smelter")) categoryTags.add("冶炼");
    if (entities.some((entity) => entity.buildingId && getBuilding(entity.buildingId).family === "chemical")) categoryTags.add("化工");
    if (entities.some((entity) => entity.buildingId === "matrix_lab")) categoryTags.add("科研");
    if (entities.some((entity) => entity.kind === "station")) categoryTags.add("物流");
    if (entities.some((entity) => entity.kind === "power")) categoryTags.add("发电");
    const activeDeviceCount = entities.filter((entity) => getEntityOperatingStatus(game, entity).code === "running").length;
    return {
      planetId: planet.id,
      role,
      roleLabel: role === "auto" ? `${PLANET_INDUSTRY_ROLE_LABELS.auto} · ${PLANET_INDUSTRY_ROLE_LABELS[detectedRole]}` : PLANET_INDUSTRY_ROLE_LABELS[role],
      detectedRole,
      tags: [...categoryTags],
      deviceCount: entities.reduce((sum, entity) => sum + entity.machineCount + entity.minerCount, 0),
      activeDeviceCount,
      stationCount: entities.filter((entity) => entity.kind === "station").length,
      configuredImports: routes.filter((route) => route.targetPlanetId === planet.id).length,
      configuredExports: routes.filter((route) => route.sourcePlanetId === planet.id).length,
      reserveRemaining,
      miningPerMinute,
      depletionSeconds: miningPerMinute > 0 && reserveRemaining > 0 ? reserveRemaining / miningPerMinute * 60 : null,
      depletedVeins,
      powerFactor: metrics.powerFactor,
      generationKw: metrics.generationKw,
      demandKw: metrics.demandKw,
      issues,
    };
  });
}

export function getStarSystemIndustrySummaries(
  game: GameState,
  routes = getStellarRouteSnapshots(game),
  planets = getPlanetIndustrySummaries(game, routes),
): StarSystemIndustrySummary[] {
  return STAR_SYSTEM_LIST.map((system) => {
    const members = planets.filter((planet) => getPlanet(planet.planetId).systemId === system.id);
    const systemRoutes = routes.filter((route) => getPlanet(route.targetPlanetId).systemId === system.id ||
      (route.sourcePlanetId && getPlanet(route.sourcePlanetId).systemId === system.id));
    const depletion = members.flatMap((planet) => planet.depletionSeconds == null ? [] : [planet.depletionSeconds]);
    return {
      systemId: system.id,
      planetIds: [...system.planetIds],
      deviceCount: members.reduce((sum, planet) => sum + planet.deviceCount, 0),
      routeCount: systemRoutes.length,
      blockedRouteCount: systemRoutes.filter((route) => route.status !== "active" && route.status !== "ready" && route.status !== "missing-stock" && route.status !== "target-full").length,
      reserveRemaining: members.reduce((sum, planet) => sum + planet.reserveRemaining, 0),
      generationKw: members.reduce((sum, planet) => sum + planet.generationKw, 0),
      demandKw: members.reduce((sum, planet) => sum + planet.demandKw, 0),
      soonestDepletionSeconds: depletion.length > 0 ? Math.min(...depletion) : null,
    };
  });
}

export function getPlanetRoleLabel(game: GameState, planetId: PlanetId): string {
  const role = game.galaxy.planetRoles?.[planetId] ?? "auto";
  if (role !== "auto") return PLANET_INDUSTRY_ROLE_LABELS[role];
  return PLANET_INDUSTRY_ROLE_LABELS[detectedPlanetRole(game, planetId)];
}

export function getRouteEndpointLabel(stationId: string | undefined, game: GameState): string {
  if (!stationId) return "未匹配";
  const station = game.entities.find((entity) => entity.id === stationId);
  if (!station) return "已移除站点";
  return `${getPlanet(station.planetId).name} · ${station.buildingId ? getBuilding(station.buildingId).shortName : "物流站"}`;
}

export function getRouteDistanceLabel(route: StellarRouteSnapshot): string {
  if (route.scope === "local") return "行星内";
  if (route.distanceLy > 0) return `${route.distanceLy.toFixed(1)} ly`;
  return `${route.orbitSpan} 轨道跨度`;
}

export function getSystemName(systemId: StarSystemId): string {
  return getStarSystem(systemId).name;
}
