import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function prepareNewDevice(page: import("@playwright/test").Page, fontScale = 1): Promise<void> {
  await page.addInitScript(({ fontScale }) => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("dsp-idle-network.release-notes.seen.v1", "2026-08-11-v1.0.38");
    window.localStorage.setItem("dsp-idle-network.onboarding.v1", "dismissed");
    window.localStorage.setItem("dsp-idle-network.basic-onboarding.v1", JSON.stringify({ version: 1, completedEvents: [], skipped: true }));
    window.localStorage.setItem("dsp-idle-network.menu-settings.v1", JSON.stringify({ fontScale }));
    const now = Date.now();
    const summary = { mode: "speedrun", stateVersion: 46, savedAt: now, elapsedSeconds: 9_876, activePlanetId: "home", entityCount: 1, completedTechCount: 3, structurePoints: 0, uploadedWhiteMatrix: 0, stateChecksum: "synthetic", integrity: "valid" };
    const metadata = { mode: "speedrun", slot: "main", revision: 2, updatedAt: now, size: 1_024, checksum: "synthetic-cloud", summary };
    const manualMetadata = { ...metadata, slot: "1", revision: 3, checksum: "synthetic-manual" };
    const historyMetadata = { ...metadata, revision: 1, updatedAt: now - 60_000, checksum: "synthetic-history" };
    const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const parsed = new URL(url, window.location.origin);
      if (!parsed.pathname.startsWith("/api/")) return nativeFetch(input, init);
      if (parsed.pathname === "/api/health") return response({ ok: true, mailProvider: "disabled" });
      if (parsed.pathname === "/api/account") return response({
        user: { id: "synthetic-user", username: "v140_speedrun_device", email: "", displayName: "速通新设备", createdAt: now, emailVerified: false, emailVerifiedAt: null, passwordChangedAt: now, leaderboardVisible: true },
        cloudSave: null,
        cloudSaves: { main: null, "1": null, "2": null, "3": null },
        cloudSavesByMode: { normal: { main: null, "1": null, "2": null, "3": null }, speedrun: { main: metadata, "1": manualMetadata, "2": null, "3": null } },
      });
      if (parsed.pathname === "/api/cloud-save" && parsed.searchParams.get("mode") === "speedrun" && init?.method !== "DELETE") {
        const engine = await import("/src/game/engine.ts");
        const storage = await import("/src/game/storage.ts");
        const speedrun = engine.createSpeedrunInitialState(1_777_777_777_000, "v140-new-device-speedrun");
        speedrun.paused = true;
        speedrun.elapsedSeconds = 9_876;
        return response({ cloudSave: { ...metadata, payload: storage.exportGame(speedrun) }, mode: "speedrun", slot: "main" });
      }
      if (parsed.pathname === "/api/cloud-save/history") return response({ history: [metadata, historyMetadata], mode: "speedrun", slot: parsed.searchParams.get("slot") ?? "main" });
      if (parsed.pathname === "/api/cloud-save/restore") return response({ cloudSave: { ...metadata, revision: 3, restoredFromRevision: historyMetadata.revision } });
      if (parsed.pathname === "/api/cloud-save" && init?.method === "DELETE") return response({ deleted: true, mode: "speedrun", slot: parsed.searchParams.get("slot") ?? "main" });
      return response({ error: `unexpected synthetic route ${parsed.pathname}${parsed.search}` }, 404);
    };
    window.localStorage.setItem("dsp-idle-network.cloud-token.v1", "synthetic-token");
  }, { fontScale });
}

test("a new device discovers and explicitly restores speedrun/main without creating normal", async ({ page }) => {
  await prepareNewDevice(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?menu=1");
  await page.getByRole("button", { name: "登录与云存档" }).click();

  const panel = page.getByRole("region", { name: "按模式管理云存档" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("radio", { name: /普通模式/ })).toHaveAttribute("aria-checked", "true");
  await panel.getByRole("radio", { name: /速通模式/ }).click();
  await expect(panel).toContainText("发现新设备可恢复的速通主档");
  await expect(panel).toContainText("速通模式 · 主存档");

  await panel.getByRole("button", { name: "恢复速通主档" }).click();
  const confirmation = page.getByRole("alertdialog", { name: "确认速通模式 · 主存档恢复" });
  await expect(confirmation).toContainText("不会创建普通存档");
  await confirmation.getByRole("button", { name: "确认恢复" }).click();
  await expect(panel.getByRole("status")).toContainText("未创建或改写普通模式存档");

  const persisted = await page.evaluate(async () => {
    const storage = await import("/src/game/storage.ts");
    const preview = await import("/src/game/savePreview.ts");
    return {
      normal: preview.getMenuContinueSave("normal"),
      speedrunMode: preview.getMenuContinueSave("speedrun")?.summary.mode,
      speedrunFactoryId: storage.loadGame("speedrun").state.speedrun?.factoryId,
    };
  });
  expect(persisted.normal).toBeNull();
  expect(persisted.speedrunMode).toBe("speedrun");
  expect(persisted.speedrunFactoryId).toBe("v140-new-device-speedrun");
});

test("mode selection stays readable and clickable at 390x844 from 80 to 200 percent font", async ({ page }) => {
  await prepareNewDevice(page, 2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?menu=1");
  await page.getByRole("button", { name: "登录与云存档" }).click();

  const panel = page.getByRole("region", { name: "按模式管理云存档" });
  await panel.getByRole("radio", { name: /速通模式/ }).click();
  const restore = panel.getByRole("button", { name: "恢复速通主档" });
  await expect(restore).toBeVisible();
  for (const percentage of [80, 100, 125, 150, 200]) {
    await page.getByRole("button", { name: "游戏设置" }).click();
    await page.getByRole("button", { name: `${percentage}%`, exact: true }).click();
    await page.getByRole("button", { name: "登录与云存档" }).click();
    await expect(panel).toBeVisible();
    const layout = await panel.evaluate((element) => ({
      panelLeft: element.getBoundingClientRect().left,
      panelRight: element.getBoundingClientRect().right,
      restoreWidth: (element.querySelector(".cloud-save-primary-recovery button.primary") as HTMLElement | null)?.getBoundingClientRect().width ?? 0,
      viewport: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    const scale = percentage / 100;
    expect(layout.panelLeft, `${scale * 100}% panel left`).toBeGreaterThanOrEqual(-1);
    expect(layout.panelRight, `${scale * 100}% panel right`).toBeLessThanOrEqual(layout.viewport + 1);
    expect(layout.scrollWidth, `${scale * 100}% horizontal overflow`).toBeLessThanOrEqual(layout.viewport + 1);
    expect(layout.restoreWidth, `${scale * 100}% restore touch target`).toBeGreaterThanOrEqual(40);
  }
});

test("speedrun history and delete confirmations name their exact mode and slot", async ({ page }) => {
  await prepareNewDevice(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?menu=1");
  await page.getByRole("button", { name: "登录与云存档" }).click();
  const panel = page.getByRole("region", { name: "按模式管理云存档" });
  await panel.getByRole("radio", { name: /速通模式/ }).click();

  const primary = panel.locator('[data-cloud-slot="main"]');
  await primary.getByRole("button", { name: "历史" }).click();
  const history = panel.getByRole("region", { name: "速通模式 · 主存档历史修订" });
  await expect(history).toContainText("速通模式 · 主存档 · 修订 1");
  await history.locator("article").filter({ hasText: "修订 1" }).getByRole("button", { name: "恢复云端" }).click();
  const restore = page.getByRole("alertdialog", { name: "确认速通模式 · 主存档恢复" });
  await expect(restore).toContainText("只在上方模式与槽位创建一个新的云端修订");
  await restore.getByRole("button", { name: "取消", exact: true }).click();

  const manual = panel.locator('[data-cloud-slot="1"]');
  await manual.getByRole("button", { name: "删除" }).click();
  const deletion = page.getByRole("alertdialog", { name: "确认速通模式 · 槽位 1删除" });
  await expect(deletion).toContainText("另一模式、本机存档及其他槽位不会受到影响");
});
