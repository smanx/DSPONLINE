import { describe, expect, it } from "vitest";
import { DIFFICULTY_DEFINITIONS, getDifficultyDefinition, isDifficultyMode } from "./difficulty";

describe("difficulty presets", () => {
  it("keeps a stable standard fallback for legacy and invalid values", () => {
    expect(getDifficultyDefinition(undefined).id).toBe("standard");
    expect(getDifficultyDefinition("invalid" as never).id).toBe("standard");
    expect(isDifficultyMode("hard")).toBe(true);
    expect(isDifficultyMode("impossible")).toBe(false);
  });

  it("exposes three ordered balance profiles", () => {
    expect(DIFFICULTY_DEFINITIONS.map((definition) => definition.id)).toEqual(["relaxed", "standard", "hard"]);
    expect(DIFFICULTY_DEFINITIONS[0].productionMultiplier).toBeGreaterThan(1);
    expect(DIFFICULTY_DEFINITIONS[2].powerDemandMultiplier).toBeGreaterThan(1);
  });
});
