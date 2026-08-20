import type { PwaUpdateStatus } from "./pwa";

export interface PwaUpdateStatusCopy {
  key: `pwa.update.${PwaUpdateStatus}`;
  text: string;
  tone: "neutral" | "ready" | "warning" | "error";
}

const COPY: Record<PwaUpdateStatus, PwaUpdateStatusCopy> = {
  idle: { key: "pwa.update.idle", text: "等待版本检查", tone: "neutral" },
  checking: { key: "pwa.update.checking", text: "正在检查网页版本", tone: "neutral" },
  "up-to-date": { key: "pwa.update.up-to-date", text: "已是最新版本", tone: "ready" },
  "downloaded-await-restart": {
    key: "pwa.update.downloaded-await-restart",
    text: "新版本已下载，重启网页后切换",
    tone: "ready",
  },
  "network-unavailable": {
    key: "pwa.update.network-unavailable",
    text: "网络不可用，当前缓存仍可继续使用",
    tone: "warning",
  },
  "version-check-failed": {
    key: "pwa.update.version-check-failed",
    text: "版本检查失败，当前版本仍可继续使用",
    tone: "error",
  },
  "stable-fallback": {
    key: "pwa.update.stable-fallback",
    text: "正在使用上一稳定缓存，联网后会自动检查",
    tone: "warning",
  },
};

export function pwaUpdateStatusCopy(status: PwaUpdateStatus): PwaUpdateStatusCopy {
  return COPY[status];
}

