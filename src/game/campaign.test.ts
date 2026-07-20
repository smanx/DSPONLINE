import { describe, expect, it } from "vitest";
import { createInitialState, placeBuilding } from "./engine";
import {
  getCampaignSnapshot,
  getCampaignTaskDeficits,
  getNetworkItemStock,
  selectCampaignTask,
  syncCampaignProgress,
} from "./campaign";

describe("campaign progression", () => {
  it("advances the active task and grants a construction reward once", () => {
    const state = createInitialState();
    state.manualMined = 1;

    const advanced = syncCampaignProgress(state);
    expect(advanced.campaign.completedTaskIds).toContain("mine_first_ore");
    expect(advanced.campaign.activeTaskId).toBe("smelt_iron");
    expect(advanced.construction.conveyor_belt_mk1).toBe(12);
    expect(syncCampaignProgress(advanced)).toBe(advanced);
  });

  it("keeps locked tasks unavailable until their prerequisites are complete", () => {
    const state = createInitialState();
    const locked = getCampaignSnapshot(state).chapters.find((chapter) => chapter.id === "blue_matrix")!.tasks[0];
    expect(locked.status).toBe("locked");
    expect(selectCampaignTask(state, "lay_first_belt")).toBe(state);

    state.manualMined = 1;
    state.totalProduced.iron_ingot = 4;
    state.belts.push({
      id: "campaign_belt",
      planetId: "home",
      source: "vein_iron",
      target: "vein_copper",
      itemId: "iron_ore",
      lanes: 1,
      tier: 1,
      sorterTier: 1,
      progress: 0,
      priority: 0,
      lastFlow: 0,
    });
    const advanced = syncCampaignProgress(state);
    expect(advanced.campaign.completedTaskIds).toEqual(expect.arrayContaining(["mine_first_ore", "smelt_iron"]));
    expect(advanced.campaign.activeTaskId).toBe("deploy_miner");
  });

  it("reports network stock deficits without double-counting the active tray", () => {
    const state = createInitialState();
    state.tray.iron_ingot = 2;
    state.planetTrays.home = { iron_ingot: 2 };
    state.entities[0].outputs.iron_ingot = 3;
    expect(getNetworkItemStock(state, "iron_ingot")).toBe(5);
    const task = getCampaignSnapshot(state).chapters[0].tasks[1];
    expect(getCampaignTaskDeficits(state, task)).toEqual([{ itemId: "iron_ore", amount: 4 }]);
  });

  it("tracks side objectives from existing factory state", () => {
    let state = createInitialState();
    state.construction.storage_mk1 = 1;
    state = placeBuilding(state, "storage_mk1", { x: 0, y: 0 });
    const snapshot = getCampaignSnapshot(syncCampaignProgress(state));
    const sideTask = snapshot.chapters.find((chapter) => chapter.id === "foundation")!.tasks.find((task) => task.id === "side_storage");
    expect(sideTask?.status).toBe("complete");
  });

  it("preserves a player-selected available side task across simulation ticks", () => {
    let state = createInitialState();
    state.manualMined = 1;
    state = syncCampaignProgress(state);
    state = selectCampaignTask(state, "side_storage");
    expect(syncCampaignProgress(state).campaign.activeTaskId).toBe("side_storage");
  });
});
