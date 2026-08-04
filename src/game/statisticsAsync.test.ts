import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "./engine";
import { calculateFactoryStatistics, calculateFactoryStatisticsAsync } from "./statistics";

describe("asynchronous factory statistics", () => {
  it("matches the synchronous reference exactly while yielding between batches", async () => {
    const state = createInitialState();
    const yieldControl = vi.fn(async () => undefined);
    const asynchronous = await calculateFactoryStatisticsAsync(state, "all", { batchSize: 1, yieldControl });
    expect(asynchronous).toEqual(calculateFactoryStatistics(state, "all"));
    expect(yieldControl).toHaveBeenCalled();
  });

  it("cancels without returning a partial result", async () => {
    const state = createInitialState();
    const controller = new AbortController();
    let yields = 0;
    await expect(calculateFactoryStatisticsAsync(state, "all", {
      batchSize: 1,
      signal: controller.signal,
      yieldControl: async () => {
        yields += 1;
        controller.abort();
      },
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(yields).toBe(1);
  });
});
