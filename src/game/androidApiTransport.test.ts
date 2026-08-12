import { describe, expect, it, vi } from "vitest";
import { androidBase64FileSupported, bytesToBase64 } from "./androidApiTransport";

describe("Android cloud transport", () => {
  it("base64-encodes arbitrary gzip bytes without argument overflow", () => {
    const bytes = new Uint8Array(2 * 1024 * 1024 + 3);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 251;
    const encoded = bytesToBase64(bytes);
    const decoded = Uint8Array.from(atob(encoded), (value) => value.charCodeAt(0));
    expect(decoded).toEqual(bytes);
  });

  it("does not claim native Android capability in a web test runtime", async () => {
    vi.stubGlobal("__APP_PLATFORM__", "web");
    const module = await import("./androidApiTransport");
    expect(module.androidBase64RequestSupported()).toBe(false);
    vi.unstubAllGlobals();
  });

  it("uses the native base64 file path only where Android can decode it", () => {
    expect(androidBase64FileSupported("Mozilla/5.0 (Linux; Android 7.1.2)")).toBe(false);
    expect(androidBase64FileSupported("Mozilla/5.0 (Linux; Android 8.0.0)")).toBe(true);
    expect(androidBase64FileSupported("Mozilla/5.0 (Linux; Android 15)")).toBe(true);
    expect(androidBase64FileSupported("Mozilla/5.0 (Windows NT 10.0)")).toBe(false);
  });
});
