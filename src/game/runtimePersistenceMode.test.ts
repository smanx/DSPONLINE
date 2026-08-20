import { describe, expect, it } from "vitest";
import { resolveDurableSimulationRuntimeEnabled } from "./runtimePersistenceMode";

describe("runtime persistence mode", () => {
  it("uses the verified-primary coordinator unless durable recovery is explicitly enabled", () => {
    expect(resolveDurableSimulationRuntimeEnabled({})).toBe(false);
    expect(resolveDurableSimulationRuntimeEnabled({ VITE_DURABLE_RUNTIME_RECOVERY: "false" })).toBe(false);
    expect(resolveDurableSimulationRuntimeEnabled({ VITE_DURABLE_RUNTIME_RECOVERY: "1" })).toBe(true);
  });

  it("keeps a space-station bridge on the verified-primary coordinator", () => {
    expect(resolveDurableSimulationRuntimeEnabled({
      VITE_DURABLE_RUNTIME_RECOVERY: "true",
      VITE_SPACE_STATION_ENABLED: "off",
    })).toBe(false);
  });
});
