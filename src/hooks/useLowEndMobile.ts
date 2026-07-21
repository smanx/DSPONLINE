import { useEffect, useState } from "react";

interface NavigatorWithMemory extends Navigator {
  deviceMemory?: number;
}

export function detectLowEndMobile(): boolean {
  if (typeof window === "undefined" || !window.matchMedia("(pointer: coarse)").matches) return false;
  const navigatorWithMemory = navigator as NavigatorWithMemory;
  const memory = Number(navigatorWithMemory.deviceMemory ?? 0);
  const cores = Number(navigator.hardwareConcurrency ?? 0);
  return (memory > 0 && memory <= 4) || (cores > 0 && cores <= 4);
}

export function useLowEndMobile(): boolean {
  const [lowEnd, setLowEnd] = useState(detectLowEndMobile);

  useEffect(() => {
    const pointer = window.matchMedia("(pointer: coarse)");
    const update = () => setLowEnd(detectLowEndMobile());
    pointer.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      pointer.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return lowEnd;
}
