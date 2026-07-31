import { expect, test } from "@playwright/test";

function seedPausedFactory() {
  return () => {
    const state = {
      version: 44,
      nextId: 1,
      activePlanetId: "home",
      entities: [],
      belts: [],
      construction: {},
      tray: {},
      planetTrays: { home: {} },
      planetTrayItemLimits: { home: 1_000_000 },
      totalProduced: {},
      exploration: { unlockedSystemIds: ["helios"], colonizedPlanetIds: ["home"], surveyProgressBySystem: { helios: 1 }, missions: [] },
      research: { selectedTechId: null, pausedTechId: null, queuedTechIds: [], progressByTech: {}, completedTechIds: [] },
      settings: { theme: "dark", fontScale: 1, simulationSpeed: 1, autosaveIntervalSeconds: 30 },
      paused: true,
    };
    window.sessionStorage.setItem("dsp-idle-network.test-bypass-menu", "1");
    window.localStorage.setItem("dsp-idle-network.release-notes.seen.v1", "2026-07-31-v1.0.16");
    window.localStorage.setItem("dsp-idle-network.basic-onboarding.v1", JSON.stringify({ version: 1, skipped: true, stepIndex: 5 }));
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify({ savedAt: Date.now(), state }));
  };
}

test("paused canvas enters quiet mode without removing the editor surface", async ({ page }) => {
  await page.addInitScript(seedPausedFactory());
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto("/");
  const shell = page.locator(".game-shell");
  await expect(shell).toHaveAttribute("data-simulation-paused", "true");
  await expect(page.locator(".factory-canvas")).toBeVisible();
  await expect(page.locator(".react-flow__pane")).toBeVisible();
});
