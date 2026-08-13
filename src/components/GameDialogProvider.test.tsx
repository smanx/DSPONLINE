/** @vitest-environment jsdom */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GameDialogProvider, useGameDialog } from "./GameDialogProvider";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

function keydown(key: string, options: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
  act(() => document.dispatchEvent(event));
  return event;
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

describe("GameDialogProvider", () => {
  it("gives confirmation alerts modal focus behavior and restores the initiating control on Escape", async () => {
    function Harness() {
      const dialog = useGameDialog();
      const [result, setResult] = useState("未选择");
      return <>
        <button type="button" data-open onClick={() => void dialog.confirm("确认后会继续下一步。", { title: "确认继续" }).then((confirmed) => setResult(String(confirmed)))}>打开</button>
        <output>{result}</output>
      </>;
    }

    act(() => root.render(<GameDialogProvider><Harness /></GameDialogProvider>));
    const trigger = host.querySelector<HTMLButtonElement>("[data-open]")!;
    trigger.focus();
    act(() => trigger.click());

    const dialog = document.querySelector<HTMLElement>("[role='alertdialog']")!;
    const primary = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent === "确认")!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(primary);
    expect(host.hasAttribute("inert")).toBe(true);

    primary.focus();
    const tab = keydown("Tab");
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(dialog.querySelector<HTMLButtonElement>("[aria-label='关闭确认框']"));

    const escape = keydown("Escape");
    expect(escape.defaultPrevented).toBe(true);
    await act(async () => undefined);
    expect(document.querySelector("[role='alertdialog']")).toBeNull();
    expect(host.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(host.querySelector("output")?.textContent).toBe("false");
  });

  it("announces destructive confirmations as alert dialogs without losing the cancel path", () => {
    function Harness() {
      const dialog = useGameDialog();
      return <button type="button" data-open onClick={() => void dialog.confirm("此操作会永久销毁投入物资。", { title: "确认销毁", danger: true })}>打开危险确认</button>;
    }

    act(() => root.render(<GameDialogProvider><Harness /></GameDialogProvider>));
    const trigger = host.querySelector<HTMLButtonElement>("[data-open]")!;
    act(() => trigger.click());

    const dialog = document.querySelector<HTMLElement>("[role='alertdialog']")!;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute("aria-describedby")).toBe("game-dialog-message");
    expect(dialog.textContent).toContain("此操作会永久销毁投入物资");
  });
});
