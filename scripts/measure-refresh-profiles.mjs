import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "@playwright/test";

const argumentsByName = new Map(process.argv.slice(2).map((argument) => {
  const separator = argument.indexOf("=");
  return separator < 0 ? [argument.replace(/^--/, ""), "true"] : [argument.slice(2, separator), argument.slice(separator + 1)];
}));
const executablePath = resolve(argumentsByName.get("browser") ?? "C:/Program Files/Google/Chrome/Application/chrome.exe");
const savePath = resolve(argumentsByName.get("save") ?? "D:/360安全浏览器下载/dsp-idle-save-2026-07-23.json");
const url = argumentsByName.get("url") ?? "http://127.0.0.1:4321/?factory=1";
const measurementSeconds = Math.max(5, Number(argumentsByName.get("duration") ?? 8));
const warmupSeconds = Math.max(1, Number(argumentsByName.get("warmup") ?? 3));
const outputPath = resolve(argumentsByName.get("output") ?? `artifacts/performance/refresh-profiles-${Date.now()}.json`);
const profiles = [
  ["auto", null],
  ["classic", 100],
  ["high", 200],
  ["balanced", 500],
  ["power-save", 1_000],
  ["low-spec", 1_500],
  ["extreme", 3_000],
];

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function metricMap(metrics) {
  return Object.fromEntries(metrics.map(({ name, value }) => [name, value]));
}

function percentile(values, ratio) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
}

const raw = JSON.parse(await readFile(savePath, "utf8"));
raw.savedAt = Date.now();
delete raw.checksum;
const isolatedSave = JSON.stringify(raw);
const browser = await chromium.launch({ executablePath, headless: true, args: ["--js-flags=--expose-gc", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"] });
const reports = [];
try {
  for (const [profile, configuredIntervalMs] of profiles) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.addInitScript(({ save, preference }) => {
      window.localStorage.setItem("dsp-idle-network.save.v1", save);
      window.localStorage.setItem("dsp-idle-network.release-notes.seen.v1", "2026-07-24-v0.9.0");
      window.localStorage.setItem("dsp-idle-network.production-refresh.v1", preference);
      window.sessionStorage.setItem("dsp-idle-network.test-bypass-menu", "1");
      const NativeWorker = window.Worker;
      const diagnostics = { latencies: [] };
      Object.defineProperty(window, "__DSP_REFRESH_BENCHMARK__", { configurable: true, value: diagnostics });
      class InstrumentedWorker extends NativeWorker {
        constructor(...args) {
          super(...args);
          this.submittedAt = new Map();
          this.addEventListener("message", (event) => {
            const id = event.data?.id;
            const startedAt = this.submittedAt.get(id);
            if (startedAt == null) return;
            diagnostics.latencies.push(performance.now() - startedAt);
            this.submittedAt.delete(id);
          });
        }
        postMessage(message, transferOrOptions) {
          if (Number.isInteger(message?.id)) this.submittedAt.set(message.id, performance.now());
          return super.postMessage(message, transferOrOptions);
        }
      }
      Object.defineProperty(window, "Worker", { configurable: true, writable: true, value: InstrumentedWorker });
    }, { save: isolatedSave, preference: profile });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.locator(".game-shell").waitFor({ state: "visible", timeout: 120_000 });
    await page.locator('.game-shell[data-simulation-worker="active"]').waitFor({ state: "attached", timeout: 120_000 });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    await cdp.send("HeapProfiler.enable");
    await delay(warmupSeconds * 1_000);
    await cdp.send("HeapProfiler.collectGarbage");
    await delay(250);
    const beforeMetrics = metricMap((await cdp.send("Performance.getMetrics")).metrics);
    const beforeHeap = await cdp.send("Runtime.getHeapUsage");
    await delay(measurementSeconds * 1_000);
    await cdp.send("HeapProfiler.collectGarbage");
    await delay(250);
    const afterMetrics = metricMap((await cdp.send("Performance.getMetrics")).metrics);
    const afterHeap = await cdp.send("Runtime.getHeapUsage");
    const application = await page.evaluate(() => {
      const shell = document.querySelector(".game-shell");
      const diagnostics = window.__DSP_REFRESH_BENCHMARK__;
      return {
        intervalMs: Number(shell?.getAttribute("data-production-refresh-ms") ?? 0),
        workerLatenciesMs: [...(diagnostics?.latencies ?? [])],
        entityCount: document.querySelectorAll(".react-flow__node").length,
        edgeCount: document.querySelectorAll(".react-flow__edge").length,
      };
    });
    const taskDurationSeconds = Math.max(0, (afterMetrics.TaskDuration ?? 0) - (beforeMetrics.TaskDuration ?? 0));
    reports.push({
      profile,
      configuredIntervalMs,
      effectiveIntervalMs: application.intervalMs,
      measurementSeconds,
      mainThreadTaskPercent: taskDurationSeconds / measurementSeconds * 100,
      forcedGcHeapDeltaBytes: afterHeap.usedSize - beforeHeap.usedSize,
      forcedGcHeapStartBytes: beforeHeap.usedSize,
      forcedGcHeapEndBytes: afterHeap.usedSize,
      workerLatencyMedianMs: percentile(application.workerLatenciesMs, 0.5),
      workerLatencyP95Ms: percentile(application.workerLatenciesMs, 0.95),
      workerSamples: application.workerLatenciesMs.length,
      entityCount: application.entityCount,
      edgeCount: application.edgeCount,
    });
    await context.close();
  }
} finally {
  await browser.close();
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  browser: executablePath,
  url,
  saveBytes: Buffer.byteLength(isolatedSave),
  warmupSeconds,
  measurementSeconds,
  reports,
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ outputPath, reports })}\n`);
