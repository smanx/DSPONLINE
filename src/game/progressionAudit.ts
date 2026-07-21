import { ITEMS, RECIPES, TECHNOLOGIES } from "./content";
import type { GameState, ItemId, TechId } from "./types";

export interface ProgressionMilestoneAudit {
  itemId: ItemId;
  label: string;
  complete: boolean;
  estimatedFromFreshMinutes: number;
  machineWorkSeconds: number;
  requiredTechnology: string | null;
  blockers: string[];
  criticalPath: string[];
}

export interface ProgressionAuditReport {
  milestones: ProgressionMilestoneAudit[];
  nextMilestone: ProgressionMilestoneAudit | null;
  estimatedWhiteMatrixHours: number;
  observedWhiteMatrixHours: number | null;
  completedMilestones: number;
  summary: string;
}

const MILESTONES: Array<{ itemId: ItemId; label: string; setupMinutes: number }> = [
  { itemId: "electromagnetic_matrix", label: "蓝糖闭环", setupMinutes: 15 },
  { itemId: "energy_matrix", label: "红糖闭环", setupMinutes: 70 },
  { itemId: "structure_matrix", label: "黄糖闭环", setupMinutes: 260 },
  { itemId: "information_matrix", label: "紫糖闭环", setupMinutes: 620 },
  { itemId: "gravity_matrix", label: "绿糖闭环", setupMinutes: 1_260 },
  { itemId: "universe_matrix", label: "白糖闭环", setupMinutes: 2_520 },
];

interface WorkEstimate {
  seconds: number;
  path: ItemId[];
}

function estimateItemWork(itemId: ItemId, amount: number, visiting = new Set<ItemId>()): WorkEstimate {
  if (visiting.has(itemId)) return { seconds: 0, path: [] };
  const candidates = Object.values(RECIPES).filter((recipe) => recipe.outputs.some((output) => output.itemId === itemId && output.amount > 0));
  if (candidates.length === 0) return { seconds: Math.max(1, amount), path: [itemId] };
  const nextVisiting = new Set(visiting).add(itemId);
  const estimates = candidates.map((recipe) => {
    const outputAmount = recipe.outputs.find((output) => output.itemId === itemId)?.amount ?? 1;
    const batches = Math.max(0, amount / outputAmount);
    const inputs = recipe.inputs.map((input) => estimateItemWork(input.itemId, input.amount * batches, nextVisiting));
    return {
      seconds: recipe.duration * batches + inputs.reduce((sum, input) => sum + input.seconds, 0),
      path: [itemId, ...inputs.sort((left, right) => right.seconds - left.seconds).flatMap((input) => input.path.slice(0, 2))].slice(0, 8),
    };
  });
  return estimates.sort((left, right) => left.seconds - right.seconds)[0];
}

function estimateTechnologyWork(techId: TechId | undefined, visited = new Set<TechId>()): number {
  if (!techId || visited.has(techId)) return 0;
  const technology = TECHNOLOGIES[techId];
  if (!technology) return 0;
  visited.add(techId);
  const prerequisites = technology.prerequisites.reduce((sum, prerequisite) => sum + estimateTechnologyWork(prerequisite, visited), 0);
  const costs = technology.costs.reduce((sum, cost) => sum + estimateItemWork(cost.itemId, cost.amount).seconds + cost.amount, 0);
  return prerequisites + costs;
}

function inventoryAmount(game: GameState, itemId: ItemId): number {
  const trays = Object.values(game.planetTrays).reduce((sum, tray) => sum + (tray[itemId] ?? 0), game.tray[itemId] ?? 0);
  const equipment = game.entities.reduce((sum, entity) => sum + (entity.inputs[itemId] ?? 0) + (entity.outputs[itemId] ?? 0), 0);
  return Math.floor(trays + equipment);
}

export function auditProgressionToWhiteMatrix(game: GameState): ProgressionAuditReport {
  let previousEstimate = 0;
  const milestones = MILESTONES.map((milestone) => {
    const recipe = Object.values(RECIPES).find((candidate) => candidate.outputs.some((output) => output.itemId === milestone.itemId));
    const itemWork = estimateItemWork(milestone.itemId, 1);
    const technologyWork = estimateTechnologyWork(recipe?.requiredTechId);
    const machineWorkSeconds = Math.ceil(itemWork.seconds + technologyWork);
    const rawEstimate = Math.ceil(milestone.setupMinutes + machineWorkSeconds / 60 / 4);
    const estimatedFromFreshMinutes = Math.max(previousEstimate + 5, rawEstimate);
    previousEstimate = estimatedFromFreshMinutes;
    const technology = recipe?.requiredTechId ? TECHNOLOGIES[recipe.requiredTechId] : undefined;
    const blockers: string[] = [];
    if (technology && !game.research.completedTechIds.includes(technology.id)) blockers.push(`科技：${technology.name}`);
    for (const input of recipe?.inputs ?? []) {
      if (inventoryAmount(game, input.itemId) < input.amount) blockers.push(`${ITEMS[input.itemId].name} ${inventoryAmount(game, input.itemId)}/${input.amount}`);
    }
    return {
      itemId: milestone.itemId,
      label: milestone.label,
      complete: (game.totalProduced[milestone.itemId] ?? 0) > 0,
      estimatedFromFreshMinutes,
      machineWorkSeconds,
      requiredTechnology: technology?.name ?? null,
      blockers: blockers.slice(0, 5),
      criticalPath: [...new Set(itemWork.path)].map((itemId) => ITEMS[itemId].name).slice(0, 6),
    };
  });
  const nextMilestone = milestones.find((milestone) => !milestone.complete) ?? null;
  const white = milestones.at(-1)!;
  const completedMilestones = milestones.filter((milestone) => milestone.complete).length;
  const observedWhiteMatrixHours = white.complete ? Math.round(game.elapsedSeconds / 36) / 100 : null;
  return {
    milestones,
    nextMilestone,
    estimatedWhiteMatrixHours: Math.round(white.estimatedFromFreshMinutes / 60 * 10) / 10,
    observedWhiteMatrixHours,
    completedMilestones,
    summary: white.complete
      ? `本存档在累计运行 ${observedWhiteMatrixHours?.toFixed(2)} 小时时已形成白糖闭环。`
      : `数据基线预计标准难度约 ${Math.round(white.estimatedFromFreshMinutes / 60 * 10) / 10} 小时形成白糖闭环；当前下一目标为${nextMilestone?.label ?? "终局"}。`,
  };
}
