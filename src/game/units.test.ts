import { describe, expect, it } from "vitest";
import { formatKilowatts } from "./units";

describe("power unit formatting", () => {
  it("keeps Dyson power in the engine's kW unit without MW conversion", () => {
    expect(formatKilowatts(12_000)).toBe("12,000 kW");
    expect(formatKilowatts(38.25, 2)).toBe("38.25 kW");
    expect(formatKilowatts(Number.NaN)).toBe("0 kW");
  });
});
