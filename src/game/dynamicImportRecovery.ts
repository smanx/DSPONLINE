declare const __BUILD_ID__: string;
const CURRENT_BUILD_ID = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "development";

export interface DynamicImportRecoveryState {
  status: "idle" | "retrying" | "failed" | "update-available";
  label: string;
  attempt: number;
  latestBuildId: string | null;
  message: string;
}

const IDLE_STATE: DynamicImportRecoveryState = {
  status: "idle",
  label: "",
  attempt: 0,
  latestBuildId: null,
  message: "",
};

let state = IDLE_STATE;
const listeners = new Set<() => void>();

function publish(next: DynamicImportRecoveryState): void {
  state = next;
  for (const listener of listeners) listener();
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error ?? "未知模块加载错误");
}

export function isDynamicImportFailure(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return error instanceof TypeError || [
    "failed to fetch dynamically imported module",
    "error loading dynamically imported module",
    "importing a module script failed",
    "loading chunk",
    "chunkloaderror",
    "module script",
  ].some((fragment) => message.includes(fragment));
}

async function readLatestBuildId(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL("version.json", document.baseURI);
    url.searchParams.set("t", String(Date.now()));
    const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return null;
    const payload = await response.json() as { buildId?: unknown };
    return typeof payload.buildId === "string" && payload.buildId ? payload.buildId : null;
  } catch {
    return null;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export async function importWithRecovery<T>(loader: () => Promise<T>, label: string): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const loaded = await loader();
      if (state.status !== "idle") publish(IDLE_STATE);
      return loaded;
    } catch (error) {
      lastError = error;
      if (!isDynamicImportFailure(error)) throw error;
      const latestBuildId = await readLatestBuildId();
      const updateAvailable = Boolean(latestBuildId && latestBuildId !== CURRENT_BUILD_ID);
      if (attempt < 3 && !updateAvailable) {
        publish({
          status: "retrying",
          label,
          attempt,
          latestBuildId,
          message: `${label}加载中断，正在自动重试（${attempt}/2）`,
        });
        await delay(attempt === 1 ? 180 : 600);
        continue;
      }
      publish({
        status: updateAvailable ? "update-available" : "failed",
        label,
        attempt,
        latestBuildId,
        message: updateAvailable
          ? "检测到游戏已更新，请重新加载最新版后继续。本地存档不会被清除。"
          : `${label}加载失败。请检查网络，或重新加载当前版本。`,
      });
      break;
    }
  }
  throw lastError;
}

export function getDynamicImportRecoveryState(): DynamicImportRecoveryState {
  return state;
}

export function subscribeDynamicImportRecovery(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function reloadLatestBuild(): void {
  const url = new URL(window.location.href);
  url.searchParams.set("reload", String(Date.now()));
  window.location.replace(url.toString());
}
