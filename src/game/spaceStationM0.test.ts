import { describe, it, expect, afterEach } from "vitest";
import { createInitialState } from "./engine";
import { migrateGame, serializeEnvelope } from "./storage";
import { setSpaceStationFeatureEnabledForTest } from "./spaceStationFeature";

afterEach(() => {
  setSpaceStationFeatureEnabledForTest(undefined);
});

function asV46(): ReturnType<typeof createInitialState> {
  const state = createInitialState(1, false);
  return { ...state, version: 46 as const } as ReturnType<typeof createInitialState>;
}

describe("M0 space-station compatibility bridge", () => {
  it("keeps ordinary v46 saves on v46 when the station feature is disabled", () => {
    setSpaceStationFeatureEnabledForTest(false);
    const migrated = migrateGame(asV46() as unknown as Record<string, unknown>);
    expect(migrated).not.toBeNull();
    expect(migrated!.version).toBe(46);

    const raw = serializeEnvelope(migrated!, 1_786_377_600_000);
    const parsed = JSON.parse(raw) as { state: Record<string, unknown> };
    expect(parsed.state).not.toHaveProperty("orbitalStation");
  });

  it("upgrades ordinary v46 saves to v47 when the station feature is enabled", () => {
    setSpaceStationFeatureEnabledForTest(true);
    const migrated = migrateGame(asV46() as unknown as Record<string, unknown>);
    expect(migrated).not.toBeNull();
    expect(migrated!.version).toBe(47);
    expect(migrated!.orbitalStation).toBeDefined();

    const raw = serializeEnvelope(migrated!, 1_786_377_600_000);
    const parsed = JSON.parse(raw) as { state: Record<string, unknown> };
    expect(parsed.state).toHaveProperty("orbitalStation");
  });

  it("reads and preserves an existing v47 save even when the station feature is disabled", () => {
    setSpaceStationFeatureEnabledForTest(false);
    const v47 = createInitialState(1, false);
    const migrated = migrateGame(v47 as unknown as Record<string, unknown>);
    expect(migrated).not.toBeNull();
    expect(migrated!.version).toBe(47);
    expect(migrated!.orbitalStation).toBeDefined();

    const raw = serializeEnvelope(migrated!, 1_786_377_600_000);
    const parsed = JSON.parse(raw) as { state: Record<string, unknown> };
    expect(parsed.state).toHaveProperty("orbitalStation");
  });
});
