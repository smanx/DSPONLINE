import { ITEMS } from "./content";
import { isAchievementId } from "./progression";
import {
  cloneStationContractBoard,
  createStationContractBoard,
  deliverStationContractMutable,
  getStationContractRemaining,
  normalizeStationContractBoard,
  synchronizeStationContracts,
} from "./stationContracts";
import {
  minStationInteger,
  normalizeStationInteger,
  parsePositiveStationInteger,
  stationInteger,
  stationIntegerFromBigInt,
  subtractStationInteger,
} from "./stationMath";
import { getStationDecoration, getStationDecorationPlacementCheck, getStationLevel, stationPointOverlapsFunctionalAnchor } from "./stationDecorations";
import type {
  AchievementId,
  DecimalIntegerString,
  GameState,
  ItemId,
  OrbitalStationStageId,
  OrbitalStationStageRequirementSnapshot,
  OrbitalStationState,
  OrbitalStationStatus,
  PlanetId,
  PublicStationMetricKey,
  SaveMode,
} from "./types";

export const ORBITAL_STATION_STATE_VERSION = 1 as const;
export const ORBITAL_STATION_COST_REVISION = 1 as const;
export const ORBITAL_STATION_DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 0.72 } as const;

export const ORBITAL_STATION_STAGE_COSTS: ReadonlyArray<{
  stageId: OrbitalStationStageId;
  costs: ReadonlyArray<{ itemId: ItemId; amount: DecimalIntegerString }>;
  fleetCosts: Partial<Record<"logistics_vessel", number>>;
}> = [
  {
    stageId: "core",
    costs: [
      { itemId: "titanium_alloy", amount: "200000" },
      { itemId: "frame_material", amount: "100000" },
      { itemId: "processor", amount: "200000" },
      { itemId: "universe_matrix", amount: "20000" },
    ],
    fleetCosts: {},
  },
  {
    stageId: "dock",
    costs: [
      { itemId: "quantum_chip", amount: "100000" },
      { itemId: "particle_container", amount: "200000" },
      { itemId: "space_warper", amount: "20000" },
    ],
    fleetCosts: { logistics_vessel: 200 },
  },
  {
    stageId: "showcase",
    costs: [
      { itemId: "titanium_glass", amount: "300000" },
      { itemId: "particle_broadband", amount: "200000" },
      { itemId: "plastic", amount: "500000" },
      { itemId: "universe_matrix", amount: "50000" },
    ],
    fleetCosts: {},
  },
];

const PUBLIC_METRIC_KEYS = new Set<PublicStationMetricKey>([
  "total-generation",
  "peak-throughput",
  "dyson-power",
  "explored-systems",
  "colonized-planets",
  "universe-matrix-produced",
  "solar-sails-launched",
  "carrier-rockets-launched",
]);

const STATUS_ORDER: OrbitalStationStatus[] = [
  "locked",
  "eligible",
  "core-building",
  "dock-building",
  "showcase-building",
  "operational",
];

function stationProfileText(value: string, maximum: number): string {
  return value.replace(/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, "").trim().slice(0, maximum);
}

function emptyStageRequirements(): OrbitalStationStageRequirementSnapshot[] {
  return ORBITAL_STATION_STAGE_COSTS.map((stage) => ({
    stageId: stage.stageId,
    costs: stage.costs.map((cost) => ({ ...cost })),
    fleetCosts: { ...stage.fleetCosts },
    delivered: {},
    deliveredFleet: {},
  }));
}

export function createOrbitalStationState({
  mode = "normal",
  universeMatrixProduced = 0,
  nowMs = Date.now(),
}: {
  mode?: SaveMode;
  universeMatrixProduced?: number;
  nowMs?: number;
} = {}): OrbitalStationState {
  const eligible = mode === "normal" && Number.isFinite(universeMatrixProduced) && universeMatrixProduced >= 1;
  return {
    stateVersion: ORBITAL_STATION_STATE_VERSION,
    status: eligible ? "eligible" : "locked",
    construction: {
      costRevision: ORBITAL_STATION_COST_REVISION,
      stageRequirements: emptyStageRequirements(),
    },
    viewport: { ...ORBITAL_STATION_DEFAULT_VIEWPORT },
    contractBoard: createStationContractBoard(nowMs),
    economy: {
      orbitalMarks: "0",
      stationReputation: "0",
      unlockedDecorationIds: [],
    },
    layout: {
      themeId: "orbital_teal",
      placements: [],
      featuredAchievementIds: [],
    },
    profile: {
      title: "我的轨道空间站",
      motto: "让每一条生产线通向群星。",
      featuredMetricKeys: ["total-generation", "peak-throughput", "dyson-power"],
    },
    totals: {
      completedContracts: 0,
      exportedByItem: {},
    },
  };
}

export function cloneOrbitalStationState(station: OrbitalStationState): OrbitalStationState {
  return {
    ...station,
    construction: {
      ...station.construction,
      stageRequirements: station.construction.stageRequirements.map((stage) => ({
        ...stage,
        costs: stage.costs.map((cost) => ({ ...cost })),
        fleetCosts: { ...stage.fleetCosts },
        delivered: { ...stage.delivered },
        deliveredFleet: { ...stage.deliveredFleet },
      })),
    },
    viewport: { ...station.viewport },
    contractBoard: cloneStationContractBoard(station.contractBoard),
    economy: { ...station.economy, unlockedDecorationIds: [...station.economy.unlockedDecorationIds] },
    layout: {
      ...station.layout,
      placements: station.layout.placements.map((placement) => ({ ...placement })),
      featuredAchievementIds: [...station.layout.featuredAchievementIds],
    },
    profile: { ...station.profile, featuredMetricKeys: [...station.profile.featuredMetricKeys] },
    totals: { ...station.totals, exportedByItem: { ...station.totals.exportedByItem } },
  };
}

export function getOrbitalStationActiveStageId(status: OrbitalStationStatus): OrbitalStationStageId | null {
  if (status === "eligible" || status === "core-building") return "core";
  if (status === "dock-building") return "dock";
  if (status === "showcase-building") return "showcase";
  return null;
}

export function getOrbitalStationActiveStage(station: OrbitalStationState): OrbitalStationStageRequirementSnapshot | null {
  const stageId = getOrbitalStationActiveStageId(station.status);
  return stageId ? station.construction.stageRequirements.find((stage) => stage.stageId === stageId) ?? null : null;
}

export function getOrbitalStationStageItemRemaining(
  station: OrbitalStationState,
  itemId: ItemId,
): bigint {
  const stage = getOrbitalStationActiveStage(station);
  if (!stage) return 0n;
  return stage.costs.reduce((sum, cost) => {
    if (cost.itemId !== itemId) return sum;
    const required = stationInteger(cost.amount);
    const delivered = stationInteger(stage.delivered[itemId]);
    return sum + (required > delivered ? required - delivered : 0n);
  }, 0n);
}

export function isOrbitalStationStageComplete(stage: OrbitalStationStageRequirementSnapshot): boolean {
  return stage.costs.every((cost) => stationInteger(stage.delivered[cost.itemId]) >= stationInteger(cost.amount)) &&
    Object.entries(stage.fleetCosts).every(([fleetId, amount]) =>
      Math.max(0, Math.floor(stage.deliveredFleet[fleetId as "logistics_vessel"] ?? 0)) >= Math.max(0, Math.floor(amount ?? 0)));
}

function completeCurrentStageMutable(station: OrbitalStationState): boolean {
  const stage = getOrbitalStationActiveStage(station);
  if (!stage || !isOrbitalStationStageComplete(stage)) return false;
  if (stage.stageId === "core") station.status = "dock-building";
  else if (stage.stageId === "dock") station.status = "showcase-building";
  else station.status = "operational";
  return true;
}

export function startOrbitalStationConstruction(station: OrbitalStationState): OrbitalStationState {
  return station.status === "eligible" ? { ...station, status: "core-building" } : station;
}

/** Mutates only a supplied orbital-station clone. */
export function deliverOrbitalStationConstructionMutable(
  station: OrbitalStationState,
  itemId: ItemId,
  amount: bigint,
): DecimalIntegerString {
  if (station.status === "locked" || station.status === "operational" || amount <= 0n) return "0";
  if (station.status === "eligible") station.status = "core-building";
  const stage = getOrbitalStationActiveStage(station);
  if (!stage) return "0";
  const remaining = getOrbitalStationStageItemRemaining(station, itemId);
  const accepted = amount < remaining ? amount : remaining;
  if (accepted <= 0n) return "0";
  stage.delivered[itemId] = stationIntegerFromBigInt(stationInteger(stage.delivered[itemId]) + accepted);
  completeCurrentStageMutable(station);
  return stationIntegerFromBigInt(accepted);
}

export function deliverOrbitalStationFleet(
  state: GameState,
  fleetId: "logistics_vessel",
  requested: number,
): GameState {
  if (state.mode !== "normal" || !Number.isSafeInteger(requested) || requested < 1) return state;
  const stage = getOrbitalStationActiveStage(state.orbitalStation);
  const required = Math.max(0, Math.floor(stage?.fleetCosts[fleetId] ?? 0));
  const delivered = Math.max(0, Math.floor(stage?.deliveredFleet[fleetId] ?? 0));
  const available = Math.max(0, Math.floor(state.portableFleet[fleetId] ?? 0));
  const accepted = Math.min(requested, available, Math.max(0, required - delivered));
  if (!stage || accepted < 1) return state;
  const next: GameState = {
    ...state,
    portableFleet: { ...state.portableFleet, [fleetId]: available - accepted },
    orbitalStation: cloneOrbitalStationState(state.orbitalStation),
  };
  const nextStage = getOrbitalStationActiveStage(next.orbitalStation)!;
  nextStage.deliveredFleet[fleetId] = delivered + accepted;
  completeCurrentStageMutable(next.orbitalStation);
  next.orbitalStation = synchronizeStationContracts(next);
  return next;
}

export type OrbitalStationDeliveryTarget = { kind: "construction" } | { kind: "contract"; contractId: string };
export type OrbitalQuantumDeliveryReason =
  | "delivered"
  | "speedrun"
  | "network-disabled"
  | "invalid-item"
  | "invalid-amount"
  | "empty-inventory"
  | "invalid-target"
  | "target-complete";

export interface OrbitalQuantumDeliveryPreview {
  accepted: DecimalIntegerString;
  inventory: DecimalIntegerString;
  remaining: DecimalIntegerString;
  reason: OrbitalQuantumDeliveryReason;
}

function targetRemaining(
  state: Pick<GameState, "orbitalStation">,
  target: OrbitalStationDeliveryTarget,
  itemId: ItemId,
): bigint {
  if (target.kind === "construction") return getOrbitalStationStageItemRemaining(state.orbitalStation, itemId);
  const contract = state.orbitalStation.contractBoard.accepted.find((candidate) => candidate.id === target.contractId);
  return contract ? getStationContractRemaining(contract, itemId, "quantum") : 0n;
}

export function previewOrbitalQuantumDelivery(
  state: GameState,
  target: OrbitalStationDeliveryTarget,
  itemId: ItemId,
  requested: unknown,
): OrbitalQuantumDeliveryPreview {
  if (state.mode !== "normal") return { accepted: "0", inventory: "0", remaining: "0", reason: "speedrun" };
  if (!state.quantumLogisticsNetwork.enabled) return { accepted: "0", inventory: "0", remaining: "0", reason: "network-disabled" };
  if (!ITEMS[itemId]) return { accepted: "0", inventory: "0", remaining: "0", reason: "invalid-item" };
  const amount = parsePositiveStationInteger(requested);
  if (!amount) return { accepted: "0", inventory: normalizeStationInteger(state.quantumLogisticsNetwork.inventory[itemId]), remaining: "0", reason: "invalid-amount" };
  const inventory = stationInteger(state.quantumLogisticsNetwork.inventory[itemId]);
  const remaining = targetRemaining(state, target, itemId);
  const accepted = stationInteger(minStationInteger(amount, inventory, remaining));
  const reason: OrbitalQuantumDeliveryReason = inventory <= 0n
    ? "empty-inventory"
    : remaining <= 0n
      ? (target.kind === "contract" && !state.orbitalStation.contractBoard.accepted.some((contract) => contract.id === target.contractId) ? "invalid-target" : "target-complete")
      : accepted > 0n ? "delivered" : "invalid-target";
  return {
    accepted: stationIntegerFromBigInt(accepted),
    inventory: stationIntegerFromBigInt(inventory),
    remaining: stationIntegerFromBigInt(remaining),
    reason,
  };
}

export function deliverOrbitalQuantumInventory(
  state: GameState,
  target: OrbitalStationDeliveryTarget,
  itemId: ItemId,
  requested: unknown,
): { state: GameState; accepted: DecimalIntegerString; reason: OrbitalQuantumDeliveryReason } {
  const preview = previewOrbitalQuantumDelivery(state, target, itemId, requested);
  const accepted = stationInteger(preview.accepted);
  if (preview.reason !== "delivered" || accepted <= 0n) return { state, accepted: "0", reason: preview.reason };
  const next: GameState = {
    ...state,
    quantumLogisticsNetwork: {
      ...state.quantumLogisticsNetwork,
      inventory: { ...state.quantumLogisticsNetwork.inventory },
      itemCapacities: { ...state.quantumLogisticsNetwork.itemCapacities },
      routingCursors: { ...state.quantumLogisticsNetwork.routingCursors },
      uploadRoutingCursors: { ...state.quantumLogisticsNetwork.uploadRoutingCursors },
    },
    orbitalStation: cloneOrbitalStationState(state.orbitalStation),
  };
  let delivered = "0";
  if (target.kind === "construction") {
    delivered = deliverOrbitalStationConstructionMutable(next.orbitalStation, itemId, accepted);
  } else {
    delivered = deliverStationContractMutable(next.orbitalStation, target.contractId, itemId, accepted, "quantum").accepted;
  }
  if (stationInteger(delivered) <= 0n) return { state, accepted: "0", reason: "target-complete" };
  next.quantumLogisticsNetwork.inventory[itemId] = subtractStationInteger(next.quantumLogisticsNetwork.inventory[itemId], delivered);
  next.orbitalStation = synchronizeStationContracts(next);
  return { state: next, accepted: delivered, reason: "delivered" };
}

export function synchronizeOrbitalStationEligibility(state: GameState): GameState {
  if (state.mode !== "normal" || state.orbitalStation.status !== "locked" || (state.totalProduced.universe_matrix ?? 0) < 1) return state;
  return { ...state, orbitalStation: { ...state.orbitalStation, status: "eligible" } };
}

export function setOrbitalStationViewport(
  station: OrbitalStationState,
  viewport: { x: number; y: number; zoom: number },
): OrbitalStationState {
  if (![viewport.x, viewport.y, viewport.zoom].every(Number.isFinite)) return station;
  const normalized = {
    x: Math.max(-20_000, Math.min(20_000, viewport.x)),
    y: Math.max(-20_000, Math.min(20_000, viewport.y)),
    zoom: Math.max(0.2, Math.min(2.5, viewport.zoom)),
  };
  return { ...station, viewport: normalized };
}

export function setOrbitalStationProfile(
  station: OrbitalStationState,
  profile: { title?: string; motto?: string; featuredMetricKeys?: PublicStationMetricKey[] },
): OrbitalStationState {
  const title = typeof profile.title === "string" ? stationProfileText(profile.title, 32) : station.profile.title;
  const motto = typeof profile.motto === "string" ? stationProfileText(profile.motto, 96) : station.profile.motto;
  const featuredMetricKeys = Array.isArray(profile.featuredMetricKeys)
    ? [...new Set(profile.featuredMetricKeys.filter((key) => PUBLIC_METRIC_KEYS.has(key)))].slice(0, 4)
    : station.profile.featuredMetricKeys;
  if (!title) return station;
  return { ...station, profile: { title, motto, featuredMetricKeys } };
}

export function setOrbitalStationFeaturedAchievements(
  station: OrbitalStationState,
  achievementIds: AchievementId[],
  unlockedAchievementIds: readonly AchievementId[],
): OrbitalStationState {
  const unlocked = new Set(unlockedAchievementIds);
  const featured = [...new Set(achievementIds.filter((id) => unlocked.has(id)))].slice(0, 8);
  return { ...station, layout: { ...station.layout, featuredAchievementIds: featured } };
}

function normalizeStatus(value: unknown, fallback: OrbitalStationStatus): OrbitalStationStatus {
  return typeof value === "string" && STATUS_ORDER.includes(value as OrbitalStationStatus) ? value as OrbitalStationStatus : fallback;
}

function normalizeStageRequirement(
  value: unknown,
  fallback: OrbitalStationStageRequirementSnapshot,
): OrbitalStationStageRequirementSnapshot {
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<OrbitalStationStageRequirementSnapshot>;
  if (candidate.stageId !== fallback.stageId || !Array.isArray(candidate.costs) ||
    candidate.costs.length !== fallback.costs.length || candidate.costs.some((cost, index) =>
      !cost || cost.itemId !== fallback.costs[index].itemId || normalizeStationInteger(cost.amount) !== fallback.costs[index].amount)) return fallback;
  const expectedFleet = fallback.fleetCosts.logistics_vessel ?? 0;
  if (Math.max(0, Math.floor(candidate.fleetCosts?.logistics_vessel ?? 0)) !== expectedFleet) return fallback;
  const costs = fallback.costs.map((cost) => ({ ...cost }));
  const delivered = Object.fromEntries(costs.map((cost) => {
    const amount = stationInteger(cost.amount);
    const current = stationInteger(candidate.delivered?.[cost.itemId]);
    return [cost.itemId, stationIntegerFromBigInt(current > amount ? amount : current)];
  }));
  const fleetRequired = expectedFleet;
  const fleetDelivered = Math.max(0, Math.min(fleetRequired, Math.floor(candidate.deliveredFleet?.logistics_vessel ?? 0)));
  return {
    stageId: fallback.stageId,
    costs,
    fleetCosts: fleetRequired > 0 ? { logistics_vessel: fleetRequired } : {},
    delivered,
    deliveredFleet: fleetDelivered > 0 ? { logistics_vessel: fleetDelivered } : {},
  };
}

export function normalizeOrbitalStationState(
  value: unknown,
  { mode, universeMatrixProduced, nowMs = Date.now() }: { mode: SaveMode; universeMatrixProduced: number; nowMs?: number },
): OrbitalStationState {
  const fallback = createOrbitalStationState({ mode, universeMatrixProduced, nowMs });
  if (mode !== "normal" || !value || typeof value !== "object") return fallback;
  const candidate = value as Partial<OrbitalStationState>;
  if (candidate.stateVersion !== ORBITAL_STATION_STATE_VERSION) return fallback;
  const sourceStages = Array.isArray(candidate.construction?.stageRequirements) ? candidate.construction.stageRequirements : [];
  const stageRequirements = fallback.construction.stageRequirements.map((stage) =>
    normalizeStageRequirement(sourceStages.find((candidateStage) => candidateStage?.stageId === stage.stageId), stage));
  const viewport = candidate.viewport && [candidate.viewport.x, candidate.viewport.y, candidate.viewport.zoom].every(Number.isFinite)
    ? {
      x: Math.max(-20_000, Math.min(20_000, candidate.viewport.x)),
      y: Math.max(-20_000, Math.min(20_000, candidate.viewport.y)),
      zoom: Math.max(0.2, Math.min(2.5, candidate.viewport.zoom)),
    }
    : fallback.viewport;
  const placementIds = new Set<string>();
  const placements = Array.isArray(candidate.layout?.placements) ? candidate.layout.placements.flatMap((placement) => {
    if (!placement || typeof placement.id !== "string" || !/^[A-Za-z0-9_:-]{1,160}$/.test(placement.id) || placementIds.has(placement.id) ||
      typeof placement.decorationId !== "string" || !/^[a-z][a-z0-9_]{1,80}$/.test(placement.decorationId) ||
      !Number.isFinite(placement.x) || !Number.isFinite(placement.y) ||
      ![0, 90, 180, 270].includes(placement.rotation) || ![0, 1, 2, 3].includes(placement.layer) ||
      !Number.isSafeInteger(placement.variant) || placement.variant < 0 || placement.variant > 31) return [];
    placementIds.add(placement.id);
    return [{
      id: placement.id,
      decorationId: placement.decorationId,
      x: Math.max(-2_000, Math.min(2_000, placement.x)),
      y: Math.max(-2_000, Math.min(2_000, placement.y)),
      rotation: placement.rotation,
      layer: placement.layer,
      variant: placement.variant,
    }];
  }).slice(0, 256) : [];
  const unlockedDecorationIds = Array.isArray(candidate.economy?.unlockedDecorationIds)
    ? [...new Set(candidate.economy.unlockedDecorationIds.filter((id) => typeof id === "string" && /^(?:theme:)?[a-z][a-z0-9_]{1,80}$/.test(id)))].slice(0, 512)
    : [];
  const featuredAchievementIds = Array.isArray(candidate.layout?.featuredAchievementIds)
    ? [...new Set(candidate.layout.featuredAchievementIds.filter((id): id is AchievementId => typeof id === "string" && isAchievementId(id)))].slice(0, 8)
    : [];
  const featuredMetricKeys = Array.isArray(candidate.profile?.featuredMetricKeys)
    ? [...new Set(candidate.profile.featuredMetricKeys.filter((key) => PUBLIC_METRIC_KEYS.has(key)))].slice(0, 4)
    : fallback.profile.featuredMetricKeys;
  const exportedByItem = Object.fromEntries(Object.entries(candidate.totals?.exportedByItem ?? {}).flatMap(([itemId, amount]) =>
    itemId in ITEMS ? [[itemId, normalizeStationInteger(amount)]] : []));
  let status = normalizeStatus(candidate.status, fallback.status);
  if (status === "locked" && universeMatrixProduced >= 1) status = "eligible";
  const station: OrbitalStationState = {
    stateVersion: ORBITAL_STATION_STATE_VERSION,
    status,
    construction: { costRevision: ORBITAL_STATION_COST_REVISION, stageRequirements },
    viewport,
    contractBoard: normalizeStationContractBoard(candidate.contractBoard, nowMs),
    economy: {
      orbitalMarks: normalizeStationInteger(candidate.economy?.orbitalMarks),
      stationReputation: normalizeStationInteger(candidate.economy?.stationReputation),
      unlockedDecorationIds,
    },
    layout: {
      themeId: typeof candidate.layout?.themeId === "string" && /^[a-z][a-z0-9_]{1,80}$/.test(candidate.layout.themeId)
        ? candidate.layout.themeId
        : fallback.layout.themeId,
      placements,
      featuredAchievementIds,
    },
    profile: {
      title: typeof candidate.profile?.title === "string" && stationProfileText(candidate.profile.title, 32)
        ? stationProfileText(candidate.profile.title, 32)
        : fallback.profile.title,
      motto: typeof candidate.profile?.motto === "string" ? stationProfileText(candidate.profile.motto, 96) : fallback.profile.motto,
      featuredMetricKeys,
    },
    totals: {
      completedContracts: Number.isSafeInteger(candidate.totals?.completedContracts)
        ? Math.max(0, Math.floor(candidate.totals!.completedContracts))
        : 0,
      exportedByItem,
    },
  };
  const [coreStage, dockStage, showcaseStage] = station.construction.stageRequirements;
  const maximumSupportedStatus: OrbitalStationStatus = !isOrbitalStationStageComplete(coreStage)
    ? "core-building"
    : !isOrbitalStationStageComplete(dockStage)
      ? "dock-building"
      : !isOrbitalStationStageComplete(showcaseStage)
        ? "showcase-building"
        : "operational";
  if (STATUS_ORDER.indexOf(station.status) > STATUS_ORDER.indexOf(maximumSupportedStatus)) {
    station.status = maximumSupportedStatus;
  }
  // Repair a boundary that was persisted after the final item but before the
  // status transition. Never synthesize materials for a later saved status.
  while (completeCurrentStageMutable(station)) { /* at most three stages */ }
  const normalizedPlacements = [...station.layout.placements];
  station.layout.placements = [];
  for (const placement of normalizedPlacements) {
    const definition = getStationDecoration(placement.decorationId);
    const level = getStationLevel(station.economy.stationReputation);
    const contentPackPlacementIsSafe = !definition && station.layout.placements.length < Math.min(256, level.placementLimit) &&
      Math.abs(placement.x) <= level.halfWidth && Math.abs(placement.y) <= level.halfHeight &&
      !stationPointOverlapsFunctionalAnchor(placement.x, placement.y);
    if (contentPackPlacementIsSafe || getStationDecorationPlacementCheck(station, placement.decorationId, placement, placement.id).ok) {
      station.layout.placements.push(placement);
    }
  }
  return station;
}

export function orbitalStationStatusLabel(status: OrbitalStationStatus): string {
  if (status === "locked") return "尚未解锁";
  if (status === "eligible") return "可开始建设";
  if (status === "core-building") return "轨道核心施工中";
  if (status === "dock-building") return "物资出口港施工中";
  if (status === "showcase-building") return "展示舱段施工中";
  return "空间站已建成";
}

export function orbitalStationSourcePlanetAllowed(
  sourcePlanetId: PlanetId,
  allowedPlanetIds: readonly PlanetId[] | undefined,
): boolean {
  return !allowedPlanetIds?.length || allowedPlanetIds.includes(sourcePlanetId);
}
