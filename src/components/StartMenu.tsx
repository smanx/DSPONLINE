import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  Check,
  Clock3,
  Cloud,
  CloudOff,
  Cpu,
  Database,
  Download,
  Factory,
  FileUp,
  Gauge,
  HardDrive,
  History,
  LogIn,
  LogOut,
  MessageCircle,
  Play,
  Plus,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Type,
  Upload,
  UserPlus,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import {
  CloudApiError,
  downloadCloudSave,
  loginCloudAccount,
  logoutCloudAccount,
  registerCloudAccount,
  resumeCloudSession,
  uploadCloudSave,
  type CloudSaveMetadata,
  type CloudSession,
} from "../game/cloud";
import { getPlanet } from "../game/content";
import { createInitialState } from "../game/engine";
import {
  exportGame,
  getSaveSlotSummaries,
  getSaveSnapshotSummaries,
  inspectContinueSave,
  inspectSave,
  loadGame,
  loadGameSlot,
  loadSaveSnapshot,
  saveGame,
  saveGameSnapshot,
  type ContinueSaveInspection,
  type LoadedGame,
  type SaveInspection,
  type SaveSlotId,
} from "../game/storage";
import type { AutosaveIntervalSeconds, FontScale, GameSettings, SimulationSpeed } from "../game/types";
import { getDesktopBridge } from "../desktop";
import { CURRENT_RELEASE_NOTES } from "./ReleaseNotesDialog";

type StartMenuView = "overview" | "saves" | "cloud" | "import" | "settings" | "new";
type MenuMessage = { tone: "ready" | "warning" | "error"; text: string } | null;

const MENU_SETTINGS_KEY = "dsp-idle-network.menu-settings.v1";
const FONT_SCALES: FontScale[] = [0.8, 1, 1.25, 1.5];
const SIMULATION_SPEEDS: SimulationSpeed[] = [1, 2, 4];
const AUTOSAVE_INTERVALS: AutosaveIntervalSeconds[] = [2, 10, 30];

interface StartMenuProps {
  onEnterGame: (loaded: LoadedGame) => void;
  onOpenReleaseNotes: () => void;
}

function formatRuntime(seconds: number): string {
  const totalMinutes = Math.max(0, Math.floor(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} 小时 ${minutes} 分` : `${minutes} 分钟`;
}

function formatSavedAt(savedAt: number | null | undefined): string {
  if (!savedAt) return "尚未保存";
  return new Date(savedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function readMenuSettings(fallback: GameSettings): GameSettings {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MENU_SETTINGS_KEY) ?? "null") as Partial<GameSettings> | null;
    if (!parsed) return fallback;
    return {
      ...fallback,
      simulationSpeed: SIMULATION_SPEEDS.includes(parsed.simulationSpeed as SimulationSpeed) ? parsed.simulationSpeed as SimulationSpeed : fallback.simulationSpeed,
      fontScale: FONT_SCALES.includes(parsed.fontScale as FontScale) ? parsed.fontScale as FontScale : fallback.fontScale,
      autosaveIntervalSeconds: AUTOSAVE_INTERVALS.includes(parsed.autosaveIntervalSeconds as AutosaveIntervalSeconds) ? parsed.autosaveIntervalSeconds as AutosaveIntervalSeconds : fallback.autosaveIntervalSeconds,
      performanceMode: typeof parsed.performanceMode === "boolean" ? parsed.performanceMode : fallback.performanceMode,
      reducedMotion: typeof parsed.reducedMotion === "boolean" ? parsed.reducedMotion : fallback.reducedMotion,
      soundEnabled: typeof parsed.soundEnabled === "boolean" ? parsed.soundEnabled : fallback.soundEnabled,
    };
  } catch {
    return fallback;
  }
}

function saveMenuSettings(settings: GameSettings): void {
  try { window.localStorage.setItem(MENU_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* optional preference */ }
}

function sourceLabel(source: ContinueSaveInspection["source"]): string {
  if (source === "backup") return "备用存档";
  if (source === "snapshot") return "自动快照";
  return "主存档";
}

function ToggleRow({ checked, label, value, icon, onChange }: {
  checked: boolean;
  label: string;
  value: string;
  icon: ReactNode;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="start-menu-toggle">
      <i>{icon}</i>
      <span><strong>{label}</strong><small>{value}</small></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <b aria-hidden="true"><i /></b>
    </label>
  );
}

export function StartMenu({ onEnterGame, onOpenReleaseNotes }: StartMenuProps) {
  const initialContinueSave = useMemo(() => inspectContinueSave(), []);
  const defaultSettings = initialContinueSave?.inspection.state?.settings ?? createInitialState().settings;
  const [view, setView] = useState<StartMenuView>("overview");
  const [continueSave, setContinueSave] = useState<ContinueSaveInspection | null>(initialContinueSave);
  const [slots, setSlots] = useState(getSaveSlotSummaries);
  const [snapshots, setSnapshots] = useState(getSaveSnapshotSummaries);
  const [settings, setSettings] = useState<GameSettings>(() => readMenuSettings(defaultSettings));
  const [cloudSession, setCloudSession] = useState<CloudSession>({ status: "checking", user: null, cloudSave: null, message: null });
  const [cloudMode, setCloudMode] = useState<"login" | "register">("login");
  const [cloudEmail, setCloudEmail] = useState("");
  const [cloudPassword, setCloudPassword] = useState("");
  const [cloudDisplayName, setCloudDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<MenuMessage>(null);
  const [importInspection, setImportInspection] = useState<SaveInspection | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cloudAuthAllowed = window.isSecureContext || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const brandIconUrl = `${import.meta.env.BASE_URL}icon.svg`;

  const refreshLocalSaves = () => {
    setContinueSave(inspectContinueSave());
    setSlots(getSaveSlotSummaries());
    setSnapshots(getSaveSnapshotSummaries());
  };

  useEffect(() => {
    const bridge = getDesktopBridge();
    const root = document.documentElement;
    if (bridge && typeof bridge.setFontScale === "function") {
      root.dataset.nativeUiScale = "true";
      root.style.removeProperty("--ui-font-scale");
      void bridge.setFontScale(settings.fontScale).catch(() => undefined);
      return;
    }
    delete root.dataset.nativeUiScale;
    root.style.setProperty("--ui-font-scale", String(settings.fontScale));
  }, [settings.fontScale]);

  useEffect(() => {
    if (!cloudAuthAllowed) {
      setCloudSession({ status: "offline", user: null, cloudSave: null, message: "账号登录仅在 HTTPS 安全入口开放" });
      return;
    }
    let active = true;
    void resumeCloudSession().then((session) => { if (active) setCloudSession(session); });
    return () => { active = false; };
  }, [cloudAuthAllowed]);

  const updateMenuSettings = (changes: Partial<GameSettings>) => {
    const next = { ...settings, ...changes };
    setSettings(next);
    saveMenuSettings(next);
  };

  const preserveCurrentSave = (reason: string) => {
    const state = continueSave?.inspection.state;
    if (state) saveGameSnapshot(state, reason);
  };

  const enterLoadedGame = (loaded: LoadedGame, preserveReason?: string) => {
    if (preserveReason) preserveCurrentSave(preserveReason);
    const state = { ...loaded.state, settings: { ...loaded.state.settings, ...settings } };
    saveGame(state);
    onEnterGame({ ...loaded, state });
  };

  const continueGame = () => {
    setBusy(true);
    try {
      enterLoadedGame(loadGame());
    } finally {
      setBusy(false);
    }
  };

  const startNewGame = () => {
    preserveCurrentSave("开始新工厂前");
    const state = createInitialState();
    state.settings = { ...state.settings, ...settings };
    saveGame(state);
    onEnterGame({ state, offlineSeconds: 0, offlineReport: null, recovery: { source: "fresh", issues: [] } });
  };

  const requestNewGame = () => {
    if (continueSave) setView("new");
    else startNewGame();
  };

  const loadSlot = (slotId: SaveSlotId) => {
    const loaded = loadGameSlot(slotId);
    if (!loaded) {
      setMessage({ tone: "error", text: `本地槽位 ${slotId} 无法载入` });
      return;
    }
    enterLoadedGame(loaded, `载入槽位 ${slotId} 前`);
  };

  const loadSnapshot = (snapshotId: string) => {
    const state = loadSaveSnapshot(snapshotId);
    if (!state) {
      setMessage({ tone: "error", text: "自动快照无法载入" });
      return;
    }
    enterLoadedGame({ state, offlineSeconds: 0, offlineReport: null }, "回滚自动快照前");
  };

  const readImportFile = async (file: File) => {
    const inspection = inspectSave(await file.text());
    setImportInspection(inspection);
    setView("import");
    setMessage(inspection.valid
      ? { tone: inspection.integrity === "valid" ? "ready" : "warning", text: inspection.integrity === "valid" ? "存档校验通过" : "存档将在导入时自动迁移" }
      : { tone: "error", text: inspection.issues[0] ?? "存档格式无效" });
  };

  const confirmImport = () => {
    if (!importInspection?.valid || !importInspection.state) return;
    enterLoadedGame({ state: importInspection.state, offlineSeconds: 0, offlineReport: null }, "导入外部存档前");
  };

  const authenticateCloud = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!cloudAuthAllowed) return;
    setBusy(true);
    setMessage(null);
    try {
      const session = cloudMode === "register"
        ? await registerCloudAccount(cloudEmail, cloudPassword, cloudDisplayName)
        : await loginCloudAccount(cloudEmail, cloudPassword);
      setCloudSession(session);
      setCloudPassword("");
      setMessage({ tone: "ready", text: cloudMode === "register" ? "云账户已创建并登录" : "云账户登录成功" });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "云账户登录失败" });
    } finally {
      setBusy(false);
    }
  };

  const uploadLocalSave = async () => {
    if (cloudSession.status !== "authenticated" || !continueSave) return;
    setBusy(true);
    setMessage(null);
    try {
      const loaded = loadGame();
      const state = { ...loaded.state, settings: { ...loaded.state.settings, ...settings } };
      saveGame(state);
      const cloudSave = await uploadCloudSave(exportGame(state), cloudSession.cloudSave?.revision ?? 0);
      setCloudSession((current) => ({ ...current, cloudSave }));
      refreshLocalSaves();
      setMessage({ tone: "ready", text: `云存档已更新到修订 ${cloudSave.revision}` });
    } catch (error) {
      if (error instanceof CloudApiError && error.status === 409 && error.payload.cloudSave) {
        setCloudSession((current) => ({ ...current, cloudSave: error.payload.cloudSave as CloudSaveMetadata }));
      }
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "云存档上传失败" });
    } finally {
      setBusy(false);
    }
  };

  const downloadAndEnterCloudSave = async () => {
    if (cloudSession.status !== "authenticated") return;
    setBusy(true);
    setMessage(null);
    try {
      const cloudSave = await downloadCloudSave();
      if (!cloudSave) {
        setMessage({ tone: "warning", text: "该账户还没有云存档" });
        return;
      }
      const inspection = inspectSave(cloudSave.payload);
      if (!inspection.valid || !inspection.state) {
        setMessage({ tone: "error", text: inspection.issues[0] ?? "云存档格式无效" });
        return;
      }
      enterLoadedGame({ state: inspection.state, offlineSeconds: 0, offlineReport: null }, "下载云存档前");
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "云存档下载失败" });
    } finally {
      setBusy(false);
    }
  };

  const summary = continueSave?.inspection.summary;
  const summaryPlanet = summary ? getPlanet(summary.activePlanetId) : null;
  const cloudStateLabel = cloudSession.status === "authenticated" ? "云端已登录" : cloudSession.status === "offline" ? "云端离线" : cloudSession.status === "checking" ? "连接云节点" : "云端未登录";

  return (
    <main className="start-menu" data-reduced-motion={settings.reducedMotion ? "true" : "false"}>
      <div className="start-menu-scene" aria-hidden="true">
        <div className="start-menu-orbit start-menu-orbit--outer" />
        <div className="start-menu-orbit start-menu-orbit--inner" />
        <i className="start-menu-star" />
        <span className="start-menu-scene-node start-menu-scene-node--ore">Fe</span>
        <span className="start-menu-scene-node start-menu-scene-node--smelt">熔</span>
        <span className="start-menu-scene-node start-menu-scene-node--assemble">制</span>
        <span className="start-menu-scene-node start-menu-scene-node--matrix">矩</span>
        <b className="start-menu-scene-line start-menu-scene-line--one" />
        <b className="start-menu-scene-line start-menu-scene-line--two" />
        <b className="start-menu-scene-line start-menu-scene-line--three" />
      </div>

      <header className="start-menu-topbar">
        <div className="start-menu-brand-mini"><img src={brandIconUrl} alt="" /><strong>DSP极简网络</strong></div>
        <div className={`start-menu-node-state start-menu-node-state--${cloudSession.status}`}>
          {cloudSession.status === "offline" ? <CloudOff size={14} /> : <Cloud size={14} />}
          <span>{cloudStateLabel}</span>
        </div>
      </header>

      <section className="start-menu-layout">
        <aside className="start-menu-command">
          <div className="start-menu-title">
            <img src={brandIconUrl} alt="DSP极简网络" />
            <span><small>母星工业节点</small><h1>DSP极简网络</h1><em>v{__APP_VERSION__}</em></span>
          </div>

          <div className="start-menu-resume">
            <span>{continueSave ? sourceLabel(continueSave.source) : "新工厂协议"}</span>
            <strong>{continueSave ? formatSavedAt(summary?.savedAt) : "等待启动"}</strong>
            <small>{summary ? `${summaryPlanet?.name ?? "未知行星"} · ${formatRuntime(summary.elapsedSeconds)} · 科技 ${summary.completedTechCount}` : "初始建设物资已装载"}</small>
          </div>

          <button className="start-menu-primary" type="button" disabled={busy} onClick={continueSave ? continueGame : requestNewGame}>
            {busy ? <Activity size={19} /> : <Play size={19} />}
            <span><small>{continueSave ? "恢复最近工厂" : "建立母星节点"}</small><strong>{continueSave ? "继续游戏" : "开始游戏"}</strong></span>
            <ArrowRight size={19} />
          </button>

          <nav className="start-menu-nav" aria-label="主菜单">
            <button className={view === "new" ? "active" : ""} type="button" onClick={requestNewGame}><Plus size={17} /><span>新建游戏</span></button>
            <button className={view === "saves" ? "active" : ""} type="button" onClick={() => { setView("saves"); setMessage(null); }}><HardDrive size={17} /><span>加载存档</span><em>{slots.length}</em></button>
            <button className={view === "cloud" ? "active" : ""} type="button" onClick={() => { setView("cloud"); setMessage(null); }}><Cloud size={17} /><span>登录与云存档</span></button>
            <button className={view === "import" ? "active" : ""} type="button" onClick={() => fileInputRef.current?.click()}><FileUp size={17} /><span>导入存档</span></button>
            <button className={view === "settings" ? "active" : ""} type="button" onClick={() => { setView("settings"); setMessage(null); }}><Settings size={17} /><span>游戏设置</span></button>
          </nav>
          <input ref={fileInputRef} className="start-menu-file-input" type="file" accept="application/json,.json" aria-label="选择存档文件" onChange={async (event) => { const file = event.target.files?.[0]; if (file) await readImportFile(file); event.target.value = ""; }} />
        </aside>

        <section className="start-menu-workspace" aria-live="polite">
          {view === "overview" ? <div className="start-menu-overview">
            <header><span>工厂状态</span><strong>{continueSave ? "可继续运行" : "等待初始化"}</strong></header>
            <div className="start-menu-overview-metrics">
              <span><i><Clock3 size={16} /></i><small>累计运行</small><strong>{summary ? formatRuntime(summary.elapsedSeconds) : "0 分钟"}</strong></span>
              <span><i><Gauge size={16} /></i><small>已完成科技</small><strong>{summary?.completedTechCount ?? 0}</strong></span>
              <span><i><Factory size={16} /></i><small>结构点数</small><strong>{summary?.structurePoints.toLocaleString("zh-CN") ?? 0}</strong></span>
              <span><i><Database size={16} /></i><small>本地槽位</small><strong>{slots.length}/3</strong></span>
            </div>
            <div className="start-menu-flow-status">
              <span><i className="ready" /><strong>本地存档</strong><small>{continueSave ? "校验通过" : "空"}</small></span>
              <b />
              <span><i className={cloudSession.status === "authenticated" ? "ready" : "idle"} /><strong>云端节点</strong><small>{cloudStateLabel}</small></span>
              <b />
              <span><i className="ready" /><strong>模拟核心</strong><small>待启动</small></span>
            </div>
            <section className="start-menu-project-note" aria-label="项目说明">
              <header><ShieldCheck size={16} /><strong>免费个人作品</strong><span><MessageCircle size={13} />QQ 交流群 1076757280</span></header>
              <p>本项目为免费个人作品，仅供交流与学习使用。欢迎大家提出宝贵的意见与建议。</p>
              <p>强烈推荐您在体验本项目之前，购买并游玩《戴森球计划》，相信它会为您带来更加丰富而精彩的游戏体验。</p>
              <p>进入工厂后会使用本机生成的匿名标识统计游玩与在线人数，不采集完整存档或设备指纹。</p>
            </section>
            <footer><button type="button" onClick={() => setView("saves")}><History size={15} />查看存档记录</button><button className="primary" type="button" onClick={continueSave ? continueGame : requestNewGame}><Play size={15} />{continueSave ? "进入工厂" : "建立工厂"}</button></footer>
          </div> : null}

          {view === "new" ? <div className="start-menu-new">
            <header><Plus size={22} /><span><small>新工厂协议</small><strong>建立新的母星生产网络</strong></span></header>
            <div className="start-menu-new-loadout"><span><small>风力涡轮机</small><strong>3</strong></span><span><small>采矿机</small><strong>2</strong></span><span><small>熔炉</small><strong>3</strong></span><span><small>制造台</small><strong>3</strong></span><span><small>研究站</small><strong>2</strong></span><span><small>传送带</small><strong>10</strong></span></div>
            {continueSave ? <p className="start-menu-warning"><ShieldCheck size={16} />当前工厂会先保存为自动快照。</p> : null}
            <footer><button type="button" onClick={() => setView("overview")}>取消</button><button className="primary" type="button" onClick={startNewGame}><Plus size={15} />开始新游戏</button></footer>
          </div> : null}

          {view === "saves" ? <div className="start-menu-saves">
            <header><span><small>本地数据</small><strong>加载存档</strong></span><em>{slots.length + snapshots.length + (continueSave ? 1 : 0)} 个恢复点</em></header>
            <div className="start-menu-save-list">
              {continueSave ? <article className="primary"><i><Save size={16} /></i><span><strong>{sourceLabel(continueSave.source)}</strong><small>{formatSavedAt(summary?.savedAt)} · {summaryPlanet?.name} · 科技 {summary?.completedTechCount}</small></span><em>{formatRuntime(summary?.elapsedSeconds ?? 0)}</em><button type="button" onClick={continueGame}><Play size={14} />载入</button></article> : null}
              {([1, 2, 3] as SaveSlotId[]).map((slotId) => {
                const slot = slots.find((candidate) => candidate.slotId === slotId);
                return <article className={slot ? "" : "empty"} key={slotId}><i><HardDrive size={16} /></i><span><strong>本地槽位 {slotId}</strong><small>{slot ? `${formatSavedAt(slot.savedAt)} · ${getPlanet(slot.activePlanetId).name} · 科技 ${slot.completedTechCount}` : "空槽位"}</small></span><em>{slot ? formatRuntime(slot.elapsedSeconds) : "--"}</em><button type="button" disabled={!slot?.valid} onClick={() => loadSlot(slotId)}><Upload size={14} />载入</button></article>;
              })}
            </div>
            {snapshots.length > 0 ? <section className="start-menu-snapshots"><header><History size={14} /><strong>最近快照</strong><small>{snapshots.length}/5</small></header>{snapshots.slice(0, 3).map((snapshot) => <button type="button" disabled={!snapshot.valid} onClick={() => loadSnapshot(snapshot.id)} key={snapshot.id}><span><strong>{snapshot.reason}</strong><small>{formatSavedAt(snapshot.savedAt)} · 科技 {snapshot.completedTechCount}</small></span><em>{formatRuntime(snapshot.elapsedSeconds)}</em><RefreshCw size={13} /></button>)}</section> : null}
          </div> : null}

          {view === "cloud" ? <div className="start-menu-cloud">
            <header><span><small>银河数据节点</small><strong>账户与云存档</strong></span><em className={`cloud-${cloudSession.status}`}>{cloudStateLabel}</em></header>
            {!cloudAuthAllowed ? <div className="start-menu-cloud-offline"><ShieldCheck size={24} /><span><strong>需要 HTTPS 安全入口</strong><small>https://dsponline.cn</small></span></div> : null}
            {cloudAuthAllowed && cloudSession.status === "checking" ? <div className="start-menu-cloud-offline"><Activity size={24} /><span><strong>正在连接云节点</strong><small>验证服务状态与登录令牌</small></span></div> : null}
            {cloudAuthAllowed && cloudSession.status === "offline" ? <div className="start-menu-cloud-offline"><CloudOff size={24} /><span><strong>云节点暂时不可用</strong><small>{cloudSession.message}</small></span><button type="button" onClick={() => { setCloudSession({ status: "checking", user: null, cloudSave: null, message: null }); void resumeCloudSession().then(setCloudSession); }}><RefreshCw size={14} />重试</button></div> : null}
            {cloudSession.status === "anonymous" ? <form className="start-menu-auth" onSubmit={authenticateCloud}>
              <div className="start-menu-auth-mode"><button className={cloudMode === "login" ? "active" : ""} type="button" onClick={() => setCloudMode("login")}><LogIn size={14} />登录</button><button className={cloudMode === "register" ? "active" : ""} type="button" onClick={() => setCloudMode("register")}><UserPlus size={14} />注册</button></div>
              {cloudMode === "register" ? <label><span>显示名称</span><input value={cloudDisplayName} onChange={(event) => setCloudDisplayName(event.target.value)} minLength={2} maxLength={24} required autoComplete="nickname" /></label> : null}
              <label><span>邮箱</span><input type="email" value={cloudEmail} onChange={(event) => setCloudEmail(event.target.value)} required maxLength={254} autoComplete="email" /></label>
              <label><span>密码</span><input type="password" value={cloudPassword} onChange={(event) => setCloudPassword(event.target.value)} required minLength={8} maxLength={128} autoComplete={cloudMode === "register" ? "new-password" : "current-password"} /></label>
              <button className="primary" type="submit" disabled={busy}>{busy ? <Activity size={15} /> : cloudMode === "register" ? <UserPlus size={15} /> : <LogIn size={15} />}{cloudMode === "register" ? "创建云账户" : "登录云账户"}</button>
            </form> : null}
            {cloudSession.status === "authenticated" && cloudSession.user ? <div className="start-menu-cloud-account">
              <section className="start-menu-cloud-user"><i>{cloudSession.user.displayName.slice(0, 1).toUpperCase()}</i><span><strong>{cloudSession.user.displayName}</strong><small>{cloudSession.user.email}</small></span><button type="button" title="退出云账户" aria-label="退出云账户" onClick={() => { setBusy(true); void logoutCloudAccount().then(() => setCloudSession({ status: "anonymous", user: null, cloudSave: null, message: null })).finally(() => setBusy(false)); }}><LogOut size={15} /></button></section>
              <section className="start-menu-cloud-save"><header><Cloud size={18} /><span><small>云存档</small><strong>{cloudSession.cloudSave ? `修订 ${cloudSession.cloudSave.revision}` : "尚未上传"}</strong></span><em>{cloudSession.cloudSave ? formatSavedAt(cloudSession.cloudSave.updatedAt) : "--"}</em></header><div><button type="button" disabled={busy || !continueSave} onClick={() => void uploadLocalSave()}><Upload size={14} />上传本地存档</button><button className="primary" type="button" disabled={busy || !cloudSession.cloudSave} onClick={() => void downloadAndEnterCloudSave()}><Download size={14} />下载并进入</button></div></section>
            </div> : null}
          </div> : null}

          {view === "import" ? <div className="start-menu-import">
            <header><FileUp size={22} /><span><small>外部数据</small><strong>导入存档</strong></span></header>
            {!importInspection ? <button className="start-menu-import-drop" type="button" onClick={() => fileInputRef.current?.click()}><FileUp size={25} /><strong>选择 JSON 存档</strong><small>支持当前格式与可迁移的旧版本</small></button> : <div className={`start-menu-import-result start-menu-import-result--${importInspection.valid ? importInspection.integrity : "corrupt"}`}><header><i>{importInspection.valid ? <Check size={18} /> : <CloudOff size={18} />}</i><span><strong>{importInspection.valid ? "存档可导入" : "存档不可用"}</strong><small>格式 v{importInspection.formatVersion ?? "?"} · 状态 v{importInspection.stateVersion ?? "?"}</small></span></header><div><span><small>运行时间</small><strong>{formatRuntime(importInspection.summary?.elapsedSeconds ?? 0)}</strong></span><span><small>实体数量</small><strong>{importInspection.state?.entities.length ?? 0}</strong></span><span><small>完成科技</small><strong>{importInspection.summary?.completedTechCount ?? 0}</strong></span></div>{importInspection.issues.length > 0 ? <ul>{importInspection.issues.slice(0, 4).map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}<footer><button type="button" onClick={() => fileInputRef.current?.click()}>重新选择</button><button className="primary" type="button" disabled={!importInspection.valid} onClick={confirmImport}><FileUp size={14} />确认导入并进入</button></footer></div>}
          </div> : null}

          {view === "settings" ? <div className="start-menu-settings">
            <header><span><small>本机运行参数</small><strong>游戏设置</strong></span><em>即时生效</em></header>
            <section><header><Type size={15} /><strong>字体大小</strong><small>{Math.round(settings.fontScale * 100)}%</small></header><div className="start-menu-segments">{FONT_SCALES.map((scale) => <button className={settings.fontScale === scale ? "active" : ""} type="button" key={scale} onClick={() => updateMenuSettings({ fontScale: scale })}>{Math.round(scale * 100)}%</button>)}</div></section>
            <section><header><Zap size={15} /><strong>模拟速度</strong><small>{settings.simulationSpeed}×</small></header><div className="start-menu-segments">{SIMULATION_SPEEDS.map((speed) => <button className={settings.simulationSpeed === speed ? "active" : ""} type="button" key={speed} onClick={() => updateMenuSettings({ simulationSpeed: speed })}>{speed}×</button>)}</div></section>
            <section><header><Clock3 size={15} /><strong>自动保存</strong><small>{settings.autosaveIntervalSeconds} 秒</small></header><div className="start-menu-segments">{AUTOSAVE_INTERVALS.map((seconds) => <button className={settings.autosaveIntervalSeconds === seconds ? "active" : ""} type="button" key={seconds} onClick={() => updateMenuSettings({ autosaveIntervalSeconds: seconds })}>{seconds} 秒</button>)}</div></section>
            <section className="start-menu-setting-toggles"><ToggleRow checked={settings.performanceMode} label="性能模式" value={settings.performanceMode ? "低频渲染" : "完整渲染"} icon={<Cpu size={16} />} onChange={(performanceMode) => updateMenuSettings({ performanceMode })} /><ToggleRow checked={settings.reducedMotion} label="减少动态效果" value={settings.reducedMotion ? "动态已精简" : "完整动态"} icon={<Gauge size={16} />} onChange={(reducedMotion) => updateMenuSettings({ reducedMotion })} /><ToggleRow checked={settings.soundEnabled} label="操作音效" value={settings.soundEnabled ? "已开启" : "已关闭"} icon={settings.soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />} onChange={(soundEnabled) => updateMenuSettings({ soundEnabled })} /></section>
            <section className="start-menu-release-notes"><header><History size={15} /><strong>版本更新记录</strong><small>{CURRENT_RELEASE_NOTES.date}</small></header><button type="button" onClick={onOpenReleaseNotes} aria-label={`查看${CURRENT_RELEASE_NOTES.date}版本更新记录`}><span><strong>{CURRENT_RELEASE_NOTES.title}</strong><small>{CURRENT_RELEASE_NOTES.items.length} 项体验更新</small></span><ArrowRight size={15} /></button></section>
            <section className="start-menu-community"><header><MessageCircle size={15} /><strong>QQ 交流群</strong><small>意见、建议与问题反馈</small></header><p>群号 <strong>1076757280</strong></p></section>
          </div> : null}

          {message ? <div className={`start-menu-message start-menu-message--${message.tone}`} role="status">{message.tone === "ready" ? <Check size={14} /> : <Activity size={14} />}<span>{message.text}</span></div> : null}
        </section>
      </section>

      <footer className="start-menu-footer"><span><i className="ready" />模拟核心就绪</span><span><ShieldCheck size={12} />本地校验存档</span><span>{window.isSecureContext ? "HTTPS" : "HTTP"} · {window.location.hostname || "Desktop"}</span></footer>
    </main>
  );
}
