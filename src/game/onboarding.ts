import { ITEMS, RECIPES } from "./content";
import type { CampaignNavigation } from "./campaign";
import { getEntityOperatingStatus } from "./engine";
import type { BuildingId, CampaignTaskId, GameState, ItemId, PlanetId } from "./types";

export const ONBOARDING_STORAGE_KEY = "dsp-idle-network.onboarding.v1";
export const BASIC_ONBOARDING_STORAGE_KEY = "dsp-idle-network.basic-onboarding.v1";
export const BASIC_ONBOARDING_EVENT = "dsp-idle-network:basic-onboarding";

export type BasicOnboardingEventId = "cargo-stowed" | "construction-crafted" | "building-placed" | "building-stacked" | "belt-connected" | "research-selected";
export type BasicOnboardingStepId = "basic-cargo" | "basic-craft" | "basic-place-stack" | "basic-belt" | "basic-research";
export type OnboardingActionId = BasicOnboardingStepId | OnboardingStepId;

export interface BasicOnboardingProgress {
  version: 1;
  completedEvents: BasicOnboardingEventId[];
  skipped: boolean;
}

export interface BasicOnboardingStep {
  id: BasicOnboardingStepId;
  phase: "基础操作";
  title: string;
  desktopDetail: string;
  mobileDetail: string;
  action: string;
  requiredEvents: BasicOnboardingEventId[];
}

export const BASIC_ONBOARDING_STEPS: readonly BasicOnboardingStep[] = [
  { id: "basic-cargo", phase: "基础操作", title: "收纳第一组物品", desktopDetail: "从节点或物资区拿起物品，再点击左侧物资托盘放下。", mobileDetail: "拿起一组物品，打开底部“物资”抽屉并点击全部放回。", action: "查看物资托盘", requiredEvents: ["cargo-stowed"] },
  { id: "basic-craft", phase: "基础操作", title: "制造一批建筑", desktopDetail: "打开右侧基础制造，选择建筑批次并完成一次制造。", mobileDetail: "打开底部“建造”，切换到制造并完成一次建筑制造。", action: "打开建筑制造", requiredEvents: ["construction-crafted"] },
  { id: "basic-place-stack", phase: "基础操作", title: "放置并堆叠建筑", desktopDetail: "在画布放置一座建筑，再用数量控件或 Ctrl 连续扩建增加堆叠。", mobileDetail: "在画布放置一座建筑，再从检查器增加至少一台设备。", action: "选择建筑", requiredEvents: ["building-placed", "building-stacked"] },
  { id: "basic-belt", phase: "基础操作", title: "连接第一条传送带", desktopDetail: "单击输出端口，再单击绿色目标端口完成连接。", mobileDetail: "依次点击输出端口与绿色吸附目标，完成连接。", action: "开始连接", requiredEvents: ["belt-connected"] },
  { id: "basic-research", phase: "基础操作", title: "选择第一项科技", desktopDetail: "打开科技树并选择一项可研究科技。", mobileDetail: "点击底部“科研”，打开科技详情并选择研究。", action: "打开科技", requiredEvents: ["research-selected"] },
] as const;

const BASIC_EVENT_IDS = new Set<BasicOnboardingEventId>([
  "cargo-stowed", "construction-crafted", "building-placed", "building-stacked", "belt-connected", "research-selected",
]);

export function loadBasicOnboardingProgress(): BasicOnboardingProgress {
  const fallback: BasicOnboardingProgress = { version: 1, completedEvents: [], skipped: false };
  try {
    const raw = window.localStorage.getItem(BASIC_ONBOARDING_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<BasicOnboardingProgress>;
    if (parsed.version !== 1) return fallback;
    return {
      version: 1,
      completedEvents: [...new Set((parsed.completedEvents ?? []).filter((event): event is BasicOnboardingEventId => BASIC_EVENT_IDS.has(event as BasicOnboardingEventId)))],
      skipped: parsed.skipped === true,
    };
  } catch {
    return fallback;
  }
}

function saveBasicOnboardingProgress(progress: BasicOnboardingProgress): void {
  try { window.localStorage.setItem(BASIC_ONBOARDING_STORAGE_KEY, JSON.stringify(progress)); } catch { /* optional UI state */ }
  window.dispatchEvent(new CustomEvent(BASIC_ONBOARDING_EVENT, { detail: progress }));
}

export function recordBasicOnboardingEvent(event: BasicOnboardingEventId): void {
  const current = loadBasicOnboardingProgress();
  if (current.skipped || current.completedEvents.includes(event)) return;
  saveBasicOnboardingProgress({ ...current, completedEvents: [...current.completedEvents, event] });
}

export function skipBasicOnboarding(): void {
  const current = loadBasicOnboardingProgress();
  if (!current.skipped) saveBasicOnboardingProgress({ ...current, skipped: true });
}

export function isBasicOnboardingStepComplete(progress: BasicOnboardingProgress, step: BasicOnboardingStep): boolean {
  return step.requiredEvents.every((event) => progress.completedEvents.includes(event));
}

export function getCurrentBasicOnboardingStep(progress: BasicOnboardingProgress): BasicOnboardingStep | null {
  if (progress.skipped) return null;
  return BASIC_ONBOARDING_STEPS.find((step) => !isBasicOnboardingStepComplete(progress, step)) ?? null;
}

export type OnboardingStepId =
  | "mine"
  | "miner"
  | "smelter"
  | "belt"
  | "research"
  | "blue_matrix"
  | "oil_chain"
  | "red_matrix"
  | "yellow_matrix"
  | "interstellar_logistics"
  | "dyson_swarm"
  | "critical_photon"
  | "white_matrix";

export interface OnboardingStep {
  id: OnboardingStepId;
  phase: string;
  title: string;
  detail: string;
  action: string;
  complete: (game: GameState) => boolean;
  navigation?: CampaignNavigation;
  campaignTaskId?: CampaignTaskId;
  targetItemId?: ItemId;
  targetBuildingIds?: BuildingId[];
}

export interface OnboardingFocusTarget {
  kind: "entity" | "belt";
  id: string;
  planetId: PlanetId;
  reason: string;
}

const produced = (game: GameState, itemId: ItemId) => (game.totalProduced[itemId] ?? 0) >= 1;

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { id: "mine", phase: "基础", title: "取得第一份矿石", detail: "在矿脉上按住指针，完成一次手动采集。", action: "定位铁矿", complete: (game) => game.manualMined >= 1, targetItemId: "iron_ore" },
  { id: "miner", phase: "基础", title: "启动自动采矿", detail: "选中采矿机，再点击固体矿脉完成安装。", action: "部署采矿机", complete: (game) => game.entities.some((entity) => entity.minerCount > 0), targetBuildingIds: ["mining_machine"] },
  { id: "smelter", phase: "基础", title: "建立第一座熔炉", detail: "放置开局已解锁的熔炉，并选择铁块配方。", action: "部署熔炉", complete: (game) => game.entities.some((entity) => entity.buildingId === "arc_smelter" && Boolean(entity.recipeId)), targetBuildingIds: ["arc_smelter"] },
  { id: "belt", phase: "基础", title: "接通生产线路", detail: "点击物品输出端口，再点击高亮输入端口。", action: "选择传送带", complete: (game) => game.belts.length > 0 },
  { id: "research", phase: "基础", title: "进入自动科研", detail: "在科技树选择可研究项目并加入队列。", action: "打开科技树", complete: (game) => game.research.completedTechIds.length > 0 || Boolean(game.research.selectedTechId), navigation: { kind: "technology", techId: "electromagnetic_matrix" } },
  { id: "blue_matrix", phase: "蓝糖", title: "完成电磁矩阵", detail: "让铁、铜与磁线圈汇入研究站，产出第一份蓝糖。", action: "查看蓝糖配方", complete: (game) => produced(game, "electromagnetic_matrix"), navigation: { kind: "recipe", itemId: "electromagnetic_matrix" }, campaignTaskId: "produce_blue_matrix", targetItemId: "electromagnetic_matrix", targetBuildingIds: ["matrix_lab"] },
  { id: "oil_chain", phase: "石油红糖", title: "打通石油与塑料", detail: "抽取原油，完成精炼油、高能石墨与塑料加工。", action: "查看塑料链", complete: (game) => produced(game, "refined_oil") && produced(game, "plastic"), navigation: { kind: "recipe", itemId: "plastic" }, campaignTaskId: "produce_plastic", targetItemId: "plastic", targetBuildingIds: ["oil_refinery", "chemical_plant"] },
  { id: "red_matrix", phase: "石油红糖", title: "完成能量矩阵", detail: "把高能石墨与氢稳定送入研究站，形成红糖闭环。", action: "查看红糖配方", complete: (game) => produced(game, "energy_matrix"), navigation: { kind: "recipe", itemId: "energy_matrix" }, campaignTaskId: "produce_red_matrix", targetItemId: "energy_matrix", targetBuildingIds: ["matrix_lab"] },
  { id: "yellow_matrix", phase: "黄糖", title: "完成结构矩阵", detail: "组织跨行星钛链、金刚石与钛晶石生产，产出黄糖。", action: "查看黄糖配方", complete: (game) => produced(game, "structure_matrix"), navigation: { kind: "recipe", itemId: "structure_matrix" }, campaignTaskId: "produce_structure_matrix", targetItemId: "structure_matrix", targetBuildingIds: ["matrix_lab"] },
  { id: "interstellar_logistics", phase: "星际物流", title: "完成首次星际运输", detail: "配置星际物流塔供需槽、运输船与翘曲器，并完成一趟航次。", action: "定位星际物流", complete: (game) => game.entities.some((entity) => entity.buildingId === "interstellar_logistics_station" && (entity.stationTrips ?? 0) >= 1), navigation: { kind: "building", buildingId: "interstellar_logistics_station" }, campaignTaskId: "complete_interstellar_trip", targetBuildingIds: ["interstellar_logistics_station"] },
  { id: "dyson_swarm", phase: "戴森云", title: "发射第一枚太阳帆", detail: "生产太阳帆并由电磁轨道弹射器送入轨道。", action: "打开戴森规划", complete: (game) => game.dysonSwarm.totalLaunched >= 1, navigation: { kind: "dyson" }, campaignTaskId: "launch_solar_sail", targetBuildingIds: ["em_rail_ejector"] },
  { id: "critical_photon", phase: "戴森云", title: "提取临界光子", detail: "让射线接收站使用戴森功率生成临界光子。", action: "查看光子链", complete: (game) => produced(game, "critical_photon"), navigation: { kind: "recipe", itemId: "critical_photon" }, targetItemId: "critical_photon", targetBuildingIds: ["ray_receiver"] },
  { id: "white_matrix", phase: "白糖", title: "完成宇宙矩阵", detail: "汇集五色矩阵与反物质，完成第一份白糖。", action: "查看白糖配方", complete: (game) => produced(game, "universe_matrix"), navigation: { kind: "recipe", itemId: "universe_matrix" }, campaignTaskId: "produce_universe_matrix", targetItemId: "universe_matrix", targetBuildingIds: ["matrix_lab"] },
] as const;

export function loadOnboardingDismissed(): boolean {
  try { return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "dismissed"; } catch { return false; }
}

export function dismissOnboarding(): void {
  try { window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "dismissed"); } catch { /* optional UI state */ }
  skipBasicOnboarding();
}

export function resetOnboarding(): void {
  try { window.localStorage.removeItem(ONBOARDING_STORAGE_KEY); } catch { /* optional UI state */ }
  try { window.localStorage.removeItem(BASIC_ONBOARDING_STORAGE_KEY); } catch { /* optional UI state */ }
}

export function getOnboardingStep(stepId: OnboardingStepId): OnboardingStep | undefined {
  return ONBOARDING_STEPS.find((step) => step.id === stepId);
}

export function getCurrentOnboardingStep(game: GameState): OnboardingStep | null {
  return ONBOARDING_STEPS.find((step) => !step.complete(game)) ?? null;
}

export function getOnboardingFocusTarget(game: GameState, step: OnboardingStep): OnboardingFocusTarget | null {
  const buildingIds = new Set(step.targetBuildingIds ?? []);
  const recipeIds = new Set(step.targetItemId
    ? Object.values(RECIPES).filter((recipe) => recipe.outputs.some((output) => output.itemId === step.targetItemId)).map((recipe) => recipe.id)
    : []);
  const recipeCandidates = game.entities.filter((entity) => Boolean(entity.recipeId && recipeIds.has(entity.recipeId)));
  const candidates = recipeCandidates.length > 0
    ? recipeCandidates
    : game.entities.filter((entity) => Boolean(entity.buildingId && buildingIds.has(entity.buildingId)));
  if (candidates.length === 0) return null;

  const ranked = candidates.map((entity) => ({ entity, status: getEntityOperatingStatus(game, entity) }))
    .sort((left, right) => {
      const score = (tone: string) => tone === "blocked" ? 3 : tone === "warning" ? 2 : tone === "idle" ? 1 : 0;
      return score(right.status.tone) - score(left.status.tone);
    });

  for (const { entity } of ranked) {
    const recipe = entity.recipeId ? RECIPES[entity.recipeId] : undefined;
    if (!recipe) continue;
    for (const input of recipe.inputs) {
      if ((entity.inputs[input.itemId] ?? 0) >= input.amount) continue;
      const belt = game.belts.find((candidate) => candidate.target === entity.id && candidate.itemId === input.itemId && candidate.lastFlow <= 0);
      if (belt) return { kind: "belt", id: belt.id, planetId: belt.planetId, reason: `${ITEMS[input.itemId].name}输入线没有流量` };
    }
  }

  const { entity, status } = ranked[0];
  return {
    kind: "entity",
    id: entity.id,
    planetId: entity.planetId,
    reason: status.code === "running" ? "检查当前生产设备" : status.label,
  };
}
