import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./theme.css";
import { installAnalytics } from "./game/analytics";
import { installClientMonitoring } from "./game/monitoring";
import { finishNativeLaunch, initializeNativeRuntime, isNativeApp } from "./nativeApp";
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
import { resolveApplicationRoute } from "./game/applicationRoute";

// Apply the device-only theme before the first React paint. The legacy
// GameState theme is still read for old saves, but it is no longer the source
// of the initial document color and therefore cannot cause a dark flash.
initializeDocumentTheme();
const nativeRuntime = initializeNativeRuntime();
initializeDocumentLocale();
installClientMonitoring();
const applicationRoute = resolveApplicationRoute(window.location.pathname);
if (applicationRoute.kind !== "admin") installAnalytics();

async function mountApplication(): Promise<void> {
  if (applicationRoute.kind === "game") await initializeLocalSaveStore();
  const application = applicationRoute.kind === "admin"
    ? await importWithRecovery(() => import("./components/AdminDashboard"), "管理后台模块").then(({ AdminDashboard }) => <AdminDashboard />)
    : applicationRoute.kind === "public-station"
      ? await importWithRecovery(() => import("./components/PublicStationPage"), "公开空间站页面").then(({ PublicStationPage }) => <PublicStationPage publicId={applicationRoute.publicId} />)
      : await importWithRecovery(() => import("./GameLauncher"), "游戏启动模块").then(({ App }) => <App />);
  createRoot(document.getElementById("root")!).render(<StrictMode><AppLocaleProvider>{application}</AppLocaleProvider></StrictMode>);
  await nativeRuntime.catch(() => undefined);
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  await finishNativeLaunch();
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

if (import.meta.env.PROD && !isNativeApp()) window.addEventListener("load", () => void registerPwa());
