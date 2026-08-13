/** @vitest-environment jsdom */

import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudSaveMetadata, CloudSaveSummary } from "../game/cloud";
import { CloudSaveConflictDialog } from "./CloudSaveConflictDialog";
import { SaveDeleteDialog, type SaveDeleteTarget } from "./SaveDeleteDialog";
import { SpeedrunCopyDialog } from "./SpeedrunCopyDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

function render(node: ReactNode): void {
  act(() => root.render(node));
}

function click(element: Element): void {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function keydown(key: string, options: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  act(() => document.dispatchEvent(event));
  return event;
}

function buttonNamed(name: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
    .find((candidate) => candidate.textContent?.replace(/\s+/g, " ").trim() === name);
  if (!button) throw new Error(`Missing button: ${name}`);
  return button;
}

function labelledByText(element: Element): string {
  return (element.getAttribute("aria-labelledby") ?? "")
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  host.dataset.testAppRoot = "true";
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
  document.documentElement.removeAttribute("style");
});

describe("critical dialog consumers", () => {
  it("keeps the first save-delete step dismissible and makes permanent deletion explicit", () => {
    const deleteTarget: SaveDeleteTarget = {
      label: "速通模式云端槽位 2",
      details: "修订 17 · 2026/8/13 10:00:00",
      scope: "cloud",
    };
    const onDelete = vi.fn();

    function Harness() {
      const [target, setTarget] = useState<SaveDeleteTarget | null>(null);
      return <>
        <button data-trigger type="button" onClick={() => setTarget(deleteTarget)}>打开删除确认</button>
        <SaveDeleteDialog
          target={target}
          onCancel={() => setTarget(null)}
          onDelete={() => {
            onDelete();
            setTarget(null);
          }}
        />
      </>;
    }

    render(<Harness />);
    const trigger = host.querySelector<HTMLButtonElement>("[data-trigger]")!;
    trigger.focus();
    click(trigger);

    const firstStep = document.querySelector<HTMLElement>("[role='dialog']")!;
    expect(labelledByText(firstStep)).toContain("删除速通模式云端槽位 2");
    expect(firstStep.getAttribute("data-risk-policy")).toBe("dismissible");
    expect(host.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(buttonNamed("取消"));

    const firstEscape = keydown("Escape");
    expect(firstEscape.defaultPrevented).toBe(true);
    expect(document.querySelector("[role='dialog']")).toBeNull();
    expect(document.activeElement).toBe(trigger);

    click(trigger);
    click(buttonNamed("继续确认"));
    const finalStep = document.querySelector<HTMLElement>("[role='alertdialog']")!;
    expect(finalStep.getAttribute("data-risk-policy")).toBe("explicit");
    expect(finalStep.textContent).toContain("不会删除本地存档，也不会跨模式删除");
    expect(document.activeElement).toBe(buttonNamed("取消"));

    const finalEscape = keydown("Escape");
    expect(finalEscape.defaultPrevented).toBe(true);
    expect(document.querySelector("[role='alertdialog']")).toBe(finalStep);
    expect(onDelete).not.toHaveBeenCalled();

    click(buttonNamed("确认永久删除"));
    expect(onDelete).toHaveBeenCalledOnce();
    expect(document.querySelector("[role='alertdialog']")).toBeNull();
    expect(host.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps speedrun copying one-way, named, safely dismissible, and scoped to the selected empty normal slot", () => {
    const onCancel = vi.fn();
    const onCopy = vi.fn();
    render(
      <SpeedrunCopyDialog
        sourceLabel="速通模式槽位 3"
        openNormalSlots={[1, 3]}
        busy={false}
        onCancel={onCancel}
        onCopy={onCopy}
      />,
    );

    const dialog = document.querySelector<HTMLElement>("[role='alertdialog']")!;
    expect(labelledByText(dialog)).toContain("复制为普通存档");
    expect(dialog.getAttribute("data-risk-policy")).toBe("dismissible");
    expect(dialog.textContent).toContain("普通副本不会计入速通排行榜");
    expect(document.activeElement).toBe(buttonNamed("取消"));

    const escape = keydown("Escape");
    expect(escape.defaultPrevented).toBe(true);
    expect(onCancel).toHaveBeenCalledOnce();

    click(buttonNamed("复制到普通槽位 3"));
    expect(onCopy).toHaveBeenCalledOnce();
    expect(onCopy).toHaveBeenCalledWith(3);
  });

  it("traps cloud-conflict focus and keeps authenticated choices separate from dismissal", () => {
    const local: CloudSaveSummary = {
      mode: "normal",
      stateVersion: 46,
      savedAt: Date.UTC(2026, 7, 13, 1, 0),
      elapsedSeconds: 7_200,
      activePlanetId: "planet_1",
      entityCount: 88,
      completedTechCount: 12,
      structurePoints: 0,
      uploadedWhiteMatrix: 0,
      stateChecksum: "local-checksum",
    };
    const cloud: CloudSaveMetadata = {
      mode: "normal",
      slot: "main",
      revision: 23,
      updatedAt: Date.UTC(2026, 7, 13, 2, 0),
      size: 4096,
      checksum: "cloud-checksum",
      summary: { ...local, savedAt: Date.UTC(2026, 7, 13, 2, 0), elapsedSeconds: 10_800 },
    };
    const onUseCloud = vi.fn();
    const onKeepLocal = vi.fn();

    function Harness() {
      const [open, setOpen] = useState(false);
      return <>
        <button data-trigger type="button" onClick={() => setOpen(true)}>处理云冲突</button>
        {open ? <CloudSaveConflictDialog
          local={local}
          cloud={cloud}
          slot="2"
          onUseCloud={onUseCloud}
          onKeepLocal={onKeepLocal}
          onCancel={() => setOpen(false)}
        /> : null}
      </>;
    }

    render(<Harness />);
    const trigger = host.querySelector<HTMLButtonElement>("[data-trigger]")!;
    trigger.focus();
    click(trigger);

    const dialog = document.querySelector<HTMLElement>("[role='alertdialog']")!;
    expect(labelledByText(dialog)).toContain("本地与云端都有不同进度");
    expect(dialog.textContent).toContain("普通模式 · 槽位 2");
    expect(dialog.textContent).toContain("修订 23");
    expect(dialog.textContent).toContain("普通模式");
    expect(host.hasAttribute("inert")).toBe(true);

    const cancel = buttonNamed("稍后处理");
    const useCloud = buttonNamed("使用云端版本");
    const keepLocal = buttonNamed("保留本地并新建云修订");
    expect(document.activeElement).toBe(cancel);

    keepLocal.focus();
    const forwardTab = keydown("Tab");
    expect(forwardTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(cancel);

    cancel.focus();
    const backwardTab = keydown("Tab", { shiftKey: true });
    expect(backwardTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(keepLocal);

    click(useCloud);
    click(keepLocal);
    expect(onUseCloud).toHaveBeenCalledOnce();
    expect(onKeepLocal).toHaveBeenCalledOnce();

    const escape = keydown("Escape");
    expect(escape.defaultPrevented).toBe(true);
    expect(document.querySelector("[role='alertdialog']")).toBe(dialog);

    click(cancel);
    expect(document.querySelector("[role='alertdialog']")).toBeNull();
    expect(host.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it("focuses the cloud-conflict surface when every visible action is busy", () => {
    const cloud: CloudSaveMetadata = {
      mode: "speedrun",
      slot: "main",
      revision: 2,
      updatedAt: 1,
      size: 100,
      checksum: "checksum",
      summary: null,
    };
    render(
      <CloudSaveConflictDialog
        local={null}
        cloud={cloud}
        slot="main"
        busy
        onUseCloud={() => undefined}
        onKeepLocal={() => undefined}
        onCancel={() => undefined}
      />,
    );

    const dialog = document.querySelector<HTMLElement>("[role='alertdialog']")!;
    expect(document.activeElement).toBe(dialog);
    expect(Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).every((button) => button.disabled)).toBe(true);
    const tab = keydown("Tab");
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(dialog);
  });
});
