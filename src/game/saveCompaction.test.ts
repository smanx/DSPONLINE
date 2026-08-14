import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hashGameState } from "./benchmark";
import { createContentPackRegistry } from "./contentPacks";
import { advanceSimulation, createInitialState } from "./engine";
import { computeSaveStateChecksum } from "./saveEnvelopeIntegrity";
import { projectPersistentSaveState } from "./saveProjection";
import { inspectSave, migrateGame, serializeEnvelope } from "./storage";

const environment = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env;

describe("v47 sparse save projection", () => {
  it("consumes the shared contract for every projected entity and belt default", () => {
    const state = createInitialState(1, false);
    const station = structuredClone(state.entities[0]);
    Object.assign(station, {
      id: "contract-station",
      kind: "station",
      buildingId: "interstellar_logistics_station",
      interactionLocked: false,
      powerGridId: "grid-a",
      powerPriority: 2,
      machineCount: 0,
      minerCount: 0,
      progress: 0,
      routingCursor: 0,
      powerInputKw: 0,
      powerOutputKw: 0,
      stationProgress: 0,
      stationTrips: 0,
      stationLastTransfer: 0,
      stationCongestion: 0,
      stationDispatchCursor: 0,
      proliferatorPoints: 0,
      resourceDepletionRemainder: 0,
      stationWarperAutoRefill: false,
      stationHubEnabled: false,
      quantumTarget: false,
      stationWarpEnabled: true,
      proliferatorBonusProgress: {},
      inputs: {},
      outputs: {},
      stationLastSupplyPeerBySlot: {},
      stationRoutes: [],
    });
    state.entities = [station];
    state.belts = [{
      id: "contract-line",
      planetId: station.planetId,
      source: station.id,
      target: station.id,
      itemId: "iron_ore",
      lanes: 1,
      tier: 1,
      sorterTier: 1,
      progress: 0,
      priority: 0,
      stackSize: 1,
      monitorEnabled: false,
      totalTransferred: 0,
      congestion: 0,
      lastFlow: 0,
      routeMode: "auto",
    }];
    const original = structuredClone(state);
    const projected = projectPersistentSaveState(state, createContentPackRegistry());
    const projectedEntity = projected.entities[0] as unknown as Record<string, unknown>;
    const projectedBelt = projected.belts[0] as unknown as Record<string, unknown>;
    for (const key of [
      "interactionLocked", "powerGridId", "powerPriority", "machineCount", "minerCount", "progress", "routingCursor",
      "powerInputKw", "powerOutputKw", "stationProgress", "stationTrips", "stationLastTransfer", "stationCongestion",
      "stationDispatchCursor", "proliferatorPoints", "resourceDepletionRemainder", "stationWarperAutoRefill", "stationHubEnabled",
      "quantumTarget", "stationWarpEnabled", "proliferatorBonusProgress", "inputs", "outputs", "stationLastSupplyPeerBySlot", "stationRoutes",
    ]) expect(projectedEntity).not.toHaveProperty(key);
    for (const key of [
      "lanes", "tier", "sorterTier", "progress", "priority", "stackSize", "monitorEnabled", "totalTransferred", "congestion", "lastFlow", "routeMode",
    ]) expect(projectedBelt).not.toHaveProperty(key);
    expect(state).toEqual(original);
  });

  it("preserves nondefault and explicit invalid values for authoritative validation instead of silently normalizing them", () => {
    const state = createInitialState(1, false);
    const entity = state.entities[0] as unknown as Record<string, unknown>;
    entity.interactionLocked = null;
    entity.powerPriority = 3;
    entity.inputs = { iron_ore: 1 };
    state.belts = [{
      id: "invalid-line",
      planetId: state.entities[0].planetId,
      source: state.entities[0].id,
      target: state.entities[1].id,
      itemId: "iron_ore",
      lanes: 0,
      tier: 4,
      sorterTier: 3,
      progress: -1,
      priority: 2,
      stackSize: 4,
      monitorEnabled: true,
      totalTransferred: 5,
      congestion: 0.5,
      lastFlow: 2,
      routeMode: "upper",
    }];
    const projected = projectPersistentSaveState(state, createContentPackRegistry());
    expect(projected.entities[0]).toMatchObject({ interactionLocked: null, powerPriority: 3, inputs: { iron_ore: 1 } });
    expect(projected.belts[0]).toMatchObject({
      lanes: 0,
      tier: 4,
      progress: -1,
      priority: 2,
      stackSize: 4,
      monitorEnabled: true,
      totalTransferred: 5,
      congestion: 0.5,
      lastFlow: 2,
      routeMode: "upper",
    });
  });

  it("does not apply v46 sparse projection rules to a v45 dense state", () => {
    const state = createInitialState(1, false);
    state.version = 45;
    state.entities = [state.entities[0]];
    state.belts = [{
      id: "v45-dense-line",
      planetId: state.entities[0].planetId,
      source: state.entities[0].id,
      target: state.entities[0].id,
      itemId: "iron_ore",
      lanes: 1,
      tier: 1,
      sorterTier: 1,
      progress: 0,
      priority: 0,
      stackSize: 1,
      monitorEnabled: false,
      totalTransferred: 0,
      congestion: 0,
      lastFlow: 0,
      routeMode: "auto",
    }];
    const projected = projectPersistentSaveState(state, createContentPackRegistry());
    expect(projected.entities[0]).toHaveProperty("interactionLocked", false);
    expect(projected.entities[0]).toHaveProperty("inputs");
    expect(projected.entities[0]).toHaveProperty("outputs");
    expect(projected.belts[0]).toMatchObject({
      lanes: 1,
      tier: 1,
      sorterTier: 1,
      progress: 0,
      priority: 0,
      stackSize: 1,
      monitorEnabled: false,
      totalTransferred: 0,
      congestion: 0,
      lastFlow: 0,
      routeMode: "auto",
    });
  });

  it("omits only default/zero runtime fields while preserving authoritative nonzero state", () => {
    const state = createInitialState(1, false);
    const primary = state.entities[0];
    const secondary = state.entities[1];
    primary.inputs.iron_ore = 42;
    primary.outputs.iron_ore = 7;
    primary.progress = 0.5;
    primary.powerFactor = 0.8;
    primary.productionRate = 12;
    secondary.inputs = {};
    secondary.outputs = { copper_ore: 0 };
    state.belts.push({
      id: "compact-line",
      planetId: primary.planetId,
      source: primary.id,
      target: secondary.id,
      itemId: "iron_ore",
      lanes: 1,
      tier: 1,
      sorterTier: 1,
      progress: 0,
      priority: 0,
      stackSize: 1,
      monitorEnabled: false,
      totalTransferred: 0,
      congestion: 0,
      lastFlow: 0,
      routeMode: "auto",
    });
    const raw = serializeEnvelope(state, 1_786_377_600_000);
    const parsed = JSON.parse(raw) as { state: typeof state };
    const persistedPrimary = parsed.state.entities.find((entity) => entity.id === primary.id)! as unknown as Record<string, unknown>;
    const persistedSecondary = parsed.state.entities.find((entity) => entity.id === secondary.id)! as unknown as Record<string, unknown>;
    const persistedBelt = parsed.state.belts[0] as unknown as Record<string, unknown>;
    expect(persistedPrimary).toMatchObject({ inputs: { iron_ore: 42 }, outputs: { iron_ore: 7 }, progress: 0.5, powerFactor: 0.8, productionRate: 12 });
    expect(persistedSecondary).not.toHaveProperty("inputs");
    expect(persistedSecondary).toHaveProperty("outputs.copper_ore", 0);
    for (const key of ["lanes", "tier", "sorterTier", "progress", "priority", "stackSize", "monitorEnabled", "totalTransferred", "congestion", "lastFlow", "routeMode"]) {
      expect(persistedBelt).not.toHaveProperty(key);
    }
    const inspection = inspectSave(raw);
    expect(inspection).toMatchObject({ valid: true, checksum: "valid", stateVersion: 47 });
    expect(inspection.state!.entities.find((entity) => entity.id === primary.id)).toMatchObject({
      inputs: { iron_ore: 42 }, outputs: { iron_ore: 7 }, progress: 0.5, powerFactor: 0.8, productionRate: 12,
    });
    expect(inspection.state!.belts[0]).toMatchObject({ lanes: 1, tier: 1, sorterTier: 1, progress: 0, priority: 0, stackSize: 1, lastFlow: 0 });
  });

  it("preserves explicit micro black hole operation intent while missing legacy flags stay safely paused", () => {
    const state = createInitialState(1, false);
    const makeBlackHole = (index: number, id: string, flags?: { paused: boolean; confirmed: boolean }) => {
      const entity = structuredClone(state.entities[index]) as typeof state.entities[number] & Record<string, unknown>;
      Object.assign(entity, {
        id,
        kind: "machine",
        buildingId: "micro_black_hole_connector",
        blackHolePorts: [0, 1, 2].map((portIndex) => ({ index: portIndex, totalDestroyed: "0" })),
      });
      if (flags) {
        entity.blackHolePaused = flags.paused;
        entity.blackHoleActivationConfirmed = flags.confirmed;
      } else {
        delete entity.blackHolePaused;
        delete entity.blackHoleActivationConfirmed;
      }
      return entity;
    };
    const legacyMissing = makeBlackHole(2, "black-hole-legacy-missing");
    state.entities = [
      makeBlackHole(0, "black-hole-running", { paused: false, confirmed: true }),
      makeBlackHole(1, "black-hole-player-paused", { paused: true, confirmed: true }),
    ];
    state.belts = [];

    const raw = serializeEnvelope(state, 1_786_377_600_000);
    const persisted = JSON.parse(raw) as { state: typeof state };
    const persistedRunning = persisted.state.entities.find((entity) => entity.id === "black-hole-running")!;
    const persistedPaused = persisted.state.entities.find((entity) => entity.id === "black-hole-player-paused")!;
    expect(persistedRunning).toMatchObject({
      blackHolePaused: false,
      blackHoleActivationConfirmed: true,
    });
    expect(persistedPaused).toMatchObject({
      blackHolePaused: true,
      blackHoleActivationConfirmed: true,
    });
    for (const projected of [persistedRunning, persistedPaused]) {
      expect(Object.prototype.hasOwnProperty.call(projected, "blackHolePaused")).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(projected, "blackHoleActivationConfirmed")).toBe(true);
    }
    const loaded = inspectSave(raw);
    expect(loaded).toMatchObject({ valid: true, checksum: "valid", stateVersion: 47 });
    expect(loaded.state!.entities.find((entity) => entity.id === "black-hole-running")).toMatchObject({
      blackHolePaused: false,
      blackHoleActivationConfirmed: true,
    });
    expect(loaded.state!.entities.find((entity) => entity.id === "black-hole-player-paused")).toMatchObject({
      blackHolePaused: true,
      blackHoleActivationConfirmed: true,
    });
    const legacyState = structuredClone(state);
    legacyState.entities.push(legacyMissing);
    const legacyEnvelope = {
      formatVersion: 2,
      kind: "primary",
      mode: "normal",
      slot: "main",
      savedAt: 1_786_377_599_000,
      state: legacyState,
      checksum: computeSaveStateChecksum(2, legacyState),
    };
    const legacyLoaded = inspectSave(JSON.stringify(legacyEnvelope));
    expect(legacyLoaded.valid).toBe(true);
    expect(legacyLoaded.state!.entities.find((entity) => entity.id === "black-hole-legacy-missing")).toMatchObject({
      blackHolePaused: true,
      blackHoleActivationConfirmed: false,
    });
    expect(() => serializeEnvelope(legacyState, 1_786_377_600_001)).toThrow(/explicit pause and activation-confirmation state/);
  });

  it("loads an uncompressed v46 envelope and keeps the next exact step identical after sparse round-trip", () => {
    const state = createInitialState(1, false);
    state.paused = false;
    const oldEnvelope = {
      formatVersion: 2,
      kind: "primary",
      savedAt: 100,
      mode: "normal",
      slot: "main",
      state,
      checksum: computeSaveStateChecksum(2, state),
    };
    const oldInspection = inspectSave(JSON.stringify(oldEnvelope));
    expect(oldInspection.valid).toBe(true);
    const compactInspection = inspectSave(serializeEnvelope(oldInspection.state!, 101));
    expect(compactInspection.valid).toBe(true);
    expect(hashGameState(advanceSimulation(structuredClone(oldInspection.state!), 5))).toBe(
      hashGameState(advanceSimulation(structuredClone(compactInspection.state!), 5)),
    );
  });

  it.skipIf(!environment?.DSP_REAL_FIXTURE)("measures read-only real-save reduction and reload integrity", () => {
    const sourceRaw = readFileSync(environment!.DSP_REAL_FIXTURE!, "utf8");
    const parsed = JSON.parse(sourceRaw);
    const state = migrateGame(parsed.state ?? parsed);
    expect(state).not.toBeNull();
    const compactRaw = serializeEnvelope(state!, 1_786_377_600_000);
    const sourceBytes = new TextEncoder().encode(sourceRaw).byteLength;
    const compactBytes = new TextEncoder().encode(compactRaw).byteLength;
    const inspection = inspectSave(compactRaw);
    const report = {
      sourceBytes,
      compactBytes,
      reductionBytes: sourceBytes - compactBytes,
      reductionRatio: Number(((sourceBytes - compactBytes) / sourceBytes).toFixed(4)),
      entities: state!.entities.length,
      belts: state!.belts.length,
    };
    console.log(`V138_SAVE_COMPACTION ${JSON.stringify(report)}`);
    expect(inspection).toMatchObject({ valid: true, checksum: "valid", stateVersion: 47 });
    expect(compactBytes).toBeLessThan(sourceBytes);
  }, 120_000);
});
