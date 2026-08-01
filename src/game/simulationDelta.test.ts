import { describe, expect, it } from "vitest";
import { createInitialState } from "./engine";
import { applySimulationStateDelta, createSimulationStateDelta } from "./simulationDelta";

describe("experimental simulation delta protocol", () => {
  it("round-trips changed runtime records and top-level state without changing order", () => {
    const previous = createInitialState();
    const current = structuredClone(previous);
    current.elapsedSeconds = 42;
    current.entities[0].progress = 0.75;
    const delta = createSimulationStateDelta(previous, current, 7, 8);
    const applied = applySimulationStateDelta(previous, delta);
    expect(applied).toEqual(current);
    expect(applied.entities.map((entity) => entity.id)).toEqual(current.entities.map((entity) => entity.id));
  });

  it("reports removals and additions without duplicating records", () => {
    const previous = createInitialState();
    const current = structuredClone(previous);
    const removed = current.entities.shift()!;
    current.entities.push({ ...removed, id: "new-entity", progress: 0.2 });
    const delta = createSimulationStateDelta(previous, current, 1, 2);
    const applied = applySimulationStateDelta(previous, delta);
    expect(applied.entities.some((entity) => entity.id === removed.id)).toBe(false);
    expect(applied.entities.filter((entity) => entity.id === "new-entity")).toHaveLength(1);
  });
});
