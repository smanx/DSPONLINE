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
    expect(translateLegacyText("澄海 I", "en")).toBe("Clearwater I");
    expect(translateLegacyText("层级 01", "en")).toBe("Tier 01");
    expect(translateLegacyText("前置：能量矩阵、基础物流系统", "en")).toBe("Prerequisites: Energy Matrix, Basic Logistics System");
    expect(translateLegacyText("1千–1亿", "en")).toBe("1K–100M");
    expect(translateLegacyText("长按采集铁矿石", "en")).toBe("Hold to gather Iron Ore");
    expect(translateLegacyText("缺口 铁矿石×10、铜矿石×2", "en")).toBe("Missing: Iron Ore ×10, Copper Ore ×2");
    expect(translateLegacyText("1 批 · 实际产出 ×3", "en")).toBe("1 batch · Actual output ×3");
  });

  it("accepts late translations for lazy content", () => {
    expect(translateLegacyText("测试延迟文本", "en")).toBe("测试延迟文本");
    registerCatalogEnglish([["测试延迟文本", "Late-loaded text"]]);
    expect(translateLegacyText("测试延迟文本", "en")).toBe("Late-loaded text");
  });
});
