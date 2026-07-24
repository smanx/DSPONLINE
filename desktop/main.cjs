const { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { createReleaseChannels, optionalHttpsUrl, resolveReleaseChannel } = require("./release-channels.cjs");
const packageMetadata = require("../package.json");

const isDevelopment = Boolean(process.env.DSP_DESKTOP_DEV_URL);
const channels = createReleaseChannels({
  updateBaseUrl: process.env.DSP_UPDATE_BASE_URL || packageMetadata.updateBaseUrl,
  stableUrl: process.env.DSP_UPDATE_STABLE_URL,
  betaUrl: process.env.DSP_UPDATE_BETA_URL,
  nightlyUrl: process.env.DSP_UPDATE_NIGHTLY_URL,
});
const channelId = resolveReleaseChannel(process.env.DSP_RELEASE_CHANNEL || packageMetadata.releaseChannel);
const channel = channels[channelId];
const configuredApiBaseUrl = optionalHttpsUrl(
  process.env.DSP_DESKTOP_API_BASE_URL || packageMetadata.cloudApiBaseUrl,
  "Desktop cloud API base URL",
);
const apiBaseUrl = configuredApiBaseUrl ? new URL(`${configuredApiBaseUrl}/`) : null;
const allowedApiMethods = new Set(["GET", "POST", "PUT", "DELETE"]);
const maximumRequestBytes = 8 * 1024 * 1024;
const maximumResponseBytes = 32 * 1024 * 1024;
const DESKTOP_BASE_SCALE = 0.8;
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000;

let mainWindow = null;
let updater = null;
let zoomTimer = null;
let windowStateTimer = null;
let updateTimer = null;
let fontScale = 1;
let updateState = {
  state: isDevelopment ? "development" : "idle",
  message: isDevelopment ? "开发环境不检查更新" : channel.url ? "尚未检查" : "此构建未配置更新源",
  channel: channelId,
};

function windowStateFile() {
  return path.join(app.getPath("userData"), "window-state.json");
}

function readWindowState() {
  try {
    const value = JSON.parse(fs.readFileSync(windowStateFile(), "utf8"));
    const bounds = value?.bounds;
    if (![bounds?.x, bounds?.y, bounds?.width, bounds?.height].every(Number.isFinite)) return null;
    if (bounds.width < 1024 || bounds.height < 680) return null;
    return { bounds, maximized: value.maximized === true };
  } catch {
    return null;
  }
}

function visibleWindowState() {
  const saved = readWindowState();
  if (!saved) return null;
  const display = screen.getDisplayMatching(saved.bounds);
  const area = display.workArea;
  const horizontalOverlap = Math.max(0, Math.min(saved.bounds.x + saved.bounds.width, area.x + area.width) - Math.max(saved.bounds.x, area.x));
  const verticalOverlap = Math.max(0, Math.min(saved.bounds.y + saved.bounds.height, area.y + area.height) - Math.max(saved.bounds.y, area.y));
  return horizontalOverlap >= 160 && verticalOverlap >= 120 ? saved : null;
}

function persistWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const file = windowStateFile();
    const temporary = `${file}.tmp`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify({
      bounds: mainWindow.isMaximized() ? mainWindow.getNormalBounds() : mainWindow.getBounds(),
      maximized: mainWindow.isMaximized(),
    }));
    fs.renameSync(temporary, file);
  } catch {
    // Window state is optional and must never block shutdown.
  }
}

function scheduleWindowStateSave() {
  if (windowStateTimer) clearTimeout(windowStateTimer);
  windowStateTimer = setTimeout(() => {
    windowStateTimer = null;
    persistWindowState();
  }, 250);
}

function applyReadableDesktopZoom() {
  if (!mainWindow || mainWindow.isDestroyed()) return 1;
  const contentWidth = mainWindow.getContentBounds().width;
  const adaptiveScale = isDevelopment ? 1 : Math.max(1, Math.min(2, contentWidth / 1120));
  const zoomFactor = Math.max(0.64, Math.min(2.4, adaptiveScale * DESKTOP_BASE_SCALE * fontScale));
  mainWindow.webContents.setZoomFactor(Number(zoomFactor.toFixed(2)));
  return zoomFactor;
}

function scheduleReadableDesktopZoom() {
  if (zoomTimer) clearTimeout(zoomTimer);
  zoomTimer = setTimeout(() => {
    zoomTimer = null;
    applyReadableDesktopZoom();
  }, 120);
}

function publishUpdateState(next) {
  updateState = { ...updateState, ...next, channel: channelId };
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("desktop:update-status", updateState);
}

function trustedSender(event) {
  return Boolean(mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents);
}

function resolveApiRequestUrl(requestPath) {
  if (!apiBaseUrl) throw new Error("此构建未配置云服务地址");
  if (typeof requestPath !== "string" || !requestPath.startsWith("/") || requestPath.includes("\\")) throw new Error("API 路径无效");
  const basePath = apiBaseUrl.pathname.endsWith("/") ? apiBaseUrl.pathname : `${apiBaseUrl.pathname}/`;
  const target = new URL(requestPath.replace(/^\/+/, ""), new URL(basePath, apiBaseUrl.origin));
  if (target.protocol !== "https:" || target.origin !== apiBaseUrl.origin || !target.pathname.startsWith(basePath)) throw new Error("API 地址未获授权");
  return target;
}

async function requestCloudApi(event, request) {
  if (!trustedSender(event)) throw new Error("API 调用来源无效");
  const method = typeof request?.method === "string" ? request.method.toUpperCase() : "GET";
  if (!allowedApiMethods.has(method)) throw new Error("API 请求方法无效");
  const target = resolveApiRequestUrl(request?.path);
  const body = request?.body == null ? undefined : request.body;
  if (body != null && typeof body !== "string") throw new Error("API 请求正文无效");
  if (body && Buffer.byteLength(body, "utf8") > maximumRequestBytes) throw new Error("API 请求正文过大");
  const headers = new Headers();
  for (const [name, value] of Object.entries(request?.headers ?? {})) {
    const normalized = name.toLowerCase();
    if ((normalized === "content-type" || normalized === "authorization") && typeof value === "string") headers.set(normalized, value);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(target, { method, headers, body, redirect: "error", signal: controller.signal });
    const responseLength = Number(response.headers.get("content-length") || 0);
    if (responseLength > maximumResponseBytes) throw new Error("云服务响应过大");
    const responseBody = await response.text();
    if (Buffer.byteLength(responseBody, "utf8") > maximumResponseBytes) throw new Error("云服务响应过大");
    return {
      ok: response.ok,
      status: response.status,
      body: responseBody,
      headers: { "content-type": response.headers.get("content-type") || "application/json" },
    };
  } finally {
    clearTimeout(timer);
  }
}

function allowLoadedNavigation(url) {
  if (isDevelopment) {
    try { return new URL(url).origin === new URL(process.env.DSP_DESKTOP_DEV_URL).origin; } catch { return false; }
  }
  return url.startsWith("file://");
}

function openExternalUrl(url) {
  try {
    const target = new URL(url);
    if (target.protocol === "https:") void shell.openExternal(target.toString());
  } catch {
    // Invalid external links are ignored.
  }
}

function createWindow() {
  const saved = visibleWindowState();
  mainWindow = new BrowserWindow({
    width: saved?.bounds.width ?? 1500,
    height: saved?.bounds.height ?? 960,
    x: saved?.bounds.x,
    y: saved?.bounds.y,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#0b100e",
    title: "DSP极简网络",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (allowLoadedNavigation(url)) return;
    event.preventDefault();
    openExternalUrl(url);
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason === "clean-exit") return;
    dialog.showMessageBox({
      type: "error",
      title: "渲染进程异常",
      message: "游戏界面发生异常，重新打开应用后会从最近一次本地存档恢复。",
      detail: `原因：${details.reason}`,
    }).catch(() => undefined);
  });
  mainWindow.on("resize", () => {
    scheduleReadableDesktopZoom();
    scheduleWindowStateSave();
  });
  mainWindow.on("move", scheduleWindowStateSave);
  mainWindow.on("close", persistWindowState);
  mainWindow.on("closed", () => { mainWindow = null; });

  if (isDevelopment) {
    void mainWindow.loadURL(process.env.DSP_DESKTOP_DEV_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
  mainWindow.once("ready-to-show", () => {
    if (saved?.maximized || !saved) mainWindow.maximize();
    scheduleReadableDesktopZoom();
    mainWindow.show();
  });
}

function configureAutoUpdater() {
  if (isDevelopment || !app.isPackaged || process.env.DSP_DISABLE_UPDATES === "1") return;
  try {
    const updateUrl = process.env.DSP_UPDATE_URL || channel.url;
    if (!updateUrl) return;
    const parsedUpdateUrl = new URL(updateUrl);
    if (parsedUpdateUrl.protocol !== "https:") {
      publishUpdateState({ state: "error", message: "更新源必须使用 HTTPS" });
      return;
    }
    ({ autoUpdater: updater } = require("electron-updater"));
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = true;
    updater.allowPrerelease = channel.allowPrerelease;
    updater.setFeedURL({ provider: "generic", url: parsedUpdateUrl.toString().replace(/\/$/, "") });
    updater.on("checking-for-update", () => publishUpdateState({ state: "checking", message: "正在检查更新", progress: undefined }));
    updater.on("update-available", (info) => publishUpdateState({ state: "available", message: `发现版本 ${info.version}`, version: info.version, progress: undefined }));
    updater.on("update-not-available", () => publishUpdateState({ state: "up-to-date", message: "已是最新版本", progress: undefined }));
    updater.on("download-progress", (progress) => publishUpdateState({ state: "downloading", message: "正在下载更新", progress: Math.round(progress.percent) }));
    updater.on("update-downloaded", (info) => publishUpdateState({ state: "downloaded", message: "更新已下载，重启后安装", version: info.version, progress: 100 }));
    updater.on("error", (error) => publishUpdateState({ state: "error", message: error.message || "更新检查失败", progress: undefined }));
  } catch (error) {
    updater = null;
    publishUpdateState({ state: "error", message: `自动更新不可用：${error instanceof Error ? error.message : "初始化失败"}` });
  }
}

ipcMain.handle("desktop:release-info", () => ({
  isDesktop: true,
  platform: process.platform,
  channel: channelId,
  channelLabel: channel.label,
  version: app.getVersion(),
  update: updateState,
}));

ipcMain.handle("desktop:set-font-scale", (_event, requestedScale) => {
  fontScale = [0.8, 1, 1.25, 1.5, 2].includes(requestedScale) ? requestedScale : 1;
  return { scale: fontScale, zoomFactor: applyReadableDesktopZoom() };
});

ipcMain.handle("desktop:api-request", requestCloudApi);

ipcMain.handle("desktop:check-for-updates", async () => {
  if (!updater || updateState.state === "checking" || updateState.state === "downloading") return updateState;
  try {
    await updater.checkForUpdates();
  } catch (error) {
    publishUpdateState({ state: "error", message: error instanceof Error ? error.message : "更新检查失败" });
  }
  return updateState;
});

ipcMain.handle("desktop:download-update", async () => {
  if (!updater || updateState.state !== "available") return updateState;
  try {
    publishUpdateState({ state: "downloading", message: "正在下载更新", progress: 0 });
    await updater.downloadUpdate();
  } catch (error) {
    publishUpdateState({ state: "error", message: error instanceof Error ? error.message : "更新下载失败", progress: undefined });
  }
  return updateState;
});

ipcMain.handle("desktop:install-update", () => {
  if (updateState.state === "downloaded" && updater) {
    setImmediate(() => updater.quitAndInstall());
    return { accepted: true };
  }
  return { accepted: false };
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady().then(() => {
    app.setAppUserModelId("com.dspidle.network");
    Menu.setApplicationMenu(null);
    configureAutoUpdater();
    createWindow();
    if (updater) {
      setTimeout(() => void updater.checkForUpdates().catch((error) => {
        publishUpdateState({ state: "error", message: error instanceof Error ? error.message : "更新检查失败" });
      }), 15_000);
      updateTimer = setInterval(() => void updater.checkForUpdates().catch(() => undefined), UPDATE_CHECK_INTERVAL_MS);
    }
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  }).catch((error) => {
    console.error("Desktop startup failed", error);
    dialog.showErrorBox("启动失败", `DSP极简网络无法启动：${error instanceof Error ? error.message : "未知错误"}`);
    app.quit();
  });
}

app.on("before-quit", () => {
  persistWindowState();
  if (updateTimer) clearInterval(updateTimer);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
