/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StableTextInput, clearStableTextDraft, readStableTextDraft, updateStableTextDraft } from "./StableTextInput";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ draftId = "search", sensitive = false }: { draftId?: string; sensitive?: boolean }) {
  const [value, setValue] = useState("");
  return <StableTextInput aria-label="测试输入" draftId={draftId} sensitive={sensitive} value={value} onValueChange={setValue} />;
}

function inputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function composingValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: value }));
  });
}

describe("StableTextInput", () => {
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

  it("keeps Chinese composition text when a parent render supplies the old external value", () => {
    act(() => root.render(<Harness draftId="ime" />));
    const input = host.querySelector("input")!;
    act(() => input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })));
    inputValue(input, "单极");
    act(() => root.render(<Harness draftId="ime" />));
    expect(input.value).toBe("单极");
    act(() => input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "单极" })));
    expect(input.value).toBe("单极");
    clearStableTextDraft("ime");
  });

  it("survives a responsive remount in the same page without persistent storage", () => {
    act(() => root.unmount());
    host.remove();
    updateStableTextDraft("responsive-search", "量子物流");
    expect(readStableTextDraft("responsive-search")).toBe("量子物流");
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => root.render(<Harness draftId="responsive-search" />));
    expect(host.querySelector("input")!.value).toBe("量子物流");
    clearStableTextDraft("responsive-search");
  });

  it("never shares a sensitive password draft across remounts", () => {
    act(() => root.render(<Harness draftId="password" sensitive />));
    inputValue(host.querySelector("input")!, "secret-pass");
    act(() => root.unmount());
    host.remove();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => root.render(<Harness draftId="password" sensitive />));
    expect(host.querySelector("input")!.value).toBe("");
  });

  it("keeps independent search and picker drafts without leaking between fields", () => {
    updateStableTextDraft("recipe-search", "单极磁石");
    updateStableTextDraft("item-picker", "量子芯片");
    expect(readStableTextDraft("recipe-search")).toBe("单极磁石");
    expect(readStableTextDraft("item-picker")).toBe("量子芯片");
    clearStableTextDraft("recipe-search");
    expect(readStableTextDraft("recipe-search")).toBeNull();
    expect(readStableTextDraft("item-picker")).toBe("量子芯片");
    clearStableTextDraft("item-picker");
  });
});
