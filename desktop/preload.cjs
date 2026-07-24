const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dspDesktop", {
  isDesktop: true,
  setFontScale: (scale) => ipcRenderer.invoke("desktop:set-font-scale", scale),
  getReleaseInfo: () => ipcRenderer.invoke("desktop:release-info"),
  requestApi: (request) => ipcRenderer.invoke("desktop:api-request", request),
  checkForUpdates: () => ipcRenderer.invoke("desktop:check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("desktop:download-update"),
  installUpdate: () => ipcRenderer.invoke("desktop:install-update"),
  onUpdateStatus: (listener) => {
    const handler = (_event, status) => listener(status);
    ipcRenderer.on("desktop:update-status", handler);
    return () => ipcRenderer.removeListener("desktop:update-status", handler);
  },
});
