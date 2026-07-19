import { getPlanet } from "./content";
import type { AchievementId, GameState, ItemId } from "./types";

export interface AchievementDefinition {
  id: AchievementId;
  name: string;
  description: string;
  target: number;
  current: (state: GameState) => number;
}

const MATRIX_IDS: ItemId[] = [
  "electromagnetic_matrix",
  "energy_matrix",
  "structure_matrix",
  "information_matrix",
  "gravity_matrix",
  "universe_matrix",
];

const RARE_RESOURCE_IDS: ItemId[] = [
  "fire_ice",
  "kimberlite_ore",
  "fractal_silicon",
  "optical_grating_crystal",
  "spiniform_stalagmite_crystal",
  "unipolar_magnet",
];

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: "first_manual_mine",
    name: "第一镐",
    description: "亲手采集第一份固体矿物。",
    target: 1,
    current: (state) => state.manualMined,
  },
  {
    id: "automated_mining",
    name: "自动化开端",
    description: "部署至少一台自动采集设备。",
    target: 1,
    current: (state) => state.entities.reduce((sum, entity) => sum + entity.minerCount, 0),
  },
  {
    id: "first_logistics_line",
    name: "物流脉搏",
    description: "建立第一条传送带运输线。",
    target: 1,
    current: (state) => state.belts.length,
  },
  {
    id: "stable_power_grid",
    name: "电网并轨",
    description: "让有负载的工厂获得完整供电。",
    target: 1,
    current: (state) => state.planetMetrics && Object.values(state.planetMetrics).some((metrics) =>
      metrics.demandKw > 0 && metrics.generationKw > 0 && metrics.powerFactor >= 0.999) ? 1 : 0,
  },
  {
    id: "electromagnetic_matrix_online",
    name: "蓝色火花",
    description: "生产第一份电磁矩阵。",
    target: 1,
    current: (state) => state.totalProduced.electromagnetic_matrix ?? 0,
  },
  {
    id: "energy_matrix_online",
    name: "红色燃流",
    description: "生产第一份能量矩阵。",
    target: 1,
    current: (state) => state.totalProduced.energy_matrix ?? 0,
  },
  {
    id: "six_matrix_mastery",
    name: "矩阵全谱",
    description: "六种科研矩阵全部完成量产。",
    target: MATRIX_IDS.length,
    current: (state) => MATRIX_IDS.filter((itemId) => (state.totalProduced[itemId] ?? 0) >= 1).length,
  },
  {
    id: "planetary_logistics_online",
    name: "行星配送",
    description: "部署一座行星内物流运输站。",
    target: 1,
    current: (state) => state.entities.filter((entity) => entity.buildingId === "planetary_logistics_station").length,
  },
  {
    id: "interstellar_delivery",
    name: "星际航次",
    description: "完成第一趟跨行星物流运输。",
    target: 1,
    current: (state) => state.entities
      .filter((entity) => entity.buildingId === "interstellar_logistics_station")
      .reduce((sum, entity) => sum + (entity.stationTrips ?? 0), 0),
  },
  {
    id: "rare_resource_harvest",
    name: "奇珍样本",
    description: "取得任意一种稀有资源。",
    target: 1,
    current: (state) => RARE_RESOURCE_IDS.some((itemId) => (state.totalProduced[itemId] ?? 0) >= 1) ? 1 : 0,
  },
  {
    id: "dyson_swarm_online",
    name: "逐日之帆",
    description: "向恒星轨道发射第一片太阳帆。",
    target: 1,
    current: (state) => state.dysonSwarm.totalLaunched,
  },
  {
    id: "permanent_dyson_structure",
    name: "恒星骨架",
    description: "建成第一个永久戴森结构点。",
    target: 1,
    current: (state) => state.dysonSphere.structurePoints,
  },
  {
    id: "multi_system_industry",
    name: "群星工业",
    description: "在至少两个恒星系部署工业设施。",
    target: 2,
    current: (state) => new Set(state.entities
      .filter((entity) => entity.kind !== "vein" && entity.machineCount > 0)
      .map((entity) => getPlanet(entity.planetId).systemId)).size,
  },
];

const ACHIEVEMENT_IDS = new Set<AchievementId>(ACHIEVEMENTS.map((achievement) => achievement.id));

export function isAchievementId(value: unknown): value is AchievementId {
  return typeof value === "string" && ACHIEVEMENT_IDS.has(value as AchievementId);
}

export function getAchievementProgress(state: GameState, achievement: AchievementDefinition): number {
  return Math.max(0, Math.min(achievement.target, Math.floor(achievement.current(state))));
}

export function getNewAchievementIds(state: GameState): AchievementId[] {
  const unlocked = new Set(state.achievements.unlockedIds);
  return ACHIEVEMENTS
    .filter((achievement) => !unlocked.has(achievement.id) && getAchievementProgress(state, achievement) >= achievement.target)
    .map((achievement) => achievement.id);
}

export function unlockAchievements(state: GameState): { state: GameState; unlockedIds: AchievementId[] } {
  const unlockedIds = getNewAchievementIds(state);
  if (unlockedIds.length === 0) return { state, unlockedIds };
  return {
    state: {
      ...state,
      achievements: {
        unlockedIds: [...state.achievements.unlockedIds, ...unlockedIds],
      },
    },
    unlockedIds,
  };
}

export function getAchievement(id: AchievementId | undefined): AchievementDefinition | undefined {
  return ACHIEVEMENTS.find((achievement) => achievement.id === id);
}
