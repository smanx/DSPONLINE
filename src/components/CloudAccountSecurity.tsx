import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Check,
  Download,
  KeyRound,
  Laptop,
  LoaderCircle,
  LogOut,
  MailCheck,
  MailWarning,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
} from "lucide-react";
import {
  bindCloudEmail,
  changeCloudPassword,
  deleteCloudAccount,
  exportCloudAccountData,
  fetchCloudSecurityEvents,
  fetchCloudSessions,
  resendCloudVerification,
  readCloudAutoSyncStatus,
  revokeCloudSession,
  type CloudAccountSession,
  type CloudLoginSecurityEvent,
  type CloudUser,
  cloudApiBase,
  getCloudToken,
  getWebCookieSession,
  hasCloudAuthentication,
  importLegacyJsonCloudAccountArchive,
  prepareCloudAuthenticatedRequest,
} from "../game/cloud";
import { exportTextFile } from "../game/fileExport";
import {
  CLOUD_ACCOUNT_ARCHIVE_CONTENT_TYPE,
  downloadCloudAccountArchive,
  fetchCloudAccountArchiveImportPreview,
  importCloudAccountArchive,
  type CloudAccountArchiveImportPreview,
} from "../game/cloudAccountArchive";
import { getDesktopBridge } from "../desktop";
import { downloadAndroidAccountArchive } from "../game/androidAccountArchive";
import { AccessibleDialog } from "./AccessibleDialog";
import { StableTextInput, clearStableTextDraft } from "./CompositionSafeInput";

interface CloudAccountSecurityProps {
  user: CloudUser;
  mailAvailable: boolean;
  onUserChange: (user: CloudUser) => void;
  onLoggedOut: () => void;
}

type Notice = { tone: "ready" | "warning" | "error"; text: string } | null;

function formatSessionTime(value: number): string {
  return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function sessionIcon(session: CloudAccountSession) {
  return session.clientType === "mobile-web" ? <Smartphone size={15} /> : <Laptop size={15} />;
}

export function CloudAccountSecurity({ user, mailAvailable, onUserChange, onLoggedOut }: CloudAccountSecurityProps) {
  const [sessions, setSessions] = useState<CloudAccountSession[]>([]);
  const [securityEvents, setSecurityEvents] = useState<CloudLoginSecurityEvent[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [bindingEmail, setBindingEmail] = useState(user.email);
  const [autoSyncStatus, setAutoSyncStatus] = useState(() => readCloudAutoSyncStatus(user.id));
  const archiveImportInputRef = useRef<HTMLInputElement>(null);
  const legacyJsonImportInputRef = useRef<HTMLInputElement>(null);
  const archiveImportButtonRef = useRef<HTMLButtonElement>(null);
  const archiveImportCancelButtonRef = useRef<HTMLButtonElement>(null);
  const archiveImportPreviewInFlightRef = useRef(false);
  const archiveImportInFlightRef = useRef(false);
  const archiveImportSelectionVersionRef = useRef(0);
  const [archiveImportFile, setArchiveImportFile] = useState<File | null>(null);
  const [archiveImportKind, setArchiveImportKind] = useState<"zip" | "legacy-json" | null>(null);
  const [archiveImportPreview, setArchiveImportPreview] = useState<CloudAccountArchiveImportPreview | null>(null);
  const [legacyExportAvailable, setLegacyExportAvailable] = useState(false);

  const archiveClientOptions = () => {
    const base = cloudApiBase();
    if (!base || !hasCloudAuthentication()) throw new Error("当前环境未配置可用的安全云服务");
    // cloudAccountArchive stores the injected transport on a request context;
    // bind the browser primitive so Chrome never receives that context as the
    // illegal WebIDL receiver. Native archive export has its own bridge path.
    const fetchArchive = globalThis.fetch.bind(globalThis);
    return getWebCookieSession()
      ? { apiBase: base, prepareAuthenticatedRequest: prepareCloudAuthenticatedRequest, fetch: fetchArchive }
      : { apiBase: base, authToken: getCloudToken(), fetch: fetchArchive };
  };

  const refreshSessions = async () => {
    setSessionsLoading(true);
    try {
      const [nextSessions, nextEvents] = await Promise.all([
        fetchCloudSessions(),
        // The security-event ledger was added after the session endpoint. During
        // a rolling deployment the web client can briefly talk to the previous
        // server, so treat this optional panel as empty instead of hiding the
        // still-valid session controls.
        fetchCloudSecurityEvents().catch(() => []),
      ]);
      setSessions(nextSessions);
      setSecurityEvents(nextEvents);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "设备会话读取失败" });
    } finally {
      setSessionsLoading(false);
    }
  };

  useEffect(() => {
    void refreshSessions();
    setBindingEmail(user.email);
    setAutoSyncStatus(readCloudAutoSyncStatus(user.id));
  }, [user.id]);

  useEffect(() => {
    const timer = window.setInterval(() => setAutoSyncStatus(readCloudAutoSyncStatus(user.id)), 5_000);
    return () => window.clearInterval(timer);
  }, [user.id]);

  const bindEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!mailAvailable) {
      setNotice({ tone: "warning", text: "邮箱绑定与验证正在开发中" });
      return;
    }
    setBusyAction("email");
    setNotice(null);
    try {
      const updated = await bindCloudEmail(bindingEmail);
      onUserChange(updated);
      setBindingEmail(updated.email);
      clearStableTextDraft(`cloud-security-email:${user.id}`);
      setNotice({ tone: "ready", text: "验证邮件已发送；完成验证后可使用邮箱找回密码" });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "邮箱绑定失败" });
    } finally {
      setBusyAction(null);
    }
  };

  const resendVerification = async () => {
    if (!mailAvailable) {
      setNotice({ tone: "warning", text: "邮箱验证正在开发中" });
      return;
    }
    setBusyAction("verify");
    setNotice(null);
    try {
      await resendCloudVerification();
      setNotice({ tone: "ready", text: "验证邮件已发送，请在 30 分钟内完成验证" });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "验证邮件发送失败" });
    } finally {
      setBusyAction(null);
    }
  };

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setNotice({ tone: "error", text: "两次输入的新密码不一致" });
      return;
    }
    setBusyAction("password");
    setNotice(null);
    try {
      const updated = await changeCloudPassword(currentPassword, newPassword);
      onUserChange(updated);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice({ tone: "ready", text: "密码已修改，其他设备会话已退出" });
      await refreshSessions();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "密码修改失败" });
    } finally {
      setBusyAction(null);
    }
  };

  const revokeSession = async (session: CloudAccountSession) => {
    setBusyAction(session.id);
    setNotice(null);
    try {
      const result = await revokeCloudSession(session.id);
      if (result.currentSessionRevoked) {
        onLoggedOut();
        return;
      }
      setSessions((current) => current.filter((entry) => entry.id !== session.id));
      setNotice({ tone: "ready", text: `${session.deviceName} 已退出` });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "会话撤销失败" });
    } finally {
      setBusyAction(null);
    }
  };

  const exportData = async () => {
    setBusyAction("export");
    setNotice(null);
    setLegacyExportAvailable(false);
    try {
      const token = getCloudToken();
      const base = cloudApiBase();
      if (!base || !hasCloudAuthentication()) throw new Error("当前环境未配置可用的安全云服务");
      const desktop = getDesktopBridge();
      if (desktop) {
        if (!token) throw new Error("桌面账号归档需要有效的安全会话句柄");
        const result = await desktop.downloadAccountArchive({
          authorization: `Bearer ${token}`,
          suggestedName: `dsp-account-${user.id}.dspaccount.zip`,
        });
        if (result.cancelled) {
          setNotice({ tone: "warning", text: "已取消账号归档导出" });
          return;
        }
        setNotice({ tone: "ready", text: `账号归档已保存：${result.fileName}` });
      } else {
        const androidResult = token ? await downloadAndroidAccountArchive({
          apiBase: new URL(base, window.location.href).toString(),
          sessionHandle: token,
          suggestedName: `dsp-account-${user.id}.dspaccount.zip`,
        }) : null;
        if (androidResult) {
          setNotice({ tone: "ready", text: `账号归档已通过 Android 分享面板导出：${androidResult.fileName}` });
        } else {
          const result = await downloadCloudAccountArchive(archiveClientOptions());
          setNotice({ tone: "ready", text: `账号归档已导出（${Math.ceil(result.bytesWritten / 1024)} KiB）` });
        }
      }
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ARCHIVE_UNSUPPORTED") {
        setLegacyExportAvailable(true);
        setNotice({
          tone: "warning",
          text: "当前云节点不支持流式账号归档。若确需兼容旧节点，请单独选择“导出旧版 JSON”；该方式可能占用较多内存，不会自动执行。",
        });
        return;
      }
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "账号归档导出失败" });
    } finally {
      setBusyAction(null);
    }
  };

  const exportLegacyData = async () => {
    setBusyAction("legacy-export");
    setNotice(null);
    try {
      const data = await exportCloudAccountData();
      await exportTextFile({
        contents: JSON.stringify(data, null, 2),
        fileName: `dsp-account-${user.id}.json`,
        title: "导出兼容版云账号数据",
      });
      setLegacyExportAvailable(false);
      setNotice({ tone: "warning", text: "旧版 JSON 已按你的明确选择导出；建议优先保留流式账号归档作为完整备份" });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "兼容版账号数据导出失败" });
    } finally {
      setBusyAction(null);
    }
  };

  const prepareArchiveImport = async () => {
    if (!archiveImportFile) {
      archiveImportInputRef.current?.click();
      return;
    }
    if (archiveImportPreviewInFlightRef.current || archiveImportInFlightRef.current) return;
    const selectionVersion = archiveImportSelectionVersionRef.current;
    archiveImportPreviewInFlightRef.current = true;
    setBusyAction("import-preview");
    setNotice(null);
    try {
      const preview = await fetchCloudAccountArchiveImportPreview(archiveClientOptions());
      // A second file selection may finish while the remote guard is being
      // fetched. Never apply a preview to a different source or protocol.
      if (archiveImportSelectionVersionRef.current === selectionVersion) {
        setArchiveImportPreview(preview);
      }
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "账号归档导入预检失败，现有云存档未修改" });
    } finally {
      archiveImportPreviewInFlightRef.current = false;
      setBusyAction(null);
    }
  };

  const confirmArchiveImport = async () => {
    if (!archiveImportFile || !archiveImportPreview || archiveImportInFlightRef.current) return;
    archiveImportInFlightRef.current = true;
    setBusyAction("import");
    setNotice(null);
    try {
      const result = archiveImportKind === "legacy-json"
        ? await importLegacyJsonCloudAccountArchive(archiveImportFile, archiveImportPreview)
        : await importCloudAccountArchive(
          archiveImportFile,
          archiveImportPreview,
          archiveClientOptions(),
        );
      setArchiveImportFile(null);
      setArchiveImportKind(null);
      setArchiveImportPreview(null);
      if (archiveImportInputRef.current) archiveImportInputRef.current.value = "";
      if (legacyJsonImportInputRef.current) legacyJsonImportInputRef.current.value = "";
      setNotice({
        tone: "ready",
        text: `${archiveImportKind === "legacy-json" ? "旧版 JSON 账号数据" : "账号归档"}已原子导入 ${result.revisionCount} 个修订；普通/速通排行榜需各自上传一个新主修订后重新生效`,
      });
    } catch (error) {
      setArchiveImportPreview(null);
      const baseMessage = error instanceof Error ? error.message : "账号归档导入失败";
      setNotice({
        tone: "error",
        text: /现有云存档未修改/.test(baseMessage) ? baseMessage : `${baseMessage}；现有云存档未修改`,
      });
    } finally {
      archiveImportInFlightRef.current = false;
      setBusyAction(null);
    }
  };

  const deleteAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyAction("delete");
    setNotice(null);
    try {
      await deleteCloudAccount(deletePassword);
      onLoggedOut();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "账号注销失败" });
      setBusyAction(null);
    }
  };

  return (
    <section className="cloud-account-security" aria-label="云账号安全">
      <header>
        <ShieldCheck size={17} />
        <span><strong>账号与安全</strong><small>密码、设备和个人数据</small></span>
        <button type="button" title="刷新设备会话" aria-label="刷新设备会话" onClick={() => void refreshSessions()} disabled={sessionsLoading}><RefreshCw size={14} /></button>
      </header>

      <div className={`cloud-account-verification cloud-account-verification--${user.emailVerified ? "ready" : "warning"}`}>
        {user.emailVerified ? <MailCheck size={17} /> : <MailWarning size={17} />}
        <span><strong>{user.emailVerified ? mailAvailable ? "邮箱已验证" : "邮箱已验证 · 邮件系统尚未开放" : mailAvailable ? user.email ? "邮箱等待验证" : "尚未绑定邮箱" : "邮件系统尚未开放"}</strong><small>{user.email ? `${user.email} · 云存档与排行榜正常可用` : mailAvailable ? "绑定并验证后可使用邮箱找回密码；排行榜无需邮箱" : "云存档、自动同步与排行榜正常可用；未绑定邮箱暂时无法找回密码"}</small></span>
        {!user.emailVerified && user.email ? <button type="button" disabled={!mailAvailable || busyAction === "verify"} title={!mailAvailable ? "邮箱验证正在开发中" : undefined} onClick={() => void resendVerification()}>{busyAction === "verify" ? <LoaderCircle size={13} /> : <RefreshCw size={13} />}{mailAvailable ? "重发" : "开发中"}</button> : user.emailVerified ? <Check size={14} /> : null}
      </div>

      {!user.emailVerified ? <details className="cloud-account-section" open={!user.email}>
        <summary><MailWarning size={15} /><span><strong>{mailAvailable ? user.email ? "更换待验证邮箱" : "绑定邮箱" : "绑定邮箱 · 等待开放"}</strong><small>{mailAvailable ? "验证后可使用邮箱找回密码；云存档与排行榜已经开放" : "邮件系统开放后可绑定验证，不影响云存档与排行榜"}</small></span></summary>
        <form className="cloud-account-email-form" onSubmit={bindEmail}>
          <label><span>邮箱地址</span><StableTextInput draftId={`cloud-security-email:${user.id}`} type="email" value={bindingEmail} onValueChange={setBindingEmail} maxLength={254} required autoComplete="email" disabled={!mailAvailable} /></label>
          <button className="primary" type="submit" disabled={!mailAvailable || busyAction === "email"}>{busyAction === "email" ? <LoaderCircle size={13} /> : <MailCheck size={13} />}{mailAvailable ? "绑定并发送验证邮件" : "邮件功能开发中"}</button>
        </form>
      </details> : null}

      <div className={`cloud-account-auto-sync cloud-account-auto-sync--${autoSyncStatus?.state ?? "idle"}`}>
        <RefreshCw size={14} />
        <span><strong>主存档自动同步</strong><small>{autoSyncStatus ? `${new Date(autoSyncStatus.attemptedAt).toLocaleString("zh-CN")} · ${autoSyncStatus.message}` : "登录期间每 10 分钟检查并上传一次，无需验证邮箱"}</small></span>
        <em>{autoSyncStatus?.revision ? `修订 ${autoSyncStatus.revision}` : "10 min"}</em>
      </div>

      {notice ? <p className={`cloud-account-notice cloud-account-notice--${notice.tone}`} role="status">{notice.text}</p> : null}

      <details className="cloud-account-section">
        <summary><KeyRound size={15} /><span><strong>修改密码</strong><small>保留当前设备，退出其他会话</small></span></summary>
        <form onSubmit={changePassword}>
          <label><span>当前密码</span><StableTextInput sensitive draftId={`cloud-password-current:${user.id}`} type="password" value={currentPassword} onValueChange={setCurrentPassword} minLength={8} maxLength={128} required autoComplete="current-password" /></label>
          <label><span>新密码</span><StableTextInput sensitive draftId={`cloud-password-new:${user.id}`} type="password" value={newPassword} onValueChange={setNewPassword} minLength={8} maxLength={128} required autoComplete="new-password" /></label>
          <label><span>确认新密码</span><StableTextInput sensitive draftId={`cloud-password-confirm:${user.id}`} type="password" value={confirmPassword} onValueChange={setConfirmPassword} minLength={8} maxLength={128} required autoComplete="new-password" /></label>
          <button className="primary" type="submit" disabled={busyAction === "password"}>{busyAction === "password" ? <LoaderCircle size={13} /> : <KeyRound size={13} />}确认修改</button>
        </form>
      </details>

      <details className="cloud-account-section" open>
        <summary><Laptop size={15} /><span><strong>登录设备</strong><small>{sessionsLoading ? "正在读取" : `${sessions.length} 个有效会话`}</small></span></summary>
        <div className="cloud-account-sessions">
          {sessions.map((session) => <div key={session.id}>
            <i>{sessionIcon(session)}</i>
            <span><strong>{session.deviceName}{session.current ? " · 当前" : ""}</strong><small>最近活动 {formatSessionTime(session.lastSeenAt)}</small></span>
            <button type="button" title={`退出 ${session.deviceName}`} aria-label={`退出 ${session.deviceName}`} disabled={busyAction === session.id} onClick={() => void revokeSession(session)}>{busyAction === session.id ? <LoaderCircle size={13} /> : <LogOut size={13} />}</button>
          </div>)}
          {!sessionsLoading && sessions.length === 0 ? <p>没有可用的设备会话</p> : null}
        </div>
      </details>

      <details className="cloud-account-section">
        <summary><ShieldCheck size={15} /><span><strong>最近登录安全记录</strong><small>仅保存匿名设备与网络区域摘要，不记录原始 IP</small></span></summary>
        <div className="cloud-account-security-events">
          {securityEvents.map((entry, index) => <div key={`${entry.occurredAt}-${entry.deviceHash}-${index}`}>
            <ShieldCheck size={14} />
            <span><strong>{entry.clientType === "mobile-web" ? "移动设备" : entry.clientType === "desktop" ? "桌面应用" : "网页设备"}</strong><small>{formatSessionTime(entry.occurredAt)} · 设备 {entry.deviceHash.slice(0, 6)} · 区域 {entry.regionHash.slice(0, 6)}</small></span>
          </div>)}
          {!sessionsLoading && securityEvents.length === 0 ? <p>暂无登录安全记录</p> : null}
        </div>
      </details>

      <div className="cloud-account-data-actions">
        <button type="button" disabled={busyAction === "export"} onClick={() => void exportData()}>{busyAction === "export" ? <LoaderCircle size={13} /> : <Download size={13} />}导出账号归档</button>
        {legacyExportAvailable ? <button
          type="button"
          className="warning"
          disabled={busyAction === "legacy-export"}
          onClick={() => void exportLegacyData()}
        >{busyAction === "legacy-export" ? <LoaderCircle size={13} /> : <Download size={13} />}导出旧版 JSON（高内存兼容）</button> : null}
        <input
          ref={archiveImportInputRef}
          type="file"
          hidden
          accept={`${CLOUD_ACCOUNT_ARCHIVE_CONTENT_TYPE},.dspaccount.zip`}
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            archiveImportSelectionVersionRef.current += 1;
            setArchiveImportFile(file);
            setArchiveImportKind(file ? "zip" : null);
            setArchiveImportPreview(null);
            setNotice(file ? { tone: "warning", text: `已选择 ${file.name}；点击“检查并导入账号归档”后会先读取替换范围，不会立即写入` } : null);
          }}
        />
        <button
          ref={archiveImportButtonRef}
          type="button"
          disabled={busyAction === "import-preview" || busyAction === "import"}
          onClick={() => void prepareArchiveImport()}
        >
          {busyAction === "import-preview" ? <LoaderCircle size={13} /> : <RefreshCw size={13} />}
          {archiveImportFile ? "检查并导入账号归档" : "选择账号归档"}
        </button>
        <input
          ref={legacyJsonImportInputRef}
          type="file"
          hidden
          accept="application/vnd.dspidle.account-export+json,application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            archiveImportSelectionVersionRef.current += 1;
            setArchiveImportFile(file);
            setArchiveImportKind(file ? "legacy-json" : null);
            setArchiveImportPreview(null);
            setNotice(file ? {
              tone: "warning",
              text: `已明确选择旧版 JSON：${file.name}。ZIP 账号归档更完整；旧 JSON 若含无法恢复的独立历史修订会被拒绝，检查阶段不会写入。`,
            } : null);
          }}
        />
        {!archiveImportFile ? <button
          type="button"
          disabled={busyAction === "import-preview" || busyAction === "import"}
          onClick={() => legacyJsonImportInputRef.current?.click()}
        ><RefreshCw size={13} />选择旧版 JSON（兼容）</button> : null}
        {archiveImportFile ? <button type="button" onClick={() => {
          archiveImportSelectionVersionRef.current += 1;
          setArchiveImportFile(null);
          setArchiveImportKind(null);
          setArchiveImportPreview(null);
          if (archiveImportInputRef.current) archiveImportInputRef.current.value = "";
          if (legacyJsonImportInputRef.current) legacyJsonImportInputRef.current.value = "";
        }}>取消导入</button> : null}
        <button className="danger" type="button" onClick={() => setDeleteArmed((current) => !current)}><Trash2 size={13} />注销账号</button>
      </div>

      <AccessibleDialog
        open={Boolean(archiveImportFile && archiveImportPreview)}
        role="alertdialog"
        riskPolicy="explicit"
        title={archiveImportKind === "legacy-json" ? "从旧版 JSON 替换云存档" : "替换全部云存档槽位"}
        description="最后确认 · 服务器 guard 已锁定当前云状态"
        initialFocusRef={archiveImportCancelButtonRef}
        returnFocusRef={archiveImportButtonRef}
        onRequestClose={() => undefined}
        actions={<>
          <button ref={archiveImportCancelButtonRef} type="button" onClick={() => setArchiveImportPreview(null)}>取消，不修改云存档</button>
          <button className="danger" type="button" disabled={busyAction === "import"} onClick={() => void confirmArchiveImport()}>
            {busyAction === "import" ? <LoaderCircle size={13} /> : <RefreshCw size={13} />}
            确认替换并导入
          </button>
        </>}
      >
        <div className="save-delete-content">
          <div className="save-delete-target">
            <span>{archiveImportKind === "legacy-json" ? "待导入旧版 JSON" : "待导入归档"}</span>
            <strong>{archiveImportFile?.name ?? "--"}</strong>
            <small>{archiveImportFile ? `${Math.ceil(archiveImportFile.size / 1024)} KiB` : "--"}</small>
          </div>
          <p>{archiveImportKind === "legacy-json"
            ? "旧版 JSON 只恢复其中带完整正文且能权威校验的云存档；缺少模式字段不会推断为速通，普通/速通与各槽位继续隔离。"
            : "将原子替换普通模式与速通模式各自的 main、1、2、3 云槽及其归档内修订；两种模式仍保持隔离。"}</p>
          <p>账号身份、当前登录会话、账号限制和已有排行榜历史不会从归档写回。导入完成后，普通/速通排行榜需各自再上传一个新的主修订通过复核。</p>
          {archiveImportKind === "legacy-json" ? <p>旧版 JSON 通常不保存独立历史修订正文；检测到无法安全恢复的历史时会拒绝整个导入，请改用 ZIP 账号归档。任何失败都不会修改现有云存档。</p> : null}
          <p>服务器会先完整校验{archiveImportKind === "legacy-json" ? " UTF-8、账号、SHA-256、存档模式" : " ZIP、CRC、SHA-256、存档模式"}、schema、配额和当前 guard；任一步失败都不会修改现有云存档。</p>
        </div>
      </AccessibleDialog>

      {deleteArmed ? <form className="cloud-account-delete" onSubmit={deleteAccount}>
        <strong>永久注销云账号</strong>
        <small>云存档、修订历史和排行榜成绩将一并删除。本机存档不受影响。</small>
        <label><span>当前密码</span><StableTextInput sensitive draftId={`cloud-delete-password:${user.id}`} type="password" value={deletePassword} onValueChange={setDeletePassword} minLength={8} maxLength={128} required autoComplete="current-password" /></label>
        <div><button type="button" onClick={() => { setDeleteArmed(false); setDeletePassword(""); }}>取消</button><button className="danger" type="submit" disabled={busyAction === "delete"}>{busyAction === "delete" ? <LoaderCircle size={13} /> : <Trash2 size={13} />}永久注销</button></div>
      </form> : null}
    </section>
  );
}
