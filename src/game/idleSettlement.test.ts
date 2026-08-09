import { describe, expect, it } from "vitest";
import { createInitialState } from "./engine";
import { validatePureIdleResourceAccounting } from "./offlineApproximation";
import { beginIdleRun, finishIdleRun, settleIdleRun } from "./idleSettlement";
import type { IdleSettlementState } from "./types";

describe("纯挂机结算游标", () => {
  it("5 分钟停止后再次挂机只累计各自的本次运行", () => {
    let settlement = beginIdleRun({
      currentRunStartedAt: null,
      currentRunElapsed: 0,
      lastSettledAt: 0,
      totalIdleTime: 0,
      currentRunProduction: {},
      totalProduction: {},
    }, 1_000);
    settlement = settleIdleRun(settlement, 300, {}, { iron_ore: 25 });
    settlement = finishIdleRun(settlement);
    expect(settlement).toMatchObject({ currentRunStartedAt: null, currentRunElapsed: 300, lastSettledAt: 300, totalIdleTime: 300, totalProduction: { iron_ore: 25 } });

    settlement = beginIdleRun(settlement, 301_000);
    settlement = settleIdleRun(settlement, 300, {}, { iron_ore: 10 });
    expect(settlement.currentRunElapsed).toBe(300);
    expect(settlement.totalIdleTime).toBe(600);
    expect(settlement.currentRunProduction).toEqual({ iron_ore: 10 });
    expect(settlement.totalProduction).toEqual({ iron_ore: 35 });
  });

  it("重复停止、离开重进和快速开始/停止对同一游标幂等", () => {
    let settlement = beginIdleRun(finishIdleRun(settlementFixture()), 1_000);
    settlement = settleIdleRun(settlement, 300, {}, { copper_ore: 12 });
    const once = structuredClone(settlement);
    expect(settleIdleRun(settlement, 300, {}, { copper_ore: 12 })).toEqual(once);

    const duplicateStart = beginIdleRun(settlement, 302_000);
    expect(duplicateStart).toEqual(settlement);
    settlement = beginIdleRun(finishIdleRun(settlement), 301_000);
    settlement = beginIdleRun(settlement, 302_000);
    settlement = settleIdleRun(settlement, 0, {}, {});
    expect(settlement.totalIdleTime).toBe(300);
    expect(settlement.currentRunProduction).toEqual({});
  });

  it("暂停恢复只结算新增区间，重新打开存档不会重复产量", () => {
    let settlement = beginIdleRun(settlementFixture(), 1_000);
    settlement = settleIdleRun(settlement, 120, {}, { stone: 4 });
    const paused = settleIdleRun(settlement, 120, {}, { stone: 4 });
    expect(paused.totalIdleTime).toBe(120);
    expect(paused.totalProduction).toEqual({ stone: 4 });
    const reopened = settleIdleRun(structuredClone(paused), 300, {}, { stone: 10 });
    expect(reopened.totalIdleTime).toBe(300);
    expect(reopened.totalProduction).toEqual({ stone: 10 });
  });

  it("矿脉扣除没有对应累计产量时拒绝宏观候选，有对应产量时通过", () => {
    const before = createInitialState(undefined, false);
    const vein = before.entities.find((entity) => entity.kind === "vein" && entity.resourceId === "iron_ore");
    expect(vein).toBeDefined();
    if (!vein) return;
    const after = structuredClone(before);
    const afterVein = after.entities.find((entity) => entity.id === vein.id);
    if (!afterVein) return;
    afterVein.resourceRemaining = Math.max(0, (afterVein.resourceRemaining ?? 0) - 1);
    expect(validatePureIdleResourceAccounting(before, after)).toContain("累计产量");
    after.totalProduced.iron_ore = 1;
    expect(validatePureIdleResourceAccounting(before, after)).toBeNull();
  });
});

function settlementFixture(): IdleSettlementState {
  return {
    currentRunStartedAt: null,
    currentRunElapsed: 0,
    lastSettledAt: 0,
    totalIdleTime: 0,
    currentRunProduction: {},
    totalProduction: {},
  };
}
