export interface PwaRuntimeState {
  supported: boolean;
  installed: boolean;
  installAvailable: boolean;
  updateAvailable: boolean;
  registration: ServiceWorkerRegistration | null;
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let installPrompt: InstallPromptEvent | null = null;
let state: PwaRuntimeState = {
  supported: typeof navigator !== "undefined" && "serviceWorker" in navigator,
  installed: typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches,
  installAvailable: false,
  updateAvailable: false,
  registration: null,
};
const listeners = new Set<(value: PwaRuntimeState) => void>();
let updateReloadPending = false;

function publish(changes: Partial<PwaRuntimeState>): void {
  state = { ...state, ...changes };
  listeners.forEach((listener) => listener(state));
}

export function getPwaRuntimeState(): PwaRuntimeState {
  return state;
}

export function subscribePwaRuntime(listener: (value: PwaRuntimeState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export async function registerPwa(): Promise<void> {
  if (!state.supported || !import.meta.env.PROD) return;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    publish({ installAvailable: true });
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    publish({ installed: true, installAvailable: false });
  });
  try {
    const registration = await navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(__BUILD_ID__)}`);
    publish({ registration, updateAvailable: Boolean(registration.waiting) });
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) publish({ updateAvailable: true, registration });
      });
    });
    window.setInterval(() => void registration.update(), 30 * 60 * 1000);
  } catch {
    publish({ supported: false });
  }
}

export async function requestPwaInstall(): Promise<boolean> {
  if (!installPrompt) return false;
  await installPrompt.prompt();
  const choice = await installPrompt.userChoice;
  if (choice.outcome === "accepted") {
    installPrompt = null;
    publish({ installAvailable: false });
    return true;
  }
  return false;
}

export function activateWaitingPwaWorker(
  worker: Pick<ServiceWorker, "postMessage">,
  serviceWorker: Pick<ServiceWorkerContainer, "addEventListener"> = navigator.serviceWorker,
): boolean {
  if (!updateReloadPending) {
    updateReloadPending = true;
    serviceWorker.addEventListener("controllerchange", () => {
      updateReloadPending = false;
      window.location.reload();
    }, { once: true });
  }
  worker.postMessage({ type: "SKIP_WAITING" });
  return true;
}

export function applyPwaUpdate(): boolean {
  const worker = state.registration?.waiting;
  return worker ? activateWaitingPwaWorker(worker) : false;
}
