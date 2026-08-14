import type { ContentPackRegistry } from "./contentPacks";
import type { SimulationStateTransfer } from "./simulationRuntimeProtocol";
import type { SaveTransferVerification } from "./saveTransfer";
import { decodeVerifiedSaveTransferChunked, type SaveTransferDecodeProgress } from "./saveTransferDecode";
import type { SaveWorkerRequest, SaveWorkerResponse, SaveWorkerSummary } from "./saveWorkerProtocol";

export interface AuthoritativeSaveRequest {
  formatVersion: number;
  savedAt: number;
  kind: "primary" | "slot" | "snapshot";
  slot: "main" | 1 | 2 | 3;
  reason?: string;
  stateRevision: number;
  stateTransfer: SimulationStateTransfer;
  contentPackRegistry: ContentPackRegistry;
  includePayloadSha256?: boolean;
  onDecodeProgress?: (progress: SaveTransferDecodeProgress) => void;
  timeoutMs?: number;
}

export interface AuthoritativeSaveResult {
  raw: string;
  verification: SaveTransferVerification;
  payloadSha256?: string;
  durationMs: number;
  summary: SaveWorkerSummary;
  stateRevision: number;
  stateTransfer: SimulationStateTransfer;
}

export class AuthoritativeSaveWorkerError extends Error {
  constructor(message: string, readonly stateTransfer?: SimulationStateTransfer) {
    super(message);
    this.name = "AuthoritativeSaveWorkerError";
  }
}

let authoritativeSaveRequestId = 0;

/**
 * Transfer an exact simulation checkpoint through the save Worker and take its
 * ownership back after v2 envelope projection. A Worker crash can consume the
 * buffer permanently; callers must request a new checkpoint instead of
 * parsing or cloning the large state on the UI thread.
 */
export function serializeAuthoritativeCheckpointInWorker(request: AuthoritativeSaveRequest): Promise<AuthoritativeSaveResult> {
  if (typeof Worker === "undefined") {
    return Promise.reject(new AuthoritativeSaveWorkerError("当前环境不支持后台权威存档；请重新取得检查点"));
  }
  const id = ++authoritativeSaveRequestId;
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./save.worker.ts", import.meta.url), { type: "module", name: "save-serialization" });
    } catch {
      reject(new AuthoritativeSaveWorkerError("无法启动后台存档 Worker；检查点尚未移交", request.stateTransfer));
      return;
    }
    let settled = false;
    const timeout = setTimeout(() => {
      if (!finish()) return;
      reject(new AuthoritativeSaveWorkerError("后台权威存档超时；检查点所有权已丢失，请重新取得"));
    }, Math.max(1_000, request.timeoutMs ?? 30_000));
    const finish = () => {
      if (settled) return false;
      settled = true;
      clearTimeout(timeout);
      worker.terminate();
      return true;
    };
    worker.onerror = () => {
      if (!finish()) return;
      reject(new AuthoritativeSaveWorkerError("后台存档 Worker 异常；检查点所有权已丢失，请重新取得"));
    };
    worker.onmessage = (event: MessageEvent<SaveWorkerResponse>) => {
      if (event.data.id !== id || settled) return;
      const response = event.data;
      const returned = response.sourceStateTransfer;
      if (response.error) {
        finish();
        reject(new AuthoritativeSaveWorkerError(response.error, returned));
        return;
      }
      const { bytes, payloadChecksum, payloadSha256, byteLength, summary } = response;
      if (!(bytes instanceof ArrayBuffer) || !(returned?.buffer instanceof ArrayBuffer) || !payloadChecksum ||
        byteLength !== bytes.byteLength || returned.byteLength !== returned.buffer.byteLength ||
        response.sourceStateRevision !== request.stateRevision || !summary?.stateChecksum || summary.integrity !== "valid" ||
        (request.includePayloadSha256 && !/^[a-f0-9]{64}$/.test(payloadSha256 ?? ""))) {
        finish();
        reject(new AuthoritativeSaveWorkerError("后台存档回执与权威 revision 不匹配", returned));
        return;
      }
      const verification: SaveTransferVerification = {
        integrity: "valid",
        stateChecksum: summary.stateChecksum,
        payloadChecksum,
        byteLength,
      };
      void decodeVerifiedSaveTransferChunked(bytes, verification, { onProgress: request.onDecodeProgress })
        .then((raw) => {
          if (!finish()) return;
          resolve({
            raw,
            verification,
            ...(payloadSha256 ? { payloadSha256 } : {}),
            durationMs: Math.max(0, response.durationMs ?? 0),
            summary,
            stateRevision: response.sourceStateRevision!,
            stateTransfer: returned,
          });
        })
        .catch((error) => {
          if (!finish()) return;
          reject(new AuthoritativeSaveWorkerError(error instanceof Error ? error.message : "后台存档字节校验失败", returned));
        });
    };
    const workerRequest: SaveWorkerRequest = {
      id,
      formatVersion: request.formatVersion,
      savedAt: request.savedAt,
      kind: request.kind,
      slot: request.slot,
      ...(request.reason ? { reason: request.reason } : {}),
      stateTransfer: request.stateTransfer,
      sourceStateRevision: request.stateRevision,
      contentPackRegistry: request.contentPackRegistry,
      includePayloadSha256: request.includePayloadSha256,
    };
    try {
      worker.postMessage(workerRequest, [request.stateTransfer.buffer]);
    } catch (error) {
      finish();
      reject(new AuthoritativeSaveWorkerError(error instanceof Error ? error.message : "权威检查点无法移交给存档 Worker", request.stateTransfer));
    }
  });
}
