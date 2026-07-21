import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import { App } from "./App";
import { installClientMonitoring } from "./game/monitoring";
import { registerPwa } from "./pwa";

installClientMonitoring();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.PROD) window.addEventListener("load", () => void registerPwa());
