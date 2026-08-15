import { describe, expect, it } from "vitest";
import { createInitialState } from "./engine";
import {
  buildBackgroundFinalEnvelope,
  type BackgroundOfflineTerminalSettleBaseline,
} from "./offlineSimulation";
import { createContentPackRegistry, createContentPackRuntimeSnapshot } from "./contentPacks";
import { decodeVerifiedSaveTransfer } from "./saveTransfer";
import type { GameState } from "./types";

const testRegistry = createContentPackRuntimeSnapshot(createContentPackRegistry());

function baselineFor(state: GameState): BackgroundOfflineTerminalSettleBaseline {
  return {
    startedPaused: state.paused,
    baselineIdleSettlement: state.idleSettlement,
    baselineTotalProduced: state.totalProduced,
  };
}

describe("buildBackgroundFinalEnvelope", () => {
  it("derives a terminal envelope whose identity matches the serialized state", () => {
    const source = createInitialState();
    // The offline-advanced state is a fully settled GameState; a fresh seed is
    // not meant to be realistic, only structurally sufficient for the identity
    // contract checks below.
    const advanced = createInitialState();
    const { finalState, finalEnvelope } = buildBackgroundFinalEnvelope(advanced, {
      baseline: baselineFor(source),
      highWallSeconds: 300,
      normalOfflineSeconds: 120,
      registryFingerprint: testRegistry.fingerprint,
      savedAt: 1_700_000_000_000,
    });

    expect(finalState.timeWarp.enabled).toBe(false);
    expect(finalEnvelope.verification.integrity).toBe("valid");

    const raw = decodeVerifiedSaveTransfer(finalEnvelope.payloadBytes, finalEnvelope.verification);
    const parsed = JSON.parse(raw) as { formatVersion: number; checksum: string; state: GameState };
    expect(parsed.formatVersion).toBe(2);
    const persisted = parsed.state;
    expect(parsed.checksum).toBe(finalEnvelope.identity.stateChecksum);
    expect(persisted.version).toBe(finalEnvelope.identity.stateVersion);
    expect(persisted.mode).toBe(finalEnvelope.identity.mode);
    expect(persisted.entities.length).toBe(finalEnvelope.identity.entityCount);
    expect(persisted.belts.length).toBe(finalEnvelope.identity.beltCount);
    expect(persisted.elapsedSeconds).toBe(finalEnvelope.identity.elapsedSeconds);
    expect(persisted.activePlanetId).toBe(finalEnvelope.identity.activePlanetId);
  });

  it("applies the terminal continue-pause requested by the baseline", () => {
    const source = createInitialState();
    // Request a paused hand-back, matching a session that was started paused.
    const pausedBaseline: BackgroundOfflineTerminalSettleBaseline = {
      ...baselineFor(source),
      startedPaused: true,
    };
    const advanced = createInitialState();
    const { finalState } = buildBackgroundFinalEnvelope(advanced, {
      baseline: pausedBaseline,
      highWallSeconds: 120,
      normalOfflineSeconds: 60,
      registryFingerprint: testRegistry.fingerprint,
      savedAt: 1_700_000_000_000,
    });
    expect(finalState.paused).toBe(true);
  });
});
