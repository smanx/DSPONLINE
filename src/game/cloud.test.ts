/** @vitest-environment jsdom */
/** @vitest-environment-options {"url":"https://public.example.test"} */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLOUD_SYNC_STORAGE_KEY,
  CloudApiError,
  compareCloudSave,
  compareCloudSaveSummary,
  compressCloudRequestBody,
  fetchCloudPublicStatus,
  getCloudSyncMarker,
  markCloudSaveSynchronized,
  resumeCloudSession,
  summarizeCloudPayload,
  uploadCloudSave,
  uploadCloudSaveWithOptions,
  type CloudSaveMetadata,
} from "./cloud";
import { createInitialState, placeBuilding } from "./engine";
import { exportGame, importGame } from "./storage";
import { computeSaveStateChecksum } from "./saveEnvelopeIntegrity";

function payload(checksum: string, elapsedSeconds: number): string {
  return JSON.stringify({
    formatVersion: 2,
    savedAt: 1000 + elapsedSeconds,
    checksum,
    state: {
      version: 24,
      elapsedSeconds,
      activePlanetId: "home",
      entities: [{ id: "entity_1" }],
      research: { completedTechIds: ["electromagnetism"] },
      dysonSphere: { structurePoints: 2 },
      totalProduced: { universe_matrix: 3 },
    },
  });
}

function metadata(revision: number, cloudChecksum: string, source: string): CloudSaveMetadata {
  return {
    revision,
    updatedAt: 2000 + revision,
    size: source.length,
    checksum: cloudChecksum,
    summary: summarizeCloudPayload(source),
  };
}

function largePayload(targetPaddingBytes = 320_000): string {
  const envelope = JSON.parse(payload("state-large", 100)) as { formatVersion: number; state: Record<string, unknown> } & Record<string, unknown>;
  envelope.state.padding = "repeated-upload-data-".repeat(Math.ceil(targetPaddingBytes / 22));
  envelope.checksum = computeSaveStateChecksum(envelope.formatVersion, envelope.state as any);
  return JSON.stringify(envelope);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

class TestCompressionStream {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;

  constructor() {
    const transform = new TransformStream<Uint8Array, Uint8Array>({
      transform(_chunk, controller) {
        controller.enqueue(new Uint8Array([1, 2, 3, 4]));
      },
    });
    this.readable = transform.readable;
    this.writable = transform.writable;
  }
}

describe("cloud save synchronization markers", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("allows anonymous public status discovery on HTTP without opening account transport", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      activity: { enabled: false, status: "disabled", serverNow: 1 },
    }), { status: 200, headers: { "content-type": "application/json" } }));

    await expect(fetchCloudPublicStatus()).resolves.toMatchObject({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/public-status", expect.any(Object));
    fetchMock.mockClear();
    await expect(resumeCloudSession()).resolves.toMatchObject({ status: "anonymous", message: null });
    expect(fetchMock).toHaveBeenCalledWith("/api/health", expect.any(Object));
  });

  it("compares unbound, synchronized and one-sided changes", () => {
    const local = payload("state-a", 100);
    const cloud = metadata(1, "cloud-a", local);
    expect(compareCloudSave("user_a", local, cloud).state).toBe("synced");

    markCloudSaveSynchronized("user_a", cloud, local);
    expect(compareCloudSave("user_a", local, cloud).state).toBe("synced");
    expect(compareCloudSave("user_a", payload("state-b", 200), cloud).state).toBe("local-newer");
    expect(compareCloudSave("user_a", local, { ...cloud, revision: 2, checksum: "cloud-b" }).state).toBe("cloud-newer");
  });

  it("compares a Worker-provided summary without parsing the payload again", () => {
    const local = payload("state-a", 100);
    const cloud = metadata(1, "cloud-a", local);
    const summary = summarizeCloudPayload(local)!;
    expect(compareCloudSaveSummary("user_summary", summary, cloud).state).toBe("synced");
    markCloudSaveSynchronized("user_summary", cloud);
    expect(compareCloudSaveSummary("user_summary", { ...summary, elapsedSeconds: 101 }, cloud).state).toBe("synced");
  });

  it("requires an explicit choice when local and cloud both changed", () => {
    const original = payload("state-a", 100);
    const cloud = metadata(1, "cloud-a", original);
    markCloudSaveSynchronized("user_a", cloud, original);
    const changedCloud = metadata(2, "cloud-b", payload("state-c", 300));
    const comparison = compareCloudSave("user_a", payload("state-b", 200), changedCloud);
    expect(comparison.state).toBe("conflict");
    expect(comparison.localChanged).toBe(true);
    expect(comparison.cloudChanged).toBe(true);
  });

  it("keeps markers isolated per cloud account", () => {
    const local = payload("state-a", 100);
    const cloud = metadata(1, "cloud-a", local);
    markCloudSaveSynchronized("user_a", cloud, local);
    expect(JSON.parse(window.localStorage.getItem(CLOUD_SYNC_STORAGE_KEY) ?? "{}")["user_a:main"].revision).toBe(1);
    expect(compareCloudSave("user_b", payload("state-b", 200), cloud).state).toBe("unbound");
  });

  it("keeps all four save-slot markers independent while reading a legacy main marker", () => {
    const mainPayload = payload("state-main", 100);
    const slotPayload = payload("state-slot-1", 250);
    const main = metadata(3, "cloud-main", mainPayload);
    const manual = { ...metadata(1, "cloud-slot-1", slotPayload), slot: "1" as const };
    markCloudSaveSynchronized("user_slots", main, mainPayload, "main");
    markCloudSaveSynchronized("user_slots", manual, slotPayload, "1");

    expect(compareCloudSave("user_slots", mainPayload, main, "main").state).toBe("synced");
    expect(compareCloudSave("user_slots", slotPayload, manual, "1").state).toBe("synced");
    expect(getCloudSyncMarker("user_slots", "main")?.revision).toBe(3);
    expect(getCloudSyncMarker("user_slots", "1")?.revision).toBe(1);

    window.localStorage.setItem(CLOUD_SYNC_STORAGE_KEY, JSON.stringify({
      legacy_user: { userId: "legacy_user", revision: 4, cloudChecksum: "legacy-cloud", stateChecksum: "state-main", syncedAt: 1 },
    }));
    expect(getCloudSyncMarker("legacy_user", "main")).toMatchObject({ revision: 4, slot: "main" });
    expect(getCloudSyncMarker("legacy_user", "1")).toBeNull();
  });

  it("reads once, re-saves, and uploads a legacy ordinary-building quantumTarget save", async () => {
    let state = createInitialState();
    state.construction.storage_mk1 = 1;
    state.construction.interstellar_logistics_station = 1;
    state = placeBuilding(state, "storage_mk1", { x: 0, y: 0 });
    state = placeBuilding(state, "interstellar_logistics_station", { x: 300, y: 0 });
    const ordinary = state.entities.find((entity) => entity.buildingId === "storage_mk1")!;
    const legacy = JSON.parse(exportGame(state));
    legacy.state.entities.find((entity: Record<string, unknown>) => entity.id === ordinary.id).quantumTarget = false;
    legacy.checksum = computeSaveStateChecksum(legacy.formatVersion, legacy.state);
    const loaded = importGame(JSON.stringify(legacy));
    expect(loaded).not.toBeNull();
    const payload = exportGame(loaded!);
    const saved = JSON.parse(payload);
    expect(saved.state.entities.find((entity: Record<string, unknown>) => entity.id === ordinary.id)).not.toHaveProperty("quantumTarget");

    const cloudSave = { revision: 1, updatedAt: 2, size: payload.length, checksum: "server-checksum", summary: null };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ cloudSave }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    await expect(uploadCloudSave(payload, 0)).resolves.toMatchObject({ revision: 1 });
    expect(fetchMock).toHaveBeenCalledWith("/api/cloud-save", expect.objectContaining({ method: "PUT" }));
    const request = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
    expect(JSON.parse(String(request.body)).payload).toBe(payload);
  });

  it("streams gzip output before waiting for the compressed body", async () => {
    vi.stubGlobal("CompressionStream", TestCompressionStream);
    const source = largePayload();
    const cloudSave = metadata(1, "server-checksum", source);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ cloudSave }));

    await expect(uploadCloudSaveWithOptions(source, 0, "main", { verified: true })).resolves.toMatchObject({ revision: 1 });
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((request.headers as Record<string, string>)["content-encoding"]).toBe("gzip");
    expect(typeof (request.body as Blob).size).toBe("number");
    expect((request.body as Blob).size).toBeGreaterThan(0);
  });

  it("falls back to one raw JSON request when CompressionStream is unavailable", async () => {
    vi.stubGlobal("CompressionStream", undefined);
    const source = largePayload();
    const cloudSave = metadata(1, "server-checksum", source);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ cloudSave }));

    await expect(uploadCloudSaveWithOptions(source, 0, "main", { verified: true })).resolves.toMatchObject({ revision: 1 });
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((request.headers as Record<string, string>)?.["content-encoding"]).toBeUndefined();
    expect(typeof request.body).toBe("string");
  });

  it.each([256 * 1024, 1024 * 1024, 7 * 1024 * 1024, 20 * 1024 * 1024])(
    "disables gzip before Android native upload for a %i-byte request",
    async (size) => {
      vi.stubGlobal("CompressionStream", TestCompressionStream);
      await expect(compressCloudRequestBody("x".repeat(size), undefined, "android")).resolves.toBeNull();
    },
  );

  it("sends Android native cloud uploads as a raw JSON string without gzip headers", async () => {
    vi.stubGlobal("CompressionStream", TestCompressionStream);
    const source = largePayload();
    const cloudSave = metadata(1, "server-checksum", source);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ cloudSave }));

    await expect(uploadCloudSaveWithOptions(source, 0, "main", {
      verified: true,
      runtimePlatform: "android",
    })).resolves.toMatchObject({ revision: 1 });
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(typeof request.body).toBe("string");
    expect((request.headers as Record<string, string>)?.["content-encoding"]).toBeUndefined();
    expect(JSON.parse(String(request.body))).toMatchObject({ payload: source, expectedRevision: 0 });
  });

  it("retries exactly once as raw JSON after an actual gzip encoding rejection", async () => {
    vi.stubGlobal("CompressionStream", TestCompressionStream);
    const source = largePayload();
    const cloudSave = metadata(1, "server-checksum", source);
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ error: "请求压缩内容无效", code: "REQUEST_ENCODING_INVALID" }, 400))
      .mockResolvedValueOnce(jsonResponse({ cloudSave }));

    await expect(uploadCloudSaveWithOptions(source, 0, "main", { verified: true })).resolves.toMatchObject({ revision: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const compressedRequest = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const rawRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect((compressedRequest.headers as Record<string, string>)["content-encoding"]).toBe("gzip");
    expect(typeof rawRequest.body).toBe("string");
    expect((rawRequest.headers as Record<string, string>)?.["content-encoding"]).toBeUndefined();
    expect(JSON.parse(String(rawRequest.body))).toMatchObject({ payload: source, expectedRevision: 0 });
  });

  it("confirms a committed raw fallback after its response times out without sending a third upload", async () => {
    vi.stubGlobal("CompressionStream", TestCompressionStream);
    const source = largePayload();
    const cloudSave = metadata(1, "server-checksum", source);
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ error: "请求压缩内容无效", code: "REQUEST_ENCODING_INVALID" }, 400))
      .mockRejectedValueOnce(new DOMException("timed out", "AbortError"))
      .mockResolvedValueOnce(jsonResponse({ cloudSave }));

    await expect(uploadCloudSaveWithOptions(source, 0, "main", { verified: true })).resolves.toMatchObject({ revision: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(typeof (fetchMock.mock.calls[1]?.[1] as RequestInit).body).toBe("string");
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("/api/account");
  });

  it("falls back to raw JSON when the compression reader exceeds its safety timeout", async () => {
    vi.stubGlobal("CompressionStream", TestCompressionStream);
    const descriptor = Object.getOwnPropertyDescriptor(Blob.prototype, "stream");
    Object.defineProperty(Blob.prototype, "stream", {
      configurable: true,
      value: () => new ReadableStream<Uint8Array>({ pull: () => new Promise<void>(() => undefined) }),
    });
    const source = largePayload();
    const cloudSave = metadata(1, "server-checksum", source);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ cloudSave }));
    const startedAt = Date.now();
    try {
      await expect(uploadCloudSaveWithOptions(source, 0, "main", { verified: true })).resolves.toMatchObject({ revision: 1 });
    } finally {
      if (descriptor) Object.defineProperty(Blob.prototype, "stream", descriptor);
      else delete (Blob.prototype as unknown as { stream?: unknown }).stream;
    }
    expect(Date.now() - startedAt).toBeLessThan(7_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(typeof (fetchMock.mock.calls[0]?.[1] as RequestInit).body).toBe("string");
  }, 12_000);

  it("honors cancellation during compression without sending a raw fallback", async () => {
    vi.stubGlobal("CompressionStream", TestCompressionStream);
    const descriptor = Object.getOwnPropertyDescriptor(Blob.prototype, "stream");
    Object.defineProperty(Blob.prototype, "stream", {
      configurable: true,
      value: () => new ReadableStream<Uint8Array>({ pull: () => new Promise<void>(() => undefined) }),
    });
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    try {
      const pending = uploadCloudSaveWithOptions(largePayload(), 0, "main", { verified: true, signal: controller.signal });
      setTimeout(() => controller.abort(), 20);
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    } finally {
      if (descriptor) Object.defineProperty(Blob.prototype, "stream", descriptor);
      else delete (Blob.prototype as unknown as { stream?: unknown }).stream;
    }
    expect(fetchMock).not.toHaveBeenCalled();
  }, 12_000);

  it("confirms a committed request after a network timeout without creating a second revision", async () => {
    const source = largePayload();
    const cloudSave = metadata(1, "server-checksum", source);
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new DOMException("timed out", "AbortError"))
      .mockResolvedValueOnce(jsonResponse({ cloudSave }));

    await expect(uploadCloudSaveWithOptions(source, 0, "main", { verified: true })).resolves.toMatchObject({ revision: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/api/account");
  });

  it("retries once as raw JSON when the timed-out request did not commit", async () => {
    const source = largePayload();
    const cloudSave = metadata(1, "server-checksum", source);
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new DOMException("timed out", "AbortError"))
      .mockResolvedValueOnce(jsonResponse({ cloudSave: null, cloudSaves: {} }))
      .mockResolvedValueOnce(jsonResponse({ cloudSave }));

    await expect(uploadCloudSaveWithOptions(source, 0, "main", { verified: true })).resolves.toMatchObject({ revision: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const retry = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(typeof retry.body).toBe("string");
    expect((retry.headers as Record<string, string>)?.["content-encoding"]).toBeUndefined();
  });

  it("does not send a raw retry above 30 MiB after a timed-out gzip request did not commit", async () => {
    vi.stubGlobal("CompressionStream", TestCompressionStream);
    const source = "x".repeat(30 * 1024 * 1024 + 1);
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new DOMException("timed out", "AbortError"))
      .mockResolvedValueOnce(jsonResponse({ cloudSave: null, cloudSaves: {} }));

    await expect(uploadCloudSaveWithOptions(source, 0, "main", { verified: true })).rejects.toMatchObject({
      status: 413,
      payload: { code: "CLOUD_UPLOAD_RAW_FALLBACK_TOO_LARGE" },
    } satisfies Partial<CloudApiError>);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const initialUpload = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((initialUpload.headers as Record<string, string>)["content-encoding"]).toBe("gzip");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/api/account");
  });

  it("turns an unrelated newer cloud revision into a conflict after timeout", async () => {
    const source = largePayload();
    const other = metadata(1, "other-checksum", payload("different", 900));
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new DOMException("timed out", "AbortError"))
      .mockResolvedValueOnce(jsonResponse({ cloudSave: other }));

    await expect(uploadCloudSaveWithOptions(source, 0, "main", { verified: true })).rejects.toMatchObject({
      status: 409,
      payload: { cloudSave: other },
    } satisfies Partial<CloudApiError>);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("honors cancellation before compression and never sends a fallback request", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(compressCloudRequestBody(largePayload(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

});
