import { ReactFlowProvider } from "@xyflow/react";
import { FactoryGame } from "./App";
import type { LoadedGame } from "./game/storage";
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
  return (
    <ReactFlowProvider key={launchId}>
      <FactoryGame initialLoad={initialLoad} onReturnToMenu={onReturnToMenu} onOpenReleaseNotes={onOpenReleaseNotes} />
    </ReactFlowProvider>
  );
}
