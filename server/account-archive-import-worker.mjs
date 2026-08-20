import { readFile } from "node:fs/promises";
import { parentPort } from "node:worker_threads";

import cloudTransferContract from "./cloud-transfer-contract.json" with { type: "json" };
import { inspectDecodedCloudSaveUpload } from "./index.mjs";

function publicError(error) {
  return {
    message: typeof error?.message === "string" ? error.message : "归档内云存档检查失败",
    statusCode: Number.isInteger(error?.statusCode) ? error.statusCode : 400,
    code: typeof error?.code === "string" ? error.code : "ACCOUNT_ARCHIVE_SAVE_FORMAT_INVALID",
  };
}

parentPort?.once("message", async ({ file, checksum, size, mode }) => {
  let message;
  try {
    const raw = await readFile(file);
    if (raw.byteLength !== size) {
      const error = new Error("归档正文在权威检查前发生变化");
      error.code = "ACCOUNT_ARCHIVE_FILE_CHANGED";
      throw error;
    }
    const result = inspectDecodedCloudSaveUpload(raw, {
      direct: true,
      expectedRevision: 0,
      requestId: null,
      declaredOriginalBytes: size,
      payloadLimit: cloudTransferContract.savePayloadLimitBytes,
    });
    const publicResult = {
      payloadMode: result.payloadMode,
      validPayload: result.validPayload,
      legacyImplicitSpeedrun: result.legacyImplicitSpeedrun,
      tooLarge: result.tooLarge,
      payloadChecksum: result.payloadChecksum,
      payloadSize: result.payloadSize,
      summary: result.summary,
      integrity: result.integrity,
      payloadParseCount: result.payloadParseCount,
    };
    if (publicResult.payloadChecksum !== checksum || publicResult.payloadSize !== size || publicResult.payloadMode !== mode) {
      const error = new Error("归档内云存档 checksum、大小或模式不一致");
      error.code = "ACCOUNT_ARCHIVE_SAVE_FORMAT_INVALID";
      throw error;
    }
    message = { ok: true, result: publicResult };
  } catch (error) {
    message = { ok: false, error: publicError(error) };
  } finally {
    // Let the worker leave naturally after its result has entered the message
    // queue. Force-terminating immediately after `message` can race native
    // module teardown on Windows when an account archive contains many saves.
    parentPort?.postMessage(message);
    parentPort?.close();
  }
});
