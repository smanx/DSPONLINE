/** @vitest-environment jsdom */

import { act, useRef, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccessibleDialog,
  collectAccessibleDialogBackgroundElements,
  type AccessibleDialogCloseReason,
} from "./AccessibleDialog";

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

function pointerEvent(type: string, init: { pointerId: number; clientX: number; clientY: number }): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: init.pointerId },
    clientX: { value: init.clientX },
    clientY: { value: init.clientY },
    button: { value: 0 },
  });
  return event;
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.body.style.overflow = "scroll";
  document.documentElement.style.overflow = "visible";
  host = document.createElement("div");
  host.dataset.testAppRoot = "true";
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
  document.documentElement.removeAttribute("style");
});

describe("AccessibleDialog", () => {
  it("exposes named dialog semantics, moves focus in, inerts the background, and restores lifecycle state", () => {
    const reasons: AccessibleDialogCloseReason[] = [];

    function Harness() {
      const [open, setOpen] = useState(false);
      const initialFocusRef = useRef<HTMLInputElement>(null);
      return <>
        <button
          data-trigger
          type="button"
          onClick={() => setOpen(true)}
        >打开</button>
        <AccessibleDialog
          open={open}
          title="云存档冲突"
          description="请选择要保留的版本。"
          initialFocusRef={initialFocusRef}
          onRequestClose={(reason) => {
            reasons.push(reason);
            setOpen(false);
          }}
          actions={<button type="button">确认</button>}
        >
          <input ref={initialFocusRef} aria-label="存档名称" />
        </AccessibleDialog>
      </>;
    }

    render(<Harness />);
    const trigger = host.querySelector<HTMLElement>("[data-trigger]")!;
    trigger.focus();
    click(trigger);

    const dialog = document.querySelector<HTMLElement>("[role='dialog']")!;
    const title = document.getElementById(dialog.getAttribute("aria-labelledby")!)!;
    const description = document.getElementById(dialog.getAttribute("aria-describedby")!)!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(title.textContent).toBe("云存档冲突");
    expect(description.textContent).toBe("请选择要保留的版本。");
    expect(document.activeElement).toBe(dialog.querySelector("input"));
    expect(host.hasAttribute("inert")).toBe(true);
    expect(host.getAttribute("aria-hidden")).toBe("true");
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");

    const escape = keydown("Escape");
    expect(escape.defaultPrevented).toBe(true);
    expect(reasons).toEqual(["escape"]);
    expect(document.querySelector("[data-accessible-dialog-boundary]")).toBeNull();
    expect(host.hasAttribute("inert")).toBe(false);
    expect(host.hasAttribute("aria-hidden")).toBe(false);
    expect(document.body.style.overflow).toBe("scroll");
    expect(document.documentElement.style.overflow).toBe("visible");
    expect(document.activeElement).toBe(trigger);
  });

  it("cycles Tab in DOM order and redirects escaped programmatic focus", () => {
    render(
      <AccessibleDialog
        open
        title="键盘测试"
        description="焦点必须留在弹窗内。"
        onRequestClose={() => undefined}
      >
        <button data-first type="button">第一项</button>
        <button type="button" disabled>禁用项</button>
        <button data-last type="button">最后一项</button>
      </AccessibleDialog>,
    );

    const first = document.querySelector<HTMLElement>("[data-first]")!;
    const last = document.querySelector<HTMLElement>("[data-last]")!;
    expect(document.activeElement).toBe(first);

    last.focus();
    const forward = keydown("Tab");
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    const backward = keydown("Tab", { shiftKey: true });
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);

    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    expect(document.activeElement).toBe(last);
    outside.remove();
  });

  it("uses alertdialog semantics and consumes Escape under the explicit risk policy", () => {
    const onRequestClose = vi.fn();
    render(
      <AccessibleDialog
        open
        role="alertdialog"
        riskPolicy="explicit"
        title="永久删除"
        description="只能通过可见按钮完成或取消。"
        onRequestClose={onRequestClose}
      >
        <button type="button">取消</button>
        <button type="button">确认永久删除</button>
      </AccessibleDialog>,
    );

    expect(document.querySelector("[role='alertdialog']")).not.toBeNull();
    const escape = keydown("Escape");
    expect(escape.defaultPrevented).toBe(true);
    expect(onRequestClose).not.toHaveBeenCalled();
    expect(document.querySelector("[role='alertdialog']")).not.toBeNull();
  });

  it("keeps nested modal inert and focus state reference-counted", () => {
    function NestedHarness() {
      const [outerOpen, setOuterOpen] = useState(false);
      const [innerOpen, setInnerOpen] = useState(false);
      return <>
        <button data-open-outer type="button" onClick={() => setOuterOpen(true)}>打开外层</button>
        <AccessibleDialog
          open={outerOpen}
          title="外层"
          description="外层说明"
          onRequestClose={() => setOuterOpen(false)}
        >
          <button data-open-inner type="button" onClick={() => setInnerOpen(true)}>打开内层</button>
          <button data-close-outer type="button" onClick={() => setOuterOpen(false)}>关闭外层</button>
          <AccessibleDialog
            open={innerOpen}
            role="alertdialog"
            title="内层"
            description="内层说明"
            onRequestClose={() => setInnerOpen(false)}
          >
            <button data-close-inner type="button" onClick={() => setInnerOpen(false)}>关闭内层</button>
          </AccessibleDialog>
        </AccessibleDialog>
      </>;
    }

    render(<NestedHarness />);
    const outerTrigger = host.querySelector<HTMLElement>("[data-open-outer]")!;
    outerTrigger.focus();
    click(outerTrigger);
    const innerTrigger = document.querySelector<HTMLElement>("[data-open-inner]")!;
    innerTrigger.focus();
    click(innerTrigger);

    const boundaries = document.querySelectorAll<HTMLElement>("[data-accessible-dialog-boundary]");
    expect(boundaries).toHaveLength(2);
    expect(boundaries[0].hasAttribute("inert")).toBe(true);
    expect(host.hasAttribute("inert")).toBe(true);

    click(document.querySelector("[data-close-inner]")!);
    expect(document.querySelectorAll("[data-accessible-dialog-boundary]")).toHaveLength(1);
    expect(boundaries[0].hasAttribute("inert")).toBe(false);
    expect(host.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(innerTrigger);

    click(document.querySelector("[data-close-outer]")!);
    expect(document.querySelector("[data-accessible-dialog-boundary]")).toBeNull();
    expect(host.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(outerTrigger);
  });

  it("preserves pre-existing inert and aria-hidden values after unmount", () => {
    const existing = document.createElement("aside");
    existing.setAttribute("inert", "existing");
    existing.setAttribute("aria-hidden", "false");
    document.body.insertBefore(existing, host);

    render(
      <AccessibleDialog
        open
        title="生命周期"
        description="卸载必须恢复原始属性。"
        onRequestClose={() => undefined}
      >
        <button type="button">完成</button>
      </AccessibleDialog>,
    );
    expect(existing.getAttribute("aria-hidden")).toBe("true");

    render(<></>);
    expect(existing.getAttribute("inert")).toBe("existing");
    expect(existing.getAttribute("aria-hidden")).toBe("false");
    existing.remove();
  });

  it("supports a composable background resolver without inerting the portal branch", () => {
    const extraBackground = document.createElement("aside");
    document.body.append(extraBackground);
    const resolver = vi.fn((boundary: HTMLElement) => [
      ...collectAccessibleDialogBackgroundElements(boundary),
      extraBackground,
      boundary,
    ]);

    render(
      <AccessibleDialog
        open
        title="组合边界"
        description="调用方可以增加特殊背景根。"
        getBackgroundElements={resolver}
        onRequestClose={() => undefined}
      >
        <button type="button">完成</button>
      </AccessibleDialog>,
    );

    const boundary = document.querySelector<HTMLElement>("[data-accessible-dialog-boundary]")!;
    expect(resolver).toHaveBeenCalledWith(boundary);
    expect(boundary.hasAttribute("inert")).toBe(false);
    expect(extraBackground.hasAttribute("inert")).toBe(true);

    render(<></>);
    expect(extraBackground.hasAttribute("inert")).toBe(false);
    extraBackground.remove();
  });

  it("treats a short backdrop tap as dismissal but ignores a drag gesture", () => {
    const onRequestClose = vi.fn();
    render(
      <AccessibleDialog
        open
        title="触控基础"
        description="拖动背景不应误关闭。"
        onRequestClose={onRequestClose}
      >
        <button type="button">完成</button>
      </AccessibleDialog>,
    );

    const backdrop = document.querySelector<HTMLElement>(".accessible-dialog__backdrop")!;
    act(() => {
      backdrop.dispatchEvent(pointerEvent("pointerdown", { pointerId: 1, clientX: 10, clientY: 10 }));
      backdrop.dispatchEvent(pointerEvent("pointerup", { pointerId: 1, clientX: 40, clientY: 10 }));
    });
    expect(onRequestClose).not.toHaveBeenCalled();

    act(() => {
      backdrop.dispatchEvent(pointerEvent("pointerdown", { pointerId: 2, clientX: 10, clientY: 10 }));
      backdrop.dispatchEvent(pointerEvent("pointerup", { pointerId: 2, clientX: 14, clientY: 14 }));
    });
    expect(onRequestClose).toHaveBeenCalledOnce();
    expect(onRequestClose).toHaveBeenCalledWith("backdrop");
  });

  it("maps an optional platform back event to an external close request", () => {
    const onRequestClose = vi.fn();
    render(
      <AccessibleDialog
        open
        title="平台返回"
        externalCloseEventName="dsp-test-native-back"
        onRequestClose={onRequestClose}
      >
        <button type="button">完成</button>
      </AccessibleDialog>,
    );

    act(() => window.dispatchEvent(new CustomEvent("dsp-test-native-back", { cancelable: true })));
    expect(onRequestClose).toHaveBeenCalledOnce();
    expect(onRequestClose).toHaveBeenCalledWith("external");
  });

  it("places a consumer backdrop class on the backdrop without changing surface semantics", () => {
    render(
      <AccessibleDialog
        open
        title="兼容布局"
        layout="bare"
        ariaLabel="兼容布局"
        className="legacy-surface"
        backdropClassName="legacy-backdrop"
        onRequestClose={() => undefined}
      >
        <button type="button">完成</button>
      </AccessibleDialog>,
    );
    expect(document.querySelector(".accessible-dialog__backdrop.legacy-backdrop")).not.toBeNull();
    expect(document.querySelector("section.accessible-dialog__surface.legacy-surface[role='dialog']")).not.toBeNull();
    expect(document.querySelector(".legacy-backdrop > section.legacy-surface")).not.toBeNull();
  });
});
