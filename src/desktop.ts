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
  platform: string;
  channel: "stable" | "beta" | "nightly";
  channelLabel: string;
  version: string;
  update: DesktopUpdateStatus;
}

export interface DesktopBridge {
  isDesktop: true;
  setFontScale: (scale: number) => Promise<{ scale: number; zoomFactor: number }>;
  getReleaseInfo: () => Promise<DesktopReleaseInfo>;
  requestApi: (request: DesktopApiRequest) => Promise<DesktopApiResponse>;
  requestApiTransfer: (request: DesktopApiTransferRequest, body: ArrayBuffer) => Promise<DesktopApiTransferResponse>;
  cancelApiRequest: (requestId: string) => void;
  checkForUpdates: () => Promise<DesktopUpdateStatus>;
  downloadUpdate: () => Promise<DesktopUpdateStatus>;
  installUpdate: () => Promise<{ accepted: boolean }>;
  confirmUpdateReady: () => Promise<void>;
  onPrepareForUpdate: (listener: () => void) => () => void;
  onUpdateStatus: (listener: (status: DesktopUpdateStatus) => void) => () => void;
}

export interface DesktopApiRequest {
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  requestId?: string;
  timeoutMs?: number;
  expectedResponseBytes?: number;
}

export interface DesktopApiTransferRequest extends Omit<DesktopApiRequest, "body"> {
  requestId: string;
  bodyByteLength: number;
}

export interface DesktopApiResponse {
  ok: boolean;
  status: number;
  body: string;
  headers: Record<string, string>;
}

export interface DesktopApiTransferResponse extends Omit<DesktopApiResponse, "body"> {
  bodyBuffer: ArrayBuffer;
}

export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { dspDesktop?: DesktopBridge }).dspDesktop ?? null;
}
