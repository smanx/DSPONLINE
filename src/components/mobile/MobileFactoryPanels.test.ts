import { describe, expect, it } from "vitest";
import { mobileConstructionSearchText } from "./MobileFactoryPanels";

describe("next-mobile construction catalog", () => {
  it("indexes the install-only spray module under player-facing aliases", () => {
    const text = mobileConstructionSearchText("spray_coater");
    expect(text).toContain("喷涂机");
    expect(text).toContain("喷涂模块");
    expect(text).toContain("增产");
  });
});
