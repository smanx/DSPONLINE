// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDynamicImportRecoveryState,
  importWithRecovery,
  isDynamicImportFailure,
} from "./dynamicImportRecovery";

describe("dynamic import recovery", () => {
  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await importWithRecovery(async () => ({ recovered: true }), "测试模块");
  });

  it("retries a transient chunk failure twice before succeeding", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({}),
    })));
    const loader = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch dynamically imported module"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch dynamically imported module"))
      .mockResolvedValue({ module: "ready" });

    const result = importWithRecovery(loader, "生产资料库模块");
    await vi.runAllTimersAsync();

    await expect(result).resolves.toEqual({ module: "ready" });
    expect(loader).toHaveBeenCalledTimes(3);
    expect(getDynamicImportRecoveryState().status).toBe("idle");
  });

  it("stops retrying when version metadata reports a newer build", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ buildId: "new-build-for-recovery-test" }),
    })));
    const failure = new TypeError("Failed to fetch dynamically imported module");

    await expect(importWithRecovery(async () => { throw failure; }, "本地存档模块")).rejects.toBe(failure);
    expect(getDynamicImportRecoveryState()).toMatchObject({
      status: "update-available",
      label: "本地存档模块",
      attempt: 1,
      latestBuildId: "new-build-for-recovery-test",
    });
  });

  it("does not treat ordinary application exceptions as chunk failures", () => {
    expect(isDynamicImportFailure(new Error("配方不存在"))).toBe(false);
    expect(isDynamicImportFailure(new Error("ChunkLoadError: loading chunk 4 failed"))).toBe(true);
  });
});
