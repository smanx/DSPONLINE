import { describe, expect, it } from "vitest";
import { advanceSimulation, createInitialState } from "./engine";
import { cloneOrbitalStationState } from "./orbitalStation";
import {
  STATION_TASK_DAY_MS,
  STATION_TASK_TIME_ZONE_OFFSET_MS,
  acceptStationContract,
  abandonStationContract,
  claimStationContract,
  deliverStationContractMutable,
  getStationContractCompletionBasisPoints,
  stationTaskDayIndex,
  synchronizeStationContracts,
} from "./stationContracts";
import { stationInteger } from "./stationMath";
import type { GameState, StationContract } from "./types";

function atTaskDay(day: number): number {
  return day * STATION_TASK_DAY_MS - STATION_TASK_TIME_ZONE_OFFSET_MS + 1_000;
}

function contractReadyState(seed = 12345, day = 20): GameState {
  const state = createInitialState(seed, false);
  state.totalProduced = {
    titanium_alloy: 1,
    processor: 1,
    particle_container: 1,
    titanium_glass: 1,
    particle_broadband: 1,
    plastic: 1,
    space_warper: 1,
    frame_material: 1,
    solar_sail: 1,
    small_carrier_rocket: 1,
    quantum_chip: 1,
    antimatter_fuel_rod: 1,
    universe_matrix: 1,
  };
  state.orbitalStation.status = "showcase-building";
  state.orbitalStation.contractBoard.taskDay = day;
  state.orbitalStation.contractBoard.lastConfirmedWallClockMs = atTaskDay(day);
  state.orbitalStation = synchronizeStationContracts(state, atTaskDay(day));
  return state;
}

function deliverContract(station: GameState["orbitalStation"], contract: StationContract, fraction = 1): void {
  for (const requirement of contract.requirements) {
    const amount = stationInteger(requirement.amount) * BigInt(Math.floor(fraction * 1_000)) / 1_000n;
    const channel = requirement.channel === "quantum" ? "quantum" : "terminal";
    deliverStationContractMutable(
      station,
      contract.id,
      requirement.itemId,
      amount,
      channel,
      requirement.sourcePlanetIds?.[0] ?? "home",
    );
  }
}

describe("orbital station contracts", () => {
  it("does not write wall-clock calibration into saves before contracts unlock", () => {
    const state = createInitialState(12345, false);
    const initialClock = state.orbitalStation.contractBoard.lastConfirmedWallClockMs;
    const synchronized = synchronizeStationContracts(state, initialClock + STATION_TASK_DAY_MS * 10, 999_999);
    expect(synchronized).toBe(state.orbitalStation);
    expect(synchronized.contractBoard.lastConfirmedWallClockMs).toBe(initialClock);
  });

  it("generates a stable 3+1 board from seed, task day and rules version", () => {
    const first = contractReadyState(55123, 42);
    const second = contractReadyState(55123, 42);
    expect(first.orbitalStation.contractBoard.offers).toEqual(second.orbitalStation.contractBoard.offers);
    expect(first.orbitalStation.contractBoard.offers).toHaveLength(4);
    expect(first.orbitalStation.contractBoard.offers.filter((contract) => contract.special)).toHaveLength(1);
    expect(first.orbitalStation.contractBoard.offers.slice(0, 3).every((contract) => !contract.special)).toBe(true);
  });

  it("enforces three accepted slots and keeps accepted contracts across refresh", () => {
    let station = contractReadyState().orbitalStation;
    const ids = station.contractBoard.offers.map((offer) => offer.id);
    station = acceptStationContract(station, ids[0]);
    station = acceptStationContract(station, ids[1]);
    station = acceptStationContract(station, ids[2]);
    const unchanged = acceptStationContract(station, ids[3]);
    expect(unchanged).toBe(station);
    expect(station.contractBoard.accepted).toHaveLength(3);
    const game = contractReadyState();
    game.orbitalStation = station;
    const advanced = synchronizeStationContracts(game, atTaskDay(station.contractBoard.taskDay + 1));
    expect(advanced.contractBoard.accepted.map((contract) => contract.id)).toEqual(ids.slice(0, 3));
    expect(advanced.contractBoard.offers).toHaveLength(4);
  });

  it("claims completion rewards exactly once", () => {
    const game = contractReadyState();
    const offer = game.orbitalStation.contractBoard.offers[0];
    let station = acceptStationContract(game.orbitalStation, offer.id);
    station = cloneOrbitalStationState(station);
    const accepted = station.contractBoard.accepted[0];
    deliverContract(station, accepted);
    expect(accepted.status).toBe("claimable");
    expect(getStationContractCompletionBasisPoints(accepted)).toBe(10_000);
    const claimed = claimStationContract(station, accepted.id);
    const marks = claimed.economy.orbitalMarks;
    const reputation = claimed.economy.stationReputation;
    const duplicate = claimStationContract(claimed, accepted.id);
    expect(duplicate).toBe(claimed);
    expect(duplicate.economy.orbitalMarks).toBe(marks);
    expect(duplicate.economy.stationReputation).toBe(reputation);
    expect(duplicate.totals.completedContracts).toBe(1);
    expect(duplicate.contractBoard.settledIds).toContain(accepted.id);
  });

  it("settles an expired partial contract proportionally without completion bonus", () => {
    const game = contractReadyState(9988, 10);
    const offer = game.orbitalStation.contractBoard.offers[0];
    game.orbitalStation = cloneOrbitalStationState(acceptStationContract(game.orbitalStation, offer.id));
    const accepted = game.orbitalStation.contractBoard.accepted[0];
    deliverContract(game.orbitalStation, accepted, 0.5);
    const basisPoints = getStationContractCompletionBasisPoints(accepted);
    expect(basisPoints).toBeGreaterThan(0);
    expect(basisPoints).toBeLessThan(10_000);
    const expired = synchronizeStationContracts(game, atTaskDay(accepted.expiresAtTaskDay));
    const history = expired.contractBoard.history.find((contract) => contract.id === accepted.id)!;
    expect(history.settlementReason).toBe("expired");
    expect(history.completionBasisPoints).toBe(basisPoints);
    expect(stationInteger(expired.economy.orbitalMarks)).toBeGreaterThan(0n);
    expect(expired.totals.completedContracts).toBe(0);
  });

  it("uses a monotonic wall-clock task day and ignores simulation/time-warp seconds", () => {
    const state = contractReadyState(7654, 50);
    expect(stationTaskDayIndex(atTaskDay(50))).toBe(50);
    const backwards = synchronizeStationContracts(state, atTaskDay(49));
    expect(backwards.contractBoard.taskDay).toBe(50);
    const simulated = advanceSimulation(state, 24 * 60 * 60);
    expect(simulated.orbitalStation.contractBoard.taskDay).toBe(50);
    expect(simulated.orbitalStation.contractBoard.offers).toEqual(state.orbitalStation.contractBoard.offers);
  });

  it("accepts an online server task-day calibration only in the forward direction", () => {
    const state = contractReadyState(7654, 50);
    const calibrated = synchronizeStationContracts(state, atTaskDay(49), 52);
    expect(calibrated.contractBoard.taskDay).toBe(52);
    const staleServer = synchronizeStationContracts({ ...state, orbitalStation: calibrated }, atTaskDay(48), 40);
    expect(staleServer.contractBoard.taskDay).toBe(52);
  });

  it("enforces channel and source-planet requirements before consuming progress", () => {
    const game = contractReadyState();
    game.orbitalStation.contractBoard.offers = [{
      id: "origin-contract",
      templateId: "origin",
      slot: 0,
      title: "原产订单",
      summary: "来源限制测试",
      taskDay: game.orbitalStation.contractBoard.taskDay,
      expiresAtTaskDay: game.orbitalStation.contractBoard.taskDay + 3,
      special: false,
      difficulty: "P2",
      status: "offered",
      requirements: [{ itemId: "processor", amount: "100", delivered: "0", sourcePlanetIds: ["home"], channel: "terminal", weight: 3 }],
      rewards: { baseMarks: "10", baseReputation: "10", completionMarks: "5", completionReputation: "5" },
    }];
    const station = cloneOrbitalStationState(acceptStationContract(game.orbitalStation, "origin-contract"));
    expect(deliverStationContractMutable(station, "origin-contract", "processor", 100n, "quantum").reason).toBe("invalid-channel");
    expect(deliverStationContractMutable(station, "origin-contract", "processor", 100n, "terminal", "verdant").reason).toBe("invalid-channel");
    expect(station.contractBoard.accepted[0].requirements[0].delivered).toBe("0");
    expect(deliverStationContractMutable(station, "origin-contract", "processor", 100n, "terminal", "home").accepted).toBe("100");
    expect(station.contractBoard.accepted[0].status).toBe("claimable");
  });

  it("settles an abandoned partial contract once and never grants the completion bonus", () => {
    const game = contractReadyState(4433, 15);
    const offer = game.orbitalStation.contractBoard.offers[0];
    let station = cloneOrbitalStationState(acceptStationContract(game.orbitalStation, offer.id));
    deliverContract(station, station.contractBoard.accepted[0], 0.25);
    const settled = abandonStationContract(station, offer.id);
    expect(settled.contractBoard.history[0].settlementReason).toBe("abandoned");
    expect(settled.totals.completedContracts).toBe(0);
    const marks = settled.economy.orbitalMarks;
    expect(abandonStationContract(settled, offer.id)).toBe(settled);
    expect(settled.economy.orbitalMarks).toBe(marks);
  });
});
