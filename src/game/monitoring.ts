import { recordClientError } from "./diagnostics";
import { reportCloudError } from "./cloud";

let installed = false;

function report(kind: "error" | "rejection" | "long-task", message: string, stack?: string, location?: string): void {
  const entry = recordClientError({ kind, message: message.slice(0, 4000), stack: stack?.slice(0, 8000), location });
  void reportCloudError(entry.message, {
    kind: entry.kind,
    stack: entry.stack,
    location: entry.location,
    occurredAt: entry.occurredAt,
    build: __BUILD_ID__,
    userAgent: navigator.userAgent,
  });
}

export function installClientMonitoring(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (event) => report("error", event.message || "未知脚本错误", event.error instanceof Error ? event.error.stack : undefined, `${event.filename}:${event.lineno}:${event.colno}`));
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    report("rejection", reason instanceof Error ? reason.message : String(reason), reason instanceof Error ? reason.stack : undefined);
  });
  if ("PerformanceObserver" in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration >= 250) report("long-task", `主线程阻塞 ${Math.round(entry.duration)} ms`);
        }
      });
      observer.observe({ type: "longtask", buffered: true });
    } catch {
      // Long-task observation is not available in every browser engine.
    }
  }
}
