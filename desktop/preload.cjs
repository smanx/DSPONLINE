const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dspDesktop", {
  isDesktop: true,
  setFontScale: (scale) => ipcRenderer.invoke("desktop:set-font-scale", scale),
  getReleaseInfo: () => ipcRenderer.invoke("desktop:release-info"),
  checkForUpdates: () => ipcRenderer.invoke("desktop:check-for-updates"),
  installUpdate: () => ipcRenderer.invoke("desktop:install-update"),
  onUpdateStatus: (listener) => {
    const handler = (_event, status) => listener(status);
    ipcRenderer.on("desktop:update-status", handler);
    return () => ipcRenderer.removeListener("desktop:update-status", handler);
  },
});
