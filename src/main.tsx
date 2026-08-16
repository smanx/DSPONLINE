import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./theme.css";
import { installAnalytics } from "./game/analytics";
import { installClientMonitoring } from "./game/monitoring";
import { getDesktopBridge } from "./desktop";
import { registerPwa } from "./pwa";
import "./styles/native-app.css";
import "./styles/dynamic-import-recovery.css";
import "./styles/save-storage.css";
import "./styles/local-save-writer.css";
import "./styles/ui-clarity.css";
import { AppLocaleProvider, initializeDocumentLocale } from "./i18n/locale";
import { initializeLocalSaveStore } from "./game/localSaveStore";
import { importWithRecovery, reloadLatestBuild } from "./game/dynamicImportRecovery";
import { initializeDocumentTheme } from "./game/uiPreferences";

// Apply the device-only theme before the first React paint. The legacy
// GameState theme is still read for old saves, but it is no longer the source
// of the initial document color and therefore cannot cause a dark flash.
initializeDocumentTheme();
const startupPlatform = __APP_PLATFORM__ === "android"
  ? "android"
  : getDesktopBridge() ? "desktop" : "web";
document.documentElement.dataset.appPlatform = startupPlatform;
// Keep the Android bridge outside the static startup closure. Platform data is
// set synchronously above so native styles apply before the first React paint.
const nativeRuntime = __APP_PLATFORM__ === "android"
  ? importWithRecovery(() => import("./nativeApp"), "Android 原生运行时")
  : Promise.resolve(null);
const nativeInitialization = nativeRuntime.then((native) => native?.initializeNativeRuntime());
initializeDocumentLocale();
installClientMonitoring();
const adminRoute = /^\/admin\/?$/.test(window.location.pathname);
if (!adminRoute) installAnalytics();

async function mountApplication(): Promise<void> {
  if (!adminRoute) await initializeLocalSaveStore();
  const application = adminRoute
    ? await importWithRecovery(() => import("./components/AdminDashboard"), "管理后台模块").then(({ AdminDashboard }) => <AdminDashboard />)
    : await importWithRecovery(() => import("./GameLauncher"), "游戏启动模块").then(({ App }) => <App />);
  createRoot(document.getElementById("root")!).render(<StrictMode><AppLocaleProvider>{application}</AppLocaleProvider></StrictMode>);
  await nativeInitialization.catch(() => undefined);
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  await nativeRuntime.then((native) => native?.finishNativeLaunch()).catch(() => undefined);
}

void mountApplication().catch(() => {
  const root = document.getElementById("root");
  if (!root) return;
  const english = document.documentElement.lang === "en";
  root.replaceChildren();
  const panel = document.createElement("main");
  panel.className = "dynamic-import-fatal";
  panel.setAttribute("role", "alert");
  const title = document.createElement("strong");
  title.textContent = english ? "Page resources failed to load" : "页面资源载入失败";
  const detail = document.createElement("p");
  detail.textContent = english ? "Your local saves were not cleared. Reload the latest version to continue." : "本地存档不会被清除，请重新加载最新版。";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = english ? "Reload latest version" : "重新加载最新版";
  button.addEventListener("click", reloadLatestBuild);
  panel.append(title, detail, button);
  root.append(panel);
});

if (import.meta.env.PROD && startupPlatform === "web") window.addEventListener("load", () => void registerPwa());
