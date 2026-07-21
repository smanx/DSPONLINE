import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FactoryGame } from "./App";
import type { LoadedGame } from "./game/storage";

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
