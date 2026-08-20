import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

async function readJson(response) {
  try { return await response.json(); }
  catch { return null; }
}

export async function probeApiReadiness({ baseUrl = "http://127.0.0.1:4330", timeoutMs = 5_000 } = {}) {
  const normalized = new URL(baseUrl);
  if (!["127.0.0.1", "::1", "localhost"].includes(normalized.hostname)) {
    throw new Error("readiness probe only accepts a loopback API origin");
  }
  const healthResponse = await fetch(new URL("/api/health", normalized), {
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const health = await readJson(healthResponse);
  if (healthResponse.status !== 200 || health?.ok !== true || health?.storage !== "sqlite") {
    throw new Error(`API health is not ready (HTTP ${healthResponse.status})`);
  }
  const readyResponse = await fetch(new URL("/api/ready", normalized), {
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (readyResponse.status === 404) {
    return { ok: true, writable: true, legacyHealthFallback: true, schemaVersion: health.schemaVersion, storageLayoutVersion: health.storageLayoutVersion };
  }
  const ready = await readJson(readyResponse);
  if (readyResponse.status !== 200 || ready?.writable !== true || ready?.shuttingDown !== false) {
    throw new Error(`API readiness is not writable (HTTP ${readyResponse.status})`);
  }
  return { ...ready, ok: true, legacyHealthFallback: false };
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try { return realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
}

if (isMainModule()) {
  probeApiReadiness({
    baseUrl: process.env.DSP_API_PROBE_BASE_URL || "http://127.0.0.1:4330",
    timeoutMs: Number(process.env.DSP_API_PROBE_TIMEOUT_MS || 5_000),
  }).then(
    (result) => console.log(JSON.stringify(result)),
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    },
  );
}
