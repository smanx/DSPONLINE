import { describe, expect, it } from "vitest";
import { resolveApplicationRoute } from "./applicationRoute";

describe("application route isolation", () => {
  it("keeps valid and malformed station direct links on the no-local-save public route", () => {
    expect(resolveApplicationRoute(`/station/station_${"a".repeat(32)}`)).toEqual({
      kind: "public-station",
      publicId: `station_${"a".repeat(32)}`,
    });
    expect(resolveApplicationRoute("/station/not-a-public-id")).toEqual({ kind: "public-station", publicId: "not-a-public-id" });
    expect(resolveApplicationRoute("/")).toEqual({ kind: "game" });
  });
});
