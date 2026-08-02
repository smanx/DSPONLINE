import { AlertTriangle, ChevronDown, ChevronRight, LockKeyhole, Orbit, Route, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { ITEMS, STAR_SYSTEM_LIST, getBuilding, getPlanet } from "../game/content";
import { getPlanetDisplayName, getPlanetOrbitalYields, getStarSystemDisplayName } from "../game/galaxy";
import { getStationSlots } from "../game/engine";
import type { FactoryEntity, GameState, ItemId, StationLogisticsMode, StationLogisticsScope, StationMinimumLoad } from "../game/types";
import { formatQuantityCompact } from "../game/quantityFormat";

const LOGISTICS_VIEW_KEY = "dsp-idle-network.logistics-management-view.v1";

type StationFilter = "all" | "planetary" | "interstellar" | "collector" | "quantum";
type IssueFilter = "all" | "issues";

interface LogisticsViewPreference {
  query: string;
  typeFilter: StationFilter;
  issueFilter: IssueFilter;
  expandedSystems: string[];
  expandedPlanets: string[];
  expandedStations: string[];
}

type ExpandedPreferenceKey = "expandedSystems" | "expandedPlanets" | "expandedStations";

const EMPTY_LOGISTICS_VIEW: LogisticsViewPreference = {
  query: "",
  typeFilter: "all",
  issueFilter: "all",
  expandedSystems: [],
  expandedPlanets: [],
  expandedStations: [],
};

function readPreference(): LogisticsViewPreference {
  try {
    const value = JSON.parse(window.localStorage.getItem(LOGISTICS_VIEW_KEY) ?? "{}") as Partial<LogisticsViewPreference>;
    return {
      query: typeof value.query === "string" ? value.query.slice(0, 120) : "",
      typeFilter: value.typeFilter === "planetary" || value.typeFilter === "interstellar" || value.typeFilter === "collector" || value.typeFilter === "quantum" ? value.typeFilter : "all",
      issueFilter: value.issueFilter === "issues" ? "issues" : "all",
      expandedSystems: Array.isArray(value.expandedSystems) ? value.expandedSystems.filter((id): id is string => typeof id === "string").slice(0, 32) : [],
      expandedPlanets: Array.isArray(value.expandedPlanets) ? value.expandedPlanets.filter((id): id is string => typeof id === "string").slice(0, 64) : [],
      expandedStations: Array.isArray(value.expandedStations) ? value.expandedStations.filter((id): id is string => typeof id === "string").slice(0, 512) : [],
    };
  } catch {
    return EMPTY_LOGISTICS_VIEW;
  }
}

function persistPreference(preference: LogisticsViewPreference): void {
  try { window.localStorage.setItem(LOGISTICS_VIEW_KEY, JSON.stringify(preference)); } catch { /* device preference is best effort */ }
}

function stationLabel(entity: FactoryEntity): string {
  if (entity.buildingId === "planetary_logistics_station") return "行星物流站";
  if (entity.buildingId === "interstellar_logistics_station") return "星际物流站";
  return "轨道采集器";
}

function stationHasIssue(entity: FactoryEntity): boolean {
  if (entity.interactionLocked || entity.quantumMode === "transitioning" || Boolean(entity.quantumTransition)) return true;
  if (entity.buildingId === "orbital_collector") return !entity.storedItemId;
  const slots = getStationSlots(entity).filter((slot) => slot.itemId);
  if (slots.length === 0) return true;
  if ((entity.stationDrones ?? 0) === 0 && slots.some((slot) => slot.localMode !== "storage")) return true;
  return entity.buildingId === "interstellar_logistics_station" && (entity.quantumMode ?? "legacy") !== "quantum" &&
    (entity.stationVessels ?? 0) === 0 && slots.some((slot) => slot.remoteMode !== "storage");
}

function stationMatchesType(entity: FactoryEntity, filter: StationFilter): boolean {
  if (filter === "all") return true;
  if (filter === "planetary") return entity.buildingId === "planetary_logistics_station";
  if (filter === "interstellar") return entity.buildingId === "interstellar_logistics_station";
  if (filter === "collector") return entity.buildingId === "orbital_collector";
  return entity.quantumMode === "quantum" || entity.quantumMode === "transitioning";
}

export interface LogisticsManagementPanelProps {
  game: GameState;
  onSlotItemChange: (entityId: string, slotIndex: number, itemId: ItemId | null) => void;
  onSlotModeChange: (entityId: string, slotIndex: number, scope: StationLogisticsScope, mode: StationLogisticsMode) => void;
  onSlotMinimumLoadChange: (entityId: string, slotIndex: number, minimumLoad: StationMinimumLoad) => void;
  onSlotLimitsChange: (entityId: string, slotIndex: number, minStock: number, maxStock: number) => void;
  onSlotPriorityChange: (entityId: string, slotIndex: number, priority: 0 | 1 | 2) => void;
  onFleetTargetChange: (entityId: string, kind: "drone" | "vessel", target: number) => void;
  onWarperAdjust: (entityId: string, delta: number) => void;
  onWarpEnabledChange: (entityId: string, enabled: boolean) => void;
  onWarperAutoRefillChange: (entityId: string, enabled: boolean) => void;
  onWarperTargetChange: (entityId: string, target: number) => void;
  onStackTargetChange: (entityId: string, target: number) => void;
  onQuantumAttach: (entityId: string) => void;
  onCollectorQuantumModeChange: (entityId: string, enabled: boolean) => void;
  onCollectorItemChange: (entityId: string, itemId: ItemId) => void;
}

export function LogisticsManagementPanel(props: LogisticsManagementPanelProps) {
  const [preference, setPreference] = useState<LogisticsViewPreference>(readPreference);
  const { query, typeFilter, issueFilter } = preference;
  const stations = useMemo(() => props.game.entities.filter((entity) =>
    entity.buildingId === "planetary_logistics_station" || entity.buildingId === "interstellar_logistics_station" || entity.buildingId === "orbital_collector"), [props.game.entities]);
  const term = query.trim().toLocaleLowerCase("zh-CN");
  const visible = useMemo(() => stations.filter((entity) => {
    if (!stationMatchesType(entity, typeFilter) || issueFilter === "issues" && !stationHasIssue(entity)) return false;
    if (!term) return true;
    const slotText = getStationSlots(entity).flatMap((slot) => slot.itemId ? [ITEMS[slot.itemId]?.name ?? slot.itemId] : []).join(" ");
    const haystack = `${stationLabel(entity)} ${entity.id} ${getPlanetDisplayName(props.game, entity.planetId)} ${getStarSystemDisplayName(props.game, getPlanet(entity.planetId).systemId)} ${slotText}`.toLocaleLowerCase("zh-CN");
    return haystack.includes(term);
  }), [issueFilter, props.game, stations, term, typeFilter]);

  const updatePreference = (key: ExpandedPreferenceKey, id: string) => {
    setPreference((current) => {
      const values = current[key];
      const next = { ...current, [key]: values.includes(id) ? values.filter((value) => value !== id) : [...values, id] };
      persistPreference(next);
      return next;
    });
  };

  const updateFilter = (changes: Partial<Pick<LogisticsViewPreference, "query" | "typeFilter" | "issueFilter">>) => {
    setPreference((current) => {
      const next = { ...current, ...changes };
      persistPreference(next);
      return next;
    });
  };

  return <div className="operations-panel logistics-management" data-testid="logistics-management">
    <header className="operations-section-header">
      <div><span>跨星球安全命令</span><strong>物流管理</strong></div>
      <span className="settings-state"><Route size={14} />物流节点 {visible.length}/{stations.length}</span>
    </header>
    <section className="logistics-management-filters" aria-label="物流筛选">
      <label><Search size={15} /><input value={query} onChange={(event) => updateFilter({ query: event.target.value.slice(0, 120) })} placeholder="搜索星系、星球、塔或物品" aria-label="搜索物流塔" /></label>
      <select value={typeFilter} onChange={(event) => updateFilter({ typeFilter: event.target.value as StationFilter })} aria-label="物流塔类型筛选">
        <option value="all">全部类型</option><option value="planetary">行星物流站</option><option value="interstellar">星际物流站</option><option value="collector">轨道采集器</option><option value="quantum">量子接入</option>
      </select>
      <select value={issueFilter} onChange={(event) => updateFilter({ issueFilter: event.target.value as IssueFilter })} aria-label="物流异常筛选">
        <option value="all">全部状态</option><option value="issues">仅异常</option>
      </select>
    </section>
    <div className="logistics-tree">
      {STAR_SYSTEM_LIST.map((system) => {
        const systemStations = visible.filter((entity) => getPlanet(entity.planetId).systemId === system.id);
        if (systemStations.length === 0) return null;
        const systemOpen = preference.expandedSystems.includes(system.id) || Boolean(term);
        return <section className="logistics-system" key={system.id}>
          <button className="logistics-tree-toggle" type="button" aria-expanded={systemOpen} onClick={() => updatePreference("expandedSystems", system.id)}>
            {systemOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<span><strong>{getStarSystemDisplayName(props.game, system.id)}</strong><small>{systemStations.length} 个物流节点</small></span>
          </button>
          {systemOpen ? <div className="logistics-planets">{system.planetIds.map((planetId) => {
            const planetStations = systemStations.filter((entity) => entity.planetId === planetId);
            if (planetStations.length === 0) return null;
            const planetOpen = preference.expandedPlanets.includes(planetId) || Boolean(term);
            return <section className="logistics-planet" key={planetId}>
              <button className="logistics-tree-toggle" type="button" aria-expanded={planetOpen} onClick={() => updatePreference("expandedPlanets", planetId)}>
                {planetOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<span><strong>{getPlanetDisplayName(props.game, planetId)}</strong><small>{planetStations.length} 座</small></span>
              </button>
              {planetOpen ? <div className="logistics-stations">{planetStations.map((entity) => <StationEditor key={entity.id} entity={entity} {...props} open={preference.expandedStations.includes(entity.id)} onToggle={() => updatePreference("expandedStations", entity.id)} />)}</div> : null}
            </section>;
          })}</div> : null}
        </section>;
      })}
      {visible.length === 0 ? <div className="operations-empty"><Search size={28} /><strong>没有匹配的物流节点</strong><span>请调整搜索词、类型或异常筛选。</span></div> : null}
    </div>
  </div>;
}

function StationEditor({ entity, game, open, onToggle, ...actions }: LogisticsManagementPanelProps & { entity: FactoryEntity; open: boolean; onToggle: () => void }) {
  const interstellar = entity.buildingId === "interstellar_logistics_station";
  const collector = entity.buildingId === "orbital_collector";
  const slots = collector ? [] : getStationSlots(entity);
  const issue = stationHasIssue(entity);
  const orbitalItems = collector ? Object.entries(getPlanetOrbitalYields(game, entity.planetId)).filter(([, amount]) => (amount ?? 0) > 0).map(([itemId]) => itemId as ItemId) : [];
  return <article className={`logistics-station${issue ? " logistics-station--issue" : ""}${entity.interactionLocked ? " logistics-station--locked" : ""}`} data-station-id={entity.id}>
    <button className="logistics-station-summary" type="button" aria-expanded={open} onClick={onToggle}>
      {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<Orbit size={17} />
      <span><strong>{stationLabel(entity)}</strong><small>{entity.id} · ×{formatQuantityCompact(entity.machineCount)}</small></span>
      <em>{entity.quantumMode === "quantum" ? "量子" : entity.quantumMode === "transitioning" ? "接入中" : "传统"}</em>
      {entity.interactionLocked ? <LockKeyhole size={15} /> : issue ? <AlertTriangle size={15} /> : null}
    </button>
    {open ? <div className="logistics-station-editor">
      {entity.interactionLocked ? <p className="logistics-editor-warning"><LockKeyhole size={14} />建筑已锁定，远程修改已禁用。</p> : null}
      <fieldset disabled={entity.interactionLocked}>
        <div className="logistics-station-settings">
          <label><span>堆叠数量</span><input key={`${entity.id}:stack:${entity.machineCount}`} type="number" min={1} max={100_000_000} step={1} defaultValue={entity.machineCount} onBlur={(event) => actions.onStackTargetChange(entity.id, Number(event.target.value))} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
          {!collector ? <label><span>运输机</span><input key={`${entity.id}:drone:${entity.stationDrones ?? 0}`} type="number" min={0} step={1} defaultValue={entity.stationDrones ?? 0} onBlur={(event) => actions.onFleetTargetChange(entity.id, "drone", Number(event.target.value))} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label> : null}
          {interstellar ? <label><span>运输船</span><input key={`${entity.id}:vessel:${entity.stationVessels ?? 0}`} type="number" min={0} step={1} defaultValue={entity.stationVessels ?? 0} onBlur={(event) => actions.onFleetTargetChange(entity.id, "vessel", Number(event.target.value))} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label> : null}
          {interstellar ? <label><span>翘曲器</span><span className="logistics-warper-stepper"><button type="button" onClick={() => actions.onWarperAdjust(entity.id, -10)}>-10</button><b>{entity.stationWarpers ?? 0}</b><button type="button" onClick={() => actions.onWarperAdjust(entity.id, 10)}>+10</button></span></label> : null}
          {interstellar ? <label className="logistics-checkbox"><input type="checkbox" checked={entity.stationWarpEnabled !== false} onChange={(event) => actions.onWarpEnabledChange(entity.id, event.target.checked)} /><span>允许翘曲</span></label> : null}
          {interstellar ? <label className="logistics-checkbox"><input type="checkbox" checked={Boolean(entity.stationWarperAutoRefill)} onChange={(event) => actions.onWarperAutoRefillChange(entity.id, event.target.checked)} /><span>自动补充</span></label> : null}
          {interstellar ? <label><span>补充目标</span><input key={`${entity.id}:warper-target:${entity.stationWarperTarget ?? 50}`} type="number" min={1} step={1} defaultValue={entity.stationWarperTarget ?? 50} onBlur={(event) => actions.onWarperTargetChange(entity.id, Number(event.target.value))} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label> : null}
        </div>
        {collector ? <div className="logistics-collector-settings">
          <label><span>采集气体</span><select value={entity.storedItemId ?? orbitalItems[0] ?? ""} onChange={(event) => actions.onCollectorItemChange(entity.id, event.target.value as ItemId)}>{orbitalItems.map((itemId) => <option value={itemId} key={itemId}>{ITEMS[itemId].name}</option>)}</select></label>
          <button type="button" onClick={() => actions.onCollectorQuantumModeChange(entity.id, entity.quantumMode !== "quantum")} disabled={entity.quantumMode === "transitioning"}>{entity.quantumMode === "quantum" ? "关闭量子采集" : "接入量子采集网络"}</button>
        </div> : interstellar ? <div className="logistics-quantum-setting"><span>星际模式：<strong>{entity.quantumMode === "quantum" ? "量子网络" : entity.quantumMode === "transitioning" ? "正在安全交接" : "传统航线"}</strong></span><button type="button" disabled={entity.quantumMode !== "legacy" || (entity.stationTier ?? 1) < 2} onClick={() => actions.onQuantumAttach(entity.id)}>接入量子网络</button></div> : null}
        {slots.length > 0 ? <div className="logistics-slot-editor-list">{slots.map((slot, slotIndex) => {
          const configuredElsewhere = new Set(slots.flatMap((candidate, index) => index !== slotIndex && candidate.itemId ? [candidate.itemId] : []));
          return <article className="logistics-slot-editor" key={slotIndex}>
            <header><strong>槽位 {slotIndex + 1}</strong><span>{slot.itemId ? `${formatQuantityCompact(entity.inputs[slot.itemId] ?? 0)} 输入 · ${formatQuantityCompact(entity.outputs[slot.itemId] ?? 0)} 库存` : "未配置"}</span></header>
            <label><span>物品</span><select value={slot.itemId ?? ""} onChange={(event) => actions.onSlotItemChange(entity.id, slotIndex, event.target.value ? event.target.value as ItemId : null)}><option value="">清空槽位</option>{Object.values(ITEMS).filter((item) => !configuredElsewhere.has(item.id)).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
            {slot.itemId ? <div className="logistics-slot-grid">
              <label><span>本地</span><select value={slot.localMode} onChange={(event) => actions.onSlotModeChange(entity.id, slotIndex, "local", event.target.value as StationLogisticsMode)}><option value="supply">供应</option><option value="demand">需求</option><option value="storage">仓储</option></select></label>
              {interstellar ? <label><span>星际</span><select value={slot.remoteMode} onChange={(event) => actions.onSlotModeChange(entity.id, slotIndex, "remote", event.target.value as StationLogisticsMode)}><option value="supply">供应</option><option value="demand">需求</option><option value="storage">仓储</option></select></label> : null}
              <label><span>优先级</span><select value={slot.priority} onChange={(event) => actions.onSlotPriorityChange(entity.id, slotIndex, Number(event.target.value) as 0 | 1 | 2)}><option value={2}>高</option><option value={1}>标准</option><option value={0}>低</option></select></label>
              <label><span>起送比例</span><select value={slot.minimumLoad} onChange={(event) => actions.onSlotMinimumLoadChange(entity.id, slotIndex, Number(event.target.value) as StationMinimumLoad)}><option value={0.1}>10%</option><option value={0.25}>25%</option><option value={0.5}>50%</option><option value={1}>100%</option></select></label>
              <label><span>库存下限</span><input key={`${entity.id}:${slotIndex}:min:${slot.minStock}`} type="number" min={0} max={100_000_000} step={1} defaultValue={slot.minStock} onBlur={(event) => actions.onSlotLimitsChange(entity.id, slotIndex, Number(event.target.value), slot.maxStock)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
              <label><span>库存上限</span><input key={`${entity.id}:${slotIndex}:max:${slot.maxStock}`} type="number" min={0} max={100_000_000} step={1} defaultValue={slot.maxStock} onBlur={(event) => actions.onSlotLimitsChange(entity.id, slotIndex, slot.minStock, Number(event.target.value))} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
            </div> : null}
          </article>;
        })}</div> : null}
      </fieldset>
    </div> : null}
  </article>;
}
