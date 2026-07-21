export type DesktopUpdateState = "development" | "idle" | "checking" | "available" | "up-to-date" | "downloading" | "downloaded" | "error";

export interface DesktopUpdateStatus {
  state: DesktopUpdateState;
  message: string;
  channel: "stable" | "beta" | "nightly";
  version?: string;
  progress?: number;
}

export interface DesktopReleaseInfo {
  isDesktop: true;
  channel: "stable" | "beta" | "nightly";
  channelLabel: string;
  version: string;
  update: DesktopUpdateStatus;
}

export interface DesktopBridge {
  isDesktop: true;
  setFontScale: (scale: number) => Promise<{ scale: number; zoomFactor: number }>;
  getReleaseInfo: () => Promise<DesktopReleaseInfo>;
  checkForUpdates: () => Promise<DesktopUpdateStatus>;
  installUpdate: () => Promise<{ accepted: boolean }>;
  onUpdateStatus: (listener: (status: DesktopUpdateStatus) => void) => () => void;
}

export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { dspDesktop?: DesktopBridge }).dspDesktop ?? null;
}
