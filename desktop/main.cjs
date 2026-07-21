const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("node:path");
const { channels, resolveReleaseChannel } = require("./release-channels.cjs");

const isDevelopment = Boolean(process.env.DSP_DESKTOP_DEV_URL);
const channelId = resolveReleaseChannel(process.env.DSP_RELEASE_CHANNEL);
const channel = channels[channelId];
let mainWindow = null;
let updater = null;
let zoomTimer = null;
let fontScale = 1;
const DESKTOP_BASE_SCALE = 0.8;
let updateState = { state: isDevelopment ? "development" : "idle", message: isDevelopment ? "开发环境不检查更新" : "尚未检查", channel: channelId };

function applyReadableDesktopZoom() {
  if (!mainWindow || mainWindow.isDestroyed()) return 1;
  // Preserve the adaptive desktop layout, with a quieter 80% visual baseline.
  // The user-facing 100% setting maps to this tuned baseline.
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
  mainWindow?.webContents.send("desktop:update-status", updateState);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#0b100e",
    title: "DSP极简网络",
    show: isDevelopment,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  if (isDevelopment) {
    void mainWindow.loadURL(process.env.DSP_DESKTOP_DEV_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
    mainWindow.once("ready-to-show", () => {
      mainWindow.maximize();
      scheduleReadableDesktopZoom();
      mainWindow.show();
    });
    mainWindow.on("resize", scheduleReadableDesktopZoom);
  }
}

function configureAutoUpdater() {
  if (isDevelopment || !app.isPackaged || process.env.DSP_DISABLE_UPDATES === "1") return;
  // electron-updater is deliberately loaded only in packaged builds so web and
  // development workflows do not require an update endpoint.
  try {
    const updateUrl = process.env.DSP_UPDATE_URL || channel.url;
    if (updateUrl.includes("updates.example.invalid")) {
      publishUpdateState({ state: "idle", message: "尚未配置更新源" });
      return;
    }
    ({ autoUpdater: updater } = require("electron-updater"));
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = true;
    updater.channel = channelId;
    updater.allowPrerelease = channel.allowPrerelease;
    updater.setFeedURL({ provider: "generic", url: updateUrl });
    updater.on("checking-for-update", () => publishUpdateState({ state: "checking", message: "正在检查更新" }));
    updater.on("update-available", (info) => publishUpdateState({ state: "available", message: `发现版本 ${info.version}`, version: info.version }));
    updater.on("update-not-available", () => publishUpdateState({ state: "up-to-date", message: "已是最新版本" }));
    updater.on("download-progress", (progress) => publishUpdateState({ state: "downloading", message: "正在下载更新", progress: Math.round(progress.percent) }));
    updater.on("update-downloaded", (info) => publishUpdateState({ state: "downloaded", message: "更新已下载，重启后安装", version: info.version }));
    updater.on("error", (error) => publishUpdateState({ state: "error", message: error.message || "更新检查失败" }));
  } catch (error) {
    updater = null;
    publishUpdateState({ state: "error", message: `自动更新不可用：${error instanceof Error ? error.message : "初始化失败"}` });
  }
}

ipcMain.handle("desktop:release-info", () => ({
  isDesktop: true,
  channel: channelId,
  channelLabel: channel.label,
  version: app.getVersion(),
  update: updateState,
}));

ipcMain.handle("desktop:set-font-scale", (_event, requestedScale) => {
  fontScale = [0.8, 1, 1.25, 1.5].includes(requestedScale) ? requestedScale : 1;
  return { scale: fontScale, zoomFactor: applyReadableDesktopZoom() };
});

ipcMain.handle("desktop:check-for-updates", async () => {
  if (!updater) return updateState;
  try {
    await updater.checkForUpdates();
  } catch (error) {
    publishUpdateState({ state: "error", message: error instanceof Error ? error.message : "更新检查失败" });
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

app.whenReady().then(() => {
  configureAutoUpdater();
  createWindow();
  if (updater) void updater.checkForUpdates().catch((error) => {
    publishUpdateState({ state: "error", message: error instanceof Error ? error.message : "更新检查失败" });
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error) => {
  console.error("Desktop startup failed", error);
  dialog.showErrorBox("启动失败", `DSP极简网络无法启动：${error instanceof Error ? error.message : "未知错误"}`);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
