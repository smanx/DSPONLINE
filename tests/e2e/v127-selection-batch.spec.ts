import { expect, test, type Page } from "@playwright/test";

test.use({ hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("dsp-idle-network.test-bypass-menu", "1");
    window.localStorage.setItem("dsp-idle-network.release-notes.seen.v1", "2026-08-13-v1.0.41");
    window.localStorage.setItem("dsp-idle-network.onboarding.v1", "dismissed");
  });
});

async function seedFactory(page: Page, fixture: "smelters" | "storage-network" = "smelters") {
  // The app migrates the primary save to IndexedDB before mounting. Seed the
  // fixture before boot so the same path is exercised as a real fresh browser.
  await page.goto("/version.json");
  await page.evaluate(async (selectedFixture) => {
    const { createInitialState, placeBuilding } = await import("/src/game/engine.ts");
    let state = createInitialState(27_101, false);
    state.paused = true;
    state.construction.conveyor_belt_mk1 = 12;
    if (selectedFixture === "storage-network") {
      state.construction.storage_mk1 = 3;
      state = placeBuilding(state, "storage_mk1", { x: -260, y: -80 });
      state = placeBuilding(state, "storage_mk1", { x: 20, y: -160 });
      state = placeBuilding(state, "storage_mk1", { x: 20, y: 80 });
      const sourceStorage = state.entities.find((entity) => entity.buildingId === "storage_mk1");
      if (!sourceStorage) throw new Error("storage fixture placement failed");
      sourceStorage.storedItemId = "iron_ore";
      sourceStorage.outputs.iron_ore = 100;
    } else {
      state.construction.arc_smelter = 12;
      state = placeBuilding(state, "arc_smelter", { x: -80, y: -100 });
      state = placeBuilding(state, "arc_smelter", { x: 80, y: -100 });
    }
    const raw = JSON.stringify({ savedAt: Date.now(), state });
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("dsp-idle-network.local-saves");
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("records")) request.result.createObjectStore("records", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("records", "readwrite");
      transaction.objectStore("records").put({
        key: "dsp-idle-network.save.v1",
        value: raw,
        updatedAt: Date.now(),
        bytes: new TextEncoder().encode(raw).byteLength,
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }, fixture);
  await page.goto("/");
  await expect(page.locator(".game-shell")).toBeVisible();
}

test("connection point preference changes visual scale and hit configuration", async ({ page }) => {
  await seedFactory(page);
  await page.getByLabel("打开设置").click();
  const settings = page.getByRole("dialog", { name: "运营中心" });
  await settings.locator(".settings-category-tabs").getByRole("button", { name: "交互与控制", exact: true }).click();
  await expect(settings.getByRole("button", { name: "放大 50%", exact: true })).toBeVisible();
  await settings.getByRole("button", { name: "放大 50%", exact: true }).click();
  await expect(page.locator(".game-shell")).toHaveAttribute("data-connection-point-size", "large50");
  await expect.poll(() => page.locator(".react-flow__node .factory-handle").first().evaluate((element) => getComputedStyle(element).width)).toBe("27px");
  await settings.getByRole("button", { name: "自动适配", exact: true }).click();
  await expect(settings.getByRole("button", { name: "自动适配", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".game-shell")).toHaveAttribute("data-connection-point-size", "large50", "visual size must remain independent from the transparent hit-area setting");
  await expect(page.locator(".game-shell")).toHaveAttribute("data-connection-hit-area", "auto");
  expect(Number(await page.locator(".game-shell").getAttribute("data-connection-hit-diameter"))).toBeGreaterThanOrEqual(56);
});

for (const fontScale of [0.8, 1, 1.25, 1.5, 2] as const) {
  test(`connection ports remain visible and targetable at ${fontScale * 100}% text`, async ({ page }) => {
    await seedFactory(page, "storage-network");
    await page.evaluate((scale) => {
      document.documentElement.dataset.uiFontScale = String(Math.round(scale * 100));
      document.documentElement.style.setProperty("--ui-font-scale", String(scale));
    }, fontScale);
    const handles = page.locator(".react-flow__node .factory-handle");
    expect(await handles.count()).toBeGreaterThanOrEqual(3);
    for (const handle of await handles.all()) {
      await expect(handle).toBeVisible();
      const box = await handle.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(14);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(14);
    }
    expect(Number(await page.locator(".game-shell").getAttribute("data-connection-hit-diameter"))).toBeGreaterThanOrEqual(56);
  });
}

test("continuous connection mode previews multiple targets and commits them atomically", async ({ page }) => {
  await seedFactory(page, "storage-network");
  const seeded = await page.evaluate(async () => (await import("/src/game/storage.ts")).loadGame().state.entities
    .filter((entity) => entity.buildingId === "storage_mk1")
    .map((entity) => ({ id: entity.id, itemId: entity.storedItemId, outputs: entity.outputs })));
  expect(seeded).toHaveLength(3);
  expect(seeded[0]).toMatchObject({ itemId: "iron_ore", outputs: { iron_ore: 100 } });
  for (const entity of seeded) await expect(page.locator(`.react-flow__node[data-id="${entity.id}"]`)).toBeVisible();
  await page.getByLabel("连续拉线模式").click();
  const source = page.locator(`.react-flow__node[data-id="${seeded[0].id}"] .factory-handle--output`).first();
  await source.click({ force: true });
  const preview = page.getByLabel("连续拉线预览");
  await page.locator(`.react-flow__node[data-id="${seeded[1].id}"] .factory-handle--input`).first().click({ force: true });
  await expect(preview).toContainText("1 条");
  await expect(page.locator(`.react-flow__node[data-id="${seeded[2].id}"] .factory-handle--input`).first()).toBeVisible();
  const secondTarget = page.locator(`.react-flow__node[data-id="${seeded[2].id}"] .factory-handle--input`).first();
  const secondBox = await secondTarget.boundingBox();
  if (!secondBox) throw new Error("second continuous target has no geometry");
  await page.mouse.click(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2);
  await expect(preview).toContainText("2 条");
  const before = await page.evaluate(async () => (await import("/src/game/storage.ts")).loadGame().state.construction.conveyor_belt_mk1);
  await preview.getByRole("button", { name: "确认连接" }).click();
  await expect(preview).toHaveCount(0);
  await expect(page.locator(".react-flow__edge")).toHaveCount(2);
  await page.getByLabel("保存并返回主菜单").click();
  await expect(page.locator(".start-menu")).toBeVisible();
  const after = await page.evaluate(async () => {
    const state = (await import("/src/game/storage.ts")).loadGame().state;
    return { belts: state.belts.length, construction: state.construction.conveyor_belt_mk1 };
  });
  expect(after).toEqual({ belts: 2, construction: before - 2 });
});

test("desktop mixed selection exposes atomic batch increase controls", async ({ page }) => {
  await seedFactory(page);
  await page.getByLabel("框选模式").click();
  const nodes = page.locator('.react-flow__node').filter({ hasText: "熔炉" });
  await expect(nodes).toHaveCount(2);
  await nodes.nth(0).click();
  await nodes.nth(1).click({ modifiers: ["Shift"] });
  const toolbar = page.locator(".selection-toolbar");
  await expect(toolbar).toBeVisible();
  await toolbar.locator('button[title="批量增加 1"]').click();
  await expect(page.locator(".game-dialog")).toContainText("批量增加");
  await page.getByRole("button", { name: "批量增加" }).click();
  await expect(page.locator(".game-notice, .interaction-burst")).toContainText(/已批量增加/);
});

test("next mobile selection keeps multiple nodes selected after a canvas refresh", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => window.localStorage.setItem("dsp-idle-network.mobile-ui.v1", "next"));
  await seedFactory(page);
  await page.getByLabel("打开画布工具").click();
  await page.getByRole("button", { name: "逐点多选" }).click();
  // The mobile shell hides React Flow's visual controls; invoke fit-view
  // through the existing control so both seeded nodes receive a touch target.
  await page.locator(".react-flow__controls-fitview").evaluate((element) => (element as HTMLButtonElement).click());
  await page.waitForTimeout(120);
  const nodes = page.locator('.react-flow__node').filter({ hasText: "熔炉" });
  await nodes.nth(0).tap();
  await nodes.nth(1).tap();
  await expect(page.locator(".mobile-mode-status--select")).toContainText("2 节点");
  await page.waitForTimeout(400);
  await expect(page.locator(".mobile-mode-status--select")).toContainText("2 节点");
});
