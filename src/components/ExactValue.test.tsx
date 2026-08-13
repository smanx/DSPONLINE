// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ExactValue } from "./ExactValue";

describe("ExactValue", () => {
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

  it("keeps the existing keyboard widget by default", () => {
    act(() => root.render(<ExactValue compact="1.2M" label="1,234,567" />));
    const value = host.querySelector<HTMLElement>('[role="button"]');
    expect(value?.getAttribute("aria-label")).toBe("1,234,567");
    expect(value?.tabIndex).toBe(0);
  });

  it("exposes exact text without nesting another widget in interactive parents", () => {
    act(() => root.render(<button type="button"><ExactValue compact="1.2M" label="1,234,567" interactive={false} /></button>));
    expect(host.querySelectorAll("button, [role='button']")).toHaveLength(1);
    const value = host.querySelector<HTMLElement>(".quantity-value--passive");
    expect(value?.getAttribute("aria-label")).toBe("1,234,567");
    expect(value?.getAttribute("title")).toBe("1,234,567");
  });
});
