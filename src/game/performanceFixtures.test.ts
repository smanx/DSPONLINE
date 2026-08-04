import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  createSyntheticPerformanceFixture,
  runSyntheticPerformanceBenchmark,
  type PerformanceFixtureProfile,
} from "./performanceFixtures";
import {
  advanceSimulation,
  advanceSimulationSession,
  advancePersistentSimulationRuntime,
  attachAllInterstellarStationsToQuantumNetwork,
  completeSimulationAdvanceSession,
  createPersistentSimulationRuntime,
  createSimulationAdvanceSession,
  createSimulationProfiler,
} from "./engine";
import { migrateGame } from "./storage";
import { hashGameState } from "./benchmark";
import { getPlanet } from "./content";
import {
  getInterstellarStationUpgradeStatus,
  upgradeAllInterstellarStationsToMk2,
  upgradeInterstellarStationToMk2,
} from "./systemSpaceStation";

const benchmarkEnvironment = (globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
}).process?.env;

describe("synthetic endgame performance fixtures", () => {
  it.each([
    ["p50", 300, 300, 45, 300],
    ["p95", 380, 500, 80, 500],
    ["max", 569, 1_160, 128, 1_160],
    ["player", 600, 1_250, 100, 1_500_000],
    ["terminal2x", 1_200, 2_500, 256, 3_000_000],
  ] as const)("builds the %s scale without player data", (profile, entityCount, beltCount, stationCount, totalLanes) => {
    const state = createSyntheticPerformanceFixture(profile as PerformanceFixtureProfile);
    expect(state.entities).toHaveLength(entityCount);
    expect(state.belts).toHaveLength(beltCount);
    expect(state.entities.filter((entity) => entity.kind === "station")).toHaveLength(stationCount);
    expect(state.belts.reduce((sum, belt) => sum + belt.lanes, 0)).toBe(totalLanes);
    expect(state.entities.some((entity) => entity.id.includes("fixture"))).toBe(true);
  });

  it.each(["p50", "p95", "max"] as const)("keeps %s legacy and indexed hashes identical", (profile) => {
    const report = runSyntheticPerformanceBenchmark(profile, { seconds: 1, warmupRuns: 0 });
    expect(report.hashesMatch).toBe(true);
    expect(report.legacy.stateHash).toBe(report.indexed.stateHash);
    expect(report.legacy.pendingSimulationSeconds).toBe(0);
    expect(report.indexed.pendingSimulationSeconds).toBe(0);
    expect(report.indexed.profiler.peerCandidateChecks).toBeLessThanOrEqual(report.legacy.profiler.peerCandidateChecks);
  }, 60_000);

  it("keeps persisted belt order deterministic for indexed logistics", () => {
    const source = createSyntheticPerformanceFixture("p95");
    source.belts.reverse();
    const sample = (indexedLogistics: boolean) => {
      const session = createSimulationAdvanceSession(structuredClone(source), 1, { indexedLogistics });
      advanceSimulationSession(session, Number.MAX_SAFE_INTEGER);
      return hashGameState(completeSimulationAdvanceSession(session));
    };
    expect(sample(true)).toBe(sample(false));
  });

  it.skipIf(benchmarkEnvironment?.DSP_RUN_TERMINAL_BENCHMARK !== "1")(
    "profiles the player-shaped and 2x terminal fixtures",
    () => {
      const reports = (["player", "terminal2x"] as const).flatMap((profile) =>
        ([1, 4, 11] as const).map((multiplier) => ({
          multiplier,
          report: runSyntheticPerformanceBenchmark(profile, { seconds: multiplier, warmupRuns: 1 }),
        })));
      expect(reports.every(({ report }) => report.hashesMatch)).toBe(true);
      expect(reports.every(({ report }) => report.indexed.pendingSimulationSeconds === 0)).toBe(true);
      console.log(`TERMINAL_BENCHMARK ${JSON.stringify({ generatedAt: new Date().toISOString(), reports })}`);
    },
    300_000,
  );

  it.skipIf(!benchmarkEnvironment?.DSP_REAL_FIXTURE)("profiles a local real-save fixture without persisting or uploading it", () => {
    const raw = readFileSync(benchmarkEnvironment!.DSP_REAL_FIXTURE!, "utf8");
    const parsed = JSON.parse(raw);
    const state = migrateGame(parsed.state ?? parsed);
    expect(state).not.toBeNull();
    const sample = (indexedLogistics: boolean) => {
      const profiler = createSimulationProfiler();
      const startedAt = performance.now();
      const session = createSimulationAdvanceSession(structuredClone(state!), 1, { indexedLogistics, profiler });
      advanceSimulationSession(session, Number.MAX_SAFE_INTEGER);
      const result = completeSimulationAdvanceSession(session);
      return { durationMs: performance.now() - startedAt, hash: hashGameState(result), profiler, result };
    };
    const legacy = sample(false);
    const indexed = sample(true);
    console.log(`REAL_FIXTURE_BENCHMARK ${JSON.stringify({
      legacy: { durationMs: legacy.durationMs, hash: legacy.hash, profiler: legacy.profiler },
      indexed: { durationMs: indexed.durationMs, hash: indexed.hash, profiler: indexed.profiler },
      hashesMatch: legacy.hash === indexed.hash,
    })}`);
    expect(indexed.hash).toBe(legacy.hash);
    expect(indexed.profiler.peerCandidateChecks).toBeLessThan(20_000);
  }, 120_000);

  it.skipIf(!benchmarkEnvironment?.DSP_REAL_FIXTURE || benchmarkEnvironment.DSP_MULTICORE_REAL_MODEL !== "1")(
    "profiles steady persistent-worker phases for the multicore model",
    () => {
      const raw = readFileSync(benchmarkEnvironment!.DSP_REAL_FIXTURE!, "utf8");
      const parsed = JSON.parse(raw);
      const migrated = migrateGame(parsed.state ?? parsed);
      expect(migrated).not.toBeNull();
      const source = structuredClone(migrated!);
      source.paused = false;
      const runtime = createPersistentSimulationRuntime(source);
      const samples = [];
      for (let step = 0; step < 14; step += 1) {
        const profiler = createSimulationProfiler();
        const startedAt = performance.now();
        const result = advancePersistentSimulationRuntime(runtime, 1, 1, profiler);
        samples.push({
          step,
          durationMs: performance.now() - startedAt,
          cacheRebuilt: result.cacheRebuilt,
          profiler,
        });
      }
      const steady = samples.slice(2);
      const median = (values: number[]) => {
        const ordered = [...values].sort((left, right) => left - right);
        return ordered[Math.floor(ordered.length / 2)] ?? 0;
      };
      const phaseKeys = [
        "productionMs", "beltsMs", "logisticsMs", "quantumMs", "powerMs", "dysonMs",
        "constructionMs", "historyMs", "copyStateMs", "stationIndexBuildMs",
      ] as const;
      const phases = Object.fromEntries(phaseKeys.map((key) => [
        key,
        Number(median(steady.map((sample) => sample.profiler[key])).toFixed(2)),
      ]));
      console.log(`REAL_PERSISTENT_WORKER_BENCHMARK ${JSON.stringify({
        generatedAt: new Date().toISOString(),
        warmupSteps: 2,
        measuredSteps: steady.length,
        coldMs: Number(samples[0].durationMs.toFixed(2)),
        medianMs: Number(median(steady.map((sample) => sample.durationMs)).toFixed(2)),
        p95Ms: Number([...steady.map((sample) => sample.durationMs)].sort((left, right) => left - right)[Math.ceil(steady.length * 0.95) - 1].toFixed(2)),
        cacheRebuilds: steady.filter((sample) => sample.cacheRebuilt).length,
        phases,
        peerCandidateChecksMedian: Math.floor(median(steady.map((sample) => sample.profiler.peerCandidateChecks))),
        quantumRequestsMedian: Math.floor(median(steady.map((sample) => sample.profiler.quantumRequestCount))),
      })}`);
    },
    180_000,
  );

  it.skipIf(!benchmarkEnvironment?.DSP_REAL_FIXTURE || benchmarkEnvironment.DSP_STATION_UPGRADE_BENCHMARK !== "1")(
    "profiles full-map and single-system station upgrades on a local real-save fixture",
    () => {
      const raw = readFileSync(benchmarkEnvironment!.DSP_REAL_FIXTURE!, "utf8");
      const parsed = JSON.parse(raw);
      const migrated = migrateGame(parsed.state ?? parsed);
      expect(migrated).not.toBeNull();
      const state = structuredClone(migrated!);
      state.research.completedTechIds = [...new Set([...state.research.completedTechIds, "orbital_elevator_engineering"])] as typeof state.research.completedTechIds;
      const packageCost = { titanium_alloy: 10_000, frame_material: 5_000, quantum_chip: 5_000, universe_matrix: 10_000 };
      const pendingStations = state.entities.filter((entity) => entity.buildingId === "interstellar_logistics_station" && (entity.stationTier ?? 1) < 2);
      for (const station of pendingStations) {
        const tray = { ...(state.planetTrays[station.planetId] ?? {}) };
        for (const [rawItemId, amount] of Object.entries(packageCost)) {
          const itemId = rawItemId as keyof typeof packageCost;
          tray[itemId] = (tray[itemId] ?? 0) + amount;
        }
        state.planetTrays[station.planetId] = tray;
      }
      state.tray = { ...(state.planetTrays[state.activePlanetId] ?? {}) };
      const legacyUpgradeAll = (source: typeof state, systemId?: Parameters<typeof upgradeAllInterstellarStationsToMk2>[1]) => {
        const candidates = source.entities
          .filter((entity) => entity.buildingId === "interstellar_logistics_station")
          .filter((entity) => systemId == null || getPlanet(entity.planetId).systemId === systemId)
          .sort((left, right) => left.id.localeCompare(right.id));
        let next = source;
        const upgradedIds: string[] = [];
        const skipped: Array<{ entityId: string; blocker: ReturnType<typeof getInterstellarStationUpgradeStatus>["blocker"]; reason: string }> = [];
        for (const candidate of candidates) {
          const status = getInterstellarStationUpgradeStatus(next, candidate.id);
          if (status.blocker !== "ready") {
            skipped.push({ entityId: candidate.id, blocker: status.blocker, reason: status.reason });
            continue;
          }
          const upgraded = upgradeInterstellarStationToMk2(next, candidate.id);
          if (upgraded === next) {
            skipped.push({ entityId: candidate.id, blocker: "invalid", reason: "升级未提交，状态已变化" });
            continue;
          }
          next = upgraded;
          upgradedIds.push(candidate.id);
        }
        return { state: next, upgradedIds, skipped };
      };
      const sample = (
        implementation: typeof upgradeAllInterstellarStationsToMk2,
        systemId?: Parameters<typeof upgradeAllInterstellarStationsToMk2>[1],
      ) => {
        const source = structuredClone(state);
        const startedAt = performance.now();
        const result = implementation(source, systemId);
        return {
          durationMs: Number((performance.now() - startedAt).toFixed(2)),
          upgraded: result.upgradedIds.length,
          skipped: result.skipped.length,
          hash: hashGameState(result.state),
        };
      };
      const systemId = pendingStations[0] ? getPlanet(pendingStations[0].planetId).systemId : undefined;
      const legacyFullMap = sample(legacyUpgradeAll, undefined);
      const fullMap = sample(upgradeAllInterstellarStationsToMk2, undefined);
      const legacySingleSystem = sample(legacyUpgradeAll, systemId);
      const singleSystem = sample(upgradeAllInterstellarStationsToMk2, systemId);
      console.log(`STATION_UPGRADE_BENCHMARK ${JSON.stringify({
        generatedAt: new Date().toISOString(),
        pendingStations: pendingStations.length,
        legacyFullMap,
        fullMap,
        legacySingleSystem,
        singleSystem,
      })}`);
      expect(fullMap.hash).toBe(legacyFullMap.hash);
      expect(singleSystem.hash).toBe(legacySingleSystem.hash);
      expect(fullMap.upgraded).toBe(pendingStations.length);
      expect(fullMap.skipped).toBe(0);
      expect(singleSystem.skipped).toBe(0);
    },
    120_000,
  );

  it.skipIf(!benchmarkEnvironment?.DSP_REAL_FIXTURE || benchmarkEnvironment.DSP_QUANTUM_REAL_BENCHMARK !== "1")(
    "profiles a local real-save fixture after all eligible towers reach steady quantum mode",
    () => {
      const raw = readFileSync(benchmarkEnvironment!.DSP_REAL_FIXTURE!, "utf8");
      const parsed = JSON.parse(raw);
      const migrated = migrateGame(parsed.state ?? parsed);
      expect(migrated).not.toBeNull();
      const original = structuredClone(migrated!);
      original.paused = false;
      for (const planetId of new Set(original.entities.map((entity) => entity.planetId))) {
        for (const powerGridId of ["grid-a", "grid-b", "grid-c"] as const) {
          original.entities.push({
            id: `quantum-benchmark-power-${planetId}-${powerGridId}`,
            kind: "power",
            planetId,
            position: { x: -100_000, y: -100_000 },
            interactionLocked: false,
            buildingId: "wind_turbine",
            powerGridId,
            inputs: {},
            outputs: {},
            progress: 0,
            utilization: 0,
            productionRate: 0,
            routingCursor: 0,
            machineCount: 1_000_000_000_000,
            minerCount: 0,
          });
        }
      }
      original.research.completedTechIds = [...new Set([
        ...original.research.completedTechIds,
        "quantum_logistics_network",
      ])] as typeof original.research.completedTechIds;
      const upgraded = upgradeAllInterstellarStationsToMk2(original).state;
      let quantum = attachAllInterstellarStationsToQuantumNetwork(upgraded).state;
      const pendingBefore = quantum.entities.filter((entity) => entity.quantumTransition).length;
      let drainSeconds = 0;
      while (quantum.entities.some((entity) => entity.quantumTransition) && drainSeconds < 60) {
        quantum = advanceSimulation(quantum, 5);
        drainSeconds += 5;
      }
      const pendingAfter = quantum.entities.filter((entity) => entity.quantumTransition).length;
      if (pendingAfter > 0) {
        const pendingIds = new Set(quantum.entities.filter((entity) => entity.quantumTransition).map((entity) => entity.id));
        const roleCounts = { demand: 0, supply: 0, owner: 0, waypoint: 0 };
        const routes = quantum.entities.flatMap((demand) => (demand.stationRoutes ?? []).flatMap((route) => {
          const related = [];
          if (pendingIds.has(demand.id)) { roleCounts.demand += 1; related.push("demand"); }
          if (pendingIds.has(route.peerId)) { roleCounts.supply += 1; related.push("supply"); }
          if (pendingIds.has(route.vehicleStationId ?? demand.id)) { roleCounts.owner += 1; related.push("owner"); }
          if ((route.waypointStationIds ?? []).some((stationId) => pendingIds.has(stationId))) { roleCounts.waypoint += 1; related.push("waypoint"); }
          return related.length ? [{ progress: route.progress, duration: route.duration, roles: related }] : [];
        }));
        console.log(`QUANTUM_PENDING_DIAGNOSTIC ${JSON.stringify({ pendingAfter, roleCounts, routes })}`);
      }
      expect(pendingBefore).toBeGreaterThan(0);
      expect(pendingAfter).toBe(0);

      const sample = (source: typeof quantum) => {
        const durations: number[] = [];
        const phaseSamples = [];
        for (let run = 0; run < 5; run += 1) {
          const profiler = createSimulationProfiler();
          const state = structuredClone(source);
          const startedAt = performance.now();
          const session = createSimulationAdvanceSession(state, 5, { profiler });
          advanceSimulationSession(session, Number.MAX_SAFE_INTEGER);
          completeSimulationAdvanceSession(session);
          durations.push(performance.now() - startedAt);
          phaseSamples.push(profiler);
        }
        const ordered = [...durations].sort((left, right) => left - right);
        const medianIndex = Math.floor(ordered.length / 2);
        return {
          samplesMs: durations.map((duration) => Number(duration.toFixed(2))),
          medianMs: Number((ordered[medianIndex] ?? 0).toFixed(2)),
          medianQuantumMs: Number([...phaseSamples.map((sample) => sample.quantumMs)].sort((left, right) => left - right)[medianIndex].toFixed(2)),
          medianLogisticsMs: Number([...phaseSamples.map((sample) => sample.logisticsMs)].sort((left, right) => left - right)[medianIndex].toFixed(2)),
          requests: Math.max(...phaseSamples.map((sample) => sample.quantumRequestCount)),
        };
      };
      const samplePersistent = (source: typeof quantum) => {
        const runtime = createPersistentSimulationRuntime(structuredClone(source));
        const samples = [];
        for (let step = 0; step < 32; step += 1) {
          const profiler = createSimulationProfiler();
          const startedAt = performance.now();
          const result = advancePersistentSimulationRuntime(runtime, 1, 1, profiler);
          samples.push({
            durationMs: performance.now() - startedAt,
            cacheRebuilt: result.cacheRebuilt,
            profiler,
          });
        }
        const steady = samples.slice(2);
        const percentile = (values: number[], ratio: number) => {
          const ordered = [...values].sort((left, right) => left - right);
          return ordered[Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * ratio) - 1))] ?? 0;
        };
        const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
        const phaseKeys = [
          "productionMs", "beltsMs", "logisticsMs", "quantumMs", "powerMs", "dysonMs",
          "constructionMs", "historyMs", "copyStateMs", "stationIndexBuildMs",
        ] as const;
        return {
          medianMs: Number(percentile(steady.map((entry) => entry.durationMs), 0.5).toFixed(2)),
          meanMs: Number(mean(steady.map((entry) => entry.durationMs)).toFixed(2)),
          p95Ms: Number(percentile(steady.map((entry) => entry.durationMs), 0.95).toFixed(2)),
          cacheRebuilds: steady.filter((entry) => entry.cacheRebuilt).length,
          phases: Object.fromEntries(phaseKeys.map((key) => [
            key,
            Number(percentile(steady.map((entry) => entry.profiler[key]), 0.5).toFixed(2)),
          ])),
          phaseMeans: Object.fromEntries(phaseKeys.map((key) => [
            key,
            Number(mean(steady.map((entry) => entry.profiler[key])).toFixed(2)),
          ])),
          requests: Math.floor(percentile(steady.map((entry) => entry.profiler.quantumRequestCount), 0.5)),
          quantumBoundarySteps: steady.filter((entry) => entry.profiler.quantumRequestCount > 0).length,
        };
      };
      const legacy = sample(original);
      const steadyQuantum = sample(quantum);
      const legacyPersistent = samplePersistent(original);
      const steadyQuantumPersistent = samplePersistent(quantum);
      console.log(`REAL_QUANTUM_BENCHMARK ${JSON.stringify({
        generatedAt: new Date().toISOString(),
        towers: quantum.entities.filter((entity) => entity.quantumMode === "quantum").length,
        pendingBefore,
        pendingAfter,
        drainSeconds,
        legacy,
        steadyQuantum,
        legacyPersistent,
        steadyQuantumPersistent,
        improvement: legacy.medianMs > 0 ? Number((1 - steadyQuantum.medianMs / legacy.medianMs).toFixed(4)) : 0,
      })}`);
    },
    180_000,
  );
});
