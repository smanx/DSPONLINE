import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./theme.css";
import { installAnalytics } from "./game/analytics";
import { installClientMonitoring } from "./game/monitoring";
import { finishNativeLaunch, initializeNativeRuntime, isNativeApp } from "./nativeApp";
import { registerPwa } from "./pwa";
import "./styles/native-app.css";
import { AppLocaleProvider, initializeDocumentLocale } from "./i18n/locale";

const nativeRuntime = initializeNativeRuntime();
initializeDocumentLocale();
installClientMonitoring();
const adminRoute = /^\/admin\/?$/.test(window.location.pathname);
if (!adminRoute) installAnalytics();

async function mountApplication(): Promise<void> {
  const application = adminRoute
    ? await import("./components/AdminDashboard").then(({ AdminDashboard }) => <AdminDashboard />)
    : await import("./GameLauncher").then(({ App }) => <App />);
  createRoot(document.getElementById("root")!).render(<StrictMode><AppLocaleProvider>{application}</AppLocaleProvider></StrictMode>);
  await nativeRuntime.catch(() => undefined);
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  await finishNativeLaunch();
}

void mountApplication();

if (import.meta.env.PROD && !isNativeApp()) window.addEventListener("load", () => void registerPwa());
