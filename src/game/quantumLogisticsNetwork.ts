import type {
  DecimalIntegerString,
  FactoryEntity,
  GameState,
  ItemId,
  QuantumBridgeContract,
  QuantumLogisticsNetworkState,
  QuantumStationMode,
} from "./types";

/** A quantum settlement is intentionally quantized in persistent simulation time. */
export const QUANTUM_SETTLEMENT_SECONDS = 5;
export const QUANTUM_UNIT_CAP_PER_MINUTE = 400;
export const QUANTUM_MAX_INTEGER_DIGITS = 256;
export const QUANTUM_DEFAULT_LEVEL = 0;

function decimal(value: bigint): DecimalIntegerString {
  if (value <= 0n) return "0";
  const normalized = value.toString();
  return normalized.length <= QUANTUM_MAX_INTEGER_DIGITS
    ? normalized
    : "9".repeat(QUANTUM_MAX_INTEGER_DIGITS);
}

/**
 * Normalize persisted quantities without accepting signs, fractions,
 * exponent notation, NaN, Infinity, or values that would make JSON unsafe.
 */
export function normalizeQuantumInteger(value: unknown, fallback: DecimalIntegerString = "0"): DecimalIntegerString {
  if (typeof value === "bigint") return value >= 0n && value.toString().length <= QUANTUM_MAX_INTEGER_DIGITS ? value.toString() : fallback;
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? String(value) : fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return fallback;
  const normalized = value.replace(/^0+(?=\d)/, "");
  return normalized.length <= QUANTUM_MAX_INTEGER_DIGITS ? normalized : fallback;
}

function integer(value: unknown): bigint {
  return BigInt(normalizeQuantumInteger(value));
}

export function compareQuantumInteger(left: unknown, right: unknown): -1 | 0 | 1 {
  const a = integer(left);
  const b = integer(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function addQuantumInteger(left: unknown, right: unknown): DecimalIntegerString {
  return decimal(integer(left) + integer(right));
}

export function subtractQuantumInteger(left: unknown, right: unknown): DecimalIntegerString {
  const result = integer(left) - integer(right);
  return decimal(result > 0n ? result : 0n);
}

export function minQuantumInteger(...values: unknown[]): DecimalIntegerString {
  if (values.length === 0) return "0";
  return decimal(values.map(integer).reduce((min, value) => value < min ? value : min));
}

export interface QuantumBandwidth {
  mode: QuantumStationMode;
  powerFactor: number;
  multiplier: number;
  uploadPerMinute: number;
  downloadPerMinute: number;
  uploadPerBoundary: number;
  downloadPerBoundary: number;
}

/**
 * Galactic logistics uses both speed and payload improvements. The square is
 * kept in one place so UI, simulation and diagnostics cannot drift apart.
 */
export function getQuantumLogisticsMultiplier(level: number): number {
  const normalizedLevel = Number.isFinite(level) ? Math.max(0, Math.floor(level)) : QUANTUM_DEFAULT_LEVEL;
  const base = 1 + 0.05 * normalizedLevel;
  return base * base;
}

export function getQuantumTowerBandwidth(
  entity: Pick<FactoryEntity, "buildingId" | "machineCount" | "quantumMode">,
  level: number,
  powerFactor = 1,
): QuantumBandwidth {
  const mode = entity.quantumMode ?? "legacy";
  const normalizedPower = Number.isFinite(powerFactor) ? Math.max(0, Math.min(1, powerFactor)) : 0;
  const multiplier = getQuantumLogisticsMultiplier(level);
  const active = entity.buildingId === "interstellar_logistics_station" && mode === "quantum";
  const count = active && Number.isFinite(entity.machineCount) ? Math.max(0, Math.floor(entity.machineCount)) : 0;
  const uploadPerMinute = QUANTUM_UNIT_CAP_PER_MINUTE * multiplier * count * normalizedPower;
  const boundaryFactor = QUANTUM_SETTLEMENT_SECONDS / 60;
  return {
    mode,
    powerFactor: normalizedPower,
    multiplier,
    uploadPerMinute,
    downloadPerMinute: uploadPerMinute,
    uploadPerBoundary: Math.max(0, Math.floor(uploadPerMinute * boundaryFactor)),
    downloadPerBoundary: Math.max(0, Math.floor(uploadPerMinute * boundaryFactor)),
  };
}

export interface QuantumBandwidthSummary {
  multiplier: number;
  globalUploadPerMinute: number;
  globalDownloadPerMinute: number;
  activeTowerCount: number;
}

export function getQuantumBandwidthSummary(
  entities: readonly (Pick<FactoryEntity, "buildingId" | "machineCount" | "quantumMode"> & { id?: string })[],
  level: number,
  powerFactors: Readonly<Record<string, number>> = {},
): QuantumBandwidthSummary {
  let globalUploadPerMinute = 0;
  let activeTowerCount = 0;
  for (const [index, entity] of entities.entries()) {
    const bandwidth = getQuantumTowerBandwidth(entity, level, powerFactors[entity.id ?? String(index)] ?? 1);
    if (bandwidth.mode === "quantum" && bandwidth.uploadPerMinute > 0) activeTowerCount += 1;
    globalUploadPerMinute += bandwidth.uploadPerMinute;
  }
  return {
    multiplier: getQuantumLogisticsMultiplier(level),
    globalUploadPerMinute,
    globalDownloadPerMinute: globalUploadPerMinute,
    activeTowerCount,
  };
}

export function createEmptyQuantumLogisticsNetworkState(): QuantumLogisticsNetworkState {
  return { enabled: false, inventory: {}, routingCursors: {} as Record<ItemId, number> };
}

export function normalizeQuantumLogisticsNetworkState(value: unknown): QuantumLogisticsNetworkState {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const inventory: Partial<Record<ItemId, DecimalIntegerString>> = {};
  if (raw.inventory && typeof raw.inventory === "object" && !Array.isArray(raw.inventory)) {
    for (const [itemId, amount] of Object.entries(raw.inventory)) {
      const normalized = normalizeQuantumInteger(amount);
      if (normalized !== "0") inventory[itemId as ItemId] = normalized;
    }
  }
  const routingCursors = {} as Record<ItemId, number>;
  if (raw.routingCursors && typeof raw.routingCursors === "object" && !Array.isArray(raw.routingCursors)) {
    for (const [itemId, cursor] of Object.entries(raw.routingCursors)) {
      if (typeof cursor === "number" && Number.isSafeInteger(cursor) && cursor >= 0) {
        routingCursors[itemId as ItemId] = cursor;
      }
    }
  }
  return { enabled: raw.enabled === true, inventory, routingCursors };
}

export interface QuantumSettlementInput {
  key: string;
  stationId: string;
  itemId: ItemId;
  requested: DecimalIntegerString | number;
  /** Higher priority inputs are accepted first when one tower has many lines. */
  priority?: number;
}

export interface QuantumSettlementOutput extends QuantumSettlementInput {
  /** Downstream capacity for this line during the boundary. */
  capacity: DecimalIntegerString | number;
}

export interface QuantumSettlementOptions {
  seconds?: number;
  uploadCapByStation?: Readonly<Record<string, number>>;
  downloadCapByStation?: Readonly<Record<string, number>>;
}

export interface QuantumSettlementDiagnostics {
  requestedInput: DecimalIntegerString;
  acceptedInput: DecimalIntegerString;
  requestedOutput: DecimalIntegerString;
  deliveredOutput: DecimalIntegerString;
  blockedByUploadBandwidth: DecimalIntegerString;
  blockedByDownloadBandwidth: DecimalIntegerString;
  blockedByInventory: DecimalIntegerString;
  activeItems: ItemId[];
}

export interface QuantumSettlementResult {
  state: QuantumLogisticsNetworkState;
  inputAccepted: Record<string, DecimalIntegerString>;
  outputDelivered: Record<string, DecimalIntegerString>;
  diagnostics: QuantumSettlementDiagnostics;
}

function safeFloor(value: unknown): bigint {
  const normalized = normalizeQuantumInteger(value);
  return BigInt(normalized);
}

function stableRequests<T extends { key: string; itemId: ItemId; stationId: string; requested: unknown; priority?: number }>(requests: readonly T[]): T[] {
  return requests
    .filter((request) => request.key.length > 0 && safeFloor(request.requested) > 0n)
    .map((request) => ({ ...request, priority: Number.isFinite(request.priority) ? Math.floor(request.priority!) : 1 }))
    .sort((left, right) => right.priority! - left.priority! || left.key.localeCompare(right.key));
}

function allocateProportionally(
  budget: bigint,
  requests: readonly { key: string; amount: bigint }[],
  cursor: number,
): { values: Record<string, bigint>; total: bigint; nextCursor: number } {
  const ordered = [...requests].filter((request) => request.amount > 0n).sort((a, b) => a.key.localeCompare(b.key));
  const values: Record<string, bigint> = {};
  if (ordered.length === 0 || budget <= 0n) return { values, total: 0n, nextCursor: 0 };
  const totalRequested = ordered.reduce((sum, request) => sum + request.amount, 0n);
  const available = budget < totalRequested ? budget : totalRequested;
  let allocated = 0n;
  for (const request of ordered) {
    const amount = available * request.amount / totalRequested;
    values[request.key] = amount;
    allocated += amount;
  }
  let remainder = available - allocated;
  const normalizedCursor = ((Number.isSafeInteger(cursor) ? cursor : 0) % ordered.length + ordered.length) % ordered.length;
  let offset = 0;
  while (remainder > 0n && offset < ordered.length * 2) {
    const request = ordered[(normalizedCursor + offset) % ordered.length];
    const current = values[request.key] ?? 0n;
    if (current < request.amount) {
      values[request.key] = current + 1n;
      remainder -= 1n;
    }
    offset += 1;
  }
  const distributed = available - remainder;
  return {
    values,
    total: distributed,
    nextCursor: (normalizedCursor + Number(distributed % BigInt(ordered.length))) % ordered.length,
  };
}

function allocateWithPriority(
  budget: bigint,
  requests: readonly { key: string; amount: bigint; priority?: number }[],
  cursor: number,
): { values: Record<string, bigint>; total: bigint; nextCursor: number } {
  const values: Record<string, bigint> = {};
  let remaining = budget > 0n ? budget : 0n;
  let total = 0n;
  let nextCursor = cursor;
  const priorities = [...new Set(requests.map((request) => Number.isFinite(request.priority) ? Math.floor(request.priority!) : 1))]
    .sort((left, right) => right - left);
  for (const priority of priorities) {
    if (remaining <= 0n) break;
    const group = requests.filter((request) => (Number.isFinite(request.priority) ? Math.floor(request.priority!) : 1) === priority);
    const allocation = allocateProportionally(remaining, group, nextCursor);
    Object.assign(values, allocation.values);
    total += allocation.total;
    remaining -= allocation.total;
    nextCursor = allocation.nextCursor;
  }
  return { values, total, nextCursor };
}

function allocateByStationCap(
  requests: readonly QuantumSettlementInput[],
  caps: Readonly<Record<string, number>> | undefined,
): Record<string, bigint> {
  const values: Record<string, bigint> = {};
  const byStation = new Map<string, QuantumSettlementInput[]>();
  for (const request of stableRequests(requests)) {
    const bucket = byStation.get(request.stationId) ?? [];
    bucket.push(request);
    byStation.set(request.stationId, bucket);
  }
  for (const [stationId, stationRequests] of byStation) {
    const cap = caps?.[stationId];
    const budget = cap === undefined || !Number.isFinite(cap) ?
      stationRequests.reduce((sum, request) => sum + safeFloor(request.requested), 0n) : BigInt(Math.max(0, Math.floor(cap)));
    const allocated = allocateWithPriority(
      budget,
      stationRequests.map((request) => ({ key: request.key, amount: safeFloor(request.requested), priority: request.priority })),
      0,
    );
    Object.assign(values, allocated.values);
  }
  return values;
}

function allocateOutputs(
  state: QuantumLogisticsNetworkState,
  requests: readonly QuantumSettlementOutput[],
  caps: Readonly<Record<string, number>> | undefined,
): { values: Record<string, bigint>; delivered: bigint; requested: bigint; blockedBandwidth: bigint; blockedInventory: bigint; activeItems: ItemId[] } {
  const values: Record<string, bigint> = {};
  let delivered = 0n;
  let requested = 0n;
  let blockedBandwidth = 0n;
  let blockedInventory = 0n;
  const activeItems = new Set<ItemId>();
  const byItem = new Map<ItemId, QuantumSettlementOutput[]>();
  for (const request of stableRequests(requests)) {
    const capacity = safeFloor(request.capacity);
    const requestedAmount = safeFloor(request.requested);
    const amount = capacity < requestedAmount ? capacity : requestedAmount;
    if (amount <= 0n) continue;
    requested += amount;
    activeItems.add(request.itemId);
    const bucket = byItem.get(request.itemId) ?? [];
    bucket.push({ ...request, requested: decimal(amount) });
    byItem.set(request.itemId, bucket);
  }
  const byStation = new Map<string, QuantumSettlementOutput[]>();
  for (const request of requests) {
    const desired = safeFloor(request.requested) < safeFloor(request.capacity) ? safeFloor(request.requested) : safeFloor(request.capacity);
    if (desired <= 0n) continue;
    const bucket = byStation.get(request.stationId) ?? [];
    bucket.push({ ...request, requested: decimal(desired) });
    byStation.set(request.stationId, bucket);
  }
  const stationAllocations: Record<string, bigint> = {};
  for (const [stationId, stationRequests] of byStation) {
    const max = caps?.[stationId];
    const budget = max === undefined || !Number.isFinite(max)
      ? stationRequests.reduce((sum, request) => sum + safeFloor(request.requested), 0n)
      : BigInt(Math.max(0, Math.floor(max)));
    const allocation = allocateWithPriority(
      budget,
      stationRequests.map((request) => ({ key: request.key, amount: safeFloor(request.requested), priority: request.priority })),
      0,
    );
    Object.assign(stationAllocations, allocation.values);
    blockedBandwidth += stationRequests.reduce((sum, request) => sum + safeFloor(request.requested), 0n) - allocation.total;
  }
  for (const [itemId, itemRequests] of byItem) {
    const available = integer(state.inventory[itemId]);
    const planned = itemRequests.reduce((sum, request) => sum + (stationAllocations[request.key] ?? 0n), 0n);
    const itemBudget = available < planned ? available : planned;
    const allocation = allocateProportionally(
      itemBudget,
      itemRequests.map((request) => ({ key: request.key, amount: stationAllocations[request.key] ?? 0n })),
      state.routingCursors[itemId] ?? 0,
    );
    for (const request of itemRequests) values[request.key] = allocation.values[request.key] ?? 0n;
    delivered += allocation.total;
    state.inventory[itemId] = decimal(available - allocation.total);
    if (allocation.total < planned && itemRequests.length > 0) state.routingCursors[itemId] = (state.routingCursors[itemId] ?? 0) + 1;
    blockedInventory += planned > allocation.total ? planned - allocation.total : 0n;
  }
  return { values, delivered, requested, blockedBandwidth, blockedInventory, activeItems: [...activeItems].sort() };
}

/**
 * Settle one deterministic quantum boundary. Inputs are committed first,
 * outputs then withdraw only what is present and what downstream can receive.
 * The function is pure with respect to its argument and performs no loops
 * proportional to item quantity.
 */
export function settleQuantumLogisticsNetwork(
  network: QuantumLogisticsNetworkState,
  inputs: readonly QuantumSettlementInput[],
  outputs: readonly QuantumSettlementOutput[],
  options: QuantumSettlementOptions = {},
): QuantumSettlementResult {
  const state = normalizeQuantumLogisticsNetworkState(network);
  if (!state.enabled) {
    return {
      state,
      inputAccepted: {},
      outputDelivered: {},
      diagnostics: {
        requestedInput: "0", acceptedInput: "0", requestedOutput: "0", deliveredOutput: "0",
        blockedByUploadBandwidth: "0", blockedByDownloadBandwidth: "0", blockedByInventory: "0", activeItems: [],
      },
    };
  }
  const seconds = Math.max(1, Math.floor(options.seconds ?? QUANTUM_SETTLEMENT_SECONDS));
  void seconds; // The caller supplies per-boundary caps; keeping seconds explicit documents the contract.
  const inputAccepted: Record<string, DecimalIntegerString> = {};
  const inputAllocations = allocateByStationCap(inputs, options.uploadCapByStation);
  let requestedInput = 0n;
  let acceptedInput = 0n;
  for (const request of stableRequests(inputs)) {
    const requested = safeFloor(request.requested);
    const accepted = inputAllocations[request.key] ?? 0n;
    requestedInput += requested;
    acceptedInput += accepted;
    inputAccepted[request.key] = decimal(accepted);
    if (accepted > 0n) state.inventory[request.itemId] = addQuantumInteger(state.inventory[request.itemId], decimal(accepted));
  }
  const outputResult = allocateOutputs(state, outputs, options.downloadCapByStation);
  const outputDelivered: Record<string, DecimalIntegerString> = {};
  for (const [key, amount] of Object.entries(outputResult.values)) outputDelivered[key] = decimal(amount);
  const requestedOutput = outputResult.requested;
  return {
    state,
    inputAccepted,
    outputDelivered,
    diagnostics: {
      requestedInput: decimal(requestedInput),
      acceptedInput: decimal(acceptedInput),
      requestedOutput: decimal(requestedOutput),
      deliveredOutput: decimal(outputResult.delivered),
      blockedByUploadBandwidth: decimal(requestedInput > acceptedInput ? requestedInput - acceptedInput : 0n),
      blockedByDownloadBandwidth: decimal(outputResult.blockedBandwidth),
      blockedByInventory: decimal(outputResult.blockedInventory),
      activeItems: outputResult.activeItems,
    },
  };
}

export interface QuantumAttachmentResult {
  state: GameState;
  changed: boolean;
  reason?: "missing-station" | "not-upgraded" | "already-quantum" | "transition-active";
}

function isInterstellarTower(entity: FactoryEntity | undefined): entity is FactoryEntity {
  return Boolean(entity?.kind === "station" && entity.buildingId === "interstellar_logistics_station");
}

function cloneNetwork(network: QuantumLogisticsNetworkState): QuantumLogisticsNetworkState {
  return {
    enabled: network.enabled,
    inventory: { ...network.inventory },
    routingCursors: { ...network.routingCursors },
  };
}

/** Mark a station for the next five-second handoff without deleting routes. */
export function beginQuantumAttachment(state: GameState, stationId: string): QuantumAttachmentResult {
  const station = state.entities.find((entity) => entity.id === stationId);
  if (!isInterstellarTower(station)) return { state, changed: false, reason: "missing-station" };
  if ((station.stationTier ?? 1) < 2) return { state, changed: false, reason: "not-upgraded" };
  if (station.quantumMode === "quantum") return { state, changed: false, reason: "already-quantum" };
  if (station.quantumTransition) return { state, changed: false, reason: "transition-active" };
  const next: GameState = {
    ...state,
    entities: state.entities.map((entity) => entity.id === stationId ? {
      ...entity,
      quantumMode: "transitioning",
      quantumTransition: {
        targetMode: "quantum",
        startedAtSecond: state.elapsedSeconds,
        boundarySecond: (Math.floor(state.elapsedSeconds / QUANTUM_SETTLEMENT_SECONDS) + 1) * QUANTUM_SETTLEMENT_SECONDS,
        bridges: (entity.stationRoutes ?? []).map((route): QuantumBridgeContract => ({
          id: `quantum_bridge_${route.id}`,
          itemId: route.itemId,
          sourceStationId: route.scope === "remote" ? route.peerId : stationId,
          targetStationId: route.scope === "remote" ? stationId : route.peerId,
          cargo: normalizeQuantumInteger(route.cargo),
          remainingCargo: normalizeQuantumInteger(route.cargo),
          arriveAtSecond: state.elapsedSeconds + Math.max(1, route.duration),
        })),
      },
    } : entity),
  };
  return { state: next, changed: true };
}

/** Complete or cancel a handoff only at/after its persisted boundary. */
export function settleQuantumAttachment(state: GameState, stationId: string, cancel = false): QuantumAttachmentResult {
  const station = state.entities.find((entity) => entity.id === stationId);
  if (!station?.quantumTransition) return { state, changed: false, reason: "transition-active" };
  const transition = station.quantumTransition;
  if (!cancel && state.elapsedSeconds < transition.boundarySecond) return { state, changed: false };
  if (!cancel && ((station.stationRoutes?.length ?? 0) > 0 || transition.bridges.some((bridge) => compareQuantumInteger(bridge.remainingCargo, "0") > 0))) {
    return { state, changed: false };
  }
  const targetMode: QuantumStationMode = cancel ? "legacy" : transition.targetMode;
  const next: GameState = {
    ...state,
    quantumLogisticsNetwork: {
      ...cloneNetwork(state.quantumLogisticsNetwork),
      enabled: cancel ? state.quantumLogisticsNetwork.enabled : true,
    },
    entities: state.entities.map((entity) => entity.id === stationId ? {
      ...entity,
      quantumMode: targetMode,
      quantumTransition: null,
    } : entity),
  };
  return { state: next, changed: true };
}
