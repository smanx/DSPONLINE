import {
  Activity,
  Clock3,
  Cloud,
  Database,
  Gauge,
  KeyRound,
  LogOut,
  MousePointerClick,
  Radio,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import "../admin.css";

interface AnalyticsDay {
  day: string;
  uniqueVisitors: number;
  sessions: number;
  pageViews: number;
  gameStarts: number;
  activeSeconds: number;
  events: Record<string, number>;
  clients: Record<string, number>;
  sources: Record<string, number>;
}

interface OperationalStatus {
  configured: boolean;
  ok: boolean;
  state: "disabled" | "pending" | "ready" | "failed" | "unreadable";
  completedAt?: number | null;
  failedAt?: number | null;
  transported?: boolean;
  transport?: string | null;
}

interface AdminMetrics {
  generatedAt: number;
  timeZone: string;
  schemaVersion: number;
  uptimeSeconds: number;
  storage: "sqlite" | "json";
  runtime: {
    requests: number;
    errors: number;
    rateLimited: number;
    cloudConflicts: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
  };
  accounts: { users: number; activeSessions: number; cloudSaves: number; submissions: number };
  players: { total: number; today: number; online: number; onlineWindowSeconds: number };
  analytics: {
    today: string;
    totalVisitors: number;
    retainedSessions: number;
    range: { days: number; uniqueVisitors: number; sessions: number; pageViews: number; gameStarts: number; activeSeconds: number };
    lifetime: { uniqueVisitors: number; sessions: number; pageViews: number; gameStarts: number; activeSeconds: number };
    events: Array<{ name: string; count: number }>;
    performance?: {
      pageLoad: { samples: number; fast: number; acceptable: number; slow: number; verySlow: number; p75Band: string };
      lcp: { samples: number; good: number; needsImprovement: number; poor: number; p75Band: string };
      transfer: { samples: number; light: number; medium: number; heavy: number; p75Band: string };
    };
    daily: AnalyticsDay[];
  };
  reports: { feedback: number; clientErrors: number };
  audit?: { entries: number; recent: Array<{ action: string; occurredAt: number; clientType: string }> };
  backups: {
    configured: boolean;
    lastSuccessAt: number | null;
    lastErrorAt: number | null;
    offsite?: OperationalStatus;
    restoreDrill?: OperationalStatus;
  };
  infrastructure?: {
    configured: boolean;
    ok: boolean;
    state: string;
    checkedAt: number | null;
    endpoints: Array<{ url: string; ok: boolean; status: number; latencyMs: number | null; contentEncoding: string | null }>;
    disk: { ok: boolean; freeBytes: number | null; totalBytes: number | null; freeRatio: number | null } | null;
    tls: { configured: boolean; ok: boolean; expiresAt: number | null; daysRemaining: number | null } | null;
  };
}

const ADMIN_TOKEN_KEY = "dsp-idle-network.admin-token.v1";
const EVENT_LABELS: Record<string, string> = {
  page_view: "打开网站",
  game_enter: "进入工厂",
  new_game: "新建游戏",
  continue_game: "继续游戏",
  load_save: "加载存档",
  import_save: "导入存档",
  cloud_register: "注册云账号",
  cloud_login: "登录云账号",
  cloud_upload: "上传云存档",
  cloud_download: "下载云存档",
  open_technology: "打开科技树",
  open_recipes: "打开配方图鉴",
  open_statistics: "打开生产统计",
  open_star_map: "打开星图",
  open_campaign: "打开战役",
  building_place: "放置建筑",
  belt_connect: "建立运输线",
  research_queue: "加入科研队列",
  milestone_red_matrix: "达成红糖",
  milestone_oil_chain: "完成石油链",
  milestone_yellow_matrix: "达成黄糖",
  milestone_interstellar: "建立跨星球物流",
  milestone_dyson_swarm: "建立戴森云",
  milestone_universe_matrix: "达成白糖",
};
const AUDIT_LABELS: Record<string, string> = {
  "account.register": "账号注册",
  "account.login": "账号登录",
  "account.logout": "账号退出",
  "account.email_verified": "邮箱验证",
  "account.verification_requested": "重发验证邮件",
  "account.password_reset_requested": "请求密码重置",
  "account.password_reset": "完成密码重置",
  "account.password_changed": "修改密码",
  "account.session_revoked": "撤销设备会话",
  "account.data_exported": "导出账号数据",
  "account.deleted": "注销账号",
  "cloud.revision_restored": "恢复云修订",
};

function readToken(): string {
  try { return window.sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? ""; } catch { return ""; }
}

function writeToken(token: string): void {
  try {
    if (token) window.sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    else window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    // A storage-restricted browser can still use the token until reload.
  }
}

function formatNumber(value: number): string {
  return value.toLocaleString("zh-CN");
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} 秒`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟`;
  return `${(seconds / 3600).toFixed(1)} 小时`;
}

function formatBytes(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return "--";
  return `${((value ?? 0) / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatTime(timestamp: number | null): string {
  return timestamp ? new Date(timestamp).toLocaleString("zh-CN", { hour12: false }) : "暂无记录";
}

function operationalStatusLabel(status: OperationalStatus | undefined): string {
  if (!status?.configured) return "未配置";
  if (status.ok && status.completedAt) return formatTime(status.completedAt);
  if (status.state === "pending") return "等待首次运行";
  if (status.state === "unreadable") return "状态不可读";
  return status.failedAt ? `失败 ${formatTime(status.failedAt)}` : "最近运行失败";
}

async function fetchAdminMetrics(token: string, days: number): Promise<AdminMetrics> {
  const response = await fetch(`/api/admin/metrics?days=${days}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `后台返回 ${response.status}`);
  return payload as AdminMetrics;
}

export function AdminDashboard() {
  const [token, setToken] = useState(readToken);
  const [draftToken, setDraftToken] = useState(readToken);
  const [days, setDays] = useState(7);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (candidate = token, selectedDays = days) => {
    if (!candidate) return;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchAdminMetrics(candidate, selectedDays);
      setMetrics(next);
      setToken(candidate);
      writeToken(candidate);
    } catch (reason) {
      setMetrics(null);
      setError(reason instanceof Error ? reason.message : "无法读取运营数据");
    } finally {
      setLoading(false);
    }
  }, [days, token]);

  useEffect(() => {
    if (!token) return;
    void refresh(token, days);
    const timer = window.setInterval(() => void refresh(token, days), 30_000);
    return () => window.clearInterval(timer);
  }, [days, refresh, token]);

  const authenticate = (event: FormEvent) => {
    event.preventDefault();
    const candidate = draftToken.trim();
    if (candidate) void refresh(candidate, days);
  };

  const today = metrics?.analytics.daily.find((record) => record.day === metrics.analytics.today);
  const maximumPageViews = useMemo(() => Math.max(1, ...(metrics?.analytics.daily.map((record) => record.pageViews) ?? [1])), [metrics]);
  const productEvents = useMemo(() => metrics?.analytics.events.filter((event) => !event.name.startsWith("perf_")) ?? [], [metrics]);

  if (!metrics) {
    return (
      <main className="admin-login-shell">
        <form className="admin-login" onSubmit={authenticate}>
          <span className="admin-brand"><ShieldCheck size={24} /><strong>DSP极简网络</strong><small>运营数据后台</small></span>
          <label><span>管理员凭据</span><div><KeyRound size={17} /><input type="password" value={draftToken} onChange={(event) => setDraftToken(event.target.value)} autoComplete="current-password" autoFocus /></div></label>
          {error ? <p role="alert">{error}</p> : null}
          <button type="submit" disabled={!draftToken.trim() || loading}>{loading ? <RefreshCw className="spin" size={17} /> : <ShieldCheck size={17} />}{loading ? "正在验证" : "进入后台"}</button>
          <a href="/">返回游戏</a>
        </form>
      </main>
    );
  }
  const performance = metrics.analytics.performance ?? {
    pageLoad: { samples: 0, fast: 0, acceptable: 0, slow: 0, verySlow: 0, p75Band: "暂无样本" },
    lcp: { samples: 0, good: 0, needsImprovement: 0, poor: 0, p75Band: "暂无样本" },
    transfer: { samples: 0, light: 0, medium: 0, heavy: 0, p75Band: "暂无样本" },
  };

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <span className="admin-brand"><ShieldCheck size={22} /><strong>DSP极简网络</strong><small>运营后台</small></span>
        <nav aria-label="统计时间范围">{[1, 7, 30, 90].map((value) => <button className={days === value ? "active" : ""} type="button" key={value} onClick={() => setDays(value)}>{value === 1 ? "今日" : `${value} 天`}</button>)}</nav>
        <span className="admin-refresh-state"><i className={loading ? "busy" : ""} />{new Date(metrics.generatedAt).toLocaleTimeString("zh-CN", { hour12: false })}</span>
        <button className="admin-icon-button" type="button" onClick={() => void refresh()} title="刷新数据"><RefreshCw size={17} /></button>
        <button className="admin-icon-button" type="button" onClick={() => { writeToken(""); setToken(""); setDraftToken(""); setMetrics(null); }} title="退出后台"><LogOut size={17} /></button>
      </header>

      <section className="admin-kpi-grid" aria-label="核心运营数据">
        <article><Users size={19} /><span><small>今日访客 UV</small><strong>{formatNumber(today?.uniqueVisitors ?? 0)}</strong></span><em>累计 {formatNumber(metrics.analytics.totalVisitors)}</em></article>
        <article><MousePointerClick size={19} /><span><small>今日访问 PV</small><strong>{formatNumber(today?.pageViews ?? 0)}</strong></span><em>{formatNumber(today?.sessions ?? 0)} 次会话</em></article>
        <article><Activity size={19} /><span><small>今日进入工厂</small><strong>{formatNumber(today?.gameStarts ?? 0)}</strong></span><em>转化 {today?.pageViews ? Math.round(today.gameStarts / today.pageViews * 100) : 0}%</em></article>
        <article><Clock3 size={19} /><span><small>区间活跃时长</small><strong>{formatDuration(metrics.analytics.range.activeSeconds)}</strong></span><em>{metrics.analytics.range.days} 天口径</em></article>
        <article><Radio size={19} /><span><small>当前在线游玩</small><strong>{formatNumber(metrics.players.online)}</strong></span><em>{metrics.players.onlineWindowSeconds} 秒内活跃</em></article>
        <article><Gauge size={19} /><span><small>API P95</small><strong>{metrics.runtime.p95LatencyMs.toFixed(1)} ms</strong></span><em>{formatNumber(metrics.runtime.errors)} 个服务错误</em></article>
      </section>

      <section className="admin-main-grid">
        <article className="admin-trend-panel">
          <header><div><small>访问趋势</small><strong>PV / UV / 进入工厂</strong></div><em>{metrics.timeZone}</em></header>
          <div className="admin-trend-chart">{metrics.analytics.daily.length === 0 ? <p>尚无访问数据</p> : metrics.analytics.daily.map((record) => (
            <div className="admin-trend-day" key={record.day} title={`${record.day} · PV ${record.pageViews} · UV ${record.uniqueVisitors} · 进入 ${record.gameStarts}`}>
              <span><i style={{ height: `${Math.max(3, record.pageViews / maximumPageViews * 100)}%` }} /><b style={{ height: `${Math.max(2, record.uniqueVisitors / maximumPageViews * 100)}%` }} /><em style={{ height: `${Math.max(2, record.gameStarts / maximumPageViews * 100)}%` }} /></span>
              <small>{record.day.slice(5)}</small>
            </div>
          ))}</div>
          <footer><span><i className="pv" />PV</span><span><i className="uv" />UV</span><span><i className="game" />进入工厂</span></footer>
        </article>

        <article className="admin-service-panel">
          <header><div><small>云节点</small><strong>服务与数据安全</strong></div><em>schema v{metrics.schemaVersion}</em></header>
          <dl>
            <div><dt><Database size={15} />存储</dt><dd>{metrics.storage.toUpperCase()}</dd></div>
            <div><dt><Users size={15} />注册账号</dt><dd>{formatNumber(metrics.accounts.users)}</dd></div>
            <div><dt><Activity size={15} />有效会话</dt><dd>{formatNumber(metrics.accounts.activeSessions)}</dd></div>
            <div><dt><Cloud size={15} />云存档</dt><dd>{formatNumber(metrics.accounts.cloudSaves)}</dd></div>
            <div><dt><Gauge size={15} />限流 / 冲突</dt><dd>{metrics.runtime.rateLimited} / {metrics.runtime.cloudConflicts}</dd></div>
            <div><dt><ShieldCheck size={15} />本机快照</dt><dd className={metrics.backups.configured && metrics.backups.lastSuccessAt ? "ready" : "warning"}>{metrics.backups.configured ? formatTime(metrics.backups.lastSuccessAt) : "未配置"}</dd></div>
            <div><dt><Cloud size={15} />异地加密备份</dt><dd className={metrics.backups.offsite?.ok && metrics.backups.offsite.transported ? "ready" : "warning"}>{operationalStatusLabel(metrics.backups.offsite)}</dd></div>
            <div><dt><ShieldCheck size={15} />隔离恢复演练</dt><dd className={metrics.backups.restoreDrill?.ok ? "ready" : "warning"}>{operationalStatusLabel(metrics.backups.restoreDrill)}</dd></div>
            <div><dt><Gauge size={15} />公网探测</dt><dd className={metrics.infrastructure?.ok ? "ready" : "warning"}>{metrics.infrastructure?.checkedAt ? formatTime(metrics.infrastructure.checkedAt) : "等待探测"}</dd></div>
            <div><dt><Database size={15} />磁盘可用</dt><dd className={metrics.infrastructure?.disk?.ok ? "ready" : "warning"}>{formatBytes(metrics.infrastructure?.disk?.freeBytes)} · {metrics.infrastructure?.disk?.freeRatio != null ? `${Math.round(metrics.infrastructure.disk.freeRatio * 100)}%` : "--"}</dd></div>
            <div><dt><ShieldCheck size={15} />TLS 证书</dt><dd className={metrics.infrastructure?.tls?.ok ? "ready" : "warning"}>{metrics.infrastructure?.tls?.daysRemaining != null ? `${metrics.infrastructure.tls.daysRemaining} 天` : "未配置"}</dd></div>
          </dl>
        </article>

        <article className="admin-events-panel">
          <header><div><small>关键事件</small><strong>玩家操作与流程漏斗</strong></div><em>{productEvents.length} 类</em></header>
          <div>{productEvents.length === 0 ? <p>尚无事件数据</p> : productEvents.map((event) => (
            <span key={event.name}><strong>{EVENT_LABELS[event.name] ?? event.name}</strong><i><b style={{ width: `${Math.max(3, event.count / Math.max(1, productEvents[0]?.count ?? 1) * 100)}%` }} /></i><em>{formatNumber(event.count)}</em></span>
          ))}</div>
        </article>

        <article className="admin-meta-panel admin-performance-panel">
          <header><div><small>真实浏览器样本</small><strong>页面加载与资源体积</strong></div><em>隐私分桶</em></header>
          <dl>
            <div><dt>页面加载 P75</dt><dd>{performance.pageLoad.p75Band} · {performance.pageLoad.samples} 份</dd></div>
            <div><dt>加载分布</dt><dd>&lt;1.5s {performance.pageLoad.fast} / 1.5-3s {performance.pageLoad.acceptable} / 慢 {performance.pageLoad.slow + performance.pageLoad.verySlow}</dd></div>
            <div><dt>LCP P75</dt><dd>{performance.lcp.p75Band} · {performance.lcp.samples} 份</dd></div>
            <div><dt>LCP 健康</dt><dd>良好 {performance.lcp.good} / 待改善 {performance.lcp.needsImprovement} / 差 {performance.lcp.poor}</dd></div>
            <div><dt>传输体积 P75</dt><dd>{performance.transfer.p75Band} · {performance.transfer.samples} 份</dd></div>
            <div><dt>传输分布</dt><dd>&lt;1MB {performance.transfer.light} / 1-3MB {performance.transfer.medium} / 重 {performance.transfer.heavy}</dd></div>
          </dl>
        </article>

        <article className="admin-meta-panel">
          <header><div><small>运行摘要</small><strong>请求与玩家数据</strong></div></header>
          <dl>
            <div><dt>本次启动请求</dt><dd>{formatNumber(metrics.runtime.requests)}</dd></div>
            <div><dt>API P50</dt><dd>{metrics.runtime.p50LatencyMs.toFixed(1)} ms</dd></div>
            <div><dt>累计进入玩家</dt><dd>{formatNumber(metrics.players.total)}</dd></div>
            <div><dt>今日进入玩家</dt><dd>{formatNumber(metrics.players.today)}</dd></div>
            <div><dt>反馈 / 客户端错误</dt><dd>{metrics.reports.feedback} / {metrics.reports.clientErrors}</dd></div>
            <div><dt>服务运行时间</dt><dd>{formatDuration(metrics.uptimeSeconds)}</dd></div>
          </dl>
        </article>

        <article className="admin-audit-panel">
          <header><div><small>安全审计</small><strong>账号与云端敏感操作</strong></div><em>{formatNumber(metrics.audit?.entries ?? 0)} 条</em></header>
          <div>{metrics.audit?.recent.length ? metrics.audit.recent.slice(0, 8).map((entry, index) => <span key={`${entry.occurredAt}-${entry.action}-${index}`}><KeyRound size={14} /><strong>{AUDIT_LABELS[entry.action] ?? entry.action}</strong><small>{entry.clientType}</small><em>{formatTime(entry.occurredAt)}</em></span>) : <p>尚无安全审计记录</p>}</div>
        </article>
      </section>
    </main>
  );
}
