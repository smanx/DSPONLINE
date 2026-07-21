/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from "vitest";
import { getMenuContinueSave, getMenuPlanetName, getMenuSlotSummaries, getMenuSnapshotSummaries } from "./savePreview";

function savePayload({ savedAt = 100, elapsedSeconds = 3600, planet = "home", technologyCount = 2 } = {}) {
  return JSON.stringify({
    formatVersion: 2,
    savedAt,
    state: {
      version: 24,
      entities: [],
      elapsedSeconds,
      activePlanetId: planet,
      research: { completedTechIds: Array.from({ length: technologyCount }, (_, index) => `tech_${index}`) },
      dysonSphere: { structurePoints: 42 },
      settings: { fontScale: 1.25, simulationSpeed: 2 },
    },
  });
}

describe("menu save previews", () => {
  beforeEach(() => window.localStorage.clear());

  it("reads a primary summary without rewriting storage", () => {
    const raw = savePayload({ savedAt: 123, elapsedSeconds: 7200, planet: "ashen", technologyCount: 3 });
    window.localStorage.setItem("dsp-idle-network.save.v1", raw);
    const before = { ...window.localStorage };

    expect(getMenuContinueSave()).toMatchObject({
      source: "primary",
      raw,
      summary: { savedAt: 123, elapsedSeconds: 7200, activePlanetId: "ashen", completedTechCount: 3, structurePoints: 42 },
      settings: { fontScale: 1.25, simulationSpeed: 2 },
    });
    expect({ ...window.localStorage }).toEqual(before);
    expect(getMenuPlanetName("ashen")).toBe("烬原 II");
  });

  it("falls back to a parseable backup and indexes slots and snapshots", () => {
    window.localStorage.setItem("dsp-idle-network.save.v1", "{broken");
    window.localStorage.setItem("dsp-idle-network.save.v1.backup", savePayload({ savedAt: 200, planet: "frost" }));
    window.localStorage.setItem("dsp-idle-network.slot.2", savePayload({ savedAt: 300, planet: "magnetar" }));
    window.localStorage.setItem("dsp-idle-network.save.v1.snapshot.100-1", JSON.stringify({ ...JSON.parse(savePayload({ savedAt: 100 })), reason: "较早快照" }));
    window.localStorage.setItem("dsp-idle-network.save.v1.snapshot.400-2", JSON.stringify({ ...JSON.parse(savePayload({ savedAt: 400 })), reason: "最新快照" }));

    expect(getMenuContinueSave()).toMatchObject({ source: "backup", summary: { activePlanetId: "frost" } });
    expect(getMenuSlotSummaries()).toEqual([expect.objectContaining({ slotId: 2, activePlanetId: "magnetar", valid: true })]);
    expect(getMenuSnapshotSummaries().map(({ reason }) => reason)).toEqual(["最新快照", "较早快照"]);
  });
});
