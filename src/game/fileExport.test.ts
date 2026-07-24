import { describe, expect, it } from "vitest";
import { safeExportFileName } from "./fileExport";

describe("native-safe file export names", () => {
  it("removes reserved path characters without discarding the extension", () => {
    expect(safeExportFileName('a/b:c*?"d<e>|.json')).toBe("a-b-c---d-e--.json");
  });

  it("uses a stable fallback and bounds excessively long names", () => {
    expect(safeExportFileName("   ")).toBe("dsp-export.json");
    expect(safeExportFileName("a".repeat(200))).toHaveLength(120);
  });
});
