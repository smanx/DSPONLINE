import { describe, expect, it } from "vitest";
import { createInitialState } from "./engine";
import { createSimulationProjection } from "./simulationProjection";

describe("simulation projection", () => {
  it("reports only changed runtime ids while preserving aggregate counts", () => {
    const previous = createInitialState();
    const current = structuredClone(previous);
    current.elapsedSeconds = 10;
    current.entities[0].progress = 0.25;
    const projection = createSimulationProjection(previous, current);
    expect(projection.protocolVersion).toBe(1);
    expect(projection.changedEntityIds).toContain(current.entities[0].id);
    expect(projection.changedBeltIds).toEqual([]);
    expect(projection.entityCount).toBe(current.entities.length);
    expect(projection.beltCount).toBe(current.belts.length);
  });
});
