import { describe, expect, it } from "vitest";
import { canBypassFactoryMenu } from "./factoryBypassPolicy";

describe("direct factory bypass policy", () => {
  it("blocks query and forged session bypasses on public production origins", () => {
    for (const request of [
      { queryRequested: true, testSessionRequested: false },
      { queryRequested: false, testSessionRequested: true },
      { queryRequested: true, testSessionRequested: true },
    ]) {
      expect(canBypassFactoryMenu({
        hostname: "dspidle.example.com",
        developmentBuild: false,
        forceMenu: false,
        ...request,
      })).toBe(false);
    }
  });

  it("allows only local/development fixtures and always honors force-menu", () => {
    expect(canBypassFactoryMenu({ hostname: "localhost", developmentBuild: false, forceMenu: false, queryRequested: true, testSessionRequested: false })).toBe(true);
    expect(canBypassFactoryMenu({ hostname: "127.0.0.1", developmentBuild: false, forceMenu: false, queryRequested: false, testSessionRequested: true })).toBe(true);
    expect(canBypassFactoryMenu({ hostname: "dev.internal", developmentBuild: true, forceMenu: false, queryRequested: true, testSessionRequested: false })).toBe(true);
    expect(canBypassFactoryMenu({ hostname: "localhost", developmentBuild: true, forceMenu: true, queryRequested: true, testSessionRequested: true })).toBe(false);
    expect(canBypassFactoryMenu({ hostname: "localhost", developmentBuild: true, forceMenu: false, queryRequested: false, testSessionRequested: false })).toBe(false);
  });
});
