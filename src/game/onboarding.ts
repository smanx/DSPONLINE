import type { GameState } from "./types";

export const ONBOARDING_STORAGE_KEY = "dsp-idle-network.onboarding.v1";

export type OnboardingStepId = "mine" | "miner" | "smelter" | "belt" | "research";

export interface OnboardingStep {
  id: OnboardingStepId;
  title: string;
  detail: string;
  action: string;
  complete: (game: GameState) => boolean;
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { id: "mine", title: "取得第一份矿石", detail: "在矿脉上按住指针，完成一次手动采集。", action: "定位铁矿", complete: (game) => game.manualMined >= 1 },
  { id: "miner", title: "启动自动采矿", detail: "选中采矿机，再点击固体矿脉完成安装。", action: "部署采矿机", complete: (game) => game.entities.some((entity) => entity.minerCount > 0) },
  { id: "smelter", title: "建立第一座熔炉", detail: "放置开局已解锁的熔炉，并选择铁块配方。", action: "部署熔炉", complete: (game) => game.entities.some((entity) => entity.buildingId === "arc_smelter" && Boolean(entity.recipeId)) },
  { id: "belt", title: "接通生产线路", detail: "点击物品输出端口，再点击高亮输入端口。", action: "选择传送带", complete: (game) => game.belts.length > 0 },
  { id: "research", title: "进入自动科研", detail: "生产电磁矩阵，并在科技树中加入第一项研究。", action: "打开科技树", complete: (game) => game.research.completedTechIds.length > 0 || Boolean(game.research.selectedTechId) },
] as const;

export function loadOnboardingDismissed(): boolean {
  try { return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "dismissed"; } catch { return false; }
}

export function dismissOnboarding(): void {
  try { window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "dismissed"); } catch { /* optional UI state */ }
}

export function resetOnboarding(): void {
  try { window.localStorage.removeItem(ONBOARDING_STORAGE_KEY); } catch { /* optional UI state */ }
}

export function getCurrentOnboardingStep(game: GameState): OnboardingStep | null {
  return ONBOARDING_STEPS.find((step) => !step.complete(game)) ?? null;
}
