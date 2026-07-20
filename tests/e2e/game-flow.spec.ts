import { expect, test, type Locator, type Page } from "@playwright/test";

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
          "planetary_logistics",
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

async function openEndgameStageGame(page: Page) {
  await page.addInitScript(() => {
    const state = {
      version: 22,
      nextId: 1,
      activePlanetId: "home",
      entities: [],
      belts: [],
      construction: {},
      tray: {
        universe_matrix: 2_200,
        solar_sail: 6_000,
        small_carrier_rocket: 1_200,
        antimatter_fuel_rod: 600,
      },
      planetTrays: {
        home: {
          universe_matrix: 2_200,
          solar_sail: 6_000,
          small_carrier_rocket: 1_200,
          antimatter_fuel_rod: 600,
        },
        ashen: {},
      },
      totalProduced: {},
      research: {
        selectedTechId: null,
        queuedTechIds: [],
        progressByTech: {},
        completedTechIds: ["universe_matrix"],
      },
      paused: true,
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

async function openProliferatorStageGame(page: Page) {
  await page.addInitScript(() => {
    const entityBase = {
      planetId: "home",
      minerCount: 0,
      progress: 0,
      routingCursor: 0,
      utilization: 0,
      productionRate: 0,
    };
    const state = {
      version: 9,
      nextId: 4,
      activePlanetId: "home",
      entities: [
        { ...entityBase, id: "spray_wind", kind: "power", position: { x: -260, y: -820 }, buildingId: "wind_turbine", machineCount: 3, inputs: {}, outputs: {} },
        { ...entityBase, id: "spray_storage", kind: "storage", position: { x: -260, y: -560 }, buildingId: "storage_mk1", storedItemId: "proliferator_mk3", machineCount: 1, inputs: {}, outputs: { proliferator_mk3: 5 } },
        { ...entityBase, id: "spray_assembler", kind: "machine", position: { x: 180, y: -560 }, buildingId: "assembling_machine_mk1", recipeId: "gear", machineCount: 1, inputs: { iron_ingot: 20 }, outputs: {} },
      ],
      belts: [],
      construction: { spray_coater: 1, conveyor_belt_mk1: 1 },
      tray: {},
      planetTrays: { home: {}, ashen: {} },
      totalProduced: {},
      research: {
        selectedTechId: null,
        queuedTechIds: [],
        progressByTech: {},
        completedTechIds: ["proliferator_1", "proliferator_2", "proliferator_3"],
      },
      paused: true,
    };
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify({ savedAt: Date.now(), state }));
  });
  await page.goto("/");
  await expect(page.getByText("行星工厂网络", { exact: true })).toBeVisible();
}

async function openChemicalRoutingGame(page: Page) {
  await page.addInitScript(() => {
    const entityBase = {
      planetId: "home",
      machineCount: 1,
      minerCount: 0,
      inputs: {},
      progress: 0,
      routingCursor: 0,
      utilization: 0,
      productionRate: 0,
    };
    const state = {
      version: 10,
      nextId: 5,
      activePlanetId: "home",
      entities: [
        { ...entityBase, id: "plastic_source", kind: "machine", position: { x: 250, y: -430 }, buildingId: "chemical_plant", recipeId: "plastic", outputs: { plastic: 20 } },
        { ...entityBase, id: "oil_source", kind: "machine", position: { x: 250, y: -150 }, buildingId: "oil_refinery", recipeId: "plasma_refining", outputs: { refined_oil: 20 } },
        { ...entityBase, id: "water_source", kind: "vein", position: { x: 250, y: 130 }, resourceId: "water", outputs: { water: 20 } },
        { ...entityBase, id: "organic_chemical", kind: "machine", position: { x: 720, y: -150 }, buildingId: "chemical_plant", recipeId: "plastic", outputs: {} },
      ],
      belts: [],
      construction: { conveyor_belt_mk1: 3 },
      tray: {},
      planetTrays: { home: {}, ashen: {}, giant: {} },
      totalProduced: {},
      research: { selectedTechId: null, queuedTechIds: [], progressByTech: {}, completedTechIds: ["high_efficiency_plasma_control", "basic_chemical_engineering", "polymer_chemistry"] },
      paused: false,
    };
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify({ savedAt: Date.now(), state }));
  });
  await page.goto("/");
  await expect(page.getByText("行星工厂网络", { exact: true })).toBeVisible();
}

async function openDysonPlannerGame(page: Page) {
  await page.addInitScript(() => {
    const state = {
      version: 14,
      nextId: 1,
      activePlanetId: "home",
      entities: [],
      belts: [],
      construction: {},
      tray: {},
      planetTrays: { home: {}, ashen: {}, giant: {}, frost: {}, boreal_giant: {}, magnetar: {} },
      totalProduced: {},
      research: {
        selectedTechId: null,
        queuedTechIds: [],
        progressByTech: {},
        completedTechIds: ["dyson_sphere_program", "dyson_shell", "dyson_swarm"],
      },
      exploration: { unlockedSystemIds: ["helios", "borealis"] },
      blueprints: [],
      dysonSwarm: { sailsInOrbit: 0, totalLaunched: 0, totalExpired: 0, decayProgress: 0, generationKw: 0, receiverLoadKw: 0 },
      dysonSphere: { structurePoints: 32, totalRocketsLaunched: 32, shellSails: 0, totalSailsAbsorbed: 0, absorptionProgress: 0, generationKw: 30_720 },
      paused: true,
    };
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify({ savedAt: Date.now(), state }));
  });
  await page.goto("/");
  await expect(page.getByText("行星工厂网络", { exact: true })).toBeVisible();
}

async function openTechnologyUpgradeGame(page: Page) {
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
      version: 15,
      nextId: 3,
      activePlanetId: "home",
      entities: [
        { ...entityBase, id: "upgrade_station", kind: "station", position: { x: -180, y: 0 }, buildingId: "planetary_logistics_station", storedItemId: "processor", stationMode: "demand", stationDrones: 1, stationVessels: 0, stationProgress: 0, stationTrips: 0, stationLastTransfer: 0, stationMinimumLoad: 0.5 },
        { ...entityBase, id: "upgrade_receiver", kind: "machine", position: { x: 280, y: 0 }, buildingId: "ray_receiver", recipeId: "ray_power", powerOutputKw: 0 },
      ],
      belts: [],
      construction: {},
      tray: {},
      planetTrays: { home: {}, ashen: {}, giant: {}, frost: {}, boreal_giant: {}, magnetar: {} },
      totalProduced: {},
      research: {
        selectedTechId: null,
        queuedTechIds: [],
        progressByTech: {},
        completedTechIds: [
          "mining_speed_1", "mining_speed_2", "mining_speed_3",
          "research_speed_1", "research_speed_2", "research_speed_3",
          "logistics_engine_1", "logistics_engine_2",
          "logistics_capacity_1", "logistics_capacity_2",
          "solar_sail_life_1", "solar_sail_life_2",
          "ray_transmission_1", "ray_transmission_2", "dyson_absorption_1",
          "planetary_logistics", "ray_receiver", "dyson_swarm", "dyson_shell",
        ],
      },
      exploration: { unlockedSystemIds: ["helios"] },
      blueprints: [],
      dysonSwarm: { sailsInOrbit: 0, totalLaunched: 0, totalExpired: 0, decayProgress: 0, generationKw: 0, receiverLoadKw: 0 },
      dysonSphere: { structurePoints: 0, totalRocketsLaunched: 0, shellSails: 0, totalSailsAbsorbed: 0, absorptionProgress: 0, generationKw: 0 },
      paused: true,
    };
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify({ savedAt: Date.now(), state }));
  });
  await page.goto("/");
  await expect(page.getByText("行星工厂网络", { exact: true })).toBeVisible();
}

async function openCompleteLogisticsGame(page: Page) {
  await page.addInitScript(() => {
    const entityBase = {
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
      version: 10,
      nextId: 8,
      activePlanetId: "home",
      entities: [
        { ...entityBase, id: "logistics_wind", kind: "power", planetId: "home", position: { x: -420, y: -500 }, buildingId: "wind_turbine", machineCount: 10 },
        { ...entityBase, id: "local_supply", kind: "station", planetId: "home", position: { x: -380, y: -170 }, buildingId: "planetary_logistics_station", storedItemId: "iron_ingot", stationMode: "supply", stationProgress: 0.96, stationTrips: 0, stationLastTransfer: 0, stationDrones: 0, stationMinimumLoad: 0.5, outputs: { iron_ingot: 100 } },
        { ...entityBase, id: "local_demand", kind: "station", planetId: "home", position: { x: 10, y: -170 }, buildingId: "planetary_logistics_station", storedItemId: "iron_ingot", stationMode: "demand", stationProgress: 0.96, stationTrips: 0, stationLastTransfer: 0, stationDrones: 2, stationMinimumLoad: 0.5 },
        { ...entityBase, id: "hydrogen_demand", kind: "station", planetId: "home", position: { x: 400, y: -170 }, buildingId: "interstellar_logistics_station", storedItemId: "hydrogen", stationMode: "demand", stationProgress: 0.98, stationTrips: 0, stationLastTransfer: 0, stationVessels: 1, stationWarpers: 2, stationWarpEnabled: true, stationMinimumLoad: 0.1 },
        { ...entityBase, id: "sorter_storage", kind: "storage", planetId: "home", position: { x: -210, y: 240 }, buildingId: "storage_mk1", storedItemId: "iron_ore", outputs: { iron_ore: 20 } },
        { ...entityBase, id: "sorter_smelter", kind: "machine", planetId: "home", position: { x: 190, y: 240 }, buildingId: "arc_smelter", recipeId: "iron_ingot" },
        { ...entityBase, id: "giant_collector", kind: "station", planetId: "giant", position: { x: 0, y: 0 }, buildingId: "orbital_collector", storedItemId: "hydrogen", stationMode: "supply", stationProgress: 0, stationTrips: 0, stationLastTransfer: 0, outputs: { hydrogen: 100 } },
      ],
      belts: [{ id: "sorter_demo", planetId: "home", source: "sorter_storage", target: "sorter_smelter", itemId: "iron_ore", lanes: 1, tier: 2, sorterTier: 1, progress: 0, priority: 0, lastFlow: 0 }],
      construction: { sorter_mk2: 1 },
      tray: { space_warper: 1 },
      planetTrays: { home: { space_warper: 1 }, ashen: {}, giant: {} },
      totalProduced: {},
      research: {
        selectedTechId: null,
        queuedTechIds: [],
        progressByTech: {},
        completedTechIds: ["planetary_logistics", "interstellar_logistics", "space_warp", "high_speed_logistics"],
      },
      paused: true,
    };
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify({ savedAt: Date.now(), state }));
  });
  await page.goto("/");
  await expect(page.getByText("行星工厂网络", { exact: true })).toBeVisible();
}

async function openCompleteEnergyGame(page: Page) {
  await page.addInitScript(() => {
    const entityBase = {
      machineCount: 1,
      minerCount: 0,
      inputs: {},
      outputs: {},
      progress: 0,
      routingCursor: 0,
      utilization: 0,
      productionRate: 0,
      powerInputKw: 0,
      powerOutputKw: 0,
    };
    const emptyMetrics = {
      generationKw: 0,
      demandKw: 0,
      powerFactor: 1,
      windGenerationKw: 0,
      solarGenerationKw: 0,
      geothermalGenerationKw: 0,
      thermalGenerationKw: 0,
      fusionGenerationKw: 0,
      artificialStarGenerationKw: 0,
      rayGenerationKw: 0,
      storageDischargeKw: 0,
      storageChargeKw: 0,
      storedEnergyMj: 0,
      storageCapacityMj: 0,
      fuelReserveSeconds: 0,
      totalItemsPerMinute: 0,
    };
    const homeMetrics = {
      ...emptyMetrics,
      generationKw: 88620,
      demandKw: 20000,
      solarGenerationKw: 720,
      fusionGenerationKw: 3324,
      artificialStarGenerationKw: 15956,
      storedEnergyMj: 45,
      storageCapacityMj: 180,
      fuelReserveSeconds: 61,
    };
    const state = {
      version: 11,
      nextId: 8,
      activePlanetId: "home",
      entities: [
        { ...entityBase, id: "energy_solar", kind: "power", planetId: "home", position: { x: 320, y: -500 }, buildingId: "solar_panel", machineCount: 2, powerOutputKw: 720, utilization: 1 },
        { ...entityBase, id: "energy_accumulator", kind: "power", planetId: "home", position: { x: 680, y: -500 }, buildingId: "accumulator", storedEnergyMj: 45, energyMode: "auto", progress: 0.5 },
        { ...entityBase, id: "energy_exchanger", kind: "power", planetId: "home", position: { x: 1040, y: -500 }, buildingId: "energy_exchanger", recipeId: "accumulator_charge", energyMode: "charge", storedEnergyMj: 0, inputs: { accumulator: 1 } },
        { ...entityBase, id: "energy_fusion", kind: "power", planetId: "home", position: { x: 520, y: -100 }, buildingId: "mini_fusion_power_plant", fuelItemId: "deuteron_fuel_rod", fuelRemainingMj: 200, inputs: { deuteron_fuel_rod: 1 }, powerOutputKw: 3324, utilization: 0.2216 },
        { ...entityBase, id: "energy_star", kind: "power", planetId: "home", position: { x: 900, y: -100 }, buildingId: "artificial_star", fuelItemId: "antimatter_fuel_rod", fuelRemainingMj: 3600, inputs: { antimatter_fuel_rod: 1 }, powerOutputKw: 15956, utilization: 0.2216 },
        { ...entityBase, id: "ashen_solar", kind: "power", planetId: "ashen", position: { x: 520, y: -320 }, buildingId: "solar_panel", powerOutputKw: 540, utilization: 1 },
        { ...entityBase, id: "ashen_geothermal", kind: "power", planetId: "ashen", position: { x: 900, y: -320 }, buildingId: "geothermal_power_station", powerOutputKw: 4800, utilization: 1 },
      ],
      belts: [],
      construction: { solar_panel: 1, geothermal_power_station: 1, thermal_power_plant: 1, mini_fusion_power_plant: 1, artificial_star: 1, accumulator: 1, energy_exchanger: 1 },
      tray: {},
      planetTrays: { home: {}, ashen: {}, giant: {} },
      totalProduced: {},
      metrics: homeMetrics,
      planetMetrics: {
        home: homeMetrics,
        ashen: { ...emptyMetrics, generationKw: 5340, solarGenerationKw: 540, geothermalGenerationKw: 4800 },
        giant: emptyMetrics,
      },
      research: {
        selectedTechId: null,
        queuedTechIds: [],
        progressByTech: {},
        completedTechIds: ["solar_energy", "energy_storage", "geothermal_power", "miniature_particle_collider", "fusion_power", "antimatter", "artificial_star"],
      },
      paused: true,
    };
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify({ savedAt: Date.now(), state }));
  });
  await page.goto("/");
  await expect(page.getByText("行星工厂网络", { exact: true })).toBeVisible();
}

async function openRareResourceStageGame(page: Page) {
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
      version: 12,
      nextId: 9,
      activePlanetId: "home",
      entities: [
        { ...entityBase, id: "rare_wind", kind: "power", position: { x: 300, y: -620 }, buildingId: "wind_turbine", machineCount: 20, powerOutputKw: 6000 },
        { ...entityBase, id: "rare_fractionator", kind: "machine", position: { x: 300, y: -300 }, buildingId: "fractionator", recipeId: "deuterium_fractionation", inputs: { hydrogen: 20 } },
        { ...entityBase, id: "rare_chemical", kind: "machine", position: { x: 650, y: -300 }, buildingId: "chemical_plant", recipeId: "graphene_from_fire_ice", inputs: { fire_ice: 4 } },
        { ...entityBase, id: "rare_quantum", kind: "machine", position: { x: 1000, y: -300 }, buildingId: "quantum_chemical_plant", recipeId: "carbon_nanotube_from_spiniform", inputs: { spiniform_stalagmite_crystal: 12 } },
        { ...entityBase, id: "rare_smelter", kind: "machine", position: { x: 300, y: 90 }, buildingId: "arc_smelter", recipeId: "diamond_from_kimberlite", inputs: { kimberlite_ore: 2 } },
        { ...entityBase, id: "rare_assembler", kind: "machine", position: { x: 650, y: 90 }, buildingId: "assembling_machine_mk1", recipeId: "particle_container_from_unipolar", inputs: { unipolar_magnet: 20, copper_ingot: 4 } },
        { ...entityBase, id: "rare_thermal", kind: "power", position: { x: 1000, y: 90 }, buildingId: "thermal_power_plant", fuelItemId: "hydrogen_fuel_rod", fuelRemainingMj: 27, inputs: { hydrogen_fuel_rod: 2 }, powerInputKw: 0, powerOutputKw: 0 },
        { ...entityBase, id: "rare_collector", kind: "station", planetId: "giant", position: { x: 0, y: 0 }, buildingId: "orbital_collector", storedItemId: "fire_ice", stationMode: "supply", stationProgress: 0, stationTrips: 0, stationLastTransfer: 0, outputs: { fire_ice: 25 } },
      ],
      belts: [],
      construction: { quantum_chemical_plant: 1, fractionator: 1, conveyor_belt_mk1: 6 },
      tray: { hydrogen_fuel_rod: 2 },
      planetTrays: { home: { hydrogen_fuel_rod: 2 }, ashen: {}, giant: {} },
      totalProduced: { hydrogen_fuel_rod: 2, fire_ice: 25 },
      research: {
        selectedTechId: null,
        queuedTechIds: [],
        progressByTech: {},
        completedTechIds: ["fractionation", "nanomaterials", "quantum_chip", "interstellar_logistics", "rare_resource_utilization", "gravity_matrix", "quantum_chemical_engineering"],
      },
      paused: true,
    };
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify({ savedAt: Date.now(), state }));
  });
  await page.goto("/");
  await expect(page.getByText("行星工厂网络", { exact: true })).toBeVisible();
}

async function openStellarExplorationGame(page: Page) {
  await page.addInitScript(() => {
    const entityBase = {
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
      version: 13,
      nextId: 5,
      activePlanetId: "home",
      entities: [
        { ...entityBase, id: "stellar_home_wind", kind: "power", planetId: "home", position: { x: -300, y: -220 }, buildingId: "wind_turbine", machineCount: 4 },
        { ...entityBase, id: "stellar_demand", kind: "station", planetId: "home", position: { x: 160, y: -100 }, buildingId: "interstellar_logistics_station", storedItemId: "optical_grating_crystal", stationMode: "demand", stationProgress: 0.96, stationTrips: 0, stationLastTransfer: 0, stationVessels: 1, stationWarpers: 1, stationWarpEnabled: true, stationMinimumLoad: 0.1 },
        { ...entityBase, id: "stellar_frost_wind", kind: "power", planetId: "frost", position: { x: -300, y: -220 }, buildingId: "wind_turbine", machineCount: 4 },
        { ...entityBase, id: "stellar_supply", kind: "station", planetId: "frost", position: { x: 160, y: -100 }, buildingId: "interstellar_logistics_station", storedItemId: "optical_grating_crystal", stationMode: "supply", stationProgress: 0.96, stationTrips: 0, stationLastTransfer: 0, stationVessels: 0, stationWarpers: 0, stationWarpEnabled: true, stationMinimumLoad: 0.1, outputs: { optical_grating_crystal: 20 } },
      ],
      belts: [],
      construction: {},
      tray: { space_warper: 7, information_matrix: 10, gravity_matrix: 20, titanium_ingot: 12 },
      planetTrays: { home: { space_warper: 7, information_matrix: 10, gravity_matrix: 20, titanium_ingot: 12 }, ashen: {}, giant: {}, frost: {}, boreal_giant: {}, magnetar: {} },
      totalProduced: {},
      research: {
        selectedTechId: null,
        queuedTechIds: [],
        progressByTech: {},
        completedTechIds: ["space_warp", "rare_resource_utilization", "stellar_exploration"],
      },
      exploration: { unlockedSystemIds: ["helios"] },
      paused: true,
    };
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify({ savedAt: Date.now(), state }));
  });
  await page.goto("/");
  await expect(page.getByText("行星工厂网络", { exact: true })).toBeVisible();
}

async function openBlueprintStageGame(page: Page) {
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
      version: 14,
      nextId: 4,
      activePlanetId: "home",
      entities: [
        { ...entityBase, id: "blueprint_source", kind: "machine", position: { x: -300, y: -120 }, buildingId: "assembling_machine_mk1", recipeId: "circuit_board", outputs: { circuit_board: 12 } },
        { ...entityBase, id: "blueprint_target", kind: "machine", position: { x: 80, y: -120 }, buildingId: "assembling_machine_mk1", recipeId: "processor" },
      ],
      belts: [{ id: "blueprint_line", planetId: "home", source: "blueprint_source", target: "blueprint_target", itemId: "circuit_board", lanes: 1, tier: 1, sorterTier: 1, progress: 0, priority: 0, lastFlow: 0 }],
      construction: { assembling_machine_mk1: 2, assembling_machine_mk2: 2, conveyor_belt_mk1: 1 },
      tray: {},
      planetTrays: { home: {}, ashen: {}, giant: {}, frost: {}, boreal_giant: {}, magnetar: {} },
      totalProduced: {},
      research: { selectedTechId: null, queuedTechIds: [], progressByTech: {}, completedTechIds: ["processor", "high_speed_assembling"] },
      exploration: { unlockedSystemIds: ["helios"] },
      blueprints: [],
      paused: true,
    };
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify({ savedAt: Date.now(), state }));
  });
  await page.goto("/");
  await expect(page.getByText("行星工厂网络", { exact: true })).toBeVisible();
  await expect(page.locator(".machine-node")).toHaveCount(2);
}

async function openStressStageGame(page: Page) {
  await page.addInitScript(() => {
    const entities = Array.from({ length: 500 }, (_, index) => ({
      id: `stress_device_${index}`,
      kind: "storage",
      planetId: "home",
      position: { x: index % 25 * 280 - 700, y: Math.floor(index / 25) * 220 - 360 },
      buildingId: "storage_mk1",
      storedItemId: "iron_ingot",
      machineCount: 1,
      minerCount: 0,
      inputs: { iron_ingot: 0 },
      outputs: { iron_ingot: index % 2 === 0 ? 1_000 : 0 },
      progress: 0,
      routingCursor: 0,
      utilization: 0,
      productionRate: 0,
    }));
    const belts = Array.from({ length: 1_000 }, (_, index) => ({
      id: `stress_belt_${index}`,
      planetId: "home",
      source: `stress_device_${index % 500}`,
      target: `stress_device_${(index + 1) % 500}`,
      itemId: "iron_ingot",
      lanes: 1,
      tier: 1,
      sorterTier: 1,
      progress: 0,
      priority: index % 2,
      lastFlow: 0,
    }));
    const state = {
      version: 18,
      nextId: 2_000,
      activePlanetId: "home",
      entities,
      belts,
      construction: { wind_turbine: 1 },
      tray: {},
      planetTrays: { home: {}, ashen: {}, giant: {}, frost: {}, boreal_giant: {}, magnetar: {} },
      totalProduced: {},
      research: { selectedTechId: null, queuedTechIds: [], progressByTech: {}, completedTechIds: [] },
      exploration: { unlockedSystemIds: ["helios"] },
      blueprints: [],
      paused: false,
      settings: { simulationSpeed: 1, performanceMode: true, reducedMotion: true, soundEnabled: false, autosaveIntervalSeconds: 300 },
    };
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify({ savedAt: Date.now(), state }));
  });
  await page.goto("/");
  await expect(page.getByText("行星工厂网络", { exact: true })).toBeVisible();
}

async function openOperationsStageGame(page: Page) {
  await page.addInitScript(() => {
    if (window.localStorage.getItem("dsp-idle-network.save.v1")) return;
    const state = {
      version: 16,
      nextId: 2,
      activePlanetId: "home",
      entities: [{
        id: "operations_iron",
        kind: "vein",
        planetId: "home",
        position: { x: -220, y: -80 },
        resourceId: "iron_ore",
        extractorBuildingId: "mining_machine",
        machineCount: 0,
        minerCount: 1,
        inputs: {},
        outputs: { iron_ore: 0 },
        progress: 0,
        routingCursor: 0,
        utilization: 0,
        productionRate: 0,
      }],
      belts: [],
      construction: {},
      tray: {},
      totalProduced: { electromagnetic_matrix: 1 },
      manualMined: 1,
      research: { selectedTechId: null, queuedTechIds: [], progressByTech: {}, completedTechIds: [] },
      exploration: { unlockedSystemIds: ["helios"] },
      paused: false,
    };
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify({ savedAt: Date.now(), state }));
  });
  await page.goto("/");
  await expect(page.getByText("行星工厂网络", { exact: true })).toBeVisible();
}

async function openCampaignEndgameStageGame(page: Page) {
  await page.addInitScript(() => {
    const completedTaskIds = [
      "mine_first_ore", "smelt_iron", "deploy_miner", "lay_first_belt", "deploy_matrix_lab", "produce_blue_matrix",
      "refine_oil", "produce_plastic", "produce_red_matrix", "deploy_planetary_station", "complete_planetary_trip",
      "produce_structure_matrix", "unlock_borealis", "deploy_interstellar_station", "complete_interstellar_trip",
      "produce_information_matrix", "produce_gravity_matrix", "produce_universe_matrix", "launch_solar_sail",
      "launch_carrier_rocket", "build_dyson_structure", "absorb_shell_sail", "side_storage", "side_stable_power",
      "side_belt_upgrade", "side_rare_resource", "side_spray_coater", "side_blueprint",
    ];
    const state = {
      version: 23,
      nextId: 1,
      activePlanetId: "home",
      entities: [],
      belts: [],
      construction: {},
      tray: { universe_matrix: 250 },
      planetTrays: { home: { universe_matrix: 250 } },
      totalProduced: { universe_matrix: 250 },
      research: { selectedTechId: null, queuedTechIds: [], progressByTech: {}, completedTechIds: ["universe_matrix"] },
      exploration: { unlockedSystemIds: ["helios"], colonizedPlanetIds: ["home", "ashen", "giant"], missions: [], surveyProgressBySystem: { helios: 1 } },
      campaign: { activeChapterId: "dyson_program", activeTaskId: "absorb_shell_sail", completedTaskIds, rewardedTaskIds: completedTaskIds },
      paused: true,
    };
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify({ savedAt: Date.now(), state }));
  });
  await page.goto("/");
  await expect(page.getByText("行星工厂网络", { exact: true })).toBeVisible();
}

async function openTitaniumRoutingGame(page: Page) {
  await page.addInitScript(() => {
    const base = { planetId: "home", machineCount: 1, minerCount: 0, inputs: {}, progress: 0, routingCursor: 0, utilization: 0, productionRate: 0 };
    const state = {
      version: 23,
      nextId: 8,
      activePlanetId: "home",
      entities: [
        { ...base, id: "titanium_source", kind: "machine", position: { x: 650, y: -300 }, buildingId: "arc_smelter", recipeId: "titanium_ingot", outputs: { titanium_ingot: 20 } },
        { ...base, id: "steel_source", kind: "machine", position: { x: 650, y: 0 }, buildingId: "arc_smelter", recipeId: "steel", outputs: { steel: 20 } },
        { ...base, id: "acid_source", kind: "machine", position: { x: 650, y: 300 }, buildingId: "chemical_plant", recipeId: "sulfuric_acid", outputs: { sulfuric_acid: 20 } },
        { ...base, id: "alloy_target", kind: "machine", position: { x: 1100, y: 0 }, buildingId: "arc_smelter", recipeId: "titanium_alloy", outputs: {} },
        { ...base, id: "routing_wind", kind: "power", position: { x: 900, y: -360 }, buildingId: "wind_turbine", machineCount: 8, outputs: {} },
      ],
      belts: [],
      construction: { conveyor_belt_mk1: 3 },
      tray: {},
      planetTrays: { home: {} },
      totalProduced: {},
      research: { selectedTechId: null, queuedTechIds: [], progressByTech: {}, completedTechIds: ["automatic_metallurgy", "high_strength_crystal", "high_efficiency_plasma_control", "basic_chemical_engineering", "titanium_alloy"] },
      exploration: { unlockedSystemIds: ["helios"], colonizedPlanetIds: ["home", "ashen", "giant"], missions: [], surveyProgressBySystem: { helios: 1 } },
      paused: false,
    };
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify({ savedAt: Date.now(), state }));
  });
  await page.goto("/");
  await expect(page.getByText("行星工厂网络", { exact: true })).toBeVisible();
}

async function openMultiSlotStationRoutingGame(page: Page) {
  await page.addInitScript(() => {
    const slot = (itemId: string) => ({ itemId, localMode: "storage", remoteMode: "supply", minimumLoad: 1, minStock: 0, maxStock: 0, priority: 1 });
    const base = { planetId: "home", machineCount: 1, minerCount: 0, inputs: {}, outputs: {}, progress: 0, routingCursor: 0, utilization: 0, productionRate: 0 };
    const state = {
      version: 23,
      nextId: 5,
      activePlanetId: "home",
      entities: [
        {
          ...base,
          id: "multi_station",
          kind: "station",
          position: { x: 0, y: -120 },
          buildingId: "interstellar_logistics_station",
          storedItemId: "steel",
          stationSlots: [slot("steel"), slot("titanium_ingot"), slot("sulfuric_acid")],
          outputs: { steel: 20, titanium_ingot: 20, sulfuric_acid: 20 },
          stationVessels: 0,
          stationWarpers: 0,
          stationProgress: 0,
          stationTrips: 0,
        },
        { ...base, id: "multi_alloy", kind: "machine", position: { x: 420, y: -160 }, buildingId: "arc_smelter", recipeId: "titanium_alloy" },
        { ...base, id: "multi_chemical", kind: "machine", position: { x: 420, y: 180 }, buildingId: "chemical_plant", recipeId: "graphene" },
      ],
      belts: [],
      construction: { conveyor_belt_mk1: 3 },
      tray: {},
      planetTrays: { home: {} },
      totalProduced: {},
      research: {
        selectedTechId: null,
        queuedTechIds: [],
        progressByTech: {},
        completedTechIds: ["automatic_metallurgy", "high_strength_crystal", "basic_chemical_engineering", "energy_matrix", "nanomaterials", "titanium_alloy"],
      },
      paused: true,
    };
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify({ savedAt: Date.now(), state }));
  });
  await page.goto("/");
  await expect(page.getByText("行星工厂网络", { exact: true })).toBeVisible();
}

async function openOfflineStageGame(page: Page) {
  await page.addInitScript(() => {
    const base = {
      planetId: "home",
      inputs: {},
      progress: 0,
      routingCursor: 0,
      utilization: 0,
      productionRate: 0,
    };
    const state = {
      version: 16,
      nextId: 3,
      activePlanetId: "home",
      entities: [
        { ...base, id: "offline_iron", kind: "vein", position: { x: -220, y: -80 }, resourceId: "iron_ore", extractorBuildingId: "mining_machine", machineCount: 0, minerCount: 1, outputs: { iron_ore: 0 } },
        { ...base, id: "offline_wind", kind: "power", position: { x: 120, y: -80 }, buildingId: "wind_turbine", machineCount: 3, minerCount: 0, outputs: {}, powerOutputKw: 0 },
      ],
      belts: [],
      construction: {},
      tray: {},
      totalProduced: {},
      manualMined: 0,
      research: { selectedTechId: null, queuedTechIds: [], progressByTech: {}, completedTechIds: [] },
      exploration: { unlockedSystemIds: ["helios"] },
      paused: false,
    };
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify({ savedAt: Date.now() - 6_000, state }));
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
  await expect(page.locator(".campaign-reward-token")).toContainText("传送带 Mk.I");
  await page.screenshot({ path: "artifacts/qa/campaign-reward-flight-1560.png", fullPage: true });

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
  expect(sourceBox!.width).toBeGreaterThanOrEqual(14.5);
  expect(targetBox!.width).toBeGreaterThanOrEqual(14.5);
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 12 });
  await page.waitForTimeout(120);
  await page.mouse.up();

  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await expect(page.locator(".game-notice")).toContainText(/铁矿石运输线已建立|成就解锁：物流脉搏/);
  await expect(page.getByText("0.0 / 3 s⁻¹")).toBeVisible();
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
  await expect(page.locator(".planet-transition")).toContainText("烬原 II");
  await page.screenshot({ path: "artifacts/qa/planet-transition-1440.png", fullPage: true });
  await expect(page.locator(".vein-node").filter({ has: page.getByText("硅石", { exact: true }) })).toHaveCount(1);
  await expect(page.locator(".vein-node").filter({ has: page.getByText("钛石", { exact: true }) })).toHaveCount(1);
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
  await expect(page.locator(".station-fleet-control .station-fleet-stepper strong")).toContainText("1 / 10");
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

  await workspace.getByRole("button", { name: "固定到主界面" }).click();
  await workspace.getByLabel("关闭配方图鉴").click();
  const focusedChain = page.locator(".recipe-focus-panel");
  await expect(focusedChain).toContainText("小型运载火箭");
  await focusedChain.getByRole("button", { name: /完整/ }).click();
  await expect(focusedChain).toContainText("完整上游链");
  await focusedChain.getByLabel("取消聚焦材料").click();
  await expect(focusedChain).toHaveCount(0);

  await page.getByLabel("打开配方图鉴").click();
  const reopenedWorkspace = page.getByRole("dialog", { name: "配方图鉴" });
  await expect(reopenedWorkspace).toBeVisible();
  await reopenedWorkspace.getByLabel("搜索配方物品").fill("小型运载火箭");
  await reopenedWorkspace.locator(".recipe-index > button").filter({ hasText: "小型运载火箭" }).click();
  await reopenedWorkspace.locator(".recipe-item-header .item-reference").hover();
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
  await expect(page.locator(".factory-cargo-packet").first()).toBeVisible();

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
  await expect(page.locator(".inspector-content")).toContainText("3/s");
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

test("spray coating closes the Mk.III proliferator logistics and extra-output loop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openProliferatorStageGame(page);
  await page.locator(".react-flow__controls-fitview").click();

  const assembler = page.locator(".machine-node").filter({ hasText: "齿轮" });
  await assembler.click();
  const inspector = page.locator(".inspector-panel");
  await expect(inspector.locator(".proliferator-control")).toContainText("模块未安装");
  await inspector.getByRole("button", { name: "安装喷涂模块" }).click();
  await inspector.locator(".proliferator-tier").getByRole("button", { name: "Mk.III" }).click();
  await inspector.locator(".proliferator-mode").getByRole("button", { name: "增产" }).click();
  await expect(assembler.locator(".proliferator-readout")).toContainText("额外产出 · Mk.III");
  await expect(assembler.getByTitle("投入增产剂 Mk.III")).toBeVisible();

  const storage = page.locator(".logistics-node").filter({ hasText: "增产剂 Mk.III" });
  const source = storage.locator(".factory-handle--output");
  const target = assembler.locator(".node-port--input").filter({ hasText: "增产剂 Mk.III" }).locator(".factory-handle--input");
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 12 });
  await page.waitForTimeout(120);
  await page.mouse.up();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);

  await page.getByLabel("继续模拟").click();
  const gearOutput = assembler.getByTitle("拿取齿轮");
  await expect.poll(async () => Number(await gearOutput.locator("strong").textContent()), { timeout: 12_000 }).toBeGreaterThanOrEqual(5);
  await expect.poll(async () => Number(await gearOutput.locator("strong").textContent()) % 1).toBe(0);
  await expect(assembler.locator(".proliferator-readout strong")).not.toHaveText("0 点");
  await page.locator(".react-flow__controls-zoomin").click();
  await page.locator(".react-flow__controls-zoomin").click();
  await page.screenshot({ path: "artifacts/qa/proliferator-loop-1440.png", fullPage: true });

  await page.getByLabel("打开生产统计").click();
  const statistics = page.getByRole("dialog", { name: "生产统计" });
  await expect(statistics.locator(".statistics-row").filter({ hasText: "增产剂 Mk.III" })).toBeVisible();
  await expect(statistics.locator(".statistics-row").filter({ hasText: "齿轮" })).toBeVisible();
  await statistics.getByLabel("关闭生产统计").click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("打开检查器").click();
  await expect(inspector.locator(".proliferator-control")).toBeVisible();
  await inspector.locator(".proliferator-control").scrollIntoViewIfNeeded();
  await expect.poll(async () => inspector.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/qa/proliferator-loop-390.png", fullPage: true });
});

test("a chemical plant accepts plastic, refined oil and water transport lines together", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openChemicalRoutingGame(page);
  await page.locator(".react-flow__controls-fitview").click();
  const chemical = page.locator('.react-flow__node[data-id="organic_chemical"] .machine-node');
  await chemical.click();
  await chemical.locator(".node-inline-select select").selectOption("organic_crystal");
  await expect(chemical).toContainText("有机晶体");
  await expect(chemical.getByTitle("投入塑料")).toBeVisible();
  await expect(chemical.getByTitle("投入精炼油")).toBeVisible();
  await expect(chemical.getByTitle("投入水")).toBeVisible();

  const connect = async (sourceId: string, itemText: string, expectedEdges: number) => {
    const source = page.locator(`.react-flow__node[data-id="${sourceId}"]`).locator(".node-port").filter({ hasText: itemText }).locator(".factory-handle--output");
    const target = chemical.locator(".node-port--input").filter({ hasText: itemText }).locator(".factory-handle--input");
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    expect(sourceBox).not.toBeNull();
    expect(targetBox).not.toBeNull();
    await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2, { steps: 12 });
    await page.waitForTimeout(600);
    await page.mouse.up();
    await expect(page.locator(".react-flow__edge")).toHaveCount(expectedEdges);
  };

  await connect("plastic_source", "塑料", 1);
  await connect("oil_source", "精炼油", 2);
  await connect("water_source", "水", 3);
  await expect(page.locator(".factory-edge--active")).toHaveCount(3);
  await expect.poll(async () => page.locator(".factory-edge--active .react-flow__edge-path").first().evaluate((element) => getComputedStyle(element).animationName)).toContain("factory-belt-flow");
  const layerZIndexes = await page.evaluate(() => Object.fromEntries([
    ["edgeHitLayer", ".react-flow__edges"],
    ["visibleEdges", ".factory-edge-visual-layer"],
    ["labels", ".react-flow__edgelabel-renderer"],
    ["nodes", ".react-flow__nodes"],
  ].map(([key, selector]) => [key, Number.parseInt(getComputedStyle(document.querySelector(selector)!).zIndex || "0", 10)])));
  expect(layerZIndexes.edgeHitLayer).toBeGreaterThan(layerZIndexes.nodes);
  expect(layerZIndexes.visibleEdges).toBeLessThan(layerZIndexes.nodes);
  expect(layerZIndexes.labels).toBeLessThan(layerZIndexes.nodes);
  await expect(page.getByTitle("选择传送带 Mk.I连接节点端口", { exact: true })).toContainText("×0");
  await page.screenshot({ path: "artifacts/qa/chemical-three-input-routing-1440.png", fullPage: true });
});

test("a second titanium alloy input line transfers after the first line", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTitaniumRoutingGame(page);
  await page.locator(".react-flow__controls-fitview").click();
  const target = page.locator('.react-flow__node[data-id="alloy_target"] .machine-node');
  const connect = async (sourceId: string, itemText: string, expectedEdges: number) => {
    const source = page.locator(`.react-flow__node[data-id="${sourceId}"]`).locator(".node-port").filter({ hasText: itemText }).locator(".factory-handle--output");
    const input = target.locator(".node-port--input").filter({ hasText: itemText }).locator(".factory-handle--input");
    const sourceBox = await source.boundingBox();
    const inputBox = await input.boundingBox();
    expect(sourceBox).not.toBeNull();
    expect(inputBox).not.toBeNull();
    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(inputBox!.x + inputBox!.width / 2, inputBox!.y + inputBox!.height / 2, { steps: 12 });
    await page.waitForTimeout(400);
    await page.mouse.up();
    await expect(page.locator(".react-flow__edge")).toHaveCount(expectedEdges);
  };
  await connect("steel_source", "钢材", 1);
  await connect("titanium_source", "钛块", 2);
  await connect("acid_source", "硫酸", 3);
  await page.waitForTimeout(2_500);
  await expect.poll(async () => Number(await target.locator(".node-port--input").filter({ hasText: "钛块" }).locator("strong").textContent()), { timeout: 8_000 }).toBeGreaterThan(0);
  await expect.poll(async () => Number(await target.locator(".node-port--input").filter({ hasText: "钢材" }).locator("strong").textContent()), { timeout: 8_000 }).toBeGreaterThan(0);
  await expect.poll(async () => Number(await target.locator(".node-port--input").filter({ hasText: "硫酸" }).locator("strong").textContent()), { timeout: 8_000 }).toBeGreaterThan(0);
});

test("rapid consecutive belt drags keep the second connection instead of using stale stock", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTitaniumRoutingGame(page);
  await page.locator(".react-flow__controls-fitview").click();
  const target = page.locator('.react-flow__node[data-id="alloy_target"] .machine-node');
  const dragConnection = async (sourceId: string, itemText: string) => {
    const source = page.locator(`.react-flow__node[data-id="${sourceId}"]`).locator(".node-port").filter({ hasText: itemText }).locator(".factory-handle--output");
    const input = target.locator(".node-port--input").filter({ hasText: itemText }).locator(".factory-handle--input");
    const sourceBox = await source.boundingBox();
    const inputBox = await input.boundingBox();
    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(inputBox!.x + inputBox!.width / 2, inputBox!.y + inputBox!.height / 2, { steps: 8 });
    await page.mouse.up();
  };
  await dragConnection("steel_source", "钢材");
  await dragConnection("titanium_source", "钛块");
  await expect(page.locator(".react-flow__edge")).toHaveCount(2);
  await expect(page.getByRole("status")).not.toContainText("运输线未建立");
});

test("multi-slot station outputs connect beyond the first slot and expose belt feedback", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openMultiSlotStationRoutingGame(page);
  await page.locator(".react-flow__controls-fitview").click();
  const station = page.locator('.react-flow__node[data-id="multi_station"]');
  const alloy = page.locator('.react-flow__node[data-id="multi_alloy"]');
  const chemical = page.locator('.react-flow__node[data-id="multi_chemical"]');
  await expect(station.locator(".factory-handle--output")).toHaveCount(3);
  await expect(station.getByTitle("拿取钛块")).toBeVisible();
  await expect(station.getByTitle("拿取硫酸")).toBeVisible();

  const dragConnection = async (sourceNode: Locator, itemText: string, targetNode: Locator, expectedEdges: number, inspectGhost = false, targetItemText = itemText) => {
    const source = sourceNode.locator(".node-port").filter({ hasText: itemText }).locator(".factory-handle--output");
    const target = targetNode.locator(".node-port").filter({ hasText: targetItemText }).locator(".factory-handle--input");
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    expect(sourceBox).not.toBeNull();
    expect(targetBox).not.toBeNull();
    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 12 });
    if (inspectGhost) await expect(page.locator(".factory-connection-preview__path")).toBeVisible();
    await page.mouse.up();
    await expect(page.locator(".react-flow__edge")).toHaveCount(expectedEdges);
  };

  await dragConnection(station, "钛块", alloy, 1, true);
  await dragConnection(station, "硫酸", chemical, 2);
  await expect(page.getByRole("status")).toContainText("硫酸运输线已建立");

  // A mismatched release must leave an explicit failure instead of silently
  // discarding the drag.
  await dragConnection(station, "钛块", chemical, 2, false, "硫酸");
  await expect(page.getByRole("status")).toContainText("运输线未建立");
});

test("Dyson planner builds independent orbital layers across unlocked star systems", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDysonPlannerGame(page);
  await page.getByTitle("打开戴森球规划").click();
  const planner = page.getByRole("dialog", { name: "戴森球规划" });
  await expect(planner).toBeVisible();
  await expect(planner.getByTitle("规划赫利俄斯戴森球")).toBeVisible();
  await expect(planner.getByTitle("规划北冕座戴森球")).toBeVisible();

  await planner.getByTitle("新建八节点闭合标准壳层").click();
  const summary = planner.locator(".dyson-stage-summary");
  await expect(summary.locator("span").filter({ hasText: "节点" })).toContainText("8");
  await expect(summary.locator("span").filter({ hasText: "框架" })).toContainText("8");
  await expect(summary.locator("span").filter({ hasText: "壳面" })).toContainText("8");
  await expect(planner.locator(".dyson-layer-list > button")).toHaveCount(1);

  const shellInspector = planner.locator(".dyson-layer-inspector");
  const radius = shellInspector.locator(":scope > .dyson-orbit-control").filter({ hasText: "轨道半径" });
  const inclination = shellInspector.locator(":scope > .dyson-orbit-control").filter({ hasText: "轨道倾角" });
  const longitude = shellInspector.locator(":scope > .dyson-orbit-control").filter({ hasText: "升交点经度" });
  await radius.locator("input").fill("20000");
  await inclination.locator("input").fill("37");
  await longitude.locator("input").fill("124");
  await expect(radius).toContainText("20,000 m");
  await expect(inclination).toContainText("37°");
  await expect(longitude).toContainText("124°");

  await planner.getByTitle("规划北冕座戴森球").click();
  await expect(planner.locator(".dyson-layer-list > button")).toHaveCount(0);
  await planner.getByTitle("新建八节点闭合标准壳层").click();
  await expect(planner.locator(".dyson-layer-list > button")).toHaveCount(1);
  await expect(planner.locator(".dyson-layer-inspector > header")).toContainText("标准壳层 1");

  await planner.getByTitle("规划赫利俄斯戴森球").click();
  await expect(radius.locator("input")).toHaveValue("20000");
  await expect(inclination.locator("input")).toHaveValue("37");
  await expect(longitude.locator("input")).toHaveValue("124");
  await expect(planner.locator(".dyson-orbit-node")).toHaveCount(8);

  const swarmInspector = planner.locator(".dyson-swarm-orbit-inspector");
  await expect(planner.locator(".dyson-swarm-orbit-list > button")).toHaveCount(1);
  await planner.getByText("新增太阳帆轨道", { exact: true }).click();
  await expect(planner.locator(".dyson-swarm-orbit-list > button")).toHaveCount(2);
  const swarmRadius = swarmInspector.locator(".dyson-orbit-control").filter({ hasText: "轨道半径" });
  const swarmInclination = swarmInspector.locator(".dyson-orbit-control").filter({ hasText: "轨道倾角" });
  const swarmLongitude = swarmInspector.locator(".dyson-orbit-control").filter({ hasText: "升交点经度" });
  await swarmRadius.locator("input").fill("28000");
  await swarmInclination.locator("input").fill("31");
  await swarmLongitude.locator("input").fill("122");
  await expect(swarmRadius).toContainText("28,000 m");
  await expect(swarmInclination).toContainText("31°");
  await expect(swarmLongitude).toContainText("122°");
  await planner.getByText("太阳帆", { exact: true }).click();
  await planner.getByText("50%", { exact: true }).click();
  await expect(planner.locator(".dyson-launch-mode button.active")).toHaveText("太阳帆");
  await expect(planner.locator(".dyson-launch-throttle button.active")).toHaveText("50%");
  const launchToggle = planner.getByRole("button", { name: "暂停戴森发射" });
  await expect(launchToggle).toHaveCount(1);
  await launchToggle.click();
  await expect(planner.getByRole("button", { name: "启用戴森发射" })).toHaveCount(1);
  await expect(planner.locator(".dyson-engineering-ledger")).toContainText("发射能耗");
  await page.screenshot({ path: "artifacts/qa/dyson-planner-1440.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await planner.locator(".dyson-orbit-stage").scrollIntoViewIfNeeded();
  await expect.poll(async () => planner.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(planner.locator(".dyson-orbit-canvas")).toBeVisible();
  await page.screenshot({ path: "artifacts/qa/dyson-planner-390.png", fullPage: true });
});

test("galactic industry console runs infinite research and mega exports", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEndgameStageGame(page);
  await page.getByLabel("打开生产统计").click();
  const statistics = page.getByRole("dialog", { name: "生产统计" });
  await statistics.getByRole("tab", { name: /银河/ }).click();
  await expect(statistics.locator(".galactic-summary-grid")).toContainText("银河评分");
  await expect(statistics.locator(".galactic-industry")).toContainText("超大型物资出口");
  await expect(statistics.locator(".infinite-research-list > button")).toHaveCount(5);

  await statistics.locator(".infinite-research-list > button").filter({ hasText: "矩阵压缩" }).click();
  await expect(statistics.locator(".infinite-research-list > button.active")).toContainText("矩阵压缩");
  const archive = statistics.locator(".export-project-list > article").filter({ hasText: "宇宙矩阵档案" });
  await archive.getByRole("button", { name: /启用宇宙矩阵档案/ }).click();
  await archive.getByRole("button", { name: "P3" }).click();
  await archive.locator('button[title="立即装运一批物资"]').click();
  await expect(archive).toHaveClass(/active/);
  await expect(archive.locator(".export-project-progress")).toContainText("120");
  await page.screenshot({ path: "artifacts/qa/galactic-industry-1440.png", fullPage: true });

  await statistics.getByLabel("关闭生产统计").click();
  await page.getByLabel("打开科技树").click();
  const technology = page.getByRole("dialog", { name: "科技树" });
  await expect(technology.locator(".infinite-research-console")).toContainText("矩阵压缩");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => technology.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/qa/galactic-industry-390.png", fullPage: true });
});

test("technology upgrades expose balanced global effects in research and equipment views", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTechnologyUpgradeGame(page);
  await page.getByLabel("打开科技树").click();
  const technology = page.getByRole("dialog", { name: "科技树" });
  const upgrades = technology.getByLabel("全局科技升级效果");
  await expect(upgrades).toContainText("固体采矿3.00×");
  await expect(upgrades).toContainText("科研吞吐1.75×");
  await expect(upgrades).toContainText("物流航速2.00×");
  await expect(upgrades).toContainText("机 / 船载荷50 / 200");
  await expect(upgrades).toContainText("太阳帆寿命40 min");
  await expect(upgrades).toContainText("单站接收12.0 MW");
  await expect(upgrades).toContainText("壳面吸附2.00×");
  await expect(technology.locator(".technology-node").filter({ hasText: "壳面吸附效率" })).toHaveClass(/technology-node--complete/);
  await page.screenshot({ path: "artifacts/qa/technology-upgrades-1440.png", fullPage: true });

  await page.getByLabel("关闭科技树").click();
  await page.locator('.react-flow__node[data-id="upgrade_station"] .station-node').evaluate((element: HTMLElement) => element.click());
  const inspector = page.locator(".inspector-panel");
  await expect(inspector).toContainText("单机载荷50 件/架");
  await expect(inspector).toContainText("最低启航货量25 件/架");
  await expect(inspector).toContainText("额定航程4.0 秒");
  await page.locator('.react-flow__node[data-id="upgrade_receiver"] .machine-node').evaluate((element: HTMLElement) => element.click());
  await expect(inspector).toContainText("额定接收12000 kW");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("打开科技树").click();
  await expect(upgrades).toBeVisible();
  await expect.poll(async () => technology.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/qa/technology-upgrades-390.png", fullPage: true });
});

test("planetary drones, orbital collection, station warpers and sorter upgrades form a complete logistics layer", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCompleteLogisticsGame(page);
  await page.locator(".react-flow__controls-fitview").click();

  const localDemand = page.locator(".station-node").filter({ hasText: "行星物流站" }).filter({ hasText: "需求" });
  await localDemand.click();
  const inspector = page.locator(".inspector-panel");
  await expect(inspector).toContainText("运输机泊位");
  await expect(inspector.locator(".station-fleet-stepper strong")).toContainText("2 / 50");
  await page.getByLabel("继续模拟").click();
  await expect.poll(async () => Number(await localDemand.getByTitle("拿取铁块").locator("strong").textContent()), { timeout: 4_000 }).toBeGreaterThanOrEqual(50);

  const hydrogenDemand = page.locator(".station-node").filter({ hasText: "星际物流站" });
  await hydrogenDemand.click();
  await expect(inspector).toContainText("翘曲器仓");
  await expect(inspector).toContainText("2 / 50");
  await expect.poll(async () => Number(await hydrogenDemand.getByTitle("拿取氢").locator("strong").textContent()), { timeout: 4_000 }).toBeGreaterThanOrEqual(10);
  await page.screenshot({ path: "artifacts/qa/complete-logistics-home-1440.png", fullPage: true });

  await page.locator(".react-flow__edge").click();
  await expect(inspector).toContainText("分拣器等级");
  await inspector.getByRole("button", { name: "升级分拣器 ×1" }).click();
  await expect(inspector).toContainText("Mk.II");
  await expect(inspector).toContainText("6/s");

  await page.getByTitle("切换到苍岚 III").click();
  const collector = page.locator(".station-node").filter({ hasText: "轨道采集器" });
  await collector.click();
  await expect(inspector).toContainText("气态巨星轨道设施");
  await expect(inspector).toContainText("采集资源");
  await expect(inspector).toContainText("轨道采集氢中");
  await page.screenshot({ path: "artifacts/qa/orbital-collector-1440.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(inspector).toBeVisible();
  await expect.poll(async () => inspector.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(page.getByLabel("行星切换").getByRole("button")).toHaveCount(3);
  await page.screenshot({ path: "artifacts/qa/orbital-collector-390.png", fullPage: true });
});

test("multi-slot stations and monitored stacked lines stay operable on desktop and mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCompleteLogisticsGame(page);
  await page.locator(".react-flow__controls-fitview").click();
  const demand = page.locator(".station-node").filter({ hasText: "行星物流站" }).filter({ hasText: "需求" });
  await demand.click();
  const inspector = page.locator(".station-inspector");
  const slots = inspector.locator(".station-slot");
  await expect(slots).toHaveCount(5);
  await slots.nth(1).getByRole("button", { name: "配置货物" }).click();
  await slots.nth(1).getByLabel("物流槽位 2 物品").selectOption("copper_ingot");
  await slots.nth(1).getByRole("button", { name: "需求", exact: true }).click();
  await slots.nth(1).getByRole("button", { name: "25%", exact: true }).click();
  await expect(inspector).toContainText("已配置槽位2 / 5");
  await page.screenshot({ path: "artifacts/qa/logistics-slots-1440.png", fullPage: true });

  await page.locator(".react-flow__edge").evaluate((element: SVGGElement) => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  const beltInspector = page.locator(".inspector-panel");
  await beltInspector.getByRole("button", { name: "×2", exact: true }).click();
  await beltInspector.getByRole("button", { name: "高", exact: true }).click();
  await beltInspector.getByLabel("启用线路流量监测").check();
  await expect(beltInspector).toContainText("货物堆叠×2");
  await expect(beltInspector).toContainText("累计运输");

  await page.setViewportSize({ width: 390, height: 844 });
  await demand.evaluate((element: HTMLElement) => element.click());
  await expect(inspector).toBeVisible();
  await expect.poll(async () => inspector.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/qa/logistics-slots-390.png", fullPage: true });
});

test("renewables, storage, fusion and artificial stars form a complete energy layer", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCompleteEnergyGame(page);
  await page.locator(".react-flow__controls-fitview").click();
  for (const building of ["太阳能板", "地热发电站", "微型聚变发电站", "人造恒星", "蓄电器", "能量枢纽"]) {
    await expect(page.locator(".construction-item").filter({ hasText: building })).toHaveCount(1);
  }

  const accumulator = page.locator(".power-node").filter({ hasText: "蓄电器" }).filter({ hasNotText: "能量枢纽" });
  await accumulator.click();
  await expect(page.locator(".energy-inspector")).toContainText("45.00 / 90 MJ");
  await expect(page.locator(".energy-meter")).toHaveAttribute("aria-valuenow", "50");

  const exchanger = page.locator(".power-node").filter({ hasText: "能量枢纽" });
  await exchanger.click();
  const inspector = page.locator(".energy-inspector");
  await expect(inspector).toContainText("蓄电器 → 蓄电器（满）");
  await inspector.getByRole("button", { name: "放电", exact: true }).click();
  await expect(inspector).toContainText("蓄电器（满） → 蓄电器");
  await expect(exchanger.getByTitle("投入蓄电器（满）")).toBeVisible();
  await expect(exchanger.getByTitle("拿取蓄电器")).toBeVisible();

  const fusion = page.locator(".power-node").filter({ hasText: "微型聚变发电站" });
  await fusion.click();
  await expect(page.locator(".inspector-content select option")).toHaveCount(2);
  await expect(page.locator(".inspector-content select")).toHaveValue("deuteron_fuel_rod");
  const star = page.locator(".power-node").filter({ hasText: "人造恒星" });
  await star.click();
  await expect(page.locator(".inspector-content select")).toHaveValue("antimatter_fuel_rod");
  await page.screenshot({ path: "artifacts/qa/complete-energy-home-1440.png", fullPage: true });

  await page.getByLabel("打开生产统计").click();
  await page.getByRole("tab", { name: "电力" }).click();
  const powerStatistics = page.locator(".statistics-power");
  await expect(powerStatistics).toContainText("太阳能容量");
  await expect(powerStatistics).toContainText("地热容量");
  await expect(powerStatistics).toContainText("聚变出力");
  await expect(powerStatistics).toContainText("人造恒星");
  await expect(powerStatistics).toContainText("储能水平");
  await page.screenshot({ path: "artifacts/qa/complete-energy-statistics-1440.png", fullPage: true });
  await page.getByLabel("关闭生产统计").click();

  await page.getByLabel("打开科技树").click();
  for (const technology of ["太阳能收集", "能量储存", "地热发电", "可控核聚变", "人造恒星"]) {
    await expect(page.locator(".technology-node").filter({ hasText: technology })).toHaveCount(1);
  }
  await page.getByLabel("关闭科技树").click();

  await page.getByTitle("切换到烬原 II").click();
  await page.locator(".react-flow__controls-fitview").click();
  const geothermal = page.locator(".power-node").filter({ hasText: "地热发电站" });
  await expect(geothermal).toBeVisible();
  await expect(page.locator(".power-node").filter({ hasText: "太阳能板" }).locator(".power-output")).toContainText("540 kW");
  await geothermal.click();
  await page.screenshot({ path: "artifacts/qa/complete-energy-1440.png", fullPage: true });

  await page.getByTitle("切换到澄海 I").click();
  await page.locator(".react-flow__controls-fitview").click();
  await exchanger.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".inspector-panel")).toBeVisible();
  await expect(page.locator(".energy-inspector")).toContainText("能量枢纽");
  await expect(page.locator(".energy-inspector")).toContainText("蓄电器（满） → 蓄电器");
  await expect.poll(async () => page.locator(".inspector-panel").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect.poll(async () => {
    const box = await page.locator(".inspector-panel").boundingBox();
    return box ? Math.ceil(box.x + box.width) : Number.POSITIVE_INFINITY;
  }).toBeLessThanOrEqual(390);
  await expect(page.locator(".game-notice")).toBeHidden({ timeout: 4_000 });
  await page.screenshot({ path: "artifacts/qa/complete-energy-390.png", fullPage: true });
});

test("rare resources, fractionation and quantum chemistry expose every alternative chain", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRareResourceStageGame(page);
  await page.locator(".react-flow__controls-fitview").click();

  const fractionator = page.locator(".machine-node").filter({ hasText: "分馏塔" });
  await expect(fractionator.getByTitle("取出氢")).toBeVisible();
  await expect(fractionator.getByTitle("拿取氢")).toBeVisible();
  await expect(fractionator.getByTitle("拿取氘")).toBeVisible();

  const chemical = page.locator(".machine-node").filter({ hasText: "可燃冰裂解" });
  await expect(chemical.getByTitle("取出可燃冰")).toBeVisible();
  await expect(chemical.getByTitle("拿取石墨烯")).toBeVisible();
  await chemical.click();
  const inspector = page.locator(".inspector-content");
  await expect(inspector.getByTitle("升级为量子化工厂")).toBeVisible();
  await inspector.getByTitle("升级为量子化工厂").click();
  await expect(chemical).toContainText("量子化工厂");
  await expect(chemical).toContainText("可燃冰裂解");

  const thermal = page.locator(".power-node").filter({ hasText: "火力发电厂" });
  await thermal.click();
  await expect(page.locator(".inspector-content select")).toHaveValue("hydrogen_fuel_rod");
  await expect(page.locator(".inspector-content select option").filter({ hasText: "氢燃料棒" })).toHaveCount(1);
  await page.screenshot({ path: "artifacts/qa/rare-alternatives-home-1440.png", fullPage: true });

  await page.getByLabel("打开配方图鉴").click();
  const codex = page.getByRole("dialog", { name: "配方图鉴" });
  await codex.getByLabel("搜索配方物品").fill("石墨烯");
  await codex.locator(".recipe-index > button").filter({ hasText: "石墨烯" }).click();
  await expect(codex.locator(".recipe-method").filter({ hasText: "可燃冰裂解" })).toContainText("可燃冰");
  await expect(codex.locator(".recipe-method").filter({ hasText: "石墨烯" }).first()).toContainText("化工厂");
  await codex.getByLabel("搜索配方物品").fill("有机晶体");
  await codex.locator(".recipe-index > button").filter({ hasText: "有机晶体" }).click();
  await expect(codex.locator(".recipe-method--source")).toContainText("烬原 II");
  await expect(codex.locator(".recipe-section").first().locator(".recipe-method:not(.recipe-method--source)").filter({ hasText: "有机晶体" })).toContainText("塑料");
  await page.screenshot({ path: "artifacts/qa/rare-recipe-codex-1440.png", fullPage: true });
  await page.getByLabel("关闭配方图鉴").click();

  await page.getByLabel("打开科技树").click();
  for (const technology of ["流体分馏", "稀有资源利用", "量子化工"]) {
    await expect(page.locator(".technology-node").filter({ has: page.getByText(technology, { exact: true }) })).toHaveCount(1);
  }
  await page.getByLabel("关闭科技树").click();

  await page.getByTitle("切换到烬原 II").click();
  await page.locator(".react-flow__controls-fitview").click();
  for (const resource of ["金伯利矿石", "分形硅石", "有机晶体"]) {
    await expect(page.locator(".vein-node").filter({ hasText: resource })).toHaveCount(1);
  }

  await page.getByLabel("打开星图").click();
  await page.getByRole("dialog", { name: "星图" }).locator(".star-system-card").filter({ has: page.getByText("北冕座", { exact: true }) }).getByRole("button", { name: /霜原 I/ }).click();
  await page.locator(".react-flow__controls-fitview").click();
  for (const resource of ["光栅石", "刺笋结晶", "可燃冰"]) {
    await expect(page.locator(".vein-node").filter({ hasText: resource })).toHaveCount(1);
  }
  await page.screenshot({ path: "artifacts/qa/rare-resource-field-1440.png", fullPage: true });

  await page.getByLabel("打开星图").click();
  await page.getByRole("dialog", { name: "星图" }).locator(".star-system-card").filter({ hasText: "赫卡忒" }).getByRole("button", { name: /极夜 I/ }).click();
  await page.locator(".react-flow__controls-fitview").click();
  await expect(page.locator(".vein-node").filter({ hasText: "单极磁石" })).toHaveCount(1);

  await page.getByLabel("打开星图").click();
  await page.getByRole("dialog", { name: "星图" }).locator(".star-system-card").filter({ hasText: "赫利俄斯" }).getByRole("button", { name: /苍岚 III/ }).click();
  const collector = page.locator(".station-node").filter({ hasText: "轨道采集器" });
  await collector.click();
  await expect(page.locator(".station-inspector select")).toHaveValue("fire_ice");
  await expect(collector.getByTitle("拿取可燃冰")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".station-inspector select option").filter({ hasText: "可燃冰" })).toHaveCount(1);
  await expect.poll(async () => {
    const box = await page.locator(".inspector-panel").boundingBox();
    return box ? Math.ceil(box.x + box.width) : Number.POSITIVE_INFINITY;
  }).toBeLessThanOrEqual(390);
  await expect(page.locator(".game-notice")).toBeHidden({ timeout: 4_000 });
  await page.screenshot({ path: "artifacts/qa/rare-orbital-collector-390.png", fullPage: true });
});

test("stellar exploration unlocks remote planets and enables a warped logistics route", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStellarExplorationGame(page);
  await page.getByTitle("拿取钛块").click();
  await expect(page.locator(".cargo-slot")).toContainText("钛块");

  await page.getByLabel("打开星图").click();
  const starMap = page.getByRole("dialog", { name: "星图" });
  await expect(starMap.locator(".star-system-card")).toHaveCount(3);
  const borealis = starMap.locator(".star-system-card").filter({ has: page.getByText("北冕座", { exact: true }) });
  const neutron = starMap.locator(".star-system-card").filter({ has: page.getByText("赫卡忒", { exact: true }) });
  await expect(borealis).toContainText("未勘探");
  await expect(neutron.getByRole("button", { name: "勘探赫卡忒" })).toBeDisabled();

  await borealis.getByRole("button", { name: "勘探北冕座" }).click();
  await expect(borealis).toContainText("已发现");
  await expect(neutron.getByRole("button", { name: "勘探赫卡忒" })).toBeEnabled();
  await neutron.getByRole("button", { name: "勘探赫卡忒" }).click();
  await expect(neutron).toContainText("已发现");
  await page.screenshot({ path: "artifacts/qa/stellar-map-1440.png", fullPage: true });

  await borealis.getByRole("button", { name: /霜原 I/ }).click();
  await expect(page.locator(".canvas-status")).toContainText("霜原 I");
  await expect(page.locator(".vein-node").filter({ hasText: "光栅石" })).toBeVisible();
  await expect(page.locator(".cargo-slot")).toContainText("钛块");
  await expect(page.locator(".game-notice")).toContainText("托钛天王");

  await page.getByLabel("继续模拟").click();
  const supply = page.locator(".station-node").filter({ hasText: "星际物流站" });
  await supply.click();
  const tripRow = page.locator(".station-inspector .metric-ledger > div").filter({ hasText: "完成航次" });
  await expect(tripRow).toContainText("1", { timeout: 3_000 });
  await expect(page.locator(".station-inspector")).toContainText("跨恒星");
  await page.screenshot({ path: "artifacts/qa/stellar-frost-route-1440.png", fullPage: true });

  await page.getByLabel("打开星图").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(starMap).toBeVisible();
  await expect(starMap.locator(".star-map-route").evaluate((element) => element.scrollWidth <= element.clientWidth)).resolves.toBe(true);
  await expect(starMap.locator(".star-system-card")).toHaveCount(3);
  await page.screenshot({ path: "artifacts/qa/stellar-map-390.png", fullPage: true });
});

test("box selection copies, pastes, moves and upgrades a production blueprint", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBlueprintStageGame(page);
  const source = page.locator(".machine-node").filter({ hasText: "电路板" }).first();
  const target = page.locator(".machine-node").filter({ hasText: "处理器" }).first();

  const boxSelect = async () => {
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    expect(sourceBox).not.toBeNull();
    expect(targetBox).not.toBeNull();
    await page.getByLabel("框选模式").click();
    const left = Math.min(sourceBox!.x, targetBox!.x) - 12;
    const top = Math.min(sourceBox!.y, targetBox!.y) - 12;
    const right = Math.max(sourceBox!.x + sourceBox!.width, targetBox!.x + targetBox!.width) + 12;
    const bottom = Math.max(sourceBox!.y + sourceBox!.height, targetBox!.y + targetBox!.height) + 12;
    await page.mouse.move(right, bottom);
    await page.mouse.down();
    await page.mouse.move(left, top, { steps: 14 });
    await page.mouse.up();
    await expect(page.locator(".react-flow__node.selected")).toHaveCount(2);
    await expect(page.getByRole("toolbar", { name: "选区操作" })).toContainText("2");
  };

  await boxSelect();
  await page.getByLabel("复制所选为蓝图").click();
  await expect(page.locator(".blueprint-placement-cursor")).toContainText("蓝图 01");
  await page.locator(".react-flow__pane").click({ position: { x: 700, y: 100 } });
  await expect(page.locator(".machine-node")).toHaveCount(4);
  await expect(page.locator(".react-flow__edge")).toHaveCount(2);
  await expect(page.locator(".game-notice")).toContainText("部署完成");

  await page.getByLabel("打开蓝图库").click();
  const library = page.getByRole("dialog", { name: "蓝图库" });
  await expect(library.locator(".blueprint-card")).toHaveCount(1);
  await expect(library.locator(".blueprint-card")).toContainText("2 节点 · 1 线路");
  await expect(library.locator(".blueprint-requirements")).toContainText("制造台 Mk.I 0/2");
  const nameInput = library.locator(".blueprint-card input");
  await nameInput.fill("处理器模块");
  await nameInput.press("Enter");
  await expect(nameInput).toHaveValue("处理器模块");
  await page.screenshot({ path: "artifacts/qa/blueprint-library-1440.png", fullPage: true });
  await page.getByLabel("关闭蓝图库").click();

  await boxSelect();
  const targetBeforeMove = await target.boundingBox();
  const sourceHeader = source.locator(".factory-node__header");
  const sourceHeaderBox = await sourceHeader.boundingBox();
  await page.mouse.move(sourceHeaderBox!.x + 50, sourceHeaderBox!.y + 18);
  await page.mouse.down();
  await page.mouse.move(sourceHeaderBox!.x + 130, sourceHeaderBox!.y + 68, { steps: 10 });
  await page.mouse.up();
  const targetAfterMove = await target.boundingBox();
  expect(targetAfterMove!.x).toBeGreaterThan(targetBeforeMove!.x + 55);
  expect(targetAfterMove!.y).toBeGreaterThan(targetBeforeMove!.y + 30);

  await page.getByLabel("批量升级所选设备").click();
  await expect(page.locator(".machine-node").filter({ hasText: "制造台 Mk.II" })).toHaveCount(2);
  await page.screenshot({ path: "artifacts/qa/blueprint-batch-upgrade-1440.png", fullPage: true });

  await page.getByLabel("打开蓝图库").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(library).toBeVisible();
  await expect.poll(async () => library.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(library.locator(".blueprint-card input")).toHaveValue("处理器模块");
  await page.screenshot({ path: "artifacts/qa/blueprint-library-390.png", fullPage: true });
});

test("blueprint transforms, recipe parameters and missing-stock construction queue stay persistent", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBlueprintStageGame(page);
  const nodes = page.locator(".machine-node");
  await nodes.nth(0).click();
  await nodes.nth(1).click({ modifiers: ["Shift"] });
  await page.getByLabel("复制所选为蓝图").click();
  await page.locator(".react-flow__pane").click({ position: { x: 690, y: 120 } });
  await page.getByLabel("打开蓝图库").click();
  const library = page.getByRole("dialog", { name: "蓝图库" });
  const card = library.locator(".blueprint-card");
  await card.getByRole("button", { name: "90°", exact: true }).click();
  await card.getByRole("button", { name: "水平镜像" }).click();
  await expect(card).toContainText("配方参数");
  await expect(card.getByRole("button", { name: "排队部署" })).toBeEnabled();
  await card.getByRole("button", { name: "排队部署" }).click();
  await page.locator(".react-flow__pane").click({ position: { x: 620, y: 500 }, force: true });
  await expect(page.locator(".game-notice")).toContainText("已加入施工队列");
  await page.getByLabel("打开蓝图库").click();
  await expect(library.locator(".construction-queue-panel")).toContainText("待建队列");
  await expect(library.locator(".construction-queue-panel")).toContainText("90° · 镜像");
  await page.waitForTimeout(220);
  await page.screenshot({ path: "artifacts/qa/blueprint-queue-1440.png", fullPage: true });
  await library.locator(".construction-queue-panel").getByRole("button", { name: /取消.*施工订单/ }).click();
  await expect(library.locator(".construction-queue-panel")).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => library.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/qa/blueprint-transform-390.png", fullPage: true });
});

test("industrial planner creates a recursive target and remains usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCompleteEnergyGame(page);
  await page.getByLabel("打开生产统计").click();
  const workspace = page.getByRole("dialog", { name: "生产统计" });
  await workspace.getByRole("tab", { name: /规划/ }).click();
  await workspace.getByLabel("目标物品").selectOption("magnetic_coil");
  await workspace.getByLabel("目标产量").fill("120");
  await workspace.getByRole("button", { name: "新建方案" }).click();
  await expect(workspace.locator(".planning-summary-band")).toContainText("理论设备");
  await expect(workspace.locator(".planning-requirements")).toContainText("磁线圈");
  await expect(workspace.locator(".planning-requirements")).toContainText("磁铁");
  await expect(workspace.locator(".planning-requirements")).toContainText("铜块");
  await expect(workspace.locator(".planning-history")).toContainText("等待采样");
  await page.screenshot({ path: "artifacts/qa/production-planner-1440.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(workspace).toBeVisible();
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/qa/production-planner-390.png", fullPage: true });
});

test("canvas placement supports toolbar and keyboard undo redo", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBlueprintStageGame(page);
  await page.getByTitle("部署制造台 Mk.I", { exact: true }).click();
  await page.locator(".react-flow__pane").click({ position: { x: 700, y: 100 } });
  await expect(page.locator(".machine-node")).toHaveCount(3);

  await page.getByLabel("撤销").click();
  await expect(page.locator(".machine-node")).toHaveCount(2);
  await expect(page.getByLabel("重做")).toBeEnabled();

  await page.keyboard.press("Control+Shift+Z");
  await expect(page.locator(".machine-node")).toHaveCount(3);
  await expect(page.locator(".game-notice")).toContainText("已重做");
});

test("operations center diagnoses equipment and records achievement progress", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openOperationsStageGame(page);
  await page.getByLabel("打开运营中心").click();
  const operations = page.getByRole("dialog", { name: "运营中心" });
  await expect(operations).toBeVisible();

  const minerAlert = operations.locator(".alert-row").filter({ hasText: "铁矿石" });
  await expect(minerAlert).toContainText("电网断电");
  await expect(minerAlert).toContainText("澄海 I");
  await page.screenshot({ path: "artifacts/qa/operations-alerts-1440.png", fullPage: true });

  await minerAlert.click();
  await expect(operations).not.toBeVisible();
  const selectedMiner = page.locator('.react-flow__node[data-id="operations_iron"] .factory-node');
  await expect(selectedMiner).toHaveClass(/factory-node--selected/);
  await expect(page.locator(".inspector-panel")).toContainText("电网断电");
  await expect.poll(async () => {
    const nodeBounds = await selectedMiner.boundingBox();
    const canvasBounds = await page.locator(".factory-canvas").boundingBox();
    if (!nodeBounds || !canvasBounds) return false;
    const nodeCenter = nodeBounds.x + nodeBounds.width / 2;
    const canvasCenter = canvasBounds.x + canvasBounds.width / 2;
    return Math.abs(nodeCenter - canvasCenter) < 90;
  }).toBe(true);

  await page.getByLabel("打开运营中心").click();
  await operations.locator(".operations-tabs").getByRole("tab", { name: /成就/ }).click();
  await expect(operations.locator(".achievement-row").filter({ hasText: "第一镐" })).toHaveClass(/achievement-row--complete/);
  await expect(operations.locator(".achievement-row").filter({ hasText: "自动化开端" })).toHaveClass(/achievement-row--complete/);
  await expect(operations.locator(".achievement-row").filter({ hasText: "蓝色火花" })).toHaveClass(/achievement-row--complete/);
});

test("operations settings and local save slots persist across reload", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openOperationsStageGame(page);
  await page.getByLabel("打开运营中心").click();
  let operations = page.getByRole("dialog", { name: "运营中心" });
  await operations.locator(".operations-tabs").getByRole("tab", { name: "设置" }).click();
  await operations.getByRole("button", { name: "4×" }).click();
  await operations.locator(".setting-row").filter({ hasText: "性能模式" }).click();
  await operations.locator(".setting-row").filter({ hasText: "减少动态效果" }).click();
  await operations.locator(".setting-row").filter({ hasText: "操作音效" }).click();
  await operations.getByRole("button", { name: "30 秒" }).click();
  await expect(page.locator(".game-shell")).toHaveAttribute("data-performance-mode", "true");
  await expect(page.locator(".game-shell")).toHaveAttribute("data-reduced-motion", "true");

  await page.waitForTimeout(700);
  await operations.locator(".operations-tabs").getByRole("tab", { name: "存档" }).click();
  await operations.getByRole("button", { name: "立即保存" }).click();
  const elapsedSeconds = await page.evaluate(() => JSON.parse(window.localStorage.getItem("dsp-idle-network.save.v1")!).state.elapsedSeconds as number);
  expect(elapsedSeconds).toBeGreaterThan(1.5);

  await operations.getByLabel("保存到槽位 1").click();
  await expect(operations.locator(".save-slot").filter({ hasText: "本地槽位 1" })).toHaveClass(/save-slot--occupied/);
  const downloadPromise = page.waitForEvent("download");
  await operations.getByRole("button", { name: "导出 JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^dsp-idle-save-.*\.json$/);
  await page.screenshot({ path: "artifacts/qa/operations-saves-1440.png", fullPage: true });

  await page.reload();
  await expect(page.locator(".game-shell")).toHaveAttribute("data-performance-mode", "true");
  await expect(page.locator(".game-shell")).toHaveAttribute("data-reduced-motion", "true");
  await page.getByLabel("打开运营中心").click();
  operations = page.getByRole("dialog", { name: "运营中心" });
  await operations.locator(".operations-tabs").getByRole("tab", { name: "设置" }).click();
  await expect(operations.locator(".setting-row").filter({ hasText: "性能模式" }).locator('input[type="checkbox"]')).toBeChecked();
  await expect(operations.locator(".setting-row").filter({ hasText: "减少动态效果" }).locator('input[type="checkbox"]')).toBeChecked();
  await expect(operations.locator(".setting-row").filter({ hasText: "操作音效" }).locator('input[type="checkbox"]')).toBeChecked();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => operations.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/qa/operations-settings-390.png", fullPage: true });
});

test("offline report summarizes production before entering the factory", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openOfflineStageGame(page);
  const report = page.getByRole("dialog", { name: "离线结算报告" });
  await expect(report).toBeVisible();
  await expect(report.locator(".offline-runtime")).toContainText("秒");
  await expect(report.locator(".offline-production-list")).toContainText("铁矿石");
  await expect(report.locator(".offline-production-list").getByText(/^\+\d+/).first()).toBeVisible();
  await page.screenshot({ path: "artifacts/qa/offline-report-1440.png", fullPage: true });
  await report.getByRole("button", { name: "确认结算" }).click();
  await expect(report).not.toBeVisible();
});

test("running equipment uses semantic animation and reduced motion disables it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openOfflineStageGame(page);
  await page.getByRole("dialog", { name: "离线结算报告" }).getByRole("button", { name: "确认结算" }).click();
  await page.locator(".react-flow__controls-fitview").click();
  const runningNode = page.locator(".factory-node--status-running").first();
  await expect(runningNode).toBeVisible();
  await expect(runningNode.locator(".work-cycle--active")).toBeVisible();
  await expect.poll(async () => runningNode.evaluate((element) => getComputedStyle(element, "::after").animationName)).toContain("factory-node-scan");
  await expect.poll(async () => runningNode.locator(".work-cycle--active > i").evaluate((element) => getComputedStyle(element, "::after").animationName)).toContain("factory-cycle-sheen");
  await page.screenshot({ path: "artifacts/qa/animation-feedback-1440.png", fullPage: true });

  await page.getByLabel("打开运营中心").click();
  const operations = page.getByRole("dialog", { name: "运营中心" });
  await operations.locator(".operations-tabs").getByRole("tab", { name: "设置" }).click();
  await operations.locator(".setting-row").filter({ hasText: "减少动态效果" }).click();
  await operations.getByLabel("关闭运营中心").click();
  const durationMs = await runningNode.evaluate((element) => {
    const value = getComputedStyle(element, "::after").animationDuration;
    return value.endsWith("ms") ? Number.parseFloat(value) : Number.parseFloat(value) * 1000;
  });
  expect(durationMs).toBeLessThanOrEqual(0.02);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".react-flow__controls-fitview").click();
  await expect(page.locator(".factory-canvas").evaluate((element) => element.scrollWidth <= element.clientWidth)).resolves.toBe(true);
  await page.screenshot({ path: "artifacts/qa/animation-feedback-390.png", fullPage: true });
});

test("placement preview, selection focus and keyboard recycle keep canvas work direct", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await freshGame(page);
  await page.getByTitle("部署风力涡轮机").click();
  const canvas = page.locator(".react-flow__pane");
  const canvasBounds = await canvas.boundingBox();
  await page.mouse.move(canvasBounds!.x + canvasBounds!.width * 0.72, canvasBounds!.y + 230);
  const preview = page.locator(".building-placement-cursor");
  await expect(preview).toContainText("风力涡轮机");
  await expect(preview).toContainText("×1");
  await page.screenshot({ path: "artifacts/qa/interaction-placement-1440.png", fullPage: true });

  await canvas.click({ position: { x: Math.round(canvasBounds!.width * 0.72), y: 230 } });
  await expect(preview).not.toBeVisible();
  const turbine = page.locator(".power-node").filter({ hasText: "风力涡轮机" });
  await turbine.click();
  await page.getByLabel("定位到所选设备").click();
  await expect.poll(async () => {
    const nodeBounds = await turbine.boundingBox();
    const visibleCanvas = await page.locator(".factory-canvas").boundingBox();
    if (!nodeBounds || !visibleCanvas) return false;
    return Math.abs(nodeBounds.x + nodeBounds.width / 2 - (visibleCanvas.x + visibleCanvas.width / 2)) < 90;
  }).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("toolbar", { name: "选区操作" })).toBeVisible();
  await page.getByLabel("打开检查器").click();
  await expect.poll(async () => page.locator(".inspector-panel").evaluate((element) =>
    element.getBoundingClientRect().left >= window.innerWidth - 1)).toBe(true);
  await page.getByLabel("定位到所选设备").click();
  await expect.poll(async () => {
    const bounds = await turbine.boundingBox();
    return Boolean(bounds && Math.abs(bounds.x + bounds.width / 2 - 195) < 70);
  }).toBe(true);
  await expect.poll(async () => page.evaluate(() => [
    ".game-header",
    '[role="toolbar"][aria-label="选区操作"]',
    ".construction-dock",
  ].filter((selector) => {
    const bounds = document.querySelector(selector)?.getBoundingClientRect();
    return !bounds || bounds.left < -1 || bounds.right > window.innerWidth + 1;
  }))).toEqual([]);
  await page.screenshot({ path: "artifacts/qa/interaction-selection-390.png", fullPage: true });
  await page.keyboard.press("Delete");
  await expect(turbine).not.toBeVisible();
  await expect(page.getByTitle("部署风力涡轮机")).toContainText("×3");
  await expect(page.locator(".game-notice")).toContainText("已回收 1 个所选设备");
});

test("large workspaces load on demand with polished desktop and mobile hierarchy", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTechnologyUpgradeGame(page);
  const technologyModuleLoaded = () => page.evaluate(() => performance.getEntriesByType("resource")
    .some((entry) => entry.name.includes("TechnologyWorkspace")));
  expect(await technologyModuleLoaded()).toBe(false);

  await page.getByLabel("打开科技树").click();
  const technology = page.getByRole("dialog", { name: "科技树" });
  await expect(technology).toBeVisible();
  await expect.poll(technologyModuleLoaded).toBe(true);
  await expect(technology.locator(".technology-upgrade-overview")).toBeVisible();
  await page.waitForTimeout(220);
  await page.screenshot({ path: "artifacts/qa/frontend-polish-1440.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => technology.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(technology.locator(".technology-upgrade-overview")).toBeVisible();
  await page.screenshot({ path: "artifacts/qa/frontend-polish-390.png", fullPage: true });
});

test("workspace hierarchy filters construction, collapses rails and adapts detail level", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await freshGame(page);
  const canvas = page.locator(".factory-canvas");
  const canvasBefore = await canvas.boundingBox();

  const category = page.getByLabel("施工托盘分类");
  await expect(category).toHaveValue("all");
  await category.selectOption("power");
  await expect(page.getByTitle("部署风力涡轮机")).toBeVisible();
  await expect(page.getByTitle("部署电弧熔炉")).toHaveCount(0);
  await category.selectOption("all");

  await page.getByLabel("折叠物资侧栏").click();
  await expect(page.locator(".resource-rail")).toBeHidden();
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBeGreaterThan(canvasBefore!.width + 180);
  await page.getByLabel("展开物资侧栏").click();
  await expect(page.locator(".resource-rail")).toBeVisible();

  const vein = page.locator(".vein-node").first();
  const nodeHeight = await vein.evaluate((element) => (element as HTMLElement).offsetHeight);
  for (let index = 0; index < 4; index += 1) await page.locator(".react-flow__controls-zoomout").click();
  await expect(page.locator(".game-shell")).toHaveAttribute("data-zoom-lod", "compact");
  await expect(vein.locator(".manual-mine")).toHaveCSS("opacity", "0.12");
  await expect.poll(async () => vein.evaluate((element) => (element as HTMLElement).offsetHeight)).toBe(nodeHeight);

  await page.getByLabel("打开主线任务中心").first().click();
  const firstChapter = page.locator(".campaign-chapter").first();
  await firstChapter.locator(".campaign-chapter-header").click();
  await expect(firstChapter.locator(".campaign-chapter-header")).toHaveAttribute("aria-expanded", "false");
  await expect(firstChapter.locator(".campaign-task-list")).toHaveCount(0);
});

test("sub-360 header moves workspaces into an overflow menu", async ({ page }) => {
  await page.setViewportSize({ width: 350, height: 760 });
  await freshGame(page);
  await expect(page.getByLabel("更多工作区")).toBeVisible();
  await expect(page.getByLabel("打开科技树")).toBeHidden();
  await page.getByLabel("更多工作区").click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "科技树" }).click();
  await expect(page.getByRole("dialog", { name: "科技树" })).toBeVisible();
});

test("performance mode keeps a 500-device 1000-line factory responsive", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStressStageGame(page);
  const shell = page.locator(".game-shell");
  await expect(shell).toHaveAttribute("data-performance-mode", "true");
  await expect.poll(async () => shell.getAttribute("data-simulation-worker")).toBe("active");

  const renderedNodes = await page.locator(".react-flow__node").count();
  expect(renderedNodes).toBeGreaterThan(0);
  expect(renderedNodes).toBeLessThan(120);
  const frameLatency = await page.evaluate(() => new Promise<number>((resolve) => {
    const started = performance.now();
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - started)));
  }));
  expect(frameLatency).toBeLessThan(500);

  const pane = page.locator(".react-flow__pane");
  const paneBounds = await pane.boundingBox();
  await placeOnCanvas(page, "部署风力涡轮机", Math.round(paneBounds!.width * 0.72), Math.round(paneBounds!.height * 0.7));
  await expect(page.locator(".power-node")).toHaveCount(1);
  await page.waitForTimeout(650);
  await expect(page.locator(".power-node")).toHaveCount(1);
  await page.screenshot({ path: "artifacts/qa/stress-factory-1440.png", fullPage: true });
});

test("campaign center shows chapter progress, deficits and direct recipe navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await freshGame(page);
  await page.getByLabel("打开主线任务中心").first().click();
  const campaign = page.getByRole("dialog", { name: "主线任务中心" });
  await expect(campaign).toBeVisible();
  await expect(campaign).toContainText("母星点火");
  await expect(campaign).toContainText("采集第一份矿石");
  await expect(campaign.locator(".campaign-deficits").first()).toContainText("缺少");
  await campaign.getByRole("button", { name: "查看铁矿石配方" }).click();
  const recipes = page.getByRole("dialog", { name: "配方图鉴" });
  await expect(recipes).toBeVisible();
  await expect(recipes.locator(".recipe-item-header")).toContainText("铁矿石");
  await recipes.getByLabel("关闭配方图鉴").click();
  await page.getByLabel("打开主线任务中心").first().click();
  await expect(page.getByRole("dialog", { name: "主线任务中心" })).toBeVisible();
  await page.waitForTimeout(220);
  await page.screenshot({ path: "artifacts/qa/campaign-center-1440.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => campaign.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/qa/campaign-center-390.png", fullPage: true });
});

test("campaign migration preserves legacy inventory while restoring task progress", async ({ page }) => {
  await freshGame(page);
  await page.reload();
  await page.evaluate(() => window.dispatchEvent(new Event("beforeunload")));
  await page.evaluate(() => {
    const raw = window.localStorage.getItem("dsp-idle-network.save.v1");
    const envelope = JSON.parse(raw!);
    envelope.state.version = 17;
    envelope.state.paused = true;
    envelope.state.manualMined = 1;
    delete envelope.state.campaign;
    window.localStorage.setItem("dsp-idle-network.save.v1", JSON.stringify(envelope));
  });
  await page.reload();
  await page.getByLabel("打开主线任务中心").first().click();
  const campaign = page.getByRole("dialog", { name: "主线任务中心" });
  await expect(campaign).toContainText("铸造基础铁块");
  await expect(page.locator(".construction-item").filter({ hasText: "传送带 Mk.I" }).first()).toContainText("×10");
});

test("galaxy endgame campaign routes into the console and difficulty controls stay accessible", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCampaignEndgameStageGame(page);
  await page.getByLabel("打开主线任务中心").first().click();
  const campaign = page.getByRole("dialog", { name: "主线任务中心" });
  await expect(campaign).toContainText("银河终局");
  await expect(campaign).toContainText("启动无限科研");
  await campaign.getByRole("button", { name: "打开银河工业控制台" }).first().click();
  const statistics = page.getByRole("dialog", { name: "生产统计" });
  await expect(statistics).toBeVisible();
  await expect(statistics.getByRole("tab", { name: /银河/ })).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("Escape");
  await expect(statistics).toHaveCount(0);
  await page.getByLabel("打开运营中心").click();
  const operations = page.getByRole("dialog", { name: "运营中心" });
  await operations.getByRole("tab", { name: "设置" }).click();
  await expect(operations).toContainText("工业难度");
  await operations.getByRole("button", { name: "高压" }).click();
  await expect(operations.getByRole("button", { name: "高压" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Space");
  await expect(page.getByLabel("暂停模拟")).toBeVisible();
});
