import { describe, expect, it } from "vitest";
import { createOrbitalStationState } from "./orbitalStation";
import {
  getStationDecorationPlacementCheck,
  getStationLevel,
  grantStationEconomyForTestingOrContent,
  placeStationDecoration,
  purchaseStationDecoration,
  purchaseStationTheme,
  removeStationDecoration,
  setStationTheme,
  updateStationDecoration,
} from "./stationDecorations";

function operationalStation() {
  const station = createOrbitalStationState({ universeMatrixProduced: 1, nowMs: 0 });
  station.status = "operational";
  return grantStationEconomyForTestingOrContent(station, "10000", "5000");
}

describe("orbital station decorations", () => {
  it("derives level and capacity only from non-spendable reputation", () => {
    expect(getStationLevel("0").level).toBe(1);
    expect(getStationLevel("799").level).toBe(3);
    expect(getStationLevel("5000").placementLimit).toBe(256);
    const station = operationalStation();
    const reputation = station.economy.stationReputation;
    const purchased = purchaseStationDecoration(station, "cargo_crate");
    expect(purchased.economy.orbitalMarks).toBe("9970");
    expect(purchased.economy.stationReputation).toBe(reputation);
  });

  it("keeps permanent licenses after placement removal", () => {
    let station = purchaseStationDecoration(operationalStation(), "cargo_crate");
    station = placeStationDecoration(station, "cargo_crate", { x: -750, y: 400, rotation: 0, layer: 1, variant: 0 }, "decor_1");
    expect(station.layout.placements).toHaveLength(1);
    station = removeStationDecoration(station, "decor_1");
    expect(station.layout.placements).toHaveLength(0);
    expect(station.economy.unlockedDecorationIds).toContain("cargo_crate");
    const placedAgain = placeStationDecoration(station, "cargo_crate", { x: -650, y: 400, rotation: 90, layer: 2, variant: 1 }, "decor_2");
    expect(placedAgain.layout.placements).toHaveLength(1);
  });

  it("enforces unique trophies, bounds, anchor collision, rotation and layer", () => {
    let station = purchaseStationDecoration(operationalStation(), "contract_trophy");
    station = purchaseStationDecoration(station, "cargo_crate");
    station = purchaseStationDecoration(station, "observation_window");
    station = placeStationDecoration(station, "contract_trophy", { x: -700, y: 400, rotation: 0, layer: 1, variant: 0 }, "trophy_1");
    expect(station.layout.placements).toHaveLength(1);
    expect(placeStationDecoration(station, "contract_trophy", { x: 700, y: 400, rotation: 0, layer: 1, variant: 0 }, "trophy_2")).toBe(station);
    expect(getStationDecorationPlacementCheck(station, "cargo_crate", { x: 5_000, y: 0, rotation: 0, layer: 1, variant: 0 }).code).toBe("position");
    expect(getStationDecorationPlacementCheck(station, "cargo_crate", { x: -270, y: -80, rotation: 0, layer: 1, variant: 0 }).code).toBe("anchor");
    expect(getStationDecorationPlacementCheck(station, "observation_window", { x: -700, y: -300, rotation: 90, layer: 1, variant: 0 }).code).toBe("rotation");
    expect(getStationDecorationPlacementCheck(station, "deck_grid", { x: -700, y: -300, rotation: 0, layer: 2, variant: 0 }).code).toBe("layer");
  });

  it("validates moves and treats themes as permanent decoration licenses", () => {
    let station = purchaseStationDecoration(operationalStation(), "service_robot");
    station = placeStationDecoration(station, "service_robot", { x: -700, y: -350, rotation: 0, layer: 1, variant: 0 }, "robot_1");
    const invalid = updateStationDecoration(station, "robot_1", { x: -270, y: -80 });
    expect(invalid).toBe(station);
    const moved = updateStationDecoration(station, "robot_1", { x: -600, y: -350, rotation: 90 });
    expect(moved.layout.placements[0].x).toBe(-600);
    const marks = moved.economy.orbitalMarks;
    const licensed = purchaseStationTheme(moved, "nebula_violet");
    expect(BigInt(licensed.economy.orbitalMarks)).toBe(BigInt(marks) - 260n);
    expect(setStationTheme(licensed, "nebula_violet").layout.themeId).toBe("nebula_violet");
  });

  it("enforces the level-derived placement cap and invalid variants", () => {
    let station = purchaseStationDecoration(operationalStation(), "cargo_crate");
    expect(getStationDecorationPlacementCheck(station, "cargo_crate", { x: -700, y: -350, rotation: 0, layer: 1, variant: 99 }).code).toBe("variant");
    for (let index = 0; index < 256; index += 1) {
      station = placeStationDecoration(station, "cargo_crate", { x: -800, y: -450, rotation: 0, layer: 1, variant: index % 4 }, `crate_${index}`);
    }
    expect(station.layout.placements).toHaveLength(256);
    expect(placeStationDecoration(station, "cargo_crate", { x: -700, y: -450, rotation: 0, layer: 1, variant: 0 }, "crate_overflow")).toBe(station);
  });
});
