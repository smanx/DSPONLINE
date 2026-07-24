import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidRes = path.join(root, "android", "app", "src", "main", "res");
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome" });
const page = await browser.newPage();

function logoSvg({ background = true, round = false, wordmark = false } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet">
    ${background ? `<rect width="1000" height="1000" rx="${round ? 500 : 160}" fill="#111514"/>` : ""}
    <g transform="${wordmark ? "translate(0 -95)" : ""}">
      <circle cx="500" cy="500" r="285" fill="none" stroke="#65cbb1" stroke-width="62"/>
      <path d="M225 500h550M500 225v550" stroke="#e1b452" stroke-width="48" stroke-linecap="round"/>
      <circle cx="500" cy="500" r="76" fill="#e1b452"/>
    </g>
    ${wordmark ? '<text x="500" y="855" fill="#dce8e4" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="74" font-weight="600">DSP极简网络</text><text x="500" y="920" fill="#79a89c" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" letter-spacing="8">FACTORY NETWORK</text>' : ""}
  </svg>`;
}

async function render(target, width, height, svg, pageBackground = "transparent") {
  await mkdir(path.dirname(target), { recursive: true });
  await page.setViewportSize({ width, height });
  await page.setContent(`<style>*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:${pageBackground}}svg{display:block;width:100%;height:100%}</style>${svg}`);
  await page.screenshot({ path: target, omitBackground: pageBackground === "transparent" });
}

for (const [density, iconSize, foregroundSize] of [
  ["mdpi", 48, 108],
  ["hdpi", 72, 162],
  ["xhdpi", 96, 216],
  ["xxhdpi", 144, 324],
  ["xxxhdpi", 192, 432],
]) {
  const directory = path.join(androidRes, `mipmap-${density}`);
  await render(path.join(directory, "ic_launcher.png"), iconSize, iconSize, logoSvg());
  await render(path.join(directory, "ic_launcher_round.png"), iconSize, iconSize, logoSvg({ round: true }));
  await render(path.join(directory, "ic_launcher_foreground.png"), foregroundSize, foregroundSize, logoSvg({ background: false }));
}

for (const [directory, width, height] of [
  ["drawable", 480, 320],
  ["drawable-land-mdpi", 480, 320],
  ["drawable-land-hdpi", 800, 480],
  ["drawable-land-xhdpi", 1280, 720],
  ["drawable-land-xxhdpi", 1600, 960],
  ["drawable-land-xxxhdpi", 1920, 1280],
  ["drawable-port-mdpi", 320, 480],
  ["drawable-port-hdpi", 480, 800],
  ["drawable-port-xhdpi", 720, 1280],
  ["drawable-port-xxhdpi", 960, 1600],
  ["drawable-port-xxxhdpi", 1280, 1920],
]) {
  const shortest = Math.min(width, height);
  const logoWidth = Math.round(shortest * 0.48);
  const logoHeight = Math.round(logoWidth * 1.16);
  const paddingX = Math.floor((width - logoWidth) / 2);
  const paddingY = Math.floor((height - logoHeight) / 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#090d0c"/><svg x="${paddingX}" y="${paddingY}" width="${logoWidth}" height="${logoHeight}" viewBox="0 0 1000 1000">${logoSvg({ background: false, wordmark: true }).replace(/^<svg[^>]*>|<\/svg>$/g, "")}</svg></svg>`;
  await render(path.join(androidRes, directory, "splash.png"), width, height, svg, "#090d0c");
}

await render(path.join(root, "build", "icon.png"), 512, 512, logoSvg());
await browser.close();
console.log("Native launcher, splash, and desktop icon assets generated");
