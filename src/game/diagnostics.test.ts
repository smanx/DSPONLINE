/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLIENT_ERROR_STORAGE_KEY, recordClientErrors } from "./diagnostics";

describe("client diagnostics batching", () => {
  beforeEach(() => window.localStorage.clear());

  it("persists a long-task batch with one storage write", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const entries = recordClientErrors([
      { kind: "long-task", message: "主线程阻塞 775 ms" },
      { kind: "long-task", message: "主线程阻塞 810 ms" },
    ]);
    expect(entries).toHaveLength(2);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.localStorage.getItem(CLIENT_ERROR_STORAGE_KEY) ?? "[]")).toHaveLength(2);
  });
});
