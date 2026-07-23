import { execFile, spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";

const execFileAsync = promisify(execFile);
const argumentsByName = new Map(process.argv.slice(2).map((argument) => {
  const separator = argument.indexOf("=");
  return separator < 0 ? [argument.replace(/^--/, ""), "true"] : [argument.slice(2, separator), argument.slice(separator + 1)];
}));
const executablePath = resolve(argumentsByName.get("browser") ?? "C:/Program Files/Google/Chrome/Application/chrome.exe");
const savePath = resolve(argumentsByName.get("save") ?? "D:/360安全浏览器下载/dsp-idle-save-2026-07-23.json");
const url = argumentsByName.get("url") ?? "http://127.0.0.1:4318/?factory=1";
const durationSeconds = Math.max(10, Number(argumentsByName.get("duration") ?? 1_800));
const intervalSeconds = Math.max(5, Math.min(durationSeconds, Number(argumentsByName.get("interval") ?? 300)));
const warmupSeconds = Math.max(0, Number(argumentsByName.get("warmup") ?? 60));
const label = (argumentsByName.get("label") ?? basename(executablePath, ".exe")).replace(/[^a-zA-Z0-9_-]/g, "-");
const outputPath = resolve(argumentsByName.get("output") ?? `artifacts/performance/memory-${label}-${Date.now()}.json`);
const disableWorker = argumentsByName.get("disable-worker") === "true";
const pauseSimulation = argumentsByName.get("paused") === "true";
const manualCdp = argumentsByName.get("manual-cdp") === "true";

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function browserProcessMemory(profileDirectory) {
  const escaped = profileDirectory.replaceAll("'", "''");
  const script = `
    $rows = Get-CimInstance Win32_Process | Where-Object { $_.Name -notmatch 'powershell' -and $_.CommandLine -like '*${escaped}*' }
    $result = foreach ($row in $rows) {
      $process = Get-Process -Id $row.ProcessId -ErrorAction SilentlyContinue
      if (-not $process) { continue }
      $role = if ($row.CommandLine -match '--type=([^ ]+)') { $Matches[1] } else { 'browser' }
      [PSCustomObject]@{ pid = $row.ProcessId; role = $role; workingSetBytes = [int64]$process.WorkingSet64; privateBytes = [int64]$process.PrivateMemorySize64 }
    }
    @($result) | ConvertTo-Json -Compress
  `;
  try {
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], { maxBuffer: 4 * 1024 * 1024 });
    const parsed = JSON.parse(stdout.trim() || "[]");
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function metricMap(metrics) {
  return Object.fromEntries(metrics.map(({ name, value }) => [name, value]));
}

const profileDirectory = await mkdtemp(join(tmpdir(), `dspidle-memory-${label}-`));
let context;
let browser;
let browserProcess;
try {
  const raw = JSON.parse(await readFile(savePath, "utf8"));
  raw.savedAt = Date.now();
  delete raw.checksum;
  if (pauseSimulation && raw.state) raw.state.paused = true;
  const isolatedSave = JSON.stringify(raw);

  if (manualCdp) {
    const debuggingPort = 9_500 + Math.floor(Math.random() * 300);
    browserProcess = spawn(executablePath, [
      `--remote-debugging-port=${debuggingPort}`,
      `--user-data-dir=${profileDirectory}`,
      "--headless=new",
      "--no-first-run",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--js-flags=--expose-gc",
      "about:blank",
    ], { windowsHide: true, stdio: "ignore" });
    let endpoint;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/version`);
        if (response.ok) {
          const version = await response.json();
          endpoint = version.webSocketDebuggerUrl;
          break;
        }
      } catch {
        // Browser endpoint is still starting.
      }
      await delay(200);
    }
    if (!endpoint) throw new Error("浏览器没有开放隔离的 CDP 调试端口");
    browser = await chromium.connectOverCDP(endpoint);
    context = browser.contexts()[0];
  } else {
    context = await chromium.launchPersistentContext(profileDirectory, {
      executablePath,
      headless: true,
      args: ["--js-flags=--expose-gc", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"],
      viewport: { width: 1440, height: 900 },
    });
  }
  const page = context.pages()[0] ?? await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(({ save, withoutWorker }) => {
    window.localStorage.setItem("dsp-idle-network.save.v1", save);
    window.localStorage.setItem("dsp-idle-network.release-notes.seen.v1", "2026-07-24-v0.9.0");
    window.sessionStorage.setItem("dsp-idle-network.test-bypass-menu", "1");
    if (withoutWorker) Object.defineProperty(window, "Worker", { configurable: true, value: undefined });
  }, { save: isolatedSave, withoutWorker: disableWorker });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator(".game-shell").waitFor({ state: "visible", timeout: 120_000 });
  await page.locator(`.game-shell[data-simulation-worker="${disableWorker ? "fallback" : "active"}"]`).waitFor({ state: "attached", timeout: 120_000 });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("HeapProfiler.enable");
  const browserVersion = await cdp.send("Browser.getVersion");
  if (warmupSeconds > 0) await delay(warmupSeconds * 1_000);
  const startedAt = Date.now();
  const samples = [];

  const sample = async () => {
    await cdp.send("HeapProfiler.collectGarbage");
    await delay(500);
    const [performanceResult, heap, dom, processes, application] = await Promise.all([
      cdp.send("Performance.getMetrics"),
      cdp.send("Runtime.getHeapUsage"),
      cdp.send("Memory.getDOMCounters"),
      browserProcessMemory(profileDirectory),
      page.evaluate(() => ({
        entityCount: document.querySelectorAll(".react-flow__node").length,
        edgeCount: document.querySelectorAll(".react-flow__edge").length,
        workerActive: document.querySelector(".game-shell")?.getAttribute("data-simulation-worker") ?? "unknown",
        visibility: document.visibilityState,
      })),
    ]);
    const performance = metricMap(performanceResult.metrics);
    samples.push({
      elapsedSeconds: Math.round((Date.now() - startedAt) / 100) / 10,
      heap: { usedBytes: heap.usedSize, totalBytes: heap.totalSize },
      dom,
      performance: {
        jsHeapUsedBytes: performance.JSHeapUsedSize ?? null,
        jsHeapTotalBytes: performance.JSHeapTotalSize ?? null,
        nodeCount: performance.Nodes ?? null,
        documentCount: performance.Documents ?? null,
        listenerCount: performance.JSEventListeners ?? null,
        taskDurationSeconds: performance.TaskDuration ?? null,
      },
      application: { ...application, workerCount: page.workers().length, workerUrls: page.workers().map((worker) => worker.url()) },
      processes,
    });
  };

  await sample();
  while ((Date.now() - startedAt) / 1_000 < durationSeconds) {
    await delay(Math.min(intervalSeconds * 1_000, Math.max(0, durationSeconds * 1_000 - (Date.now() - startedAt))));
    await sample();
  }

  const first = samples[0];
  const last = samples.at(-1);
  const report = {
    schemaVersion: 1,
    label,
    executablePath,
    browserVersion,
    url,
    saveBytes: Buffer.byteLength(isolatedSave),
    durationSeconds,
    intervalSeconds,
    warmupSeconds,
    disableWorker,
    pauseSimulation,
    manualCdp,
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date().toISOString(),
    summary: {
      forcedGcHeapDeltaBytes: last.heap.usedBytes - first.heap.usedBytes,
      domNodeDelta: last.dom.nodes - first.dom.nodes,
      listenerDelta: (last.performance.listenerCount ?? 0) - (first.performance.listenerCount ?? 0),
      sampleCount: samples.length,
    },
    samples,
  };
  await mkdir(resolve(outputPath, ".."), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ outputPath, summary: report.summary })}\n`);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  else await context?.close().catch(() => undefined);
  browserProcess?.kill();
  if (profileDirectory.startsWith(join(tmpdir(), "dspidle-memory-"))) {
    await rm(profileDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}
