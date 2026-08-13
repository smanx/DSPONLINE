import { ReactFlowProvider } from "@xyflow/react";
import { useEffect } from "react";
import { FactoryGame } from "./App";
import type { LoadedGame } from "./game/storage";
import { useAppLocale } from "./i18n/locale";
import "./styles/mobile-shell.css";
import "./styles/mobile-factory.css";
import "./styles/mobile-workspaces.css";

interface FactoryRuntimeProps {
  launchId: number;
  initialLoad: LoadedGame;
  onReturnToMenu: () => void;
  onOpenReleaseNotes: () => void;
}

export default function FactoryRuntime({ launchId, initialLoad, onReturnToMenu, onOpenReleaseNotes }: FactoryRuntimeProps) {
  const { locale } = useAppLocale();
  useEffect(() => {
    if (locale !== "en") return;
    void import("./i18n/catalogEnglish").then(({ registerGameCatalogEnglish }) => registerGameCatalogEnglish());
  }, [locale]);
  return (
    <ReactFlowProvider key={launchId}>
      <FactoryGame initialLoad={initialLoad} onReturnToMenu={onReturnToMenu} onOpenReleaseNotes={onOpenReleaseNotes} />
    </ReactFlowProvider>
  );
}
