import { BUILDINGS, ITEMS, RECIPES, TECHNOLOGIES, validateContentCatalog } from "./content";

export const MOD_FORMAT_VERSION = 1;

export interface ModItemDefinition {
  id: string;
  name: string;
  symbol?: string;
  color?: string;
}

export interface ModRecipeAmount {
  itemId: string;
  amount: number;
}

export interface ModRecipeDefinition {
  id: string;
  name: string;
  buildingId: string;
  duration: number;
  requiredTechId?: string;
  inputs: ModRecipeAmount[];
  outputs: ModRecipeAmount[];
}

export interface ModBuildingDefinition {
  id: string;
  name: string;
}

export interface ModTechnologyDefinition {
  id: string;
  name: string;
  prerequisites?: string[];
}

export interface ContentPackManifest {
  formatVersion: number;
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  dependencies?: string[];
  items?: ModItemDefinition[];
  buildings?: ModBuildingDefinition[];
  recipes?: ModRecipeDefinition[];
  technologies?: ModTechnologyDefinition[];
}

export interface ModValidationIssue {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}

export interface ModValidationResult {
  valid: boolean;
  manifest: ContentPackManifest | null;
  issues: ModValidationIssue[];
  counts: { items: number; buildings: number; recipes: number; technologies: number };
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_]{1,63}$/.test(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 120;
}

function amountList(value: unknown): value is ModRecipeAmount[] {
  return Array.isArray(value) && value.length <= 24 && value.every((entry) =>
    isRecord(entry) && validId(entry.itemId) && typeof entry.amount === "number" && Number.isFinite(entry.amount) && entry.amount > 0 && entry.amount <= 1_000_000,
  );
}

function uniqueIds<T extends { id: string }>(entries: T[], path: string, issues: ModValidationIssue[]): Set<string> {
  const ids = new Set<string>();
  entries.forEach((entry, index) => {
    if (ids.has(entry.id)) issues.push({ severity: "error", code: "duplicate-id", path: `${path}[${index}].id`, message: `重复的内容 ID：${entry.id}` });
    ids.add(entry.id);
  });
  return ids;
}

function parseManifest(value: unknown, issues: ModValidationIssue[]): ContentPackManifest | null {
  if (!isRecord(value)) {
    issues.push({ severity: "error", code: "root", path: "$", message: "内容包根节点必须是对象" });
    return null;
  }
  const formatVersion = typeof value.formatVersion === "number" ? Math.floor(value.formatVersion) : 0;
  if (formatVersion !== MOD_FORMAT_VERSION) {
    issues.push({ severity: "error", code: "format-version", path: "$.formatVersion", message: `内容包格式必须为 v${MOD_FORMAT_VERSION}` });
  }
  for (const [key, label] of [["id", "内容包 ID"], ["name", "内容包名称"], ["version", "版本号"]] as const) {
    if (!nonEmpty(value[key])) issues.push({ severity: "error", code: "metadata", path: `$.${key}`, message: `${label}不能为空` });
  }
  if (value.id !== undefined && !validId(value.id)) issues.push({ severity: "error", code: "id-format", path: "$.id", message: "内容包 ID 只能使用小写字母、数字和下划线" });
  const dependencies = value.dependencies === undefined ? [] : value.dependencies;
  if (!Array.isArray(dependencies) || dependencies.length > 32 || !dependencies.every(validId)) {
    issues.push({ severity: "error", code: "dependencies", path: "$.dependencies", message: "依赖必须是最多 32 个合法内容包 ID" });
  }
  const items = Array.isArray(value.items) ? value.items : [];
  const buildings = Array.isArray(value.buildings) ? value.buildings : [];
  const recipes = Array.isArray(value.recipes) ? value.recipes : [];
  const technologies = Array.isArray(value.technologies) ? value.technologies : [];
  if (items.length > 256 || buildings.length > 128 || recipes.length > 512 || technologies.length > 256) {
    issues.push({ severity: "error", code: "size-limit", path: "$", message: "内容包超过单包内容数量上限" });
  }

  const validItems = items.filter(isRecord).flatMap((entry, index) => {
    if (!validId(entry.id) || !nonEmpty(entry.name)) {
      issues.push({ severity: "error", code: "item-shape", path: `$.items[${index}]`, message: "物品需要合法 id 和 name" });
      return [];
    }
    return [{ id: entry.id, name: entry.name.trim().slice(0, 80), ...(typeof entry.symbol === "string" ? { symbol: entry.symbol.slice(0, 8) } : {}), ...(typeof entry.color === "string" ? { color: entry.color.slice(0, 16) } : {}) }];
  });
  const validBuildings = buildings.filter(isRecord).flatMap((entry, index) => {
    if (!validId(entry.id) || !nonEmpty(entry.name)) {
      issues.push({ severity: "error", code: "building-shape", path: `$.buildings[${index}]`, message: "建筑需要合法 id 和 name" });
      return [];
    }
    return [{ id: entry.id, name: entry.name.trim().slice(0, 80) }];
  });
  const validTechnologies = technologies.filter(isRecord).flatMap((entry, index) => {
    if (!validId(entry.id) || !nonEmpty(entry.name)) {
      issues.push({ severity: "error", code: "technology-shape", path: `$.technologies[${index}]`, message: "科技需要合法 id 和 name" });
      return [];
    }
    const prerequisites = entry.prerequisites === undefined ? [] : entry.prerequisites;
    if (!Array.isArray(prerequisites) || !prerequisites.every(validId)) {
      issues.push({ severity: "error", code: "technology-prerequisites", path: `$.technologies[${index}].prerequisites`, message: "科技前置必须是合法 ID 数组" });
    }
    return [{ id: entry.id, name: entry.name.trim().slice(0, 80), prerequisites: Array.isArray(prerequisites) ? prerequisites : [] }];
  });
  const validRecipes = recipes.filter(isRecord).flatMap((entry, index) => {
    if (!validId(entry.id) || !nonEmpty(entry.name) || !validId(entry.buildingId) || typeof entry.duration !== "number" || !Number.isFinite(entry.duration) || entry.duration <= 0 || entry.duration > 86_400 || !amountList(entry.inputs) || !amountList(entry.outputs)) {
      issues.push({ severity: "error", code: "recipe-shape", path: `$.recipes[${index}]`, message: "配方需要合法 id、设备、周期以及输入输出" });
      return [];
    }
    if (entry.requiredTechId !== undefined && !validId(entry.requiredTechId)) issues.push({ severity: "error", code: "recipe-tech", path: `$.recipes[${index}].requiredTechId`, message: "配方科技 ID 无效" });
    return [{ id: entry.id, name: entry.name.trim().slice(0, 80), buildingId: entry.buildingId, duration: entry.duration, ...(entry.requiredTechId ? { requiredTechId: entry.requiredTechId } : {}), inputs: entry.inputs, outputs: entry.outputs }];
  });

  const itemIds = uniqueIds(validItems, "$.items", issues);
  const buildingIds = uniqueIds(validBuildings, "$.buildings", issues);
  const recipeIds = uniqueIds(validRecipes, "$.recipes", issues);
  const technologyIds = uniqueIds(validTechnologies, "$.technologies", issues);
  const coreItems = new Set(Object.keys(ITEMS));
  const coreBuildings = new Set(Object.keys(BUILDINGS));
  const coreRecipes = new Set(Object.keys(RECIPES));
  const coreTechnologies = new Set(Object.keys(TECHNOLOGIES));
  for (const id of itemIds) if (coreItems.has(id)) issues.push({ severity: "error", code: "override-item", path: "$.items", message: `不能覆盖核心物品 ${id}` });
  for (const id of buildingIds) if (coreBuildings.has(id)) issues.push({ severity: "error", code: "override-building", path: "$.buildings", message: `不能覆盖核心建筑 ${id}` });
  for (const id of recipeIds) if (coreRecipes.has(id)) issues.push({ severity: "error", code: "override-recipe", path: "$.recipes", message: `不能覆盖核心配方 ${id}` });
  for (const id of technologyIds) if (coreTechnologies.has(id)) issues.push({ severity: "error", code: "override-technology", path: "$.technologies", message: `不能覆盖核心科技 ${id}` });
  const allItems = new Set([...coreItems, ...itemIds]);
  const allBuildings = new Set([...coreBuildings, ...buildingIds]);
  const allTechnologies = new Set([...coreTechnologies, ...technologyIds]);
  for (const recipe of validRecipes) {
    if (!allBuildings.has(recipe.buildingId)) issues.push({ severity: "error", code: "recipe-building", path: `$.recipes.${recipe.id}`, message: `配方引用未知建筑 ${recipe.buildingId}` });
    if (recipe.requiredTechId && !allTechnologies.has(recipe.requiredTechId)) issues.push({ severity: "error", code: "recipe-tech", path: `$.recipes.${recipe.id}`, message: `配方引用未知科技 ${recipe.requiredTechId}` });
    for (const entry of [...recipe.inputs, ...recipe.outputs]) if (!allItems.has(entry.itemId)) issues.push({ severity: "error", code: "recipe-item", path: `$.recipes.${recipe.id}`, message: `配方引用未知物品 ${entry.itemId}` });
  }
  for (const technology of validTechnologies) for (const prerequisite of technology.prerequisites ?? []) if (!allTechnologies.has(prerequisite)) issues.push({ severity: "error", code: "technology-prerequisite", path: `$.technologies.${technology.id}`, message: `科技引用未知前置 ${prerequisite}` });

  return {
    formatVersion,
    id: typeof value.id === "string" ? value.id : "",
    name: typeof value.name === "string" ? value.name.trim().slice(0, 120) : "",
    version: typeof value.version === "string" ? value.version.trim().slice(0, 40) : "",
    ...(typeof value.author === "string" ? { author: value.author.trim().slice(0, 80) } : {}),
    ...(typeof value.description === "string" ? { description: value.description.trim().slice(0, 240) } : {}),
    dependencies: Array.isArray(dependencies) ? [...new Set(dependencies.filter(validId))] : [],
    items: validItems,
    buildings: validBuildings,
    recipes: validRecipes,
    technologies: validTechnologies,
  };
}

export function validateContentPack(value: unknown): ModValidationResult {
  const issues: ModValidationIssue[] = [];
  const coreAudit = validateContentCatalog();
  for (const issue of coreAudit.issues.filter((candidate) => candidate.severity === "error")) {
    issues.push({ severity: "error", code: `core-${issue.code}`, path: issue.id, message: `核心目录异常：${issue.message}` });
  }
  const manifest = parseManifest(value, issues);
  return {
    valid: Boolean(manifest) && issues.every((issue) => issue.severity !== "error"),
    manifest,
    issues,
    counts: {
      items: manifest?.items?.length ?? 0,
      buildings: manifest?.buildings?.length ?? 0,
      recipes: manifest?.recipes?.length ?? 0,
      technologies: manifest?.technologies?.length ?? 0,
    },
  };
}

export function parseContentPack(raw: string): ModValidationResult {
  try {
    return validateContentPack(JSON.parse(raw));
  } catch {
    return {
      valid: false,
      manifest: null,
      issues: [{ severity: "error", code: "json", path: "$", message: "内容包不是有效 JSON" }],
      counts: { items: 0, buildings: 0, recipes: 0, technologies: 0 },
    };
  }
}

export function createContentPackTemplate(): ContentPackManifest {
  return {
    formatVersion: MOD_FORMAT_VERSION,
    id: "my_content_pack",
    name: "我的内容包",
    version: "0.1.0",
    author: "",
    description: "只扩展新 ID，不覆盖核心目录。",
    dependencies: [],
    items: [],
    buildings: [],
    recipes: [],
    technologies: [],
  };
}

