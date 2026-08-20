import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createInitialState, placeBuilding } from "./engine";
import { inspectSave, migrateGame } from "./storage";
import type { BeltConnection, FactoryEntity } from "./types";

const environment = (globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
}).process?.env;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

describe("1.0.43 large-save hotfix", () => {
  it("migrates a dense 20k-entity / 35k-belt worst case in linear time without reordering", () => {
    let state = createInitialState(10_643);
    state.construction.storage_mk1 = 1;
    state = placeBuilding(state, "storage_mk1", { x: 0, y: 0 });
    const template = state.entities.find((entity) => entity.buildingId === "storage_mk1")!;
    const entityCount = 20_000;
    const beltCount = 35_000;
    state.entities = Array.from({ length: entityCount }, (_, index) => ({
      ...structuredClone(template),
      id: `large-save-entity-${index}`,
      position: { x: index % 200, y: Math.floor(index / 200) },
      inputs: {},
      outputs: { iron_ore: index % 7 },
    } satisfies FactoryEntity));
    state.belts = Array.from({ length: beltCount }, (_, index) => ({
      id: `large-save-belt-${index}`,
      planetId: "home",
      source: `large-save-entity-${index % entityCount}`,
      target: `large-save-entity-${(index * 17 + 1) % entityCount}`,
      itemId: "iron_ore",
      lanes: 1,
      tier: 1,
      sorterTier: 1,
      progress: index % 11,
      priority: 0,
      stackSize: 1,
      monitorEnabled: false,
      totalTransferred: index,
      congestion: 0,
      lastFlow: 0,
      routeMode: "auto",
    } satisfies BeltConnection));

    const startedAt = performance.now();
    const migrated = migrateGame(state)!;
    const durationMs = performance.now() - startedAt;

    expect(migrated.belts).toHaveLength(beltCount);
    expect(migrated.belts[0]).toMatchObject({ id: "large-save-belt-0", totalTransferred: 0 });
    expect(migrated.belts.at(-1)).toMatchObject({ id: `large-save-belt-${beltCount - 1}`, totalTransferred: beltCount - 1 });
    expect(migrated.entities.slice(0, entityCount).map((entity) => entity.id)).toEqual(
      state.entities.map((entity) => entity.id),
    );
    // The former per-belt Array.find/includes path takes tens of seconds at
    // this shape. Keep a deliberately generous gate for slower CI hosts while
    // still detecting a return to quadratic behavior.
    expect(durationMs).toBeLessThan(8_000);
  }, 20_000);

  it.skipIf(!environment?.DSP_LARGE_SAVE_FIXTURE)(
    "validates the supplied 35 MiB player attachment read-only",
    () => {
      const path = environment!.DSP_LARGE_SAVE_FIXTURE!;
      const before = readFileSync(path, "utf8");
      const sourceHash = sha256(before);
      const startedAt = performance.now();
      const inspection = inspectSave(before);
      const durationMs = performance.now() - startedAt;
      const after = readFileSync(path, "utf8");

      expect(inspection).toMatchObject({
        valid: true,
        checksum: "valid",
        formatVersion: 2,
        stateVersion: 46,
      });
      expect(inspection.state?.entities).toHaveLength(27_153);
      expect(inspection.state?.belts).toHaveLength(48_917);
      expect(durationMs).toBeLessThan(5_000);
      expect(sha256(after)).toBe(sourceHash);
      expect(after).toBe(before);
      console.log(`LARGE_SAVE_1043 ${JSON.stringify({ bytes: Buffer.byteLength(before, "utf8"), durationMs, sourceHash })}`);
    },
    30_000,
  );
});
