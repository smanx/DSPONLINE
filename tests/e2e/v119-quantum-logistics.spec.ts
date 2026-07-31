import { expect, test } from "@playwright/test";

function seedQuantumFixture() {
  return () => {
    const station = {
      id: "v119_quantum_station",
      kind: "station",
      planetId: "home",
      position: { x: 120, y: 80 },
      interactionLocked: false,
      buildingId: "interstellar_logistics_station",
      machineCount: 1,
      minerCount: 0,
      routingCursor: 0,
      progress: 0,
      utilization: 0,
      productionRate: 0,
      inputs: {},
      outputs: {},
      stationSlots: [
        { itemId: "iron_ore", localMode: "storage", remoteMode: "demand", minimumLoad: 1, minStock: 0, maxStock: 0, priority: 1, routePolicy: "direct", warperBudget: 2 },
        ...Array.from({ length: 4 }, () => ({ localMode: "storage", remoteMode: "storage", minimumLoad: 1, minStock: 0, maxStock: 0, priority: 1, routePolicy: "direct", warperBudget: 2 })),
      ],
      stationRoutes: [],
      stationTier: 2,
      stationOperationMode: "legacy",
      stationModeTransition: null,
      quantumMode: "legacy",
      quantumTransition: null,
    };
    const state = {
      version: 44,
      nextId: 2,
      activePlanetId: "home",
      entities: [station],
      belts: [],
      construction: {},
      constructionAutomation: { enabled: true, targetStock: {}, cursor: 0, totalCrafted: 0, lastCraftedId: null, jobs: {} },
      tray: {},
      planetTrays: { home: {} },
      planetTrayItemLimits: { home: 1_000_000 },
      portableFleet: { logistics_drone: 0, logistics_vessel: 1 },
      totalProduced: {},
      research: { selectedTechId: null, pausedTechId: null, queuedTechIds: [], progressByTech: {}, completedTechIds: ["interstellar_logistics", "space_warp", "quantum_logistics_network"] },
      exploration: { unlockedSystemIds: ["helios"], colonizedPlanetIds: ["home"], surveyProgressBySystem: { helios: 1 }, missions: [] },
      settings: { theme: "dark", fontScale: 1, simulationSpeed: 1, autosaveIntervalSeconds: 30, resourceMode: "finite" },
      quantumLogisticsNetwork: { enabled: true, inventory: {}, routingCursors: {} },
      paused: true,
    };
    window.sessionStorage.setItem("dsp-idle-network.test-bypass-menu", "1");
    window.localStorage.setItem("dsp-idle-network.release-notes.seen.v1", "2026-07-31-v1.0.16");
    window.localStorage.setItem("dsp-idle-network.basic-onboarding.v1", JSON.stringify({ version: 1, skipped: true, stepIndex: 5 }));
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify({ savedAt: Date.now(), state }));
  };
}

test("upgraded station exposes independent quantum attachment action", async ({ page }) => {
  await page.addInitScript(seedQuantumFixture());
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator('.react-flow__node[data-id="v119_quantum_station"]')).toBeVisible();
  await page.locator('.react-flow__node[data-id="v119_quantum_station"]').click();
  const inspector = page.locator(".inspector-panel");
  await expect(inspector.getByRole("button", { name: "接入量子网络" })).toBeVisible();
  await inspector.getByRole("button", { name: "接入量子网络" }).click();
  await expect(inspector.locator(".quantum-network-control")).toContainText("交接中");
  await expect(page.getByRole("status")).toContainText("量子网络接入");
});

test("star map exposes a one-click quantum switch for all eligible stations", async ({ page }) => {
  await page.addInitScript(seedQuantumFixture());
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator(".game-header").getByLabel("打开星图").click();
  const starMap = page.locator(".star-map-workspace");
  const bulk = starMap.getByRole("button", { name: /一键切换全部量子物流站/ });
  await expect(bulk).toBeVisible();
  await expect(bulk).toBeEnabled();
  await bulk.click();
  await expect(page.getByRole("status")).toContainText("已提交 1 座物流站接入量子网络");
});
