import { describe, expect, it } from "vitest";

import { registerGameCatalogEnglish } from "./catalogEnglish";
import { registerCatalogEnglish, translateLegacyText } from "./legacyTranslations";

describe("device-local English translations", () => {
  it("keeps Chinese unchanged and translates core UI labels", () => {
    expect(translateLegacyText("生产资料库", "zh-CN")).toBe("生产资料库");
    expect(translateLegacyText("生产资料库", "en")).toBe("Production Library");
    expect(translateLegacyText("  游戏设置  ", "en")).toBe("  Game Settings  ");
    expect(translateLegacyText("2 小时 8 分", "en")).toBe("2 h 8 min");
  });

  it("loads English names for gameplay catalog definitions without changing them", () => {
    registerGameCatalogEnglish();
    expect(translateLegacyText("铁矿石", "en")).toBe("Iron Ore");
    expect(translateLegacyText("制造台 Mk.III", "en")).toBe("Assembling Machine Mk.III");
    expect(translateLegacyText("戴森球计划", "en")).toBe("Dyson Sphere Program");
    expect(translateLegacyText("重整精炼", "en")).toBe("Reforming Refine");
    expect(translateLegacyText("重整精炼配方", "en")).toBe("Reforming Refine Recipe");
    expect(translateLegacyText("白糖产量", "en")).toBe("White Matrix Output");
    expect(translateLegacyText("主题快速设置", "en")).toBe("Theme Quick Settings");
    expect(translateLegacyText("澄海 I", "en")).toBe("Clearwater I");
    expect(translateLegacyText("层级 01", "en")).toBe("Tier 01");
    expect(translateLegacyText("前置：能量矩阵、基础物流系统", "en")).toBe("Prerequisites: Energy Matrix, Basic Logistics System");
    expect(translateLegacyText("1千–1亿", "en")).toBe("1K–100M");
    expect(translateLegacyText("长按采集铁矿石", "en")).toBe("Hold to gather Iron Ore");
    expect(translateLegacyText("缺口 铁矿石×10、铜矿石×2", "en")).toBe("Missing: Iron Ore ×10, Copper Ore ×2");
    expect(translateLegacyText("1 批 · 实际产出 ×3", "en")).toBe("1 batch · Actual output ×3");
    expect(translateLegacyText("实际结算吞吐", "en")).toBe("Actual Settled Throughput");
    expect(translateLegacyText("等待第二次有效云同步：两次普通模式主云同步需相隔至少 60 个模拟秒", "en")).toContain("second valid cloud sync");
    expect(translateLegacyText("两次普通模式主云同步仅相隔 59 个模拟秒，还需 1 秒才能统计", "en")).toContain("59 simulated seconds");
    expect(translateLegacyText("有效的 60 秒统计窗口已经形成，本窗口白糖产量确实为 0", "en")).toContain("genuinely zero");
    expect(translateLegacyText("本地个人档案记录为 196亿/min，但该值尚未通过服务端有效主云窗口校验，因此不会直接写入排行榜。", "en")).toContain("19.6B/min");
    expect(translateLegacyText("玩家请求停止", "en")).toBe("Player Requested Stop");
    expect(translateLegacyText("放弃约 2 分钟 未结算时间并继续普通模拟", "en")).toBe("Abandon about 2 min of unsettled time and continue normal simulation");
    expect(translateLegacyText("拉线候选建筑同步高亮", "en")).toBe("Compatible Buildings Highlight While Connecting");
  });

  it("accepts late translations for lazy content", () => {
    expect(translateLegacyText("测试延迟文本", "en")).toBe("测试延迟文本");
    registerCatalogEnglish([["测试延迟文本", "Late-loaded text"]]);
    expect(translateLegacyText("测试延迟文本", "en")).toBe("Late-loaded text");
  });
});
