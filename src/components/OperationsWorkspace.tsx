import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock3,
  Cpu,
  Download,
  Gauge,
  HardDrive,
  MapPin,
  Save,
  Settings2,
  Trash2,
  Trophy,
  Upload,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import { useRef } from "react";
import { getPlanet } from "../game/content";
import { ACHIEVEMENTS, getAchievementProgress } from "../game/progression";
import type { FactoryAlert } from "../game/alerts";
import type { SaveSlotId, SaveSlotSummary } from "../game/storage";
import type { AutosaveIntervalSeconds, GameSettings, GameState, SimulationSpeed } from "../game/types";

export type OperationsTab = "alerts" | "achievements" | "settings" | "saves";

interface OperationsWorkspaceProps {
  open: boolean;
  tab: OperationsTab;
  game: GameState;
  alerts: FactoryAlert[];
  slots: SaveSlotSummary[];
  onClose: () => void;
  onTabChange: (tab: OperationsTab) => void;
  onAlertSelect: (alert: FactoryAlert) => void;
  onSettingsChange: (settings: Partial<GameSettings>) => void;
  onManualSave: () => void;
  onExport: () => void;
  onImport: (raw: string) => void;
  onSaveSlot: (slotId: SaveSlotId) => void;
  onLoadSlot: (slotId: SaveSlotId) => void;
  onDeleteSlot: (slotId: SaveSlotId) => void;
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

function SettingsPanel({ game, onChange }: { game: GameState; onChange: (settings: Partial<GameSettings>) => void }) {
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
    </div>
  );
}

function SavesPanel({ game, slots, onManualSave, onExport, onImport, onSaveSlot, onLoadSlot, onDeleteSlot }: Pick<OperationsWorkspaceProps,
  "game" | "slots" | "onManualSave" | "onExport" | "onImport" | "onSaveSlot" | "onLoadSlot" | "onDeleteSlot">) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const summaryBySlot = new Map(slots.map((slot) => [slot.slotId, slot]));
  return (
    <div className="operations-panel operations-saves">
      <header className="operations-section-header">
        <div><span>本地数据</span><strong>存档管理</strong></div>
        <span className="save-runtime"><Clock3 size={13} />运行 {formatRuntime(game.elapsedSeconds)}</span>
      </header>
      <section className="save-primary-actions">
        <button type="button" onClick={onManualSave}><Save size={15} /><span>立即保存</span></button>
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
      <div className="save-slot-list">
        {([1, 2, 3] as SaveSlotId[]).map((slotId) => {
          const summary = summaryBySlot.get(slotId);
          return (
            <article className={`save-slot${summary ? " save-slot--occupied" : ""}`} key={slotId}>
              <i><HardDrive size={17} /></i>
              <div>
                <strong>本地槽位 {slotId}</strong>
                {summary ? (
                  <span>{new Date(summary.savedAt).toLocaleString("zh-CN")} · 科技 {summary.completedTechCount} · 结构 {summary.structurePoints}</span>
                ) : <span>空槽位</span>}
              </div>
              <div className="save-slot-actions">
                <button type="button" onClick={() => onSaveSlot(slotId)} title={`保存到槽位 ${slotId}`} aria-label={`保存到槽位 ${slotId}`}><Save size={14} /></button>
                <button type="button" disabled={!summary} onClick={() => onLoadSlot(slotId)} title={`载入槽位 ${slotId}`} aria-label={`载入槽位 ${slotId}`}><Upload size={14} /></button>
                <button type="button" disabled={!summary} onClick={() => onDeleteSlot(slotId)} title={`删除槽位 ${slotId}`} aria-label={`删除槽位 ${slotId}`}><Trash2 size={14} /></button>
              </div>
            </article>
          );
        })}
      </div>
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
      <nav className="operations-tabs" aria-label="运营中心视图">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const count = tab.id === "alerts" ? props.alerts.length : tab.id === "achievements" ? unlockedCount : null;
          return (
            <button className={props.tab === tab.id ? "active" : ""} type="button" key={tab.id} onClick={() => props.onTabChange(tab.id)}>
              <Icon size={15} /><span>{tab.label}</span>{count != null ? <strong>{count}</strong> : null}
            </button>
          );
        })}
      </nav>
      <div className="operations-body">
        {props.tab === "alerts" ? <AlertsPanel alerts={props.alerts} onSelect={props.onAlertSelect} /> : null}
        {props.tab === "achievements" ? <AchievementsPanel game={props.game} /> : null}
        {props.tab === "settings" ? <SettingsPanel game={props.game} onChange={props.onSettingsChange} /> : null}
        {props.tab === "saves" ? <SavesPanel {...props} /> : null}
      </div>
    </section>
  );
}
