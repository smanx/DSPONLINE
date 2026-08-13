/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OfflineReport } from "../game/storage";
import { OfflineReportWorkspace } from "./OfflineReportWorkspace";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

const report: OfflineReport = {
  seconds: 60,
  produced: [],
  completedTechIds: [],
  structurePointsAdded: 0,
  shellSailsAdded: 0,
};

function keydown(key: string, options: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
  act(() => document.dispatchEvent(event));
  return event;
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

describe("OfflineReportWorkspace", () => {
  it("uses the shared modal boundary so keyboard focus cannot escape the completed settlement report", () => {
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    trigger.textContent = "打开报告";
    document.body.insertBefore(trigger, host);
    trigger.focus();

    act(() => root.render(<OfflineReportWorkspace report={report} onClose={onClose} />));

    const dialog = document.querySelector<HTMLElement>("[role='dialog'][aria-label='离线结算报告']")!;
    const close = dialog.querySelector<HTMLButtonElement>("[aria-label='关闭离线结算报告']")!;
    const confirm = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("确认结算"))!;

    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(close);
    expect(host.hasAttribute("inert")).toBe(true);

    confirm.focus();
    const tab = keydown("Tab");
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);

    const escape = keydown("Escape");
    expect(escape.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
    trigger.remove();
  });
});
