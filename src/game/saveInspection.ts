import { loadContentPackRegistry, type ContentPackRegistry } from "./contentPacks";
import { inspectSave, type SaveInspection } from "./storage";

let saveInspectionRequestId = 0;

/**
 * Keep file/cloud import parsing, checksum validation, and migration off the
 * UI thread. This orchestration deliberately lives outside storage.ts so the
 * worker may import the pure inspection implementation without forming a
 * worker-entry cycle during production bundling.
 */
export function inspectSaveInWorker(
  raw: string,
  contentPackRegistry: ContentPackRegistry = loadContentPackRegistry(),
): Promise<SaveInspection> {
  if (typeof Worker === "undefined") return Promise.resolve(inspectSave(raw, contentPackRegistry));
  const id = ++saveInspectionRequestId;
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./saveInspection.worker.ts", import.meta.url), { type: "module", name: "save-inspection" });
    } catch {
      resolve(inspectSave(raw, contentPackRegistry));
      return;
    }
    let settled = false;
    const finish = (inspection?: SaveInspection) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      resolve(inspection ?? inspectSave(raw, contentPackRegistry));
    };
    worker.onerror = () => finish();
    worker.onmessageerror = () => finish();
    worker.onmessage = (event: MessageEvent<{ id: number; inspection?: SaveInspection; error?: string }>) => {
      if (event.data.id !== id || event.data.error || !event.data.inspection) {
        finish();
        return;
      }
      finish(event.data.inspection);
    };
    try {
      worker.postMessage({ id, raw, registry: contentPackRegistry });
    } catch {
      finish();
    }
  });
}
