import { describe, expect, it } from "vitest";
import { cloudRestoreTargetIssue, cloudSaveModeLabel, cloudSaveSlotLabel } from "./cloudSaveRecovery";

function inspection(mode: "normal" | "speedrun", slot: "main" | 1 | 2 | 3, valid = true) {
  return { valid, mode, slot, issues: valid ? [] : ["合成格式错误"] };
}

describe("cloud save recovery target guard", () => {
  it("always names both the save mode and slot", () => {
    expect(cloudSaveModeLabel("normal")).toBe("普通模式");
    expect(cloudSaveModeLabel("speedrun")).toBe("速通模式");
    expect(cloudSaveSlotLabel("speedrun", "main")).toBe("速通模式 · 主存档");
    expect(cloudSaveSlotLabel("normal", "2")).toBe("普通模式 · 槽位 2");
  });

  it("accepts an old metadata record only when the envelope matches the selected target", () => {
    expect(cloudRestoreTargetIssue(inspection("speedrun", "main"), {}, "speedrun", "main")).toBeNull();
    expect(cloudRestoreTargetIssue(inspection("speedrun", 2), { mode: "speedrun", slot: "2" }, "speedrun", "2")).toBeNull();
  });

  it("blocks normal-to-speedrun conversion and cross-slot restore", () => {
    expect(cloudRestoreTargetIssue(inspection("normal", "main"), {}, "speedrun", "main"))
      .toContain("正文属于普通模式");
    expect(cloudRestoreTargetIssue(inspection("speedrun", 1), { mode: "speedrun", slot: "1" }, "speedrun", "2"))
      .toContain("元数据属于速通模式 · 槽位 1");
  });

  it("rejects an invalid payload before any local write", () => {
    expect(cloudRestoreTargetIssue(inspection("speedrun", "main", false), {}, "speedrun", "main"))
      .toBe("合成格式错误");
  });
});
