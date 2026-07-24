import { describe, expect, it } from "vitest";
import { formatKilowatts, formatPowerKw, formatPowerKwExact } from "./units";

describe("power formatting", () => {
  it("scales kW through MW, GW, TW and PW", () => {
    expect(formatPowerKw(0)).toBe("0 kW");
    expect(formatPowerKw(-0)).toBe("0 kW");
    expect(formatPowerKw(-999.49)).toBe("-999 kW");
    expect(formatPowerKw(999.49)).toBe("999 kW");
    expect(formatPowerKw(999.5)).toBe("1 MW");
    expect(formatPowerKw(1_000)).toBe("1 MW");
    expect(formatPowerKw(999_999)).toBe("1 GW");
    expect(formatPowerKw(1_000_000)).toBe("1 GW");
    expect(formatPowerKw(1_000_000_000)).toBe("1 TW");
    expect(formatPowerKw(1_000_000_000_000)).toBe("1 PW");
    expect(formatPowerKw(1_000_000_000_000_000)).toBe("1.00e3 PW");
    expect(formatPowerKw(Number.NaN)).toBe("0 kW");
    expect(formatPowerKw(Number.POSITIVE_INFINITY)).toBe("0 kW");
  });

  it("keeps the compatibility alias and exact kW tooltip stable", () => {
    expect(formatKilowatts(12_345)).toBe("12.3 MW");
    expect(formatPowerKwExact(12_345.25)).toBe("12,345.25 kW");
  });
});
