/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from "vitest";
import { createInitialState } from "./engine";
import {
  ACCOUNT_STORAGE_KEY,
  baselineAccountProgress,
  createAccountState,
  createLocalAccount,
  getActiveAccount,
  loadAccountState,
  recordAccountProgress,
  setActiveCloudBinding,
  switchLocalAccount,
  updateAccountProfile,
} from "./account";

describe("local account state", () => {
  beforeEach(() => window.localStorage.clear());

  it("creates, persists, switches and edits independent local identities", () => {
    let state = createAccountState(100);
    const firstId = state.activeAccountId;
    state = updateAccountProfile(state, { displayName: "  银河 工程师  ", avatar: "C", privacy: "private" });
    expect(getActiveAccount(state).profile).toMatchObject({ displayName: "银河 工程师", avatar: "C", privacy: "private" });

    state = createLocalAccount(state, "第二工厂");
    const secondId = state.activeAccountId;
    expect(secondId).not.toBe(firstId);
    expect(Object.keys(state.accounts)).toHaveLength(2);
    state = switchLocalAccount(state, firstId);
    expect(getActiveAccount(state).profile.displayName).toBe("银河 工程师");
    expect(loadAccountState().activeAccountId).toBe(firstId);
    expect(window.localStorage.getItem(ACCOUNT_STORAGE_KEY)).toContain("第二工厂");
  });

  it("integrates power and accumulates white-matrix uploads across a factory reset", () => {
    let account = createAccountState(100);
    const game = createInitialState();
    game.elapsedSeconds = 10;
    game.planetMetrics.home.generationKw = 1_000;
    game.planetMetrics.ashen.generationKw = 500;
    game.planetMetrics.home.totalItemsPerMinute = 120;
    game.dysonSwarm.generationKw = 250;
    game.dysonSphere.generationKw = 750;
    game.endgame.exportProjects.universe_archive.totalDelivered = 20;

    account = recordAccountProgress(account, game, 200);
    expect(getActiveAccount(account).ledger).toMatchObject({
      energyGeneratedMj: 15,
      uploadedWhiteMatrix: 20,
      peakGenerationKw: 1_500,
      peakThroughputPerMinute: 120,
      peakDysonPowerKw: 1_000,
    });

    game.elapsedSeconds = 12;
    game.endgame.exportProjects.universe_archive.totalDelivered = 25;
    account = recordAccountProgress(account, game, 300);
    expect(getActiveAccount(account).ledger.energyGeneratedMj).toBe(18);
    expect(getActiveAccount(account).ledger.uploadedWhiteMatrix).toBe(25);

    game.elapsedSeconds = 0;
    game.endgame.exportProjects.universe_archive.totalDelivered = 0;
    account = recordAccountProgress(account, game, 400);
    game.elapsedSeconds = 1;
    game.endgame.exportProjects.universe_archive.totalDelivered = 4;
    account = recordAccountProgress(account, game, 500);
    expect(getActiveAccount(account).ledger.uploadedWhiteMatrix).toBe(29);

    game.elapsedSeconds = 2;
    game.endgame.exportProjects.universe_archive.totalDelivered = 10;
    account = recordAccountProgress(account, game, 600);
    expect(getActiveAccount(account).ledger.uploadedWhiteMatrix).toBe(35);
  });

  it("can baseline a switched account without crediting another identity's runtime", () => {
    const game = createInitialState();
    game.elapsedSeconds = 50;
    game.planetMetrics.home.generationKw = 1_000;
    let account = createLocalAccount(createAccountState(100), "备用身份");
    account = baselineAccountProgress(account, game, 200);
    game.elapsedSeconds = 52;
    account = recordAccountProgress(account, game, 300);
    expect(getActiveAccount(account).ledger.energyGeneratedMj).toBe(2);
  });

  it("keeps nominal capacity separate from a 60 simulated-second settled-production window", () => {
    const game = createInitialState();
    game.elapsedSeconds = 10;
    game.totalProduced.iron_ingot = 100;
    game.planetMetrics.home.totalItemsPerMinute = 9_999;
    let account = recordAccountProgress(createAccountState(100), game, 100);
    expect(getActiveAccount(account).ledger.peakActualThroughputPerMinute).toBe(0);

    game.elapsedSeconds = 70;
    game.totalProduced.iron_ingot = 700;
    account = recordAccountProgress(account, game, 200);
    expect(getActiveAccount(account).ledger).toMatchObject({
      peakThroughputPerMinute: 9_999,
      peakActualThroughputPerMinute: 600,
      throughputWindowStartedAtSeconds: 70,
      throughputWindowStartedProduced: 700,
    });

    game.elapsedSeconds = 5;
    game.totalProduced.iron_ingot = 10;
    account = recordAccountProgress(account, game, 300);
    expect(getActiveAccount(account).ledger).toMatchObject({
      peakActualThroughputPerMinute: 600,
      throughputWindowStartedAtSeconds: 5,
      throughputWindowStartedProduced: 10,
    });
  });

  it("saturates extreme ranking totals without producing Infinity", () => {
    const game = createInitialState();
    game.elapsedSeconds = Number.MAX_VALUE;
    game.planetMetrics.home.generationKw = Number.MAX_VALUE;
    game.planetMetrics.ashen.generationKw = Number.MAX_VALUE;
    game.planetMetrics.home.totalItemsPerMinute = Number.MAX_VALUE;
    game.planetMetrics.ashen.totalItemsPerMinute = Number.MAX_VALUE;
    game.dysonSwarm.generationKw = Number.MAX_VALUE;
    game.dysonSphere.generationKw = Number.MAX_VALUE;
    game.endgame.exportProjects.universe_archive.totalDelivered = Number.MAX_VALUE;

    const account = recordAccountProgress(createAccountState(100), game, 200);
    expect(getActiveAccount(account).ledger).toMatchObject({
      energyGeneratedMj: Number.MAX_VALUE,
      uploadedWhiteMatrix: Number.MAX_VALUE,
      peakGenerationKw: Number.MAX_VALUE,
      peakThroughputPerMinute: Number.MAX_VALUE,
      peakDysonPowerKw: Number.MAX_VALUE,
    });
  });

  it("migrates local identities and moves one cloud binding without touching ledgers", () => {
    let state = createAccountState(100);
    const firstId = state.activeAccountId;
    state = setActiveCloudBinding(state, { id: "user_cloud1", email: "pilot@example.com" }, 200);
    expect(getActiveAccount(state).profile).toMatchObject({ cloudUserId: "user_cloud1", cloudEmail: "pilot@example.com", cloudBoundAt: 200 });

    state = createLocalAccount(state, "第二身份");
    const secondId = state.activeAccountId;
    state = setActiveCloudBinding(state, { id: "user_cloud1", email: "pilot@example.com" }, 300);
    expect(state.accounts[firstId].profile.cloudUserId).toBeNull();
    expect(state.accounts[secondId].profile.cloudUserId).toBe("user_cloud1");
    expect(state.accounts[firstId].ledger.energyGeneratedMj).toBe(0);

    state = setActiveCloudBinding(state, null, 400);
    expect(getActiveAccount(state).profile.cloudUserId).toBeNull();
    expect(loadAccountState().version).toBe(2);
  });
});
