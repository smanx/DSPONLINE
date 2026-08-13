/** @vitest-environment jsdom */
/** @vitest-environment-options {"url":"https://public.example.test"} */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLOUD_ACCOUNT_ARCHIVE_CONTENT_TYPE,
  CloudAccountArchiveError,
  downloadCloudAccountArchive,
  fetchCloudQuota,
  normalizeCloudQuotaSnapshot,
  preflightCloudQuota,
  safeAccountArchiveFileName,
  type CloudQuotaMode,
  type CloudQuotaSlot,
} from "./cloudAccountArchive";

const TOKEN = "synthetic-secret-token";
const CHECKSUM = "a".repeat(64);
const MODES = ["normal", "speedrun"] as const;
const SLOTS = ["main", "1", "2", "3"] as const;

function usage(logicalBytes = 0) {
  return {
    logicalBytes,
    uniquePayloadBytes: logicalBytes,
    revisionCount: logicalBytes > 0 ? 1 : 0,
    remainingBytes: 1_000_000 - logicalBytes,
  };
}

function quotaSnapshot() {
  return {
    version: "cloud-quota-v1",
    limits: {
      revisionBytes: 33_553_408,
      slotBytes: 256 * 1024 * 1024,
      modeBytes: 512 * 1024 * 1024,
      accountBytes: 1024 * 1024 * 1024,
      historyRevisions: 20,
    },
    usage: {
      ...usage(360),
      modes: {
        normal: {
          ...usage(100),
          slots: {
            main: usage(10),
            "1": usage(20),
            "2": usage(30),
            "3": usage(40),
          },
        },
        speedrun: {
          ...usage(260),
          slots: {
            main: usage(50),
            "1": usage(60),
            "2": usage(70),
            "3": usage(80),
          },
        },
      },
    },
  };
}

function quotaPlan(mode: CloudQuotaMode, slot: CloudQuotaSlot, size = 123) {
  const snapshot = quotaSnapshot();
  return {
    accepted: true,
    reason: null,
    code: null,
    target: { mode, slot },
    limits: snapshot.limits,
    usage: snapshot.usage,
    incoming: { bytes: size, checksum: CHECKSUM },
    prune: { revisionCount: 1, logicalBytes: 10, revisions: [1] },
    projected: {
      accountLogicalBytes: 473,
      modeLogicalBytes: mode === "normal" ? 213 : 373,
      slotLogicalBytes: size,
      slotRevisionCount: 2,
      accountRemainingBytes: snapshot.limits.accountBytes - 473,
      modeRemainingBytes: snapshot.limits.modeBytes - (mode === "normal" ? 213 : 373),
      slotRemainingBytes: snapshot.limits.slotBytes - size,
    },
  };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function archiveResponse(
  chunks: Uint8Array[],
  options: { length?: number | string; contentType?: string; version?: string; disposition?: string } = {},
): Response {
  const actualLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": options.contentType ?? CLOUD_ACCOUNT_ARCHIVE_CONTENT_TYPE,
      "content-length": String(options.length ?? actualLength),
      "x-dsp-account-archive-version": options.version ?? "2",
      "content-disposition": options.disposition ?? 'attachment; filename="dsp-account-user-123.dspaccount.zip"',
    },
  });
}

function client(fetchImplementation: typeof fetch, signal?: AbortSignal) {
  return {
    apiBase: "/api/",
    authToken: TOKEN,
    fetch: fetchImplementation,
    signal,
  };
}

function transactionalWritable() {
  const chunks: Uint8Array[] = [];
  let committed = false;
  let aborted = false;
  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      chunks.push(chunk.slice());
    },
    close() {
      committed = true;
    },
    abort() {
      aborted = true;
    },
  });
  const abortSpy = vi.spyOn(writable, "abort");
  return {
    writable,
    abortSpy,
    bytes: () => chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0),
    committed: () => committed,
    aborted: () => aborted,
  };
}

describe("cloud account quota client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("strictly normalizes normal and speedrun usage for every cloud slot", () => {
    const normalized = normalizeCloudQuotaSnapshot(quotaSnapshot());
    expect(normalized.usage.logicalBytes).toBe(360);
    expect(normalized.usage.modes.normal.slots.main.logicalBytes).toBe(10);
    expect(normalized.usage.modes.normal.slots["3"].logicalBytes).toBe(40);
    expect(normalized.usage.modes.speedrun.slots.main.logicalBytes).toBe(50);
    expect(normalized.usage.modes.speedrun.slots["3"].logicalBytes).toBe(80);

    const missingSpeedrun = quotaSnapshot() as Record<string, any>;
    delete missingSpeedrun.usage.modes.speedrun.slots["2"];
    expect(() => normalizeCloudQuotaSnapshot(missingSpeedrun)).toThrowError(/speedrun\/2/);
  });

  it("fetches the authenticated quota snapshot without placing the token in the URL", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ cloudQuota: quotaSnapshot() }));
    const result = await fetchCloudQuota(client(fetchMock));

    expect(result.version).toBe("cloud-quota-v1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("/api/cloud-save/quota");
    expect(String(url)).not.toContain(TOKEN);
    expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("does not copy the bearer token into a server error or its diagnostics", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ error: "容量服务暂不可用", code: "QUOTA_UNAVAILABLE" }, 503),
    );
    let caught: unknown;
    try {
      await fetchCloudQuota(client(fetchMock));
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "QUOTA_UNAVAILABLE", status: 503 });
    expect(JSON.stringify(caught)).not.toContain(TOKEN);
    expect(caught instanceof Error ? caught.message : "").not.toContain(TOKEN);
  });

  it.each(MODES.flatMap((mode) => SLOTS.map((slot) => [mode, slot] as const)))(
    "preflights %s/%s independently with strict mode and slot identity",
    async (mode, slot) => {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ plan: quotaPlan(mode, slot) }));
      const result = await preflightCloudQuota({ mode, slot, size: 123, checksum: CHECKSUM }, client(fetchMock));

      expect(result.target).toEqual({ mode, slot });
      const [, init] = fetchMock.mock.calls[0];
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ mode, slot, size: 123, checksum: CHECKSUM });
    },
  );

  it("rejects malformed quota contracts instead of applying permissive defaults", async () => {
    const malformed = quotaSnapshot() as Record<string, any>;
    malformed.limits.modeBytes = 1;
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ cloudQuota: malformed }));
    await expect(fetchCloudQuota(client(fetchMock))).rejects.toMatchObject({
      code: "CLOUD_RESPONSE_INVALID",
    } satisfies Partial<CloudAccountArchiveError>);
  });
});

describe("cloud account archive download", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("streams directly into a File System Access writable and closes only after exact length", async () => {
    const chunks = [new Uint8Array([1, 2]), new Uint8Array([3, 4, 5])];
    const destination = transactionalWritable();
    const createWritable = vi.fn().mockResolvedValue(destination.writable);
    const picker = vi.fn().mockResolvedValue({
      createWritable,
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(archiveResponse(chunks));

    const result = await downloadCloudAccountArchive({ ...client(fetchMock), showSaveFilePicker: picker });

    expect(result).toEqual({
      method: "file-system",
      fileName: "dsp-account-user-123.dspaccount.zip",
      bytesWritten: 5,
      archiveVersion: 2,
    });
    expect(destination.bytes()).toBe(5);
    expect(destination.committed()).toBe(true);
    expect(destination.aborted()).toBe(false);
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({
      suggestedName: "dsp-account-user-123.dspaccount.zip",
    }));
    expect(createWritable).toHaveBeenCalledWith({ keepExistingData: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("/api/account/export/archive");
    expect(String(url)).not.toContain(TOKEN);
    expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
    expect((init?.headers as Record<string, string>).accept).toBe(CLOUD_ACCOUNT_ARCHIVE_CONTENT_TYPE);
  });

  it("aborts the transactional writable and does not commit a short response", async () => {
    const destination = transactionalWritable();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      archiveResponse([new Uint8Array([1, 2, 3])], { length: 4 }),
    );

    await expect(downloadCloudAccountArchive({
      ...client(fetchMock),
      showSaveFilePicker: vi.fn().mockResolvedValue({
        createWritable: vi.fn().mockResolvedValue(destination.writable),
      }),
    })).rejects.toMatchObject({ code: "ARCHIVE_LENGTH_MISMATCH" });
    expect(destination.committed()).toBe(false);
    expect(destination.aborted()).toBe(true);
    expect(destination.abortSpy).toHaveBeenCalled();
  });

  it("aborts the transactional writable when actual bytes exceed Content-Length", async () => {
    const destination = transactionalWritable();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      archiveResponse([new Uint8Array([1, 2]), new Uint8Array([3, 4])], { length: 3 }),
    );

    await expect(downloadCloudAccountArchive({
      ...client(fetchMock),
      showSaveFilePicker: vi.fn().mockResolvedValue({
        createWritable: vi.fn().mockResolvedValue(destination.writable),
      }),
    })).rejects.toMatchObject({
      code: "ARCHIVE_LENGTH_MISMATCH",
      details: { expectedBytes: 3, actualBytes: 4 },
    });
    expect(destination.committed()).toBe(false);
    expect(destination.abortSpy).toHaveBeenCalled();
  });

  it("aborts the network body and writable when the caller cancels", async () => {
    const destination = transactionalWritable();
    const controller = new AbortController();
    let fetchSignal: AbortSignal | undefined;
    const sourceCancelled = vi.fn();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      fetchSignal = init?.signal ?? undefined;
      return new Response(new ReadableStream<Uint8Array>({
        start(streamController) {
          streamController.enqueue(new Uint8Array([1]));
        },
        cancel(reason) {
          sourceCancelled(reason);
        },
      }), {
        status: 200,
        headers: {
          "content-type": CLOUD_ACCOUNT_ARCHIVE_CONTENT_TYPE,
          "content-length": "10",
          "x-dsp-account-archive-version": "2",
        },
      });
    });
    const pending = downloadCloudAccountArchive({
      ...client(fetchMock, controller.signal),
      showSaveFilePicker: vi.fn().mockResolvedValue({
        createWritable: vi.fn().mockResolvedValue(destination.writable),
      }),
    });
    await vi.waitFor(() => expect(destination.bytes()).toBe(1));
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchSignal?.aborted).toBe(true);
    expect(destination.committed()).toBe(false);
    expect(destination.abortSpy).toHaveBeenCalled();
    expect(sourceCancelled).toHaveBeenCalled();
  });

  it("uses a bounded Blob fallback only when File System Access is unavailable", async () => {
    const saveBlob = vi.fn();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      archiveResponse([new Uint8Array([1, 2, 3, 4])]),
    );

    const result = await downloadCloudAccountArchive({
      ...client(fetchMock),
      showSaveFilePicker: null,
      saveBlob,
    });

    expect(result.method).toBe("blob");
    expect(result.bytesWritten).toBe(4);
    expect(saveBlob).toHaveBeenCalledTimes(1);
    const [blob, fileName] = saveBlob.mock.calls[0] as [Blob, string];
    expect(blob.size).toBe(4);
    expect(fileName).toBe("dsp-account-user-123.dspaccount.zip");
  });

  it("refuses to aggregate a Blob above the configured conservative limit", async () => {
    const saveBlob = vi.fn();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      archiveResponse([new Uint8Array([1])], { length: 129 }),
    );

    await expect(downloadCloudAccountArchive({
      ...client(fetchMock),
      showSaveFilePicker: null,
      blobFallbackLimitBytes: 128,
      saveBlob,
    })).rejects.toMatchObject({
      code: "ARCHIVE_BLOB_FALLBACK_TOO_LARGE",
      details: { expectedBytes: 129, fallbackLimitBytes: 128 },
    });
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it.each([404, 501])("returns stable ARCHIVE_UNSUPPORTED for an old %i API without fallback", async (status) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ error: "接口不存在", code: "NOT_FOUND" }, status),
    );
    const saveBlob = vi.fn();

    await expect(downloadCloudAccountArchive({
      ...client(fetchMock),
      showSaveFilePicker: null,
      saveBlob,
    })).rejects.toMatchObject({ code: "ARCHIVE_UNSUPPORTED", status });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it("reads at most 64 KiB from an error response and cancels the remainder", async () => {
    let pulls = 0;
    const cancelled = vi.fn();
    const response = new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(32 * 1024).fill(120));
      },
      cancel(reason) {
        cancelled(reason);
      },
    }), { status: 500 });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);

    await expect(downloadCloudAccountArchive({
      ...client(fetchMock),
      showSaveFilePicker: null,
      saveBlob: vi.fn(),
    })).rejects.toMatchObject({
      status: 500,
      details: { truncated: true },
    });
    expect(pulls).toBeLessThanOrEqual(3);
    expect(cancelled).toHaveBeenCalled();
  });

  it.each([
    [{ contentType: "application/zip" }, "ARCHIVE_CONTENT_TYPE_INVALID"],
    [{ version: "1" }, "ARCHIVE_VERSION_UNSUPPORTED"],
    [{ length: "0" }, "ARCHIVE_LENGTH_INVALID"],
    [{ length: "not-a-number" }, "ARCHIVE_LENGTH_INVALID"],
  ] as const)("rejects invalid archive response headers %#", async (headers, code) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      archiveResponse([new Uint8Array([1])], headers),
    );
    await expect(downloadCloudAccountArchive({
      ...client(fetchMock),
      showSaveFilePicker: null,
      saveBlob: vi.fn(),
    })).rejects.toMatchObject({ code });
  });

  it("sanitizes content-disposition and always fixes the archive suffix", () => {
    expect(safeAccountArchiveFileName('attachment; filename="../../token.txt"'))
      .toBe("dsp-account-export.dspaccount.zip");
    expect(safeAccountArchiveFileName("attachment; filename*=UTF-8''my%20account.zip"))
      .toBe("my account.zip.dspaccount.zip");
    expect(safeAccountArchiveFileName('attachment; filename="valid.DSPACCOUNT.ZIP"'))
      .toBe("valid.dspaccount.zip");
    expect(safeAccountArchiveFileName(null)).toBe("dsp-account-export.dspaccount.zip");
  });
});
