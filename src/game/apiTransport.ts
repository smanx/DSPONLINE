import { getDesktopBridge } from "../desktop";
import { CLOUD_TRANSFER_CONTRACT, cloudRequestTimeoutMs, createCloudRequestId } from "./cloudTransferContract";
import { androidApiFetch } from "./androidApiTransport";

function requestHeaders(headers?: HeadersInit): Record<string, string> {
  const normalized: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => { normalized[key] = value; });
  return normalized;
}

function exactArrayBuffer(value: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value;
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

async function transferableRequestBody(body: BodyInit): Promise<ArrayBuffer> {
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return exactArrayBuffer(body);
  if (typeof Blob !== "undefined" && body instanceof Blob) return body.arrayBuffer();
  if (typeof body === "string") return new TextEncoder().encode(body).buffer as ArrayBuffer;
  throw new TypeError("桌面 API 正文类型不受支持");
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const androidResponse = await androidApiFetch(input, init);
  if (androidResponse) return androidResponse;
  const bridge = getDesktopBridge();
  if (!bridge || !/^https:\/\//i.test(input)) return fetch(input, init);
  const target = new URL(input);
  const path = `${target.pathname}${target.search}`.replace(/^\/api(?=\/)/, "");
  const headers = requestHeaders(init.headers);
  const useTransfer = init.body != null && typeof init.body !== "string"
    || /^\/cloud-save(?:\?|$)/.test(path) && (init.method?.toUpperCase() === "PUT" || init.method == null);
  if (useTransfer) {
    const requestId = headers[CLOUD_TRANSFER_CONTRACT.requestIdHeader] || createCloudRequestId();
    headers[CLOUD_TRANSFER_CONTRACT.requestIdHeader] = requestId;
    const body = init.body == null ? new ArrayBuffer(0) : await transferableRequestBody(init.body);
    const abort = () => bridge.cancelApiRequest(requestId);
    if (init.signal?.aborted) {
      abort();
      throw new DOMException("云存档上传已取消", "AbortError");
    }
    init.signal?.addEventListener("abort", abort, { once: true });
    try {
      const expectedResponseBytes = init.method?.toUpperCase() === "PUT"
        ? 1024 * 1024
        : CLOUD_TRANSFER_CONTRACT.singleSaveResponseLimitBytes;
      const originalBytes = Number(headers[CLOUD_TRANSFER_CONTRACT.originalBytesHeader] ?? 0);
      const timeoutRequestBytes = Math.max(body.byteLength, Number.isFinite(originalBytes) ? originalBytes : 0);
      const response = await bridge.requestApiTransfer({
        path,
        method: init.method,
        headers,
        requestId,
        bodyByteLength: body.byteLength,
        timeoutMs: cloudRequestTimeoutMs(timeoutRequestBytes, expectedResponseBytes),
        expectedResponseBytes,
      }, body);
      return new Response(response.status === 204 || response.status === 205 ? null : response.bodyBuffer, {
        status: response.status,
        headers: response.headers,
      });
    } finally {
      init.signal?.removeEventListener("abort", abort);
    }
  }
  const response = await bridge.requestApi({
    path,
    method: init.method,
    headers,
    body: typeof init.body === "string" ? init.body : undefined,
    timeoutMs: cloudRequestTimeoutMs(typeof init.body === "string" ? new TextEncoder().encode(init.body).byteLength : 0),
  });
  return new Response(response.status === 204 || response.status === 205 ? null : response.body, {
    status: response.status,
    headers: response.headers,
  });
}
