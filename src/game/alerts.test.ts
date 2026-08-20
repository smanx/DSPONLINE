import { describe, expect, it } from "vitest";
import { createFactoryAlertProjection, getFactoryAlerts, materializeFactoryAlerts } from "./alerts";
import { advanceSimulation, createInitialState, createSimulationPlanetPhaseLookup, installMiner, placeBuilding, setPaused } from "./engine";

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

  it("preserves exact alert semantics when the shared simulation lookup is supplied", () => {
    let state = createInitialState();
    state = placeBuilding(state, "arc_smelter", { x: 0, y: 0 });
    state = placeBuilding(state, "planetary_logistics_station", { x: 200, y: 0 });

    expect(getFactoryAlerts(state, {
      lookup: createSimulationPlanetPhaseLookup(state),
    })).toEqual(getFactoryAlerts(state));
  });

  it("projects and materializes exact global alerts across planets without a main-thread rescan", () => {
    let state = placeBuilding(createInitialState(), "arc_smelter", { x: 0, y: 0 });
    const local = state.entities.find((entity) => entity.buildingId === "arc_smelter")!;
    state = {
      ...state,
      entities: [...state.entities, {
        ...structuredClone(local),
        id: "remote_alert_smelter",
        planetId: "dune",
        position: { x: 300, y: 0 },
      }],
    };
    const lookup = createSimulationPlanetPhaseLookup(state);
    const projection = createFactoryAlertProjection(state, lookup);
    const materialized = materializeFactoryAlerts(state, projection);
    const reorderedState = { ...state, entities: [...state.entities].reverse() };

    expect(materialized).toEqual(getFactoryAlerts(state, { lookup }));
    expect(materializeFactoryAlerts(reorderedState, projection)).toEqual(materialized);
    expect(new Set(materialized.map((alert) => alert.planetId))).toEqual(new Set(["home", "dune"]));
    expect(new TextEncoder().encode(JSON.stringify(projection)).byteLength).toBeLessThan(8 * 1024);
  });
});
