import { ITEMS } from "./content";
import {
  cloneOrbitalStationState,
  deliverOrbitalStationConstructionMutable,
  getOrbitalStationStageItemRemaining,
} from "./orbitalStation";
import {
  deliverStationContractMutable,
  getStationContractRemaining,
  synchronizeStationContracts,
} from "./stationContracts";
import { addStationInteger, stationInteger, stationIntegerFromBigInt } from "./stationMath";
import type {
  BeltInputPortIndex,
  FactoryEntity,
  GameState,
  ItemId,
  OrbitalCargoBinding,
  PlanetId,
} from "./types";

export const ORBITAL_CARGO_TERMINAL_PORT_COUNT = 4;
export const ORBITAL_CARGO_TERMINAL_UPLOAD_PER_MINUTE = 20_000;

export function getOrbitalCargoPortItems(entity: FactoryEntity): Array<ItemId | null> {
  if (entity.buildingId !== "orbital_cargo_terminal") return [];
  return Array.from({ length: ORBITAL_CARGO_TERMINAL_PORT_COUNT }, (_, index) => {
    const itemId = entity.orbitalCargoPortItems?.[index];
    return itemId && ITEMS[itemId] ? itemId : null;
  });
}

export function getOrbitalCargoTargetRemaining(
  state: Pick<GameState, "orbitalStation">,
  binding: OrbitalCargoBinding | null | undefined,
  itemId: ItemId,
  sourcePlanetId: PlanetId,
): bigint {
  if (!binding) return 0n;
  if (binding.kind === "construction") return getOrbitalStationStageItemRemaining(state.orbitalStation, itemId);
  const contract = state.orbitalStation.contractBoard.accepted.find((candidate) => candidate.id === binding.contractId);
  return contract ? getStationContractRemaining(contract, itemId, "terminal", sourcePlanetId) : 0n;
}

export function orbitalCargoTerminalAccepts(
  state: Pick<GameState, "mode" | "orbitalStation" | "exploration">,
  entity: FactoryEntity,
  itemId: ItemId,
  requestedPort?: BeltInputPortIndex,
): boolean {
  if (state.mode !== "normal" || entity.buildingId !== "orbital_cargo_terminal" ||
    !state.exploration.colonizedPlanetIds.includes(entity.planetId) || !ITEMS[itemId] ||
    getOrbitalCargoTargetRemaining(state, entity.orbitalCargoBinding, itemId, entity.planetId) <= 0n) return false;
  const ports = getOrbitalCargoPortItems(entity);
  if (requestedPort !== undefined) return requestedPort >= 0 && requestedPort < ORBITAL_CARGO_TERMINAL_PORT_COUNT &&
    (!ports[requestedPort] || ports[requestedPort] === itemId);
  return ports.includes(itemId) || ports.some((candidate) => candidate === null);
}

export function resolveOrbitalCargoPortIndex(
  state: Pick<GameState, "mode" | "orbitalStation" | "exploration">,
  entity: FactoryEntity,
  itemId: ItemId,
  requested?: BeltInputPortIndex,
): BeltInputPortIndex | undefined {
  if (entity.interactionLocked) return undefined;
  if (!orbitalCargoTerminalAccepts(state, entity, itemId, requested)) return undefined;
  const ports = getOrbitalCargoPortItems(entity);
  if (requested !== undefined) return requested;
  const matching = ports.findIndex((candidate) => candidate === itemId);
  if (matching >= 0) return matching as BeltInputPortIndex;
  const empty = ports.findIndex((candidate) => candidate === null);
  return empty >= 0 ? empty as BeltInputPortIndex : undefined;
}

export function configureOrbitalCargoPortMutable(
  entity: FactoryEntity,
  itemId: ItemId,
  portIndex: BeltInputPortIndex | undefined,
): void {
  if (entity.buildingId !== "orbital_cargo_terminal" || portIndex === undefined || !ITEMS[itemId]) return;
  const ports = getOrbitalCargoPortItems(entity);
  if (!ports[portIndex]) ports[portIndex] = itemId;
  entity.orbitalCargoPortItems = ports;
}

export function setOrbitalCargoTerminalBinding(
  state: GameState,
  entityId: string,
  binding: OrbitalCargoBinding | null,
): GameState {
  const entity = state.entities.find((candidate) => candidate.id === entityId && candidate.buildingId === "orbital_cargo_terminal");
  if (!entity || entity.interactionLocked || state.mode !== "normal") return state;
  if (binding?.kind === "construction" && !["eligible", "core-building", "dock-building", "showcase-building"].includes(state.orbitalStation.status)) return state;
  if (binding?.kind === "contract" && !state.orbitalStation.contractBoard.accepted.some((contract) =>
    contract.id === binding.contractId && (contract.status === "accepted" || contract.status === "claimable"))) return state;
  const same = entity.orbitalCargoBinding?.kind === binding?.kind &&
    (binding?.kind !== "contract" || entity.orbitalCargoBinding?.kind === "contract" && entity.orbitalCargoBinding.contractId === binding.contractId);
  if (same || (!entity.orbitalCargoBinding && !binding)) return state;
  return {
    ...state,
    entities: state.entities.map((candidate) => candidate.id === entityId
      ? { ...candidate, orbitalCargoBinding: binding ? { ...binding } : null, orbitalCargoProgress: 0 }
      : candidate),
  };
}

function orbitalCargoBindingIsValid(state: Pick<GameState, "orbitalStation">, binding: OrbitalCargoBinding | null | undefined): boolean {
  if (!binding) return true;
  if (binding.kind === "construction") {
    return ["eligible", "core-building", "dock-building", "showcase-building"].includes(state.orbitalStation.status);
  }
  return state.orbitalStation.contractBoard.accepted.some((contract) =>
    contract.id === binding.contractId && (contract.status === "accepted" || contract.status === "claimable"));
}

/** Clears only invalid targets; buffered cargo and configured ports remain player-owned. */
export function reconcileOrbitalCargoTerminalBindings(state: GameState): GameState {
  let changed = false;
  const entities = state.entities.map((entity) => {
    if (entity.buildingId !== "orbital_cargo_terminal" || orbitalCargoBindingIsValid(state, entity.orbitalCargoBinding)) return entity;
    changed = true;
    return { ...entity, orbitalCargoBinding: null, orbitalCargoProgress: 0 };
  });
  return changed ? { ...state, entities } : state;
}

function reconcileOrbitalCargoTerminalBindingsMutable(state: GameState, terminals: readonly FactoryEntity[]): void {
  for (const entity of terminals) {
    if (entity.buildingId !== "orbital_cargo_terminal" || orbitalCargoBindingIsValid(state, entity.orbitalCargoBinding)) continue;
    entity.orbitalCargoBinding = null;
    entity.orbitalCargoProgress = 0;
  }
}

function deliverTerminalItemMutable(
  state: GameState,
  entity: FactoryEntity,
  itemId: ItemId,
  amount: bigint,
): bigint {
  const binding = entity.orbitalCargoBinding;
  if (!binding || amount <= 0n) return 0n;
  if (binding.kind === "construction") {
    return stationInteger(deliverOrbitalStationConstructionMutable(state.orbitalStation, itemId, amount));
  }
  return stationInteger(deliverStationContractMutable(
    state.orbitalStation,
    binding.contractId,
    itemId,
    amount,
    "terminal",
    entity.planetId,
  ).accepted);
}

/**
 * Deterministic simulation-domain upload. The engine supplies an already
 * isolated state clone, so this routine mutates entity caches and the global
 * station together without a second full GameState copy.
 */
export function settleOrbitalCargoTerminals(state: GameState, seconds: number, indexedTerminals?: readonly FactoryEntity[]): void {
  if (state.mode !== "normal" || state.paused || seconds <= 0 || !Number.isFinite(seconds)) return;
  const sourceTerminals = indexedTerminals ?? state.entities;
  reconcileOrbitalCargoTerminalBindingsMutable(state, sourceTerminals);
  const terminals = sourceTerminals
    .filter((entity) => entity.buildingId === "orbital_cargo_terminal" && entity.orbitalCargoBinding)
    .sort((left, right) => left.id.localeCompare(right.id));
  if (terminals.length === 0) return;
  for (const entity of terminals) {
    const powerFactor = Math.max(0, Math.min(1, Number.isFinite(entity.powerFactor) ? entity.powerFactor ?? 0 : 0));
    const seenItems = new Set<ItemId>();
    const inputs = getOrbitalCargoPortItems(entity).flatMap((itemId, portIndex) => {
      if (!itemId || seenItems.has(itemId)) return [];
      seenItems.add(itemId);
      const buffered = BigInt(Math.max(0, Math.floor(entity.inputs[itemId] ?? 0)));
      const remaining = getOrbitalCargoTargetRemaining(state, entity.orbitalCargoBinding, itemId, entity.planetId);
      const available = buffered < remaining ? buffered : remaining;
      return available > 0n ? [{ itemId, portIndex, available, planned: 0n }] : [];
    });
    if (powerFactor <= 0 || inputs.length === 0) {
      entity.utilization = 0;
      entity.productionRate = 0;
      continue;
    }
    const accumulated = Math.max(0, entity.orbitalCargoProgress ?? 0) +
      ORBITAL_CARGO_TERMINAL_UPLOAD_PER_MINUTE * seconds * powerFactor / 60;
    let budget = Math.max(0, Math.floor(accumulated + 1e-9));
    entity.orbitalCargoProgress = Math.max(0, Math.min(0.999999999, accumulated - budget));
    let cursor = Math.max(0, Math.floor(entity.routingCursor ?? 0)) % ORBITAL_CARGO_TERMINAL_PORT_COUNT;
    let remainingBudget = BigInt(budget);
    while (remainingBudget > 0n) {
      const active = inputs.filter((entry) => entry.available > 0n);
      if (active.length === 0) break;
      const orderedActive = Array.from({ length: ORBITAL_CARGO_TERMINAL_PORT_COUNT }, (_, offset) =>
        active.find((entry) => entry.portIndex === (cursor + offset) % ORBITAL_CARGO_TERMINAL_PORT_COUNT))
        .filter((entry): entry is (typeof active)[number] => Boolean(entry));
      const fullRounds = remainingBudget / BigInt(active.length);
      const minimumAvailable = active.reduce((minimum, entry) => entry.available < minimum ? entry.available : minimum, active[0].available);
      const rounds = fullRounds < minimumAvailable ? fullRounds : minimumAvailable;
      if (rounds > 0n) {
        for (const entry of active) {
          entry.available -= rounds;
          entry.planned += rounds;
        }
        remainingBudget -= rounds * BigInt(active.length);
        const lastPortIndex = orderedActive.at(-1)!.portIndex;
        cursor = Array.from({ length: ORBITAL_CARGO_TERMINAL_PORT_COUNT }, (_, offset) =>
          (lastPortIndex + offset + 1) % ORBITAL_CARGO_TERMINAL_PORT_COUNT)
          .find((nextPortIndex) => active.some((candidate) => candidate.portIndex === nextPortIndex && candidate.available > 0n))
          ?? (lastPortIndex + 1) % ORBITAL_CARGO_TERMINAL_PORT_COUNT;
        continue;
      }
      let allocated = false;
      const startCursor = cursor;
      for (let offset = 0; offset < ORBITAL_CARGO_TERMINAL_PORT_COUNT && remainingBudget > 0n; offset += 1) {
        const portIndex = (startCursor + offset) % ORBITAL_CARGO_TERMINAL_PORT_COUNT;
        const entry = active.find((candidate) => candidate.portIndex === portIndex && candidate.available > 0n);
        if (!entry) continue;
        entry.available -= 1n;
        entry.planned += 1n;
        remainingBudget -= 1n;
        cursor = Array.from({ length: ORBITAL_CARGO_TERMINAL_PORT_COUNT }, (_, nextOffset) =>
          (portIndex + nextOffset + 1) % ORBITAL_CARGO_TERMINAL_PORT_COUNT)
          .find((nextPortIndex) => active.some((candidate) => candidate.portIndex === nextPortIndex && candidate.available > 0n))
          ?? (portIndex + 1) % ORBITAL_CARGO_TERMINAL_PORT_COUNT;
        allocated = true;
      }
      if (!allocated) break;
    }
    let uploaded = 0n;
    for (const { itemId, planned } of inputs) {
      if (planned <= 0n) continue;
      const accepted = deliverTerminalItemMutable(state, entity, itemId, planned);
      if (accepted <= 0n) continue;
      entity.inputs[itemId] = Math.max(0, Math.floor(entity.inputs[itemId] ?? 0) - Number(accepted));
      uploaded += accepted;
    }
    entity.routingCursor = cursor;
    entity.orbitalCargoTotalUploaded = addStationInteger(entity.orbitalCargoTotalUploaded, uploaded);
    entity.utilization = uploaded > 0n ? powerFactor : 0;
    entity.productionRate = seconds > 0 ? Number(uploaded) * 60 / seconds : 0;
  }
  state.orbitalStation = synchronizeStationContracts(state, state.orbitalStation.contractBoard.lastConfirmedWallClockMs);
  reconcileOrbitalCargoTerminalBindingsMutable(state, sourceTerminals);
}

export function cloneOrbitalCargoFields(entity: FactoryEntity): Pick<FactoryEntity,
  "orbitalCargoPortItems" | "orbitalCargoBinding" | "orbitalCargoProgress" | "orbitalCargoTotalUploaded"> {
  return {
    orbitalCargoPortItems: entity.orbitalCargoPortItems ? [...entity.orbitalCargoPortItems] : undefined,
    orbitalCargoBinding: entity.orbitalCargoBinding ? { ...entity.orbitalCargoBinding } : entity.orbitalCargoBinding,
    orbitalCargoProgress: entity.orbitalCargoProgress,
    orbitalCargoTotalUploaded: entity.orbitalCargoTotalUploaded,
  };
}

export function orbitalCargoTerminalSourceAllowed(
  entity: Pick<FactoryEntity, "planetId">,
  allowedPlanetIds: readonly PlanetId[] | undefined,
): boolean {
  return !allowedPlanetIds?.length || allowedPlanetIds.includes(entity.planetId);
}

export function orbitalCargoAmountLabel(amount: bigint): string {
  return stationIntegerFromBigInt(amount);
}
