import { getDesktopBridge } from "../desktop";

function requestHeaders(headers?: HeadersInit): Record<string, string> {
  const normalized: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => { normalized[key] = value; });
  return normalized;
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const bridge = getDesktopBridge();
  if (!bridge || !/^https:\/\//i.test(input)) return fetch(input, init);
  if (init.body != null && typeof init.body !== "string") throw new TypeError("桌面 API 只接受 JSON 字符串正文");
  const target = new URL(input);
  const response = await bridge.requestApi({
    path: `${target.pathname}${target.search}`.replace(/^\/api(?=\/)/, ""),
    method: init.method,
    headers: requestHeaders(init.headers),
    body: typeof init.body === "string" ? init.body : undefined,
  });
  return new Response(response.status === 204 || response.status === 205 ? null : response.body, {
    status: response.status,
    headers: response.headers,
  });
}
