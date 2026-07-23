import { describe, expect, it } from "vitest";
import { formatKilowatts } from "./units";

describe("power formatting", () => {
  it("keeps kW explicit while compacting large Dyson values", () => {
    expect(formatKilowatts(9_999.9, 1)).toBe("9,999.9 kW");
    expect(formatKilowatts(10_000)).toBe("1万 kW");
    expect(formatKilowatts(12_345)).toBe("1.23万 kW");
  });
});
