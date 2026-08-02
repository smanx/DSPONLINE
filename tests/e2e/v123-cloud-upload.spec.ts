import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const FIXTURE = process.env.DSP_CLOUD_UPLOAD_FIXTURE;
const OFFLINE_SECONDS = Math.max(0, Number(process.env.DSP_CLOUD_UPLOAD_OFFLINE_SECONDS ?? 164));

test.use({ serviceWorkers: "block" });

test("cloud upload preparation keeps a large save off the main thread", async ({ page }) => {
  test.setTimeout(Math.max(180_000, OFFLINE_SECONDS * 250));
  test.skip(!FIXTURE || !existsSync(FIXTURE), "设置 DSP_CLOUD_UPLOAD_FIXTURE 后运行真实大存档夹具");
  await page.addInitScript(() => window.localStorage.setItem("dsp-idle-network.release-notes.seen.v1", "2026-08-02-v1.0.21"));
  await page.goto("/?menu=1");
  const raw = readFileSync(FIXTURE!, "utf8");
  const fixtureSavedAt = (JSON.parse(raw) as { savedAt?: number }).savedAt ?? Date.now();
  const result = await page.evaluate(async ({ raw, fixtureSavedAt, offlineSeconds }) => {
    const longTasks: number[] = [];
    const observer = typeof PerformanceObserver !== "undefined"
      ? new PerformanceObserver((list) => list.getEntries().forEach((entry) => longTasks.push(entry.duration)))
      : null;
    observer?.observe({ type: "longtask", buffered: true });
    const { prepareCloudUploadInWorker } = await import("/src/game/offlineSimulation.ts");
    const startedAt = performance.now();
    const prepared = await prepareCloudUploadInWorker(raw, { now: fixtureSavedAt + offlineSeconds * 1_000 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    observer?.disconnect();
    return {
      elapsedMs: performance.now() - startedAt,
      rawBytes: new TextEncoder().encode(raw).byteLength,
      payloadBytes: new TextEncoder().encode(prepared.payload).byteLength,
      offlineSeconds: prepared.offlineSeconds,
      summary: prepared.summary,
      maxLongTaskMs: Math.max(0, ...longTasks),
    };
  }, { raw, fixtureSavedAt, offlineSeconds: OFFLINE_SECONDS });

  expect(result.rawBytes).toBeGreaterThan(1_000_000);
  expect(result.payloadBytes).toBeGreaterThan(1_000_000);
  expect(result.summary.integrity).toBe("valid");
  expect(result.summary.stateVersion).toBe(46);
  expect(result.summary.entityCount).toBeGreaterThan(0);
  expect(result.maxLongTaskMs).toBeLessThan(200);
  console.info("cloud-upload-large-save-metrics", JSON.stringify(result));
});
