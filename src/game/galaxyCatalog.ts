import type {
  ItemAmount,
  ItemId,
  PlanetId,
  PlanetOceanType,
  PlanetSpecialization,
  PlanetTemplateId,
  StarClassId,
  StarSystemId,
} from "./types";

export interface PlanetEcologyTemplate {
  id: PlanetTemplateId;
  name: string;
  kind: "terrestrial" | "gas-giant";
  oceanType: PlanetOceanType;
  resourceIds: ItemId[];
  rareResourcePool: ItemId[];
  rareResourceCount: number;
  orbitalYields: Partial<Record<ItemId, number>>;
  windMultiplier: number;
  solarMultiplier: number;
  geothermalMultiplier: number;
  miningMultiplier: number;
  orbitalYieldMultiplier: number;
  reserveScale: number;
  travelTimeMultiplier: number;
  tidalLocked?: boolean;
  specialization: PlanetSpecialization;
  specializationName: string;
  productionSpeedMultiplier: number;
  colonyCost: ItemAmount[];
  surveyDurationSeconds: number;
}

export interface StarClassTemplate {
  id: StarClassId;
  name: string;
  luminosity: number;
  massMultiplier: number;
  radiusMultiplier: number;
}

export const PLANET_TEMPLATES: Record<PlanetTemplateId, PlanetEcologyTemplate> = {
  oceanic: {
    id: "oceanic", name: "温带海洋", kind: "terrestrial", oceanType: "water",
    resourceIds: ["iron_ore", "copper_ore", "stone", "coal", "crude_oil", "water"], rareResourcePool: [], rareResourceCount: 0, orbitalYields: {},
    windMultiplier: 1, solarMultiplier: 1, geothermalMultiplier: 0, miningMultiplier: 1, orbitalYieldMultiplier: 1, reserveScale: 1, travelTimeMultiplier: 1,
    specialization: "balanced", specializationName: "综合工业 · 无偏置", productionSpeedMultiplier: 1, colonyCost: [], surveyDurationSeconds: 0,
  },
  lava: {
    id: "lava", name: "高热熔岩", kind: "terrestrial", oceanType: "sulfuric-acid",
    resourceIds: ["iron_ore", "copper_ore", "stone", "coal", "silicon_ore", "titanium_ore", "sulfuric_acid"],
    rareResourcePool: ["kimberlite_ore", "fractal_silicon", "organic_crystal"], rareResourceCount: 3, orbitalYields: {},
    windMultiplier: 1, solarMultiplier: 1.5, geothermalMultiplier: 1, miningMultiplier: 1.08, orbitalYieldMultiplier: 1, reserveScale: 1.15, travelTimeMultiplier: 1.05,
    specialization: "smelting", specializationName: "高热冶金 · 熔炉 +12%", productionSpeedMultiplier: 1.12,
    colonyCost: [{ itemId: "titanium_ingot", amount: 12 }, { itemId: "steel", amount: 20 }], surveyDurationSeconds: 24,
  },
  ice_field: {
    id: "ice_field", name: "永冻冰原", kind: "terrestrial", oceanType: "ice",
    resourceIds: ["iron_ore", "copper_ore", "titanium_ore", "silicon_ore", "fire_ice"],
    rareResourcePool: ["optical_grating_crystal", "spiniform_stalagmite_crystal"], rareResourceCount: 2, orbitalYields: {},
    windMultiplier: 1.32, solarMultiplier: 0.8, geothermalMultiplier: 0.08, miningMultiplier: 0.92, orbitalYieldMultiplier: 1, reserveScale: 1.28, travelTimeMultiplier: 1.18,
    specialization: "chemical", specializationName: "低温化工 · 化工设备 +12%", productionSpeedMultiplier: 1.12,
    colonyCost: [{ itemId: "titanium_ingot", amount: 2 }], surveyDurationSeconds: 24,
  },
  tidal_locked: {
    id: "tidal_locked", name: "潮汐锁定荒原", kind: "terrestrial", oceanType: "none",
    resourceIds: ["iron_ore", "copper_ore", "titanium_ore", "silicon_ore"], rareResourcePool: ["unipolar_magnet"], rareResourceCount: 1, orbitalYields: {},
    windMultiplier: 0.28, solarMultiplier: 0.45, geothermalMultiplier: 0.18, miningMultiplier: 1.35, orbitalYieldMultiplier: 1, reserveScale: 0.62, travelTimeMultiplier: 1.48,
    tidalLocked: true, specialization: "particle", specializationName: "昼夜临界 · 粒子设备 +18%", productionSpeedMultiplier: 1.18,
    colonyCost: [{ itemId: "space_warper", amount: 4 }, { itemId: "processor", amount: 20 }], surveyDurationSeconds: 42,
  },
  mediterranean: {
    id: "mediterranean", name: "地中海群岛", kind: "terrestrial", oceanType: "water",
    resourceIds: ["iron_ore", "copper_ore", "stone", "coal", "crude_oil", "water"], rareResourcePool: ["organic_crystal"], rareResourceCount: 1, orbitalYields: {},
    windMultiplier: 0.82, solarMultiplier: 1.12, geothermalMultiplier: 0.05, miningMultiplier: 0.96, orbitalYieldMultiplier: 1, reserveScale: 1.08, travelTimeMultiplier: 0.94,
    specialization: "research", specializationName: "稳定气候 · 科研站 +10%", productionSpeedMultiplier: 1.1,
    colonyCost: [{ itemId: "titanium_ingot", amount: 8 }, { itemId: "processor", amount: 4 }], surveyDurationSeconds: 28,
  },
  prairie: {
    id: "prairie", name: "温带草原", kind: "terrestrial", oceanType: "water",
    resourceIds: ["iron_ore", "copper_ore", "stone", "coal", "water"], rareResourcePool: ["organic_crystal", "kimberlite_ore"], rareResourceCount: 1, orbitalYields: {},
    windMultiplier: 1.38, solarMultiplier: 1, geothermalMultiplier: 0.04, miningMultiplier: 1.02, orbitalYieldMultiplier: 1, reserveScale: 1.18, travelTimeMultiplier: 0.96,
    specialization: "logistics", specializationName: "平坦地貌 · 物流设备 +10%", productionSpeedMultiplier: 1.1,
    colonyCost: [{ itemId: "titanium_ingot", amount: 10 }, { itemId: "logistics_drone", amount: 4 }], surveyDurationSeconds: 26,
  },
  savanna: {
    id: "savanna", name: "风暴稀树草原", kind: "terrestrial", oceanType: "water",
    resourceIds: ["iron_ore", "copper_ore", "stone", "coal", "titanium_ore", "water"], rareResourcePool: ["kimberlite_ore", "organic_crystal"], rareResourceCount: 1, orbitalYields: {},
    windMultiplier: 1.75, solarMultiplier: 1.08, geothermalMultiplier: 0.02, miningMultiplier: 0.98, orbitalYieldMultiplier: 1, reserveScale: 1.12, travelTimeMultiplier: 1.08,
    specialization: "balanced", specializationName: "风光互补 · 综合工业 +6%", productionSpeedMultiplier: 1.06,
    colonyCost: [{ itemId: "titanium_alloy", amount: 8 }, { itemId: "logistics_drone", amount: 6 }], surveyDurationSeconds: 30,
  },
  desert: {
    id: "desert", name: "干旱沙漠", kind: "terrestrial", oceanType: "none",
    resourceIds: ["iron_ore", "copper_ore", "stone", "coal", "silicon_ore", "titanium_ore"], rareResourcePool: ["fractal_silicon", "optical_grating_crystal"], rareResourceCount: 1, orbitalYields: {},
    windMultiplier: 0.7, solarMultiplier: 1.42, geothermalMultiplier: 0.12, miningMultiplier: 1.12, orbitalYieldMultiplier: 1, reserveScale: 1.24, travelTimeMultiplier: 1.08,
    specialization: "smelting", specializationName: "干热矿区 · 熔炉 +10%", productionSpeedMultiplier: 1.1,
    colonyCost: [{ itemId: "titanium_alloy", amount: 12 }, { itemId: "processor", amount: 8 }], surveyDurationSeconds: 34,
  },
  arid_canyon: {
    id: "arid_canyon", name: "干旱峡谷", kind: "terrestrial", oceanType: "none",
    resourceIds: ["iron_ore", "stone", "coal", "silicon_ore", "titanium_ore"], rareResourcePool: ["kimberlite_ore", "spiniform_stalagmite_crystal"], rareResourceCount: 1, orbitalYields: {},
    windMultiplier: 1.22, solarMultiplier: 1.28, geothermalMultiplier: 0.22, miningMultiplier: 1.18, orbitalYieldMultiplier: 1, reserveScale: 1.4, travelTimeMultiplier: 1.16,
    specialization: "smelting", specializationName: "深层矿带 · 熔炉 +14%", productionSpeedMultiplier: 1.14,
    colonyCost: [{ itemId: "titanium_alloy", amount: 16 }, { itemId: "logistics_vessel", amount: 2 }], surveyDurationSeconds: 38,
  },
  salt_lake: {
    id: "salt_lake", name: "盐湖干海盆", kind: "terrestrial", oceanType: "none",
    resourceIds: ["iron_ore", "copper_ore", "stone", "silicon_ore", "titanium_ore"], rareResourcePool: ["optical_grating_crystal", "fractal_silicon"], rareResourceCount: 1, orbitalYields: {},
    windMultiplier: 1.1, solarMultiplier: 1.2, geothermalMultiplier: 0.08, miningMultiplier: 1.05, orbitalYieldMultiplier: 1, reserveScale: 1.3, travelTimeMultiplier: 0.98,
    specialization: "chemical", specializationName: "盐化矿床 · 化工设备 +10%", productionSpeedMultiplier: 1.1,
    colonyCost: [{ itemId: "titanium_glass", amount: 8 }, { itemId: "processor", amount: 12 }], surveyDurationSeconds: 36,
  },
  volcanic_ash: {
    id: "volcanic_ash", name: "火山灰荒原", kind: "terrestrial", oceanType: "lava",
    resourceIds: ["iron_ore", "copper_ore", "stone", "coal", "silicon_ore", "titanium_ore"], rareResourcePool: ["kimberlite_ore", "organic_crystal"], rareResourceCount: 1, orbitalYields: {},
    windMultiplier: 0.86, solarMultiplier: 0.92, geothermalMultiplier: 1.45, miningMultiplier: 1.14, orbitalYieldMultiplier: 1, reserveScale: 1.22, travelTimeMultiplier: 1.2,
    specialization: "smelting", specializationName: "地热工业 · 熔炉 +16%", productionSpeedMultiplier: 1.16,
    colonyCost: [{ itemId: "titanium_alloy", amount: 20 }, { itemId: "super_magnetic_ring", amount: 6 }], surveyDurationSeconds: 40,
  },
  crystal_desert: {
    id: "crystal_desert", name: "硅晶荒漠", kind: "terrestrial", oceanType: "none",
    resourceIds: ["iron_ore", "copper_ore", "stone", "silicon_ore", "titanium_ore"],
    rareResourcePool: ["fractal_silicon", "optical_grating_crystal", "spiniform_stalagmite_crystal"], rareResourceCount: 2, orbitalYields: {},
    windMultiplier: 0.62, solarMultiplier: 1.55, geothermalMultiplier: 0.14, miningMultiplier: 1.2, orbitalYieldMultiplier: 1, reserveScale: 1.16, travelTimeMultiplier: 1.22,
    specialization: "particle", specializationName: "晶格材料 · 粒子设备 +15%", productionSpeedMultiplier: 1.15,
    colonyCost: [{ itemId: "quantum_chip", amount: 6 }, { itemId: "space_warper", amount: 6 }], surveyDurationSeconds: 44,
  },
  gas_giant: {
    id: "gas_giant", name: "氢氦气态巨星", kind: "gas-giant", oceanType: "none", resourceIds: [], rareResourcePool: [], rareResourceCount: 0,
    orbitalYields: { hydrogen: 1.1, deuterium: 0.18 }, windMultiplier: 0, solarMultiplier: 0, geothermalMultiplier: 0, miningMultiplier: 1,
    orbitalYieldMultiplier: 1, reserveScale: 1, travelTimeMultiplier: 1.12, specialization: "logistics", specializationName: "轨道气层 · 采集器 +15%",
    productionSpeedMultiplier: 1.15, colonyCost: [], surveyDurationSeconds: 32,
  },
  ice_giant: {
    id: "ice_giant", name: "冰态气态巨星", kind: "gas-giant", oceanType: "none", resourceIds: [], rareResourcePool: [], rareResourceCount: 0,
    orbitalYields: { hydrogen: 0.9, deuterium: 0.16, fire_ice: 0.65 }, windMultiplier: 0, solarMultiplier: 0, geothermalMultiplier: 0, miningMultiplier: 1,
    orbitalYieldMultiplier: 1.12, reserveScale: 1, travelTimeMultiplier: 1.18, specialization: "logistics", specializationName: "冰层环流 · 轨道采集 +18%",
    productionSpeedMultiplier: 1.18, colonyCost: [{ itemId: "titanium_alloy", amount: 10 }, { itemId: "logistics_drone", amount: 5 }], surveyDurationSeconds: 34,
  },
  hydrogen_giant: {
    id: "hydrogen_giant", name: "富氢气态巨星", kind: "gas-giant", oceanType: "none", resourceIds: [], rareResourcePool: [], rareResourceCount: 0,
    orbitalYields: { hydrogen: 1.45, deuterium: 0.32 }, windMultiplier: 0, solarMultiplier: 0, geothermalMultiplier: 0, miningMultiplier: 1,
    orbitalYieldMultiplier: 1.28, reserveScale: 1, travelTimeMultiplier: 1.22, specialization: "logistics", specializationName: "富氢环流 · 轨道采集 +28%",
    productionSpeedMultiplier: 1.28, colonyCost: [{ itemId: "titanium_alloy", amount: 16 }, { itemId: "logistics_vessel", amount: 2 }], surveyDurationSeconds: 38,
  },
  fire_ice_giant: {
    id: "fire_ice_giant", name: "可燃冰冰巨星", kind: "gas-giant", oceanType: "none", resourceIds: [], rareResourcePool: [], rareResourceCount: 0,
    orbitalYields: { hydrogen: 0.8, deuterium: 0.12, fire_ice: 1 }, windMultiplier: 0, solarMultiplier: 0, geothermalMultiplier: 0, miningMultiplier: 1,
    orbitalYieldMultiplier: 1.25, reserveScale: 1, travelTimeMultiplier: 1.24, specialization: "logistics", specializationName: "冰晶环流 · 轨道采集 +25%",
    productionSpeedMultiplier: 1.25, colonyCost: [{ itemId: "titanium_alloy", amount: 10 }, { itemId: "logistics_drone", amount: 5 }], surveyDurationSeconds: 36,
  },
};

export const PLANET_TEMPLATE_POOLS: Record<PlanetId, PlanetTemplateId[]> = {
  home: ["oceanic"], ashen: ["lava"], giant: ["ice_giant"], frost: ["ice_field"], boreal_giant: ["fire_ice_giant"], magnetar: ["tidal_locked"],
  verdant: ["prairie", "oceanic", "savanna"], pelagic: ["mediterranean", "oceanic", "salt_lake"], aurora_giant: ["hydrogen_giant", "gas_giant"],
  dune: ["desert", "arid_canyon", "salt_lake"], cinder: ["volcanic_ash", "lava", "desert"], ember_giant: ["gas_giant", "hydrogen_giant"],
  crystal: ["crystal_desert", "ice_field", "tidal_locked"], prairie: ["savanna", "prairie", "mediterranean"], sirius_giant: ["ice_giant", "hydrogen_giant"],
  salt: ["salt_lake", "desert", "arid_canyon"], obsidian: ["volcanic_ash", "tidal_locked", "lava"], white_giant: ["fire_ice_giant", "ice_giant"],
  tempest: ["savanna", "prairie", "oceanic"], inferno: ["lava", "volcanic_ash", "arid_canyon"], abyss: ["tidal_locked", "ice_field", "crystal_desert"],
  azure_giant: ["hydrogen_giant", "gas_giant", "ice_giant", "fire_ice_giant"],
};

export const STAR_CLASS_TEMPLATES: Record<StarClassId, StarClassTemplate> = {
  g_main: { id: "g_main", name: "G 型主序星", luminosity: 1, massMultiplier: 1, radiusMultiplier: 1 },
  k_dwarf: { id: "k_dwarf", name: "K 型橙矮星", luminosity: 0.62, massMultiplier: 0.78, radiusMultiplier: 0.82 },
  f_main: { id: "f_main", name: "F 型主序星", luminosity: 1.55, massMultiplier: 1.22, radiusMultiplier: 1.18 },
  m_dwarf: { id: "m_dwarf", name: "M 型红矮星", luminosity: 0.26, massMultiplier: 0.42, radiusMultiplier: 0.48 },
  a_main: { id: "a_main", name: "A 型主序星", luminosity: 3.4, massMultiplier: 1.8, radiusMultiplier: 1.65 },
  white_dwarf: { id: "white_dwarf", name: "白矮星", luminosity: 0.72, massMultiplier: 0.88, radiusMultiplier: 0.12 },
  neutron_star: { id: "neutron_star", name: "中子星", luminosity: 0.34, massMultiplier: 1.45, radiusMultiplier: 0.02 },
  o_blue_giant: { id: "o_blue_giant", name: "O 型蓝巨星", luminosity: 7.5, massMultiplier: 5.8, radiusMultiplier: 4.2 },
};

export const SYSTEM_POSITIONS: Record<StarSystemId, { x: number; y: number }> = {
  helios: { x: 0, y: 0 }, borealis: { x: 4.2, y: 0 }, aurora: { x: 8, y: 5 }, ember: { x: 14, y: 7 },
  sirius: { x: 20, y: 4 }, white_dwarf: { x: 18, y: -5 }, neutron: { x: 11.8, y: 0 }, blue_giant: { x: 30, y: 1 },
};
