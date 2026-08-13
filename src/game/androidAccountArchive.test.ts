import { describe, expect, it, vi } from "vitest";
import {
  AndroidAccountArchiveError,
  runAndroidAccountArchiveDownload,
  type AndroidAccountArchiveBridge,
} from "./androidAccountArchive";

const HANDLE = `dsp_android_session_v1_${"a".repeat(43)}`;

function bridge(overrides: Partial<AndroidAccountArchiveBridge> = {}): AndroidAccountArchiveBridge {
  return {
    downloadAndShare: vi.fn(async (options) => ({
      requestId: options.requestId,
      fileName: "account.dspaccount.zip",
      byteLength: 1234,
      archiveVersion: 2,
      chooserOpened: true,
    })),
    cancel: vi.fn(async () => ({ cancelled: true, tooLate: false })),
    ...overrides,
  } as AndroidAccountArchiveBridge;
}

describe("Android native account archive bridge", () => {
  it("passes only a secure handle and fixed API base metadata to native code", async () => {
    const native = bridge();
    const result = await runAndroidAccountArchiveDownload(native, {
      apiBase: "https://API.Example.Test:443/api/",
      sessionHandle: HANDLE,
      suggestedName: "../player\\archive.zip",
    }, "archive_request_0001");

    expect(native.downloadAndShare).toHaveBeenCalledWith({
      apiBase: "https://api.example.test/api",
      sessionHandle: HANDLE,
      requestId: "archive_request_0001",
      suggestedName: "archive.dspaccount.zip",
    });
    expect(result).toEqual({
      requestId: "archive_request_0001",
      fileName: "account.dspaccount.zip",
      byteLength: 1234,
      archiveVersion: 2,
      chooserOpened: true,
    });
    expect(JSON.stringify((native.downloadAndShare as ReturnType<typeof vi.fn>).mock.calls)).not.toContain("Bearer");
  });

  it("rejects raw Bearer tokens, non-HTTPS bases, and non-/api paths before native I/O", async () => {
    const native = bridge();
    for (const options of [
      { apiBase: "https://api.example.test/api", sessionHandle: `raw_${"x".repeat(40)}` },
      { apiBase: "http://api.example.test/api", sessionHandle: HANDLE },
      { apiBase: "https://api.example.test/proxy/api", sessionHandle: HANDLE },
    ]) {
      await expect(runAndroidAccountArchiveDownload(native, options, "archive_request_0002"))
        .rejects.toBeInstanceOf(AndroidAccountArchiveError);
    }
    expect(native.downloadAndShare).not.toHaveBeenCalled();
  });

  it("cancels the native connection and reports AbortError without accepting a late result", async () => {
    let resolveDownload: ((value: unknown) => void) | undefined;
    const native = bridge({
      downloadAndShare: vi.fn(() => new Promise((resolve) => { resolveDownload = resolve; })) as AndroidAccountArchiveBridge["downloadAndShare"],
    });
    const controller = new AbortController();
    const pending = runAndroidAccountArchiveDownload(native, {
      apiBase: "https://api.example.test/api",
      sessionHandle: HANDLE,
      signal: controller.signal,
    }, "archive_request_0003");
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(native.cancel).toHaveBeenCalledWith({ requestId: "archive_request_0003" });
    resolveDownload?.({
      requestId: "archive_request_0003",
      fileName: "late.dspaccount.zip",
      byteLength: 1,
      archiveVersion: 2,
      chooserOpened: true,
    });
  });

  it("does not report cancellation after native code has crossed into the chooser", async () => {
    let resolveDownload: ((value: Awaited<ReturnType<AndroidAccountArchiveBridge["downloadAndShare"]>>) => void) | undefined;
    const native = bridge({
      downloadAndShare: vi.fn(() => new Promise((resolve) => { resolveDownload = resolve; })) as AndroidAccountArchiveBridge["downloadAndShare"],
      cancel: vi.fn(async () => ({ cancelled: false, tooLate: true })),
    });
    const controller = new AbortController();
    const pending = runAndroidAccountArchiveDownload(native, {
      apiBase: "https://api.example.test/api",
      sessionHandle: HANDLE,
      signal: controller.signal,
    }, "archive_request_too_late");
    controller.abort();
    await Promise.resolve();
    resolveDownload?.({
      requestId: "archive_request_too_late",
      fileName: "chooser.dspaccount.zip",
      byteLength: 2,
      archiveVersion: 2,
      chooserOpened: true,
    });
    await expect(pending).resolves.toMatchObject({ chooserOpened: true });
  });

  it("normalizes bounded native errors without exposing arbitrary fields", async () => {
    const native = bridge({
      downloadAndShare: vi.fn(async () => {
        throw {
          code: "ACCOUNT_ARCHIVE_HTTP_ERROR",
          message: "synthetic failure",
          data: { status: 503, serverCode: "SERVICE_UNAVAILABLE", token: "secret-token" },
        };
      }),
    });
    await expect(runAndroidAccountArchiveDownload(native, {
      apiBase: "https://api.example.test/api",
      sessionHandle: HANDLE,
    }, "archive_request_0004")).rejects.toMatchObject({
      code: "ACCOUNT_ARCHIVE_HTTP_ERROR",
      message: "synthetic failure",
      details: { status: 503, serverCode: "SERVICE_UNAVAILABLE" },
    });
  });

  it("rejects malformed native success metadata", async () => {
    const native = bridge({
      downloadAndShare: vi.fn(async () => ({
        requestId: "wrong-request",
        fileName: "payload.zip",
        byteLength: 0,
        archiveVersion: 1,
        chooserOpened: false,
      })) as AndroidAccountArchiveBridge["downloadAndShare"],
    });
    await expect(runAndroidAccountArchiveDownload(native, {
      apiBase: "https://api.example.test/api",
      sessionHandle: HANDLE,
    }, "archive_request_0005")).rejects.toMatchObject({ code: "ACCOUNT_ARCHIVE_RESPONSE_INVALID" });
  });
});
