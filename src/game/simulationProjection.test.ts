import { describe, expect, it } from "vitest";
import { createInitialState } from "./engine";
import { captureSimulationProjectionBaseline, createSimulationProjection } from "./simulationProjection";

describe("simulation projection", () => {
  it("reports only changed runtime ids while preserving aggregate counts", () => {
    const previous = createInitialState();
    const current = structuredClone(previous);
    current.elapsedSeconds = 10;
    current.entities[0].progress = 0.25;
    const projection = createSimulationProjection(previous, current);
    expect(projection.protocolVersion).toBe(2);
    expect(projection.changedEntityIds).toContain(current.entities[0].id);
    expect(projection.changedBeltIds).toEqual([]);
    expect(projection.entityCount).toBe(current.entities.length);
    expect(projection.beltCount).toBe(current.belts.length);
    expect(projection.changedEntities[0]).toMatchObject({ id: current.entities[0].id, progress: 0.25 });
    expect(projection.requiresFullSnapshot).toBe(false);
  });

  it("detects in-place persistent runtime mutation from a pre-step baseline", () => {
    const current = createInitialState();
    const baseline = captureSimulationProjectionBaseline(current);
    current.entities[0].progress = 0.875;
    const projection = createSimulationProjection(baseline, current);
    expect(projection.changedEntityIds).toContain(current.entities[0].id);
    expect(projection.topologyChangedEntityIds).not.toContain(current.entities[0].id);
  });
});
