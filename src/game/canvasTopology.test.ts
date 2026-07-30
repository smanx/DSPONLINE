import { describe, expect, it } from "vitest";
import { createInitialState } from "./engine";
import { buildFactoryEdgeRouteCenters, reconcileFactoryCanvasTopology } from "./canvasTopology";

describe("factory canvas topology", () => {
  it("reuses topology when only runtime telemetry changes", () => {
    const state = createInitialState();
    const entities = state.entities.filter((entity) => entity.planetId === state.activePlanetId);
    const previous = reconcileFactoryCanvasTopology(null, state.activePlanetId, entities, []);
    const changedTelemetry = entities.map((entity) => ({ ...entity, progress: entity.progress + 0.5, outputs: { ...entity.outputs, iron_ore: 42 } }));
    const next = reconcileFactoryCanvasTopology(previous, state.activePlanetId, changedTelemetry, []);
    expect(next).toBe(previous);
  });

  it("rebuilds stable occupancy and route geometry after topology changes", () => {
    const state = createInitialState();
    const [source, target, blocker] = state.entities.slice(0, 3);
    source.position = { x: 0, y: 0 };
    target.position = { x: 900, y: 0 };
    blocker.position = { x: 420, y: 0 };
    const belt = {
      id: "belt_canvas_cache",
      planetId: state.activePlanetId,
      source: source.id,
      target: target.id,
      itemId: source.resourceId ?? "iron_ore",
      tier: 1 as const,
      sorterTier: 1 as const,
      lanes: 4,
      stackSize: 2 as const,
      priority: 1 as const,
      routeMode: "auto" as const,
      progress: 0,
      totalTransferred: 0,
      lastFlow: 0,
      congestion: 0,
    };
    const topology = reconcileFactoryCanvasTopology(null, state.activePlanetId, [source, target, blocker], [belt]);
    expect(topology.occupancy.output.get(source.id)?.[belt.itemId]).toBe(4);
    expect(topology.connectedInputsByTarget.get(target.id)).toEqual([belt.itemId]);
    const centers = buildFactoryEdgeRouteCenters(topology, [
      { id: source.id, x: 0, y: 0, width: 256, height: 180 },
      { id: target.id, x: 900, y: 0, width: 256, height: 180 },
      { id: blocker.id, x: 420, y: 0, width: 256, height: 180 },
    ], false);
    expect(centers.get(belt.id)).toBeLessThan(0);
    const moved = [{ ...source, position: { x: 20, y: 0 } }, target, blocker];
    expect(reconcileFactoryCanvasTopology(topology, state.activePlanetId, moved, [belt])).not.toBe(topology);
  });
});
