import { spawn } from "node:child_process";

const platform = process.argv[2];
if (platform !== "desktop" && platform !== "android") throw new Error("Usage: node scripts/build-platform.mjs <desktop|android>");
const requestedChannel = process.env.DSP_RELEASE_CHANNEL?.trim().toLowerCase() || "stable";
const channel = ["stable", "beta", "nightly"].includes(requestedChannel) ? requestedChannel : "stable";
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("build-platform.mjs must be launched from an npm script");
const child = spawn(process.execPath, [npmCli, "run", "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_APP_PLATFORM: platform,
    VITE_API_BASE_URL: "https://dsponline.cn/api",
    VITE_RELEASE_CHANNEL: channel,
  },
});
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });
