/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CloudSaveConflictDialog } from "./CloudSaveConflictDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("CloudSaveConflictDialog", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("allows both conflict sides to be exported before choosing a winner", () => {
    const exportLocal = vi.fn();
    const exportCloud = vi.fn();
    act(() => root.render(<CloudSaveConflictDialog
      local={{ stateVersion: 46, mode: "normal", savedAt: 1, elapsedSeconds: 20, completedTechCount: 1, entityCount: 2, structurePoints: 3, activePlanetId: "home", uploadedWhiteMatrix: 0, stateChecksum: "local" }}
      cloud={{ mode: "normal", slot: "main", revision: 7, updatedAt: 2, size: 100, checksum: "cloud", summary: null }}
      slot="main"
      onUseCloud={() => undefined}
      onKeepLocal={() => undefined}
      onExportLocal={exportLocal}
      onExportCloud={exportCloud}
      onCancel={() => undefined}
    />));
    const buttons = [...document.body.querySelectorAll("button")];
    act(() => buttons.find((button) => button.textContent?.includes("导出本地副本"))?.click());
    act(() => buttons.find((button) => button.textContent?.includes("导出云端副本"))?.click());
    expect(exportLocal).toHaveBeenCalledOnce();
    expect(exportCloud).toHaveBeenCalledOnce();
  });
});
