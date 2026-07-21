import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { ReleaseNotesDialog, hasSeenCurrentReleaseNotes, markCurrentReleaseNotesSeen } from "./components/ReleaseNotesDialog";
import { StartMenu } from "./components/StartMenu";
import type { LoadedGame } from "./game/storage";

const FactoryRuntime = lazy(() => import("./FactoryRuntime"));

function FactoryLoading() {
  return <div className="workspace-loading" role="status"><i /><span>正在载入行星工厂</span></div>;
}

export function App() {
  const [bypassMenu] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const forceMenu = params.get("menu") === "1";
    let bypassMenu = params.get("factory") === "1";
    try { bypassMenu ||= window.sessionStorage.getItem("dsp-idle-network.test-bypass-menu") === "1"; } catch { /* optional test flag */ }
    return !forceMenu && bypassMenu;
  });
  const [launch, setLaunch] = useState<{ id: number; loaded: LoadedGame } | null>(null);
  const [bypassLoading, setBypassLoading] = useState(bypassMenu);
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(() => !hasSeenCurrentReleaseNotes());
  const closeReleaseNotes = useCallback(() => {
    markCurrentReleaseNotesSeen();
    setReleaseNotesOpen(false);
  }, []);
  const openReleaseNotes = useCallback(() => setReleaseNotesOpen(true), []);

  useEffect(() => {
    if (!bypassMenu) return;
    let active = true;
    void import("./game/storage")
      .then(({ loadGame }) => {
        if (active) setLaunch({ id: Date.now(), loaded: loadGame() });
      })
      .finally(() => { if (active) setBypassLoading(false); });
    return () => { active = false; };
  }, [bypassMenu]);

  return (
    <>
      {!launch && bypassLoading ? <FactoryLoading /> : !launch ? (
        <StartMenu onEnterGame={(loaded) => setLaunch({ id: Date.now(), loaded })} onOpenReleaseNotes={openReleaseNotes} />
      ) : (
        <Suspense fallback={<FactoryLoading />}>
          <FactoryRuntime launchId={launch.id} initialLoad={launch.loaded} onReturnToMenu={() => setLaunch(null)} onOpenReleaseNotes={openReleaseNotes} />
        </Suspense>
      )}
      <ReleaseNotesDialog open={releaseNotesOpen} onClose={closeReleaseNotes} />
    </>
  );
}
