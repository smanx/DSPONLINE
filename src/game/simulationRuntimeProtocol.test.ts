import { describe, expect, it } from "vitest";
import { createInitialState } from "./engine";
import {
  applySimulationCommandPatch,
  createSimulationStateIdentity,
  createSimulationCommandPatch,
  deserializeSimulationStateTransfer,
  serializeSimulationStateCheckpoint,
  serializeSimulationStateForTransfer,
  validateSimulationStateCheckpoint,
  validateSimulationStateTransferIdentity,
} from "./simulationRuntimeProtocol";

describe("authoritative simulation runtime protocol", () => {
  it("transfers an exact state through a transferable UTF-8 buffer", () => {
    const state = createInitialState(14_044);
    state.entities[0].inputs = { iron_ore: 123 };
    const transfer = serializeSimulationStateForTransfer(state);
    expect(transfer.byteLength).toBeGreaterThan(0);
    expect(deserializeSimulationStateTransfer(transfer)).toEqual(state);
  });

  it("creates a JSON-canonical checkpoint mirror and validates its transfer envelope", () => {
    const state = createInitialState(14_044) as ReturnType<typeof createInitialState> & { optionalDebug?: string };
    state.optionalDebug = undefined;
    const { checkpoint, checkpointState } = serializeSimulationStateCheckpoint(state);
    expect(validateSimulationStateCheckpoint(checkpoint, checkpointState)).toEqual(JSON.parse(JSON.stringify(state)));
    expect("optionalDebug" in checkpointState).toBe(false);
    expect(() => validateSimulationStateCheckpoint({ ...checkpoint, protocolVersion: 99 as 1 }, checkpointState)).toThrow(/协议/);
    expect(() => validateSimulationStateCheckpoint({ ...checkpoint, byteLength: checkpoint.byteLength + 1 }, checkpointState)).toThrow(/长度/);
    expect(() => validateSimulationStateCheckpoint(checkpoint, undefined)).toThrow(/结构/);
    expect(() => validateSimulationStateCheckpoint(checkpoint, { entities: [], belts: null })).toThrow(/结构/);
  });

  it("validates a bounded Worker identity without decoding the checkpoint body", () => {
    const state = createInitialState(14_046);
    state.elapsedSeconds = 123;
    state.paused = false;
    const transfer = serializeSimulationStateForTransfer(state);
    const identity = createSimulationStateIdentity(state);
    expect(validateSimulationStateTransferIdentity(transfer, identity)).toEqual(identity);
    expect(() => validateSimulationStateTransferIdentity(transfer, { ...identity, entityCount: -1 })).toThrow(/身份/);
    expect(() => validateSimulationStateTransferIdentity({ ...transfer, byteLength: transfer.byteLength + 1 }, identity)).toThrow(/长度/);
  });

  it("round-trips player commands without carrying unchanged runtime fields", () => {
    const previous = createInitialState(14_044);
    const current = structuredClone(previous);
    current.paused = !current.paused;
    current.entities[0].inputs = { ...current.entities[0].inputs, iron_ore: 25 };
    current.entities[0].interactionLocked = true;
    const patch = createSimulationCommandPatch(previous, current, 7);
    expect(patch).not.toBeNull();
    expect(patch?.baseRevision).toBe(7);
    expect(applySimulationCommandPatch(previous, patch!)).toEqual(current);
  });

  it("does not scan shared entity and belt arrays for a top-level-only command", () => {
    const base = createInitialState(14_046);
    let entityIdReads = 0;
    const guardedEntity = { ...base.entities[0] };
    const entityId = guardedEntity.id;
    Object.defineProperty(guardedEntity, "id", {
      configurable: true,
      enumerable: true,
      get() {
        entityIdReads += 1;
        return entityId;
      },
    });
    const entities = [guardedEntity];
    const belts = base.belts;
    const previous = { ...base, entities, belts };
    const current = {
      ...previous,
      planetViewports: {
        ...previous.planetViewports,
        [previous.activePlanetId]: { x: 321, y: 123, zoom: 0.75 },
      },
    };

    const patch = createSimulationCommandPatch(previous, current, 12);

    expect(patch?.topLevelChanges).toEqual([
      { path: ["planetViewports", previous.activePlanetId, "x"], operation: "set", value: 321 },
      { path: ["planetViewports", previous.activePlanetId, "y"], operation: "set", value: 123 },
      { path: ["planetViewports", previous.activePlanetId, "zoom"], operation: "set", value: 0.75 },
    ]);
    expect(patch?.changedEntities).toEqual([]);
    expect(patch?.changedBelts).toEqual([]);
    expect(entityIdReads).toBe(0);
  });

  it("preserves concurrent Worker leaves that a stale UI command did not touch", () => {
    const uiBaseline = createInitialState(14_044);
    uiBaseline.entities[0].inputs = { iron_ore: 10, copper_ore: 5 };
    const uiAfterCommand = structuredClone(uiBaseline);
    uiAfterCommand.entities[0].interactionLocked = true;
    uiAfterCommand.entities[0].inputs.iron_ore = 8;
    const workerCurrent = structuredClone(uiBaseline);
    workerCurrent.entities[0].progress = 0.75;
    workerCurrent.entities[0].inputs.copper_ore = 99;

    const patch = createSimulationCommandPatch(uiBaseline, uiAfterCommand, 11)!;
    const applied = applySimulationCommandPatch(workerCurrent, patch);
    expect(applied.entities[0].interactionLocked).toBe(true);
    expect(applied.entities[0].inputs.iron_ore).toBe(8);
    expect(applied.entities[0].inputs.copper_ore).toBe(99);
    expect(applied.entities[0].progress).toBe(0.75);
  });

  it("preserves record order across additions and removals", () => {
    const previous = createInitialState(14_044);
    const current = structuredClone(previous);
    const removed = current.entities.shift()!;
    current.entities.splice(1, 0, { ...removed, id: "inserted-runtime-command" });
    const patch = createSimulationCommandPatch(previous, current, 4)!;
    const applied = applySimulationCommandPatch(previous, patch);
    expect(applied.entities).toEqual(current.entities);
  });
});
