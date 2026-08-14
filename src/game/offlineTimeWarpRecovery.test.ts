import { describe, expect, it } from "vitest";
import { createInitialState } from "./engine";
import { hasUncommittedTimeWarpTransaction, recoverOrphanedTimeWarpForOffline } from "./offlineTimeWarpRecovery";

function deferredState() {
  const state = createInitialState();
  state.timeWarp.enabled = true;
  state.timeWarp.pendingSimulationSeconds = 960;
  state.timeWarp.pendingWallSeconds = 120;
  state.idleSettlement.currentRunStartedAt = 1_000;
  state.tray.iron_ore = 42;
  return { state, savedAt: 1_000_000, offlineSeconds: 3_600, offlineReport: null };
}

describe("orphaned time-warp offline recovery", () => {
  it("discards accelerated debt while preserving and submitting real wall time once", () => {
    const source = deferredState();
    const result = recoverOrphanedTimeWarpForOffline(source, { nowMs: 20_000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.loaded).not.toBe(source);
    expect(result.loaded.offlineSeconds).toBe(3_720);
    expect(result.loaded.savedAt).toBe(880_000);
    expect(result.loaded.state.timeWarp).toMatchObject({
      enabled: false,
      pendingSimulationSeconds: 0,
      pendingWallSeconds: 0,
      requiredPowerKw: 0,
      allocatedPowerKw: 0,
    });
    expect(result.loaded.state.idleSettlement.currentRunStartedAt).toBeNull();
    expect(result.loaded.state.tray.iron_ore).toBe(42);
    expect(source.state.timeWarp.pendingSimulationSeconds).toBe(960);
    expect(source.state.timeWarp.pendingWallSeconds).toBe(120);
    expect(result.summary).toMatchObject({
      recoveredPendingWallSeconds: 120,
      discardedPendingSimulationSeconds: 960,
      submittedOfflineSeconds: 3_720,
      cappedSeconds: 0,
    });
  });

  it("is idempotent after the transaction has been recovered", () => {
    const first = recoverOrphanedTimeWarpForOffline(deferredState());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = recoverOrphanedTimeWarpForOffline(first.loaded);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.loaded).toBe(first.loaded);
    expect(second.summary.recovered).toBe(false);
    expect(second.loaded.offlineSeconds).toBe(3_720);
  });

  it("preserves pending foreground wall time even when the persisted state is paused", () => {
    const source = deferredState();
    source.state.paused = true;
    source.offlineSeconds = 0;
    const result = recoverOrphanedTimeWarpForOffline(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.loaded.offlineSeconds).toBe(120);
    expect(result.loaded.state.paused).toBe(true);
  });

  it("applies the existing offline cap to the combined interval instead of twice", () => {
    const source = deferredState();
    source.offlineSeconds = 7 * 24 * 60 * 60 - 30;
    source.state.timeWarp.pendingWallSeconds = 120;
    const result = recoverOrphanedTimeWarpForOffline(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.loaded.offlineSeconds).toBe(7 * 24 * 60 * 60);
    expect(result.summary.cappedSeconds).toBe(90);
  });

  it("reports invalid timing data without mutating the source and supports an explicit safe fallback", () => {
    const source = deferredState();
    source.state.timeWarp.pendingWallSeconds = Number.NaN;
    const automatic = recoverOrphanedTimeWarpForOffline(source);
    expect(automatic).toEqual({ ok: false, reason: "时间扭曲检查点包含无效时间字段，自动恢复已停止" });
    expect(Number.isNaN(source.state.timeWarp.pendingWallSeconds)).toBe(true);
    const forced = recoverOrphanedTimeWarpForOffline(source, { force: true, nowMs: 30_000 });
    expect(forced.ok).toBe(true);
    if (!forced.ok) return;
    expect(forced.loaded.state.timeWarp.pendingWallSeconds).toBe(0);
    expect(forced.loaded.offlineSeconds).toBe(3_600);
  });

  it("does nothing to a settled ordinary state", () => {
    const source = deferredState();
    source.state.timeWarp.enabled = false;
    source.state.timeWarp.pendingSimulationSeconds = 0;
    source.state.timeWarp.pendingWallSeconds = 0;
    expect(hasUncommittedTimeWarpTransaction(source.state)).toBe(false);
    const result = recoverOrphanedTimeWarpForOffline(source);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.loaded).toBe(source);
  });
});
