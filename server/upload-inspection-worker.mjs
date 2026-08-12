import { parentPort } from "node:worker_threads";
import { inspectDecodedCloudSaveUpload } from "./index.mjs";

function publicError(error) {
  return {
    message: typeof error?.message === "string" ? error.message : "云存档后台检查失败，请稍后重试",
    statusCode: Number.isInteger(error?.statusCode) ? error.statusCode : 503,
    code: typeof error?.code === "string" ? error.code : "UPLOAD_INSPECTION_FAILED",
    retryAfterSeconds: Number.isInteger(error?.retryAfterSeconds) ? error.retryAfterSeconds : null,
  };
}

parentPort?.once("message", ({ buffer, descriptor }) => {
  try {
    const result = inspectDecodedCloudSaveUpload(Buffer.from(buffer), descriptor, { returnPayloadBuffer: true });
    result.workerHeapBytes = process.memoryUsage().heapUsed;
    const transfers = result.payloadBuffer instanceof ArrayBuffer ? [result.payloadBuffer] : [];
    parentPort.postMessage({ ok: true, result }, transfers);
  } catch (error) {
    parentPort.postMessage({ ok: false, error: publicError(error) });
  }
});
