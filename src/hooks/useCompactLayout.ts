import { useEffect, useState } from "react";

export type CompactLayoutMode = "compact-portrait" | "compact-landscape" | "medium" | "desktop";

export interface CompactLayoutSnapshot {
  mode: CompactLayoutMode;
  width: number;
  height: number;
  isMobileShell: boolean;
  isPortrait: boolean;
}

function readCompactLayout(): CompactLayoutSnapshot {
  if (typeof window === "undefined") {
    return { mode: "desktop", width: 1280, height: 720, isMobileShell: false, isPortrait: false };
  }
  const width = Math.max(1, Math.round(window.visualViewport?.width ?? window.innerWidth));
  const height = Math.max(1, Math.round(window.visualViewport?.height ?? window.innerHeight));
  const compactLandscape = height < 560 && width < 1100;
  const mode: CompactLayoutMode = width < 600
    ? "compact-portrait"
    : compactLandscape
      ? "compact-landscape"
      : width < 900
        ? "medium"
        : "desktop";
  return {
    mode,
    width,
    height,
    isMobileShell: mode !== "desktop",
    isPortrait: height >= width,
  };
}

export function useCompactLayout(): CompactLayoutSnapshot {
  const [layout, setLayout] = useState(readCompactLayout);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const next = readCompactLayout();
        setLayout((current) => current.mode === next.mode && current.width === next.width && current.height === next.height
          ? current
          : next);
      });
    };
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  return layout;
}
