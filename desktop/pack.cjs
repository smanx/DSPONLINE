const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createReleaseChannels, optionalHttpsUrl, resolveReleaseChannel } = require("./release-channels.cjs");

const builderEntry = require.resolve("electron-builder/cli");
const mode = process.argv[2] || "pack";
const releaseChannel = resolveReleaseChannel(process.env.DSP_RELEASE_CHANNEL);
const updateBaseUrl = optionalHttpsUrl(process.env.DSP_UPDATE_BASE_URL, "Desktop update base URL");
const cloudApiBaseUrl = optionalHttpsUrl(process.env.DSP_DESKTOP_API_BASE_URL, "Desktop cloud API base URL");
const channels = createReleaseChannels({
  updateBaseUrl,
  stableUrl: process.env.DSP_UPDATE_STABLE_URL,
  betaUrl: process.env.DSP_UPDATE_BETA_URL,
  nightlyUrl: process.env.DSP_UPDATE_NIGHTLY_URL,
});
const publishUrl = optionalHttpsUrl(process.env.DSP_DESKTOP_PUBLISH_URL, "Desktop publish URL")
  || channels[releaseChannel].url
  || "https://updates.invalid/dsp-idle";

function runBuilder(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [builderEntry, ...args], {
      stdio: "inherit",
      env: { ...process.env, DSP_DESKTOP_PUBLISH_URL: publishUrl },
    });
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function main() {
  if (!["pack", "dist"].includes(mode)) throw new Error(`Unsupported desktop build mode: ${mode}`);
  const builderArgs = [
    ...(mode === "pack" ? ["--dir"] : []),
    `--config.extraMetadata.releaseChannel=${releaseChannel}`,
    ...(updateBaseUrl ? [`--config.extraMetadata.updateBaseUrl=${updateBaseUrl}`] : []),
    ...(cloudApiBaseUrl ? [`--config.extraMetadata.cloudApiBaseUrl=${cloudApiBaseUrl}`] : []),
  ];
  const standardResult = await runBuilder(builderArgs);
  if (standardResult === 0) return;

  // Some Windows security scanners briefly hold the freshly extracted Electron
  // directory, making electron-builder's final rename fail with EPERM. Reuse
  // that complete temporary distribution instead of downloading it again.
  const outputDir = path.resolve("release");
  const temporaryDist = path.join(outputDir, "win-unpacked.tmp");
  if (mode !== "pack" || !fs.existsSync(temporaryDist)) process.exit(standardResult);

  const fallbackOutput = path.resolve("release-fallback");
  console.warn("标准目录包被 Windows 文件锁阻塞，使用已解压 Electron 分发重试。", fallbackOutput);
  const fallbackResult = await runBuilder([
    "--dir",
    `--config.extraMetadata.releaseChannel=${releaseChannel}`,
    ...(updateBaseUrl ? [`--config.extraMetadata.updateBaseUrl=${updateBaseUrl}`] : []),
    ...(cloudApiBaseUrl ? [`--config.extraMetadata.cloudApiBaseUrl=${cloudApiBaseUrl}`] : []),
    `--config.directories.output=${fallbackOutput}`,
    `--config.electronDist=${temporaryDist}`,
  ]);
  process.exit(fallbackResult);
}

void main();
