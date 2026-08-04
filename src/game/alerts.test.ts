import { describe, expect, it } from "vitest";
import { getFactoryAlerts } from "./alerts";
import { advanceSimulation, createInitialState, installMiner, placeBuilding, setPaused } from "./engine";

describe("factory alerts", () => {
  it("does not report undeveloped resource veins", () => {
    expect(getFactoryAlerts(createInitialState())).toEqual([]);
  });

  it("reports a deployed miner without power and links it to its planet", () => {
    const state = advanceSimulation(installMiner(createInitialState(), "vein_iron", 1), 1);
    const alert = getFactoryAlerts(state).find((candidate) => candidate.entityId === "vein_iron");

    expect(alert).toMatchObject({
      severity: "critical",
      statusCode: "no-power",
      planetId: "home",
      location: "澄海 I · 母星",
    });
    expect(alert?.title).toContain("铁矿石");
  });

  it("reports production equipment waiting for input and suppresses alerts while paused", () => {
    let state = createInitialState();
    state = placeBuilding(state, "arc_smelter", { x: 0, y: 0 });
    const smelter = state.entities.find((entity) => entity.buildingId === "arc_smelter")!;

    expect(getFactoryAlerts(state).find((alert) => alert.entityId === smelter.id)).toMatchObject({
      severity: "warning",
      statusCode: "missing-input",
    });
    expect(getFactoryAlerts(setPaused(state, true))).toEqual([]);
  });

  it("can publish a count-only alert snapshot without building descriptions", () => {
    let state = createInitialState();
    state = placeBuilding(state, "arc_smelter", { x: 0, y: 0 });
    const alert = getFactoryAlerts(state, { details: false }).find((candidate) => candidate.statusCode === "missing-input");
    expect(alert).toMatchObject({ title: "", reason: "", location: "" });
  });
});
