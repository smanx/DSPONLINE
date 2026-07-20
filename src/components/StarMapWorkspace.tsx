import { AlertTriangle, ArrowRight, Check, Factory, Gauge, LocateFixed, LockKeyhole, Navigation, Orbit, Route, Search, Sparkles, Telescope, Timer, Zap, X } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import { STAR_SYSTEM_LIST, getItem, getPlanet, getStarSystem, getTechnology } from "../game/content";
import { canColonizePlanet, canExploreStarSystem, getStationSlots, isPlanetColonized, isStarSystemUnlocked, isTechnologyCompleted } from "../game/engine";
import { getPlanetIndustrialProfile, PLANET_INDUSTRY_ROLE_LABELS } from "../game/galaxy";
import { getPlanetIndustrySummaries, getRouteDistanceLabel, getRouteEndpointLabel, getStarSystemIndustrySummaries, getStellarRouteSnapshots } from "../game/stellarIndustry";
import type { GameState, LogisticsPriority, PlanetId, PlanetIndustryRole, StarSystemId, StationMinimumLoad } from "../game/types";
import { ItemGlyph, ItemHoverCard } from "./ItemReference";

function formatDistance(distanceLy: number): string {
  return distanceLy <= 0 ? "本地" : `${distanceLy.toFixed(1)} 光年`;
}

function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return "--";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return Math.round(value).toString();
}

function formatDepletion(seconds: number | null): string {
  if (seconds == null) return "稳定";
  if (seconds < 60) return "<1 分钟";
  if (seconds < 3_600) return `${Math.ceil(seconds / 60)} 分钟`;
  if (seconds < 86_400) return `${(seconds / 3_600).toFixed(1)} 小时`;
  return `${(seconds / 86_400).toFixed(1)} 天`;
}

const PLANET_ROLES = Object.keys(PLANET_INDUSTRY_ROLE_LABELS) as PlanetIndustryRole[];

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
              <span>{getStarSystem(system.systemId).starType}</span>
              <strong>{getStarSystem(system.systemId).name}</strong>
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
                    <button type="button" disabled={!colonized} onClick={() => onTravel(planetId)} title={colonized ? `进入${planet.name}` : `${planet.name}尚未殖民`}>
                      <i style={{ color: planet.color }}><Orbit size={15} /></i>
                      <span><strong>{planet.name}</strong><small>{summary.tags.length > 0 ? summary.tags.join(" · ") : planet.environment}</small></span>
                    </button>
                    <label><span>工业角色</span><select aria-label={`${planet.name}工业角色`} value={summary.role} onChange={(event) => onRoleChange(planetId, event.target.value as PlanetIndustryRole)}>{PLANET_ROLES.map((role) => <option value={role} key={role}>{PLANET_INDUSTRY_ROLE_LABELS[role]}{role === "auto" ? ` · ${PLANET_INDUSTRY_ROLE_LABELS[summary.detectedRole]}` : ""}</option>)}</select></label>
                    <div className="stellar-planet-metrics"><span><Zap size={11} />{Math.round(summary.powerFactor * 100)}%</span><span>进 {summary.configuredImports}</span><span>出 {summary.configuredExports}</span><span>储 {compactNumber(summary.reserveRemaining)}</span></div>
                    {summary.issues.length > 0 ? <button className="stellar-problem-jump" type="button" onClick={() => summary.issues[0].entityId ? onFocusStation(summary.issues[0].entityId, planetId) : onTravel(planetId)}><LocateFixed size={12} />{summary.issues[0].label}</button> : <small className="stellar-depletion"><Timer size={11} />枯竭预测 {formatDepletion(summary.depletionSeconds)}</small>}
                  </div>
                );
              })}
            </div>
            <footer><span><Gauge size={12} />发电 {compactNumber(system.generationKw)} kW</span><span>负载 {compactNumber(system.demandKw)} kW</span><span>最近枯竭 {formatDepletion(system.soonestDepletionSeconds)}</span></footer>
          </article>
        ))}
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
            return (
              <article className={`stellar-route-row stellar-route-row--${route.status}`} key={route.id}>
                <div className="stellar-route-item"><ItemHoverCard itemId={route.itemId}><ItemGlyph itemId={route.itemId} /></ItemHoverCard><span><strong>{getItem(route.itemId).name}</strong><small>{route.scope === "remote" ? "星际运输" : "行星运输"} · {route.statusLabel}</small></span></div>
                <div className="stellar-route-endpoints"><button type="button" disabled={!route.sourceStationId || !route.sourcePlanetId} onClick={() => route.sourceStationId && route.sourcePlanetId && onFocusStation(route.sourceStationId, route.sourcePlanetId)}>{getRouteEndpointLabel(route.sourceStationId, game)}</button><ArrowRight size={14} /><button type="button" onClick={() => onFocusStation(route.targetStationId, route.targetPlanetId)}>{getRouteEndpointLabel(route.targetStationId, game)}</button></div>
                <div className="stellar-route-metrics"><span>航程 <strong>{getRouteDistanceLabel(route)}</strong></span><span>周期 <strong>{route.durationSeconds.toFixed(1)}s</strong></span><span>吞吐 <strong>{compactNumber(route.throughputPerMinute)}/min</strong></span><span>能耗 <strong>{route.energyMjPerTrip.toFixed(1)} MJ</strong></span><span>翘曲 <strong>{route.warpersPerTrip > 0 ? `${route.warpersPerTrip}/航次` : "无需"}</strong></span></div>
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
  onStationPriorityChange,
  onStationMinimumLoadChange,
  onStationLimitsChange,
  onFocusStation,
}: {
  open: boolean;
  game: GameState;
  onClose: () => void;
  onExplore: (systemId: StarSystemId) => void;
  onColonize: (planetId: PlanetId) => void;
  onTravel: (planetId: PlanetId) => void;
  onRoleChange: (planetId: PlanetId, role: PlanetIndustryRole) => void;
  onStationPriorityChange: (entityId: string, slotIndex: number, priority: LogisticsPriority) => void;
  onStationMinimumLoadChange: (entityId: string, slotIndex: number, minimumLoad: StationMinimumLoad) => void;
  onStationLimitsChange: (entityId: string, slotIndex: number, minStock: number, maxStock: number) => void;
  onFocusStation: (entityId: string, planetId: PlanetId) => void;
}) {
  const [view, setView] = useState<"map" | "industry">("map");
  if (!open) return null;
  const activeSystemId = getPlanet(game.activePlanetId).systemId;
  const unlockedCount = STAR_SYSTEM_LIST.filter((system) => isStarSystemUnlocked(game, system.id)).length;

  return (
    <section className="star-map-workspace" role="dialog" aria-modal="true" aria-label="星图">
      <header className="star-map-header">
        <div className="star-map-title">
          <i><Telescope size={20} /></i>
          <div><span>恒星级导航阵列</span><strong>{view === "map" ? "星图与行星探索" : "星际工业调度"}</strong></div>
        </div>
        <div className="star-map-headline">
          <span>已勘探 <strong>{unlockedCount}/{STAR_SYSTEM_LIST.length}</strong></span>
          <span>当前坐标 <strong>{getStarSystem(activeSystemId).name}</strong></span>
          <span>最远航标 <strong>{Math.max(...STAR_SYSTEM_LIST.filter((system) => isStarSystemUnlocked(game, system.id)).map((system) => system.distanceLy)).toFixed(1)} ly</strong></span>
          <span>星区种子 <strong>#{game.galaxy.seed}</strong></span>
        </div>
        <button className="star-map-close" type="button" onClick={onClose} title="关闭星图" aria-label="关闭星图"><X size={18} /></button>
      </header>

      <nav className="star-map-tabs" role="tablist" aria-label="星图视图">
        <button type="button" role="tab" aria-selected={view === "map"} className={view === "map" ? "active" : ""} onClick={() => setView("map")}><Telescope size={14} />星图探索</button>
        <button type="button" role="tab" aria-selected={view === "industry"} className={view === "industry" ? "active" : ""} onClick={() => setView("industry")}><Factory size={14} />星际工业</button>
      </nav>

      {view === "map" ? <div className="star-map-route" aria-label="恒星系航线">
        {STAR_SYSTEM_LIST.map((system, index) => {
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
              {index > 0 ? <div className={`star-route-link${unlocked ? " star-route-link--open" : ""}`}><i /><ArrowRight size={16} /><span>{formatDistance(system.distanceLy)}</span></div> : null}
              <article className={`star-system-card${unlocked ? " star-system-card--unlocked" : " star-system-card--locked"}${active ? " star-system-card--active" : ""}`} style={style}>
                <header>
                  <i className="star-system-orb"><Sparkles size={20} /></i>
                  <div><span>{system.code}</span><strong>{system.name}</strong><small>{system.starType} · {formatDistance(system.distanceLy)}</small></div>
                  <em>{active ? <><Navigation size={12} /> 当前</> : unlocked ? <><Check size={12} /> 已发现{mission ? " · 勘探中" : ""}</> : <><LockKeyhole size={12} /> 未勘探</>}</em>
                </header>
                <p>{system.description}</p>
                <div className="star-planet-list">
                  {system.planetIds.map((planetId) => {
                    const planet = getPlanet(planetId);
                    const current = game.activePlanetId === planetId;
                    const deviceCount = game.entities.reduce((sum, entity) => entity.planetId === planetId
                      ? sum + entity.machineCount + entity.minerCount
                      : sum, 0);
                    return (
                      <button
                        type="button"
                        key={planet.id}
                         disabled={!unlocked || (!isPlanetColonized(game, planet.id) && !canColonizePlanet(game, planet.id))}
                         className={`${current ? "active" : ""}${isPlanetColonized(game, planet.id) ? "" : " planet-uncolonized"}`}
                         onClick={() => isPlanetColonized(game, planet.id) ? onTravel(planet.id) : onColonize(planet.id)}
                         title={!unlocked ? `${system.name}尚未勘探` : isPlanetColonized(game, planet.id) ? `进入${planet.name}` : `殖民${planet.name}`}
                      >
                        <i style={{ color: planet.color }}><Orbit size={17} /></i>
                        <span><strong>{planet.name}</strong><small>{planet.environment}</small></span>
                         <em>{isPlanetColonized(game, planet.id) ? planet.kind === "gas-giant" ? "轨道" : `${deviceCount} 设备` : "未殖民"}</em>
                         <p>{planet.resources}</p>
                         <small className="star-planet-profile">{getPlanetIndustrialProfile(game, planet.id).specializationName} · 风 {Math.round(getPlanetIndustrialProfile(game, planet.id).windMultiplier * 100)}%</small>
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
                          {prerequisiteReady ? <Check size={12} /> : <LockKeyhole size={12} />}先勘探{getStarSystem(system.prerequisiteSystemId).name}
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
                     {mission ? <div className="star-survey-progress" role="progressbar" aria-label={`${system.name}勘探进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(surveyProgress * 100)}><i><b style={{ width: `${surveyProgress * 100}%` }} /></i><span>勘探中 {Math.round(surveyProgress * 100)}%</span></div> : <button type="button" disabled={!canExploreStarSystem(game, system.id)} onClick={() => onExplore(system.id)} title={`消耗当前行星托盘补给勘探${system.name}`}>
                       <Telescope size={15} />开始勘探{system.name}
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
