import { defineConfig, devices } from "@playwright/test";

const requestedPort = Number(process.env.DSP_E2E_PORT ?? 4319);
if (!Number.isSafeInteger(requestedPort) || requestedPort < 1024 || requestedPort > 65_535) {
  throw new Error("DSP_E2E_PORT must be an available user port");
}
const baseURL = `http://127.0.0.1:${requestedPort}`;
const apiProxyTarget = process.env.DSP_E2E_API_PROXY_TARGET?.trim() || "http://127.0.0.1:65534";
const webCommand = process.env.DSP_E2E_USE_PREVIEW === "1"
  ? `npm run preview -- --port ${requestedPort}`
  : `npm run dev -- --port ${requestedPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
  ],
  webServer: {
    command: webCommand,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      DSP_API_PROXY_TARGET: apiProxyTarget,
    },
  },
});
