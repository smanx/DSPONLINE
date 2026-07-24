import { describe, expect, it } from "vitest";
import { parseAndroidUpdateManifest } from "./nativeApp";

const VALID_MANIFEST = {
  schemaVersion: 1,
  packageId: "cn.dsponline.network",
  channel: "stable",
  versionName: "1.0.0",
  versionCode: 1_000_000,
  minimumSupportedVersionCode: 10_000,
  publishedAt: "2026-07-24T06:00:00.000Z",
  apk: {
    url: "./dsp-idle-1.0.0-1000000.apk",
    sha256: "a".repeat(64),
    size: 12_345_678,
  },
  notes: ["原生应用首个公开测试版"],
};

describe("Android native update manifests", () => {
  it("normalizes a same-origin HTTPS artifact", () => {
    const manifest = parseAndroidUpdateManifest(VALID_MANIFEST, "https://dsponline.cn/downloads/android/stable.json", "stable");
    expect(manifest.apk.url).toBe("https://dsponline.cn/downloads/android/dsp-idle-1.0.0-1000000.apk");
    expect(manifest.versionCode).toBe(1_000_000);
    expect(manifest.notes).toEqual(["原生应用首个公开测试版"]);
  });

  it.each([
    ["cross-origin APK", { apk: { ...VALID_MANIFEST.apk, url: "https://attacker.invalid/update.apk" } }],
    ["cleartext APK", { apk: { ...VALID_MANIFEST.apk, url: "http://dsponline.cn/downloads/android/update.apk" } }],
    ["wrong package", { packageId: "invalid.package" }],
    ["wrong channel", { channel: "beta" }],
    ["invalid digest", { apk: { ...VALID_MANIFEST.apk, sha256: "not-a-digest" } }],
    ["invalid version order", { minimumSupportedVersionCode: 1_000_001 }],
  ])("rejects %s", (_label, override) => {
    expect(() => parseAndroidUpdateManifest({ ...VALID_MANIFEST, ...override }, "https://dsponline.cn/downloads/android/stable.json", "stable")).toThrow();
  });
});
