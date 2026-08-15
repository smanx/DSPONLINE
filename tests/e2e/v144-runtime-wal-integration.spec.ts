import { expect, test, type Page } from "@playwright/test";

async function readRecoveryProof(page: Page) {
  return page.evaluate(async () => {
    const local = await import("/src/game/localSaveStore.ts");
    const persistence = await import("/src/game/simulationRuntimeRecoveryPersistenceClient.ts");
    const identity = local.getPrimaryLocalSaveRecoveryIdentity("normal");
    const writer = local.getLocalSaveWriterStatus();
    if (!identity || writer.role !== "primary") throw new Error("verified primary/recovery writer missing");
    const read = await persistence.readSimulationRuntimeRecoveryInPersistenceWorker(identity, {
      ownerId: writer.writerId,
      fencingToken: writer.fencingToken,
    });
    if (!read.ok || !read.proof) throw new Error(read.ok ? "recovery proof missing" : read.message);
    return {
      identity,
      sequence: read.proof.sequence,
      stateRevision: read.proof.stateRevision,
      pending: read.proof.pending,
      finalized: read.proof.finalized,
      commandCount: (read.recovery?.entries ?? []).reduce((count, entry) =>
        count + (entry.kind === "atomic" && entry.intent.command ? 1 : 0), 0) +
        (read.recovery?.pendingIntent?.command ? 1 : 0),
    };
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("dsp-idle-network.release-notes.seen.v1", "2026-08-14-v1.0.43");
    localStorage.setItem("dsp-idle-network.onboarding.v1", "dismissed");
  });
});

test("running and paused UI commands drain through WAL before pagehide without promoting an emergency primary", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/?menu=1");
  await page.getByRole("button", { name: /开始游戏/ }).click();
  const shell = page.locator(".game-shell");
  await expect(shell).toBeVisible({ timeout: 20_000 });
  await expect(shell).toHaveAttribute("data-runtime-recovery", "active");
  const initialProof = await readRecoveryProof(page);

  await page.getByLabel("打开设置").click();
  const operations = page.getByRole("dialog", { name: "运营中心" });
  await operations.locator(".operations-tabs").getByRole("tab", { name: "设置" }).click();
  await operations.getByRole("button", { name: "教程、版本与其他", exact: true }).first().click();
  const relaxedDifficulty = operations.getByRole("button", { name: "舒缓", exact: true });
  await relaxedDifficulty.click();
  await expect(shell).toHaveAttribute("data-difficulty", "relaxed");
  await expect.poll(async () => {
    const proof = await readRecoveryProof(page);
    return proof.pending ? -1 : proof.commandCount;
  }).toBeGreaterThan(initialProof.commandCount);
  const afterRunningEdit = await readRecoveryProof(page);

  await operations.getByLabel("关闭运营中心").click();
  const pause = page.getByLabel("暂停模拟");
  if (await pause.isVisible()) await pause.click();
  await expect(shell).toHaveAttribute("data-simulation-paused", "true");
  await expect.poll(async () => {
    const proof = await readRecoveryProof(page);
    return proof.pending ? -1 : proof.commandCount;
  }).toBeGreaterThan(afterRunningEdit.commandCount);

  // Two edits while the first durable command may still be in flight may be
  // coalesced, but the last visible value must be staged/finalized and survive
  // reload exactly once.
  const beforeRapidEdits = await readRecoveryProof(page);
  await page.getByLabel("打开设置").click();
  const pausedOperations = page.getByRole("dialog", { name: "运营中心" });
  await pausedOperations.locator(".operations-tabs").getByRole("tab", { name: "设置" }).click();
  await pausedOperations.getByRole("button", { name: "教程、版本与其他", exact: true }).first().click();
  await pausedOperations.getByRole("button", { name: "高压", exact: true }).click();
  await pausedOperations.getByRole("button", { name: "舒缓", exact: true }).click();
  await expect(shell).toHaveAttribute("data-difficulty", "relaxed");
  await expect.poll(async () => {
    const proof = await readRecoveryProof(page);
    return proof.pending ? -1 : proof.commandCount;
  }).toBeGreaterThan(beforeRapidEdits.commandCount);
  await pausedOperations.getByLabel("关闭运营中心").click();

  const beforeHide = await readRecoveryProof(page);
  expect(beforeHide.sequence).toBeGreaterThanOrEqual(2);
  expect(beforeHide.pending).toBe(false);
  expect(beforeHide.finalized).toBe(true);

  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
    // A native/visibility callback can already be queued behind pagehide.
    // The durable-active lifecycle guard must reject that late enqueue too.
    window.dispatchEvent(new CustomEvent("dsp-native-app-state", { detail: { isActive: false } }));
  });
  await page.waitForTimeout(250);
  const afterHideIdentity = await page.evaluate(async () => {
    const local = await import("/src/game/localSaveStore.ts");
    await local.flushLocalSaveWrites();
    return {
      identity: local.getPrimaryLocalSaveRecoveryIdentity("normal"),
      emergencyPayload: localStorage.getItem("dsp-idle-network.local-save-coordination.v1.emergency-mirror.normal.payload"),
      emergencyMetadata: localStorage.getItem("dsp-idle-network.local-save-coordination.v1.emergency-mirror.normal.metadata"),
    };
  });
  expect(afterHideIdentity.identity).toEqual(beforeHide.identity);
  expect(afterHideIdentity.emergencyPayload).toBeNull();
  expect(afterHideIdentity.emergencyMetadata).toBeNull();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".start-menu")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /继续游戏/ }).click();
  await expect(shell).toBeVisible({ timeout: 20_000 });
  await expect(shell).toHaveAttribute("data-runtime-recovery", "active");
  await expect(shell).toHaveAttribute("data-difficulty", "relaxed");
  await expect(shell).toHaveAttribute("data-simulation-paused", "true");
});
