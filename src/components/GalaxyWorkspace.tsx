import {
  Activity,
  BarChart3,
  Check,
  Crown,
  Database,
  Eye,
  EyeOff,
  Factory,
  Gauge,
  Globe2,
  LockKeyhole,
  Orbit,
  Plus,
  RadioTower,
  Send,
  ShieldCheck,
  Trophy,
  UserRound,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { ACCOUNT_AVATARS, getActiveAccount, type AccountProfileChanges, type AccountState } from "../game/account";
import {
  LEADERBOARD_CATEGORIES,
  LEADERBOARD_SEASONS,
  formatLeaderboardValue,
  getLeaderboardMetrics,
  getLeaderboardSnapshot,
  type LeaderboardCategoryId,
} from "../game/leaderboard";

type GalaxyTab = "ranking" | "account";

interface GalaxyWorkspaceProps {
  open: boolean;
  accountState: AccountState;
  onClose: () => void;
  onUpdateProfile: (changes: AccountProfileChanges) => void;
  onCreateAccount: (displayName: string) => void;
  onSwitchAccount: (accountId: string) => void;
  onUpload: (seasonId: string) => boolean;
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

export function GalaxyWorkspace({
  open,
  accountState,
  onClose,
  onUpdateProfile,
  onCreateAccount,
  onSwitchAccount,
  onUpload,
}: GalaxyWorkspaceProps) {
  const [tab, setTab] = useState<GalaxyTab>("ranking");
  const [category, setCategory] = useState<LeaderboardCategoryId>("galaxy");
  const [seasonId, setSeasonId] = useState(LEADERBOARD_SEASONS[0].id);
  const [uploadRevision, setUploadRevision] = useState(0);
  const [uploadState, setUploadState] = useState<"idle" | "success" | "blocked">("idle");
  const [nameDraft, setNameDraft] = useState("");
  const [newAccountName, setNewAccountName] = useState("");
  const account = getActiveAccount(accountState);
  const metrics = useMemo(() => getLeaderboardMetrics(account.ledger), [account.ledger]);
  const snapshot = useMemo(
    () => getLeaderboardSnapshot(account.profile, account.ledger, category, seasonId),
    [account.ledger, account.profile, category, seasonId, uploadRevision],
  );
  const localEntry = snapshot.entries.find((entry) => entry.isLocal);

  useEffect(() => setNameDraft(account.profile.displayName), [account.profile.displayName, account.profile.id]);
  useEffect(() => {
    if (uploadState === "idle") return;
    const timer = window.setTimeout(() => setUploadState("idle"), 2200);
    return () => window.clearTimeout(timer);
  }, [uploadState]);

  if (!open) return null;

  const upload = () => {
    const submitted = onUpload(seasonId);
    setUploadState(submitted ? "success" : "blocked");
    if (submitted) setUploadRevision((revision) => revision + 1);
  };

  return (
    <section className="galaxy-workspace" role="dialog" aria-modal="true" aria-label="银河网络">
      <header className="galaxy-header">
        <div className="galaxy-title">
          <i><Globe2 size={20} /></i>
          <div><span>本地星际档案协议</span><strong>银河网络</strong></div>
        </div>
        <div className="galaxy-node-state" title="当前版本仅连接浏览器本地排行榜节点">
          <i /><span><strong>本地节点</strong><small>模拟基准 · 可替换服务端</small></span>
        </div>
        <div className="galaxy-active-account"><span className="galaxy-avatar galaxy-avatar--small">{account.profile.avatar}</span><span><small>当前账户</small><strong>{account.profile.displayName}</strong></span></div>
        <button className="galaxy-close" type="button" onClick={onClose} title="关闭银河网络" aria-label="关闭银河网络"><X size={18} /></button>
      </header>

      <nav className="galaxy-tabs" aria-label="银河网络页面">
        <button type="button" role="tab" aria-selected={tab === "ranking"} className={tab === "ranking" ? "active" : ""} onClick={() => setTab("ranking")}><Trophy size={15} />银河排行</button>
        <button type="button" role="tab" aria-selected={tab === "account"} className={tab === "account" ? "active" : ""} onClick={() => setTab("account")}><UserRound size={15} />账户</button>
        <span><RadioTower size={13} />排名数据保存在当前浏览器</span>
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
            <div><span>我的排名</span><strong>{snapshot.localRank ? `#${snapshot.localRank}` : account.profile.privacy === "private" ? "隐私" : "未上榜"}</strong><small>{snapshot.localSubmitted ? "本季数据已上传" : "当前为实时投影"}</small></div>
            <div><span>{snapshot.category.label}</span><strong>{formatLeaderboardValue(localEntry?.value ?? metrics[category === "power" ? "energyGeneratedMj" : category === "upload" ? "uploadedWhiteMatrix" : category === "dyson" ? "peakDysonPowerKw" : category === "throughput" ? "peakThroughputPerMinute" : "galaxyScore"], category)}<small>{snapshot.category.unit}</small></strong><small>{snapshot.category.description}</small></div>
            <div><span>银河规模</span><strong>{metrics.exploredSystems}<small>星系</small></strong><small>{metrics.colonizedPlanets} 颗殖民行星</small></div>
            <div><span>节点状态</span><strong className={snapshot.localSubmitted ? "positive" : "preview"}>{snapshot.localSubmitted ? "已记录" : "待上传"}</strong><small>{formatTimestamp(account.ledger.lastSyncedAt)}</small></div>
          </section>

          <div className="galaxy-ranking-layout">
            <section className="galaxy-leaderboard" aria-label={`${snapshot.category.label}排行榜`}>
              <header><span>排名</span><span>工程组织</span><span>工业规模</span><span>{snapshot.category.label}</span><span>节点记录</span></header>
              <div className="galaxy-leaderboard-rows">
                {snapshot.entries.map((entry) => (
                  <article className={`${entry.isLocal ? "galaxy-rank-row--local" : ""}${entry.rank <= 3 ? ` galaxy-rank-row--top-${entry.rank}` : ""}`} key={`${entry.seasonId}:${entry.accountId}`}>
                    <strong className="galaxy-rank-number">{entry.rank <= 3 ? <Crown size={15} /> : null}{String(entry.rank).padStart(2, "0")}</strong>
                    <div className="galaxy-rank-identity"><span className="galaxy-avatar">{entry.avatar}</span><span><strong>{entry.displayName}</strong><small>{entry.isLocal ? "当前账户" : "银河模拟样本"}</small></span></div>
                    <span className="galaxy-rank-footprint"><strong>{entry.metrics.exploredSystems} 星系 · {entry.metrics.colonizedPlanets} 行星</strong><small>峰值发电 {formatMetric(entry.metrics.peakGenerationKw)} kW</small></span>
                    <strong className="galaxy-rank-value">{formatLeaderboardValue(entry.value, category)}<small>{snapshot.category.unit}</small></strong>
                    <span className={`galaxy-rank-status${entry.isLocal && !entry.submitted ? " galaxy-rank-status--preview" : ""}`}>{entry.verified ? <ShieldCheck size={13} /> : <Activity size={13} />}{entry.isLocal ? entry.submitted ? "本地节点已上传" : "实时预览" : "模拟基准"}</span>
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
                disabled={account.profile.privacy === "private" || snapshot.season.status === "ended"}
                onClick={upload}
              >
                {uploadState === "success" ? <Check size={15} /> : account.profile.privacy === "private" ? <LockKeyhole size={15} /> : <Send size={15} />}
                {uploadState === "success" ? "数据已写入本地节点" : account.profile.privacy === "private" ? "隐私账户不参与排行" : snapshot.season.status === "ended" ? "历史赛季已封存" : snapshot.localSubmitted ? "更新本季数据" : "上传本季数据"}
              </button>
              <p><RadioTower size={13} /><span>当前节点只在本机运行。模拟组织用于校准排行量级，不代表真实在线玩家。</span></p>
            </aside>
          </div>
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
            <header><div><UserRound size={18} /><span><small>账户设置</small><strong>星际工程师档案</strong></span></div><span><RadioTower size={13} />本地身份 · 不含云端登录</span></header>
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
