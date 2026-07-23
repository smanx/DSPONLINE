import {
  Activity,
  BarChart3,
  Check,
  Cloud,
  CloudOff,
  Crown,
  Database,
  Download,
  Eye,
  EyeOff,
  Factory,
  Gauge,
  Globe2,
  History,
  LockKeyhole,
  Link2,
  LogIn,
  LogOut,
  Orbit,
  Plus,
  RadioTower,
  RotateCcw,
  Send,
  Save,
  ShieldCheck,
  Trophy,
  Unlink,
  UserRound,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { ACCOUNT_AVATARS, getActiveAccount, type AccountProfileChanges, type AccountState } from "../game/account";
import { CloudApiError, compareCloudSave, downloadCloudSave, fetchCloudLeaderboard, fetchCloudSaveHistory, loginCloudAccount, logoutCloudAccount, markCloudSaveSynchronized, registerCloudAccount, restoreCloudSaveRevision, resumeCloudSession, submitCloudLeaderboard, summarizeCloudPayload, uploadCloudSave, type CloudLeaderboardEntry, type CloudSave, type CloudSaveMetadata, type CloudSaveSlot, type CloudSession, type CloudSyncState } from "../game/cloud";
import { exportGame, exportGameSlot, getSaveSlotSummaries, inspectSave, saveGameSlot, type SaveSlotId } from "../game/storage";
import {
  LEADERBOARD_CATEGORIES,
  LEADERBOARD_SEASONS,
  formatLeaderboardValue,
  getLeaderboardMetrics,
  getLeaderboardSnapshot,
  type LeaderboardEntry,
  type LeaderboardCategoryId,
} from "../game/leaderboard";
import type { GameState } from "../game/types";
import { CloudAccountSecurity } from "./CloudAccountSecurity";
import { CloudSaveConflictDialog } from "./CloudSaveConflictDialog";
import { CloudSaveSlotsPanel } from "./CloudSaveSlotsPanel";

type GalaxyTab = "ranking" | "cloud" | "account";

interface GalaxyWorkspaceProps {
  open: boolean;
  focusTab?: GalaxyTab | null;
  accountState: AccountState;
  game: GameState;
  onClose: () => void;
  onUpdateProfile: (changes: AccountProfileChanges) => void;
  onUpdateCloudBinding: (cloud: { id: string; email: string } | null) => void;
  onCreateAccount: (displayName: string) => void;
  onSwitchAccount: (accountId: string) => void;
  onUpload: (seasonId: string) => boolean;
  onRestoreCloudSave: (payload: string) => { success: boolean; message: string };
}

const CATEGORY_ICONS: Record<LeaderboardCategoryId, ReactNode> = {
  power: <Zap size={15} />,
  upload: <Database size={15} />,
  dyson: <Orbit size={15} />,
  throughput: <Factory size={15} />,
  galaxy: <Trophy size={15} />,
};

function formatMetric(value: number, digits = 0): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(digits)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(digits)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(digits)}k`;
  return value.toFixed(digits);
}

function formatTimestamp(timestamp: number): string {
  if (timestamp <= 0) return "尚未同步";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function cloudSyncLabel(state: CloudSyncState): string {
  if (state === "synced") return "本地与云端一致";
  if (state === "local-newer" || state === "local-only") return "当前工厂有待上传进度";
  if (state === "cloud-newer" || state === "cloud-only") return "其他设备有云端更新";
  if (state === "conflict" || state === "unbound") return "本地与云端需要选择版本";
  return "尚未建立云存档";
}

export function GalaxyWorkspace({
  open,
  focusTab,
  accountState,
  game,
  onClose,
  onUpdateProfile,
  onUpdateCloudBinding,
  onCreateAccount,
  onSwitchAccount,
  onUpload,
  onRestoreCloudSave,
}: GalaxyWorkspaceProps) {
  const [tab, setTab] = useState<GalaxyTab>("ranking");
  const [category, setCategory] = useState<LeaderboardCategoryId>("galaxy");
  const [seasonId, setSeasonId] = useState(LEADERBOARD_SEASONS[0].id);
  const [uploadRevision, setUploadRevision] = useState(0);
  const [uploadState, setUploadState] = useState<"idle" | "success" | "blocked">("idle");
  const [nameDraft, setNameDraft] = useState("");
  const [newAccountName, setNewAccountName] = useState("");
  const [cloudSession, setCloudSession] = useState<CloudSession>({ status: "checking", user: null, cloudSave: null, mailAvailable: false, message: null });
  const [cloudMode, setCloudMode] = useState<"login" | "register">("login");
  const [cloudIdentifier, setCloudIdentifier] = useState("");
  const [cloudPassword, setCloudPassword] = useState("");
  const [cloudDisplayName, setCloudDisplayName] = useState("");
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);
  const [cloudEntries, setCloudEntries] = useState<CloudLeaderboardEntry[]>([]);
  const [cloudHistory, setCloudHistory] = useState<CloudSaveMetadata[]>([]);
  const [pendingCloudSave, setPendingCloudSave] = useState<CloudSave | null>(null);
  const cloudMailAvailable = cloudSession.mailAvailable;
  const [cloudConflict, setCloudConflict] = useState<{ slot: CloudSaveSlot; localPayload: string; remote: CloudSaveMetadata } | null>(null);
  const [localCloudPayload, setLocalCloudPayload] = useState<string | null>(null);
  const [localSaveSlots, setLocalSaveSlots] = useState(getSaveSlotSummaries);
  const account = getActiveAccount(accountState);
  const metrics = useMemo(() => getLeaderboardMetrics(account.ledger), [account.ledger]);
  const snapshot = useMemo(
    () => getLeaderboardSnapshot(account.profile, account.ledger, category, seasonId),
    [account.ledger, account.profile, category, seasonId, uploadRevision],
  );
  const localEntry = snapshot.entries.find((entry) => entry.isLocal);
  const cloudComparison = cloudSession.status === "authenticated" && cloudSession.user
    ? compareCloudSave(cloudSession.user.id, localCloudPayload, cloudSession.cloudSave)
    : null;
  const displayEntries = useMemo<LeaderboardEntry[]>(() => {
    if (cloudSession.status !== "authenticated" || !cloudSession.user) return snapshot.entries;
    const remote = cloudEntries.map((entry) => ({
      ...entry,
      isLocal: entry.userId === cloudSession.user!.id,
      submitted: true,
    } satisfies LeaderboardEntry));
    const ownRemote = remote.find((entry) => entry.isLocal);
    const own = ownRemote ?? (localEntry ? {
      ...localEntry,
      accountId: cloudSession.user.id,
      displayName: cloudSession.user.displayName,
      avatar: cloudSession.user.displayName.slice(0, 1).toUpperCase(),
      submitted: false,
      verified: false,
    } : null);
    const candidates = [
      ...snapshot.entries.filter((entry) => !entry.isLocal),
      ...remote.filter((entry) => !entry.isLocal),
      ...(own ? [own] : []),
    ];
    const unique = [...new Map(candidates.map((entry) => [entry.accountId, entry])).values()];
    return unique.sort((left, right) => right.value - left.value || left.accountId.localeCompare(right.accountId)).map((entry, index) => ({ ...entry, rank: index + 1 }));
  }, [cloudEntries, cloudSession.status, cloudSession.user, localEntry, snapshot.entries]);
  const displayedLocalEntry = displayEntries.find((entry) => entry.isLocal);
  const cloudLeaderboardEligible = cloudSession.status === "authenticated" && cloudSession.user?.emailVerified === true;

  useEffect(() => {
    if (open && focusTab) setTab(focusTab);
  }, [focusTab, open]);
  useEffect(() => setNameDraft(account.profile.displayName), [account.profile.displayName, account.profile.id]);
  useEffect(() => {
    setLocalCloudPayload(open && tab === "cloud" ? exportGame(game) : null);
    if (open && tab === "cloud") setLocalSaveSlots(getSaveSlotSummaries());
  }, [cloudSession.cloudSave?.revision, open, tab]);
  useEffect(() => {
    if (uploadState === "idle") return;
    const timer = window.setTimeout(() => setUploadState("idle"), 2200);
    return () => window.clearTimeout(timer);
  }, [uploadState]);
  useEffect(() => {
    let active = true;
    void resumeCloudSession().then((session) => { if (active) setCloudSession(session); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!open || cloudSession.status === "offline" || cloudSession.status === "checking") return;
    let active = true;
    void fetchCloudLeaderboard(category, seasonId)
      .then((entries) => { if (active) setCloudEntries(entries); })
      .catch(() => { if (active) setCloudEntries([]); });
    return () => { active = false; };
  }, [category, cloudSession.status, open, seasonId, uploadRevision]);
  useEffect(() => {
    if (!open || cloudSession.status !== "authenticated") {
      setCloudHistory([]);
      return;
    }
    let active = true;
    void fetchCloudSaveHistory().then((history) => { if (active) setCloudHistory(history); }).catch(() => { if (active) setCloudHistory([]); });
    return () => { active = false; };
  }, [cloudSession.cloudSave?.revision, cloudSession.status, open]);

  if (!open) return null;

  const upload = async () => {
    if (cloudSession.status === "authenticated" && !cloudSession.user?.emailVerified) {
      setCloudMessage("排行榜提交需要已验证邮箱；邮件系统开放后可在账号设置中绑定");
      setUploadState("blocked");
      return;
    }
    const submitted = onUpload(seasonId);
    if (!submitted) {
      setUploadState("blocked");
      return;
    }
    if (cloudSession.status === "authenticated") {
      try {
        await submitCloudLeaderboard(metrics, seasonId);
      } catch (error) {
        setCloudMessage(error instanceof Error ? error.message : "云端排行榜上传失败");
        setUploadState("blocked");
        return;
      }
    }
    setUploadState("success");
    setUploadRevision((revision) => revision + 1);
  };

  const authenticateCloud = async () => {
    setCloudBusy(true);
    setCloudMessage(null);
    try {
      const session = cloudMode === "register"
        ? await registerCloudAccount(cloudIdentifier, cloudPassword, cloudDisplayName || account.profile.displayName)
        : await loginCloudAccount(cloudIdentifier, cloudPassword);
      setCloudSession(session);
      setCloudPassword("");
      setCloudMessage(cloudMode === "register" ? "云账户已创建，云存档与自动同步已开放" : "云账户已登录，本地存档保持不变");
    } catch (error) {
      setCloudMessage(error instanceof Error ? error.message : "云账户操作失败");
    } finally {
      setCloudBusy(false);
    }
  };

  const saveCurrentFactoryToCloud = async () => {
    if (cloudSession.status !== "authenticated" || !cloudSession.user) return;
    const userId = cloudSession.user.id;
    const localPayload = exportGame(game);
    setCloudBusy(true);
    setCloudMessage(null);
    try {
      const comparison = compareCloudSave(userId, localPayload, cloudSession.cloudSave);
      if (cloudSession.cloudSave && ["cloud-newer", "conflict", "unbound"].includes(comparison.state)) {
        setCloudConflict({ slot: "main", localPayload, remote: cloudSession.cloudSave });
        setCloudMessage("检测到本地与云端进度分叉，请先选择保留版本");
        return;
      }
      const metadata = await uploadCloudSave(localPayload, cloudSession.cloudSave?.revision ?? 0);
      markCloudSaveSynchronized(userId, metadata, localPayload);
      setCloudSession((current) => ({ ...current, cloudSave: metadata, cloudSaves: { "1": null, "2": null, "3": null, ...current.cloudSaves, main: metadata } }));
      setCloudMessage(`云存档已更新到修订 ${metadata.revision}`);
    } catch (error) {
      if (error instanceof CloudApiError && error.status === 409 && error.payload.cloudSave) {
        setCloudConflict({ slot: "main", localPayload, remote: error.payload.cloudSave as CloudSaveMetadata });
      }
      setCloudMessage(error instanceof Error ? error.message : "云存档上传失败");
    } finally {
      setCloudBusy(false);
    }
  };

  const updateCloudSlot = (slot: CloudSaveSlot, metadata: CloudSaveMetadata) => {
    setCloudSession((current) => ({
      ...current,
      cloudSave: slot === "main" ? metadata : current.cloudSave,
      cloudSaves: { main: current.cloudSave, "1": null, "2": null, "3": null, ...current.cloudSaves, [slot]: metadata },
    }));
  };

  const uploadManualCloudSlot = async (slot: Exclude<CloudSaveSlot, "main">) => {
    if (cloudSession.status !== "authenticated" || !cloudSession.user) return;
    const localPayload = exportGameSlot(Number(slot) as SaveSlotId);
    if (!localPayload) {
      setCloudMessage(`本地槽位 ${slot} 为空或校验失败`);
      return;
    }
    const remote = cloudSession.cloudSaves?.[slot] ?? null;
    setCloudBusy(true);
    setCloudMessage(null);
    try {
      const comparison = compareCloudSave(cloudSession.user.id, localPayload, remote, slot);
      if (remote && ["cloud-newer", "conflict", "unbound"].includes(comparison.state)) {
        setCloudConflict({ slot, localPayload, remote });
        setCloudMessage(`本地槽位 ${slot} 与云端版本不同，请选择保留版本`);
        return;
      }
      const metadata = await uploadCloudSave(localPayload, remote?.revision ?? 0, slot);
      markCloudSaveSynchronized(cloudSession.user.id, metadata, localPayload, slot);
      updateCloudSlot(slot, metadata);
      setCloudMessage(`本地槽位 ${slot} 已上传为云端修订 ${metadata.revision}`);
    } catch (error) {
      if (error instanceof CloudApiError && error.status === 409 && error.payload.cloudSave) {
        setCloudConflict({ slot, localPayload, remote: error.payload.cloudSave as CloudSaveMetadata });
      }
      setCloudMessage(error instanceof Error ? error.message : `云端槽位 ${slot} 上传失败`);
    } finally {
      setCloudBusy(false);
    }
  };

  const downloadManualCloudSlot = async (slot: Exclude<CloudSaveSlot, "main">) => {
    if (cloudSession.status !== "authenticated" || !cloudSession.user) return;
    const remote = cloudSession.cloudSaves?.[slot] ?? null;
    if (!remote) return;
    const localPayload = exportGameSlot(Number(slot) as SaveSlotId);
    const comparison = compareCloudSave(cloudSession.user.id, localPayload, remote, slot);
    if (localPayload && comparison.state !== "synced") {
      setCloudConflict({ slot, localPayload, remote });
      setCloudMessage(`槽位 ${slot} 的本地与云端进度不同，请选择版本`);
      return;
    }
    setCloudBusy(true);
    setCloudMessage(null);
    try {
      const save = await downloadCloudSave(undefined, slot);
      if (!save) throw new Error(`云端槽位 ${slot} 为空`);
      const inspection = inspectSave(save.payload);
      if (!inspection.valid || !inspection.state) throw new Error(inspection.issues[0] ?? "云存档格式无效");
      saveGameSlot(Number(slot) as SaveSlotId, inspection.state);
      markCloudSaveSynchronized(cloudSession.user.id, save, save.payload, slot);
      setLocalSaveSlots(getSaveSlotSummaries());
      setCloudMessage(`云端槽位 ${slot} 已下载到对应本地槽位`);
    } catch (error) {
      setCloudMessage(error instanceof Error ? error.message : `云端槽位 ${slot} 下载失败`);
    } finally {
      setCloudBusy(false);
    }
  };

  const prepareCloudRestore = async () => {
    setCloudBusy(true);
    setCloudMessage(null);
    try {
      const save = await downloadCloudSave();
      if (!save) setCloudMessage("云端还没有存档");
      else setPendingCloudSave(save);
    } catch (error) {
      setCloudMessage(error instanceof Error ? error.message : "云存档下载失败");
    } finally {
      setCloudBusy(false);
    }
  };

  const prepareHistoricalRestore = async (revision: number) => {
    setCloudBusy(true);
    setCloudMessage(null);
    try {
      const save = await downloadCloudSave(revision);
      if (!save) setCloudMessage(`云端修订 ${revision} 已不可用`);
      else setPendingCloudSave(save);
    } catch (error) {
      setCloudMessage(error instanceof Error ? error.message : "历史修订下载失败");
    } finally {
      setCloudBusy(false);
    }
  };

  const makeHistoricalRevisionCurrent = async (revision: number) => {
    setCloudBusy(true);
    setCloudMessage(null);
    try {
      const metadata = await restoreCloudSaveRevision(revision, cloudSession.cloudSave?.revision ?? 0);
      updateCloudSlot("main", metadata);
      setCloudMessage(`修订 ${revision} 已恢复为新的修订 ${metadata.revision}`);
    } catch (error) {
      if (error instanceof CloudApiError && error.status === 409 && error.payload.cloudSave) {
        const remote = error.payload.cloudSave as CloudSaveMetadata;
        updateCloudSlot("main", remote);
      }
      setCloudMessage(error instanceof Error ? error.message : "云端历史恢复失败");
    } finally {
      setCloudBusy(false);
    }
  };

  const restorePendingCloudSave = () => {
    if (!pendingCloudSave) return;
    const result = onRestoreCloudSave(pendingCloudSave.payload);
    setCloudMessage(result.message);
    if (result.success) {
      if (cloudSession.status === "authenticated" && cloudSession.user) markCloudSaveSynchronized(cloudSession.user.id, pendingCloudSave, pendingCloudSave.payload);
      setPendingCloudSave(null);
    }
  };

  const useCloudConflictVersion = async () => {
    if (!cloudConflict || cloudSession.status !== "authenticated" || !cloudSession.user) return;
    const userId = cloudSession.user.id;
    setCloudBusy(true);
    try {
      const cloudSave = await downloadCloudSave(cloudConflict.remote.revision, cloudConflict.slot);
      if (!cloudSave) throw new Error("云端修订已不可用，请重新连接后再试");
      const result = cloudConflict.slot === "main"
        ? onRestoreCloudSave(cloudSave.payload)
        : (() => {
            const inspection = inspectSave(cloudSave.payload);
            if (!inspection.valid || !inspection.state) return { success: false, message: inspection.issues[0] ?? "云存档格式无效" };
            saveGameSlot(Number(cloudConflict.slot) as SaveSlotId, inspection.state);
            setLocalSaveSlots(getSaveSlotSummaries());
            return { success: true, message: `已在本地槽位 ${cloudConflict.slot} 保留云端版本` };
          })();
      setCloudMessage(result.message);
      if (result.success) {
        markCloudSaveSynchronized(userId, cloudSave, cloudSave.payload, cloudConflict.slot);
        updateCloudSlot(cloudConflict.slot, cloudSave);
        setCloudConflict(null);
      }
    } catch (error) {
      setCloudMessage(error instanceof Error ? error.message : "云端版本读取失败");
    } finally {
      setCloudBusy(false);
    }
  };

  const keepLocalConflictVersion = async () => {
    if (!cloudConflict || cloudSession.status !== "authenticated" || !cloudSession.user) return;
    const userId = cloudSession.user.id;
    setCloudBusy(true);
    try {
      const metadata = await uploadCloudSave(cloudConflict.localPayload, cloudConflict.remote.revision, cloudConflict.slot);
      markCloudSaveSynchronized(userId, metadata, cloudConflict.localPayload, cloudConflict.slot);
      updateCloudSlot(cloudConflict.slot, metadata);
      setCloudConflict(null);
      setCloudMessage(`本地进度已保存为云端修订 ${metadata.revision}`);
    } catch (error) {
      if (error instanceof CloudApiError && error.status === 409 && error.payload.cloudSave) {
        setCloudConflict((current) => current ? { ...current, remote: error.payload.cloudSave as CloudSaveMetadata } : current);
      }
      setCloudMessage(error instanceof Error ? error.message : "本地版本上传失败");
    } finally {
      setCloudBusy(false);
    }
  };

  return (
    <section className="galaxy-workspace" role="dialog" aria-modal="true" aria-label="银河网络">
      <header className="galaxy-header">
        <div className="galaxy-title">
          <i><Globe2 size={20} /></i>
          <div><span>本地星际档案协议</span><strong>银河网络</strong></div>
        </div>
        <div className="galaxy-node-state" title={cloudSession.message ?? "银河节点连接状态"}>
          <i /><span><strong>{cloudSession.status === "offline" ? "离线节点" : cloudSession.status === "authenticated" ? "云端已登录" : cloudSession.status === "checking" ? "节点校验中" : "公共云节点"}</strong><small>{cloudSession.status === "authenticated" ? `@${cloudSession.user?.username}` : cloudSession.status === "offline" ? "本地节点可继续使用" : "排行榜可读取 · 本地节点回退"}</small></span>
        </div>
        <div className="galaxy-active-account"><span className="galaxy-avatar galaxy-avatar--small">{account.profile.avatar}</span><span><small>当前账户</small><strong>{account.profile.displayName}</strong></span></div>
        <button className="galaxy-close" type="button" onClick={onClose} title="关闭银河网络" aria-label="关闭银河网络"><X size={18} /></button>
      </header>

      <nav className="galaxy-tabs" aria-label="银河网络页面">
        <button type="button" role="tab" aria-selected={tab === "ranking"} className={tab === "ranking" ? "active" : ""} onClick={() => setTab("ranking")}><Trophy size={15} />银河排行</button>
        <button type="button" role="tab" aria-selected={tab === "cloud"} className={tab === "cloud" ? "active" : ""} onClick={() => setTab("cloud")}>{cloudSession.status === "offline" ? <CloudOff size={15} /> : <Cloud size={15} />}云存档</button>
        <button type="button" role="tab" aria-selected={tab === "account"} className={tab === "account" ? "active" : ""} onClick={() => setTab("account")}><UserRound size={15} />账户</button>
        <span><RadioTower size={13} />{cloudSession.status === "offline" ? "云端离线 · 本地模式" : "服务端排行榜 · 本地自动回退"}</span>
      </nav>

      {tab === "ranking" ? (
        <div className="galaxy-ranking-view">
          <section className="galaxy-ranking-toolbar">
            <div className="galaxy-category-tabs" role="tablist" aria-label="排行榜分类">
              {LEADERBOARD_CATEGORIES.map((definition) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={category === definition.id}
                  className={category === definition.id ? "active" : ""}
                  style={{ "--category-color": definition.color } as CSSProperties}
                  onClick={() => setCategory(definition.id)}
                  key={definition.id}
                >
                  {CATEGORY_ICONS[definition.id]}<span><strong>{definition.label}</strong><small>{definition.description}</small></span>
                </button>
              ))}
            </div>
            <label className="galaxy-season-select"><span>排行榜赛季</span><select value={seasonId} onChange={(event) => setSeasonId(event.target.value)} aria-label="排行榜赛季">{LEADERBOARD_SEASONS.map((season) => <option value={season.id} key={season.id}>{season.name}{season.status === "active" ? " · 进行中" : " · 已结束"}</option>)}</select></label>
          </section>

          <section className="galaxy-summary-band">
            <div><span>我的排名</span><strong>{displayedLocalEntry?.rank ? `#${displayedLocalEntry.rank}` : account.profile.privacy === "private" ? "隐私" : "未上榜"}</strong><small>{displayedLocalEntry?.submitted ? "本季数据已上传" : "当前为实时投影"}</small></div>
            <div><span>{snapshot.category.label}</span><strong>{formatLeaderboardValue(displayedLocalEntry?.value ?? metrics[category === "power" ? "energyGeneratedMj" : category === "upload" ? "uploadedWhiteMatrix" : category === "dyson" ? "peakDysonPowerKw" : category === "throughput" ? "peakThroughputPerMinute" : "galaxyScore"], category)}<small>{snapshot.category.unit}</small></strong><small>{snapshot.category.description}</small></div>
            <div><span>银河规模</span><strong>{metrics.exploredSystems}<small>星系</small></strong><small>{metrics.colonizedPlanets} 颗殖民行星</small></div>
            <div><span>节点状态</span><strong className={displayedLocalEntry?.submitted ? "positive" : "preview"}>{displayedLocalEntry?.submitted ? cloudSession.status === "authenticated" ? "云端记录" : "本地记录" : "待上传"}</strong><small>{formatTimestamp(account.ledger.lastSyncedAt)}</small></div>
          </section>

          <div className="galaxy-ranking-layout">
            <section className="galaxy-leaderboard" aria-label={`${snapshot.category.label}排行榜`}>
              <header><span>排名</span><span>工程组织</span><span>工业规模</span><span>{snapshot.category.label}</span><span>节点记录</span></header>
              <div className="galaxy-leaderboard-rows">
                {displayEntries.map((entry) => (
                  <article className={`${entry.isLocal ? "galaxy-rank-row--local" : ""}${entry.rank <= 3 ? ` galaxy-rank-row--top-${entry.rank}` : ""}`} key={`${entry.seasonId}:${entry.accountId}`}>
                    <strong className="galaxy-rank-number">{entry.rank <= 3 ? <Crown size={15} /> : null}{String(entry.rank).padStart(2, "0")}</strong>
                    <div className="galaxy-rank-identity"><span className="galaxy-avatar">{entry.avatar}</span><span><strong>{entry.displayName}</strong><small>{entry.isLocal ? "当前账户" : "银河模拟样本"}</small></span></div>
                    <span className="galaxy-rank-footprint"><strong>{entry.metrics.exploredSystems} 星系 · {entry.metrics.colonizedPlanets} 行星</strong><small>峰值发电 {formatMetric(entry.metrics.peakGenerationKw)} kW</small></span>
                    <strong className="galaxy-rank-value">{formatLeaderboardValue(entry.value, category)}<small>{snapshot.category.unit}</small></strong>
                    <span className={`galaxy-rank-status${entry.isLocal && !entry.submitted ? " galaxy-rank-status--preview" : ""}`}>{entry.verified ? <ShieldCheck size={13} /> : <Activity size={13} />}{entry.isLocal ? entry.submitted ? cloudSession.status === "authenticated" ? entry.verified ? "云存档校验" : "云节点已上传" : "本地节点已上传" : "实时预览" : entry.accountId.startsWith("npc_") ? "模拟基准" : entry.verified ? "云存档校验" : "服务端记录"}</span>
                  </article>
                ))}
              </div>
            </section>

            <aside className="galaxy-upload-panel">
              <header><span className="galaxy-avatar galaxy-avatar--large">{account.profile.avatar}</span><div><small>本季个人档案</small><strong>{account.profile.displayName}</strong><span>{account.profile.privacy === "public" ? <><Eye size={12} />公开排名</> : <><EyeOff size={12} />隐私账户</>}</span></div></header>
              <dl>
                <div><dt>累计发电</dt><dd>{formatMetric(metrics.energyGeneratedMj, 1)} <small>MJ</small></dd></div>
                <div><dt>白矩阵上传</dt><dd>{formatMetric(metrics.uploadedWhiteMatrix)} <small>份</small></dd></div>
                <div><dt>戴森峰值</dt><dd>{formatMetric(metrics.peakDysonPowerKw, 1)} <small>kW</small></dd></div>
                <div><dt>吞吐峰值</dt><dd>{formatMetric(metrics.peakThroughputPerMinute, 1)} <small>/min</small></dd></div>
              </dl>
              <button
                className={`galaxy-upload-command galaxy-upload-command--${uploadState}`}
                type="button"
                disabled={account.profile.privacy === "private" || snapshot.season.status === "ended" || (cloudSession.status === "authenticated" && !cloudLeaderboardEligible)}
                onClick={() => void upload()}
              >
                {uploadState === "success" ? <Check size={15} /> : account.profile.privacy === "private" ? <LockKeyhole size={15} /> : <Send size={15} />}
                {uploadState === "success" ? cloudSession.status === "authenticated" ? "数据已写入云端节点" : "数据已写入本地节点" : account.profile.privacy === "private" ? "隐私账户不参与排行" : snapshot.season.status === "ended" ? "历史赛季已封存" : cloudSession.status === "authenticated" && !cloudLeaderboardEligible ? "验证邮箱后提交排行榜" : displayedLocalEntry?.submitted ? "更新本季数据" : "上传本季数据"}
              </button>
              <p><RadioTower size={13} /><span>{cloudSession.status === "authenticated" ? cloudLeaderboardEligible ? "排名会连同主云存档接受服务端校验。" : "云存档已开放；排行榜继续要求验证邮箱，邮件系统当前尚未开放。" : "登录并验证邮箱后可参与真实排行；本地实时预览不受影响。"}</span></p>
            </aside>
          </div>
        </div>
      ) : tab === "cloud" ? (
        <div className="galaxy-cloud-view">
          <section className="galaxy-cloud-status">
            <header>
              <i>{cloudSession.status === "offline" ? <CloudOff size={22} /> : <Cloud size={22} />}</i>
              <span><small>DSP 极简网络云节点</small><strong>{cloudSession.status === "authenticated" ? cloudSession.user?.displayName : cloudSession.status === "offline" ? "当前离线" : cloudSession.status === "checking" ? "正在连接" : "登录云账户"}</strong></span>
              <em className={`cloud-state cloud-state--${cloudSession.status}`}>{cloudSession.status === "authenticated" ? "已登录" : cloudSession.status === "anonymous" ? "访客" : cloudSession.status === "checking" ? "连接中" : "离线"}</em>
            </header>
            {cloudSession.status === "offline" ? <div className="galaxy-cloud-offline"><CloudOff size={24} /><span><strong>云服务暂时不可达</strong><small>{cloudSession.message ?? "本地存档和本地排行榜仍可继续使用。"}</small></span><button type="button" onClick={() => { setCloudSession({ status: "checking", user: null, cloudSave: null, mailAvailable: false, message: null }); void resumeCloudSession().then(setCloudSession); }}>重新连接</button></div> : null}
            {cloudSession.status === "anonymous" ? <form className="galaxy-cloud-auth" onSubmit={(event) => { event.preventDefault(); void authenticateCloud(); }}>
              <div className="galaxy-cloud-auth-mode"><button className={cloudMode === "login" ? "active" : ""} type="button" onClick={() => setCloudMode("login")}>登录</button><button className={cloudMode === "register" ? "active" : ""} type="button" onClick={() => setCloudMode("register")}>注册</button></div>
              {!cloudMailAvailable ? <p className="galaxy-cloud-development"><CloudOff size={14} /><span>邮件系统尚未开放。用户名注册、全部云存档和自动同步可用；找回密码暂不可用，排行榜仍需邮箱验证。</span></p> : null}
              {cloudMode === "register" ? <label><span>显示名称</span><input value={cloudDisplayName} onChange={(event) => setCloudDisplayName(event.target.value)} maxLength={24} placeholder={account.profile.displayName} autoComplete="nickname" /></label> : null}
              <label><span>{cloudMode === "register" ? "用户名" : "用户名或邮箱"}</span><input type="text" value={cloudIdentifier} onChange={(event) => setCloudIdentifier(event.target.value)} minLength={cloudMode === "register" ? 4 : undefined} maxLength={cloudMode === "register" ? 24 : 254} pattern={cloudMode === "register" ? "[A-Za-z0-9_]{4,24}" : undefined} title={cloudMode === "register" ? "4 至 24 位英文字母、数字或下划线" : undefined} required autoComplete="username" placeholder={cloudMode === "register" ? "4-24 位字母、数字或下划线" : "用户名或已绑定邮箱"} /></label>
              <label><span>密码</span><input type="password" value={cloudPassword} onChange={(event) => setCloudPassword(event.target.value)} minLength={8} maxLength={128} required autoComplete={cloudMode === "register" ? "new-password" : "current-password"} placeholder="至少 8 位" /></label>
              <button className="primary" type="submit" disabled={cloudBusy}>{cloudBusy ? <Activity size={15} /> : <LogIn size={15} />}{cloudMode === "register" ? "创建并登录" : "登录云账户"}</button>
            </form> : null}
            {cloudSession.status === "authenticated" && cloudSession.user ? <div className="galaxy-cloud-account">
              <div className="galaxy-cloud-identity"><span className="galaxy-avatar galaxy-avatar--large">{cloudSession.user.displayName.slice(0, 1).toUpperCase()}</span><span><strong>{cloudSession.user.displayName}</strong><small>@{cloudSession.user.username}{cloudSession.user.email ? ` · ${cloudSession.user.email}` : ""} · {account.profile.cloudUserId === cloudSession.user.id ? "已绑定当前本地身份" : "尚未绑定当前本地身份"}</small></span><div className="galaxy-cloud-identity-actions"><button type="button" onClick={() => onUpdateCloudBinding(account.profile.cloudUserId === cloudSession.user!.id ? null : { id: cloudSession.user!.id, email: cloudSession.user!.email || `@${cloudSession.user!.username}` })}>{account.profile.cloudUserId === cloudSession.user.id ? <Unlink size={14} /> : <Link2 size={14} />}{account.profile.cloudUserId === cloudSession.user.id ? "解除绑定" : "绑定本地身份"}</button><button type="button" onClick={() => { setCloudBusy(true); void logoutCloudAccount().then(() => { setCloudSession((current) => ({ status: "anonymous", user: null, cloudSave: null, mailAvailable: current.mailAvailable, message: null })); setCloudEntries([]); }).finally(() => setCloudBusy(false)); }}><LogOut size={14} />退出</button></div></div>
              <div className="galaxy-cloud-save-card">
                <header><Save size={18} /><span><small>当前主存档</small><strong>{cloudSession.cloudSave ? `修订 ${cloudSession.cloudSave.revision}` : "尚未上传"}</strong></span><em>{cloudSession.cloudSave ? `${(cloudSession.cloudSave.size / 1024).toFixed(1)} KB` : "--"}</em></header>
                {cloudComparison ? <p className={`cloud-sync-state cloud-sync-state--${cloudComparison.state}`}>{cloudSyncLabel(cloudComparison.state)}</p> : null}
                <dl><div><dt>更新时间</dt><dd>{cloudSession.cloudSave ? new Date(cloudSession.cloudSave.updatedAt).toLocaleString("zh-CN") : "--"}</dd></div><div><dt>校验摘要</dt><dd>{cloudSession.cloudSave?.checksum.slice(0, 12) ?? "--"}</dd></div><div><dt>本地进度</dt><dd>{cloudComparison?.local ? `${Math.floor(cloudComparison.local.elapsedSeconds / 3600)}h · 科技 ${cloudComparison.local.completedTechCount}` : "--"}</dd></div><div><dt>云端进度</dt><dd>{cloudSession.cloudSave?.summary ? `${Math.floor(cloudSession.cloudSave.summary.elapsedSeconds / 3600)}h · 科技 ${cloudSession.cloudSave.summary.completedTechCount}` : "--"}</dd></div></dl>
                <div><button type="button" disabled={cloudBusy} onClick={() => void prepareCloudRestore()}><Download size={14} />下载到本机</button><button className="primary" type="button" disabled={cloudBusy} onClick={() => void saveCurrentFactoryToCloud()}><Save size={14} />上传当前存档</button></div>
              </div>
              <CloudSaveSlotsPanel cloudSaves={cloudSession.cloudSaves} localSlots={localSaveSlots} busySlot={cloudBusy ? "main" : null} uploadDisabled={false} onUpload={(slot) => void uploadManualCloudSlot(slot)} onDownload={(slot) => void downloadManualCloudSlot(slot)} />
              {cloudHistory.length > 0 ? <section className="galaxy-cloud-history" aria-label="云存档历史修订">
                <header><History size={15} /><span>历史修订</span><strong>{cloudHistory.length}/{20}</strong></header>
                <div>{cloudHistory.map((entry) => <article className={entry.revision === cloudSession.cloudSave?.revision ? "active" : ""} key={entry.revision}>
                  <span><strong>修订 {entry.revision}</strong><small>{new Date(entry.updatedAt).toLocaleString("zh-CN")}{entry.restoredFromRevision ? ` · 来自修订 ${entry.restoredFromRevision}` : ""}</small></span>
                  <em>{(entry.size / 1024).toFixed(1)} KB</em>
                  <button type="button" disabled={cloudBusy} onClick={() => void prepareHistoricalRestore(entry.revision)} title={`下载修订 ${entry.revision}`} aria-label={`下载云存档修订 ${entry.revision}`}><Download size={13} /></button>
                  <button type="button" disabled={cloudBusy || entry.revision === cloudSession.cloudSave?.revision} onClick={() => void makeHistoricalRevisionCurrent(entry.revision)} title={`把修订 ${entry.revision} 恢复为当前版本`} aria-label={`恢复云存档修订 ${entry.revision}`}><RotateCcw size={13} /></button>
                </article>)}</div>
              </section> : null}
              <CloudAccountSecurity user={cloudSession.user} mailAvailable={cloudMailAvailable} onUserChange={(user) => setCloudSession((current) => ({ ...current, user }))} onLoggedOut={() => { setCloudSession((current) => ({ status: "anonymous", user: null, cloudSave: null, mailAvailable: current.mailAvailable, message: null })); setCloudEntries([]); }} />
            </div> : null}
            {cloudMessage ? <p className="galaxy-cloud-message" role="status">{cloudMessage}</p> : null}
          </section>
          <aside className="galaxy-cloud-policy"><ShieldCheck size={20} /><span><strong>冲突与校验</strong><small>每次上传都携带云端修订号；另一台设备先更新后，本机不会静默覆盖。恢复云存档前会保留当前工厂快照。</small></span></aside>
          {pendingCloudSave ? <div className="galaxy-cloud-confirm"><section role="alertdialog" aria-modal="true" aria-label="确认恢复云存档"><header><Download size={18} /><span><strong>恢复云存档修订 {pendingCloudSave.revision}</strong><small>{new Date(pendingCloudSave.updatedAt).toLocaleString("zh-CN")}</small></span></header><p>当前工厂会被云端版本替换，并先创建本地回滚快照。</p><footer><button type="button" onClick={() => setPendingCloudSave(null)}>取消</button><button className="primary" type="button" onClick={restorePendingCloudSave}>确认恢复</button></footer></section></div> : null}
          {cloudConflict ? <CloudSaveConflictDialog local={summarizeCloudPayload(cloudConflict.localPayload)} cloud={cloudConflict.remote} busy={cloudBusy} onUseCloud={() => void useCloudConflictVersion()} onKeepLocal={() => void keepLocalConflictVersion()} onCancel={() => setCloudConflict(null)} /> : null}
        </div>
      ) : (
        <div className="galaxy-account-view">
          <aside className="galaxy-account-list">
            <header><span><Users size={15} />本地账户</span><strong>{Object.keys(accountState.accounts).length}</strong></header>
            <div>{Object.values(accountState.accounts).map((record) => <button type="button" className={record.profile.id === account.profile.id ? "active" : ""} onClick={() => onSwitchAccount(record.profile.id)} key={record.profile.id}><span className="galaxy-avatar">{record.profile.avatar}</span><span><strong>{record.profile.displayName}</strong><small>{record.profile.privacy === "public" ? "公开" : "隐私"} · 综合 {formatMetric(getLeaderboardMetrics(record.ledger).galaxyScore)}</small></span>{record.profile.id === account.profile.id ? <Check size={14} /> : null}</button>)}</div>
            <form onSubmit={(event) => { event.preventDefault(); const name = newAccountName.trim(); onCreateAccount(name || `星际工程师 ${Object.keys(accountState.accounts).length + 1}`); setNewAccountName(""); }}>
              <input value={newAccountName} onChange={(event) => setNewAccountName(event.target.value)} maxLength={24} placeholder="新账户名称" aria-label="新账户名称" />
              <button type="submit" title="创建本地账户" aria-label="创建本地账户"><Plus size={15} /></button>
            </form>
          </aside>

          <section className="galaxy-profile-editor">
            <header><div><UserRound size={18} /><span><small>账户设置</small><strong>星际工程师档案</strong></span></div><span><RadioTower size={13} />{account.profile.cloudUserId ? `已绑定 ${account.profile.cloudEmail ?? "云账号"}` : "本地身份 · 尚未绑定云账号"}</span></header>
            <form onSubmit={(event) => { event.preventDefault(); onUpdateProfile({ displayName: nameDraft }); }}>
              <label className="galaxy-name-field"><span>显示名称</span><div><input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} maxLength={24} aria-label="账户显示名称" /><button type="submit">保存名称</button></div><small>公开账户上传后会以此名称出现在银河排行。</small></label>
              <fieldset className="galaxy-avatar-picker"><legend>账户识别标记</legend><div>{ACCOUNT_AVATARS.map((avatar, index) => <button type="button" aria-pressed={account.profile.avatar === avatar} className={account.profile.avatar === avatar ? "active" : ""} style={{ "--avatar-index": index } as CSSProperties} onClick={() => onUpdateProfile({ avatar })} key={avatar}><span>{avatar}</span></button>)}</div></fieldset>
              <label className="galaxy-privacy-setting"><span className="galaxy-privacy-icon">{account.profile.privacy === "public" ? <Eye size={18} /> : <EyeOff size={18} />}</span><span><strong>{account.profile.privacy === "public" ? "公开银河档案" : "隐私银河档案"}</strong><small>{account.profile.privacy === "public" ? "允许将当前工业数据提交到排行榜节点" : "不会上传，并撤回当前账户的已有排行记录"}</small></span><input type="checkbox" checked={account.profile.privacy === "public"} onChange={(event) => onUpdateProfile({ privacy: event.target.checked ? "public" : "private" })} aria-label="公开银河档案" /><i aria-hidden="true"><b /></i></label>
            </form>

            <section className="galaxy-ledger-section">
              <header><span><BarChart3 size={15} />账户工业账本</span><small>切换账户不会切换当前工厂存档</small></header>
              <div>
                <article><Zap size={18} /><span>累计发电<strong>{formatMetric(metrics.energyGeneratedMj, 1)} <small>MJ</small></strong></span></article>
                <article><Database size={18} /><span>白矩阵上传<strong>{formatMetric(metrics.uploadedWhiteMatrix)} <small>份</small></strong></span></article>
                <article><Orbit size={18} /><span>戴森峰值<strong>{formatMetric(metrics.peakDysonPowerKw, 1)} <small>kW</small></strong></span></article>
                <article><Gauge size={18} /><span>吞吐峰值<strong>{formatMetric(metrics.peakThroughputPerMinute, 1)} <small>/min</small></strong></span></article>
                <article><Globe2 size={18} /><span>星际版图<strong>{metrics.exploredSystems} <small>星系</small> · {metrics.colonizedPlanets} <small>行星</small></strong></span></article>
                <article><Trophy size={18} /><span>银河综合<strong>{formatMetric(metrics.galaxyScore)} <small>分</small></strong></span></article>
              </div>
            </section>

            <footer className="galaxy-account-notice"><ShieldCheck size={16} /><span><strong>存档边界</strong><small>账户档案与工厂存档分别保存。重置工厂不会删除账户或累计排行榜账本。</small></span></footer>
          </section>
        </div>
      )}
    </section>
  );
}
