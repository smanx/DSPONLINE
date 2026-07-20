import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock3,
  Cpu,
  Download,
  FileCheck2,
  Gauge,
  HardDrive,
  History,
  MapPin,
  Save,
  Settings2,
  Trash2,
  Trophy,
  Upload,
  RotateCcw,
  ShieldCheck,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import { useRef } from "react";
import { getPlanet } from "../game/content";
import { DIFFICULTY_DEFINITIONS } from "../game/difficulty";
import { ACHIEVEMENTS, getAchievementProgress } from "../game/progression";
import type { FactoryAlert } from "../game/alerts";
import type { SaveInspection, SaveIntegrityStatus, SaveSlotId, SaveSlotSummary, SaveSnapshotSummary } from "../game/storage";
import type { ModValidationResult } from "../game/mods";
import type { AutosaveIntervalSeconds, DifficultyMode, GameSettings, GameState, SimulationSpeed } from "../game/types";

export type OperationsTab = "alerts" | "achievements" | "settings" | "saves";

interface OperationsWorkspaceProps {
  open: boolean;
  tab: OperationsTab;
  game: GameState;
  alerts: FactoryAlert[];
  slots: SaveSlotSummary[];
  snapshots: SaveSnapshotSummary[];
  importPreview: SaveInspection | null;
  modValidation: ModValidationResult | null;
  onClose: () => void;
  onTabChange: (tab: OperationsTab) => void;
  onAlertSelect: (alert: FactoryAlert) => void;
  onSettingsChange: (settings: Partial<GameSettings>) => void;
  onManualSave: () => void;
  onExport: () => void;
  onImport: (raw: string) => void;
  onConfirmImport: () => void;
  onCancelImport: () => void;
  onSaveSlot: (slotId: SaveSlotId) => void;
  onLoadSlot: (slotId: SaveSlotId) => void;
  onDeleteSlot: (slotId: SaveSlotId) => void;
  onCreateSnapshot: () => void;
  onLoadSnapshot: (snapshotId: string) => void;
  onDeleteSnapshot: (snapshotId: string) => void;
  onRunBenchmark: () => void;
  onValidateMod: (raw: string) => void;
  onExportModTemplate: () => void;
}

const TABS: Array<{ id: OperationsTab; label: string; icon: typeof Bell }> = [
  { id: "alerts", label: "警报", icon: Bell },
  { id: "achievements", label: "成就", icon: Trophy },
  { id: "settings", label: "设置", icon: Settings2 },
  { id: "saves", label: "存档", icon: HardDrive },
];

function formatRuntime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  return hours > 0 ? `${hours} 小时 ${minutes} 分` : `${minutes} 分钟`;
}

function AlertsPanel({ alerts, onSelect }: { alerts: FactoryAlert[]; onSelect: (alert: FactoryAlert) => void }) {
  const criticalCount = alerts.filter((alert) => alert.severity === "critical").length;
  return (
    <div className="operations-panel operations-alerts">
      <header className="operations-section-header">
        <div><span>网络诊断</span><strong>运行警报</strong></div>
        <div className="operations-kpis">
          <span className="critical"><AlertTriangle size={13} />严重 <strong>{criticalCount}</strong></span>
          <span><Bell size={13} />全部 <strong>{alerts.length}</strong></span>
        </div>
      </header>
      {alerts.length === 0 ? (
        <div className="operations-empty">
          <CheckCircle2 size={28} />
          <strong>生产网络运行正常</strong>
          <span>当前没有需要处理的设备警报</span>
        </div>
      ) : (
        <div className="alert-list">
          {alerts.map((alert) => (
            <button className={`alert-row alert-row--${alert.severity}`} type="button" key={alert.id} onClick={() => onSelect(alert)} title={`定位${alert.title}`}>
              <i>{alert.severity === "critical" ? <AlertTriangle size={17} /> : <Bell size={17} />}</i>
              <span><strong>{alert.title}</strong><small>{alert.reason}</small></span>
              <em><MapPin size={12} />{alert.location}</em>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AchievementsPanel({ game }: { game: GameState }) {
  const unlocked = new Set(game.achievements.unlockedIds);
  return (
    <div className="operations-panel operations-achievements">
      <header className="operations-section-header">
        <div><span>工业里程碑</span><strong>成就记录</strong></div>
        <div className="achievement-total"><Trophy size={14} /><strong>{unlocked.size}</strong><span>/ {ACHIEVEMENTS.length}</span></div>
      </header>
      <div className="achievement-grid">
        {ACHIEVEMENTS.map((achievement, index) => {
          const complete = unlocked.has(achievement.id);
          const current = getAchievementProgress(game, achievement);
          const percent = Math.min(100, current / achievement.target * 100);
          return (
            <article className={`achievement-row${complete ? " achievement-row--complete" : ""}`} key={achievement.id}>
              <i>{complete ? <Trophy size={17} /> : String(index + 1).padStart(2, "0")}</i>
              <div><strong>{achievement.name}</strong><span>{achievement.description}</span></div>
              <em>{complete ? <CheckCircle2 size={14} /> : `${current}/${achievement.target}`}</em>
              <b><span style={{ width: `${percent}%` }} /></b>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ToggleSetting({ checked, label, value, icon, onChange }: {
  checked: boolean;
  label: string;
  value: string;
  icon: React.ReactNode;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="setting-row">
      <i>{icon}</i>
      <span><strong>{label}</strong><small>{value}</small></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <b aria-hidden="true"><i /></b>
    </label>
  );
}

function SettingsPanel({ game, onChange, onRunBenchmark }: { game: GameState; onChange: (settings: Partial<GameSettings>) => void; onRunBenchmark: () => void }) {
  const { settings } = game;
  return (
    <div className="operations-panel operations-settings">
      <header className="operations-section-header">
        <div><span>模拟参数</span><strong>运行设置</strong></div>
        <span className="settings-state"><Gauge size={14} />{settings.simulationSpeed}× 模拟</span>
      </header>
      <section className="settings-group">
        <header><Zap size={14} /><span>模拟速度</span></header>
        <div className="settings-segmented" aria-label="模拟速度">
          {([1, 2, 4] as SimulationSpeed[]).map((speed) => (
            <button className={settings.simulationSpeed === speed ? "active" : ""} type="button" key={speed} onClick={() => onChange({ simulationSpeed: speed })}>{speed}×</button>
          ))}
        </div>
      </section>
      <section className="settings-group settings-toggle-list">
        <ToggleSetting checked={settings.performanceMode} label="性能模式" value={settings.performanceMode ? "低频渲染" : "完整渲染"} icon={<Cpu size={16} />} onChange={(performanceMode) => onChange({ performanceMode })} />
        <ToggleSetting checked={settings.reducedMotion} label="减少动态效果" value={settings.reducedMotion ? "动态效果关闭" : "动态效果开启"} icon={<Gauge size={16} />} onChange={(reducedMotion) => onChange({ reducedMotion })} />
        <ToggleSetting checked={settings.soundEnabled} label="操作音效" value={settings.soundEnabled ? "声音开启" : "声音关闭"} icon={settings.soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />} onChange={(soundEnabled) => onChange({ soundEnabled })} />
      </section>
      <section className="settings-group">
        <header><Clock3 size={14} /><span>自动保存间隔</span></header>
        <div className="settings-segmented" aria-label="自动保存间隔">
          {([2, 10, 30] as AutosaveIntervalSeconds[]).map((seconds) => (
            <button className={settings.autosaveIntervalSeconds === seconds ? "active" : ""} type="button" key={seconds} onClick={() => onChange({ autosaveIntervalSeconds: seconds })}>{seconds} 秒</button>
          ))}
        </div>
      </section>
      <section className="settings-group">
        <header><MapPin size={14} /><span>星区与资源</span><small>种子 #{game.galaxy.seed}</small></header>
        <div className="settings-segmented" aria-label="资源模式">
          <button className={settings.resourceMode === "finite" ? "active" : ""} type="button" onClick={() => onChange({ resourceMode: "finite" })}>有限矿脉</button>
          <button className={settings.resourceMode === "infinite" ? "active" : ""} type="button" onClick={() => onChange({ resourceMode: "infinite" })}>无限矿脉</button>
        </div>
      </section>
      <section className="settings-group settings-difficulty-group">
        <header><Gauge size={14} /><span>工业难度</span><small>{DIFFICULTY_DEFINITIONS.find((definition) => definition.id === settings.difficulty)?.name ?? "标准"}</small></header>
        <div className="settings-segmented settings-difficulty-options" aria-label="工业难度">
          {DIFFICULTY_DEFINITIONS.map((definition) => (
            <button className={settings.difficulty === definition.id ? "active" : ""} type="button" key={definition.id} aria-pressed={settings.difficulty === definition.id} onClick={() => onChange({ difficulty: definition.id as DifficultyMode })} title={definition.summary}>
              {definition.name}
            </button>
          ))}
        </div>
        <p className="settings-help">{DIFFICULTY_DEFINITIONS.find((definition) => definition.id === settings.difficulty)?.summary ?? "按当前原型的默认节奏运行。"}</p>
      </section>
      <section className="settings-group settings-diagnostics">
        <header><ShieldCheck size={14} /><span>模拟诊断</span><small>确定性与性能</small></header>
        <button type="button" onClick={onRunBenchmark}><Gauge size={14} />运行 60 秒基准</button>
      </section>
    </div>
  );
}

function integrityLabel(status: SaveIntegrityStatus): string {
  if (status === "valid") return "校验通过";
  if (status === "legacy") return "旧格式"
  if (status === "repaired") return "可修复"
  return "损坏"
}

function SavesPanel({
  game,
  slots,
  snapshots,
  importPreview,
  modValidation,
  onManualSave,
  onExport,
  onImport,
  onConfirmImport,
  onCancelImport,
  onSaveSlot,
  onLoadSlot,
  onDeleteSlot,
  onCreateSnapshot,
  onLoadSnapshot,
  onDeleteSnapshot,
  onValidateMod,
  onExportModTemplate,
}: Pick<OperationsWorkspaceProps,
  "game" | "slots" | "snapshots" | "importPreview" | "modValidation" | "onManualSave" | "onExport" | "onImport" | "onConfirmImport" | "onCancelImport" | "onSaveSlot" | "onLoadSlot" | "onDeleteSlot" | "onCreateSnapshot" | "onLoadSnapshot" | "onDeleteSnapshot" | "onValidateMod" | "onExportModTemplate">) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modInputRef = useRef<HTMLInputElement>(null);
  const summaryBySlot = new Map(slots.map((slot) => [slot.slotId, slot]));
  return (
    <div className="operations-panel operations-saves">
      <header className="operations-section-header">
        <div><span>本地数据</span><strong>存档管理</strong></div>
        <span className="save-runtime"><Clock3 size={13} />运行 {formatRuntime(game.elapsedSeconds)}</span>
      </header>
      <section className="save-primary-actions">
        <button type="button" onClick={onManualSave}><Save size={15} /><span>立即保存</span></button>
        <button type="button" onClick={onCreateSnapshot}><History size={15} /><span>创建快照</span></button>
        <button type="button" onClick={onExport}><Download size={15} /><span>导出 JSON</span></button>
        <button type="button" onClick={() => fileInputRef.current?.click()}><Upload size={15} /><span>导入 JSON</span></button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          aria-label="选择要导入的存档文件"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (file) onImport(await file.text());
            event.target.value = "";
          }}
        />
      </section>
      {importPreview ? <section className="save-import-preview" aria-label="存档导入预览">
        <header><div><FileCheck2 size={15} /><strong>导入预览</strong></div><span className={`save-integrity save-integrity--${importPreview.integrity}`}>{integrityLabel(importPreview.integrity)}</span></header>
        <div className="save-preview-metrics">
          <span><small>状态版本</small><strong>v{importPreview.stateVersion ?? "?"}</strong></span>
          <span><small>运行时间</small><strong>{formatRuntime(importPreview.summary?.elapsedSeconds ?? 0)}</strong></span>
          <span><small>实体</small><strong>{importPreview.state?.entities.length ?? 0}</strong></span>
          <span><small>科技</small><strong>{importPreview.summary?.completedTechCount ?? 0}</strong></span>
        </div>
        {importPreview.issues.length > 0 ? <ul>{importPreview.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}
        <footer><button type="button" onClick={onCancelImport}>取消</button><button className="primary" type="button" onClick={onConfirmImport}><ShieldCheck size={14} />修复并导入</button></footer>
      </section> : null}
      <div className="save-slot-list">
        {([1, 2, 3] as SaveSlotId[]).map((slotId) => {
          const summary = summaryBySlot.get(slotId);
          return (
            <article className={`save-slot${summary ? " save-slot--occupied" : ""}${summary && !summary.valid ? " save-slot--invalid" : ""}`} key={slotId}>
              <i><HardDrive size={17} /></i>
              <div>
                <strong>本地槽位 {slotId}</strong>
                {summary ? (
                  <span>{new Date(summary.savedAt).toLocaleString("zh-CN")} · 科技 {summary.completedTechCount} · 结构 {summary.structurePoints} · {integrityLabel(summary.integrity)}</span>
                ) : <span>空槽位</span>}
              </div>
              <div className="save-slot-actions">
                <button type="button" onClick={() => onSaveSlot(slotId)} title={`保存到槽位 ${slotId}`} aria-label={`保存到槽位 ${slotId}`}><Save size={14} /></button>
                <button type="button" disabled={!summary?.valid} onClick={() => onLoadSlot(slotId)} title={`载入槽位 ${slotId}`} aria-label={`载入槽位 ${slotId}`}><Upload size={14} /></button>
                <button type="button" disabled={!summary} onClick={() => onDeleteSlot(slotId)} title={`删除槽位 ${slotId}`} aria-label={`删除槽位 ${slotId}`}><Trash2 size={14} /></button>
              </div>
            </article>
          );
        })}
      </div>
      <section className="save-snapshot-section">
        <header><div><History size={14} /><strong>自动快照</strong><small>最近 {snapshots.length}/5</small></div><span>可回滚</span></header>
        {snapshots.length === 0 ? <p className="save-empty-note">模拟运行后会自动保留最近快照</p> : <div className="save-snapshot-list">
          {snapshots.map((snapshot) => <article className={`save-snapshot-row${snapshot.valid ? "" : " save-snapshot-row--invalid"}`} key={snapshot.id}>
            <i>{snapshot.valid ? <ShieldCheck size={14} /> : <FileCheck2 size={14} />}</i>
            <div><strong>{snapshot.reason}</strong><span>{new Date(snapshot.savedAt).toLocaleTimeString("zh-CN")} · {formatRuntime(snapshot.elapsedSeconds)} · 科技 {snapshot.completedTechCount}</span></div>
            <button type="button" disabled={!snapshot.valid} onClick={() => onLoadSnapshot(snapshot.id)} title="回滚到此快照" aria-label={`回滚到快照 ${snapshot.id}`}><RotateCcw size={13} /></button>
            <button type="button" onClick={() => onDeleteSnapshot(snapshot.id)} title="删除快照" aria-label={`删除快照 ${snapshot.id}`}><Trash2 size={13} /></button>
          </article>)}
        </div>}
      </section>
      <section className="content-pack-section">
        <header><div><FileCheck2 size={14} /><strong>内容包校验</strong></div><small>只读检查，不会修改核心目录</small></header>
        <div className="content-pack-actions"><button type="button" onClick={() => modInputRef.current?.click()}><Upload size={14} />选择内容包 JSON</button><button type="button" onClick={onExportModTemplate}><Download size={14} />导出模板</button></div>
        <input ref={modInputRef} type="file" accept="application/json,.json" aria-label="选择内容包文件" onChange={async (event) => { const file = event.target.files?.[0]; if (file) onValidateMod(await file.text()); event.target.value = ""; }} />
        {modValidation ? <div className={`content-pack-result${modValidation.valid ? " content-pack-result--valid" : " content-pack-result--invalid"}`}><strong>{modValidation.valid ? "内容包校验通过" : "内容包存在问题"}</strong><span>{modValidation.manifest?.name ?? "未识别内容包"} · 物品 {modValidation.counts.items} · 配方 {modValidation.counts.recipes} · 科技 {modValidation.counts.technologies}</span>{modValidation.issues.slice(0, 3).map((issue) => <small key={`${issue.code}-${issue.path}`}>{issue.severity === "error" ? "错误" : "提示"}：{issue.message}</small>)}</div> : null}
      </section>
    </div>
  );
}

export function OperationsWorkspace(props: OperationsWorkspaceProps) {
  if (!props.open) return null;
  const unlockedCount = props.game.achievements.unlockedIds.length;
  return (
    <section className="operations-workspace" role="dialog" aria-modal="true" aria-label="运营中心">
      <header className="operations-header">
        <div className="operations-title">
          <i><Gauge size={20} /></i>
          <div><span>星系运行协议</span><strong>运营中心</strong></div>
        </div>
        <div className="operations-summary">
          <span className={props.alerts.length > 0 ? "warning" : "positive"}><Bell size={13} />警报 <strong>{props.alerts.length}</strong></span>
          <span><Trophy size={13} />成就 <strong>{unlockedCount}/{ACHIEVEMENTS.length}</strong></span>
        </div>
        <button className="operations-close" type="button" onClick={props.onClose} title="关闭运营中心" aria-label="关闭运营中心"><X size={18} /></button>
      </header>
      <nav className="operations-tabs" role="tablist" aria-label="运营中心视图">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const count = tab.id === "alerts" ? props.alerts.length : tab.id === "achievements" ? unlockedCount : null;
          return (
            <button className={props.tab === tab.id ? "active" : ""} type="button" role="tab" aria-selected={props.tab === tab.id} key={tab.id} onClick={() => props.onTabChange(tab.id)}>
              <Icon size={15} /><span>{tab.label}</span>{count != null ? <strong>{count}</strong> : null}
            </button>
          );
        })}
      </nav>
      <div className="operations-body">
        {props.tab === "alerts" ? <AlertsPanel alerts={props.alerts} onSelect={props.onAlertSelect} /> : null}
        {props.tab === "achievements" ? <AchievementsPanel game={props.game} /> : null}
        {props.tab === "settings" ? <SettingsPanel game={props.game} onChange={props.onSettingsChange} onRunBenchmark={props.onRunBenchmark} /> : null}
        {props.tab === "saves" ? <SavesPanel {...props} /> : null}
      </div>
    </section>
  );
}
