import { recordClientError, recordClientErrors, type ClientErrorRecord } from "./diagnostics";
import { reportCloudError } from "./cloud";

let installed = false;
let queuedLongTasks: Array<Omit<ClientErrorRecord, "id" | "occurredAt">> = [];
let longTaskFlushTimer: number | null = null;

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

function flushQueuedLongTasks(): void {
  if (longTaskFlushTimer !== null) {
    window.clearTimeout(longTaskFlushTimer);
    longTaskFlushTimer = null;
  }
  const batch = queuedLongTasks;
  queuedLongTasks = [];
  const entries = recordClientErrors(batch);
  if (entries.length === 0) return;
  const peak = entries.reduce((maximum, entry) => {
    const duration = Number(/(\d+) ms/.exec(entry.message)?.[1] ?? 0);
    return Math.max(maximum, duration);
  }, 0);
  void reportCloudError(`主线程长任务批次：${entries.length} 次，峰值 ${peak} ms`, {
    kind: "long-task-batch",
    count: entries.length,
    peakMs: peak,
    firstAt: entries[0].occurredAt,
    lastAt: entries.at(-1)?.occurredAt,
    build: __BUILD_ID__,
    userAgent: navigator.userAgent,
  });
}

function queueLongTask(message: string): void {
  queuedLongTasks.push({ kind: "long-task", message: message.slice(0, 4000) });
  if (queuedLongTasks.length >= 10) {
    flushQueuedLongTasks();
    return;
  }
  if (longTaskFlushTimer === null) longTaskFlushTimer = window.setTimeout(flushQueuedLongTasks, 1_000);
}

export function installClientMonitoring(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("pagehide", flushQueuedLongTasks);
  window.addEventListener("error", (event) => report("error", event.message || "未知脚本错误", event.error instanceof Error ? event.error.stack : undefined, `${event.filename}:${event.lineno}:${event.colno}`));
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    report("rejection", reason instanceof Error ? reason.message : String(reason), reason instanceof Error ? reason.stack : undefined);
  });
  if ("PerformanceObserver" in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration >= 250) queueLongTask(`主线程阻塞 ${Math.round(entry.duration)} ms`);
        }
      });
      observer.observe({ type: "longtask", buffered: true });
    } catch {
      // Long-task observation is not available in every browser engine.
    }
  }
}
