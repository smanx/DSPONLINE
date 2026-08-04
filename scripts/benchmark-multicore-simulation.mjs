import { readFile } from "node:fs/promises";
import { availableParallelism, cpus } from "node:os";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { scanSimulationPartition } from "./multicore-simulation-probe.worker.mjs";

const argumentsByName = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...value] = argument.replace(/^--/, "").split("=");
  return [key, value.join("=") || "true"];
}));
const fixturePath = resolve(argumentsByName.get("fixture") ?? "");
const iterations = Math.max(1, Math.min(256, Number.parseInt(argumentsByName.get("iterations") ?? "24", 10)));
const runs = Math.max(3, Math.min(15, Number.parseInt(argumentsByName.get("runs") ?? "7", 10)));
const requestedCounts = (argumentsByName.get("workers") ?? "1,2,4,8,12,16")
  .split(",")
  .map((value) => Number.parseInt(value, 10))
  .filter((value) => Number.isSafeInteger(value) && value > 0);

if (!argumentsByName.has("fixture")) throw new Error("Use --fixture=<local save JSON>. The probe never writes or uploads the save.");

function percentile(values, ratio) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * ratio) - 1))] ?? 0;
}

function mergeResults(results) {
  return results.reduce((merged, result) => ({
    checksumSum: (merged.checksumSum + result.checksumSum) >>> 0,
    checksumXor: (merged.checksumXor ^ result.checksumXor) >>> 0,
    records: merged.records + result.records,
    criticalComputeMs: Math.max(merged.criticalComputeMs, result.computeMs),
  }), { checksumSum: 0, checksumXor: 0, records: 0, criticalComputeMs: 0 });
}

function buildPlanetUnits(state) {
  const units = new Map();
  const get = (planetId) => {
    const key = String(planetId ?? "unknown");
    const current = units.get(key) ?? { planetId: key, entities: [], belts: [], weight: 0 };
    units.set(key, current);
    return current;
  };
  for (const entity of state.entities) {
    const unit = get(entity.planetId);
    unit.entities.push(entity);
    unit.weight += 1 + Object.keys(entity.inputs ?? {}).length + Object.keys(entity.outputs ?? {}).length +
      (entity.stationSlots?.length ?? 0) * 2 + (entity.stationRoutes?.length ?? 0) * 4;
  }
  for (const belt of state.belts) {
    const unit = get(belt.planetId);
    unit.belts.push(belt);
    unit.weight += 2;
  }
  return [...units.values()].sort((left, right) => right.weight - left.weight || left.planetId.localeCompare(right.planetId));
}

function partitionUnits(units, count) {
  const partitions = Array.from({ length: Math.min(count, Math.max(1, units.length)) }, () => ({ entities: [], belts: [], weight: 0 }));
  for (const unit of units) {
    partitions.sort((left, right) => left.weight - right.weight);
    const target = partitions[0];
    target.entities.push(...unit.entities);
    target.belts.push(...unit.belts);
    target.weight += unit.weight;
  }
  return partitions.map(({ entities, belts }) => ({ entities, belts }));
}

class ProbeWorker {
  constructor() {
    this.worker = new Worker(new URL("./multicore-simulation-probe.worker.mjs", import.meta.url), { type: "module" });
    this.nextId = 1;
    this.pending = new Map();
    this.worker.on("message", (message) => {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.ok) pending.resolve(message.result);
      else pending.reject(new Error(message.error));
    });
    this.worker.on("error", (error) => {
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    });
  }

  run(partition) {
    const id = this.nextId++;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.worker.postMessage({ id, partition, iterations });
    });
  }

  terminate() {
    return this.worker.terminate();
  }
}

const raw = JSON.parse(await readFile(fixturePath, "utf8"));
const state = raw.state ?? raw;
if (!Array.isArray(state.entities) || !Array.isArray(state.belts)) throw new Error("Fixture is missing entities or belts.");
const units = buildPlanetUnits(state);
const serialPartition = partitionUnits(units, 1)[0];
for (let warmup = 0; warmup < 2; warmup += 1) scanSimulationPartition(serialPartition, iterations);
const serialSamples = Array.from({ length: runs }, () => scanSimulationPartition(serialPartition, iterations));
const serialMedianMs = percentile(serialSamples.map((sample) => sample.computeMs), 0.5);
const oracle = serialSamples[0];

const results = [];
for (const requestedCount of requestedCounts) {
  const partitions = partitionUnits(units, requestedCount);
  const workers = partitions.map(() => new ProbeWorker());
  const run = async () => {
    const startedAt = performance.now();
    const merged = mergeResults(await Promise.all(partitions.map((partition, index) => workers[index].run(partition))));
    return { ...merged, wallMs: performance.now() - startedAt };
  };
  await run();
  global.gc?.();
  const beforeHeap = process.memoryUsage().heapUsed;
  const samples = [];
  for (let runIndex = 0; runIndex < runs; runIndex += 1) samples.push(await run());
  await Promise.all(workers.map((worker) => worker.terminate()));
  global.gc?.();
  const afterHeap = process.memoryUsage().heapUsed;
  for (const sample of samples) {
    if (sample.checksumSum !== oracle.checksumSum || sample.checksumXor !== oracle.checksumXor || sample.records !== oracle.records) {
      throw new Error(`Worker count ${requestedCount} failed the deterministic checksum oracle.`);
    }
  }
  const wallValues = samples.map((sample) => sample.wallMs);
  const medianWallMs = percentile(wallValues, 0.5);
  const medianCriticalComputeMs = percentile(samples.map((sample) => sample.criticalComputeMs), 0.5);
  results.push({
    requestedWorkers: requestedCount,
    actualWorkers: partitions.length,
    medianWallMs: Number(medianWallMs.toFixed(2)),
    p95WallMs: Number(percentile(wallValues, 0.95).toFixed(2)),
    medianCriticalComputeMs: Number(medianCriticalComputeMs.toFixed(2)),
    medianTransferAndMergeMs: Number(Math.max(0, medianWallMs - medianCriticalComputeMs).toFixed(2)),
    speedupVsCoordinatorSerial: Number((serialMedianMs / medianWallMs).toFixed(3)),
    heapDeltaMiB: Number(((afterHeap - beforeHeap) / 1024 / 1024).toFixed(2)),
  });
}

console.log(`MULTICORE_SIMULATION_PROBE ${JSON.stringify({
  generatedAt: new Date().toISOString(),
  fixture: {
    bytes: (await readFile(fixturePath)).byteLength,
    entities: state.entities.length,
    belts: state.belts.length,
    planets: units.length,
  },
  host: {
    logicalProcessors: cpus().length,
    availableParallelism: availableParallelism(),
    node: process.version,
  },
  workload: {
    iterations,
    runs,
    recordsPerRun: oracle.records,
    serialMedianMs: Number(serialMedianMs.toFixed(2)),
    serialP95Ms: Number(percentile(serialSamples.map((sample) => sample.computeMs), 0.95).toFixed(2)),
    checksum: `${oracle.checksumSum.toString(16).padStart(8, "0")}:${oracle.checksumXor.toString(16).padStart(8, "0")}`,
  },
  results,
  interpretation: "Optimistic read-only planet partition; real simulation also requires deterministic barriers and fixed-order delta merges.",
})}`);
