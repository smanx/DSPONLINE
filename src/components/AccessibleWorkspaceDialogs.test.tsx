/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../game/engine";
import { CommandPalette } from "./CommandPalette";
import { TrayManagementDialog } from "./TrayManagementDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

function render(node: ReactNode): void {
  act(() => root.render(node));
}

function click(element: Element): void {
  act(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
}

function keydown(key: string): void {
  act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));
}

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
  document.documentElement.removeAttribute("style");
});

describe("accessible workspace dialogs", () => {
  it("gives the command palette combobox semantics, trapped focus and safe Escape close", () => {
    const game = createInitialState();
    const onClose = vi.fn();
    render(<CommandPalette
      open
      game={game}
      onClose={onClose}
      onOpenWorkspace={vi.fn()}
      onFocusRecipe={vi.fn()}
      onFocusEntity={vi.fn()}
      onAutoLayout={vi.fn()}
      onPauseToggle={vi.fn()}
      onTogglePerformance={vi.fn()}
      onToggleReducedMotion={vi.fn()}
    />);
    const dialog = document.querySelector<HTMLElement>("section.command-palette[role='dialog']")!;
    const input = dialog.querySelector<HTMLInputElement>("[role='combobox']")!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute("aria-controls")).toBe("command-palette-results");
    expect(document.querySelector(".command-palette-backdrop > section.command-palette")).toBe(dialog);
    keydown("Escape");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps tray deletion behind an explicit alertdialog and returns exact confirmed amounts", () => {
    const game = createInitialState();
    game.tray.iron_ore = 9;
    game.tray.copper_ore = 1;
    const onDiscard = vi.fn();
    const onClose = vi.fn();
    render(<TrayManagementDialog game={game} onDiscard={onDiscard} onClose={onClose} />);
    const dialog = document.querySelector<HTMLElement>(".tray-management > section[role='dialog']")!;
    expect(dialog).not.toBeNull();
    expect(document.activeElement).toBe(dialog.querySelector("input[aria-label='搜索托盘物资']"));
    click([...dialog.querySelectorAll(".tray-management__list > button")].find((button) => button.textContent?.includes("铁矿"))!);
    click([...dialog.querySelectorAll("footer button")].find((button) => button.textContent?.includes("删除一半"))!);
    const confirmation = document.querySelector<HTMLElement>(".tray-discard-confirm > section[role='alertdialog']")!;
    expect(confirmation).not.toBeNull();
    expect(document.activeElement?.textContent).toContain("返回");
    keydown("Escape");
    expect(document.querySelector("[role='alertdialog']")).not.toBeNull();
    expect(onDiscard).not.toHaveBeenCalled();
    click([...confirmation.querySelectorAll("button")].find((button) => button.textContent?.includes("确认删除"))!);
    expect(onDiscard).toHaveBeenCalledWith([{ itemId: "iron_ore", amount: 4 }]);
    expect(document.querySelector("[role='alertdialog']")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });
});
