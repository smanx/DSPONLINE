/** @vitest-environment jsdom */

import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccessibleDialog } from "./AccessibleDialog";
import { WorkspaceFrame } from "./WorkspaceFrame";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

function render(node: ReactNode): void {
  act(() => root.render(node));
}

function click(element: Element): void {
  act(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
}

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

describe("WorkspaceFrame", () => {
  it("inerts the covered factory, traps focus, closes on Escape and restores the trigger", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return <>
        <button data-trigger type="button" onClick={() => setOpen(true)}>打开统计</button>
        <div className="game-shell">
          <div className="game-workspace"><button data-factory type="button">画布建筑</button></div>
          {open ? <WorkspaceFrame className="statistics-workspace" ariaLabel="生产统计" onRequestClose={() => setOpen(false)}>
            <button data-first type="button">生产</button>
            <button data-last type="button">效率</button>
          </WorkspaceFrame> : null}
        </div>
      </>;
    }

    render(<Harness />);
    const trigger = host.querySelector<HTMLElement>("[data-trigger]")!;
    trigger.focus();
    click(trigger);

    const workspace = host.querySelector<HTMLElement>("[data-workspace-frame]")!;
    const factory = host.querySelector<HTMLElement>(".game-workspace")!;
    const first = host.querySelector<HTMLElement>("[data-first]")!;
    const last = host.querySelector<HTMLElement>("[data-last]")!;
    expect(workspace.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(first);
    expect(factory.hasAttribute("inert")).toBe(true);
    expect(factory.getAttribute("aria-hidden")).toBe("true");

    last.focus();
    const tab = keydown("Tab");
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    const escape = keydown("Escape");
    expect(escape.defaultPrevented).toBe(true);
    expect(host.querySelector("[data-workspace-frame]")).toBeNull();
    expect(factory.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps desktop and next-mobile navigation active while the hidden canvas is inert", () => {
    render(
      <div className="game-shell" data-mobile-shell="true">
        <header className="game-header"><button data-desktop-header type="button">科技树已打开</button></header>
        <header className="mobile-next-topbar"><button data-back type="button">返回</button></header>
        <div className="game-workspace"><button data-factory type="button">隐藏建筑</button></div>
        <WorkspaceFrame className="technology-workspace" ariaLabel="科技树" onRequestClose={() => undefined}>
          <button data-tech type="button">基础物流</button>
        </WorkspaceFrame>
        <nav className="mobile-next-bottom-nav"><button data-home type="button">工厂</button></nav>
      </div>,
    );

    const canvas = host.querySelector<HTMLElement>(".game-workspace")!;
    const desktopHeader = host.querySelector<HTMLElement>(".game-header")!;
    const topbar = host.querySelector<HTMLElement>(".mobile-next-topbar")!;
    const bottom = host.querySelector<HTMLElement>(".mobile-next-bottom-nav")!;
    expect(canvas.hasAttribute("inert")).toBe(true);
    expect(canvas.getAttribute("aria-hidden")).toBe("true");
    expect(desktopHeader.hasAttribute("inert")).toBe(false);
    expect(topbar.hasAttribute("inert")).toBe(false);
    expect(bottom.hasAttribute("inert")).toBe(false);

    const tech = host.querySelector<HTMLElement>("[data-tech]")!;
    const back = host.querySelector<HTMLElement>("[data-back]")!;
    const home = host.querySelector<HTMLElement>("[data-home]")!;
    home.focus();
    keydown("Tab");
    expect(document.activeElement).toBe(host.querySelector("[data-desktop-header]"));
    keydown("Tab", { shiftKey: true });
    expect(document.activeElement).toBe(home);
    tech.focus();
    expect(document.activeElement).toBe(tech);
  });

  it("keeps a nested portal confirmation on top without releasing the workspace background", () => {
    function NestedHarness() {
      const [confirming, setConfirming] = useState(false);
      return <div className="game-shell">
        <div className="game-workspace"><button type="button">画布</button></div>
        <WorkspaceFrame className="blueprint-workspace" ariaLabel="蓝图" onRequestClose={() => undefined}>
          <button data-open-confirm type="button" onClick={() => setConfirming(true)}>删除蓝图</button>
          <AccessibleDialog
            open={confirming}
            role="alertdialog"
            title="确认删除"
            description="该操作不可撤销"
            onRequestClose={() => setConfirming(false)}
          >
            <button data-cancel type="button" onClick={() => setConfirming(false)}>取消</button>
          </AccessibleDialog>
        </WorkspaceFrame>
      </div>;
    }

    render(<NestedHarness />);
    const factory = host.querySelector<HTMLElement>(".game-workspace")!;
    click(host.querySelector("[data-open-confirm]")!);
    expect(document.querySelector("[role='alertdialog']")).not.toBeNull();
    expect(host.hasAttribute("inert")).toBe(true);
    expect(factory.hasAttribute("inert")).toBe(true);

    click(document.querySelector("[data-cancel]")!);
    expect(document.querySelector("[role='alertdialog']")).toBeNull();
    expect(host.hasAttribute("inert")).toBe(false);
    expect(factory.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(host.querySelector("[data-open-confirm]"));
  });
});
