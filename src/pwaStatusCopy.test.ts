import { describe, expect, it } from "vitest";
import { pwaUpdateStatusCopy } from "./pwaStatusCopy";
import type { PwaUpdateStatus } from "./pwa";

describe("PWA player-facing update status", () => {
  it.each([
    ["downloaded-await-restart", "新版本已下载，重启网页后切换", "ready"],
    ["network-unavailable", "网络不可用，当前缓存仍可继续使用", "warning"],
    ["version-check-failed", "版本检查失败，当前版本仍可继续使用", "error"],
    ["stable-fallback", "正在使用上一稳定缓存，联网后会自动检查", "warning"],
  ] as const)("maps %s without calling it up to date", (status, text, tone) => {
    const copy = pwaUpdateStatusCopy(status);
    expect(copy).toEqual({ key: `pwa.update.${status}`, text, tone });
    expect(copy.text).not.toContain("已是最新");
  });

  it("defines a stable key and non-empty copy for every runtime state", () => {
    const statuses: PwaUpdateStatus[] = [
      "idle",
      "checking",
      "up-to-date",
      "downloaded-await-restart",
      "network-unavailable",
      "version-check-failed",
      "stable-fallback",
    ];
    expect(statuses.map((status) => pwaUpdateStatusCopy(status).key)).toEqual(
      statuses.map((status) => `pwa.update.${status}`),
    );
    expect(statuses.every((status) => pwaUpdateStatusCopy(status).text.length > 0)).toBe(true);
  });
});

