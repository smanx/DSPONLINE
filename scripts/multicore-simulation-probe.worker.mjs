import { parentPort } from "node:worker_threads";
import { performance } from "node:perf_hooks";

function mix(hash, value) {
  let next = hash ^ (value >>> 0);
  next = Math.imul(next, 0x01000193);
  return next >>> 0;
}

function mixText(hash, value) {
  const text = String(value ?? "");
  let next = hash;
  for (let index = 0; index < text.length; index += 1) next = mix(next, text.charCodeAt(index));
  return next;
}

function mixNumber(hash, value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return mix(hash, 0);
  const scaled = Math.trunc(number * 1_000);
  return mix(mix(hash, scaled), Math.floor(scaled / 0x1_0000_0000));
}

function scanInventory(hash, inventory) {
  let next = hash;
  for (const [itemId, amount] of Object.entries(inventory ?? {})) {
    next = mixText(next, itemId);
    next = mixNumber(next, amount);
  }
  return next;
}

function scanEntity(entity, iteration) {
  let hash = mix(0x811c9dc5, iteration + 1);
  hash = mixText(hash, entity.id);
  hash = mixText(hash, entity.kind);
  hash = mixText(hash, entity.planetId);
  hash = mixText(hash, entity.buildingId);
  hash = mixText(hash, entity.recipeId);
  hash = mixNumber(hash, entity.machineCount);
  hash = mixNumber(hash, entity.minerCount);
  hash = mixNumber(hash, entity.progress);
  hash = mixNumber(hash, entity.productionRate);
  hash = scanInventory(hash, entity.inputs);
  hash = scanInventory(hash, entity.outputs);
  for (const slot of entity.stationSlots ?? []) {
    hash = mixText(hash, slot.itemId);
    hash = mixText(hash, slot.localMode);
    hash = mixText(hash, slot.remoteMode);
    hash = mixNumber(hash, slot.minimumLoad);
    hash = mixNumber(hash, slot.minStock);
    hash = mixNumber(hash, slot.maxStock);
    hash = mixNumber(hash, slot.priority);
  }
  for (const route of entity.stationRoutes ?? []) {
    hash = mixText(hash, route.id);
    hash = mixText(hash, route.peerId);
    hash = mixText(hash, route.itemId);
    hash = mixNumber(hash, route.cargo);
    hash = mixNumber(hash, route.vehicleCount);
    hash = mixNumber(hash, route.progress);
    hash = mixNumber(hash, route.duration);
  }
  return hash >>> 0;
}

function scanBelt(belt, iteration) {
  let hash = mix(0x9e3779b9, iteration + 1);
  hash = mixText(hash, belt.id);
  hash = mixText(hash, belt.planetId);
  hash = mixText(hash, belt.source);
  hash = mixText(hash, belt.target);
  hash = mixText(hash, belt.itemId);
  hash = mixNumber(hash, belt.lanes);
  hash = mixNumber(hash, belt.tier);
  hash = mixNumber(hash, belt.sorterTier);
  hash = mixNumber(hash, belt.stackSize);
  hash = mixNumber(hash, belt.progress);
  hash = mixNumber(hash, belt.lastFlow);
  hash = mixNumber(hash, belt.totalTransferred);
  return hash >>> 0;
}

/**
 * An intentionally optimistic parallel workload: every record is read-only,
 * there are no cross-planet writes, and partial checksums merge commutatively.
 * Real simulation cannot be faster than this without first creating equally
 * strict domain boundaries.
 */
export function scanSimulationPartition(partition, iterations) {
  const startedAt = performance.now();
  let checksumSum = 0;
  let checksumXor = 0;
  let records = 0;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const entity of partition.entities) {
      const hash = scanEntity(entity, iteration);
      checksumSum = (checksumSum + hash) >>> 0;
      checksumXor = (checksumXor ^ hash) >>> 0;
      records += 1;
    }
    for (const belt of partition.belts) {
      const hash = scanBelt(belt, iteration);
      checksumSum = (checksumSum + hash) >>> 0;
      checksumXor = (checksumXor ^ hash) >>> 0;
      records += 1;
    }
  }
  return {
    checksumSum: checksumSum >>> 0,
    checksumXor: checksumXor >>> 0,
    records,
    computeMs: performance.now() - startedAt,
  };
}

if (parentPort) {
  parentPort.on("message", ({ id, partition, iterations }) => {
    try {
      parentPort.postMessage({ id, ok: true, result: scanSimulationPartition(partition, iterations) });
    } catch (error) {
      parentPort.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
}
