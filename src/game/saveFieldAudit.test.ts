import { describe, expect, it } from "vitest";
import { createInitialState, createSimulationLookupContext } from "./engine";
import { exportGame, importGame, inspectSave } from "./storage";
import { getSaveFieldAuditByClass, SAVE_FIELD_AUDIT_V136 } from "./saveFieldAudit";

describe("1.0.36 save/runtime field audit", () => {
  it("classifies authority separately from reconstructable runtime state", () => {
    expect(getSaveFieldAuditByClass("authority").every((entry) => entry.persisted)).toBe(true);
    expect(getSaveFieldAuditByClass("runtime-cache").every((entry) => !entry.persisted)).toBe(true);
    expect(new Set(SAVE_FIELD_AUDIT_V136.map((entry) => entry.classification))).toEqual(new Set([
      "authority", "runtime-cache", "ui-observation", "migration-only",
    ]));
  });

  it("never serializes the new runtime indexes and keeps a v46 envelope valid", () => {
    const state = createInitialState();
    const lookup = createSimulationLookupContext(state);
    expect(lookup.beltRuntime).toBeDefined();
    const payload = exportGame(state);
    expect(payload).not.toContain("beltRuntime");
    expect(payload).not.toContain("blockedStationDispatch");
    expect(payload).not.toContain("machineRuntimesByPlanet");
    expect(inspectSave(payload).checksum).toBe("valid");
    expect(importGame(payload)?.version).toBe(47);
  });
});
