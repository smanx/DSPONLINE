import { describe, expect, it } from "vitest";
import { sha256Bytes, sha256Text } from "./payloadDigest";

describe("cloud payload SHA-256", () => {
  it.each(["", "ASCII save", "中文存档 🚀", `slashes\\quotes\"${"x".repeat(4096)}`])(
    "matches the server digest for %j",
    async (value) => {
      const bytes = new TextEncoder().encode(value);
      const expected = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
        .map((byte) => byte.toString(16).padStart(2, "0")).join("");
      expect(await sha256Text(value)).toBe(expected);
    },
  );

  it("hashes authoritative Worker bytes without decoding a second copy", async () => {
    const bytes = new TextEncoder().encode("worker payload 中文");
    const expected = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map((byte) => byte.toString(16).padStart(2, "0")).join("");
    expect(await sha256Bytes(bytes)).toBe(expected);
  });
});
