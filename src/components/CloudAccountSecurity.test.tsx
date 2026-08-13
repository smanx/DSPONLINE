/** @vitest-environment jsdom */
/** @vitest-environment-options {"url":"https://public.example.test"} */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudAccountArchiveImportPreview } from "../game/cloudAccountArchive";
import type { CloudUser } from "../game/cloud";

const mocks = vi.hoisted(() => ({
  bindCloudEmail: vi.fn(),
  changeCloudPassword: vi.fn(),
  deleteCloudAccount: vi.fn(),
  exportCloudAccountData: vi.fn(),
  fetchCloudSecurityEvents: vi.fn(),
  fetchCloudSessions: vi.fn(),
  resendCloudVerification: vi.fn(),
  readCloudAutoSyncStatus: vi.fn(),
  revokeCloudSession: vi.fn(),
  cloudApiBase: vi.fn(),
  getCloudToken: vi.fn(),
  getWebCookieSession: vi.fn(),
  hasCloudAuthentication: vi.fn(),
  importLegacyJsonCloudAccountArchive: vi.fn(),
  prepareCloudAuthenticatedRequest: vi.fn(),
  exportTextFile: vi.fn(),
  downloadCloudAccountArchive: vi.fn(),
  fetchCloudAccountArchiveImportPreview: vi.fn(),
  importCloudAccountArchive: vi.fn(),
  getDesktopBridge: vi.fn(),
  downloadAndroidAccountArchive: vi.fn(),
}));

vi.mock("../game/cloud", () => ({
  bindCloudEmail: mocks.bindCloudEmail,
  changeCloudPassword: mocks.changeCloudPassword,
  deleteCloudAccount: mocks.deleteCloudAccount,
  exportCloudAccountData: mocks.exportCloudAccountData,
  fetchCloudSecurityEvents: mocks.fetchCloudSecurityEvents,
  fetchCloudSessions: mocks.fetchCloudSessions,
  resendCloudVerification: mocks.resendCloudVerification,
  readCloudAutoSyncStatus: mocks.readCloudAutoSyncStatus,
  revokeCloudSession: mocks.revokeCloudSession,
  cloudApiBase: mocks.cloudApiBase,
  getCloudToken: mocks.getCloudToken,
  getWebCookieSession: mocks.getWebCookieSession,
  hasCloudAuthentication: mocks.hasCloudAuthentication,
  importLegacyJsonCloudAccountArchive: mocks.importLegacyJsonCloudAccountArchive,
  prepareCloudAuthenticatedRequest: mocks.prepareCloudAuthenticatedRequest,
}));

vi.mock("../game/fileExport", () => ({ exportTextFile: mocks.exportTextFile }));

vi.mock("../game/cloudAccountArchive", () => ({
  CLOUD_ACCOUNT_ARCHIVE_CONTENT_TYPE: "application/vnd.dspidle.account-archive+zip",
  downloadCloudAccountArchive: mocks.downloadCloudAccountArchive,
  fetchCloudAccountArchiveImportPreview: mocks.fetchCloudAccountArchiveImportPreview,
  importCloudAccountArchive: mocks.importCloudAccountArchive,
}));

vi.mock("../desktop", () => ({ getDesktopBridge: mocks.getDesktopBridge }));
vi.mock("../game/androidAccountArchive", () => ({
  downloadAndroidAccountArchive: mocks.downloadAndroidAccountArchive,
}));

import { CloudAccountSecurity } from "./CloudAccountSecurity";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const USER: CloudUser = {
  id: "synthetic-user",
  username: "synthetic-user",
  email: "synthetic@example.test",
  displayName: "Synthetic",
  createdAt: 1,
  emailVerified: true,
  emailVerifiedAt: 2,
  passwordChangedAt: 3,
  leaderboardVisible: true,
};

const PREVIEW: CloudAccountArchiveImportPreview = {
  version: 1,
  guard: "b".repeat(64),
  confirmation: `REPLACE_CLOUD_SAVES:${"b".repeat(64)}`,
  replaces: { modes: ["normal", "speedrun"], slots: ["main", "1", "2", "3"] },
  preserves: ["account_identity", "sessions", "leaderboard_submissions"],
  cloudQuota: {
    version: "cloud-quota-v1",
    limits: {
      revisionBytes: 32,
      slotBytes: 64,
      modeBytes: 128,
      accountBytes: 256,
      historyRevisions: 20,
    },
    usage: {
      logicalBytes: 0,
      uniquePayloadBytes: 0,
      revisionCount: 0,
      remainingBytes: 256,
      modes: {
        normal: {
          logicalBytes: 0,
          uniquePayloadBytes: 0,
          revisionCount: 0,
          remainingBytes: 128,
          slots: Object.fromEntries(["main", "1", "2", "3"].map((slot) => [slot, {
            logicalBytes: 0,
            uniquePayloadBytes: 0,
            revisionCount: 0,
            remainingBytes: 64,
          }])) as CloudAccountArchiveImportPreview["cloudQuota"]["usage"]["modes"]["normal"]["slots"],
        },
        speedrun: {
          logicalBytes: 0,
          uniquePayloadBytes: 0,
          revisionCount: 0,
          remainingBytes: 128,
          slots: Object.fromEntries(["main", "1", "2", "3"].map((slot) => [slot, {
            logicalBytes: 0,
            uniquePayloadBytes: 0,
            revisionCount: 0,
            remainingBytes: 64,
          }])) as CloudAccountArchiveImportPreview["cloudQuota"]["usage"]["modes"]["speedrun"]["slots"],
        },
      },
    },
  },
};

let host: HTMLDivElement;
let root: Root;

function render(node: ReactNode): void {
  act(() => root.render(node));
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function click(element: Element): void {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function buttonNamed(name: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
    .find((candidate) => candidate.textContent?.replace(/\s+/g, " ").trim() === name);
  if (!button) throw new Error(`Missing button: ${name}`);
  return button;
}

function chooseArchive(file = new File([new Uint8Array([1, 2, 3])], "synthetic.dspaccount.zip", {
  type: "application/vnd.dspidle.account-archive+zip",
})): File {
  const input = host.querySelector<HTMLInputElement>("input[type='file']")!;
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
  return file;
}

function chooseLegacyJson(file = new File(["{\"schemaVersion\":7}"], "legacy-account.json", {
  type: "application/json",
})): File {
  const inputs = Array.from(host.querySelectorAll<HTMLInputElement>("input[type='file']"));
  const input = inputs.find((candidate) => candidate.accept.includes("application/json"))!;
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
  return file;
}

function mount(): void {
  render(<CloudAccountSecurity
    user={USER}
    mailAvailable={false}
    onUserChange={() => undefined}
    onLoggedOut={() => undefined}
  />);
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
  host = document.createElement("div");
  host.dataset.testAppRoot = "true";
  document.body.append(host);
  root = createRoot(host);
  mocks.fetchCloudSessions.mockResolvedValue([]);
  mocks.fetchCloudSecurityEvents.mockResolvedValue([]);
  mocks.readCloudAutoSyncStatus.mockReturnValue(null);
  mocks.cloudApiBase.mockReturnValue("/api");
  mocks.getCloudToken.mockReturnValue("synthetic-token");
  mocks.getWebCookieSession.mockReturnValue(null);
  mocks.hasCloudAuthentication.mockReturnValue(true);
  mocks.prepareCloudAuthenticatedRequest.mockImplementation((init) => init);
  mocks.getDesktopBridge.mockReturnValue(null);
  mocks.downloadAndroidAccountArchive.mockResolvedValue(null);
  mocks.exportTextFile.mockResolvedValue(undefined);
  mocks.fetchCloudAccountArchiveImportPreview.mockResolvedValue(PREVIEW);
  mocks.importCloudAccountArchive.mockResolvedValue({
    imported: true,
    revisionCount: 16,
    logicalBytes: 1_024,
    guard: "c".repeat(64),
    modes: { normal: {}, speedrun: {} },
    leaderboardRevalidationRequired: { normal: true, speedrun: true },
  });
  mocks.importLegacyJsonCloudAccountArchive.mockResolvedValue({
    imported: true,
    revisionCount: 2,
    logicalBytes: 512,
    guard: "d".repeat(64),
    modes: { normal: {}, speedrun: {} },
    leaderboardRevalidationRequired: { normal: true, speedrun: false },
  });
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
  document.documentElement.removeAttribute("style");
});

describe("CloudAccountSecurity account archives", () => {
  it("uses the Cookie request preparer for Web archive export and import without a fake Bearer token", async () => {
    const session = {
      transport: "cookie",
      csrfToken: "csrf_abcdefghijklmnopqrstuvwxyz_",
      expiresAt: Date.now() + 60_000,
    };
    mocks.getCloudToken.mockReturnValue(null);
    mocks.getWebCookieSession.mockReturnValue(session);
    mount();
    await settle();

    click(buttonNamed("导出账号归档"));
    await settle();
    expect(mocks.downloadCloudAccountArchive).toHaveBeenCalledWith({
      apiBase: "/api",
      prepareAuthenticatedRequest: mocks.prepareCloudAuthenticatedRequest,
      fetch: expect.any(Function),
    });
    expect(mocks.downloadAndroidAccountArchive).not.toHaveBeenCalled();

    chooseArchive();
    click(buttonNamed("检查并导入账号归档"));
    await settle();
    expect(mocks.fetchCloudAccountArchiveImportPreview).toHaveBeenCalledWith({
      apiBase: "/api",
      prepareAuthenticatedRequest: mocks.prepareCloudAuthenticatedRequest,
      fetch: expect.any(Function),
    });
    click(buttonNamed("确认替换并导入"));
    await settle();
    expect(mocks.importCloudAccountArchive.mock.calls.at(-1)?.[2]).toEqual({
      apiBase: "/api",
      prepareAuthenticatedRequest: mocks.prepareCloudAuthenticatedRequest,
      fetch: expect.any(Function),
    });
  });

  it("never starts the high-memory legacy JSON export until the player explicitly chooses it", async () => {
    mocks.downloadCloudAccountArchive.mockRejectedValue({ code: "ARCHIVE_UNSUPPORTED" });
    mocks.exportCloudAccountData.mockResolvedValue({ exportedAt: 1, marker: "legacy" });
    mount();
    await settle();

    click(buttonNamed("导出账号归档"));
    await settle();

    expect(mocks.downloadCloudAccountArchive).toHaveBeenCalledOnce();
    expect(mocks.exportCloudAccountData).not.toHaveBeenCalled();
    const legacyButton = buttonNamed("导出旧版 JSON（高内存兼容）");
    expect(document.body.textContent).toContain("不会自动执行");

    click(legacyButton);
    await settle();

    expect(mocks.exportCloudAccountData).toHaveBeenCalledOnce();
    expect(mocks.exportTextFile).toHaveBeenCalledOnce();
  });

  it("selects and preflights an archive without uploading, and Escape cannot confirm the replacement", async () => {
    mount();
    await settle();
    chooseArchive();

    expect(mocks.fetchCloudAccountArchiveImportPreview).not.toHaveBeenCalled();
    expect(mocks.importCloudAccountArchive).not.toHaveBeenCalled();
    click(buttonNamed("检查并导入账号归档"));
    await settle();

    expect(mocks.fetchCloudAccountArchiveImportPreview).toHaveBeenCalledOnce();
    expect(mocks.importCloudAccountArchive).not.toHaveBeenCalled();
    const dialog = document.querySelector<HTMLElement>("[role='alertdialog']")!;
    expect(dialog.textContent).toContain("普通模式与速通模式各自的 main、1、2、3");

    act(() => document.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    })));
    expect(document.querySelector("[role='alertdialog']")).toBe(dialog);
    expect(mocks.importCloudAccountArchive).not.toHaveBeenCalled();

    click(buttonNamed("取消，不修改云存档"));
    expect(document.querySelector("[role='alertdialog']")).toBeNull();
    expect(mocks.importCloudAccountArchive).not.toHaveBeenCalled();
  });

  it("submits the original File exactly once even when final confirmation is clicked twice in one frame", async () => {
    let resolveImport!: (value: unknown) => void;
    mocks.importCloudAccountArchive.mockImplementation(() => new Promise((resolve) => {
      resolveImport = resolve;
    }));
    mount();
    await settle();
    const archive = chooseArchive();
    click(buttonNamed("检查并导入账号归档"));
    await settle();

    const confirm = buttonNamed("确认替换并导入");
    act(() => {
      confirm.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      confirm.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(mocks.importCloudAccountArchive).toHaveBeenCalledOnce();
    expect(mocks.importCloudAccountArchive.mock.calls[0]?.[0]).toBe(archive);
    expect(mocks.importCloudAccountArchive.mock.calls[0]?.[1]).toBe(PREVIEW);

    resolveImport({
      imported: true,
      revisionCount: 16,
      logicalBytes: 1_024,
      guard: "c".repeat(64),
      modes: { normal: {}, speedrun: {} },
      leaderboardRevalidationRequired: { normal: true, speedrun: true },
    });
    await settle();
    expect(document.querySelector("[role='alertdialog']")).toBeNull();
    expect(document.body.textContent).toContain("原子导入 16 个修订");
  });

  it("offers legacy JSON only as an explicit separate choice and explains its compatibility limits", async () => {
    mount();
    await settle();

    expect(buttonNamed("选择旧版 JSON（兼容）")).toBeTruthy();
    expect(mocks.fetchCloudAccountArchiveImportPreview).not.toHaveBeenCalled();
    expect(mocks.importLegacyJsonCloudAccountArchive).not.toHaveBeenCalled();
    const archive = chooseLegacyJson();
    expect(document.body.textContent).toContain("ZIP 账号归档更完整");
    expect(document.body.textContent).toContain("无法恢复的独立历史修订会被拒绝");

    click(buttonNamed("检查并导入账号归档"));
    await settle();
    const dialog = document.querySelector<HTMLElement>("[role='alertdialog']")!;
    expect(dialog.textContent).toContain("从旧版 JSON 替换云存档");
    expect(dialog.textContent).toContain("缺少模式字段不会推断为速通");
    expect(dialog.textContent).toContain("请改用 ZIP 账号归档");
    expect(mocks.importLegacyJsonCloudAccountArchive).not.toHaveBeenCalled();

    click(buttonNamed("确认替换并导入"));
    await settle();
    expect(mocks.importLegacyJsonCloudAccountArchive).toHaveBeenCalledOnce();
    expect(mocks.importLegacyJsonCloudAccountArchive).toHaveBeenCalledWith(archive, PREVIEW);
    expect(mocks.importCloudAccountArchive).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("旧版 JSON 账号数据已原子导入 2 个修订");
  });

  it("submits legacy JSON once and keeps the selected file after a rejected import", async () => {
    let rejectImport!: (reason: unknown) => void;
    mocks.importLegacyJsonCloudAccountArchive.mockImplementation(() => new Promise((_resolve, reject) => {
      rejectImport = reject;
    }));
    mount();
    await settle();
    const archive = chooseLegacyJson();
    click(buttonNamed("检查并导入账号归档"));
    await settle();

    const confirm = buttonNamed("确认替换并导入");
    act(() => {
      confirm.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      confirm.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(mocks.importLegacyJsonCloudAccountArchive).toHaveBeenCalledOnce();
    expect(mocks.importLegacyJsonCloudAccountArchive.mock.calls[0]?.[0]).toBe(archive);

    rejectImport(new Error("独立历史无法恢复；请改用 ZIP 账号归档。现有云存档未修改。"));
    await settle();
    expect(document.querySelector("[role='alertdialog']")).toBeNull();
    expect(document.body.textContent).toContain("现有云存档未修改");
    expect(buttonNamed("检查并导入账号归档")).toBeTruthy();
  });

  it("discards a late preview after the player cancels the selected legacy JSON", async () => {
    let resolvePreview!: (value: CloudAccountArchiveImportPreview) => void;
    mocks.fetchCloudAccountArchiveImportPreview.mockImplementation(() => new Promise((resolve) => {
      resolvePreview = resolve;
    }));
    mount();
    await settle();
    chooseLegacyJson();
    click(buttonNamed("检查并导入账号归档"));
    click(buttonNamed("取消导入"));

    resolvePreview(PREVIEW);
    await settle();
    expect(document.querySelector("[role='alertdialog']")).toBeNull();
    expect(mocks.importLegacyJsonCloudAccountArchive).not.toHaveBeenCalled();
    expect(buttonNamed("选择旧版 JSON（兼容）")).toBeTruthy();
  });
});
