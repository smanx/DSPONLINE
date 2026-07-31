import { AlertTriangle, ArrowRight, Check, ChevronRight, Factory, Gauge, LocateFixed, LockKeyhole, Navigation, Orbit, Pencil, RotateCcw, Route, Save, Search, Sparkles, Tags, Telescope, Timer, Zap, X } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { STAR_SYSTEM_LIST, getItem, getPlanet, getStarSystem, getTechnology } from "../game/content";
import { canColonizePlanet, canExploreStarSystem, getColonizationRequirements, getStationSlots, isPlanetColonized, isStarSystemUnlocked, isTechnologyCompleted } from "../game/engine";
import { getPlanetDisplayName, getPlanetIndustrialProfile, getPlanetSearchText, getPlanetSolarPowerMultiplier, getRecommendedPlanetRole, getStarSystemDisplayName, getStarSystemProfile, PLANET_CUSTOM_NAME_MAX_LENGTH, PLANET_INDUSTRY_ROLE_LABELS, PLANET_NOTE_MAX_LENGTH, PLANET_TAG_MAX_COUNT, PLANET_TAG_MAX_LENGTH, STAR_SYSTEM_CUSTOM_NAME_MAX_LENGTH } from "../game/galaxy";
import { getInterplanetaryLogisticsDiagnostics, getPlanetIndustrySummaries, getRouteDistanceLabel, getRouteEndpointLabel, getRoutePathLabel, getStarSystemIndustrySummaries, getStellarRouteSnapshots } from "../game/stellarIndustry";
import { getSpaceStationState } from "../game/systemSpaceStation";
import type { GameState, ItemId, LogisticsPriority, PlanetId, PlanetIndustryRole, StarSystemId, StationMinimumLoad } from "../game/types";
import { ItemGlyph, ItemHoverCard } from "./ItemReference";
import { PowerValue } from "./PowerValue";
import { formatQuantityCompact } from "../game/quantityFormat";

function formatDistance(distanceLy: number): string {
  return distanceLy <= 0 ? "本地" : `${distanceLy.toFixed(1)} 光年`;
}

function spaceStationStatusLabel(status: "not-started" | "building" | "operational"): string {
  return status === "operational" ? "已运行" : status === "building" ? "施工中" : "未开工";
}

function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return formatQuantityCompact(Math.round(value));
}

function formatDepletion(seconds: number | null): string {
  if (seconds == null) return "稳定";
  if (seconds < 60) return "<1 分钟";
  if (seconds < 3_600) return `${Math.ceil(seconds / 60)} 分钟`;
  if (seconds < 86_400) return `${(seconds / 3_600).toFixed(1)} 小时`;
  return `${(seconds / 86_400).toFixed(1)} 天`;
}

const PLANET_ROLES = Object.keys(PLANET_INDUSTRY_ROLE_LABELS) as PlanetIndustryRole[];

const OCEAN_LABELS = {
  water: "水海洋",
  "sulfuric-acid": "硫酸海洋",
  lava: "熔岩海",
  ice: "冻结海洋",
  none: "无海洋",
} as const;

function StellarMetadataManager({ game, compact = false, onPlanetMetadataChange, onSystemNameChange }: {
  game: GameState;
  compact?: boolean;
  onPlanetMetadataChange: (planetId: PlanetId, metadata: { customName: string; note: string; tags: string[] }) => void;
  onSystemNameChange: (systemId: StarSystemId, customName: string) => void;
}) {
  const [planetId, setPlanetId] = useState<PlanetId>(game.activePlanetId);
  const [systemId, setSystemId] = useState<StarSystemId>(getPlanet(game.activePlanetId).systemId);
  const metadata = game.galaxy.planetMetadata?.[planetId];
  const systemMetadata = game.galaxy.systemMetadata?.[systemId];
  const [planetName, setPlanetName] = useState(metadata?.customName ?? "");
  const [systemName, setSystemName] = useState(systemMetadata?.customName ?? "");
  const [note, setNote] = useState(metadata?.note ?? "");
  const [tags, setTags] = useState((metadata?.tags ?? []).join("，"));

  useEffect(() => {
    const current = game.galaxy.planetMetadata?.[planetId];
    setPlanetName(current?.customName ?? "");
    setNote(current?.note ?? "");
    setTags((current?.tags ?? []).join("，"));
  }, [game.galaxy.planetMetadata, planetId]);
  useEffect(() => setSystemName(game.galaxy.systemMetadata?.[systemId]?.customName ?? ""), [game.galaxy.systemMetadata, systemId]);

  const parsedTags = [...new Set(tags.split(/[，,\n]/).map((tag) => tag.trim().slice(0, PLANET_TAG_MAX_LENGTH)).filter(Boolean))].slice(0, PLANET_TAG_MAX_COUNT);
  return <details className={`stellar-metadata-manager${compact ? " stellar-metadata-manager--compact" : ""}`}>
    <summary><Pencil size={15} /><span>自定义星球资料</span><small>名称、备注与标签</small></summary>
    <div>
      <form onSubmit={(event) => { event.preventDefault(); onSystemNameChange(systemId, systemName); }}>
        <header><Sparkles size={15} /><strong>恒星系名称</strong></header>
        <label><span>恒星系</span><select value={systemId} onChange={(event) => setSystemId(event.target.value as StarSystemId)}>{STAR_SYSTEM_LIST.map((system) => <option value={system.id} key={system.id}>{getStarSystemDisplayName(game, system.id)}</option>)}</select></label>
        <label><span>自定义名称</span><input value={systemName} maxLength={STAR_SYSTEM_CUSTOM_NAME_MAX_LENGTH} placeholder={getStarSystem(systemId).name} onChange={(event) => setSystemName(event.target.value)} /></label>
        <footer><button type="button" onClick={() => { setSystemName(""); onSystemNameChange(systemId, ""); }}><RotateCcw size={14} />恢复默认</button><button className="primary" type="submit"><Save size={14} />保存星系名称</button></footer>
      </form>
      <form onSubmit={(event) => { event.preventDefault(); onPlanetMetadataChange(planetId, { customName: planetName, note, tags: parsedTags }); }}>
        <header><Orbit size={15} /><strong>行星资料</strong></header>
        <label><span>行星</span><select value={planetId} onChange={(event) => setPlanetId(event.target.value as PlanetId)}>{STAR_SYSTEM_LIST.flatMap((system) => system.planetIds).map((id) => <option value={id} key={id}>{getPlanetDisplayName(game, id)} · {getStarSystemDisplayName(game, getPlanet(id).systemId)}</option>)}</select></label>
        <label><span>自定义名称</span><input value={planetName} maxLength={PLANET_CUSTOM_NAME_MAX_LENGTH} placeholder={getPlanet(planetId).name} onChange={(event) => setPlanetName(event.target.value)} /></label>
        <label><span>备注</span><textarea value={note} maxLength={PLANET_NOTE_MAX_LENGTH} rows={compact ? 2 : 3} placeholder="记录产线用途、物流计划或资源安排" onChange={(event) => setNote(event.target.value)} /></label>
        <label><span><Tags size={13} />标签</span><input value={tags} placeholder="例如：绿糖，出口，缺电" onChange={(event) => setTags(event.target.value)} /><small>逗号分隔，最多 {PLANET_TAG_MAX_COUNT} 个</small></label>
        <footer><button type="button" onClick={() => { setPlanetName(""); onPlanetMetadataChange(planetId, { customName: "", note, tags: parsedTags }); }}><RotateCcw size={14} />恢复默认名称</button><button className="primary" type="submit"><Save size={14} />保存行星资料</button></footer>
      </form>
    </div>
  </details>;
}

function getStellarStationSlot(game: GameState, entityId: string, slotIndex: number) {
  const station = game.entities.find((entity) => entity.id === entityId && entity.kind === "station");
  return station ? getStationSlots(station)[slotIndex] : undefined;
}

interface IndustryConsoleProps {
  game: GameState;
  onTravel: (planetId: PlanetId) => void;
  onRoleChange: (planetId: PlanetId, role: PlanetIndustryRole) => void;
  onStationPriorityChange: (entityId: string, slotIndex: number, priority: LogisticsPriority) => void;
  onStationMinimumLoadChange: (entityId: string, slotIndex: number, minimumLoad: StationMinimumLoad) => void;
  onStationLimitsChange: (entityId: string, slotIndex: number, minStock: number, maxStock: number) => void;
  onFocusStation: (entityId: string, planetId: PlanetId) => void;
}

function IndustryConsole({ game, onTravel, onRoleChange, onStationPriorityChange, onStationMinimumLoadChange, onStationLimitsChange, onFocusStation }: IndustryConsoleProps) {
  const [query, setQuery] = useState("");
  const [routeFilter, setRouteFilter] = useState<"all" | "remote" | "issues">("all");
  const routes = useMemo(() => getStellarRouteSnapshots(game), [game]);
  const logisticsDiagnostics = useMemo(() => getInterplanetaryLogisticsDiagnostics(game, routes), [game, routes]);
  const planets = useMemo(() => getPlanetIndustrySummaries(game, routes), [game, routes]);
  const systems = useMemo(() => getStarSystemIndustrySummaries(game, routes, planets), [game, planets, routes]);
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const visibleRoutes = routes.filter((route) => {
    if (routeFilter === "remote" && route.scope !== "remote") return false;
    if (routeFilter === "issues" && (route.status === "active" || route.status === "ready" || route.status === "missing-stock" || route.status === "target-full")) return false;
    if (!normalizedQuery) return true;
    const terms = `${getRouteEndpointLabel(route.sourceStationId, game)} ${getRouteEndpointLabel(route.targetStationId, game)} ${route.itemId}`.toLocaleLowerCase("zh-CN");
    return terms.includes(normalizedQuery);
  });
  const activeRoutes = routes.filter((route) => route.status === "active").length;
  const blockedRoutes = routes.filter((route) => !["active", "ready", "missing-stock", "target-full"].includes(route.status)).length;
  const soonestDepletion = planets.flatMap((planet) => planet.depletionSeconds == null ? [] : [planet.depletionSeconds]);

  return (
    <div className="stellar-industry">
      <div className="stellar-industry-summary" aria-label="星区工业摘要">
        <div><Factory size={15} /><span>工业设备<strong>{planets.reduce((sum, planet) => sum + planet.deviceCount, 0)}</strong></span></div>
        <div><Route size={15} /><span>航线运行<strong>{activeRoutes}/{routes.length}</strong></span></div>
        <div className={blockedRoutes > 0 ? "warning" : ""}><AlertTriangle size={15} /><span>航线问题<strong>{blockedRoutes}</strong></span></div>
        <div><Timer size={15} /><span>最近枯竭<strong>{formatDepletion(soonestDepletion.length > 0 ? Math.min(...soonestDepletion) : null)}</strong></span></div>
      </div>

      <section className="stellar-system-overview" aria-label="星系统计与行星工业标签">
        {systems.map((system) => (
          <article className="stellar-system-row" key={system.systemId}>
            <header>
              <span>{getStarSystemProfile(game, system.systemId).starTypeName} · 光度 {getStarSystemProfile(game, system.systemId).luminosity.toFixed(2)} L☉</span>
              <strong>{getStarSystemDisplayName(game, system.systemId)}</strong>
              <small>{system.deviceCount} 设备 · {system.routeCount} 航线 · 储量 {compactNumber(system.reserveRemaining)}</small>
              <em className={system.blockedRouteCount > 0 ? "warning" : ""}>{system.blockedRouteCount > 0 ? `${system.blockedRouteCount} 问题` : "运行正常"}</em>
            </header>
            <div>
              {system.planetIds.map((planetId) => {
                const planet = getPlanet(planetId);
                const summary = planets.find((candidate) => candidate.planetId === planetId)!;
                const colonized = isPlanetColonized(game, planetId);
                return (
                  <div className={`stellar-planet-row${summary.issues.length > 0 ? " stellar-planet-row--warning" : ""}`} key={planetId}>
                    <button type="button" disabled={!colonized} onClick={() => onTravel(planetId)} title={colonized ? `进入${getPlanetDisplayName(game, planetId)}` : `${getPlanetDisplayName(game, planetId)}尚未殖民`}>
                      <i style={{ color: planet.color }}><Orbit size={15} /></i>
                      <span><strong>{getPlanetDisplayName(game, planetId)}</strong><small>{game.galaxy.planetMetadata?.[planetId]?.tags?.length ? game.galaxy.planetMetadata[planetId]!.tags.join(" · ") : summary.tags.length > 0 ? summary.tags.join(" · ") : planet.environment}</small></span>
                    </button>
                    <label><span>工业角色</span><select aria-label={`${getPlanetDisplayName(game, planetId)}工业角色`} value={summary.role} onChange={(event) => onRoleChange(planetId, event.target.value as PlanetIndustryRole)}>{PLANET_ROLES.map((role) => <option value={role} key={role}>{PLANET_INDUSTRY_ROLE_LABELS[role]}{role === "auto" ? ` · ${PLANET_INDUSTRY_ROLE_LABELS[summary.detectedRole]}` : ""}</option>)}</select></label>
                    <div className="stellar-planet-metrics"><span><Zap size={11} />{Math.round(summary.powerFactor * 100)}%</span><span>宜 {PLANET_INDUSTRY_ROLE_LABELS[summary.recommendedRole]}</span><span>进 {summary.configuredImports}</span><span>出 {summary.configuredExports}</span><span>储 {compactNumber(summary.reserveRemaining)}</span></div>
                    {summary.issues.length > 0 ? <button className="stellar-problem-jump" type="button" onClick={() => summary.issues[0].entityId ? onFocusStation(summary.issues[0].entityId, planetId) : onTravel(planetId)}><LocateFixed size={12} />{summary.issues[0].label}</button> : <small className="stellar-depletion"><Timer size={11} />枯竭预测 {formatDepletion(summary.depletionSeconds)}</small>}
                  </div>
                );
              })}
            </div>
            <footer><span><Gauge size={12} />发电 <PowerValue valueKw={system.generationKw} /></span><span>负载 <PowerValue valueKw={system.demandKw} /></span><span>最近枯竭 {formatDepletion(system.soonestDepletionSeconds)}</span></footer>
          </article>
        ))}
      </section>

      <section className="interplanetary-diagnostics" aria-label="跨星物流诊断">
        <header><div><AlertTriangle size={15} /><span>跨星物流诊断</span><strong>{logisticsDiagnostics.length}</strong></div><small>按可处理优先级汇总远程物流塔、运输船、翘曲和电网问题</small></header>
        {logisticsDiagnostics.length === 0 ? <div className="interplanetary-diagnostics-empty"><Check size={16} /><span>当前没有需要处理的跨星物流问题</span></div> : <div>{logisticsDiagnostics.slice(0, 12).map((diagnostic) => {
          const focusSource = diagnostic.severity === "warning" && diagnostic.sourceStationId && diagnostic.sourcePlanetId;
          const focusId = focusSource ? diagnostic.sourceStationId! : diagnostic.targetStationId;
          const focusPlanet = focusSource ? diagnostic.sourcePlanetId! : diagnostic.targetPlanetId;
          return <article className={`interplanetary-diagnostic interplanetary-diagnostic--${diagnostic.severity}`} key={diagnostic.id}>
            <ItemHoverCard itemId={diagnostic.itemId}><ItemGlyph itemId={diagnostic.itemId} /></ItemHoverCard>
            <div><strong>{diagnostic.title.replace(diagnostic.itemId, getItem(diagnostic.itemId).name)}</strong><span>{diagnostic.detail.replace(diagnostic.itemId, getItem(diagnostic.itemId).name)}</span><small>{diagnostic.recommendation}</small></div>
            <button type="button" onClick={() => onFocusStation(focusId, focusPlanet)} title="定位相关物流站"><LocateFixed size={13} />定位</button>
          </article>;
        })}</div>}
      </section>

      <section className="stellar-route-console" aria-label="全局物流航线表">
        <header>
          <div><span>全星区调度</span><strong>全局航线表</strong></div>
          <label className="stellar-route-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索物品或行星" aria-label="搜索全局航线" /></label>
          <div className="stellar-route-filters" role="group" aria-label="航线筛选">
            <button type="button" className={routeFilter === "all" ? "active" : ""} onClick={() => setRouteFilter("all")}>全部</button>
            <button type="button" className={routeFilter === "remote" ? "active" : ""} onClick={() => setRouteFilter("remote")}>星际</button>
            <button type="button" className={routeFilter === "issues" ? "active" : ""} onClick={() => setRouteFilter("issues")}>问题 {blockedRoutes}</button>
          </div>
        </header>
        <div className="stellar-route-list">
          {visibleRoutes.map((route) => {
            const sourceSlot = route.sourceStationId != null && route.sourceSlotIndex != null
              ? getStellarStationSlot(game, route.sourceStationId, route.sourceSlotIndex)
              : null;
            const targetSlot = getStellarStationSlot(game, route.targetStationId, route.targetSlotIndex);
            const routePath = getRoutePathLabel(route, game);
            return (
              <article className={`stellar-route-row stellar-route-row--${route.status}`} key={route.id}>
                <div className="stellar-route-item"><ItemHoverCard itemId={route.itemId}><ItemGlyph itemId={route.itemId} /></ItemHoverCard><span><strong>{getItem(route.itemId).name}</strong><small>{route.scope === "remote" ? "星际运输" : "行星运输"} · {route.statusLabel}</small></span></div>
                <div className="stellar-route-endpoints"><button type="button" disabled={!route.sourceStationId || !route.sourcePlanetId} onClick={() => route.sourceStationId && route.sourcePlanetId && onFocusStation(route.sourceStationId, route.sourcePlanetId)}>{getRouteEndpointLabel(route.sourceStationId, game)}</button><ArrowRight size={14} /><button type="button" onClick={() => onFocusStation(route.targetStationId, route.targetPlanetId)}>{getRouteEndpointLabel(route.targetStationId, game)}</button></div>
                <div className="stellar-route-metrics"><span>航程 <strong>{getRouteDistanceLabel(route)}</strong></span><span>路径 <strong title={routePath}>{routePath}</strong></span><span>派遣 <strong>{route.dispatchDirection === "supply-delivery" ? "供应端送货" : route.dispatchDirection === "demand-pickup" ? "需求端取货" : "待定"}</strong></span><span>最长段 <strong>{route.maxLegDistanceLy > 0 ? `${route.maxLegDistanceLy.toFixed(1)} ly` : "-"}</strong></span><span>周期 <strong>{route.durationSeconds.toFixed(1)}s</strong></span><span>吞吐 <strong>{compactNumber(route.throughputPerMinute)}/min</strong></span><span>能耗 <strong>{route.energyMjPerTrip.toFixed(1)} MJ</strong></span><span>翘曲 <strong>{route.warpersPerTrip > 0 ? `${route.warpersPerTrip}/航次` : "无需"}</strong></span><span>策略 <strong>{{ direct: "直达", "relay-preferred": "优先中转", "relay-required": "强制中转" }[route.routePolicy]} · {route.warperBudget}</strong></span></div>
                <div className="stellar-route-policy">
                  <label><span>优先</span><select aria-label={`${getItem(route.itemId).name}航线优先级`} value={route.priority} onChange={(event) => onStationPriorityChange(route.targetStationId, route.targetSlotIndex, Number(event.target.value) as LogisticsPriority)}><option value={2}>高</option><option value={1}>中</option><option value={0}>低</option></select></label>
                  <label><span>装载</span><select aria-label={`${getItem(route.itemId).name}最低装载率`} value={route.minimumLoad} onChange={(event) => onStationMinimumLoadChange(route.targetStationId, route.targetSlotIndex, Number(event.target.value) as StationMinimumLoad)}><option value={0.1}>10%</option><option value={0.25}>25%</option><option value={0.5}>50%</option><option value={1}>100%</option></select></label>
                  <label><span>出口保底</span><input type="number" min={0} step={10} disabled={!sourceSlot || !route.sourceStationId || route.sourceSlotIndex == null} value={sourceSlot?.minStock ?? 0} aria-label={`${getItem(route.itemId).name}出口保底库存`} onChange={(event) => route.sourceStationId && route.sourceSlotIndex != null && sourceSlot && onStationLimitsChange(route.sourceStationId, route.sourceSlotIndex, Number(event.target.value), sourceSlot.maxStock)} /></label>
                  <label><span>进口上限</span><input type="number" min={0} step={10} value={targetSlot?.maxStock ?? 0} aria-label={`${getItem(route.itemId).name}进口库存上限`} onChange={(event) => targetSlot && onStationLimitsChange(route.targetStationId, route.targetSlotIndex, targetSlot.minStock, Number(event.target.value))} /></label>
                </div>
                <button className="stellar-route-locate" type="button" onClick={() => onFocusStation(route.targetStationId, route.targetPlanetId)} title="定位需求站" aria-label={`定位${getItem(route.itemId).name}需求站`}><LocateFixed size={14} /></button>
              </article>
            );
          })}
          {visibleRoutes.length === 0 ? <div className="stellar-route-empty"><Route size={22} /><strong>没有匹配的物流航线</strong><span>在物流站把槽位设为供应与需求后，航线会自动进入此表。</span></div> : null}
        </div>
      </section>
    </div>
  );
}

export function StarMapWorkspace({
  open,
  game,
  onClose,
  onExplore,
  onColonize,
  onTravel,
  onRoleChange,
  onPlanetMetadataChange,
  onSystemNameChange,
  onStationPriorityChange,
  onStationMinimumLoadChange,
  onStationLimitsChange,
  onFocusStation,
  onOpenSystemStation,
  onUpgradeAllStations,
  onAttachAllQuantumStations,
  mobile = false,
  mobileSubview,
  onMobileOpenDetail,
}: {
  open: boolean;
  game: GameState;
  onClose: () => void;
  onExplore: (systemId: StarSystemId) => void;
  onColonize: (planetId: PlanetId) => void;
  onTravel: (planetId: PlanetId) => void;
  onRoleChange: (planetId: PlanetId, role: PlanetIndustryRole) => void;
  onPlanetMetadataChange: (planetId: PlanetId, metadata: { customName: string; note: string; tags: string[] }) => void;
  onSystemNameChange: (systemId: StarSystemId, customName: string) => void;
  onStationPriorityChange: (entityId: string, slotIndex: number, priority: LogisticsPriority) => void;
  onStationMinimumLoadChange: (entityId: string, slotIndex: number, minimumLoad: StationMinimumLoad) => void;
  onStationLimitsChange: (entityId: string, slotIndex: number, minStock: number, maxStock: number) => void;
  onFocusStation: (entityId: string, planetId: PlanetId) => void;
  onOpenSystemStation: (systemId: StarSystemId) => void;
  onUpgradeAllStations: (systemId?: StarSystemId) => void;
  onAttachAllQuantumStations: (systemId?: StarSystemId) => void;
  mobile?: boolean;
  mobileSubview?: string | null;
  onMobileOpenDetail?: (subview: string) => void;
}) {
  const [view, setView] = useState<"map" | "industry">("map");
  const [mapQuery, setMapQuery] = useState("");
  const normalizedMapQuery = mapQuery.trim().toLocaleLowerCase("zh-CN");
  const visibleSystems = useMemo(() => STAR_SYSTEM_LIST.filter((system) => {
    if (!normalizedMapQuery) return true;
    const systemText = `${system.name} ${system.code} ${system.description} ${getStarSystemDisplayName(game, system.id)}`.toLocaleLowerCase("zh-CN");
    return systemText.includes(normalizedMapQuery) || system.planetIds.some((planetId) => getPlanetSearchText(game, planetId).includes(normalizedMapQuery));
  }), [game, normalizedMapQuery]);
  if (!open) return null;
  const activeSystemId = getPlanet(game.activePlanetId).systemId;
  const unlockedCount = STAR_SYSTEM_LIST.filter((system) => isStarSystemUnlocked(game, system.id)).length;
  const pendingUpgradeCount = game.entities.filter((entity) => entity.buildingId === "interstellar_logistics_station" && (entity.stationTier ?? 1) < 2).length;
  const pendingQuantumCount = game.entities.filter((entity) => entity.buildingId === "interstellar_logistics_station" && (entity.stationTier ?? 1) >= 2 && entity.quantumMode !== "quantum" && !entity.quantumTransition).length;

  if (mobile) {
    const detailSystemId = mobileSubview?.startsWith("system:") ? mobileSubview.slice(7) as StarSystemId : null;
    const detailPlanetId = mobileSubview?.startsWith("planet:") ? mobileSubview.slice(7) as PlanetId : null;
    const detailPlanet = detailPlanetId ? getPlanet(detailPlanetId) : null;
    const systemForPlanet = detailPlanet ? getStarSystem(detailPlanet.systemId) : null;
    const detailSystem = detailSystemId ? getStarSystem(detailSystemId) : systemForPlanet;
    const systemProfile = detailSystem ? getStarSystemProfile(game, detailSystem.id) : null;
    const planetProfile = detailPlanet ? getPlanetIndustrialProfile(game, detailPlanet.id) : null;
    const colonized = detailPlanet ? isPlanetColonized(game, detailPlanet.id) : false;
    const colonyRequirements = detailPlanet ? getColonizationRequirements(game, detailPlanet.id) : null;
    return <section className={`star-map-workspace mobile-workspace mobile-star-map${mobileSubview ? " mobile-workspace--detail" : ""}`} role="dialog" aria-modal="true" aria-label="星图">
      {!mobileSubview ? <><nav className="star-map-tabs mobile-workspace-sticky" role="tablist" aria-label="星图视图"><button type="button" role="tab" aria-selected={view === "map"} className={view === "map" ? "active" : ""} onClick={() => setView("map")}><Telescope size={14} />星图探索</button><button type="button" role="tab" aria-selected={view === "industry"} className={view === "industry" ? "active" : ""} onClick={() => setView("industry")}><Factory size={14} />星际工业</button></nav>{view === "industry" ? <div className="mobile-workspace-scroll"><IndustryConsole game={game} onTravel={onTravel} onRoleChange={onRoleChange} onStationPriorityChange={onStationPriorityChange} onStationMinimumLoadChange={onStationMinimumLoadChange} onStationLimitsChange={onStationLimitsChange} onFocusStation={onFocusStation} /></div> : <div className="mobile-workspace-scroll mobile-star-system-list"><header><span>已勘探 {unlockedCount}/{STAR_SYSTEM_LIST.length}</span><strong>星区种子 #{game.galaxy.seed}</strong></header><label className="star-map-search"><Search size={15} /><input value={mapQuery} onChange={(event) => setMapQuery(event.target.value)} placeholder="搜索名称、备注或标签" aria-label="搜索星球资料" />{mapQuery ? <button type="button" onClick={() => setMapQuery("")} aria-label="清除星图搜索"><X size={14} /></button> : null}</label><StellarMetadataManager game={game} compact onPlanetMetadataChange={onPlanetMetadataChange} onSystemNameChange={onSystemNameChange} />{visibleSystems.map((system) => {
        const profile = getStarSystemProfile(game, system.id);
        const unlocked = isStarSystemUnlocked(game, system.id);
        const mission = game.exploration.missions.find((candidate) => candidate.systemId === system.id);
        const stationCount = game.entities.filter((entity) => entity.buildingId === "interstellar_logistics_station" && getPlanet(entity.planetId).systemId === system.id && (entity.stationTier ?? 1) < 2).length;
        const quantumCount = game.entities.filter((entity) => entity.buildingId === "interstellar_logistics_station" && getPlanet(entity.planetId).systemId === system.id && (entity.stationTier ?? 1) >= 2 && entity.quantumMode !== "quantum" && !entity.quantumTransition).length;
        return <div className="mobile-star-system-list__row" key={system.id}><button type="button" onClick={() => onMobileOpenDetail?.(`system:${system.id}`)}><i style={{ color: system.color }}><Sparkles size={21} /></i><span><small>{system.code} · {profile.starTypeName}</small><strong>{getStarSystemDisplayName(game, system.id)}</strong><em>{system.planetIds.length} 颗行星 · {profile.luminosity.toFixed(2)} L☉ · {formatDistance(profile.distanceFromOriginLy)}</em></span><b>{unlocked ? mission ? "勘探中" : "已发现" : "未勘探"}</b><ArrowRight size={18} /></button>{stationCount > 0 ? <button className="mobile-star-system-list__upgrade" type="button" onClick={() => onUpgradeAllStations(system.id)}><Sparkles size={15} />升级本系物流站（{stationCount}）</button> : null}{quantumCount > 0 ? <button className="mobile-star-system-list__upgrade mobile-star-system-list__upgrade--quantum" type="button" onClick={() => onAttachAllQuantumStations(system.id)}><Sparkles size={15} />切换本系量子物流站（{quantumCount}）</button> : null}</div>;
      })}</div>}</> : detailPlanet && planetProfile && colonyRequirements ? <div className="mobile-workspace-scroll mobile-planet-detail">
        <header className="mobile-detail-heading"><i style={{ color: detailPlanet.color }}><Orbit size={22} /></i><span><small>{systemForPlanet ? getStarSystemDisplayName(game, systemForPlanet.id) : ""} · {detailPlanet.code}</small><strong>{getPlanetDisplayName(game, detailPlanet.id)}</strong></span><b>{colonized ? "已殖民" : "殖民候选"}</b></header>
        <StellarMetadataManager game={game} compact onPlanetMetadataChange={onPlanetMetadataChange} onSystemNameChange={onSystemNameChange} />
        <section className="mobile-planet-environment"><div><span>生态模板</span><strong>{planetProfile.climateName}</strong></div><div><span>海洋</span><strong>{OCEAN_LABELS[planetProfile.oceanType]}</strong></div><div><span>矿储倍率</span><strong>{Math.round(planetProfile.reserveScale * 100)}%</strong></div><div><span>采矿效率</span><strong>{Math.round(planetProfile.miningMultiplier * 100)}%</strong></div><div><span>风力</span><strong>{Math.round(planetProfile.windMultiplier * 100)}%</strong></div><div><span>太阳能</span><strong>{Math.round(getPlanetSolarPowerMultiplier(game, detailPlanet.id) * 100)}%</strong></div><div><span>地热</span><strong>{Math.round(planetProfile.geothermalMultiplier * 100)}%</strong></div><div><span>航程</span><strong>{Math.round(planetProfile.travelTimeMultiplier * 100)}%</strong></div></section>
        <section className="mobile-detail-section"><header>资源与工业定位</header><p>{detailPlanet.kind === "gas-giant" ? Object.keys(planetProfile.orbitalYields).map((id) => getItem(id as ItemId).name).join("、") : planetProfile.resourceIds.map((id) => getItem(id).name).join("、") || "无地表矿脉"}</p><div className="mobile-tech-unlocks"><span><Factory size={15} />{planetProfile.specializationName}</span><span><Gauge size={15} />推荐：{PLANET_INDUSTRY_ROLE_LABELS[getRecommendedPlanetRole(game, detailPlanet.id)]}</span>{planetProfile.tidalLocked ? <span><Timer size={15} />潮汐锁定</span> : null}</div></section>
        {!colonized ? <section className={`mobile-colony-requirements mobile-colony-requirements--${colonyRequirements.status}`}><header><strong>殖民前哨需求</strong><small>材料取自{getPlanetDisplayName(game, colonyRequirements.sourcePlanetId)}，运输载具取自随身载具栏</small></header><p>{colonyRequirements.reason}</p><div>{colonyRequirements.costs.map((cost) => <span className={cost.missing === 0 ? "ready" : "missing"} key={cost.itemId}><ItemGlyph itemId={cost.itemId} /><em>{getItem(cost.itemId).name}<small>{cost.source === "portable-fleet" ? "随身载具" : "当前行星托盘"}</small></em><strong>{cost.current.toLocaleString("zh-CN")}/{cost.required.toLocaleString("zh-CN")}</strong></span>)}</div></section> : null}
        <div className="mobile-detail-spacer" /><footer className="mobile-detail-actionbar"><button className="primary" type="button" disabled={!colonized && !canColonizePlanet(game, detailPlanet.id)} onClick={() => colonized ? onTravel(detailPlanet.id) : onColonize(detailPlanet.id)}>{colonized ? <Navigation size={18} /> : <Factory size={18} />}{colonized ? "进入行星工厂" : "建立殖民前哨"}</button></footer>
      </div> : detailSystem && systemProfile ? <div className="mobile-workspace-scroll mobile-star-system-detail">
        <header className="mobile-detail-heading"><i style={{ color: detailSystem.color }}><Sparkles size={22} /></i><span><small>{detailSystem.code} · {systemProfile.starTypeName}</small><strong>{getStarSystemDisplayName(game, detailSystem.id)}</strong></span><b>{systemProfile.luminosity.toFixed(2)} L☉</b></header><p className="mobile-detail-summary">{detailSystem.description}</p><div className="mobile-detail-system-actions"><button className="mobile-detail-system-station" type="button" onClick={() => onOpenSystemStation(detailSystem.id)}><Factory size={17} /><span><strong>空间站与太空电梯</strong><small>{spaceStationStatusLabel(getSpaceStationState(game, detailSystem.id).status)}</small></span><ChevronRight size={17} /></button>{game.entities.some((entity) => entity.buildingId === "interstellar_logistics_station" && getPlanet(entity.planetId).systemId === detailSystem.id && (entity.stationTier ?? 1) < 2) ? <button className="mobile-detail-system-upgrade" type="button" onClick={() => onUpgradeAllStations(detailSystem.id)}><Sparkles size={16} />一键升级本系物流站</button> : null}{game.entities.some((entity) => entity.buildingId === "interstellar_logistics_station" && getPlanet(entity.planetId).systemId === detailSystem.id && (entity.stationTier ?? 1) >= 2 && entity.quantumMode !== "quantum" && !entity.quantumTransition) ? <button className="mobile-detail-system-upgrade mobile-detail-system-upgrade--quantum" type="button" onClick={() => onAttachAllQuantumStations(detailSystem.id)}><Sparkles size={16} />一键切换本系量子物流站</button> : null}</div>
        <StellarMetadataManager game={game} compact onPlanetMetadataChange={onPlanetMetadataChange} onSystemNameChange={onSystemNameChange} />
        <section className="mobile-detail-section"><header>行星</header><div className="mobile-system-planets">{detailSystem.planetIds.map((planetId) => { const planet = getPlanet(planetId); const profile = getPlanetIndustrialProfile(game, planetId); const ready = isPlanetColonized(game, planetId); return <button type="button" key={planetId} onClick={() => onMobileOpenDetail?.(`planet:${planetId}`)}><i style={{ color: planet.color }}><Orbit size={20} /></i><span><strong>{getPlanetDisplayName(game, planetId)}</strong><small>{profile.climateName} · {OCEAN_LABELS[profile.oceanType]}</small></span><b>{ready ? "已殖民" : "查看需求"}</b><ArrowRight size={18} /></button>; })}</div></section>
        {!isStarSystemUnlocked(game, detailSystem.id) ? <section className="mobile-colony-requirements"><header><strong>恒星系勘探</strong><small>{formatDistance(systemProfile.distanceFromOriginLy)}</small></header><div>{detailSystem.explorationCost.map((cost) => <span className={(game.tray[cost.itemId] ?? 0) >= cost.amount ? "ready" : "missing"} key={cost.itemId}><ItemGlyph itemId={cost.itemId} /><em>{getItem(cost.itemId).name}</em><strong>{Math.floor(game.tray[cost.itemId] ?? 0)}/{cost.amount}</strong></span>)}</div><button type="button" disabled={!canExploreStarSystem(game, detailSystem.id)} onClick={() => onExplore(detailSystem.id)}><Telescope size={18} />开始勘探</button></section> : null}
      </div> : null}
    </section>;
  }

  return (
    <section className="star-map-workspace" role="dialog" aria-modal="true" aria-label="星图">
      <header className="star-map-header">
        <div className="star-map-title">
          <i><Telescope size={20} /></i>
          <div><span>恒星级导航阵列</span><strong>{view === "map" ? "星图与行星探索" : "星际工业调度"}</strong></div>
        </div>
        <div className="star-map-headline">
          <span>已勘探 <strong>{unlockedCount}/{STAR_SYSTEM_LIST.length}</strong></span>
          <span>当前坐标 <strong>{getStarSystemDisplayName(game, activeSystemId)}</strong></span>
          <span>最远航标 <strong>{Math.max(...STAR_SYSTEM_LIST.filter((system) => isStarSystemUnlocked(game, system.id)).map((system) => getStarSystemProfile(game, system.id).distanceFromOriginLy)).toFixed(1)} ly</strong></span>
          <span>星区种子 <strong>#{game.galaxy.seed}</strong></span>
        </div>
        <button className="star-map-close" type="button" onClick={onClose} title="关闭星图" aria-label="关闭星图"><X size={18} /></button>
      </header>

      <nav className="star-map-tabs" role="tablist" aria-label="星图视图">
        <button type="button" role="tab" aria-selected={view === "map"} className={view === "map" ? "active" : ""} onClick={() => setView("map")}><Telescope size={14} />星图探索</button>
        <button type="button" role="tab" aria-selected={view === "industry"} className={view === "industry" ? "active" : ""} onClick={() => setView("industry")}><Factory size={14} />星际工业</button>
      </nav>

      {view === "map" ? <div className="star-map-controls">
        <label className="star-map-search"><Search size={15} /><input value={mapQuery} onChange={(event) => setMapQuery(event.target.value)} placeholder="搜索名称、备注或标签" aria-label="搜索星球资料" />{mapQuery ? <button type="button" onClick={() => setMapQuery("")} aria-label="清除星图搜索"><X size={14} /></button> : null}</label>
        <span>{normalizedMapQuery ? `${visibleSystems.length} 个匹配星系` : "可按默认名、自定义名、备注或标签搜索"}</span>
        <button className="star-map-bulk-upgrade" type="button" disabled={pendingUpgradeCount === 0} onClick={() => onUpgradeAllStations()}><Sparkles size={15} />升级全部星际物流站{pendingUpgradeCount > 0 ? `（${pendingUpgradeCount}）` : ""}</button>
        <button className="star-map-bulk-upgrade star-map-bulk-upgrade--quantum" type="button" disabled={pendingQuantumCount === 0} onClick={() => onAttachAllQuantumStations()}><Sparkles size={15} />一键切换全部量子物流站{pendingQuantumCount > 0 ? `（${pendingQuantumCount}）` : ""}</button>
        <StellarMetadataManager game={game} onPlanetMetadataChange={onPlanetMetadataChange} onSystemNameChange={onSystemNameChange} />
      </div> : null}

      {view === "map" ? <div className="star-map-route" aria-label="恒星系航线">
        {visibleSystems.map((system, index) => {
          const systemProfile = getStarSystemProfile(game, system.id);
          const unlocked = isStarSystemUnlocked(game, system.id);
          const mission = game.exploration.missions.find((candidate) => candidate.systemId === system.id);
          const surveyProgress = game.exploration.surveyProgressBySystem[system.id] ?? (unlocked ? 1 : 0);
          const active = activeSystemId === system.id;
          const technologyReady = !system.requiredTechId || isTechnologyCompleted(game, system.requiredTechId);
          const prerequisiteReady = !system.prerequisiteSystemId || isStarSystemUnlocked(game, system.prerequisiteSystemId);
          const suppliesReady = system.explorationCost.every((cost) => (game.tray[cost.itemId] ?? 0) >= cost.amount);
          const style = { "--system-color": system.color } as CSSProperties;
          return (
            <div className="star-map-route__segment" key={system.id}>
              {index > 0 ? <div className={`star-route-link${unlocked ? " star-route-link--open" : ""}`}><i /><ArrowRight size={16} /><span>{formatDistance(systemProfile.distanceFromOriginLy)}</span></div> : null}
              <article className={`star-system-card${unlocked ? " star-system-card--unlocked" : " star-system-card--locked"}${active ? " star-system-card--active" : ""}`} style={style}>
                <header>
                  <i className="star-system-orb"><Sparkles size={20} /></i>
                  <div><span>{system.code}</span><strong>{getStarSystemDisplayName(game, system.id)}</strong><small>{systemProfile.starTypeName} · {systemProfile.luminosity.toFixed(2)} L☉ · {formatDistance(systemProfile.distanceFromOriginLy)}</small></div>
                  <em>{active ? <><Navigation size={12} /> 当前</> : unlocked ? <><Check size={12} /> 已发现{mission ? " · 勘探中" : ""}</> : <><LockKeyhole size={12} /> 未勘探</>}</em>
                </header>
                <div className="star-system-space-station-actions"><button className="star-system-space-station-open" type="button" onClick={() => onOpenSystemStation(system.id)}><Factory size={14} />空间站与太空电梯<ChevronRight size={14} /></button>{game.entities.some((entity) => entity.buildingId === "interstellar_logistics_station" && getPlanet(entity.planetId).systemId === system.id && (entity.stationTier ?? 1) < 2) ? <button className="star-system-space-station-upgrade" type="button" onClick={() => onUpgradeAllStations(system.id)}><Sparkles size={14} />一键升级本系物流站</button> : null}{game.entities.some((entity) => entity.buildingId === "interstellar_logistics_station" && getPlanet(entity.planetId).systemId === system.id && (entity.stationTier ?? 1) >= 2 && entity.quantumMode !== "quantum" && !entity.quantumTransition) ? <button className="star-system-space-station-upgrade star-system-space-station-upgrade--quantum" type="button" onClick={() => onAttachAllQuantumStations(system.id)}><Sparkles size={14} />一键切换本系量子物流站</button> : null}</div>
                <p>{system.description}</p>
                <div className="star-planet-list">
                  {system.planetIds.map((planetId) => {
                    const planet = getPlanet(planetId);
                    const profile = getPlanetIndustrialProfile(game, planet.id);
                    const recommendedRole = getRecommendedPlanetRole(game, planet.id);
                    const current = game.activePlanetId === planetId;
                    const deviceCount = game.entities.reduce((sum, entity) => entity.planetId === planetId
                      ? sum + entity.machineCount + entity.minerCount
                      : sum, 0);
                    const resources = planet.kind === "gas-giant"
                      ? Object.keys(profile.orbitalYields).map((itemId) => getItem(itemId as ItemId).name)
                      : profile.resourceIds.map((itemId) => getItem(itemId).name);
                    const colonized = isPlanetColonized(game, planet.id);
                    const colonyRequirements = getColonizationRequirements(game, planet.id);
                    return (
                      <button
                        type="button"
                        key={planet.id}
                         disabled={!unlocked || (!colonized && !canColonizePlanet(game, planet.id))}
                         className={`${current ? "active" : ""}${colonized ? "" : " planet-uncolonized"}${colonyRequirements.status === "ready" ? " planet-colony-ready" : ""}`}
                         onClick={() => colonized ? onTravel(planet.id) : onColonize(planet.id)}
                         title={colonized ? `进入${getPlanetDisplayName(game, planet.id)}` : colonyRequirements.reason}
                      >
                        <i style={{ color: planet.color }}><Orbit size={17} /></i>
                        <span><strong>{getPlanetDisplayName(game, planet.id)}</strong><small>{profile.climateName} · {OCEAN_LABELS[profile.oceanType]}{profile.tidalLocked ? " · 潮汐锁定" : ""}</small></span>
                         <em>{colonized ? planet.kind === "gas-giant" ? "轨道" : `${deviceCount} 设备` : "未殖民"}</em>
                         <p>{resources.join("、") || "无地表矿脉"}{profile.rareResourceIds.length > 0 ? ` · 稀有 ${profile.rareResourceIds.map((itemId) => getItem(itemId).name).join("、")}` : ""}</p>
                         <small className="star-planet-profile">{game.galaxy.planetMetadata?.[planet.id]?.note || `${profile.specializationName} · 宜 ${PLANET_INDUSTRY_ROLE_LABELS[recommendedRole]}`}{game.galaxy.planetMetadata?.[planet.id]?.tags?.length ? ` · #${game.galaxy.planetMetadata[planet.id]!.tags.join(" #")}` : ""}</small>
                         <span className="star-planet-traits" aria-label={`${getPlanetDisplayName(game, planet.id)}工业环境`}>
                           <b title={planet.kind === "gas-giant" ? "轨道采集产率" : "有限矿脉总储量"}>{planet.kind === "gas-giant" ? "轨采" : "矿储"} <strong>{Math.round((planet.kind === "gas-giant" ? profile.orbitalYieldMultiplier : profile.reserveScale) * 100)}%</strong></b>
                           <b title="风力发电倍率">风 <strong>{Math.round(profile.windMultiplier * 100)}%</strong></b>
                           <b title={`太阳能综合倍率：行星 ${profile.solarMultiplier.toFixed(2)} × 恒星 ${systemProfile.luminosity.toFixed(2)}${profile.tidalLocked ? " × 潮汐锁定 1.25" : ""}`}>光 <strong>{Math.round(getPlanetSolarPowerMultiplier(game, planet.id) * 100)}%</strong></b>
                           <b title="地热发电倍率">地热 <strong>{Math.round(profile.geothermalMultiplier * 100)}%</strong></b>
                           <b title="跨行星航程时间倍率">航程 <strong>{Math.round(profile.travelTimeMultiplier * 100)}%</strong></b>
                         </span>
                         {!colonized ? <div className={`planet-colony-requirements planet-colony-requirements--${colonyRequirements.status}`}>
                           <header><strong>殖民前哨需求</strong><small>材料取自“{getPlanetDisplayName(game, colonyRequirements.sourcePlanetId)}”物资托盘；运输载具取自随身载具栏</small></header>
                           <p>{colonyRequirements.reason}</p>
                           {colonyRequirements.costs.length > 0 ? <div>{colonyRequirements.costs.map((cost) => <span className={cost.missing === 0 ? "ready" : "missing"} key={cost.itemId}>
                             <ItemHoverCard itemId={cost.itemId}><ItemGlyph itemId={cost.itemId} /></ItemHoverCard><b>{getItem(cost.itemId).name}<small>{cost.source === "portable-fleet" ? "随身载具" : "当前行星托盘"}</small></b><strong>{cost.current.toLocaleString("zh-CN")}/{cost.required.toLocaleString("zh-CN")}</strong>
                           </span>)}</div> : null}
                         </div> : null}
                      </button>
                    );
                  })}
                </div>
                 {!unlocked ? (
                  <footer className="star-exploration">
                    <div className="star-exploration-requirements">
                      {system.requiredTechId ? (
                        <span className={technologyReady ? "ready" : ""}>
                          {technologyReady ? <Check size={12} /> : <LockKeyhole size={12} />}{getTechnology(system.requiredTechId)?.name}
                        </span>
                      ) : null}
                      {system.prerequisiteSystemId ? (
                        <span className={prerequisiteReady ? "ready" : ""}>
                          {prerequisiteReady ? <Check size={12} /> : <LockKeyhole size={12} />}先勘探{getStarSystemDisplayName(game, system.prerequisiteSystemId)}
                        </span>
                      ) : null}
                    </div>
                    <div className="star-exploration-costs">
                      {system.explorationCost.map((cost) => {
                        const stock = Math.floor(game.tray[cost.itemId] ?? 0);
                        return (
                          <span className={stock >= cost.amount ? "ready" : ""} key={cost.itemId}>
                            <ItemHoverCard itemId={cost.itemId}><ItemGlyph itemId={cost.itemId} /></ItemHoverCard>
                            <b>{stock}/{cost.amount}</b>
                          </span>
                        );
                      })}
                    </div>
                        {mission ? <div className="star-survey-progress" role="progressbar" aria-label={`${getStarSystemDisplayName(game, system.id)}勘探进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(surveyProgress * 100)}><i><b style={{ width: `${surveyProgress * 100}%` }} /></i><span>勘探中 {Math.round(surveyProgress * 100)}%</span></div> : <button type="button" disabled={!canExploreStarSystem(game, system.id)} onClick={() => onExplore(system.id)} title={`消耗当前行星托盘补给勘探${getStarSystemDisplayName(game, system.id)}`}>
                       <Telescope size={15} />开始勘探{getStarSystemDisplayName(game, system.id)}
                     </button>}
                    {!technologyReady ? <small>需要完成{getTechnology(system.requiredTechId)?.name}</small>
                      : !prerequisiteReady ? <small>尚未建立前置航标</small>
                        : !suppliesReady ? <small>当前行星托盘补给不足</small>
                          : null}
                  </footer>
                 ) : mission ? (
                   <footer className="star-system-ready star-system-surveying"><Telescope size={13} /><div><span>永久航标在线 · 深度勘探 {Math.round(surveyProgress * 100)}%</span><i><b style={{ width: `${surveyProgress * 100}%` }} /></i></div></footer>
                 ) : (
                   <footer className="star-system-ready"><Check size={13} /><span>永久航标在线 · 未殖民行星需建立前哨</span></footer>
                )}
              </article>
            </div>
          );
        })}
      </div> : <IndustryConsole game={game} onTravel={onTravel} onRoleChange={onRoleChange} onStationPriorityChange={onStationPriorityChange} onStationMinimumLoadChange={onStationMinimumLoadChange} onStationLimitsChange={onStationLimitsChange} onFocusStation={onFocusStation} />}
    </section>
  );
}
