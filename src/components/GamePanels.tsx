import {
  Atom,
  ArrowUp,
  BarChart3,
  BatteryCharging,
  BatteryFull,
  BookOpen,
  Box,
  Check,
  Command,
  ChevronLeft,
  ChevronRight,
  CircuitBoard,
  ClipboardCopy,
  ClipboardPaste,
  Database,
  Droplets,
  Factory,
  Flame,
  Flag,
  FlaskConical,
  Gauge,
  Hammer,
  GitFork,
  Globe2,
  House,
  History,
  Layers3,
  LayoutGrid,
  ListChecks,
  ListPlus,
  MoreHorizontal,
  Minus,
  Orbit,
  PackageOpen,
  PanelRight,
  Pause,
  Pickaxe,
  Play,
  Plus,
  Power,
  RadioTower,
  Route,
  Rows3,
  Rocket,
  Satellite,
  Search,
  Settings,
  Sparkles,
  Sun,
  Telescope,
  ThermometerSun,
  LockKeyhole,
  Trash2,
  Wind,
  Wrench,
  Zap,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useHorizontalPan } from "../hooks/useHorizontalPan";
import { ItemGlyph, ItemHoverCard } from "./ItemReference";
import { ItemCatalogPicker, RecipeCatalogPicker } from "./CatalogPicker";
import { getCampaignSnapshot, getCampaignTaskDeficits } from "../game/campaign";
import { CONSTRUCTION, FUEL_ENERGY_MJ, ITEMS, PLANET_LIST, RECIPES, getBeltConstructionId, getBeltTier, getBuilding, getBuildingUpgradeTarget, getConstructionDefinition, getExtractorBuildingId, getFuelItemIdsForBuilding, getItem, getPlanet, getProliferator, getRecipe, getRecipesForBuilding, getSorterConstructionId, getTechnology, isConveyorBeltId } from "../game/content";
import { PORTABLE_FLEET_ITEM_IDS, POWER_GRID_IDS, POWER_GRID_LABELS, canCraftConstruction, canHandcraftRecipe, canInstallSprayCoater, canPlaceBuildingOnPlanet, canQueueHandcraftRecipe, canSetBeltStackSize, canUpgradeBelt, canUpgradeEntity, canUpgradeSorter, findInterstellarPeer, findPlanetaryPeer, getBeltCapacity, getBeltNetworkIds, getConstructionCraftDeficits, getDysonEngineeringSnapshot, getDysonShellCapacity, getEntityExtraProductBonus, getEntityOperatingStatus, getEntityPowerFactor, getEntityProliferatorPowerMultiplier, getEntityProliferatorSpeedMultiplier, getInterstellarCargoCapacity, getInterstellarTripSeconds, getMiningSpeedMultiplier, getPlanetaryCargoCapacity, getPlanetaryTripSeconds, getPlanetMetrics, getPowerGridMetrics, getProliferatorSprayCost, getRayReceiverCapacityKw, getSorterCapacity, getStationDroneCapacity, getStationMinimumCargo, getStationSlots, getStationVesselCapacity, getStationWarperCapacity, isEntityInPowerCoverage, isHandcraftableRecipe, isPortableFleetItem, isProliferatorEligible, isTechnologyCompleted, stationRouteRequiresWarp } from "../game/engine";
import { getPlanetIndustrialProfile } from "../game/galaxy";
import { analyzeBeltNetwork } from "../game/network";
import type {
  BeltRouteMode,
  BeltTier,
  BeltConnection,
  BuildingId,
  CargoStackSize,
  CargoStack,
  ConstructionId,
  ConveyorBeltId,
  DraggedItemSourceKind,
  EnergyMode,
  FactoryEntity,
  GameState,
  ItemId,
  PlacementCount,
  PlanetId,
  PortableFleetItemId,
  ProliferatorMode,
  ProliferatorTier,
  RecipeId,
  SorterTier,
  StationLogisticsMode,
  StationLogisticsScope,
  StationMinimumLoad,
  PowerGridId,
  PowerPriority,
} from "../game/types";

function formatAmount(value: number): string {
  return Math.floor(value).toLocaleString("zh-CN");
}

function ItemMark({ itemId }: { itemId: ItemId }) {
  return <ItemHoverCard itemId={itemId}><ItemGlyph itemId={itemId} className="item-mark" /></ItemHoverCard>;
}

interface ResourceRailProps {
  game: GameState;
  onOpenCampaign: () => void;
  onOpenDysonPlanner: () => void;
  onPickTray: (itemId: ItemId) => void;
  onDropCargo: () => void;
  onDropDraggedItem: (itemId: ItemId, sourceKind: DraggedItemSourceKind, sourceId?: string) => void;
}

export function ResourceRail({ game, onOpenCampaign, onOpenDysonPlanner, onPickTray, onDropCargo, onDropDraggedItem }: ResourceRailProps) {
  const [dragOver, setDragOver] = useState(false);
  const trayItems = (Object.entries(game.tray) as Array<[ItemId, number]>)
    .filter(([, amount]) => amount > 0.001)
    .sort((a, b) => b[1] - a[1]);
  const campaign = getCampaignSnapshot(game);
  const activeTask = campaign.activeTask;
  const activeDeficits = activeTask ? getCampaignTaskDeficits(game, activeTask) : [];
  const dysonGenerationKw = game.dysonSwarm.generationKw + game.dysonSphere.generationKw;
  const swarmLoad = dysonGenerationKw > 0
    ? Math.min(100, game.dysonSwarm.receiverLoadKw / dysonGenerationKw * 100)
    : 0;
  const shellCapacity = getDysonShellCapacity(game);
  const dysonEngineering = getDysonEngineeringSnapshot(game, getPlanet(game.activePlanetId).systemId);
  const cargoIsPortableFleet = Boolean(game.cargo && isPortableFleetItem(game.cargo.itemId));

  return (
    <aside
      className={`resource-rail${dragOver ? " resource-rail--drop-ready" : ""}`}
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes("application/factory-item")) return;
        event.preventDefault();
        setDragOver(true);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("application/factory-item")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) setDragOver(false);
      }}
      onDrop={(event) => {
        const itemId = event.dataTransfer.getData("application/factory-item") as ItemId;
        if (!itemId) return;
        event.preventDefault();
        setDragOver(false);
        const sourceKind = event.dataTransfer.getData("application/factory-source-kind") as DraggedItemSourceKind;
        const sourceId = event.dataTransfer.getData("application/factory-source-id") || undefined;
        onDropDraggedItem(itemId, sourceKind, sourceId);
      }}
    >
      <section className="rail-block cargo-block">
        <div className="rail-heading">
          <span>{cargoIsPortableFleet ? "随身载具载荷" : game.cargo ? "手提星际载荷" : "光标载荷"}</span>
          <strong>{game.cargo ? "1 / 1" : "0 / 1"}</strong>
        </div>
        <button
          className={`cargo-slot${game.cargo ? " cargo-slot--loaded" : ""}`}
          type="button"
          aria-disabled={!game.cargo}
          onClick={onDropCargo}
          onDragOver={(event) => { if (event.dataTransfer.types.includes("application/factory-item")) event.preventDefault(); }}
          title={game.cargo ? cargoIsPortableFleet ? "放入底部随身载具栏" : "放入物资托盘" : "光标当前未携带物资"}
        >
          {game.cargo ? (
            <>
              <ItemMark itemId={game.cargo.itemId} />
              <span>{ITEMS[game.cargo.itemId].name}</span>
              <strong>×{formatAmount(game.cargo.amount)}</strong>
              <ChevronRight size={14} />
            </>
          ) : <><PackageOpen size={18} /><span>空载</span></>}
        </button>
      </section>

      <section className="rail-block dyson-block">
        <div className="rail-heading">
          <span>戴森系统</span>
          <strong>{game.dysonSphere.structurePoints > 0 ? "永久结构运行" : game.dysonSwarm.sailsInOrbit > 0 ? "戴森云运行" : "尚未建立"}</strong>
        </div>
        <div className="dyson-orbit-readout">
          <i><Sun size={18} /></i>
          <span><small>在轨太阳帆</small><strong>{formatAmount(game.dysonSwarm.sailsInOrbit)}</strong></span>
          <Orbit size={20} />
        </div>
        <div className="dyson-sphere-readout">
          <span><Rocket size={14} /><small>永久结构</small><strong>{formatAmount(game.dysonSphere.structurePoints)} 点</strong></span>
          <span><Orbit size={14} /><small>壳面太阳帆</small><strong>{formatAmount(game.dysonSphere.shellSails)} / {formatAmount(shellCapacity)}</strong></span>
        </div>
        <div className="dyson-load" role="progressbar" aria-label="戴森系统接收负载" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(swarmLoad)}>
          <i><b style={{ width: `${swarmLoad}%` }} /></i>
          <span>{(dysonGenerationKw / 1000).toFixed(2)} MW 总功率</span>
          <strong>{(game.dysonSwarm.receiverLoadKw / 1000).toFixed(2)} MW 接收</strong>
        </div>
        <div className="dyson-counts">
          <span>累计发射 <strong>{formatAmount(game.dysonSwarm.totalLaunched)}</strong></span>
          <span>已衰减 <strong>{formatAmount(game.dysonSwarm.totalExpired)}</strong></span>
        </div>
        <div className="dyson-counts">
          <span>运载火箭 <strong>{formatAmount(game.dysonSphere.totalRocketsLaunched)}</strong></span>
          <span>永久吸附 <strong>{formatAmount(game.dysonSphere.totalSailsAbsorbed)}</strong></span>
        </div>
        <div className="dyson-engineering-readout">
          <span><RadioTower size={11} />{dysonEngineering.launchEnabled ? { balanced: "均衡调度", swarm: "太阳帆优先", sphere: "火箭优先" }[dysonEngineering.launchMode] : "发射暂停"}<strong>{Math.round(dysonEngineering.launchThrottle * 100)}%</strong></span>
          <span><Gauge size={11} />射线效率<strong>{Math.round(dysonEngineering.rayEfficiency * 100)}%</strong></span>
          <span><Atom size={11} />反物质回馈<strong>{(dysonEngineering.feedbackGenerationKw / 1000).toFixed(2)} MW</strong></span>
        </div>
        <button className="dyson-planner-command" type="button" onClick={onOpenDysonPlanner} title="打开戴森球规划"><Orbit size={14} />戴森球规划</button>
      </section>

      <section className="rail-block tray-block">
        <div className="rail-heading">
          <span>{getPlanet(game.activePlanetId).code}物资托盘</span>
          <strong>{trayItems.length}</strong>
        </div>
        <div className="tray-list">
          {trayItems.length === 0 ? (
            <div className="tray-empty"><Box size={18} /><span>暂无库存</span></div>
          ) : trayItems.map(([itemId, amount]) => (
            <button
              className="tray-row"
              type="button"
              key={itemId}
              draggable={!game.cargo || game.cargo.itemId === itemId}
              onClick={() => onPickTray(itemId)}
              onDragStart={(event) => {
                event.dataTransfer.setData("application/factory-item", itemId);
                event.dataTransfer.setData("application/factory-source-kind", "tray");
                event.dataTransfer.effectAllowed = "move";
              }}
              title={`拿取${ITEMS[itemId].name}`}
            >
              <ItemMark itemId={itemId} />
              <span>{ITEMS[itemId].name}</span>
              <strong>{formatAmount(amount)}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="rail-block campaign-summary-block">
        <div className="rail-heading">
          <span>当前任务</span>
          <button type="button" className="rail-heading-command" onClick={onOpenCampaign} title="打开主线任务中心" aria-label="打开主线任务中心"><ListChecks size={14} /></button>
          <strong>{campaign.completedCount}/{campaign.totalCount}</strong>
        </div>
        {activeTask ? (
          <button className="campaign-summary-command" type="button" onClick={onOpenCampaign} title="打开主线任务中心">
            <i><Flag size={15} /></i>
            <span><strong>{activeTask.title}</strong><small>{activeTask.progress.current} / {activeTask.progress.target} · {activeTask.description}</small></span>
            <ChevronRight size={15} />
          </button>
        ) : <div className="campaign-summary-complete"><Check size={14} />全部任务已完成</div>}
        {activeTask && activeDeficits.length > 0 ? (
          <div className="campaign-summary-deficits"><span>缺料</span>{activeDeficits.slice(0, 3).map((deficit) => <span key={deficit.itemId}>{ITEMS[deficit.itemId].name} ×{formatAmount(deficit.amount)}</span>)}</div>
        ) : null}
      </section>
    </aside>
  );
}

export function PlanetNavigator({ game, onPlanetChange }: { game: GameState; onPlanetChange: (planetId: PlanetId) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const activeSystemId = getPlanet(game.activePlanetId).systemId;
  const visiblePlanets = PLANET_LIST.filter((planet) => planet.systemId === activeSystemId &&
    game.exploration.unlockedSystemIds.includes(planet.systemId));
  return (
    <nav className={`planet-navigator nodrag nopan${collapsed ? " planet-navigator--collapsed" : ""}`} aria-label="行星切换">
      {!collapsed ? visiblePlanets.map((planet) => {
        const active = game.activePlanetId === planet.id;
        const metrics = getPlanetMetrics(game, planet.id);
        const deviceCount = game.entities.reduce((sum, entity) =>
          entity.planetId === planet.id ? sum + entity.machineCount + entity.minerCount : sum, 0);
        return (
          <button type="button" className={active ? "active" : ""} aria-pressed={active} key={planet.id} onClick={() => onPlanetChange(planet.id)} title={`切换到${planet.name}`}>
            <i style={{ color: planet.color }}><Orbit size={15} /></i>
            <span><strong>{planet.name}</strong><small>{planet.code} · {planet.environment}</small></span>
            <em>{deviceCount}</em>
            <b className={metrics.powerFactor < 0.999 ? "warning" : ""}>{Math.round(metrics.powerFactor * 100)}%</b>
          </button>
        );
      }) : null}
      <button className="planet-navigator__toggle" type="button" onClick={() => setCollapsed((current) => !current)} title={collapsed ? "展开行星切换" : "折叠行星切换"} aria-label={collapsed ? "展开行星切换" : "折叠行星切换"} aria-expanded={!collapsed}>
        {collapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>
    </nav>
  );
}

type InspectorTab = "inspect" | "fabricate";

interface InspectorPanelProps {
  game: GameState;
  selectedEntities: FactoryEntity[];
  selectedEntity: FactoryEntity | null;
  selectedBelt: BeltConnection | null;
  tab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  onRecipeChange: (entityId: string, recipeId: RecipeId) => void;
  onLogisticsItemChange: (entityId: string, itemId: ItemId) => void;
  onFuelChange: (entityId: string, itemId: ItemId) => void;
  onEnergyModeChange: (entityId: string, mode: EnergyMode) => void;
  onPowerGridChange: (entityId: string, gridId: PowerGridId) => void;
  onPowerPriorityChange: (entityId: string, priority: PowerPriority) => void;
  onGenerationPriorityChange: (entityId: string, priority: PowerPriority) => void;
  onStationModeChange: (entityId: string, mode: "supply" | "demand") => void;
  onStationVesselAdjust: (entityId: string, delta: number) => void;
  onStationDroneAdjust: (entityId: string, delta: number) => void;
  onStationWarperAdjust: (entityId: string, delta: number) => void;
  onStationWarpEnabled: (entityId: string, enabled: boolean) => void;
  onStationMinimumLoadChange: (entityId: string, minimumLoad: StationMinimumLoad) => void;
  onStationSlotItemChange: (entityId: string, slotIndex: number, itemId: ItemId | null) => void;
  onStationSlotModeChange: (entityId: string, slotIndex: number, scope: StationLogisticsScope, mode: StationLogisticsMode) => void;
  onStationSlotMinimumLoadChange: (entityId: string, slotIndex: number, minimumLoad: StationMinimumLoad) => void;
  onStationSlotLimitsChange: (entityId: string, slotIndex: number, minStock: number, maxStock: number) => void;
  onStationSlotPriorityChange: (entityId: string, slotIndex: number, priority: 0 | 1 | 2) => void;
  onSplitterModeChange: (entityId: string, mode: "balanced" | "priority") => void;
  onBeltPriorityChange: (beltId: string, priority: 0 | 1 | 2) => void;
  onBeltStackSizeChange: (beltId: string, stackSize: CargoStackSize) => void;
  onBeltMonitorChange: (beltId: string, enabled: boolean) => void;
  onBeltRouteModeChange: (beltId: string, routeMode: BeltRouteMode) => void;
  onBeltRouteOffsetChange: (beltId: string, routeOffsetY: number) => void;
  onApplyBeltConfigurationToNetwork: (beltId: string) => void;
  onFocusBeltNetwork: (beltId: string) => void;
  onRemoveBeltNetwork: (beltId: string) => void;
  focusedBeltNetworkId: string | null;
  onUpgradeBeltNetwork: (beltId: string) => void;
  onUpgradeSorterNetwork: (beltId: string) => void;
  onCopyBeltConfiguration: (beltId: string) => void;
  onPasteBeltConfiguration: (beltId: string) => void;
  hasCopiedBeltConfiguration: boolean;
  onCraft: (buildingId: ConstructionId) => void;
  onCraftItem: (recipeId: RecipeId, batches: number) => void;
  onQueueCraftItem: (recipeId: RecipeId, batches: number) => void;
  onCancelCraftQueue: (entryId: string) => void;
  onAddEntity: (entityId: string) => void;
  onUpgradeEntity: (entityId: string) => void;
  onUpgradeBelt: (beltId: string) => void;
  onUpgradeSorter: (beltId: string) => void;
  onInstallSprayCoater: (entityId: string) => void;
  onProliferatorConfiguration: (entityId: string, tier: ProliferatorTier, mode: ProliferatorMode) => void;
  onBatchRecipeChange: (entityIds: string[], recipeId: RecipeId) => void;
  onBatchInstallSprayCoater: (entityIds: string[]) => void;
  onBatchProliferatorConfiguration: (entityIds: string[], tier: ProliferatorTier, mode: ProliferatorMode) => void;
  onRemoveEntity: (entityId: string) => void;
  onRemoveBelt: (beltId: string) => void;
}

function MultiSelectionInspector({ game, entities, onRecipeChange, onInstallSprayCoater, onProliferatorConfiguration }: {
  game: GameState;
  entities: FactoryEntity[];
  onRecipeChange: (entityIds: string[], recipeId: RecipeId) => void;
  onInstallSprayCoater: (entityIds: string[]) => void;
  onProliferatorConfiguration: (entityIds: string[], tier: ProliferatorTier, mode: ProliferatorMode) => void;
}) {
  const ids = new Set(entities.map((entity) => entity.id));
  const equipmentCount = entities.reduce((sum, entity) => sum + entity.machineCount + entity.minerCount, 0);
  const ratedDemand = entities.reduce((sum, entity) => {
    if (entity.kind === "vein" && entity.minerCount > 0) {
      return sum + (getBuilding(getExtractorBuildingId(entity.resourceId!)).powerDemandKw ?? 0) * entity.minerCount;
    }
    return sum + (entity.buildingId ? (getBuilding(entity.buildingId).powerDemandKw ?? 0) * entity.machineCount : 0);
  }, 0);
  const internalLines = game.belts.filter((belt) => ids.has(belt.source) && ids.has(belt.target)).length;
  const running = entities.filter((entity) => getEntityOperatingStatus(game, entity).tone === "running").length;
  const composition = new Map<string, number>();
  for (const entity of entities) {
    const name = entity.kind === "vein" ? ITEMS[entity.resourceId!].name : getBuilding(entity.buildingId!).name;
    composition.set(name, (composition.get(name) ?? 0) + Math.max(entity.machineCount, entity.minerCount, 1));
  }
  const machines = entities.filter((entity) => entity.kind === "machine" && entity.buildingId);
  const commonRecipes = machines.length > 0 ? getRecipesForBuilding(machines[0].buildingId!).filter((recipe) =>
    (!recipe.requiredTechId || isTechnologyCompleted(game, recipe.requiredTechId)) &&
    machines.every((entity) => getRecipesForBuilding(entity.buildingId!).some((candidate) => candidate.id === recipe.id))) : [];
  const commonRecipeId = machines.length > 0 && machines.every((entity) => entity.recipeId === machines[0].recipeId)
    ? machines[0].recipeId
    : "";
  const sprayEligible = machines.filter(isProliferatorEligible);
  const sprayInstalled = sprayEligible.filter((entity) => entity.sprayCoaterInstalled);
  const commonTier = sprayInstalled.length > 0 && sprayInstalled.every((entity) => (entity.proliferatorTier ?? 1) === (sprayInstalled[0].proliferatorTier ?? 1))
    ? sprayInstalled[0].proliferatorTier ?? 1
    : 1;
  const commonMode = sprayInstalled.length > 0 && sprayInstalled.every((entity) => (entity.proliferatorMode ?? "normal") === (sprayInstalled[0].proliferatorMode ?? "normal"))
    ? sprayInstalled[0].proliferatorMode ?? "normal"
    : "normal";
  return (
    <div className="inspector-content multi-selection-inspector">
      <div className="inspector-identity"><i className="building-mark"><Layers3 size={18} /></i><div><span>画布多选</span><strong>已选择 {entities.length} 个节点</strong></div></div>
      <dl className="metric-ledger">
        <div><dt>设备总数</dt><dd>{equipmentCount}</dd></div>
        <div><dt>运行节点</dt><dd>{running}/{entities.length}</dd></div>
        <div><dt>内部运输线</dt><dd>{internalLines}</dd></div>
        <div><dt>额定耗电</dt><dd>{ratedDemand.toFixed(0)} kW</dd></div>
      </dl>
      {commonRecipes.length > 0 ? (
        <section className="batch-control">
          <header><Factory size={14} /><span>批量配方</span><strong>{machines.length} 个设备</strong></header>
          <select value={commonRecipeId} onChange={(event) => onRecipeChange(machines.map((entity) => entity.id), event.target.value as RecipeId)} aria-label="批量修改生产配方">
            {!commonRecipeId ? <option value="" disabled>混合配方</option> : null}
            {commonRecipes.map((recipe) => <option value={recipe.id} key={recipe.id}>{recipe.name}</option>)}
          </select>
        </section>
      ) : null}
      {sprayEligible.length > 0 ? (
        <section className="batch-control batch-proliferator">
          <header><Sparkles size={14} /><span>批量喷涂</span><strong>{sprayInstalled.length}/{sprayEligible.length}</strong></header>
          {sprayInstalled.length < sprayEligible.length ? (
            <button type="button" disabled={(game.construction.spray_coater ?? 0) < sprayEligible.length - sprayInstalled.length || !isTechnologyCompleted(game, "proliferator_1")} onClick={() => onInstallSprayCoater(sprayEligible.map((entity) => entity.id))}><Wrench size={13} />安装缺少的喷涂机</button>
          ) : null}
          {sprayInstalled.length > 0 ? <div className="batch-proliferator-options">
            <select value={commonTier} onChange={(event) => onProliferatorConfiguration(sprayInstalled.map((entity) => entity.id), Number(event.target.value) as ProliferatorTier, commonMode)} aria-label="批量增产剂等级">
              {([1, 2, 3] as ProliferatorTier[]).map((tier) => <option value={tier} disabled={!isTechnologyCompleted(game, getProliferator(tier).requiredTechId)} key={tier}>Mk.{tier === 3 ? "III" : tier === 2 ? "II" : "I"}</option>)}
            </select>
            <select value={commonMode} onChange={(event) => onProliferatorConfiguration(sprayInstalled.map((entity) => entity.id), commonTier, event.target.value as ProliferatorMode)} aria-label="批量增产模式">
              <option value="normal">正常生产</option><option value="extra">额外产出</option><option value="speed">生产加速</option>
            </select>
          </div> : null}
        </section>
      ) : null}
      <section className="selection-composition"><span>选区构成</span><div>{[...composition].map(([name, count]) => <p key={name}><strong>{name}</strong><em>×{count}</em></p>)}</div></section>
    </div>
  );
}

function InspectorEmpty({ game }: { game: GameState }) {
  const planetEntities = game.entities.filter((entity) => entity.planetId === game.activePlanetId);
  const machines = planetEntities.reduce((sum, entity) => sum + entity.machineCount + entity.minerCount, 0);
  const topConsumer = planetEntities
    .map((entity) => {
      if (entity.kind === "vein" && entity.minerCount > 0) {
        const buildingId = getExtractorBuildingId(entity.resourceId!);
        return { name: getBuilding(buildingId).name, demand: (getBuilding(buildingId).powerDemandKw ?? 0) * entity.minerCount };
      }
      return entity.buildingId
        ? { name: getBuilding(entity.buildingId).name, demand: (getBuilding(entity.buildingId).powerDemandKw ?? 0) * entity.machineCount }
        : { name: "", demand: 0 };
    })
    .sort((a, b) => b.demand - a.demand)[0];
  const reserve = game.metrics.fuelReserveSeconds;
  const reserveLabel = reserve >= 60 ? `${Math.floor(reserve / 60)}m ${Math.floor(reserve % 60)}s` : reserve > 0 ? `${Math.floor(reserve)}s` : "-";
  return (
    <div className="inspector-empty">
      <Layers3 size={24} />
      <strong>行星生产网络</strong>
      <dl>
        <div><dt>生产节点</dt><dd>{planetEntities.length}</dd></div>
        <div><dt>已部署设备</dt><dd>{machines}</dd></div>
        <div><dt>物流连接</dt><dd>{game.belts.filter((belt) => belt.planetId === game.activePlanetId).length}</dd></div>
        <div><dt>可再生能源</dt><dd>{(game.metrics.windGenerationKw + game.metrics.solarGenerationKw + game.metrics.geothermalGenerationKw).toFixed(0)} kW</dd></div>
        <div><dt>射线电力</dt><dd>{game.metrics.rayGenerationKw.toFixed(0)} kW</dd></div>
        <div><dt>戴森球功率</dt><dd>{game.dysonSphere.generationKw.toFixed(0)} kW</dd></div>
        <div><dt>燃料发电</dt><dd>{(game.metrics.thermalGenerationKw + game.metrics.fusionGenerationKw + game.metrics.artificialStarGenerationKw).toFixed(0)} kW</dd></div>
        <div><dt>燃料续航</dt><dd>{reserveLabel}</dd></div>
        <div><dt>电网储能</dt><dd>{game.metrics.storedEnergyMj.toFixed(1)} / {game.metrics.storageCapacityMj.toFixed(0)} MJ</dd></div>
        <div><dt>最大耗电设备</dt><dd>{topConsumer?.demand ? `${topConsumer.name} ${topConsumer.demand.toFixed(0)} kW` : "-"}</dd></div>
        <div><dt>运行时间</dt><dd>{Math.floor(game.elapsedSeconds / 60)} min</dd></div>
      </dl>
    </div>
  );
}

function EquipmentUpgradeControl({ game, entity, onUpgrade }: {
  game: GameState;
  entity: FactoryEntity;
  onUpgrade: (entityId: string) => void;
}) {
  if (!entity.buildingId) return null;
  const targetId = getBuildingUpgradeTarget(entity.buildingId);
  if (!targetId) return null;
  const current = getBuilding(entity.buildingId);
  const target = getBuilding(targetId);
  const definition = getConstructionDefinition(targetId);
  const stock = game.construction[targetId] ?? 0;
  const unlocked = !definition?.requiredTechId || isTechnologyCompleted(game, definition.requiredTechId);
  const ready = canUpgradeEntity(game, entity.id);
  return (
    <section className="equipment-upgrade">
      <header>
        <span><ArrowUp size={14} />设备升级</span>
        <strong>Mk.{current.tier ?? 1} → Mk.{target.tier ?? 1}</strong>
      </header>
      <dl>
        <div><dt>设备速度</dt><dd>{current.speed.toFixed(2)}× → {target.speed.toFixed(2)}×</dd></div>
        <div><dt>单机耗电</dt><dd>{(current.powerDemandKw ?? 0).toFixed(0)} → {(target.powerDemandKw ?? 0).toFixed(0)} kW</dd></div>
        <div><dt>升级设备</dt><dd>{stock}/{entity.machineCount}</dd></div>
      </dl>
      <button type="button" disabled={!ready} onClick={() => onUpgrade(entity.id)} title={unlocked ? `升级为${target.name}` : `需要科技：${getTechnology(definition?.requiredTechId)?.name ?? "未解锁"}`}>
        {unlocked ? <ArrowUp size={14} /> : <LockKeyhole size={14} />}
        {unlocked ? `升级整组 ×${entity.machineCount}` : "科技锁定"}
      </button>
    </section>
  );
}

function ProliferatorControl({ game, entity, onInstall, onConfigure }: {
  game: GameState;
  entity: FactoryEntity;
  onInstall: (entityId: string) => void;
  onConfigure: (entityId: string, tier: ProliferatorTier, mode: ProliferatorMode) => void;
}) {
  if (!isProliferatorEligible(entity)) return null;
  const stock = game.construction.spray_coater ?? 0;
  if (!entity.sprayCoaterInstalled) {
    const unlocked = isTechnologyCompleted(game, "proliferator_1");
    return (
      <section className="proliferator-control proliferator-control--install">
        <header><span><Sparkles size={14} />生产喷涂</span><strong>模块未安装</strong></header>
        <div><span>喷涂机库存</span><strong>{stock}/1</strong></div>
        <button type="button" disabled={!canInstallSprayCoater(game, entity.id)} onClick={() => onInstall(entity.id)} title={unlocked ? "安装喷涂机" : "需要科技：增产剂 Mk.I"}>
          {unlocked ? <Wrench size={14} /> : <LockKeyhole size={14} />}{unlocked ? "安装喷涂模块" : "科技锁定"}
        </button>
      </section>
    );
  }

  const tier = entity.proliferatorTier ?? 1;
  const definition = getProliferator(tier);
  const recipe = getRecipe(entity.recipeId);
  const availablePoints = Math.floor((entity.proliferatorPoints ?? 0) +
    (entity.inputs[definition.itemId] ?? 0) * definition.sprayPoints);
  const mode = entity.proliferatorMode ?? "normal";
  const modeEffect = mode === "extra"
    ? `额外产出 +${Math.round(getEntityExtraProductBonus(entity) * 1000) / 10}%`
    : mode === "speed"
      ? `生产速度 +${Math.round((getEntityProliferatorSpeedMultiplier(entity) - 1) * 100)}%`
      : "不消耗喷涂点数";
  return (
    <section className="proliferator-control">
      <header><span><Sparkles size={14} />生产喷涂</span><strong>{modeEffect}</strong></header>
      <div className="proliferator-tier" aria-label="增产剂等级">
        {([1, 2, 3] as ProliferatorTier[]).map((option) => {
          const optionDefinition = getProliferator(option);
          const unlocked = isTechnologyCompleted(game, optionDefinition.requiredTechId);
          return <button className={tier === option ? "active" : ""} type="button" disabled={!unlocked} key={option} onClick={() => onConfigure(entity.id, option, mode)} title={unlocked ? getItem(optionDefinition.itemId).name : `需要科技：${getTechnology(optionDefinition.requiredTechId)?.name}`}>
            Mk.{option === 3 ? "III" : option === 2 ? "II" : "I"}
          </button>;
        })}
      </div>
      <div className="segmented-control proliferator-mode" aria-label="生产喷涂模式">
        {(["normal", "extra", "speed"] as ProliferatorMode[]).map((option) => (
          <button className={mode === option ? "active" : ""} type="button" key={option} onClick={() => onConfigure(entity.id, tier, option)}>
            {{ normal: "正常", extra: "增产", speed: "加速" }[option]}
          </button>
        ))}
      </div>
      <dl>
        <div><dt>可用点数</dt><dd>{availablePoints}</dd></div>
        <div><dt>单件点数</dt><dd>{definition.sprayPoints}</dd></div>
        <div><dt>每周期消耗</dt><dd>{getProliferatorSprayCost(recipe)}</dd></div>
        <div><dt>耗电倍率</dt><dd>{getEntityProliferatorPowerMultiplier(entity).toFixed(2)}×</dd></div>
      </dl>
    </section>
  );
}

function PowerNetworkControl({ game, entity, onGridChange, onPowerPriorityChange, onGenerationPriorityChange }: {
  game: GameState;
  entity: FactoryEntity;
  onGridChange: (entityId: string, gridId: PowerGridId) => void;
  onPowerPriorityChange: (entityId: string, priority: PowerPriority) => void;
  onGenerationPriorityChange: (entityId: string, priority: PowerPriority) => void;
}) {
  const gridId = entity.powerGridId ?? "grid-a";
  const grid = getPowerGridMetrics(game, entity.planetId, gridId);
  const generator = entity.kind === "power" || entity.buildingId === "ray_receiver";
  const covered = isEntityInPowerCoverage(game, entity);
  const factor = getEntityPowerFactor(game, entity);
  return (
    <section className="power-network-control">
      <header><span><Zap size={14} />电网域</span><strong>{POWER_GRID_LABELS[gridId]}</strong></header>
      <div className="power-grid-switcher" role="group" aria-label="选择电网域">
        {POWER_GRID_IDS.map((option) => <button type="button" key={option} className={gridId === option ? "active" : ""} onClick={() => onGridChange(entity.id, option)}>{POWER_GRID_LABELS[option].slice(0, 1)}</button>)}
      </div>
      <dl className="metric-ledger power-network-ledger">
        <div><dt>供电状态</dt><dd className={covered && factor > 0 ? "status-text--running" : "status-text--blocked"}>{covered ? `${Math.round(factor * 100)}%` : "超出范围"}</dd></div>
        <div><dt>覆盖半径</dt><dd>{grid.coverageRadius.toLocaleString("zh-CN")} m</dd></div>
        <div><dt>电网负载</dt><dd>{grid.demandKw.toFixed(0)} / {grid.generationKw.toFixed(0)} kW</dd></div>
      </dl>
      <div className="power-priority-buttons" role="group" aria-label={generator ? "发电调度优先级" : "用电优先级"}>
        <span>{generator ? "发电调度优先级" : "用电优先级"}</span>
        <div className="segmented-control">{([3, 2, 1] as PowerPriority[]).map((priority) => <button type="button" className={(generator ? entity.generationPriority : entity.powerPriority) === priority ? "active" : ""} key={priority} onClick={() => generator ? onGenerationPriorityChange(entity.id, priority) : onPowerPriorityChange(entity.id, priority)}>{priority === 3 ? "高" : priority === 2 ? "中" : "低"}</button>)}</div>
      </div>
    </section>
  );
}

function EntityManagementActions({ game, entity, onAdd, onRemove }: {
  game: GameState;
  entity: FactoryEntity;
  onAdd: (entityId: string) => void;
  onRemove: (entityId: string) => void;
}) {
  const constructionId = entity.kind === "vein" && entity.resourceId
    ? getExtractorBuildingId(entity.resourceId)
    : entity.buildingId;
  if (!constructionId) return null;
  const name = getBuilding(constructionId).name;
  const available = Math.floor(game.construction[constructionId] ?? 0);
  return (
    <div className="entity-management-actions">
      <button className="entity-add-command" type="button" disabled={available < 1} onClick={() => onAdd(entity.id)} title={available > 0 ? `消耗施工托盘中的 1 台${name}` : `施工托盘中没有可用的${name}`} aria-label={entity.kind === "vein" ? `快速增加采矿机，剩余 ${available}` : `快速增加建筑，剩余 ${available}`}>
        <Plus size={15} /> {entity.kind === "vein" ? "快速增加采矿机" : "快速增加建筑"}<strong>+1</strong>
      </button>
      {entity.kind !== "vein" ? <button className="danger-command" type="button" onClick={() => onRemove(entity.id)}><Trash2 size={15} /> 回收设备</button> : null}
    </div>
  );
}

function EntityInspector({
  game,
  entity,
  onRecipeChange,
  onLogisticsItemChange,
  onFuelChange,
  onEnergyModeChange,
  onPowerGridChange,
  onPowerPriorityChange,
  onGenerationPriorityChange,
  onStationModeChange,
  onStationVesselAdjust,
  onStationDroneAdjust,
  onStationWarperAdjust,
  onStationWarpEnabled,
  onStationMinimumLoadChange,
  onStationSlotItemChange,
  onStationSlotModeChange,
  onStationSlotMinimumLoadChange,
  onStationSlotLimitsChange,
  onStationSlotPriorityChange,
  onSplitterModeChange,
  onInstallSprayCoater,
  onProliferatorConfiguration,
  onAdd,
  onUpgrade,
  onRemove,
}: {
  game: GameState;
  entity: FactoryEntity;
  onRecipeChange: (entityId: string, recipeId: RecipeId) => void;
  onLogisticsItemChange: (entityId: string, itemId: ItemId) => void;
  onFuelChange: (entityId: string, itemId: ItemId) => void;
  onEnergyModeChange: (entityId: string, mode: EnergyMode) => void;
  onPowerGridChange: (entityId: string, gridId: PowerGridId) => void;
  onPowerPriorityChange: (entityId: string, priority: PowerPriority) => void;
  onGenerationPriorityChange: (entityId: string, priority: PowerPriority) => void;
  onStationModeChange: (entityId: string, mode: "supply" | "demand") => void;
  onStationVesselAdjust: (entityId: string, delta: number) => void;
  onStationDroneAdjust: (entityId: string, delta: number) => void;
  onStationWarperAdjust: (entityId: string, delta: number) => void;
  onStationWarpEnabled: (entityId: string, enabled: boolean) => void;
  onStationMinimumLoadChange: (entityId: string, minimumLoad: StationMinimumLoad) => void;
  onStationSlotItemChange: (entityId: string, slotIndex: number, itemId: ItemId | null) => void;
  onStationSlotModeChange: (entityId: string, slotIndex: number, scope: StationLogisticsScope, mode: StationLogisticsMode) => void;
  onStationSlotMinimumLoadChange: (entityId: string, slotIndex: number, minimumLoad: StationMinimumLoad) => void;
  onStationSlotLimitsChange: (entityId: string, slotIndex: number, minStock: number, maxStock: number) => void;
  onStationSlotPriorityChange: (entityId: string, slotIndex: number, priority: 0 | 1 | 2) => void;
  onSplitterModeChange: (entityId: string, mode: "balanced" | "priority") => void;
  onInstallSprayCoater: (entityId: string) => void;
  onProliferatorConfiguration: (entityId: string, tier: ProliferatorTier, mode: ProliferatorMode) => void;
  onAdd: (entityId: string) => void;
  onUpgrade: (entityId: string) => void;
  onRemove: (entityId: string) => void;
}) {
  const [editingStationSlot, setEditingStationSlot] = useState<number | null>(null);
  const status = getEntityOperatingStatus(game, entity);
  if (entity.kind === "vein") {
    const item = getItem(entity.resourceId!);
    const extractor = getBuilding(getExtractorBuildingId(entity.resourceId!));
    return (
      <div className="inspector-content">
        <div className="inspector-identity">
          <ItemMark itemId={entity.resourceId!} />
          <div><span>{entity.resourceId === "water" ? "无限海洋水源" : entity.resourceId === "sulfuric_acid" ? "无限硫酸海洋" : item.kind === "fluid" ? "无限原油涌泉" : "无限资源矿脉"}</span><strong>{item.name}</strong></div>
        </div>
        <dl className="metric-ledger">
          <div><dt>{extractor.shortName}</dt><dd>×{entity.minerCount}</dd></div>
          <div><dt>设备状态</dt><dd className={`status-text status-text--${status.tone}`}>{status.label}</dd></div>
          <div><dt>自动产出</dt><dd>{entity.productionRate.toFixed(1)}/min</dd></div>
          <div><dt>采矿科技</dt><dd>{getMiningSpeedMultiplier(game).toFixed(2)}×</dd></div>
          <div><dt>输出缓存</dt><dd>{formatAmount(entity.outputs[entity.resourceId!] ?? 0)}</dd></div>
        </dl>
        <PowerNetworkControl game={game} entity={entity} onGridChange={onPowerGridChange} onPowerPriorityChange={onPowerPriorityChange} onGenerationPriorityChange={onGenerationPriorityChange} />
        <EntityManagementActions game={game} entity={entity} onAdd={onAdd} onRemove={onRemove} />
      </div>
    );
  }

  const building = getBuilding(entity.buildingId!);

  const fuelOptions = getFuelItemIdsForBuilding(entity.buildingId!);
  if (fuelOptions.length > 0) {
    const fuelId = entity.fuelItemId;
    const ratedPower = (building.powerGenerationKw ?? 0) * entity.machineCount;
    return (
      <div className="inspector-content">
        <div className="inspector-identity">
          <i className="building-mark building-mark--thermal">{entity.buildingId === "mini_fusion_power_plant" ? <Atom size={18} /> : <Flame size={18} />}</i>
          <div><span>可调度能源设施</span><strong>{building.name} ×{entity.machineCount}</strong></div>
        </div>
        <label className="recipe-select">
          <span>当前燃料</span>
          <select value={fuelId ?? ""} onChange={(event) => onFuelChange(entity.id, event.target.value as ItemId)}>
            <option value="" disabled>选择燃料</option>
            {fuelOptions.map((itemId) => <option value={itemId} key={itemId}>{ITEMS[itemId].name} · {FUEL_ENERGY_MJ[itemId]} MJ</option>)}
          </select>
        </label>
        <dl className="metric-ledger">
          <div><dt>设备状态</dt><dd className={`status-text status-text--${status.tone}`}>{status.label}</dd></div>
          <div><dt>实时出力</dt><dd>{(entity.powerOutputKw ?? 0).toFixed(0)} kW</dd></div>
          <div><dt>额定出力</dt><dd>{ratedPower.toFixed(0)} kW</dd></div>
          <div><dt>燃料库存</dt><dd>{fuelId ? formatAmount(entity.inputs[fuelId] ?? 0) : "-"}</dd></div>
          <div><dt>单件热值</dt><dd>{fuelId ? `${FUEL_ENERGY_MJ[fuelId]} MJ` : "-"}</dd></div>
          <div><dt>反应余能</dt><dd>{(entity.fuelRemainingMj ?? 0).toFixed(2)} MJ</dd></div>
        </dl>
        <PowerNetworkControl game={game} entity={entity} onGridChange={onPowerGridChange} onPowerPriorityChange={onPowerPriorityChange} onGenerationPriorityChange={onGenerationPriorityChange} />
        <p className="inspector-description">{building.description}</p>
        <EntityManagementActions game={game} entity={entity} onAdd={onAdd} onRemove={onRemove} />
      </div>
    );
  }

  if (entity.buildingId === "accumulator") {
    const capacity = (building.energyCapacityMj ?? 0) * entity.machineCount;
    const stored = Math.min(capacity, Math.max(0, entity.storedEnergyMj ?? 0));
    const percent = capacity > 0 ? Math.round(stored / capacity * 100) : 0;
    return (
      <div className="inspector-content energy-inspector">
        <div className="inspector-identity">
          <i className="building-mark building-mark--energy"><BatteryFull size={18} /></i>
          <div><span>电网缓冲储能</span><strong>{building.name} ×{entity.machineCount}</strong></div>
        </div>
        <div className="energy-meter" role="progressbar" aria-label="蓄电器储能" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <i style={{ width: `${percent}%` }} /><span>储能水平</span><strong>{percent}%</strong>
        </div>
        <dl className="metric-ledger">
          <div><dt>设备状态</dt><dd className={`status-text status-text--${status.tone}`}>{status.label}</dd></div>
          <div><dt>当前储能</dt><dd>{stored.toFixed(2)} / {capacity.toFixed(0)} MJ</dd></div>
          <div><dt>充电功率</dt><dd>{(entity.powerInputKw ?? 0).toFixed(0)} kW</dd></div>
          <div><dt>放电功率</dt><dd>{(entity.powerOutputKw ?? 0).toFixed(0)} kW</dd></div>
          <div><dt>最大功率</dt><dd>{((building.powerGenerationKw ?? 0) * entity.machineCount).toFixed(0)} kW</dd></div>
        </dl>
        <PowerNetworkControl game={game} entity={entity} onGridChange={onPowerGridChange} onPowerPriorityChange={onPowerPriorityChange} onGenerationPriorityChange={onGenerationPriorityChange} />
        <p className="inspector-description">{building.description}</p>
        <EntityManagementActions game={game} entity={entity} onAdd={onAdd} onRemove={onRemove} />
      </div>
    );
  }

  if (entity.buildingId === "energy_exchanger") {
    const charging = entity.energyMode !== "discharge";
    const inputId: ItemId = charging ? "accumulator" : "charged_accumulator";
    const outputId: ItemId = charging ? "charged_accumulator" : "accumulator";
    const switchingLocked = (entity.storedEnergyMj ?? 0) > 0.0001;
    return (
      <div className="inspector-content energy-inspector">
        <div className="inspector-identity">
          <i className="building-mark building-mark--energy"><BatteryCharging size={18} /></i>
          <div><span>可运输储能设施</span><strong>{building.name} ×{entity.machineCount}</strong></div>
        </div>
        <div className="segmented-control" aria-label="能量枢纽模式">
          <button className={charging ? "active" : ""} type="button" disabled={switchingLocked} onClick={() => onEnergyModeChange(entity.id, "charge")}>充电</button>
          <button className={!charging ? "active" : ""} type="button" disabled={switchingLocked} onClick={() => onEnergyModeChange(entity.id, "discharge")}>放电</button>
        </div>
        <dl className="metric-ledger">
          <div><dt>设备状态</dt><dd className={`status-text status-text--${status.tone}`}>{status.label}</dd></div>
          <div><dt>转换方向</dt><dd>{ITEMS[inputId].name} → {ITEMS[outputId].name}</dd></div>
          <div><dt>输入库存</dt><dd>{formatAmount(entity.inputs[inputId] ?? 0)}</dd></div>
          <div><dt>输出库存</dt><dd>{formatAmount(entity.outputs[outputId] ?? 0)}</dd></div>
          <div><dt>当前功率</dt><dd>{charging ? `-${(entity.powerInputKw ?? 0).toFixed(0)}` : (entity.powerOutputKw ?? 0).toFixed(0)} kW</dd></div>
          <div><dt>单元能量</dt><dd>90 MJ</dd></div>
        </dl>
        <PowerNetworkControl game={game} entity={entity} onGridChange={onPowerGridChange} onPowerPriorityChange={onPowerPriorityChange} onGenerationPriorityChange={onGenerationPriorityChange} />
        {switchingLocked ? <p className="energy-mode-lock">当前蓄电器周期完成后可切换模式</p> : null}
        <p className="inspector-description">{building.description}</p>
        <EntityManagementActions game={game} entity={entity} onAdd={onAdd} onRemove={onRemove} />
      </div>
    );
  }

  if (entity.kind === "station") {
    const planetary = entity.buildingId === "planetary_logistics_station";
    const collector = entity.buildingId === "orbital_collector";
    const acceptedItems = collector
      ? Object.entries(getPlanet(entity.planetId).orbitalYields ?? {})
        .filter(([, rate]) => (rate ?? 0) > 0)
        .map(([itemId]) => ITEMS[itemId as ItemId])
      : Object.values(ITEMS);
    const itemId = entity.storedItemId;
    const peer = collector ? findInterstellarPeer(game, entity) : planetary ? findPlanetaryPeer(game, entity) : findInterstellarPeer(game, entity);
    if (collector) {
      return (
        <div className="inspector-content station-inspector">
          <div className="inspector-identity">
            <i className="building-mark building-mark--station"><Orbit size={18} /></i>
            <div><span>气态巨星轨道设施</span><strong>{building.name} ×{entity.machineCount}</strong></div>
          </div>
          <div className="recipe-select">
            <span>采集资源</span>
            <ItemCatalogPicker value={itemId} items={acceptedItems} label="选择采集资源" onChange={(nextItemId) => { if (nextItemId) onLogisticsItemChange(entity.id, nextItemId); }} />
          </div>
          <dl className="metric-ledger">
            <div><dt>设备状态</dt><dd className={`status-text status-text--${status.tone}`}>{status.label}</dd></div>
            <div><dt>需求目标</dt><dd>{peer ? `${getPlanet(peer.planetId).name} · ${peer.id}` : "等待星际需求"}</dd></div>
            <div><dt>可用库存</dt><dd>{itemId ? formatAmount(entity.outputs[itemId] ?? 0) : "-"}</dd></div>
            <div><dt>采集周期</dt><dd>{Math.floor(entity.progress * 100)}%</dd></div>
            <div><dt>采集速率</dt><dd>{entity.productionRate.toFixed(1)}/min</dd></div>
            <div><dt>完成航次</dt><dd>{entity.stationTrips ?? 0}</dd></div>
          </dl>
          <PowerNetworkControl game={game} entity={entity} onGridChange={onPowerGridChange} onPowerPriorityChange={onPowerPriorityChange} onGenerationPriorityChange={onGenerationPriorityChange} />
          <p className="inspector-description">{building.description}</p>
          <EntityManagementActions game={game} entity={entity} onAdd={onAdd} onRemove={onRemove} />
        </div>
      );
    }
    const slots = getStationSlots(entity);
    const configuredItems = new Set(slots.flatMap((slot) => slot.itemId ? [slot.itemId] : []));
    const droneCapacity = getStationDroneCapacity(entity);
    const droneCount = Math.min(droneCapacity, Math.max(0, Math.floor(entity.stationDrones ?? 0)));
    const availableDrones = Math.max(0, Math.floor(game.portableFleet?.logistics_drone ?? 0));
    const vesselCapacity = getStationVesselCapacity(entity);
    const vesselCount = Math.min(vesselCapacity, Math.max(0, Math.floor(entity.stationVessels ?? 0)));
    const availableVessels = Math.max(0, Math.floor(game.portableFleet?.logistics_vessel ?? 0));
    const warperCapacity = getStationWarperCapacity(entity);
    const warperCount = Math.min(warperCapacity, Math.max(0, Math.floor(entity.stationWarpers ?? 0)));
    const availableWarpers = Math.max(0, Math.floor(game.tray.space_warper ?? 0));
    const warpUnlocked = isTechnologyCompleted(game, "space_warp");
    const activeRoutes = entity.stationRoutes ?? [];
    const primarySlotIndex = Math.max(0, slots.findIndex((slot) => slot.itemId));
    const primarySlot = slots[primarySlotIndex];
    const primaryScope: StationLogisticsScope = planetary ? "local" : "remote";
    const primaryUnitCargo = planetary ? getPlanetaryCargoCapacity(game) : getInterstellarCargoCapacity(game);
    const primaryVehicleUnit = planetary ? "架" : "船";
    const primaryRouteSeconds = planetary
      ? getPlanetaryTripSeconds(game)
      : getInterstellarTripSeconds(game, Boolean(peer && stationRouteRequiresWarp(entity, peer)));
    return (
      <div className="inspector-content station-inspector">
        <div className="inspector-identity">
          <i className="building-mark building-mark--station"><Orbit size={18} /></i>
          <div><span>{planetary ? "行星多槽调度" : "本地与星际联合调度"}</span><strong>{building.name} ×{entity.machineCount}</strong></div>
        </div>
        <section className="station-fleet-grid">
          <div className={planetary ? "station-fleet-control" : "station-local-fleet-control"}>
            <div className="station-control-heading"><span>运输机泊位</span><small>随身 {availableDrones}</small></div>
            <div className="station-fleet-stepper">
              <button type="button" aria-label="卸载 1 架物流运输机" disabled={droneCount <= activeRoutes.filter((route) => route.scope === "local").reduce((sum, route) => sum + route.vehicleCount, 0)} onClick={() => onStationDroneAdjust(entity.id, -1)}><Minus size={15} /></button>
              <strong><Orbit size={15} /> {droneCount} / {droneCapacity}</strong>
              <button type="button" aria-label="装载 1 架物流运输机" disabled={availableDrones < 1 || droneCount >= droneCapacity} onClick={() => onStationDroneAdjust(entity.id, 1)}><Plus size={15} /></button>
            </div>
          </div>
          {!planetary ? <div className="station-fleet-control">
            <div className="station-control-heading"><span>运输船泊位</span><small>随身 {availableVessels}</small></div>
            <div className="station-fleet-stepper">
              <button type="button" aria-label="卸载 1 艘物流运输船" disabled={vesselCount <= activeRoutes.filter((route) => route.scope === "remote").reduce((sum, route) => sum + route.vehicleCount, 0)} onClick={() => onStationVesselAdjust(entity.id, -1)}><Minus size={15} /></button>
              <strong><Rocket size={15} /> {vesselCount} / {vesselCapacity}</strong>
              <button type="button" aria-label="装载 1 艘物流运输船" disabled={availableVessels < 1 || vesselCount >= vesselCapacity} onClick={() => onStationVesselAdjust(entity.id, 1)}><Plus size={15} /></button>
            </div>
          </div> : null}
        </section>
        {!planetary ? <div className="station-warper-control">
          <label className="toggle-row">
            <input type="checkbox" checked={entity.stationWarpEnabled !== false} disabled={!warpUnlocked} onChange={(event) => onStationWarpEnabled(entity.id, event.target.checked)} />
            <span>{warpUnlocked ? "允许跨恒星翘曲" : "空间翘曲科技未解锁"}</span>
          </label>
          <div className="station-control-heading"><span>翘曲器仓</span><small>托盘 {availableWarpers}</small></div>
          <div className="station-fleet-stepper">
            <button type="button" aria-label="卸载 1 个空间翘曲器" disabled={warperCount < 1} onClick={() => onStationWarperAdjust(entity.id, -1)}><Minus size={15} /></button>
            <strong><Sparkles size={15} /> {warperCount} / {warperCapacity}</strong>
            <button type="button" aria-label="装载 1 个空间翘曲器" disabled={!warpUnlocked || availableWarpers < 1 || warperCount >= warperCapacity} onClick={() => onStationWarperAdjust(entity.id, 1)}><Plus size={15} /></button>
          </div>
        </div> : null}
        <section className="station-slot-list" aria-label="物流站货物槽位">
          {slots.map((slot, slotIndex) => {
            const routes = activeRoutes.filter((route) => route.slotIndex === slotIndex);
            const routeProgress = routes.length ? Math.max(...routes.map((route) => route.progress)) : 0;
            return (
              <article className={`station-slot${slot.itemId ? " station-slot--configured" : ""}`} key={slotIndex}>
                <header><span>槽位 {slotIndex + 1}</span>{routes.length ? <strong><Route size={12} />{routes.length} 条在途</strong> : <small>空闲</small>}</header>
                {slot.itemId || editingStationSlot === slotIndex ? <ItemCatalogPicker value={slot.itemId} items={acceptedItems} disabledIds={configuredItems} allowClear label={`物流槽位 ${slotIndex + 1} 物品`} onChange={(nextItemId) => { onStationSlotItemChange(entity.id, slotIndex, nextItemId); setEditingStationSlot(null); }} /> : <button className="station-slot-configure" type="button" onClick={() => setEditingStationSlot(slotIndex)}><Plus size={13} />配置货物</button>}
                {slot.itemId ? <>
                  <div className="station-slot-stock"><ItemMark itemId={slot.itemId} /><span>输入 {formatAmount(entity.inputs[slot.itemId] ?? 0)}</span><strong>库存 {formatAmount(entity.outputs[slot.itemId] ?? 0)}</strong></div>
                  <div className="station-slot-scope"><span>本地</span><div className="segmented-control">
                    {(["supply", "demand", "storage"] as StationLogisticsMode[]).map((mode) => <button className={slot.localMode === mode ? "active" : ""} type="button" key={mode} onClick={() => onStationSlotModeChange(entity.id, slotIndex, "local", mode)}>{{ supply: "供应", demand: "需求", storage: "仓储" }[mode]}</button>)}
                  </div></div>
                  {!planetary ? <div className="station-slot-scope"><span>星际</span><div className="segmented-control">
                    {(["supply", "demand", "storage"] as StationLogisticsMode[]).map((mode) => <button className={slot.remoteMode === mode ? "active" : ""} type="button" key={mode} onClick={() => onStationSlotModeChange(entity.id, slotIndex, "remote", mode)}>{{ supply: "供应", demand: "需求", storage: "仓储" }[mode]}</button>)}
                  </div></div> : null}
                  <div className="station-slot-options">
                    <div className="station-slot-load"><span>起运</span><div className="segmented-control">{([0.1, 0.25, 0.5, 1] as StationMinimumLoad[]).map((load) => <button className={slot.minimumLoad === load ? "active" : ""} type="button" key={load} onClick={() => onStationSlotMinimumLoadChange(entity.id, slotIndex, load)}>{Math.round(load * 100)}%</button>)}</div></div>
                    <label><span>优先级</span><select value={slot.priority} onChange={(event) => onStationSlotPriorityChange(entity.id, slotIndex, Number(event.target.value) as 0 | 1 | 2)}><option value={2}>高</option><option value={1}>标准</option><option value={0}>低</option></select></label>
                    <label><span>保留</span><input type="number" min={0} defaultValue={slot.minStock} key={`min-${slot.itemId}-${slot.minStock}`} onBlur={(event) => onStationSlotLimitsChange(entity.id, slotIndex, Number(event.target.value), slot.maxStock)} /></label>
                    <label><span>上限</span><input type="number" min={0} placeholder="额定" defaultValue={slot.maxStock || ""} key={`max-${slot.itemId}-${slot.maxStock}`} onBlur={(event) => onStationSlotLimitsChange(entity.id, slotIndex, slot.minStock, Number(event.target.value))} /></label>
                  </div>
                  {routes.length ? <div className="station-route-progress"><i><b style={{ width: `${Math.min(100, routeProgress * 100)}%` }} /></i><span>{Math.floor(routeProgress * 100)}%</span><strong>{routes.reduce((sum, route) => sum + route.cargo, 0)} 件在途</strong></div> : null}
                </> : null}
              </article>
            );
          })}
        </section>
        <dl className="metric-ledger">
          <div><dt>设备状态</dt><dd className={`status-text status-text--${status.tone}`}>{status.label}</dd></div>
          <div><dt>已配置槽位</dt><dd>{configuredItems.size} / 5</dd></div>
          <div><dt>航线目标</dt><dd>{peer ? planetary ? peer.id : getPlanet(peer.planetId).name : "未配对"}</dd></div>
          <div><dt>在途航线</dt><dd>{activeRoutes.length}</dd></div>
          <div><dt>线路拥堵</dt><dd>{Math.round((entity.stationCongestion ?? 0) * 100)}%</dd></div>
          <div><dt>单机载荷</dt><dd>{primaryUnitCargo} 件/{primaryVehicleUnit}</dd></div>
          <div><dt>最低启航货量</dt><dd>{primarySlot?.itemId ? getStationMinimumCargo(game, entity, primarySlotIndex, primaryScope) : primaryUnitCargo} 件/{primaryVehicleUnit}</dd></div>
          <div><dt>额定航程</dt><dd>{primaryRouteSeconds.toFixed(1)} 秒</dd></div>
          <div><dt>本地载荷</dt><dd>{getPlanetaryCargoCapacity(game)} 件/架 · {getPlanetaryTripSeconds(game).toFixed(1)} 秒</dd></div>
          {!planetary ? <div><dt>星际载荷</dt><dd>{getInterstellarCargoCapacity(game)} 件/船</dd></div> : null}
          {!planetary ? <div><dt>航线类型</dt><dd>{peer && stationRouteRequiresWarp(entity, peer) ? "跨恒星 · 需翘曲" : "恒星系内"}</dd></div> : null}
          <div><dt>完成航次</dt><dd>{entity.stationTrips ?? 0}</dd></div>
          <div><dt>最近运量</dt><dd>{entity.stationLastTransfer ?? 0}</dd></div>
          <div><dt>额定耗电</dt><dd>{((building.powerDemandKw ?? 0) * entity.machineCount).toFixed(0)} kW</dd></div>
        </dl>
        <PowerNetworkControl game={game} entity={entity} onGridChange={onPowerGridChange} onPowerPriorityChange={onPowerPriorityChange} onGenerationPriorityChange={onGenerationPriorityChange} />
        <p className="inspector-description">{building.description}</p>
        <EntityManagementActions game={game} entity={entity} onAdd={onAdd} onRemove={onRemove} />
      </div>
    );
  }

  if (entity.kind === "storage" || entity.kind === "splitter") {
    const acceptedItems = Object.values(ITEMS).filter((item) => {
      const accepts = building.accepts ?? "any";
      return accepts === "any" || accepts === item.kind || (accepts === "solid" && item.kind === "matrix");
    });
    const itemId = entity.storedItemId;
    return (
      <div className="inspector-content">
        <div className="inspector-identity">
          <i className="building-mark">{entity.kind === "splitter" ? <GitFork size={18} /> : <Database size={18} />}</i>
          <div><span>{entity.kind === "splitter" ? "物流分配设施" : "物流缓存设施"}</span><strong>{building.name} ×{entity.machineCount}</strong></div>
        </div>
        <div className="recipe-select">
          <span>缓存物品</span>
          <ItemCatalogPicker value={itemId} items={acceptedItems} label="选择缓存物品" onChange={(nextItemId) => { if (nextItemId) onLogisticsItemChange(entity.id, nextItemId); }} />
        </div>
        {entity.kind === "splitter" ? (
          <div className="segmented-control" aria-label="分流模式">
            <button className={entity.distributionMode !== "priority" ? "active" : ""} type="button" onClick={() => onSplitterModeChange(entity.id, "balanced")}>均衡</button>
            <button className={entity.distributionMode === "priority" ? "active" : ""} type="button" onClick={() => onSplitterModeChange(entity.id, "priority")}>优先线路</button>
          </div>
        ) : null}
        <dl className="metric-ledger">
          <div><dt>设备状态</dt><dd className={`status-text status-text--${status.tone}`}>{status.label}</dd></div>
          <div><dt>输入缓存</dt><dd>{itemId ? formatAmount(entity.inputs[itemId] ?? 0) : "-"}</dd></div>
          <div><dt>可用库存</dt><dd>{itemId ? formatAmount(entity.outputs[itemId] ?? 0) : "-"}</dd></div>
          <div><dt>容量上限</dt><dd>{building.outputCapacity * entity.machineCount}</dd></div>
        </dl>
        <PowerNetworkControl game={game} entity={entity} onGridChange={onPowerGridChange} onPowerPriorityChange={onPowerPriorityChange} onGenerationPriorityChange={onGenerationPriorityChange} />
        <p className="inspector-description">{building.description}</p>
        <EntityManagementActions game={game} entity={entity} onAdd={onAdd} onRemove={onRemove} />
      </div>
    );
  }

  const recipe = getRecipe(entity.recipeId);
  const recipeOptions = getRecipesForBuilding(entity.buildingId!).filter((option) =>
    !option.requiredTechId || isTechnologyCompleted(game, option.requiredTechId));
  const railEjector = entity.buildingId === "em_rail_ejector";
  const rayReceiver = entity.buildingId === "ray_receiver";
  const launchSilo = entity.buildingId === "vertical_launching_silo";
  return (
    <div className="inspector-content">
      <div className="inspector-identity">
        <i className={`building-mark${rayReceiver ? " building-mark--ray" : ""}`}>{entity.kind === "power" ? entity.buildingId === "solar_panel" ? <Sun size={18} /> : entity.buildingId === "geothermal_power_station" ? <ThermometerSun size={18} /> : <Wind size={18} /> : railEjector ? <Satellite size={18} /> : launchSilo ? <Rocket size={18} /> : rayReceiver ? <RadioTower size={18} /> : <Factory size={18} />}</i>
        <div><span>{entity.kind === "power" ? "能源设施" : railEjector ? "恒星轨道设施" : launchSilo ? "戴森球建造设施" : rayReceiver ? "戴森系统接收设施" : "生产设备"}</span><strong>{building.name} ×{entity.machineCount}</strong></div>
      </div>
      {entity.kind === "machine" ? (
        <div className="recipe-select">
          <span>当前配方</span>
          <RecipeCatalogPicker value={entity.recipeId} recipes={recipeOptions} onChange={(recipeId) => onRecipeChange(entity.id, recipeId)} />
        </div>
      ) : null}
      <dl className="metric-ledger">
        {entity.kind === "power" ? (
          <>
            <div><dt>设备状态</dt><dd className={`status-text status-text--${status.tone}`}>{status.label}</dd></div>
            <div><dt>实时发电</dt><dd>{(entity.powerOutputKw ?? 0).toFixed(0)} kW</dd></div>
            <div><dt>额定发电</dt><dd>{((building.powerGenerationKw ?? 0) * entity.machineCount * (entity.buildingId === "solar_panel" ? getPlanetIndustrialProfile(game, entity.planetId).solarMultiplier : entity.buildingId === "geothermal_power_station" ? getPlanetIndustrialProfile(game, entity.planetId).geothermalMultiplier : getPlanetIndustrialProfile(game, entity.planetId).windMultiplier)).toFixed(0)} kW</dd></div>
          </>
        ) : (
          <>
            <div><dt>设备状态</dt><dd className={`status-text status-text--${status.tone}`}>{status.label}</dd></div>
            <div><dt>当前负载</dt><dd>{Math.round(entity.utilization * 100)}%</dd></div>
            {rayReceiver ? <div><dt>接收功率</dt><dd>{(entity.powerOutputKw ?? 0).toFixed(0)} kW</dd></div> : null}
            <div><dt>{railEjector || launchSilo ? "发射速率" : "实际产出"}</dt><dd>{recipe?.id === "ray_power" ? `${(entity.powerOutputKw ?? 0).toFixed(0)} kW` : `${entity.productionRate.toFixed(1)}/min`}</dd></div>
            <div><dt>{rayReceiver ? "额定接收" : "额定耗电"}</dt><dd>{rayReceiver ? `${getRayReceiverCapacityKw(game) * entity.machineCount} kW` : `${((building.powerDemandKw ?? 0) * entity.machineCount).toFixed(0)} kW`}</dd></div>
            {entity.kind === "machine" && entity.sprayCoaterInstalled ? (
              <>
                <div><dt>喷涂速度</dt><dd>{getEntityProliferatorSpeedMultiplier(entity).toFixed(2)}×</dd></div>
                <div><dt>喷涂耗电</dt><dd>{getEntityProliferatorPowerMultiplier(entity).toFixed(2)}×</dd></div>
              </>
            ) : null}
            <div><dt>配方周期</dt><dd>{recipe?.id === "ray_power" ? "连续" : recipe ? `${recipe.duration.toFixed(1)} s` : "-"}</dd></div>
            {railEjector ? <div><dt>戴森云轨道帆</dt><dd>{formatAmount(game.dysonSwarm.sailsInOrbit)}</dd></div> : null}
            {launchSilo ? <div><dt>永久结构点</dt><dd>{formatAmount(game.dysonSphere.structurePoints)}</dd></div> : null}
          </>
        )}
      </dl>
      <PowerNetworkControl game={game} entity={entity} onGridChange={onPowerGridChange} onPowerPriorityChange={onPowerPriorityChange} onGenerationPriorityChange={onGenerationPriorityChange} />
      <ProliferatorControl game={game} entity={entity} onInstall={onInstallSprayCoater} onConfigure={onProliferatorConfiguration} />
      <EquipmentUpgradeControl game={game} entity={entity} onUpgrade={onUpgrade} />
      <p className="inspector-description">{building.description}</p>
      <EntityManagementActions game={game} entity={entity} onAdd={onAdd} onRemove={onRemove} />
    </div>
  );
}

function beltTierRoman(tier: BeltTier): string {
  return tier === 3 ? "III" : tier === 2 ? "II" : "I";
}

function BeltInspector({ game, belt, hasCopiedConfiguration, focused, onPriorityChange, onStackSizeChange, onMonitorChange, onRouteModeChange, onRouteOffsetChange, onApplyConfigurationToNetwork, onFocusNetwork, onUpgrade, onSorterUpgrade, onUpgradeNetwork, onSorterUpgradeNetwork, onCopyConfiguration, onPasteConfiguration, onRemove, onRemoveNetwork }: {
  game: GameState;
  belt: BeltConnection;
  hasCopiedConfiguration: boolean;
  focused: boolean;
  onPriorityChange: (beltId: string, priority: 0 | 1 | 2) => void;
  onStackSizeChange: (beltId: string, stackSize: CargoStackSize) => void;
  onMonitorChange: (beltId: string, enabled: boolean) => void;
  onRouteModeChange: (beltId: string, routeMode: BeltRouteMode) => void;
  onRouteOffsetChange: (beltId: string, routeOffsetY: number) => void;
  onApplyConfigurationToNetwork: (beltId: string) => void;
  onFocusNetwork: (beltId: string) => void;
  onUpgrade: (beltId: string) => void;
  onSorterUpgrade: (beltId: string) => void;
  onUpgradeNetwork: (beltId: string) => void;
  onSorterUpgradeNetwork: (beltId: string) => void;
  onCopyConfiguration: (beltId: string) => void;
  onPasteConfiguration: (beltId: string) => void;
  onRemove: (beltId: string) => void;
  onRemoveNetwork: (beltId: string) => void;
}) {
  const item = getItem(belt.itemId);
  const capacity = getBeltCapacity(belt);
  const targetTier = belt.tier < 3 ? (belt.tier + 1) as BeltTier : null;
  const targetId = targetTier ? getBeltConstructionId(targetTier) : null;
  const targetDefinition = targetId ? getConstructionDefinition(targetId) : undefined;
  const targetStock = targetId ? game.construction[targetId] ?? 0 : 0;
  const targetUnlocked = !targetDefinition?.requiredTechId || isTechnologyCompleted(game, targetDefinition.requiredTechId);
  const networkIds = getBeltNetworkIds(game, belt.id);
  const stackSize = belt.stackSize ?? 1;
  const congestion = belt.congestion ?? 0;
  const network = analyzeBeltNetwork(game, belt.id);
  const routeMode = belt.routeMode ?? "auto";
  return (
    <div className="inspector-content">
      <div className="inspector-identity">
        <ItemMark itemId={belt.itemId} />
        <div><span>物流连接</span><strong>{item.name}运输线</strong></div>
      </div>
      <dl className="metric-ledger">
        <div><dt>传送带等级</dt><dd>Mk.{beltTierRoman(belt.tier)}</dd></div>
        <div><dt>并行线路</dt><dd>×{belt.lanes}</dd></div>
        <div><dt>当前流量</dt><dd>{belt.lastFlow.toFixed(2)}/s</dd></div>
        <div><dt>线路上限</dt><dd>{capacity.toFixed(0)}/s</dd></div>
        <div><dt>货物堆叠</dt><dd>×{stackSize}</dd></div>
        <div><dt>网络线路</dt><dd>{networkIds.length}</dd></div>
        <div><dt>累计运输</dt><dd>{Math.floor(belt.totalTransferred ?? 0).toLocaleString("zh-CN")}</dd></div>
        <div><dt>拥堵指数</dt><dd className={congestion > 0.8 ? "status-text status-text--blocked" : ""}>{Math.round(congestion * 100)}%</dd></div>
      </dl>
      <div className="capacity-bar"><i style={{ width: `${Math.min(100, belt.lastFlow / capacity * 100)}%`, backgroundColor: item.color }} /></div>
      {network ? <section className={`belt-network-diagnostic belt-network-diagnostic--${network.health}`}>
        <header><span><Route size={14} />连续网络诊断</span><strong>{network.label}</strong></header>
        <div>
          <span>线路 <strong>{network.beltIds.length}</strong></span>
          <span>节点 <strong>{network.entityIds.length}</strong></span>
          <span>上游 <strong>{network.sourceEntityIds.length}</strong></span>
          <span>下游 <strong>{network.sinkEntityIds.length}</strong></span>
        </div>
        <div className="belt-network-load"><i><b style={{ width: `${Math.min(100, network.utilization * 100)}%` }} /></i><span>综合利用率 {Math.round(network.utilization * 100)}%</span><strong>最高拥堵 {Math.round(network.maxCongestion * 100)}%</strong></div>
      </section> : null}
      <section className="belt-routing-controls">
        <span>线路优先级</span>
        <div className="segmented-control">{([0, 1, 2] as const).map((priority) => <button className={belt.priority === priority ? "active" : ""} type="button" key={priority} onClick={() => onPriorityChange(belt.id, priority)}>{priority === 2 ? "高" : priority === 1 ? "标准" : "低"}</button>)}</div>
        <span>货物堆叠</span>
        <div className="segmented-control">{([1, 2, 4] as CargoStackSize[]).map((size) => <button className={stackSize === size ? "active" : ""} type="button" disabled={!canSetBeltStackSize(game, size)} key={size} onClick={() => onStackSizeChange(belt.id, size)}>×{size}</button>)}</div>
        <span>画布路由</span>
        <div className="segmented-control belt-route-mode">{([
          ["bezier", "曲线"], ["auto", "避让"], ["upper", "上绕"], ["lower", "下绕"], ["manual", "手动"],
        ] as Array<[BeltRouteMode, string]>).map(([mode, label]) => <button className={routeMode === mode ? "active" : ""} type="button" key={mode} onClick={() => onRouteModeChange(belt.id, mode)}>{label}</button>)}</div>
        {routeMode === "manual" ? <label className="belt-route-offset"><span>控制点高度</span><input type="range" min={-600} max={600} step={20} value={belt.routeOffsetY ?? 0} onChange={(event) => onRouteOffsetChange(belt.id, Number(event.target.value))} /><output>{belt.routeOffsetY ?? 0}</output></label> : null}
        <label className="toggle-row"><input type="checkbox" checked={belt.monitorEnabled ?? false} onChange={(event) => onMonitorChange(belt.id, event.target.checked)} /><span>启用线路流量监测</span></label>
      </section>
      <div className="belt-clipboard-actions">
        <button type="button" onClick={() => onCopyConfiguration(belt.id)}><ClipboardCopy size={14} />复制设置</button>
        <button type="button" disabled={!hasCopiedConfiguration} onClick={() => onPasteConfiguration(belt.id)}><ClipboardPaste size={14} />粘贴设置</button>
        <button type="button" onClick={() => onApplyConfigurationToNetwork(belt.id)}><Layers3 size={14} />设置应用整网</button>
        <button type="button" className={focused ? "active" : ""} onClick={() => onFocusNetwork(belt.id)}><Route size={14} />{focused ? "取消网络聚焦" : "聚焦上下游"}</button>
      </div>
      {targetTier && targetId ? (
        <section className="equipment-upgrade equipment-upgrade--belt">
          <header><span><ArrowUp size={14} />线路升级</span><strong>Mk.{beltTierRoman(belt.tier)} → Mk.{beltTierRoman(targetTier)}</strong></header>
          <dl>
            <div><dt>线路上限</dt><dd>{capacity.toFixed(0)} → {getBeltCapacity({ ...belt, tier: targetTier }).toFixed(0)}/s</dd></div>
            <div><dt>升级传送带</dt><dd>{targetStock}/{belt.lanes}</dd></div>
          </dl>
          <button type="button" disabled={!canUpgradeBelt(game, belt.id)} onClick={() => onUpgrade(belt.id)} title={targetUnlocked ? `升级为传送带 Mk.${beltTierRoman(targetTier)}` : `需要科技：${getTechnology(targetDefinition?.requiredTechId)?.name ?? "未解锁"}`}>
            {targetUnlocked ? <ArrowUp size={14} /> : <LockKeyhole size={14} />}
            {targetUnlocked ? `升级线路 ×${belt.lanes}` : "科技锁定"}
          </button>
          <button type="button" disabled={!targetUnlocked || networkIds.every((id) => !canUpgradeBelt(game, id))} onClick={() => onUpgradeNetwork(belt.id)}><Layers3 size={14} />升级整条网络</button>
        </section>
      ) : null}
      <button className="danger-command" type="button" onClick={() => onRemove(belt.id)}>
        <Trash2 size={15} /> 回收运输线
      </button>
      {network && network.beltIds.length > 1 ? <button className="danger-command danger-command--network" type="button" onClick={() => onRemoveNetwork(belt.id)}>
        <Trash2 size={15} /> 回收整条网络 ×{network.beltIds.length}
      </button> : null}
    </div>
  );
}

type FabricatorMode = "construction" | "items";
type FabricatorSearchHistory = Record<FabricatorMode, string[]>;

const FABRICATOR_SEARCH_HISTORY_KEY = "dsp-idle-network.fabricator-search-history.v1";

function normalizeFabricatorSearchHistory(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const entries: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== "string") continue;
    const entry = candidate.trim().slice(0, 60);
    const identity = entry.toLocaleLowerCase("zh-CN");
    if (!entry || seen.has(identity)) continue;
    seen.add(identity);
    entries.push(entry);
    if (entries.length === 3) break;
  }
  return entries;
}

function loadFabricatorSearchHistory(): FabricatorSearchHistory {
  try {
    const value = JSON.parse(window.localStorage.getItem(FABRICATOR_SEARCH_HISTORY_KEY) ?? "{}") as Record<string, unknown>;
    return {
      construction: normalizeFabricatorSearchHistory(value.construction),
      items: normalizeFabricatorSearchHistory(value.items),
    };
  } catch {
    return { construction: [], items: [] };
  }
}

function saveFabricatorSearchHistory(history: FabricatorSearchHistory) {
  try { window.localStorage.setItem(FABRICATOR_SEARCH_HISTORY_KEY, JSON.stringify(history)); } catch { /* optional convenience state */ }
}

function Fabricator({ game, onCraft, onCraftItem, onQueueCraftItem, onCancelCraftQueue }: {
  game: GameState;
  onCraft: InspectorPanelProps["onCraft"];
  onCraftItem: InspectorPanelProps["onCraftItem"];
  onQueueCraftItem: InspectorPanelProps["onQueueCraftItem"];
  onCancelCraftQueue: InspectorPanelProps["onCancelCraftQueue"];
}) {
  const [mode, setMode] = useState<FabricatorMode>("construction");
  const [view, setView] = useState<"compact" | "detail">("compact");
  const [query, setQuery] = useState("");
  const [searchHistory, setSearchHistory] = useState<FabricatorSearchHistory>(loadFabricatorSearchHistory);
  const [searchHistoryOpen, setSearchHistoryOpen] = useState(false);
  const [batches, setBatches] = useState<1 | 5 | 10>(1);
  const [focusedHandcraftItemId, setFocusedHandcraftItemId] = useState<ItemId | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const term = query.trim().toLocaleLowerCase("zh-CN");
  const handcraftRecipes = Object.values(RECIPES).filter((recipe) => {
    if (!isHandcraftableRecipe(recipe.id)) return false;
    if (!term) return true;
    const itemNames = [...recipe.inputs, ...recipe.outputs].map((entry) => getItem(entry.itemId).name).join(" ");
    return `${recipe.name} ${itemNames} ${getBuilding(recipe.buildingId).name}`.toLocaleLowerCase("zh-CN").includes(term);
  });
  const constructionDefinitions = CONSTRUCTION.filter((definition) => !term || `${definition.name} ${definition.costs.map((cost) => getItem(cost.itemId).name).join(" ")}`.toLocaleLowerCase("zh-CN").includes(term));
  const handcraftOutputItemIds = new Set(Object.values(RECIPES).filter((recipe) => isHandcraftableRecipe(recipe.id)).flatMap((recipe) => recipe.outputs.map((output) => output.itemId)));
  const recentSearches = searchHistory[mode];
  const searchHistoryId = `fabricator-search-history-${mode}`;
  const rememberSearch = (targetMode: FabricatorMode, value: string) => {
    const entry = value.trim().slice(0, 60);
    if (!entry) return;
    setSearchHistory((current) => {
      const identity = entry.toLocaleLowerCase("zh-CN");
      const entries = [entry, ...current[targetMode].filter((candidate) => candidate.toLocaleLowerCase("zh-CN") !== identity)].slice(0, 3);
      const next = { ...current, [targetMode]: entries };
      saveFabricatorSearchHistory(next);
      return next;
    });
  };
  const clearSearchHistory = () => {
    setSearchHistory((current) => {
      const next = { ...current, [mode]: [] };
      saveFabricatorSearchHistory(next);
      return next;
    });
    setSearchHistoryOpen(false);
  };
  const useRecentSearch = (entry: string) => {
    setQuery(entry);
    setFocusedHandcraftItemId(null);
    rememberSearch(mode, entry);
    setSearchHistoryOpen(false);
  };
  const focusHandcraftItem = (itemId: ItemId) => {
    setMode("items");
    setBatches(1);
    setQuery(getItem(itemId).name);
    setFocusedHandcraftItemId(itemId);
    setSearchHistoryOpen(false);
  };
  useEffect(() => {
    if (mode !== "items" || !focusedHandcraftItemId) return;
    const frame = window.requestAnimationFrame(() => {
      const row = listRef.current?.querySelector<HTMLElement>(`[data-output-item="${focusedHandcraftItemId}"]`);
      row?.scrollIntoView({ block: "center" });
      row?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusedHandcraftItemId, mode, query]);
  return (
    <div className="fabricator-workspace">
      <div className="fabricator-sticky-tools">
        <div className="fabricator-topbar">
          <div className="fabricator-mode segmented-control" aria-label="基础制造模式">
            <button className={mode === "construction" ? "active" : ""} type="button" onClick={() => { setMode("construction"); setQuery(""); setFocusedHandcraftItemId(null); setSearchHistoryOpen(false); }}>建筑制造</button>
            <button className={mode === "items" ? "active" : ""} type="button" onClick={() => { setMode("items"); setQuery(""); setFocusedHandcraftItemId(null); setSearchHistoryOpen(false); }}>物品手工</button>
          </div>
          <div className="fabricator-view" role="group" aria-label="制造列表视图">
            <button className={view === "compact" ? "active" : ""} type="button" onClick={() => setView("compact")} title="精简网格" aria-label="精简网格"><LayoutGrid size={14} /></button>
            <button className={view === "detail" ? "active" : ""} type="button" onClick={() => setView("detail")} title="详细列表" aria-label="详细列表"><Rows3 size={14} /></button>
          </div>
        </div>
        <div className="handcraft-tools">
            <div
              className="handcraft-search"
              onBlur={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                rememberSearch(mode, query);
                setSearchHistoryOpen(false);
              }}
            >
              <label><Search size={13} /><input
                value={query}
                maxLength={60}
                autoComplete="off"
                aria-expanded={searchHistoryOpen && recentSearches.length > 0}
                aria-controls={searchHistoryOpen && recentSearches.length > 0 ? searchHistoryId : undefined}
                onFocus={() => setSearchHistoryOpen(true)}
                onClick={() => setSearchHistoryOpen(true)}
                onChange={(event) => { setQuery(event.target.value); setFocusedHandcraftItemId(null); setSearchHistoryOpen(false); }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                    rememberSearch(mode, query);
                    setSearchHistoryOpen(false);
                  } else if (event.key === "Escape") {
                    setSearchHistoryOpen(false);
                  }
                }}
                placeholder={mode === "items" ? "搜索物品、原料或设备" : "搜索建筑或材料"}
                aria-label={mode === "items" ? "搜索手工配方" : "搜索建筑制造"}
              /></label>
              {searchHistoryOpen && recentSearches.length > 0 ? <div className="fabricator-search-history" id={searchHistoryId} aria-label={mode === "items" ? "物品手工最近搜索" : "建筑制造最近搜索"}>
                <header><History size={12} /><span>最近搜索</span><button type="button" onClick={clearSearchHistory} title="清除最近搜索" aria-label={mode === "items" ? "清除物品手工搜索历史" : "清除建筑制造搜索历史"}><Trash2 size={12} /></button></header>
                <div className="fabricator-search-history-options">
                  {recentSearches.map((entry) => <button type="button" key={entry} onClick={() => useRecentSearch(entry)} title={`搜索${entry}`}><History size={11} /><span>{entry}</span></button>)}
                </div>
              </div> : null}
            </div>
            {mode === "items" ? <div className="handcraft-batches" aria-label="手工制造批量">
              {([1, 5, 10] as const).map((count) => <button className={batches === count ? "active" : ""} type="button" key={count} onClick={() => setBatches(count)}>×{count}</button>)}
            </div> : null}
        </div>
      </div>
      {mode === "items" && game.handcraftQueue.length > 0 ? <section className="handcraft-queue" aria-label="手工制造队列">
        <header><ListChecks size={14} /><span>手工制造队列</span><strong>{game.handcraftQueue.length}/20</strong></header>
        <div>{game.handcraftQueue.map((entry, index) => {
          const recipe = getRecipe(entry.recipeId);
          if (!recipe) return null;
          const output = recipe.outputs[0];
          const waitingForPlanet = entry.planetId !== game.activePlanetId;
          const hasInputs = recipe.inputs.every((input) => (game.tray[input.itemId] ?? 0) >= input.amount);
          return <article className={index === 0 && !waitingForPlanet && hasInputs ? "handcraft-queue-row handcraft-queue-row--active" : "handcraft-queue-row"} key={entry.id}>
            <ItemMark itemId={output.itemId} /><span><strong>{getItem(output.itemId).name}</strong><small>{entry.batchesRemaining}/{entry.batchesTotal} 批 · {waitingForPlanet ? "等待行星" : hasInputs ? "生产中" : "等待原料"}</small><i role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(entry.progress * 100)}><b style={{ width: `${entry.progress * 100}%` }} /></i></span><button type="button" onClick={() => onCancelCraftQueue(entry.id)} title="取消手工队列" aria-label={`取消${getItem(output.itemId).name}手工队列`}><X size={13} /></button>
          </article>;
        })}</div>
      </section> : null}
      <div ref={listRef} className={`fabricator-list${mode === "items" ? " fabricator-list--items" : ""}${view === "compact" ? " fabricator-list--compact" : ""}`}>
      {mode === "construction" ? constructionDefinitions.map((definition) => {
        const unlocked = !definition.requiredTechId || isTechnologyCompleted(game, definition.requiredTechId);
        const available = canCraftConstruction(game, definition.buildingId);
        return (
          <article className="fabricator-row" key={definition.buildingId}>
            <header>
              <i>{isConveyorBeltId(definition.buildingId) ? <Layers3 size={16} /> : <Hammer size={16} />}</i>
              <div><strong>{definition.name}</strong><span>产出 ×{definition.outputAmount}</span></div>
              <button type="button" disabled={!available} onClick={() => onCraft(definition.buildingId)} title={`制造${definition.name}`}>
                {unlocked ? <Wrench size={15} /> : <LockKeyhole size={15} />} {unlocked ? "制造" : "锁定"}
              </button>
            </header>
            {!unlocked && definition.requiredTechId ? (
              <div className="fabricator-lock"><LockKeyhole size={11} /> {getTechnology(definition.requiredTechId)?.name}</div>
            ) : null}
            <div className="fabricator-costs">
              {definition.costs.map((cost) => {
                const current = game.tray[cost.itemId] ?? 0;
                if (current >= cost.amount) return <span className="cost cost--ready" key={cost.itemId}><ItemMark itemId={cost.itemId} /> {formatAmount(current)}/{cost.amount}</span>;
                return <button className="cost cost--missing-link" type="button" key={cost.itemId} onClick={() => focusHandcraftItem(cost.itemId)} title={`转到${getItem(cost.itemId).name}手工制造`} aria-label={`手工制造${getItem(cost.itemId).name}`}><ItemMark itemId={cost.itemId} /> {formatAmount(current)}/{cost.amount}</button>;
              })}
            </div>
          </article>
        );
      }) : handcraftRecipes.map((recipe) => {
        const output = recipe.outputs[0];
        const unlocked = !recipe.requiredTechId || isTechnologyCompleted(game, recipe.requiredTechId);
        const available = canHandcraftRecipe(game, recipe.id, batches);
        return (
          <article className={`fabricator-row handcraft-row${focusedHandcraftItemId === output.itemId ? " fabricator-row--focused" : ""}`} data-output-item={output.itemId} tabIndex={-1} key={recipe.id}>
            <header>
              <ItemMark itemId={output.itemId} />
              <div><strong>{getItem(output.itemId).name}</strong><span>{getBuilding(recipe.buildingId).shortName} · {recipe.duration}s · 单批 ×{output.amount}</span></div>
              <div className="handcraft-actions">
                <button type="button" disabled={!available} onClick={() => onCraftItem(recipe.id, batches)} title={`立即手工制造${getItem(output.itemId).name}`}>
                  {unlocked ? <Hammer size={14} /> : <LockKeyhole size={14} />} {unlocked ? `制作 ×${output.amount * batches}` : "锁定"}
                </button>
                <button type="button" disabled={!canQueueHandcraftRecipe(game, recipe.id)} onClick={() => onQueueCraftItem(recipe.id, batches)} title={`加入${getItem(output.itemId).name}手工队列`} aria-label={`排队制造${getItem(output.itemId).name}`}><ListPlus size={14} /></button>
              </div>
            </header>
            {!unlocked && recipe.requiredTechId ? <div className="fabricator-lock"><LockKeyhole size={11} /> {getTechnology(recipe.requiredTechId)?.name}</div> : null}
            <div className="fabricator-costs">
              {recipe.inputs.map((input) => {
                const current = Math.floor(game.tray[input.itemId] ?? 0);
                const required = input.amount * batches;
                if (current < required && handcraftOutputItemIds.has(input.itemId)) {
                  return <button className="cost cost--missing-link" type="button" key={input.itemId} onClick={() => focusHandcraftItem(input.itemId)} title={`转到${getItem(input.itemId).name}手工制造`} aria-label={`手工制造${getItem(input.itemId).name}`}><ItemMark itemId={input.itemId} /> {formatAmount(current)}/{required}</button>;
                }
                return <span className={current >= required ? "cost cost--ready" : "cost"} key={input.itemId}><ItemMark itemId={input.itemId} /> {formatAmount(current)}/{required}</span>;
              })}
            </div>
          </article>
        );
      })}
      {mode === "construction" && constructionDefinitions.length === 0 ? <div className="fabricator-empty">没有符合条件的建筑</div> : null}
      {mode === "items" && handcraftRecipes.length === 0 ? <div className="fabricator-empty">没有符合条件的手工配方</div> : null}
      </div>
    </div>
  );
}

export function InspectorPanel(props: InspectorPanelProps) {
  return (
    <aside className="inspector-panel">
      <div className="panel-tabs" role="tablist" aria-label="节点与制造视图">
        <button role="tab" aria-selected={props.tab === "inspect"} className={props.tab === "inspect" ? "active" : ""} type="button" onClick={() => props.onTabChange("inspect")}>
          <CircuitBoard size={15} /> 检查器
        </button>
        <button role="tab" aria-selected={props.tab === "fabricate"} className={props.tab === "fabricate" ? "active" : ""} type="button" onClick={() => props.onTabChange("fabricate")}>
          <Wrench size={15} /> 基础制造
        </button>
      </div>
      {props.tab === "fabricate" ? <Fabricator game={props.game} onCraft={props.onCraft} onCraftItem={props.onCraftItem} onQueueCraftItem={props.onQueueCraftItem} onCancelCraftQueue={props.onCancelCraftQueue} /> : props.selectedEntities.length > 1 ? (
        <MultiSelectionInspector game={props.game} entities={props.selectedEntities} onRecipeChange={props.onBatchRecipeChange} onInstallSprayCoater={props.onBatchInstallSprayCoater} onProliferatorConfiguration={props.onBatchProliferatorConfiguration} />
      ) : props.selectedEntity ? (
         <EntityInspector game={props.game} entity={props.selectedEntity} onRecipeChange={props.onRecipeChange} onLogisticsItemChange={props.onLogisticsItemChange} onFuelChange={props.onFuelChange} onEnergyModeChange={props.onEnergyModeChange} onPowerGridChange={props.onPowerGridChange} onPowerPriorityChange={props.onPowerPriorityChange} onGenerationPriorityChange={props.onGenerationPriorityChange} onStationModeChange={props.onStationModeChange} onStationVesselAdjust={props.onStationVesselAdjust} onStationDroneAdjust={props.onStationDroneAdjust} onStationWarperAdjust={props.onStationWarperAdjust} onStationWarpEnabled={props.onStationWarpEnabled} onStationMinimumLoadChange={props.onStationMinimumLoadChange} onStationSlotItemChange={props.onStationSlotItemChange} onStationSlotModeChange={props.onStationSlotModeChange} onStationSlotMinimumLoadChange={props.onStationSlotMinimumLoadChange} onStationSlotLimitsChange={props.onStationSlotLimitsChange} onStationSlotPriorityChange={props.onStationSlotPriorityChange} onSplitterModeChange={props.onSplitterModeChange} onInstallSprayCoater={props.onInstallSprayCoater} onProliferatorConfiguration={props.onProliferatorConfiguration} onAdd={props.onAddEntity} onUpgrade={props.onUpgradeEntity} onRemove={props.onRemoveEntity} />
      ) : props.selectedBelt ? (
        <BeltInspector game={props.game} belt={props.selectedBelt} hasCopiedConfiguration={props.hasCopiedBeltConfiguration} focused={props.focusedBeltNetworkId === props.selectedBelt.id} onPriorityChange={props.onBeltPriorityChange} onStackSizeChange={props.onBeltStackSizeChange} onMonitorChange={props.onBeltMonitorChange} onRouteModeChange={props.onBeltRouteModeChange} onRouteOffsetChange={props.onBeltRouteOffsetChange} onApplyConfigurationToNetwork={props.onApplyBeltConfigurationToNetwork} onFocusNetwork={props.onFocusBeltNetwork} onUpgrade={props.onUpgradeBelt} onSorterUpgrade={props.onUpgradeSorter} onUpgradeNetwork={props.onUpgradeBeltNetwork} onSorterUpgradeNetwork={props.onUpgradeSorterNetwork} onCopyConfiguration={props.onCopyBeltConfiguration} onPasteConfiguration={props.onPasteBeltConfiguration} onRemove={props.onRemoveBelt} onRemoveNetwork={props.onRemoveBeltNetwork} />
      ) : <InspectorEmpty game={props.game} />}
    </aside>
  );
}

const BUILD_ORDER: Array<BuildingId | ConveyorBeltId> = [
  "wind_turbine",
  "solar_panel",
  "geothermal_power_station",
  "thermal_power_plant",
  "mini_fusion_power_plant",
  "artificial_star",
  "accumulator",
  "energy_exchanger",
  "mining_machine",
  "arc_smelter",
  "plane_smelter",
  "assembling_machine_mk1",
  "assembling_machine_mk2",
  "assembling_machine_mk3",
  "matrix_lab",
  "conveyor_belt_mk1",
  "conveyor_belt_mk2",
  "conveyor_belt_mk3",
  "storage_mk1",
  "splitter_4way",
  "storage_tank",
  "oil_extractor",
  "oil_refinery",
  "water_pump",
  "chemical_plant",
  "quantum_chemical_plant",
  "fractionator",
  "miniature_particle_collider",
  "em_rail_ejector",
  "vertical_launching_silo",
  "ray_receiver",
  "planetary_logistics_station",
  "interstellar_logistics_station",
  "orbital_collector",
];

function buildIcon(id: BuildingId | ConveyorBeltId) {
  if (id === "wind_turbine") return <Wind size={18} />;
  if (id === "solar_panel") return <Sun size={18} />;
  if (id === "geothermal_power_station") return <ThermometerSun size={18} />;
  if (id === "thermal_power_plant") return <Flame size={18} />;
  if (id === "mini_fusion_power_plant") return <Atom size={18} />;
  if (id === "artificial_star") return <Sun size={18} />;
  if (id === "accumulator") return <BatteryFull size={18} />;
  if (id === "energy_exchanger") return <BatteryCharging size={18} />;
  if (id === "mining_machine") return <Pickaxe size={18} />;
  if (id === "matrix_lab") return <FlaskConical size={18} />;
  if (id === "storage_mk1") return <Database size={18} />;
  if (id === "storage_tank" || id === "oil_extractor" || id === "water_pump") return <Droplets size={18} />;
  if (id === "fractionator") return <Droplets size={18} />;
  if (id === "splitter_4way") return <GitFork size={18} />;
  if (id === "miniature_particle_collider") return <Atom size={18} />;
  if (id === "em_rail_ejector") return <Satellite size={18} />;
  if (id === "vertical_launching_silo") return <Rocket size={18} />;
  if (id === "ray_receiver") return <RadioTower size={18} />;
  if (id === "planetary_logistics_station" || id === "interstellar_logistics_station" || id === "orbital_collector") return <Orbit size={18} />;
  if (isConveyorBeltId(id)) return <Layers3 size={18} />;
  return <Factory size={18} />;
}

interface ConstructionDockProps {
  game: GameState;
  placement: BuildingId | null;
  beltTier: BeltTier;
  placementCount: PlacementCount;
  onPlacementChange: (buildingId: BuildingId | null) => void;
  onBeltTierChange: (tier: BeltTier) => void;
  onPlacementCountChange: (count: PlacementCount) => void;
  onOpenFabricator: () => void;
  onCraft: (buildingId: ConstructionId) => void;
  onCraftItem: (recipeId: RecipeId) => void;
  onStowCargo: () => void;
}

const PLACEMENT_COUNTS: PlacementCount[] = [1, 2, 5, 10];

type ConstructionCategory = "all" | "recent" | "power" | "production" | "logistics" | "dyson";

const RECENT_CONSTRUCTION_KEY = "dsp-idle-network.recent-construction.v1";
const COMPACT_CONSTRUCTION_KEY = "dsp-idle-network.construction-compact.v1";

function loadRecentConstruction(): Array<BuildingId | ConveyorBeltId> {
  try {
    const value = JSON.parse(window.localStorage.getItem(RECENT_CONSTRUCTION_KEY) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter((id): id is BuildingId | ConveyorBeltId => typeof id === "string" && BUILD_ORDER.includes(id as BuildingId | ConveyorBeltId)).slice(0, 8) : [];
  } catch {
    return [];
  }
}

function loadCompactConstruction(): boolean {
  try {
    return window.localStorage.getItem(COMPACT_CONSTRUCTION_KEY) === "true";
  } catch {
    return false;
  }
}

const CONSTRUCTION_CATEGORY_IDS: Record<Exclude<ConstructionCategory, "all" | "recent">, Set<BuildingId | ConveyorBeltId>> = {
  power: new Set(["wind_turbine", "solar_panel", "geothermal_power_station", "thermal_power_plant", "mini_fusion_power_plant", "artificial_star", "accumulator", "energy_exchanger"]),
  production: new Set(["mining_machine", "arc_smelter", "plane_smelter", "assembling_machine_mk1", "assembling_machine_mk2", "assembling_machine_mk3", "matrix_lab", "oil_extractor", "oil_refinery", "water_pump", "chemical_plant", "quantum_chemical_plant", "fractionator", "miniature_particle_collider"]),
  logistics: new Set(["conveyor_belt_mk1", "conveyor_belt_mk2", "conveyor_belt_mk3", "storage_mk1", "splitter_4way", "storage_tank", "planetary_logistics_station", "interstellar_logistics_station", "orbital_collector"]),
  dyson: new Set(["em_rail_ejector", "vertical_launching_silo", "ray_receiver"]),
};

export function ConstructionDock({ game, placement, beltTier, placementCount, onPlacementChange, onBeltTierChange, onPlacementCountChange, onOpenFabricator, onCraft, onCraftItem, onStowCargo }: ConstructionDockProps) {
  const [category, setCategory] = useState<ConstructionCategory>("all");
  const [recent, setRecent] = useState<Array<BuildingId | ConveyorBeltId>>(loadRecentConstruction);
  const [compact, setCompact] = useState(loadCompactConstruction);
  const horizontalPan = useHorizontalPan<HTMLDivElement>();
  const unlockedBuildOrder = BUILD_ORDER.filter((id) => {
    if ((game.construction[id] ?? 0) > 0) return true;
    if (isConveyorBeltId(id) && game.belts.some((belt) => belt.tier === getBeltTier(id))) return true;
    if (id === "mining_machine" && game.entities.some((entity) => entity.minerCount > 0)) return true;
    if (!isConveyorBeltId(id) && game.entities.some((entity) => entity.buildingId === id)) return true;
    const requiredTechId = getConstructionDefinition(id)?.requiredTechId;
    return !requiredTechId || isTechnologyCompleted(game, requiredTechId);
  });
  const visibleBuildOrder = category === "all"
    ? unlockedBuildOrder
    : category === "recent"
      ? recent.filter((id) => unlockedBuildOrder.includes(id))
      : unlockedBuildOrder.filter((id) => CONSTRUCTION_CATEGORY_IDS[category].has(id));
  const visibleFleetItems = category === "all" || category === "logistics"
    ? PORTABLE_FLEET_ITEM_IDS.filter((itemId) => {
        const recipe = getRecipe(itemId);
        return (game.portableFleet?.[itemId] ?? 0) > 0 || !recipe?.requiredTechId || isTechnologyCompleted(game, recipe.requiredTechId);
      })
    : [];
  const remember = (id: BuildingId | ConveyorBeltId) => {
    setRecent((current) => {
      const next = [id, ...current.filter((candidate) => candidate !== id)].slice(0, 8);
      try { window.localStorage.setItem(RECENT_CONSTRUCTION_KEY, JSON.stringify(next)); } catch { /* optional convenience state */ }
      return next;
    });
  };
  const toggleCompact = () => {
    setCompact((current) => {
      const next = !current;
      try { window.localStorage.setItem(COMPACT_CONSTRUCTION_KEY, String(next)); } catch { /* optional convenience state */ }
      return next;
    });
  };
  return (
    <footer className={`construction-dock${compact ? " construction-dock--compact" : ""}`}>
      <div className="dock-label">
        <div className="dock-summary">
          <span>施工托盘</span>
          <strong>{Object.values(game.construction).reduce((sum, amount) => sum + (amount ?? 0), 0) + Object.values(game.portableFleet ?? {}).reduce((sum, amount) => sum + (amount ?? 0), 0)}</strong>
        </div>
        <select className="dock-category-select" value={category} onChange={(event) => setCategory(event.target.value as ConstructionCategory)} aria-label="施工托盘分类">
          <option value="all">全部设备</option>
          <option value="recent" disabled={recent.length === 0}>最近使用</option>
          <option value="power">能源</option>
          <option value="production">生产</option>
          <option value="logistics">物流</option>
          <option value="dyson">戴森工程</option>
        </select>
        <button className="dock-compact-toggle" type="button" aria-pressed={compact} onClick={toggleCompact} title={compact ? "恢复标准施工托盘" : "使用两行精简施工托盘"} aria-label={compact ? "关闭施工托盘精简模式" : "开启施工托盘精简模式"}>{compact ? <Rows3 size={12} /> : <LayoutGrid size={12} />}<span>{compact ? "标准" : "精简"}</span></button>
        <div className="placement-count" aria-label="批量部署数量">
          {PLACEMENT_COUNTS.map((count) => (
            <button className={placementCount === count ? "active" : ""} type="button" key={count} aria-pressed={placementCount === count} onClick={() => onPlacementCountChange(count)}>×{count}</button>
          ))}
        </div>
      </div>
      <div className={`construction-items${horizontalPan.isPanning ? " horizontal-pan--active" : ""}`} {...horizontalPan.bindings}>
        {visibleBuildOrder.map((id) => {
          const count = game.construction[id] ?? 0;
          const isBelt = isConveyorBeltId(id);
          const itemBeltTier = isBelt ? getBeltTier(id) : null;
          const active = isBelt ? beltTier === itemBeltTier : placement === id;
          const label = isBelt ? `传送带 Mk.${beltTierRoman(itemBeltTier!)}` : getBuilding(id).name;
          const requiredCount = isBelt ? 1 : placementCount;
          const activePlanet = getPlanet(game.activePlanetId);
          const compatiblePlanet = isBelt ? activePlanet.kind !== "gas-giant" : canPlaceBuildingOnPlanet(id, game.activePlanetId);
          const craftable = canCraftConstruction(game, id);
          const craftDeficits = craftable ? null : getConstructionCraftDeficits(game, id);
          const craftHint = craftable
            ? `制造${label}`
            : [
                craftDeficits?.missingTechnology ? `科技：${craftDeficits.missingTechnology}` : null,
                ...(craftDeficits?.missingItems.map((item) => `${getItem(item.itemId).name} ${item.current}/${item.required}（缺 ${item.missing}）`) ?? []),
              ].filter(Boolean).join(" · ") || `无法制造${label}`;
          return (
            <div className={`construction-item-shell${active ? " construction-item-shell--active" : ""}`} key={id}>
              <button
                className={`construction-item${active ? " construction-item--active" : ""}`}
                type="button"
                disabled={count < requiredCount || !compatiblePlanet}
                draggable={count >= requiredCount && compatiblePlanet && !isBelt}
                onClick={() => {
                  if (count < requiredCount || !compatiblePlanet) return;
                  remember(id);
                  if (isBelt) {
                    onBeltTierChange(itemBeltTier!);
                    onPlacementChange(null);
                  } else {
                    onPlacementChange(active ? null : id);
                  }
                }}
                onDragStart={(event) => {
                  if (isBelt) return;
                  event.dataTransfer.setData("application/factory-building", id);
                  event.dataTransfer.effectAllowed = "move";
                  onPlacementChange(id);
                }}
                onDragEnd={() => onPlacementChange(null)}
                title={!compatiblePlanet ? id === "geothermal_power_station" ? `${label}只能部署在烬原 II` : activePlanet.kind === "gas-giant" ? `${label}不能部署在气态巨星` : `${label}只能部署在气态巨星` : isBelt ? `选择${label}连接节点端口` : `部署${label}${placementCount > 1 ? ` ×${placementCount}` : ""}`}
              >
                <i>{buildIcon(id)}</i>
                <span>{label}</span>
                <strong>×{count}</strong>
              </button>
              <button
                className="construction-item-craft"
                type="button"
                disabled={!craftable}
                onClick={() => onCraft(id)}
                title={craftHint}
                aria-label={`制造${label}`}
              ><Hammer size={12} /></button>
            </div>
          );
        })}
        {visibleFleetItems.map((itemId: PortableFleetItemId) => {
          const item = getItem(itemId);
          const recipe = getRecipe(itemId)!;
          const count = Math.max(0, Math.floor(game.portableFleet?.[itemId] ?? 0));
          const cargoReady = game.cargo?.itemId === itemId;
          const craftable = canHandcraftRecipe(game, recipe.id, 1);
          const missingTechnology = recipe.requiredTechId && !isTechnologyCompleted(game, recipe.requiredTechId)
            ? getTechnology(recipe.requiredTechId)?.name
            : null;
          const missingItems = recipe.inputs.flatMap((input) => {
            const current = Math.floor(game.tray[input.itemId] ?? 0);
            return current < input.amount ? [`${getItem(input.itemId).name} ${current}/${input.amount}（缺 ${input.amount - current}）`] : [];
          });
          const craftHint = craftable ? `制造${item.name}` : [missingTechnology ? `科技：${missingTechnology}` : null, ...missingItems].filter(Boolean).join(" · ") || `无法制造${item.name}`;
          return <div className={`construction-item-shell construction-item-shell--fleet${cargoReady ? " construction-item-shell--fleet-ready" : ""}`} key={itemId}>
            <button className={`construction-item construction-item--fleet${cargoReady ? " construction-item--fleet-ready" : ""}`} type="button" onClick={() => { if (cargoReady) onStowCargo(); }} title={cargoReady ? `将手中的${item.name}放入随身载具栏` : `${item.name}随玩家跨星球携带，可在物流站检查器中装载`} aria-label={`随身${item.name}，当前 ${count}`}>
              <i>{itemId === "logistics_vessel" ? <Rocket size={18} /> : <Orbit size={18} />}</i>
              <span>{item.name}</span>
              <strong>×{count}</strong>
            </button>
            <button className="construction-item-craft" type="button" disabled={!craftable} onClick={() => onCraftItem(recipe.id)} title={craftHint} aria-label={`制造${item.name}`}><Hammer size={12} /></button>
          </div>;
        })}
      </div>
      <button className="fabricator-command" type="button" onClick={onOpenFabricator} title="打开基础制造">
        <Wrench size={18} />
        <span>基础制造</span>
      </button>
    </footer>
  );
}

export function CargoCursor({ cargo, x, y }: { cargo: CargoStack | null; x: number; y: number }) {
  if (!cargo) return null;
  const item = getItem(cargo.itemId);
  return (
    <div className="cargo-cursor" style={{ transform: `translate3d(${x + 16}px, ${y + 16}px, 0)` }}>
      <ItemGlyph itemId={cargo.itemId} />
      <span>{item.name}</span>
      <strong>×{formatAmount(cargo.amount)}</strong>
    </div>
  );
}

export function BuildingPlacementCursor({ buildingId, count, x, y }: {
  buildingId: BuildingId | null;
  count: PlacementCount;
  x: number;
  y: number;
}) {
  if (!buildingId) return null;
  const building = getBuilding(buildingId);
  const previewTiles = Array.from({ length: count }, (_, index) => index);
  return (
    <div className="building-placement-cursor" style={{ transform: `translate3d(${x + 16}px, ${y + 16}px, 0)` }}>
      <div className="building-placement-array" aria-hidden="true">
        {previewTiles.map((index) => <i key={index}>{buildIcon(buildingId)}</i>)}
      </div>
      <span>{building.name}</span>
      <strong>阵列 ×{count}</strong>
    </div>
  );
}

export function HeaderControls({
  game,
  onReturnToMenu,
  onPauseToggle,
  onReset,
  onOpenResources,
  onOpenInspector,
  onOpenRecipes,
  onOpenTechnology,
  onOpenStatistics,
  onOpenStarMap,
  onOpenSettings,
  onOpenGalaxy,
  onOpenCampaign,
  onOpenCommandPalette,
}: {
  game: GameState;
  onReturnToMenu: () => void;
  onPauseToggle: () => void;
  onReset: () => void;
  onOpenResources: () => void;
  onOpenInspector: () => void;
  onOpenRecipes: () => void;
  onOpenTechnology: () => void;
  onOpenStatistics: () => void;
  onOpenStarMap: () => void;
  onOpenSettings: () => void;
  onOpenGalaxy: () => void;
  onOpenCampaign: () => void;
  onOpenCommandPalette: () => void;
}) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const powerTone = game.metrics.powerFactor >= 0.999 ? "positive" : game.metrics.powerFactor > 0 ? "warning" : "negative";
  const runOverflowAction = (action: () => void) => {
    setOverflowOpen(false);
    action();
  };
  return (
    <header className="game-header">
      <div className="brand-lockup">
        <i><Power size={21} /></i>
        <div><strong>DSP极简网络</strong></div>
      </div>
      <div className="header-metrics">
        <div><Zap size={16} /><span>电网负载</span><strong>{game.metrics.demandKw.toFixed(0)}<small>/{game.metrics.generationKw.toFixed(0)} kW</small></strong></div>
        <div className={`metric-tone metric-tone--${powerTone}`}><Power size={16} /><span>供电效率</span><strong>{Math.round(game.metrics.powerFactor * 100)}<small>%</small></strong></div>
        <div><Factory size={16} /><span>生产通量</span><strong>{game.metrics.totalItemsPerMinute.toFixed(1)}<small>/min</small></strong></div>
        <div><FlaskConical size={16} /><span>蓝 / 红 / 黄 / 紫 / 绿 / 白矩阵</span><strong>{formatAmount(game.totalProduced.electromagnetic_matrix ?? 0)}<small> / {formatAmount(game.totalProduced.energy_matrix ?? 0)} / {formatAmount(game.totalProduced.structure_matrix ?? 0)} / {formatAmount(game.totalProduced.information_matrix ?? 0)} / {formatAmount(game.totalProduced.gravity_matrix ?? 0)} / {formatAmount(game.totalProduced.universe_matrix ?? 0)}</small></strong></div>
      </div>
      <div className="header-actions">
        <button className="header-action--overflowable" type="button" onClick={onReturnToMenu} title="保存并返回主菜单" aria-label="保存并返回主菜单"><House size={17} /></button>
        <button className="header-action--overflowable header-settings-command" type="button" onClick={onOpenSettings} title="打开设置" aria-label="打开设置">
          <Settings size={17} />
        </button>
        <button className="header-action--overflowable" type="button" onClick={onOpenGalaxy} title="打开银河网络" aria-label="打开银河网络"><Globe2 size={17} /></button>
        <button className="header-action--overflowable" type="button" onClick={onOpenCampaign} title="打开主线任务中心" aria-label="打开主线任务中心"><Flag size={17} /></button>
        <button className="header-action--overflowable" type="button" onClick={onOpenStarMap} title="打开星图" aria-label="打开星图"><Telescope size={17} /></button>
        <button className="header-action--overflowable" type="button" onClick={onOpenStatistics} title="打开生产统计" aria-label="打开生产统计"><BarChart3 size={17} /></button>
        <button className="header-action--overflowable" type="button" onClick={onOpenRecipes} title="打开配方图鉴" aria-label="打开配方图鉴"><BookOpen size={17} /></button>
        <button className="header-action--overflowable" type="button" onClick={onOpenTechnology} title="打开科技树" aria-label="打开科技树"><FlaskConical size={17} /></button>
        <button className="header-action--overflowable header-command-action" type="button" onClick={onOpenCommandPalette} title="打开命令面板（Ctrl/⌘+K）" aria-label="打开命令面板" aria-keyshortcuts="Control+K Meta+K"><Command size={17} /></button>
        <button className="header-overflow-command" type="button" onClick={() => setOverflowOpen((open) => !open)} aria-expanded={overflowOpen} title="更多工作区" aria-label="更多工作区"><MoreHorizontal size={18} /></button>
        {overflowOpen ? <div className="header-overflow-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => runOverflowAction(onReturnToMenu)}><House size={15} />主菜单</button>
          <button type="button" role="menuitem" onClick={() => runOverflowAction(onOpenSettings)}><Settings size={15} />设置</button>
          <button type="button" role="menuitem" onClick={() => runOverflowAction(onOpenGalaxy)}><Globe2 size={15} />银河网络</button>
          <button type="button" role="menuitem" onClick={() => runOverflowAction(onOpenCampaign)}><Flag size={15} />主线任务</button>
          <button type="button" role="menuitem" onClick={() => runOverflowAction(onOpenStarMap)}><Telescope size={15} />星图</button>
          <button type="button" role="menuitem" onClick={() => runOverflowAction(onOpenStatistics)}><BarChart3 size={15} />生产统计</button>
          <button type="button" role="menuitem" onClick={() => runOverflowAction(onOpenRecipes)}><BookOpen size={15} />配方图鉴</button>
          <button type="button" role="menuitem" onClick={() => runOverflowAction(onOpenTechnology)}><FlaskConical size={15} />科技树</button>
        </div> : null}
        <button className="mobile-toggle" type="button" onClick={onOpenResources} title="物资托盘" aria-label="打开物资托盘"><PackageOpen size={17} /></button>
        <button className="mobile-toggle" type="button" onClick={onOpenInspector} title="检查器" aria-label="打开检查器"><PanelRight size={17} /></button>
        <button type="button" onClick={onPauseToggle} title={`${game.paused ? "继续模拟" : "暂停模拟"}（Space）`} aria-label={game.paused ? "继续模拟" : "暂停模拟"} aria-keyshortcuts="Space">
          {game.paused ? <Play size={17} /> : <Pause size={17} />}
        </button>
        <button type="button" onClick={onReset} title="重置当前工厂" aria-label="重置当前工厂"><Trash2 size={17} /></button>
      </div>
    </header>
  );
}
