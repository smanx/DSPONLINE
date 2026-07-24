import { spawn } from "node:child_process";

const platform = process.argv[2];
if (platform !== "desktop" && platform !== "android") throw new Error("Usage: node scripts/build-platform.mjs <desktop|android>");
const requestedChannel = process.env.DSP_RELEASE_CHANNEL?.trim().toLowerCase() || "stable";
const channel = ["stable", "beta", "nightly"].includes(requestedChannel) ? requestedChannel : "stable";
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("build-platform.mjs must be launched from an npm script");
function optionalHttpsUrl(value, label) {
  if (!value?.trim()) return "";
  const target = new URL(value.trim());
  if (target.protocol !== "https:") throw new Error(`${label} must use HTTPS`);
  return target.toString().replace(/\/$/, "");
}
const apiBaseUrl = optionalHttpsUrl(
  platform === "desktop" ? process.env.DSP_DESKTOP_API_BASE_URL : process.env.DSP_ANDROID_API_BASE_URL,
  `${platform} API base URL`,
);
const androidUpdateBaseUrl = optionalHttpsUrl(process.env.DSP_ANDROID_UPDATE_BASE_URL, "Android update base URL");
const androidUpdateManifestUrl = platform === "android" && androidUpdateBaseUrl
  ? `${androidUpdateBaseUrl}/${channel}.json`
  : "";
const publicAppOrigin = optionalHttpsUrl(process.env.DSP_ANDROID_PUBLIC_ORIGIN, "Android public app origin");
const child = spawn(process.execPath, [npmCli, "run", "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_APP_PLATFORM: platform,
    VITE_API_BASE_URL: apiBaseUrl,
    VITE_ANDROID_UPDATE_MANIFEST_URL: androidUpdateManifestUrl,
    VITE_PUBLIC_APP_ORIGIN: publicAppOrigin,
    VITE_RELEASE_CHANNEL: channel,
  },
});
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });
