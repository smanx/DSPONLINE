/** @vitest-environment jsdom */
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ITEMS, RECIPES } from "../game/content";
import { ItemCatalogPicker, RecipeCatalogPicker } from "./CatalogPicker";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness() {
  const [revision, setRevision] = useState(0);
  return <div data-revision={revision}>
    <button type="button" onClick={() => setRevision((value) => value + 1)}>父级刷新</button>
    <RecipeCatalogPicker value="iron_ingot" recipes={[RECIPES.iron_ingot, RECIPES.copper_ingot]} onChange={() => undefined} />
  </div>;
}

function ItemHarness() {
  const [revision, setRevision] = useState(0);
  return <div data-revision={revision}>
    <button type="button" onClick={() => setRevision((value) => value + 1)}>父级刷新</button>
    <ItemCatalogPicker value="iron_ore" items={[ITEMS.iron_ore, ITEMS.copper_ore]} label="测试物品" onChange={() => undefined} />
  </div>;
}

describe("CatalogPicker stable search", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    document.querySelectorAll(".catalog-picker-backdrop").forEach((element) => element.remove());
    host.remove();
  });

  it("keeps an IME composition draft while the parent rerenders and clears only when closed", () => {
    expect(ITEMS.iron_ore.name).toBe("铁矿石");
    act(() => root.render(<Harness />));
    act(() => (host.querySelector(".catalog-picker-trigger") as HTMLButtonElement).click());
    const input = document.querySelector<HTMLInputElement>('input[aria-label="搜索配方"]')!;
    act(() => input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "铁" })));
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    act(() => {
      setter?.call(input, "铁");
      input.dispatchEvent(new InputEvent("input", { bubbles: true, data: "铁", inputType: "insertCompositionText", isComposing: true }));
    });
    act(() => (host.querySelector("button") as HTMLButtonElement).click());
    expect(input.value).toBe("铁");
    act(() => input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "铁" })));
    expect(input.value).toBe("铁");
    act(() => (document.querySelector('button[aria-label="关闭配方选择"]') as HTMLButtonElement).click());
    act(() => (host.querySelector(".catalog-picker-trigger") as HTMLButtonElement).click());
    expect(document.querySelector<HTMLInputElement>('input[aria-label="搜索配方"]')!.value).toBe("");
  });

  it("keeps an item-picker composition draft through parent refreshes", () => {
    act(() => root.render(<ItemHarness />));
    act(() => (host.querySelector(".catalog-picker-trigger") as HTMLButtonElement).click());
    const input = document.querySelector<HTMLInputElement>('input[aria-label="搜索物品"]')!;
    act(() => input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "铜" })));
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    act(() => {
      setter?.call(input, "铜");
      input.dispatchEvent(new InputEvent("input", { bubbles: true, data: "铜", inputType: "insertCompositionText", isComposing: true }));
    });
    act(() => (host.querySelector("button") as HTMLButtonElement).click());
    expect(input.value).toBe("铜");
    act(() => input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "铜" })));
    expect(input.value).toBe("铜");
  });
});
