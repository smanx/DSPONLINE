import { expect, test, type Page } from "@playwright/test";

async function freshGame(page: Page) {
  await page.goto("/");
  await page.getByTitle("重置当前工厂").evaluate((element: HTMLButtonElement) => element.click());
  await expect(page.getByText("行星工厂网络", { exact: true })).toBeVisible();
  await expect(page.locator(".vein-node").filter({ hasText: "铁矿石" })).toBeVisible();
}

async function placeOnCanvas(page: Page, title: string, x: number, y: number) {
  await page.getByTitle(title).click();
  const canvas = page.locator(".react-flow__pane");
  await canvas.click({ position: { x, y } });
}

async function openSeededGame(page: Page) {
  await page.addInitScript(() => {
    const state = {
      version: 2,
      entities: [],
      belts: [],
      construction: {
        thermal_power_plant: 1,
        storage_mk1: 1,
        splitter_4way: 1,
        storage_tank: 1,
        oil_extractor: 1,
        oil_refinery: 1,
      },
      tray: { coal: 5 },
      totalProduced: {},
      research: { selectedTechId: null, progressByTech: {}, completedTechIds: ["basic_logistics", "thermal_power", "high_efficiency_plasma_control"] },
      paused: false,
    };
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify({ savedAt: Date.now(), state }));
  });
  await page.goto("/");
  await expect(page.getByText("行星工厂网络", { exact: true })).toBeVisible();
}

async function openYellowStageGame(page: Page) {
  await page.addInitScript(() => {
    const state = {
      version: 3,
      nextId: 3,
      entities: [
        {
          id: "entity_1",
          kind: "machine",
          position: { x: 160, y: -250 },
          buildingId: "chemical_plant",
          recipeId: "plastic",
          machineCount: 1,
          minerCount: 0,
          inputs: {},
          outputs: {},
          progress: 0,
          routingCursor: 0,
          utilization: 0,
          productionRate: 0,
        },
        {
          id: "entity_2",
          kind: "machine",
          position: { x: 160, y: 120 },
          buildingId: "matrix_lab",
          recipeId: "electromagnetic_matrix",
          machineCount: 1,
          minerCount: 0,
          inputs: {},
          outputs: {},
          progress: 0,
          routingCursor: 0,
          utilization: 0,
          productionRate: 0,
        },
      ],
      belts: [],
      construction: { water_pump: 1, chemical_plant: 0 },
      tray: {},
      totalProduced: {},
      research: {
        selectedTechId: null,
        queuedTechIds: [],
        progressByTech: {},
        completedTechIds: [
          "electromagnetic_matrix",
          "electromagnetism",
          "automatic_metallurgy",
          "basic_assembling",
          "basic_logistics",
          "thermal_power",
          "high_efficiency_plasma_control",
          "energy_matrix",
          "xray_cracking",
          "high_strength_crystal",
          "basic_chemical_engineering",
          "polymer_chemistry",
          "structure_matrix",
          "titanium_alloy",
          "processor",
        ],
      },
      paused: false,
    };
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify({ savedAt: Date.now(), state }));
  });
  await page.goto("/");
  await expect(page.getByText("行星工厂网络", { exact: true })).toBeVisible();
}

async function openInterstellarGame(page: Page) {
  await page.addInitScript(() => {
    const entityBase = {
      minerCount: 0,
      inputs: {},
      progress: 0,
      routingCursor: 0,
      utilization: 0,
      productionRate: 0,
    };
    const state = {
      version: 5,
      nextId: 5,
      activePlanetId: "home",
      entities: [
        { ...entityBase, id: "home_wind", kind: "power", planetId: "home", position: { x: 180, y: -180 }, buildingId: "wind_turbine", machineCount: 4, outputs: {} },
        { ...entityBase, id: "home_station", kind: "station", planetId: "home", position: { x: 180, y: 80 }, buildingId: "interstellar_logistics_station", machineCount: 1, storedItemId: "titanium_ingot", stationMode: "supply", stationProgress: 0.97, stationTrips: 0, stationLastTransfer: 0, stationVessels: 0, stationMinimumLoad: 1, outputs: { titanium_ingot: 140 } },
        { ...entityBase, id: "ashen_wind", kind: "power", planetId: "ashen", position: { x: 180, y: -180 }, buildingId: "wind_turbine", machineCount: 4, outputs: {} },
        { ...entityBase, id: "ashen_station", kind: "station", planetId: "ashen", position: { x: 180, y: 80 }, buildingId: "interstellar_logistics_station", machineCount: 1, storedItemId: "titanium_ingot", stationMode: "demand", stationProgress: 0.97, stationTrips: 0, stationLastTransfer: 0, stationVessels: 1, stationMinimumLoad: 1, outputs: {} },
      ],
      belts: [],
      construction: {},
      tray: { iron_ore: 3 },
      planetTrays: { home: { iron_ore: 3 }, ashen: { titanium_ore: 4 } },
      totalProduced: {},
      research: { selectedTechId: null, queuedTechIds: [], progressByTech: {}, completedTechIds: ["interstellar_logistics"] },
      paused: false,
    };
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify({ savedAt: Date.now(), state }));
  });
  await page.goto("/");
  await expect(page.getByText("行星工厂网络", { exact: true })).toBeVisible();
}

async function openPurpleStageGame(page: Page) {
  await page.addInitScript(() => {
    const entityBase = {
      planetId: "home",
      machineCount: 1,
      minerCount: 0,
      inputs: {},
      outputs: {},
      progress: 0,
      routingCursor: 0,
      utilization: 0,
      productionRate: 0,
    };
    const state = {
      version: 5,
      nextId: 6,
      activePlanetId: "home",
      entities: [
        { ...entityBase, id: "purple_wind", kind: "power", position: { x: 170, y: -430 }, buildingId: "wind_turbine", machineCount: 8 },
        { ...entityBase, id: "purple_chemical", kind: "machine", position: { x: 170, y: -250 }, buildingId: "chemical_plant", recipeId: "graphene" },
        { ...entityBase, id: "purple_smelter", kind: "machine", position: { x: 470, y: -250 }, buildingId: "arc_smelter", recipeId: "crystal_silicon" },
        { ...entityBase, id: "purple_assembler", kind: "machine", position: { x: 170, y: 80 }, buildingId: "assembling_machine_mk1", recipeId: "particle_broadband" },
        { ...entityBase, id: "purple_lab", kind: "machine", position: { x: 470, y: 20 }, buildingId: "matrix_lab", recipeId: "information_matrix" },
      ],
      belts: [],
      construction: {},
      tray: { information_matrix: 7 },
      planetTrays: { home: { information_matrix: 7 }, ashen: {} },
      totalProduced: { information_matrix: 7 },
      research: {
        selectedTechId: null,
        queuedTechIds: [],
        progressByTech: {},
        completedTechIds: ["nanomaterials", "information_matrix", "interstellar_logistics"],
      },
      paused: false,
    };
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify({ savedAt: Date.now(), state }));
  });
  await page.goto("/");
  await expect(page.getByText("行星工厂网络", { exact: true })).toBeVisible();
}

async function openGreenStageGame(page: Page) {
  await page.addInitScript(() => {
    const entityBase = {
      planetId: "home",
      machineCount: 1,
      minerCount: 0,
      inputs: {},
      outputs: {},
      progress: 0,
      routingCursor: 0,
      utilization: 0,
      productionRate: 0,
    };
    const state = {
      version: 5,
      nextId: 6,
      activePlanetId: "home",
      entities: [
        { ...entityBase, id: "green_wind", kind: "power", position: { x: 170, y: -440 }, buildingId: "wind_turbine", machineCount: 50 },
        { ...entityBase, id: "green_collider", kind: "machine", position: { x: 170, y: -250 }, buildingId: "miniature_particle_collider", recipeId: "deuterium" },
        { ...entityBase, id: "green_thermal", kind: "power", position: { x: 470, y: -250 }, buildingId: "thermal_power_plant", fuelItemId: "deuteron_fuel_rod", inputs: { deuteron_fuel_rod: 1 }, fuelRemainingMj: 0, powerOutputKw: 0 },
        { ...entityBase, id: "green_assembler", kind: "machine", position: { x: 170, y: 110 }, buildingId: "assembling_machine_mk1", recipeId: "quantum_chip" },
        { ...entityBase, id: "green_lab", kind: "machine", position: { x: 470, y: 20 }, buildingId: "matrix_lab", recipeId: "gravity_matrix" },
      ],
      belts: [],
      construction: {},
      tray: { gravity_matrix: 7 },
      planetTrays: { home: { gravity_matrix: 7 }, ashen: {} },
      totalProduced: { gravity_matrix: 7 },
      research: {
        selectedTechId: null,
        queuedTechIds: [],
        progressByTech: {},
        completedTechIds: ["miniature_particle_collider", "quantum_chip", "gravity_matrix", "research_speed_1"],
      },
      paused: false,
    };
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify({ savedAt: Date.now(), state }));
  });
  await page.goto("/");
  await expect(page.getByText("行星工厂网络", { exact: true })).toBeVisible();
}

async function openWhiteStageGame(page: Page) {
  await page.addInitScript(() => {
    const entityBase = {
      planetId: "home",
      machineCount: 1,
      minerCount: 0,
      inputs: {},
      outputs: {},
      progress: 0,
      routingCursor: 0,
      utilization: 0,
      productionRate: 0,
    };
    const state = {
      version: 6,
      nextId: 7,
      activePlanetId: "home",
      entities: [
        { ...entityBase, id: "white_wind", kind: "power", position: { x: 120, y: -500 }, buildingId: "wind_turbine", machineCount: 50 },
        { ...entityBase, id: "white_ejector", kind: "machine", position: { x: 120, y: -260 }, buildingId: "em_rail_ejector", recipeId: "solar_sail_launch", inputs: { solar_sail: 2 } },
        { ...entityBase, id: "white_receiver", kind: "machine", position: { x: 430, y: -260 }, buildingId: "ray_receiver", recipeId: "critical_photon", outputs: { critical_photon: 2 }, powerOutputKw: 6000 },
        { ...entityBase, id: "white_collider", kind: "machine", position: { x: 120, y: 110 }, buildingId: "miniature_particle_collider", recipeId: "antimatter" },
        { ...entityBase, id: "white_assembler", kind: "machine", position: { x: 430, y: 110 }, buildingId: "assembling_machine_mk1", recipeId: "antimatter_fuel_rod" },
        { ...entityBase, id: "white_lab", kind: "machine", position: { x: 740, y: 20 }, buildingId: "matrix_lab", recipeId: "universe_matrix" },
      ],
      belts: [],
      construction: { em_rail_ejector: 1, ray_receiver: 1 },
      tray: { universe_matrix: 7 },
      planetTrays: { home: { universe_matrix: 7 }, ashen: {} },
      totalProduced: { critical_photon: 2, antimatter: 5, antimatter_fuel_rod: 1, universe_matrix: 7 },
      research: {
        selectedTechId: null,
        queuedTechIds: [],
        progressByTech: {},
        completedTechIds: [
          "gravity_matrix",
          "research_speed_1",
          "research_speed_2",
          "dyson_swarm",
          "ray_receiver",
          "antimatter",
          "universe_matrix",
        ],
      },
      dysonSwarm: {
        sailsInOrbit: 400,
        totalLaunched: 420,
        totalExpired: 20,
        decayProgress: 0,
        generationKw: 14400,
        receiverLoadKw: 6000,
      },
      paused: false,
    };
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify({ savedAt: Date.now(), state }));
  });
  await page.goto("/");
  await expect(page.getByText("行星工厂网络", { exact: true })).toBeVisible();
}

async function openDysonSphereStageGame(page: Page) {
  await page.addInitScript(() => {
    const entityBase = {
      planetId: "home",
      machineCount: 1,
      minerCount: 0,
      inputs: {},
      outputs: {},
      progress: 0,
      routingCursor: 0,
      utilization: 0,
      productionRate: 0,
    };
    const state = {
      version: 7,
      nextId: 7,
      activePlanetId: "home",
      entities: [
        { ...entityBase, id: "sphere_wind", kind: "power", position: { x: 100, y: -500 }, buildingId: "wind_turbine", machineCount: 60 },
        { ...entityBase, id: "sphere_receiver", kind: "machine", position: { x: 400, y: -500 }, buildingId: "ray_receiver", recipeId: "ray_power", powerOutputKw: 6000 },
        { ...entityBase, id: "sphere_frame", kind: "machine", position: { x: 100, y: -190 }, buildingId: "assembling_machine_mk1", recipeId: "frame_material" },
        { ...entityBase, id: "sphere_component", kind: "machine", position: { x: 400, y: -190 }, buildingId: "assembling_machine_mk1", recipeId: "dyson_sphere_component" },
        { ...entityBase, id: "sphere_rocket", kind: "machine", position: { x: -170, y: 180 }, buildingId: "assembling_machine_mk1", recipeId: "small_carrier_rocket" },
        { ...entityBase, id: "sphere_silo", kind: "machine", position: { x: 130, y: 180 }, buildingId: "vertical_launching_silo", recipeId: "carrier_rocket_launch" },
      ],
      belts: [],
      construction: { vertical_launching_silo: 1 },
      tray: { frame_material: 5, dyson_sphere_component: 3, small_carrier_rocket: 2 },
      planetTrays: { home: { frame_material: 5, dyson_sphere_component: 3, small_carrier_rocket: 2 }, ashen: {} },
      totalProduced: { frame_material: 5, dyson_sphere_component: 3, small_carrier_rocket: 2 },
      research: {
        selectedTechId: null,
        queuedTechIds: [],
        progressByTech: {},
        completedTechIds: [
          "universe_matrix",
          "dyson_swarm",
          "ray_receiver",
          "dyson_sphere_program",
          "vertical_launching_silo",
        ],
      },
      dysonSwarm: {
        sailsInOrbit: 0,
        totalLaunched: 400,
        totalExpired: 100,
        decayProgress: 0,
        generationKw: 0,
        receiverLoadKw: 6000,
      },
      dysonSphere: {
        structurePoints: 30,
        totalRocketsLaunched: 30,
        shellSails: 300,
        totalSailsAbsorbed: 300,
        absorptionProgress: 0,
        generationKw: 39600,
      },
      paused: false,
    };
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify({ savedAt: Date.now(), state }));
  });
  await page.goto("/");
  await expect(page.getByText("行星工厂网络", { exact: true })).toBeVisible();
}

async function openHandcraftGame(page: Page) {
  await page.addInitScript(() => {
    const state = {
      version: 7,
      nextId: 1,
      activePlanetId: "home",
      entities: [],
      belts: [],
      construction: {},
      tray: {
        magnet: 20,
        copper_ingot: 10,
        iron_ingot: 20,
        carbon_nanotube: 4,
        titanium_alloy: 1,
        high_purity_silicon: 1,
      },
      planetTrays: {
        home: { magnet: 20, copper_ingot: 10, iron_ingot: 20, carbon_nanotube: 4, titanium_alloy: 1, high_purity_silicon: 1 },
        ashen: {},
      },
      totalProduced: {},
      research: {
        selectedTechId: null,
        queuedTechIds: [],
        progressByTech: {},
        completedTechIds: ["dyson_sphere_program"],
      },
      dysonSwarm: { sailsInOrbit: 0, totalLaunched: 0, totalExpired: 0, decayProgress: 0, generationKw: 0, receiverLoadKw: 0 },
      dysonSphere: { structurePoints: 0, totalRocketsLaunched: 0, shellSails: 0, totalSailsAbsorbed: 0, absorptionProgress: 0, generationKw: 0 },
      paused: false,
    };
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify({ savedAt: Date.now(), state }));
  });
  await page.goto("/");
  await expect(page.getByText("行星工厂网络", { exact: true })).toBeVisible();
}

async function openUpgradeStageGame(page: Page) {
  await page.addInitScript(() => {
    const entityBase = {
      planetId: "home",
      machineCount: 1,
      minerCount: 0,
      inputs: {},
      outputs: {},
      progress: 0.4,
      routingCursor: 0,
      utilization: 0,
      productionRate: 0,
    };
    const state = {
      version: 8,
      nextId: 3,
      activePlanetId: "home",
      entities: [
        { ...entityBase, id: "upgrade_storage", kind: "storage", position: { x: -120, y: 0 }, buildingId: "storage_mk1", storedItemId: "iron_ingot", outputs: { iron_ingot: 20 } },
        { ...entityBase, id: "upgrade_assembler", kind: "machine", position: { x: 260, y: 0 }, buildingId: "assembling_machine_mk1", recipeId: "gear", inputs: { iron_ingot: 3 }, outputs: { gear: 2 } },
      ],
      belts: [{ id: "upgrade_belt", planetId: "home", source: "upgrade_storage", target: "upgrade_assembler", itemId: "iron_ingot", lanes: 1, tier: 1, progress: 0.5, priority: 0, lastFlow: 3 }],
      construction: { assembling_machine_mk2: 1, conveyor_belt_mk2: 1 },
      tray: {},
      planetTrays: { home: {}, ashen: {} },
      totalProduced: {},
      research: {
        selectedTechId: null,
        queuedTechIds: [],
        progressByTech: {},
        completedTechIds: ["high_speed_assembling", "high_speed_logistics"],
      },
      paused: true,
    };
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify({ savedAt: Date.now(), state }));
  });
  await page.goto("/");
  await expect(page.getByText("行星工厂网络", { exact: true })).toBeVisible();
}

async function openResearchLineRegressionGame(page: Page) {
  await page.addInitScript(() => {
    const entityBase = {
      planetId: "home",
      machineCount: 1,
      minerCount: 0,
      inputs: {},
      outputs: {},
      progress: 0,
      routingCursor: 0,
      utilization: 0,
      productionRate: 0,
    };
    const state = {
      version: 8,
      nextId: 5,
      activePlanetId: "home",
      entities: [
        { ...entityBase, id: "research_wind", kind: "power", position: { x: -360, y: -230 }, buildingId: "wind_turbine", machineCount: 2 },
        { ...entityBase, id: "blue_storage", kind: "storage", position: { x: -300, y: -20 }, buildingId: "storage_mk1", storedItemId: "electromagnetic_matrix" },
        { ...entityBase, id: "red_storage", kind: "storage", position: { x: -300, y: 240 }, buildingId: "storage_mk1", storedItemId: "energy_matrix" },
        { ...entityBase, id: "research_lab", kind: "machine", position: { x: 180, y: 80 }, buildingId: "matrix_lab", recipeId: "matrix_research", inputs: { energy_matrix: 1 }, progress: 0.98 },
      ],
      belts: [
        { id: "blue_research_belt", planetId: "home", source: "blue_storage", target: "research_lab", itemId: "electromagnetic_matrix", lanes: 1, tier: 1, progress: 0, priority: 0, lastFlow: 0 },
        { id: "red_research_belt", planetId: "home", source: "red_storage", target: "research_lab", itemId: "energy_matrix", lanes: 1, tier: 1, progress: 0, priority: 0, lastFlow: 0 },
      ],
      construction: {},
      tray: {},
      planetTrays: { home: {}, ashen: {} },
      totalProduced: {},
      research: {
        selectedTechId: "xray_cracking",
        queuedTechIds: [],
        progressByTech: { xray_cracking: { electromagnetic_matrix: 10, energy_matrix: 9 } },
        completedTechIds: ["electromagnetic_matrix", "energy_matrix"],
      },
      paused: false,
    };
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify({ savedAt: Date.now(), state }));
  });
  await page.goto("/");
  await expect(page.getByText("行星工厂网络", { exact: true })).toBeVisible();
}

async function openHandCarryGame(page: Page) {
  await page.addInitScript(() => {
    const state = {
      version: 8,
      nextId: 1,
      activePlanetId: "home",
      entities: [],
      belts: [],
      construction: {},
      tray: { titanium_ingot: 40 },
      planetTrays: { home: { titanium_ingot: 40 }, ashen: {} },
      totalProduced: {},
      research: { selectedTechId: null, queuedTechIds: [], progressByTech: {}, completedTechIds: [] },
      paused: true,
    };
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify({ savedAt: Date.now(), state }));
  });
  await page.goto("/");
  await expect(page.getByText("行星工厂网络", { exact: true })).toBeVisible();
}

test("manual mining feeds a powered smelter", async ({ page }) => {
  await page.setViewportSize({ width: 1560, height: 960 });
  await freshGame(page);
  const canvas = page.locator(".react-flow__pane");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  await placeOnCanvas(page, "部署风力涡轮机", Math.round(box!.width * 0.75), 150);
  await placeOnCanvas(page, "部署电弧熔炉", Math.round(box!.width * 0.75), 390);

  const ironVein = page.locator(".vein-node").filter({ hasText: "铁矿石" });
  const mineButton = ironVein.getByTitle("长按采集铁矿石");
  await mineButton.hover();
  await page.mouse.down();
  await page.waitForTimeout(850);
  await page.mouse.up();

  const ironOutput = ironVein.getByTitle("拿取铁矿石");
  await expect.poll(async () => Number(await ironOutput.locator("strong").textContent())).toBeGreaterThan(1);
  await ironOutput.click();
  const smelter = page.locator(".machine-node").filter({ hasText: "铁块" });
  await smelter.getByTitle("投入铁矿石").click();

  await expect(page.getByText("1 / 1", { exact: true })).not.toBeVisible();
  await expect(smelter.getByRole("progressbar", { name: "生产周期" })).toBeVisible();
  await expect.poll(async () => Number(await smelter.getByRole("progressbar", { name: "生产周期" }).getAttribute("aria-valuenow"))).toBeGreaterThan(0);
  await page.waitForTimeout(1400);
  await expect(smelter.getByTitle("拿取铁块")).toBeEnabled();
  await page.screenshot({ path: "artifacts/qa/manual-smelting-1560.png", fullPage: true });
  await smelter.getByTitle("取出铁矿石").click();
  await expect(page.locator(".cargo-slot")).toContainText("铁矿石");
  await expect(smelter.getByTitle("投入铁矿石").locator("strong")).toHaveText("0");
});

test("materials drop into the resource tray", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await freshGame(page);
  const ironVein = page.locator(".vein-node").filter({ hasText: "铁矿石" });
  const mineButton = ironVein.getByTitle("长按采集铁矿石");
  await mineButton.hover();
  await page.mouse.down();
  await page.waitForTimeout(720);
  await page.mouse.up();

  await ironVein.getByTitle("拿取铁矿石").dragTo(page.locator(".tray-block"));
  await expect(page.locator(".tray-row").filter({ hasText: "铁矿石" })).toBeVisible();
  await expect(page.getByText("0 / 1", { exact: true })).toBeVisible();
});

test("automatic mining uses the real extraction cycle progress", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await freshGame(page);
  const canvas = page.locator(".react-flow__pane");
  const box = await canvas.boundingBox();
  await placeOnCanvas(page, "部署风力涡轮机", Math.round(box!.width * 0.82), 160);
  await page.getByTitle("部署风力涡轮机").click();
  await page.locator(".power-node").click();

  const ironVein = page.locator(".vein-node").filter({ hasText: "铁矿石" });
  await page.getByTitle("部署采矿机").click();
  await ironVein.click();
  const progress = ironVein.getByRole("progressbar", { name: "采矿周期" });
  await expect(progress).toBeVisible();
  await expect.poll(async () => Number(await progress.getAttribute("aria-valuenow"))).toBeGreaterThan(0);
  await page.screenshot({ path: "artifacts/qa/automatic-mining-progress-1280.png", fullPage: true });
});

test("factory nodes follow the pointer before release", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await freshGame(page);
  const canvas = page.locator(".react-flow__pane");
  const canvasBox = await canvas.boundingBox();
  await placeOnCanvas(page, "部署电弧熔炉", Math.round(canvasBox!.width * 0.8), 280);
  const node = page.locator(".machine-node").filter({ hasText: "铁块" });
  const header = node.locator(".factory-node__header");
  const before = await node.boundingBox();
  const handle = await header.boundingBox();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle!.x + handle!.width / 2 + 130, handle!.y + handle!.height / 2 + 70, { steps: 12 });
  await page.waitForTimeout(120);
  const during = await node.boundingBox();
  expect(during!.x).toBeGreaterThan(before!.x + 90);
  expect(during!.y).toBeGreaterThan(before!.y + 40);
  await page.mouse.up();
  await page.waitForTimeout(500);
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
  await expect.poll(async () => page.locator(".react-flow__node").evaluateAll((elements) =>
    elements.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
    }).length)).toBe(7);
  await expect(node).toBeVisible();
});

test("selecting a machine card changes its production recipe directly", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await freshGame(page);
  const canvas = page.locator(".react-flow__pane");
  const box = await canvas.boundingBox();
  await placeOnCanvas(page, "部署电弧熔炉", Math.round(box!.width * 0.84), 80);
  const smelter = page.locator(".machine-node").filter({ hasText: "铁块" });
  await smelter.click();
  const recipe = smelter.locator(".node-inline-select select");
  await expect(recipe).toBeVisible();
  await recipe.selectOption("copper_ingot");
  await expect(smelter).toContainText("铜块");
  await expect(page.locator(".inspector-panel")).toContainText("缺少铜矿石");
  await page.screenshot({ path: "artifacts/qa/direct-recipe-selection-1280.png", fullPage: true });
});

test("dragging a construction card keeps the canvas nodes visible", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await freshGame(page);
  const canvas = page.locator(".react-flow__pane");
  await page.getByTitle("部署风力涡轮机").dragTo(canvas, { targetPosition: { x: 650, y: 210 } });
  await expect(page.locator(".power-node")).toBeVisible();
  await expect(page.locator(".vein-node")).toHaveCount(6);
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
});

test("construction batches place exact machine and miner groups", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await freshGame(page);
  const canvas = page.locator(".react-flow__pane");
  const box = await canvas.boundingBox();
  await page.locator(".placement-count").getByRole("button", { name: "×2", exact: true }).click();
  await placeOnCanvas(page, "部署风力涡轮机 ×2", Math.round(box!.width * 0.82), 160);
  await expect(page.locator(".power-node")).toContainText("×2");
  await expect(page.getByTitle("部署风力涡轮机 ×2")).toContainText("×1");

  await page.getByTitle("部署采矿机 ×2").click();
  const ironVein = page.locator(".vein-node").filter({ hasText: "铁矿石" });
  await ironVein.click();
  await expect(ironVein).toContainText("×2");
  await expect(page.getByTitle("部署采矿机 ×2")).toBeDisabled();

  await page.locator(".placement-count").getByRole("button", { name: "×5", exact: true }).click();
  await expect(page.getByTitle("部署风力涡轮机 ×5")).toBeDisabled();
  await page.screenshot({ path: "artifacts/qa/construction-batch-1280.png", fullPage: true });
});

test("responsive drawers keep all tools reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await freshGame(page);
  await expect(page.getByTitle("切换到澄海 I")).toBeVisible();
  await expect(page.getByTitle("切换到烬原 II")).toBeVisible();
  await expect.poll(async () => page.locator(".planet-navigator").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/qa/mobile-planets-390.png", fullPage: true });
  await page.getByLabel("打开物资托盘").click();
  await expect(page.getByText(/物资托盘$/)).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: "artifacts/qa/mobile-resources-390.png", fullPage: true });
  await page.mouse.click(370, 300);
  await page.getByLabel("打开检查器").click();
  await expect(page.getByRole("tab", { name: "基础制造" })).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: "artifacts/qa/mobile-inspector-390.png", fullPage: true });
  await page.mouse.click(20, 300);
  await page.getByLabel("打开科技树").click();
  await expect(page.getByRole("dialog", { name: "科技树" })).toBeVisible();
  const firstTechnology = page.locator(".technology-node").filter({ hasText: "电磁矩阵" }).first();
  await expect(firstTechnology).toBeVisible();
  await expect(page.locator(".matrix-stock")).toHaveCount(6);
  await page.screenshot({ path: "artifacts/qa/mobile-technology-390.png", fullPage: true });
  await firstTechnology.click();
  await expect(page.locator(".research-cost-list")).toContainText("0/3");
  await page.screenshot({ path: "artifacts/qa/mobile-technology-selected-390.png", fullPage: true });
});

test("dragging matching ports creates a belt connection", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await freshGame(page);

  const canvas = page.locator(".react-flow__pane");
  const box = await canvas.boundingBox();
  await placeOnCanvas(page, "部署电弧熔炉", Math.round(box!.width * 0.62), 260);
  const source = page.locator(".vein-node").filter({ hasText: "铁矿石" }).locator(".factory-handle--output");
  const target = page.locator(".machine-node").filter({ hasText: "铁块" }).locator(".factory-handle--input");
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 12 });
  await page.mouse.up();

  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await expect(page.getByText("0.0 / 6 s⁻¹")).toBeVisible();
  await page.screenshot({ path: "artifacts/qa/belt-connection-1280.png", fullPage: true });
});

test("technology selection reaches the matrix lab research mode", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await freshGame(page);
  await page.getByLabel("打开科技树").click();
  const firstTechnology = page.locator(".technology-node").filter({ hasText: "电磁矩阵" }).first();
  await firstTechnology.click();
  await expect(page.locator(".research-focus")).toContainText("电磁矩阵");
  await page.screenshot({ path: "artifacts/qa/technology-tree-1280.png", fullPage: true });
  await page.getByLabel("关闭科技树").click();

  const canvas = page.locator(".react-flow__pane");
  const canvasBox = await canvas.boundingBox();
  await placeOnCanvas(page, "部署矩阵研究站", Math.round(canvasBox!.width * 0.63), 270);
  const lab = page.locator(".machine-node").filter({ hasText: "电磁矩阵" });
  await lab.click();
  await lab.locator(".node-inline-select select").selectOption("matrix_research");
  await expect(lab).toContainText("科研模式");
  await expect(lab).toContainText("电磁矩阵");
  await page.screenshot({ path: "artifacts/qa/technology-research-1280.png", fullPage: true });
});

test("technology queue accepts a planned chain and cascades removals", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await freshGame(page);
  await page.getByLabel("打开科技树").click();
  await page.locator(".technology-node").filter({ hasText: "电磁矩阵" }).first().click();
  const electromagnetism = page.locator(".technology-node").filter({ has: page.getByText("电磁学", { exact: true }) });
  const basicLogistics = page.locator(".technology-node").filter({ has: page.getByText("基础物流系统", { exact: true }) });
  await electromagnetism.click();
  await basicLogistics.click();
  await expect(page.locator(".research-queue__item")).toHaveCount(2);
  await expect(page.locator(".research-queue")).toContainText("电磁学");
  await expect(page.locator(".research-queue")).toContainText("基础物流系统");

  await page.getByLabel("从科研队列移除电磁学").click();
  await expect(page.locator(".research-queue__item")).toHaveCount(0);
  await electromagnetism.click();
  await basicLogistics.click();
  await page.screenshot({ path: "artifacts/qa/technology-queue-1280.png", fullPage: true });
});

test("yellow matrix industry exposes remote resources, chemistry and three-color research", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openYellowStageGame(page);
  const water = page.locator(".vein-node").filter({ hasText: "海洋水源" });
  await expect(water).toHaveCount(1);

  await page.locator(".react-flow__controls-fitview").click();
  await page.getByTitle("部署抽水站").click();
  await water.click();
  await expect(water).toContainText("抽水站 ×1");

  await page.getByTitle("切换到烬原 II").click();
  await expect(page.locator(".vein-node").filter({ hasText: "硅石" })).toHaveCount(1);
  await expect(page.locator(".vein-node").filter({ hasText: "钛石" })).toHaveCount(1);
  await expect(page.locator(".vein-node").filter({ hasText: "硫酸海洋" })).toHaveCount(1);
  await expect(page.locator(".vein-node").filter({ hasText: "海洋水源" })).toHaveCount(0);
  await page.getByTitle("切换到澄海 I").click();

  const chemicalPlant = page.locator(".machine-node").filter({ hasText: "塑料" });
  await chemicalPlant.click();
  await chemicalPlant.locator(".node-inline-select select").selectOption("organic_crystal");
  await expect(chemicalPlant).toContainText("有机晶体");
  await expect(chemicalPlant.getByTitle("投入水")).toBeVisible();

  const matrixLab = page.locator(".machine-node").filter({ hasText: "电磁矩阵" });
  await matrixLab.click();
  await matrixLab.locator(".node-inline-select select").selectOption("structure_matrix");
  await expect(matrixLab).toContainText("结构矩阵");
  await expect(matrixLab.getByTitle("投入金刚石")).toBeVisible();
  await expect(matrixLab.getByTitle("投入钛晶石")).toBeVisible();
  await page.screenshot({ path: "artifacts/qa/yellow-industry-1440.png", fullPage: true });

  await page.getByLabel("打开科技树").click();
  await expect(page.locator(".matrix-stock")).toHaveCount(6);
  const interstellar = page.locator(".technology-node").filter({ has: page.getByText("星际物流理论", { exact: true }) });
  await interstellar.click();
  await expect(page.locator(".research-focus")).toContainText("星际物流理论");
  await expect(page.locator(".research-cost-list")).toContainText("0/12");
  await page.screenshot({ path: "artifacts/qa/yellow-technology-1440.png", fullPage: true });
});

test("planet navigation exposes independent factories and a live interstellar route", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openInterstellarGame(page);
  await expect(page.locator(".tray-row").filter({ hasText: "铁矿石" })).toBeVisible();
  await expect(page.locator(".tray-row").filter({ hasText: "钛石" })).toHaveCount(0);
  await expect(page.locator(".construction-item").filter({ hasText: "星际物流站" })).toHaveCount(1);
  const homeStation = page.locator(".station-node");
  await expect(homeStation).toContainText("供应");
  await expect(homeStation).toContainText("运输船航程");

  await page.getByTitle("切换到烬原 II").click();
  await expect(page.locator(".tray-row").filter({ hasText: "钛石" })).toBeVisible();
  await expect(page.locator(".tray-row").filter({ hasText: "铁矿石" })).toHaveCount(0);
  await expect(page.locator(".brand-lockup")).toContainText("熔岩星生产协议");
  await expect(page.locator(".vein-node").filter({ hasText: "钛石" })).toBeVisible();
  await expect(page.locator(".vein-node").filter({ hasText: "原油" })).toHaveCount(0);
  const demandStation = page.locator(".station-node");
  await expect(demandStation).toContainText("需求");
  await expect(demandStation).toContainText("1/10 舰队");
  await expect.poll(async () => Number(await demandStation.getByTitle("拿取钛块").locator("strong").textContent())).toBe(100);
  await demandStation.click();
  await expect(page.locator(".station-inspector")).toContainText("澄海 I");
  await expect(page.locator(".station-inspector")).toContainText("最近运量");
  await expect(page.locator(".station-inspector")).toContainText("100");
  await expect(page.locator(".station-fleet-stepper strong")).toContainText("1 / 10");
  await expect(page.getByRole("button", { name: "100%", exact: true })).toHaveClass(/active/);
  await page.screenshot({ path: "artifacts/qa/interstellar-logistics-1440.png", fullPage: true });
});

test("cursor cargo hand-carries a titanium stack between planets", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await openHandCarryGame(page);
  await page.locator(".tray-row").filter({ hasText: "钛块" }).click();
  await expect(page.locator(".cargo-block")).toContainText("手提星际载荷");
  await expect(page.locator(".cargo-slot")).toContainText("钛块");
  await expect(page.locator(".cargo-slot")).toContainText("×40");

  await page.getByTitle("切换到烬原 II").click();
  await expect(page.locator(".cargo-slot")).toContainText("钛块");
  await expect(page.getByRole("status")).toContainText("托钛天王：钛块 ×40 已抵达烬原 II");
  await page.screenshot({ path: "artifacts/qa/hand-carry-titanium-1280.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("打开物资托盘").click();
  await expect(page.locator(".cargo-slot")).toContainText("钛块");
  await expect.poll(async () => Math.round((await page.locator(".resource-rail").boundingBox())?.x ?? -999)).toBe(0);
  await expect.poll(async () => Math.round((await page.locator(".resource-rail").boundingBox())?.width ?? 0)).toBeGreaterThan(300);
  await expect.poll(async () => Math.round((await page.locator(".inspector-panel").boundingBox())?.x ?? 0)).toBeGreaterThanOrEqual(390);
  await page.screenshot({ path: "artifacts/qa/hand-carry-titanium-390.png", fullPage: true });
  await page.locator(".cargo-slot").click();
  await expect(page.locator(".tray-row").filter({ hasText: "钛块" })).toContainText("40");

  await page.setViewportSize({ width: 1280, height: 820 });
  await page.getByTitle("切换到澄海 I").click();
  await expect(page.locator(".tray-row").filter({ hasText: "钛块" })).toHaveCount(0);
  await page.getByTitle("切换到烬原 II").click();
  await expect(page.locator(".tray-row").filter({ hasText: "钛块" })).toContainText("40");
});

test("purple matrix industry exposes its full recipe and four-color research loop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPurpleStageGame(page);
  await page.locator(".react-flow__controls-fitview").click();

  const chemical = page.locator(".machine-node").filter({ hasText: "石墨烯" });
  await expect(chemical.getByTitle("投入高能石墨")).toBeVisible();
  await expect(chemical.getByTitle("投入硫酸")).toBeVisible();
  await chemical.click();
  await chemical.locator(".node-inline-select select").selectOption("carbon_nanotube");
  await expect(chemical).toContainText("碳纳米管");
  await expect(chemical.getByTitle("投入钛块")).toBeVisible();

  const smelter = page.locator(".machine-node").filter({ hasText: "晶格硅" });
  await expect(smelter.getByTitle("投入高纯硅块")).toBeVisible();
  const assembler = page.locator(".machine-node").filter({ hasText: "粒子宽带" });
  await expect(assembler.getByTitle("投入碳纳米管")).toBeVisible();
  await expect(assembler.getByTitle("投入晶格硅")).toBeVisible();
  await expect(assembler.getByTitle("投入塑料")).toBeVisible();
  const lab = page.locator(".machine-node").filter({ hasText: "信息矩阵" });
  await expect(lab.getByTitle("投入粒子宽带")).toBeVisible();
  await expect(lab.getByTitle("投入处理器")).toBeVisible();
  await page.screenshot({ path: "artifacts/qa/purple-industry-1440.png", fullPage: true });

  await page.getByLabel("打开科技树").click();
  await expect(page.locator(".matrix-stock")).toHaveCount(6);
  await expect(page.locator(".matrix-stock").filter({ hasText: "Inf" })).toContainText("7");
  const researchSpeed = page.locator(".technology-node").filter({ has: page.getByText("科研速度 I", { exact: true }) });
  await researchSpeed.click();
  await expect(page.locator(".research-focus")).toContainText("科研速度 I");
  await expect(page.locator(".research-cost-list > span")).toHaveCount(4);
  await page.screenshot({ path: "artifacts/qa/purple-technology-1440.png", fullPage: true });
});

test("green matrix industry exposes particle collision, dense fuel and five-color research", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGreenStageGame(page);
  await page.locator(".react-flow__controls-fitview").click();
  await expect(page.locator(".construction-item").filter({ hasText: "微型粒子对撞机" })).toHaveCount(1);

  const thermal = page.locator(".power-node").filter({ hasText: "火力发电厂" });
  await thermal.click();
  await expect(page.locator(".inspector-content")).toContainText("氘核燃料棒");
  await expect(page.locator(".inspector-content")).toContainText("600 MJ");

  const collider = page.locator(".machine-node").filter({ has: page.getByText("对撞机", { exact: true }) }).filter({ hasText: "氘富集" });
  await expect(collider.getByTitle("投入氢")).toBeVisible();
  await expect(collider.getByTitle("拿取氘")).toBeVisible();
  await collider.click();
  await collider.locator(".node-inline-select select").selectOption("strange_matter");
  const strangeCollider = page.locator(".machine-node").filter({ has: page.getByText("对撞机", { exact: true }) }).filter({ hasText: "奇异物质" });
  await expect(strangeCollider.getByTitle("投入粒子容器")).toBeVisible();
  await expect(strangeCollider.getByTitle("投入氘")).toBeVisible();

  const assembler = page.locator(".machine-node").filter({ has: page.getByText("制造台", { exact: true }) }).filter({ hasText: "量子芯片" });
  await expect(assembler.getByTitle("投入处理器")).toBeVisible();
  await expect(assembler.getByTitle("投入位面过滤器")).toBeVisible();
  await assembler.click();
  await assembler.locator(".node-inline-select select").selectOption("graviton_lens");
  const lensAssembler = page.locator(".machine-node").filter({ has: page.getByText("制造台", { exact: true }) }).filter({ hasText: "引力透镜" });
  await expect(lensAssembler.getByTitle("投入金刚石")).toBeVisible();
  await expect(lensAssembler.getByTitle("投入奇异物质")).toBeVisible();

  const lab = page.locator(".machine-node").filter({ hasText: "引力矩阵" });
  await expect(lab.getByTitle("投入引力透镜")).toBeVisible();
  await expect(lab.getByTitle("投入量子芯片")).toBeVisible();
  await strangeCollider.click();
  await page.screenshot({ path: "artifacts/qa/green-industry-1440.png", fullPage: true });

  await page.getByLabel("打开科技树").click();
  await expect(page.locator(".matrix-stock")).toHaveCount(6);
  await expect(page.locator(".matrix-stock").filter({ hasText: "Grv" })).toContainText("7");
  const researchSpeed = page.locator(".technology-node").filter({ has: page.getByText("科研速度 II", { exact: true }) });
  await researchSpeed.click();
  await expect(page.locator(".research-focus")).toContainText("科研速度 II");
  await expect(page.locator(".research-cost-list > span")).toHaveCount(5);
  await page.screenshot({ path: "artifacts/qa/green-technology-1440.png", fullPage: true });
});

test("Dyson swarm closes the critical photon, antimatter and universe matrix loop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWhiteStageGame(page);
  await page.locator(".react-flow__controls-fitview").click();

  await expect(page.locator(".dyson-block")).toContainText("在轨太阳帆");
  await expect(page.locator(".dyson-block")).toContainText("6.00 MW 接收");
  await expect(page.locator(".construction-item").filter({ hasText: "电磁轨道弹射器" })).toHaveCount(1);
  await expect(page.locator(".construction-item").filter({ hasText: "射线接收站" })).toHaveCount(1);

  const ejector = page.locator(".machine-node").filter({ hasText: "太阳帆发射" });
  await expect(ejector.getByTitle("取出太阳帆")).toBeVisible();
  await expect(ejector).toContainText("累计");

  const receiver = page.locator(".machine-node").filter({ hasText: "戴森系统接收设施" });
  await expect(receiver.getByTitle("拿取临界光子")).toBeVisible();
  await receiver.click();
  await receiver.locator(".node-inline-select select").selectOption("ray_power");
  await expect(receiver.locator(".ray-reception")).toContainText("连续接收");
  await expect(receiver).toContainText("6000 kW 接收");
  await expect(receiver).not.toContainText("NaN");

  const collider = page.locator(".machine-node").filter({ hasText: "质能转换" });
  await expect(collider.getByTitle("投入临界光子")).toBeVisible();
  await expect(collider.getByTitle("拿取反物质")).toBeVisible();
  const fuelAssembler = page.locator(".machine-node").filter({ hasText: "反物质燃料棒" });
  await expect(fuelAssembler.getByTitle("投入反物质")).toBeVisible();
  await expect(fuelAssembler.getByTitle("投入湮灭约束球")).toBeVisible();
  const whiteLab = page.locator(".machine-node").filter({ hasText: "宇宙矩阵" });
  await expect(whiteLab.getByTitle("投入引力矩阵")).toBeVisible();
  await expect(whiteLab.getByTitle("投入反物质")).toBeVisible();
  await page.screenshot({ path: "artifacts/qa/white-industry-1440.png", fullPage: true });

  await page.getByLabel("打开科技树").click();
  await expect(page.locator(".matrix-stock")).toHaveCount(6);
  await expect(page.locator(".matrix-stock").filter({ hasText: "Uni" })).toContainText("7");
  const researchSpeed = page.locator(".technology-node").filter({ has: page.getByText("科研速度 III", { exact: true }) });
  await researchSpeed.click();
  await expect(page.locator(".research-focus")).toContainText("科研速度 III");
  await expect(page.locator(".research-cost-list > span")).toHaveCount(6);
  await page.screenshot({ path: "artifacts/qa/white-technology-1440.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".matrix-stock")).toHaveCount(6);
  await expect(page.getByText("科研速度 III", { exact: true }).last()).toBeVisible();
  await page.screenshot({ path: "artifacts/qa/white-technology-390.png", fullPage: true });
});

test("carrier rockets turn the Dyson cloud into a permanent sphere", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDysonSphereStageGame(page);
  await page.locator(".react-flow__controls-fitview").click();

  const dyson = page.locator(".dyson-block");
  await expect(dyson).toContainText("永久结构运行");
  await expect(dyson).toContainText("30 点");
  await expect(dyson).toContainText("300 / 600");
  await expect(dyson).toContainText("39.60 MW 总功率");
  await expect(dyson).toContainText("运载火箭 30");
  await expect(dyson).toContainText("永久吸附 300");
  await expect(page.locator(".construction-item").filter({ hasText: "垂直发射井" })).toHaveCount(1);

  const frame = page.locator(".machine-node").filter({ hasText: "框架材料" });
  await expect(frame.getByTitle("投入碳纳米管")).toBeVisible();
  await expect(frame.getByTitle("投入钛合金")).toBeVisible();
  const component = page.locator(".machine-node").filter({ hasText: "戴森球组件" });
  await expect(component.getByTitle("投入框架材料")).toBeVisible();
  await expect(component.getByTitle("投入太阳帆")).toBeVisible();
  const rocket = page.locator(".machine-node").filter({ hasText: "小型运载火箭" });
  await expect(rocket.getByTitle("投入戴森球组件")).toBeVisible();
  await expect(rocket.getByTitle("投入氘核燃料棒")).toBeVisible();

  const silo = page.locator(".machine-node").filter({ hasText: "戴森球建造设施" });
  await expect(silo.getByTitle("投入小型运载火箭")).toBeVisible();
  await page.locator(".tray-row").filter({ hasText: "小型运载火箭" }).click();
  await expect(silo).toHaveClass(/factory-node--accepts-cargo/);
  await silo.getByTitle("投入小型运载火箭").evaluate((element: HTMLButtonElement) => element.click());
  await expect(silo.getByTitle("取出小型运载火箭")).toBeVisible();
  await expect(silo).toContainText("结构 30 点");
  await expect(silo).toContainText("累计 30 枚");
  await silo.locator(".factory-node__header").click({ force: true });
  await expect(page.locator(".inspector-content")).toContainText("永久结构点");
  await expect(page.locator(".inspector-content")).toContainText("18000 kW");
  await page.screenshot({ path: "artifacts/qa/dyson-sphere-industry-1440.png", fullPage: true });

  await page.getByLabel("打开科技树").click();
  const shellTechnology = page.locator(".technology-node").filter({ has: page.getByText("戴森壳面", { exact: true }) });
  await shellTechnology.click();
  await expect(page.locator(".research-focus")).toContainText("戴森壳面");
  await expect(page.locator(".research-cost-list > span")).toHaveCount(6);
  await page.screenshot({ path: "artifacts/qa/dyson-sphere-technology-1440.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("关闭科技树").click();
  await page.getByLabel("打开物资托盘").click();
  await expect(page.locator(".dyson-block")).toBeVisible();
  await expect(page.locator(".dyson-block")).toContainText("300 / 600");
  await expect.poll(async () => Math.round((await page.locator(".resource-rail").boundingBox())?.x ?? -999)).toBe(0);
  await page.screenshot({ path: "artifacts/qa/dyson-sphere-resources-390.png", fullPage: true });
});

test("basic fabrication handcrafts unlocked assembler recipes in batches", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHandcraftGame(page);
  await page.getByRole("tab", { name: "基础制造" }).click();
  await page.getByRole("button", { name: "物品手工" }).click();
  await page.getByLabel("搜索手工配方").fill("磁线圈");

  const coilRow = page.locator(".handcraft-row").filter({ hasText: "磁线圈" });
  await expect(coilRow).toHaveCount(1);
  await page.getByLabel("手工制造批量").getByRole("button", { name: "×5" }).click();
  await expect(coilRow).toContainText("20/10");
  await expect(coilRow).toContainText("10/5");
  await coilRow.getByTitle("手工制造磁线圈").click();
  await expect(page.locator(".tray-row").filter({ hasText: "磁线圈" })).toContainText("10");

  await page.getByLabel("手工制造批量").getByRole("button", { name: "×1", exact: true }).click();
  await page.getByLabel("搜索手工配方").fill("框架材料");
  const frameRow = page.locator(".handcraft-row").filter({ hasText: "框架材料" });
  await expect(frameRow.getByTitle("手工制造框架材料")).toBeEnabled();
  await frameRow.getByTitle("手工制造框架材料").click();
  await expect(page.locator(".tray-row").filter({ hasText: "框架材料" })).toContainText("1");
  await page.screenshot({ path: "artifacts/qa/handcraft-recipes-1440.png", fullPage: true });

  await page.locator(".tray-row").filter({ hasText: "磁线圈" }).locator(".item-reference").hover();
  await expect(page.locator(".item-hover-card")).toContainText("磁铁 ×2 + 铜块 ×1");
  await expect(page.locator(".item-hover-card")).toContainText("用途");
});

test("recipe codex searches sources and traverses production chains", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHandcraftGame(page);
  await page.getByLabel("打开配方图鉴").click();
  const workspace = page.getByRole("dialog", { name: "配方图鉴" });
  await expect(workspace).toBeVisible();

  await workspace.getByLabel("搜索配方物品").fill("硫酸");
  await workspace.locator(".recipe-index > button").filter({ hasText: "硫酸" }).click();
  await expect(workspace.locator(".recipe-item-header")).toContainText("硫酸");
  await expect(workspace.locator(".recipe-method--source")).toContainText("硫酸海洋抽取");
  await expect(workspace.locator(".recipe-method--source")).toContainText("烬原 II");
  const sulfuricRecipe = workspace.locator(".recipe-section").first().locator(".recipe-method:not(.recipe-method--source)");
  await expect(sulfuricRecipe).toContainText("硫酸");
  await expect(sulfuricRecipe).toContainText("化工厂");
  const downstream = workspace.locator(".recipe-relations > div").last();
  await expect(downstream).toContainText("钛合金");
  await expect(downstream).toContainText("石墨烯");

  await workspace.getByLabel("搜索配方物品").fill("小型运载火箭");
  await workspace.locator(".recipe-index > button").filter({ hasText: "小型运载火箭" }).click();
  await expect(workspace.locator(".recipe-item-header")).toContainText("小型运载火箭");
  const rocketRecipe = workspace.locator(".recipe-method").filter({ hasText: "小型运载火箭" }).first();
  await expect(rocketRecipe).toContainText("戴森球组件");
  await expect(rocketRecipe).toContainText("氘核燃料棒");
  await expect(rocketRecipe).toContainText("量子芯片");
  await expect(workspace.locator(".recipe-method").filter({ hasText: "运载火箭发射" })).toContainText("戴森球永久结构点");

  await workspace.locator(".recipe-item-header .item-reference").hover();
  await expect(page.locator(".item-hover-card")).toContainText("制造台");
  await expect(page.locator(".item-hover-card")).toContainText("1 项生产配方");
  await page.screenshot({ path: "artifacts/qa/recipe-codex-1440.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(workspace.locator(".recipe-item-header")).toBeVisible();
  await expect.poll(async () => workspace.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/qa/recipe-codex-390.png", fullPage: true });
});

test("production equipment and belt lanes upgrade in place without losing the network", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openUpgradeStageGame(page);
  await page.locator(".react-flow__controls-fitview").click();

  const assembler = page.locator(".machine-node").filter({ hasText: "齿轮" });
  await assembler.locator(".factory-node__header").click();
  await expect(page.getByTitle("升级为制造台 Mk.II")).toBeEnabled();
  await page.getByTitle("升级为制造台 Mk.II").click();
  await expect(assembler).toContainText("制造台 Mk.II");
  await expect(page.locator(".inspector-identity")).toContainText("制造台 Mk.II ×1");
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);

  await page.locator(".react-flow__edge-interaction").click({ force: true });
  await expect(page.locator(".inspector-content")).toContainText("传送带等级");
  await expect(page.getByTitle("升级为传送带 Mk.II")).toBeEnabled();
  await page.getByTitle("升级为传送带 Mk.II").click();
  await expect(page.locator(".inspector-content")).toContainText("Mk.II");
  await expect(page.locator(".inspector-content")).toContainText("12/s");
  await expect(page.locator(".react-flow__edge-text")).toContainText("Mk.II");
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await page.screenshot({ path: "artifacts/qa/equipment-upgrade-1440.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".equipment-upgrade--belt")).toBeVisible();
  await expect(page.locator(".inspector-panel").evaluate((element) => element.scrollWidth <= element.clientWidth)).resolves.toBe(true);
  await page.screenshot({ path: "artifacts/qa/equipment-upgrade-390.png", fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("tab", { name: "基础制造" }).click();
  await expect(page.locator(".fabricator-row").filter({ hasText: "位面熔炉" })).toHaveCount(1);
  await expect(page.locator(".fabricator-row").filter({ hasText: "制造台 Mk.III" })).toHaveCount(1);
  await expect(page.locator(".fabricator-row").filter({ hasText: "传送带 Mk.III" })).toHaveCount(1);

  await page.getByLabel("打开科技树").click();
  for (const technology of ["高速装配工艺", "高速物流系统", "高效采矿 I", "位面冶金", "量子打印技术", "超级磁场物流"]) {
    await expect(page.locator(".technology-node").filter({ has: page.getByText(technology, { exact: true }) })).toHaveCount(1);
  }
  await page.screenshot({ path: "artifacts/qa/industry-upgrade-technologies-1440.png", fullPage: true });
});

test("completed matrix research keeps connected color ports while the lab moves", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await openResearchLineRegressionGame(page);
  await page.locator(".react-flow__controls-fitview").click();
  const lab = page.locator(".machine-node").filter({ hasText: "科研模式" });
  await expect(page.locator(".react-flow__edge")).toHaveCount(2);
  await expect(lab.getByTitle("投入电磁矩阵")).toBeVisible();
  await expect(lab.getByTitle("投入能量矩阵")).toBeVisible();
  await expect(lab).toContainText("未选择科技", { timeout: 5000 });

  const header = lab.locator(".factory-node__header");
  const bounds = await header.boundingBox();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width / 2 + 150, bounds!.y + bounds!.height / 2 - 100, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  await expect(page.locator(".react-flow__edge")).toHaveCount(2);
  await expect(lab.getByTitle("投入电磁矩阵")).toBeVisible();
  await expect(lab.getByTitle("投入能量矩阵")).toBeVisible();
  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "artifacts/qa/research-lines-persist-1280.png", fullPage: true });
});

test("production statistics exposes item flow, power demand and bottlenecks", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await freshGame(page);
  const canvas = page.locator(".react-flow__pane");
  const box = await canvas.boundingBox();
  await placeOnCanvas(page, "部署电弧熔炉", Math.round(box!.width * 0.84), 80);
  await page.getByLabel("打开生产统计").click();
  const workspace = page.getByRole("dialog", { name: "生产统计" });
  await expect(workspace).toBeVisible();
  await expect(workspace.locator(".statistics-row").filter({ hasText: "铁矿石" })).toBeVisible();
  await page.screenshot({ path: "artifacts/qa/production-flow-statistics-1280.png", fullPage: true });
  await workspace.getByLabel("筛选统计物品").fill("铁矿石");
  await expect(workspace.locator(".statistics-row")).toHaveCount(1);

  await workspace.getByRole("tab", { name: "电力" }).click();
  await expect(workspace.locator(".consumer-row").filter({ hasText: "电弧熔炉" })).toContainText("360 kW");
  await workspace.getByRole("tab", { name: /瓶颈/ }).click();
  await expect(workspace.locator(".issue-row").filter({ hasText: "电弧熔炉" })).toContainText("缺少铁矿石");
  await page.screenshot({ path: "artifacts/qa/production-statistics-1280.png", fullPage: true });
});

test("production statistics remains usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await freshGame(page);
  await page.getByLabel("打开生产统计").click();
  const workspace = page.getByRole("dialog", { name: "生产统计" });
  await expect(workspace.getByRole("tab", { name: "生产" })).toBeVisible();
  await expect(workspace.locator(".statistics-filter")).toBeVisible();
  const emptyState = workspace.locator(".statistics-empty");
  await expect(emptyState).toContainText("没有符合条件的物品");
  await expect.poll(async () => workspace.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect.poll(async () => emptyState.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.left >= 0 && bounds.right <= window.innerWidth;
  })).toBe(true);
  await page.screenshot({ path: "artifacts/qa/mobile-statistics-390.png", fullPage: true });
  await workspace.getByRole("tab", { name: /瓶颈/ }).click();
  await expect(workspace.locator(".statistics-empty")).toContainText("生产网络运行正常");
});

test("the production workspace fits a medium desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await freshGame(page);
  await expect(page.locator(".factory-canvas")).toBeVisible();
  await expect(page.getByTitle("部署风力涡轮机")).toBeVisible();
  await expect(page.getByRole("tab", { name: "基础制造" })).toBeVisible();
  await page.screenshot({ path: "artifacts/qa/factory-network-1280.png", fullPage: true });
});

test("starter kit and logistics controls are available on the production canvas", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSeededGame(page);

  await expect(page.getByTitle("部署风力涡轮机")).toContainText("×3");
  await expect(page.getByTitle("部署采矿机")).toContainText("×2");
  await expect(page.getByTitle("部署电弧熔炉")).toContainText("×3");
  await expect(page.getByTitle("部署制造台 Mk.I", { exact: true })).toContainText("×3");
  await expect(page.getByTitle("部署矩阵研究站")).toContainText("×2");
  await expect(page.getByTitle("选择传送带 Mk.I连接节点端口", { exact: true })).toContainText("×10");
  await expect(page.locator(".vein-node").filter({ hasText: "原油" })).toBeVisible();

  const canvas = page.locator(".react-flow__pane");
  const box = await canvas.boundingBox();
  await placeOnCanvas(page, "部署小型储物仓", Math.round(box!.width * 0.7), 210);
  const storage = page.locator(".logistics-node").filter({ hasText: "小型储物仓" });
  await storage.click();
  await page.locator(".recipe-select select").selectOption("iron_ore");
  await expect(storage).toContainText("铁矿石");
  await expect(storage.locator(".factory-handle--input")).toHaveCount(1);
  await expect(storage.locator(".factory-handle--output")).toHaveCount(1);

  await placeOnCanvas(page, "部署四向分流器", Math.round(box!.width * 0.7), 450);
  const splitter = page.locator(".logistics-node").filter({ hasText: "四向分流器" });
  await splitter.locator(".factory-node__header").click({ position: { x: 24, y: 18 } });
  await page.locator(".recipe-select select").selectOption("iron_ore");
  await page.getByRole("button", { name: "优先线路" }).click();
  await expect(splitter).toContainText("优先分流");

  await page.getByTitle("部署原油萃取站").click();
  await page.locator(".vein-node").filter({ hasText: "原油" }).click();
  await expect(page.locator(".vein-node").filter({ hasText: "原油" })).toContainText("×1");
  await page.screenshot({ path: "artifacts/qa/logistics-oil-1440.png", fullPage: true });
});

test("thermal power accepts fuel and responds to mining demand", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSeededGame(page);
  const canvas = page.locator(".react-flow__pane");
  const box = await canvas.boundingBox();
  await placeOnCanvas(page, "部署火力发电厂", Math.round(box!.width * 0.7), 210);
  const plant = page.locator(".thermal-node");
  await plant.click();
  await plant.locator(".node-inline-select select").selectOption("coal");

  await page.locator(".tray-row").filter({ hasText: "煤矿" }).click();
  await plant.getByTitle("投入煤矿").click();
  const ironVein = page.locator(".vein-node").filter({ hasText: "铁矿石" });
  await page.getByTitle("部署采矿机").click();
  await ironVein.click();

  await expect.poll(async () => plant.textContent()).toContain("燃烧发电中");
  await expect.poll(async () => Number((await plant.locator(".power-output strong").textContent())?.split("/")[0].trim())).toBeGreaterThan(0);
  await page.screenshot({ path: "artifacts/qa/thermal-power-1440.png", fullPage: true });
});
