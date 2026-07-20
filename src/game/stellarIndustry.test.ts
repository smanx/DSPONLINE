import { describe, expect, it } from "vitest";
import { createInitialState, placeBuilding, setActivePlanet, setLogisticsItem, setStationSlotLimits, setStationSlotMode } from "./engine";
import { getPlanetIndustrySummaries, getStellarRouteSnapshots } from "./stellarIndustry";

describe("stellar industry selectors", () => {
  it("builds a cross-system route snapshot from the same station slots used by simulation", () => {
    let state = createInitialState();
    state.research.completedTechIds.push("interstellar_logistics", "stellar_exploration", "space_warp");
    state.exploration.unlockedSystemIds.push("borealis");
    state.exploration.colonizedPlanetIds.push("frost");
    state.construction.interstellar_logistics_station = 2;
    state = placeBuilding(state, "interstellar_logistics_station", { x: -180, y: 0 });
    const source = state.entities.find((entity) => entity.planetId === "home" && entity.buildingId === "interstellar_logistics_station")!;
    state = setLogisticsItem(state, source.id, "titanium_ingot");
    state = setStationSlotMode(state, source.id, 0, "remote", "supply");
    state.entities.find((entity) => entity.id === source.id)!.outputs.titanium_ingot = 250;
    state = setActivePlanet(state, "frost");
    state = placeBuilding(state, "interstellar_logistics_station", { x: 180, y: 0 });
    const target = state.entities.find((entity) => entity.planetId === "frost" && entity.buildingId === "interstellar_logistics_station")!;
    state = setLogisticsItem(state, target.id, "titanium_ingot");
    state = setStationSlotMode(state, target.id, 0, "remote", "demand");
    state.entities.find((entity) => entity.id === target.id)!.stationVessels = 2;
    state = setStationSlotLimits(state, target.id, 0, 0, 320);

    const routes = getStellarRouteSnapshots(state);
    expect(routes).toHaveLength(1);
    const route = routes.find((candidate) => candidate.scope === "remote")!;
    expect(route.sourceStationId).toBe(source.id);
    expect(route.targetStationId).toBe(target.id);
    expect(route.distanceLy).toBeCloseTo(4.2, 1);
    expect(route.warpersPerTrip).toBe(2);
    expect(route.targetLimit).toBe(320);
    expect(route.status).toBe("missing-warper");

    state.entities.find((entity) => entity.id === target.id)!.stationWarpers = 2;
    const ready = getStellarRouteSnapshots(state).find((candidate) => candidate.scope === "remote")!;
    expect(ready.status).toBe("ready");
    const summary = getPlanetIndustrySummaries(state).find((planet) => planet.planetId === "frost")!;
    expect(summary.configuredImports).toBeGreaterThan(0);
    expect(summary.roleLabel).toContain("物流");
  });
});
