import type { ContentPackRuntimeSnapshot } from "./contentPacks";
import type { PureIdleMacroMode, PureIdleMacroSummary } from "./pureIdleMacro";
import type { PureIdleMacroWorkerRequest, PureIdleMacroWorkerResponse } from "./pureIdleMacro.worker";
import type { GameState } from "./types";

export interface PureIdleMacroFinalResult {
  state: GameState;
  summary: PureIdleMacroSummary;
  rawBytes: number;
  durationMs: number;
}

interface PendingRequest {
  operation: PureIdleMacroWorkerRequest["type"];
  timer: number;
  resolve: (response: PureIdleMacroWorkerResponse) => void;
  reject: (error: Error) => void;
}

type PureIdleMacroWorkerRequestInput = PureIdleMacroWorkerRequest extends infer Request
  ? Request extends { id: number } ? Omit<Request, "id"> : never
  : never;

export class PureIdleMacroClient {
  private worker: Worker;
  private nextId = 0;
  private pending = new Map<number, PendingRequest>();
  private closed = false;

  constructor() {
    this.worker = new Worker(new URL("./pureIdleMacro.worker.ts", import.meta.url), {
      type: "module",
      name: "pure-idle-macro",
    });
    this.worker.onmessage = (event: MessageEvent<PureIdleMacroWorkerResponse>) => {
      const request = this.pending.get(event.data.id);
      if (!request) return;
      this.pending.delete(event.data.id);
      window.clearTimeout(request.timer);
      if (event.data.type === "error") {
        request.reject(new Error(event.data.message));
        return;
      }
      request.resolve(event.data);
    };
    this.worker.onerror = () => this.failAll(new Error("纯挂机 Worker 崩溃，恢复日志仍保持有效"));
  }

  get busy(): boolean {
    return this.pending.size > 0;
  }

  private failAll(error: Error): void {
    for (const request of this.pending.values()) {
      window.clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
    this.close();
  }

  private request(request: PureIdleMacroWorkerRequestInput, timeoutMs: number): Promise<PureIdleMacroWorkerResponse> {
    if (this.closed) return Promise.reject(new Error("纯挂机 Worker 已关闭"));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${request.type === "initialize" ? "启动校准" : request.type === "advance" ? "宏观结算" : "停止校验"}超过安全等待时间`));
        this.close();
      }, timeoutMs);
      this.pending.set(id, { operation: request.type, timer, resolve, reject });
      try {
        this.worker.postMessage({ ...request, id } as PureIdleMacroWorkerRequest);
      } catch (error) {
        window.clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error("无法向纯挂机 Worker 发送任务"));
      }
    });
  }

  async initialize(
    state: GameState,
    mode: PureIdleMacroMode,
    registry: ContentPackRuntimeSnapshot,
  ): Promise<PureIdleMacroSummary> {
    const response = await this.request({ type: "initialize", state, mode, registry }, 60_000);
    if (response.type !== "ready") throw new Error("纯挂机 Worker 没有返回校准结果");
    return response.summary;
  }

  async advance(targetWallSeconds: number): Promise<PureIdleMacroSummary> {
    const response = await this.request({ type: "advance", targetWallSeconds }, 60_000);
    if (response.type !== "advanced") throw new Error("纯挂机 Worker 没有返回宏观结算摘要");
    return response.summary;
  }

  async finalize(targetWallSeconds: number): Promise<PureIdleMacroFinalResult> {
    const response = await this.request({ type: "finalize", targetWallSeconds }, 90_000);
    if (response.type !== "finalized") throw new Error("纯挂机 Worker 没有返回最终存档");
    return {
      state: response.state,
      summary: response.summary,
      rawBytes: response.rawBytes,
      durationMs: response.durationMs,
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.worker.terminate();
    for (const request of this.pending.values()) {
      window.clearTimeout(request.timer);
      request.reject(new Error("纯挂机 Worker 已终止"));
    }
    this.pending.clear();
  }
}
