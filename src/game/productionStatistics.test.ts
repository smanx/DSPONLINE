import { describe, expect, it } from "vitest";
import {
  calculateProductionWindowSnapshot,
  compactProductionHistory,
  formatProductionStatistic,
  getProductionHistorySampleDuration,
  PRODUCTION_HISTORY_SAMPLE_SECONDS,
} from "./productionStatistics";
import type { ProductionHistorySample } from "./types";

function sample(elapsedSeconds: number, rate: number, duration = 1): ProductionHistorySample {
  return {
    elapsedSeconds,
    sampleDurationSeconds: duration,
    productionPerMinute: { iron_ingot: rate },
    consumptionPerMinute: { iron_ore: rate * 2 },
    inventory: { iron_ingot: elapsedSeconds },
    generationKw: rate,
    demandKw: rate / 2,
    machineEfficiency: 0.5,
    logisticsEfficiency: 0.25,
    powerEfficiency: 1,
    activeMachines: 2,
    blockedMachines: 0,
  };
}

describe("production statistics rolling buckets", () => {
  it("records a true one-second online window", () => {
    expect(PRODUCTION_HISTORY_SAMPLE_SECONDS).toBe(1);
  });

  it("keeps one hour while compacting old one-second samples", () => {
    let history: ProductionHistorySample[] = [];
    for (let second = 1; second <= 3_700; second += 1) {
      history.push(sample(second, 60));
      history = compactProductionHistory(history);
    }

    expect(history.length).toBeLessThan(200);
    expect(history.reduce((sum, entry) => sum + getProductionHistorySampleDuration(entry), 0)).toBeGreaterThanOrEqual(3_600);
    expect(history.at(-1)?.elapsedSeconds).toBe(3_700);
    expect(history.some((entry) => getProductionHistorySampleDuration(entry) === 1)).toBe(true);
    expect(history.some((entry) => getProductionHistorySampleDuration(entry) === 10)).toBe(true);
    expect(history.some((entry) => getProductionHistorySampleDuration(entry) === 60)).toBe(true);
  });

  it("compacts higher-speed Worker publications by covered time", () => {
    let history: ProductionHistorySample[] = [];
    for (let second = 4; second <= 3_700; second += 4) {
      history.push(sample(second, 60, 4));
      history = compactProductionHistory(history);
    }

    expect(history.length).toBeLessThan(200);
    expect(history.reduce((sum, entry) => sum + getProductionHistorySampleDuration(entry), 0)).toBeGreaterThanOrEqual(3_600);
    expect(history.at(-1)?.elapsedSeconds).toBe(3_700);
    expect(history.some((entry) => getProductionHistorySampleDuration(entry) >= 10)).toBe(true);
    expect(history.some((entry) => getProductionHistorySampleDuration(entry) >= 60)).toBe(true);
  });

  it("uses the same rolling window for rows and totals", () => {
    const history = Array.from({ length: 120 }, (_, index) => sample(index + 1, index < 60 ? 60 : 120));
    const perSecond = calculateProductionWindowSnapshot(history, "second");
    const perMinute = calculateProductionWindowSnapshot(history, "minute");
    const perTenMinutes = calculateProductionWindowSnapshot(history, "ten-minutes");

    expect(perSecond.production.iron_ingot).toBe(2);
    expect(perSecond.totalProduction).toBe(2);
    expect(perMinute.production.iron_ingot).toBe(120);
    expect(perMinute.totalProduction).toBe(120);
    expect(perTenMinutes.production.iron_ingot).toBe(900);
    expect(perTenMinutes.totalProduction).toBe(900);
    expect(perMinute.consumption.iron_ore).toBe(240);
  });

  it("uses current rates before the first simulated bucket and formats large values", () => {
    const snapshot = calculateProductionWindowSnapshot([], "minute", { iron_ingot: 97_200 }, { iron_ore: 1 });
    expect(snapshot.production.iron_ingot).toBe(97_200);
    expect(formatProductionStatistic(snapshot.production.iron_ingot!)).toBe("9.72万");
    expect(formatProductionStatistic(12)).toBe("12");
    expect(formatProductionStatistic(12.5)).toBe("12.5");
    expect(formatProductionStatistic(0)).toBe("0");
  });
});
