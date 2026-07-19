import {
  Atom,
  ArrowUp,
  BarChart3,
  BatteryCharging,
  BatteryFull,
  BookOpen,
  Box,
  Check,
  ChevronRight,
  CircuitBoard,
  Database,
  Droplets,
  Factory,
  Flame,
  FlaskConical,
  Hammer,
  GitFork,
  Layers3,
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
  Rocket,
  Satellite,
  Search,
  Sparkles,
  Sun,
  ThermometerSun,
  LockKeyhole,
  Trash2,
  Wind,
  Wrench,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { ItemHoverCard } from "./ItemReference";
import { CONSTRUCTION, FUEL_ENERGY_MJ, ITEMS, PLANET_LIST, RECIPES_BY_BUILDING, getBeltConstructionId, getBeltTier, getBuilding, getBuildingUpgradeTarget, getConstructionDefinition, getExtractorBuildingId, getFuelItemIdsForBuilding, getItem, getPlanet, getProliferator, getRecipe, getRecipesForBuilding, getSorterConstructionId, getTechnology, isConveyorBeltId } from "../game/content";
import { DYSON_SHELL_CAPACITY_PER_STRUCTURE, RAY_RECEIVER_CAPACITY_KW, canCraftConstruction, canHandcraftRecipe, canInstallSprayCoater, canPlaceBuildingOnPlanet, canUpgradeBelt, canUpgradeEntity, canUpgradeSorter, findInterstellarPeer, findPlanetaryPeer, getBeltCapacity, getEntityExtraProductBonus, getEntityOperatingStatus, getEntityProliferatorPowerMultiplier, getEntityProliferatorSpeedMultiplier, getMiningSpeedMultiplier, getPlanetMetrics, getProliferatorSprayCost, getSorterCapacity, getStationDroneCapacity, getStationMinimumCargo, getStationMinimumLoad, getStationVesselCapacity, getStationWarperCapacity, isProliferatorEligible, isTechnologyCompleted, stationRouteRequiresWarp } from "../game/engine";
import type {
  BeltTier,
  BeltConnection,
  BuildingId,
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
  ProliferatorMode,
  ProliferatorTier,
  RecipeId,
  SorterTier,
  StationMinimumLoad,
} from "../game/types";

function formatAmount(value: number): string {
  return Math.floor(value).toLocaleString("zh-CN");
}

function ItemMark({ itemId }: { itemId: ItemId }) {
  const item = getItem(itemId);
  return <ItemHoverCard itemId={itemId}><i className="item-mark" style={{ backgroundColor: item.color }}>{item.symbol}</i></ItemHoverCard>;
}

interface ResourceRailProps {
  game: GameState;
  onPickTray: (itemId: ItemId) => void;
  onDropCargo: () => void;
  onDropDraggedItem: (itemId: ItemId, sourceKind: DraggedItemSourceKind, sourceId?: string) => void;
}

export function ResourceRail({ game, onPickTray, onDropCargo, onDropDraggedItem }: ResourceRailProps) {
  const [dragOver, setDragOver] = useState(false);
  const trayItems = (Object.entries(game.tray) as Array<[ItemId, number]>)
    .filter(([, amount]) => amount > 0.001)
    .sort((a, b) => b[1] - a[1]);
  const hasMiner = game.entities.some((entity) => entity.minerCount > 0);
  const hasBelt = game.belts.length > 0;
  const hasStorage = game.entities.some((entity) => entity.kind === "storage");
  const hasThermalPower = game.entities.some((entity) => entity.buildingId === "thermal_power_plant" && (entity.powerOutputKw ?? 0) > 0);
  const hasInterstellarTrip = game.entities.some((entity) => entity.kind === "station" && (entity.stationTrips ?? 0) > 0);
  const hasParticleCollider = game.entities.some((entity) => entity.buildingId === "miniature_particle_collider");
  const hasEquipmentUpgrade = game.entities.some((entity) =>
    entity.buildingId === "assembling_machine_mk2" || entity.buildingId === "assembling_machine_mk3" || entity.buildingId === "plane_smelter");
  const hasBeltUpgrade = game.belts.some((belt) => belt.tier > 1);
  const hasSorterUpgrade = game.belts.some((belt) => belt.sorterTier > 1);
  const hasPlanetaryTrip = game.entities.some((entity) => entity.buildingId === "planetary_logistics_station" && (entity.stationTrips ?? 0) > 0);
  const hasOrbitalCollector = game.entities.some((entity) => entity.buildingId === "orbital_collector");
  const hasStationWarper = game.entities.some((entity) => entity.buildingId === "interstellar_logistics_station" && (entity.stationWarpers ?? 0) > 0);
  const hasSprayCoater = game.entities.some((entity) => entity.sprayCoaterInstalled);
  const hasActiveProliferation = game.entities.some((entity) => entity.sprayCoaterInstalled && entity.proliferatorMode !== "normal");
  const objectives = [
    { label: "完成首次采集", complete: game.manualMined >= 1 },
    { label: "取得 4 个铁块", complete: (game.totalProduced.iron_ingot ?? 0) >= 4 },
    { label: "部署第一台采矿机", complete: hasMiner },
    { label: "建立自动运输线", complete: hasBelt },
    { label: "建立物流缓存", complete: hasStorage },
    { label: "启动火力发电", complete: hasThermalPower },
    { label: "产出电磁矩阵", complete: (game.totalProduced.electromagnetic_matrix ?? 0) >= 1 },
    { label: "启动原油精炼", complete: (game.totalProduced.refined_oil ?? 0) >= 1 },
    { label: "产出能量矩阵", complete: (game.totalProduced.energy_matrix ?? 0) >= 1 },
    { label: "完成首次设备升级", complete: hasEquipmentUpgrade },
    { label: "建立高速运输线", complete: hasBeltUpgrade },
    { label: "升级物流分拣器", complete: hasSorterUpgrade },
    { label: "完成行星无人机配送", complete: hasPlanetaryTrip },
    { label: "部署轨道采集器", complete: hasOrbitalCollector },
    { label: "装载空间翘曲器", complete: hasStationWarper },
    { label: "安装首台喷涂机", complete: hasSprayCoater },
    { label: "启动增产生产线", complete: hasActiveProliferation },
    { label: "产出结构矩阵", complete: (game.totalProduced.structure_matrix ?? 0) >= 1 },
    { label: "产出钛合金", complete: (game.totalProduced.titanium_alloy ?? 0) >= 1 },
    { label: "产出处理器", complete: (game.totalProduced.processor ?? 0) >= 1 },
    { label: "制造物流运输船", complete: (game.totalProduced.logistics_vessel ?? 0) >= 1 },
    { label: "完成首次星际运输", complete: hasInterstellarTrip },
    { label: "产出信息矩阵", complete: (game.totalProduced.information_matrix ?? 0) >= 1 },
    { label: "完成四色矩阵科研", complete: game.research.completedTechIds.includes("research_speed_1") },
    { label: "部署微型粒子对撞机", complete: hasParticleCollider },
    { label: "产出量子芯片", complete: (game.totalProduced.quantum_chip ?? 0) >= 1 },
    { label: "产出引力矩阵", complete: (game.totalProduced.gravity_matrix ?? 0) >= 1 },
    { label: "完成五色矩阵科研", complete: game.research.completedTechIds.includes("research_speed_2") },
    { label: "首次发射太阳帆", complete: game.dysonSwarm.totalLaunched >= 1 },
    { label: "产出临界光子", complete: (game.totalProduced.critical_photon ?? 0) >= 1 },
    { label: "制造反物质燃料棒", complete: (game.totalProduced.antimatter_fuel_rod ?? 0) >= 1 },
    { label: "产出宇宙矩阵", complete: (game.totalProduced.universe_matrix ?? 0) >= 1 },
    { label: "完成六色矩阵科研", complete: game.research.completedTechIds.includes("research_speed_3") },
    { label: "制造小型运载火箭", complete: (game.totalProduced.small_carrier_rocket ?? 0) >= 1 },
    { label: "发射首枚运载火箭", complete: game.dysonSphere.totalRocketsLaunched >= 1 },
    { label: "形成首片永久壳面", complete: game.dysonSphere.totalSailsAbsorbed >= 1 },
  ];
  const dysonGenerationKw = game.dysonSwarm.generationKw + game.dysonSphere.generationKw;
  const swarmLoad = dysonGenerationKw > 0
    ? Math.min(100, game.dysonSwarm.receiverLoadKw / dysonGenerationKw * 100)
    : 0;
  const shellCapacity = game.dysonSphere.structurePoints * DYSON_SHELL_CAPACITY_PER_STRUCTURE;

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
          <span>{game.cargo ? "手提星际载荷" : "光标载荷"}</span>
          <strong>{game.cargo ? "1 / 1" : "0 / 1"}</strong>
        </div>
        <button
          className={`cargo-slot${game.cargo ? " cargo-slot--loaded" : ""}`}
          type="button"
          aria-disabled={!game.cargo}
          onClick={onDropCargo}
          onDragOver={(event) => { if (event.dataTransfer.types.includes("application/factory-item")) event.preventDefault(); }}
          title={game.cargo ? "放入物资托盘" : "光标当前未携带物资"}
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

      <section className="rail-block objective-block">
        <div className="rail-heading">
          <span>当前里程碑</span>
          <strong>{objectives.filter((item) => item.complete).length}/{objectives.length}</strong>
        </div>
        <div className="objective-list">
          {objectives.map((objective, index) => (
            <div className={objective.complete ? "objective objective--complete" : "objective"} key={objective.label}>
              <i>{objective.complete ? <Check size={12} /> : index + 1}</i>
              <span>{objective.label}</span>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}

export function PlanetNavigator({ game, onPlanetChange }: { game: GameState; onPlanetChange: (planetId: PlanetId) => void }) {
  return (
    <nav className="planet-navigator nodrag nopan" aria-label="行星切换">
      {PLANET_LIST.map((planet) => {
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
      })}
    </nav>
  );
}

type InspectorTab = "inspect" | "fabricate";

interface InspectorPanelProps {
  game: GameState;
  selectedEntity: FactoryEntity | null;
  selectedBelt: BeltConnection | null;
  tab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  onRecipeChange: (entityId: string, recipeId: RecipeId) => void;
  onLogisticsItemChange: (entityId: string, itemId: ItemId) => void;
  onFuelChange: (entityId: string, itemId: ItemId) => void;
  onEnergyModeChange: (entityId: string, mode: EnergyMode) => void;
  onStationModeChange: (entityId: string, mode: "supply" | "demand") => void;
  onStationVesselAdjust: (entityId: string, delta: number) => void;
  onStationDroneAdjust: (entityId: string, delta: number) => void;
  onStationWarperAdjust: (entityId: string, delta: number) => void;
  onStationWarpEnabled: (entityId: string, enabled: boolean) => void;
  onStationMinimumLoadChange: (entityId: string, minimumLoad: StationMinimumLoad) => void;
  onSplitterModeChange: (entityId: string, mode: "balanced" | "priority") => void;
  onBeltPriorityChange: (beltId: string, priority: 0 | 1) => void;
  onCraft: (buildingId: ConstructionId) => void;
  onCraftItem: (recipeId: RecipeId, batches: number) => void;
  onUpgradeEntity: (entityId: string) => void;
  onUpgradeBelt: (beltId: string) => void;
  onUpgradeSorter: (beltId: string) => void;
  onInstallSprayCoater: (entityId: string) => void;
  onProliferatorConfiguration: (entityId: string, tier: ProliferatorTier, mode: ProliferatorMode) => void;
  onRemoveEntity: (entityId: string) => void;
  onRemoveBelt: (beltId: string) => void;
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

function EntityInspector({
  game,
  entity,
  onRecipeChange,
  onLogisticsItemChange,
  onFuelChange,
  onEnergyModeChange,
  onStationModeChange,
  onStationVesselAdjust,
  onStationDroneAdjust,
  onStationWarperAdjust,
  onStationWarpEnabled,
  onStationMinimumLoadChange,
  onSplitterModeChange,
  onInstallSprayCoater,
  onProliferatorConfiguration,
  onUpgrade,
  onRemove,
}: {
  game: GameState;
  entity: FactoryEntity;
  onRecipeChange: (entityId: string, recipeId: RecipeId) => void;
  onLogisticsItemChange: (entityId: string, itemId: ItemId) => void;
  onFuelChange: (entityId: string, itemId: ItemId) => void;
  onEnergyModeChange: (entityId: string, mode: EnergyMode) => void;
  onStationModeChange: (entityId: string, mode: "supply" | "demand") => void;
  onStationVesselAdjust: (entityId: string, delta: number) => void;
  onStationDroneAdjust: (entityId: string, delta: number) => void;
  onStationWarperAdjust: (entityId: string, delta: number) => void;
  onStationWarpEnabled: (entityId: string, enabled: boolean) => void;
  onStationMinimumLoadChange: (entityId: string, minimumLoad: StationMinimumLoad) => void;
  onSplitterModeChange: (entityId: string, mode: "balanced" | "priority") => void;
  onInstallSprayCoater: (entityId: string) => void;
  onProliferatorConfiguration: (entityId: string, tier: ProliferatorTier, mode: ProliferatorMode) => void;
  onUpgrade: (entityId: string) => void;
  onRemove: (entityId: string) => void;
}) {
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
        <p className="inspector-description">{building.description}</p>
        <button className="danger-command" type="button" onClick={() => onRemove(entity.id)}><Trash2 size={15} /> 回收设备</button>
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
        <p className="inspector-description">{building.description}</p>
        <button className="danger-command" type="button" onClick={() => onRemove(entity.id)}><Trash2 size={15} /> 回收设备</button>
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
        {switchingLocked ? <p className="energy-mode-lock">当前蓄电器周期完成后可切换模式</p> : null}
        <p className="inspector-description">{building.description}</p>
        <button className="danger-command" type="button" onClick={() => onRemove(entity.id)}><Trash2 size={15} /> 回收设备</button>
      </div>
    );
  }

  if (entity.kind === "station") {
    const itemId = entity.storedItemId;
    const planetary = entity.buildingId === "planetary_logistics_station";
    const collector = entity.buildingId === "orbital_collector";
    const peer = planetary ? findPlanetaryPeer(game, entity) : findInterstellarPeer(game, entity);
    const acceptedItems = collector
      ? [ITEMS.hydrogen, ITEMS.deuterium]
      : Object.values(ITEMS);
    const vehicleCapacity = planetary ? getStationDroneCapacity(entity) : getStationVesselCapacity(entity);
    const vehicleCount = planetary
      ? Math.min(vehicleCapacity, Math.max(0, Math.floor(entity.stationDrones ?? 0)))
      : Math.min(vehicleCapacity, Math.max(0, Math.floor(entity.stationVessels ?? 0)));
    const vehicleItemId: ItemId = planetary ? "logistics_drone" : "logistics_vessel";
    const availableVehicles = Math.max(0, Math.floor(game.tray[vehicleItemId] ?? 0));
    const vehicleName = planetary ? "物流运输机" : "物流运输船";
    const warperCapacity = getStationWarperCapacity(entity);
    const warperCount = Math.min(warperCapacity, Math.max(0, Math.floor(entity.stationWarpers ?? 0)));
    const availableWarpers = Math.max(0, Math.floor(game.tray.space_warper ?? 0));
    const warpUnlocked = isTechnologyCompleted(game, "space_warp");
    const minimumLoad = getStationMinimumLoad(entity);
    return (
      <div className="inspector-content station-inspector">
        <div className="inspector-identity">
          <i className="building-mark building-mark--station"><Orbit size={18} /></i>
          <div><span>{collector ? "气态巨星轨道设施" : planetary ? "行星内物流设施" : "跨行星物流设施"}</span><strong>{building.name} ×{entity.machineCount}</strong></div>
        </div>
        <label className="recipe-select">
          <span>{collector ? "采集资源" : planetary ? "行星货物" : "星际货物"}</span>
          <select value={itemId ?? ""} onChange={(event) => onLogisticsItemChange(entity.id, event.target.value as ItemId)}>
            <option value="" disabled>选择货物</option>
            {acceptedItems.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </label>
        {!collector ? <div className="segmented-control" aria-label={planetary ? "行星站供需模式" : "星际站供需模式"}>
          <button className={entity.stationMode !== "demand" ? "active" : ""} type="button" onClick={() => onStationModeChange(entity.id, "supply")}>供应</button>
          <button className={entity.stationMode === "demand" ? "active" : ""} type="button" onClick={() => onStationModeChange(entity.id, "demand")}>需求</button>
        </div> : null}
        {!collector ? <div className="station-fleet-control">
          <div className="station-control-heading">
            <span>{planetary ? "运输机泊位" : "运输船泊位"}</span>
            <small>托盘 {availableVehicles}</small>
          </div>
          <div className="station-fleet-stepper">
            <button type="button" title={`卸载 1 ${planetary ? "架" : "艘"}${vehicleName}`} aria-label={`卸载 1 ${planetary ? "架" : "艘"}${vehicleName}`} disabled={vehicleCount < 1} onClick={() => planetary ? onStationDroneAdjust(entity.id, -1) : onStationVesselAdjust(entity.id, -1)}><Minus size={15} /></button>
            <strong>{planetary ? <Orbit size={15} /> : <Rocket size={15} />} {vehicleCount} / {vehicleCapacity}</strong>
            <button type="button" title={`装载 1 ${planetary ? "架" : "艘"}${vehicleName}`} aria-label={`装载 1 ${planetary ? "架" : "艘"}${vehicleName}`} disabled={availableVehicles < 1 || vehicleCount >= vehicleCapacity} onClick={() => planetary ? onStationDroneAdjust(entity.id, 1) : onStationVesselAdjust(entity.id, 1)}><Plus size={15} /></button>
          </div>
        </div> : null}
        {!collector && !planetary ? <div className="station-warper-control">
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
        {!collector ? <div className="station-load-control">
          <span>最低装载率</span>
          <div className="segmented-control segmented-control--four" aria-label={`${vehicleName}最低装载率`}>
            {([0.1, 0.25, 0.5, 1] as StationMinimumLoad[]).map((load) => (
              <button className={minimumLoad === load ? "active" : ""} type="button" key={load} onClick={() => onStationMinimumLoadChange(entity.id, load)}>{Math.round(load * 100)}%</button>
            ))}
          </div>
        </div> : null}
        <dl className="metric-ledger">
          <div><dt>设备状态</dt><dd className={`status-text status-text--${status.tone}`}>{status.label}</dd></div>
          <div><dt>{collector ? "供应目标" : "航线目标"}</dt><dd>{peer ? collector ? `${getPlanet(peer.planetId).name} · ${peer.id}` : planetary ? peer.id : getPlanet(peer.planetId).name : "未配对"}</dd></div>
          <div><dt>输入缓存</dt><dd>{itemId ? formatAmount(entity.inputs[itemId] ?? 0) : "-"}</dd></div>
          <div><dt>可用库存</dt><dd>{itemId ? formatAmount(entity.outputs[itemId] ?? 0) : "-"}</dd></div>
          {!collector ? <div><dt>最低启航货量</dt><dd>{getStationMinimumCargo(entity)} 件/{planetary ? "架" : "船"}</dd></div> : null}
          <div><dt>{collector ? "采集周期" : `${vehicleName}航程`}</dt><dd>{Math.floor((collector ? entity.progress : entity.stationProgress ?? 0) * 100)}%</dd></div>
          <div><dt>完成航次</dt><dd>{entity.stationTrips ?? 0}</dd></div>
          <div><dt>最近运量</dt><dd>{entity.stationLastTransfer ?? 0}</dd></div>
          {!collector && !planetary ? <div><dt>航线类型</dt><dd>{peer && stationRouteRequiresWarp(entity, peer) ? "跨恒星 · 需翘曲" : "恒星系内"}</dd></div> : null}
          <div><dt>{collector ? "采集速率" : "额定耗电"}</dt><dd>{collector ? `${entity.productionRate.toFixed(1)}/min` : `${((building.powerDemandKw ?? 0) * entity.machineCount).toFixed(0)} kW`}</dd></div>
        </dl>
        <p className="inspector-description">{building.description}</p>
        <button className="danger-command" type="button" onClick={() => onRemove(entity.id)}><Trash2 size={15} /> 回收设备</button>
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
        <label className="recipe-select">
          <span>缓存物品</span>
          <select value={itemId ?? ""} onChange={(event) => onLogisticsItemChange(entity.id, event.target.value as ItemId)}>
            <option value="" disabled>选择物品</option>
            {acceptedItems.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </label>
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
        <p className="inspector-description">{building.description}</p>
        <button className="danger-command" type="button" onClick={() => onRemove(entity.id)}><Trash2 size={15} /> 回收设备</button>
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
        <label className="recipe-select">
          <span>当前配方</span>
          <select value={entity.recipeId} onChange={(event) => onRecipeChange(entity.id, event.target.value as RecipeId)}>
            {recipeOptions.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}
          </select>
        </label>
      ) : null}
      <dl className="metric-ledger">
        {entity.kind === "power" ? (
          <>
            <div><dt>设备状态</dt><dd className={`status-text status-text--${status.tone}`}>{status.label}</dd></div>
            <div><dt>实时发电</dt><dd>{(entity.powerOutputKw ?? 0).toFixed(0)} kW</dd></div>
            <div><dt>额定发电</dt><dd>{((building.powerGenerationKw ?? 0) * entity.machineCount * (entity.buildingId === "solar_panel" && entity.planetId === "ashen" ? 1.5 : 1)).toFixed(0)} kW</dd></div>
          </>
        ) : (
          <>
            <div><dt>设备状态</dt><dd className={`status-text status-text--${status.tone}`}>{status.label}</dd></div>
            <div><dt>当前负载</dt><dd>{Math.round(entity.utilization * 100)}%</dd></div>
            {rayReceiver ? <div><dt>接收功率</dt><dd>{(entity.powerOutputKw ?? 0).toFixed(0)} kW</dd></div> : null}
            <div><dt>{railEjector || launchSilo ? "发射速率" : "实际产出"}</dt><dd>{recipe?.id === "ray_power" ? `${(entity.powerOutputKw ?? 0).toFixed(0)} kW` : `${entity.productionRate.toFixed(1)}/min`}</dd></div>
            <div><dt>{rayReceiver ? "额定接收" : "额定耗电"}</dt><dd>{rayReceiver ? `${RAY_RECEIVER_CAPACITY_KW * entity.machineCount} kW` : `${((building.powerDemandKw ?? 0) * entity.machineCount).toFixed(0)} kW`}</dd></div>
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
      <ProliferatorControl game={game} entity={entity} onInstall={onInstallSprayCoater} onConfigure={onProliferatorConfiguration} />
      <EquipmentUpgradeControl game={game} entity={entity} onUpgrade={onUpgrade} />
      <p className="inspector-description">{building.description}</p>
      <button className="danger-command" type="button" onClick={() => onRemove(entity.id)}>
        <Trash2 size={15} /> 回收设备
      </button>
    </div>
  );
}

function beltTierRoman(tier: BeltTier): string {
  return tier === 3 ? "III" : tier === 2 ? "II" : "I";
}

function BeltInspector({ game, belt, onPriorityChange, onUpgrade, onSorterUpgrade, onRemove }: {
  game: GameState;
  belt: BeltConnection;
  onPriorityChange: (beltId: string, priority: 0 | 1) => void;
  onUpgrade: (beltId: string) => void;
  onSorterUpgrade: (beltId: string) => void;
  onRemove: (beltId: string) => void;
}) {
  const item = getItem(belt.itemId);
  const capacity = getBeltCapacity(belt);
  const targetTier = belt.tier < 3 ? (belt.tier + 1) as BeltTier : null;
  const targetId = targetTier ? getBeltConstructionId(targetTier) : null;
  const targetDefinition = targetId ? getConstructionDefinition(targetId) : undefined;
  const targetStock = targetId ? game.construction[targetId] ?? 0 : 0;
  const targetUnlocked = !targetDefinition?.requiredTechId || isTechnologyCompleted(game, targetDefinition.requiredTechId);
  const sorterTargetTier = belt.sorterTier < 3 ? (belt.sorterTier + 1) as SorterTier : null;
  const sorterTargetId = sorterTargetTier ? getSorterConstructionId(sorterTargetTier) : null;
  const sorterTargetDefinition = sorterTargetId ? getConstructionDefinition(sorterTargetId) : undefined;
  const sorterTargetStock = sorterTargetId ? game.construction[sorterTargetId] ?? 0 : 0;
  const sorterTargetUnlocked = !sorterTargetDefinition?.requiredTechId || isTechnologyCompleted(game, sorterTargetDefinition.requiredTechId);
  return (
    <div className="inspector-content">
      <div className="inspector-identity">
        <ItemMark itemId={belt.itemId} />
        <div><span>物流连接</span><strong>{item.name}运输线</strong></div>
      </div>
      <dl className="metric-ledger">
        <div><dt>传送带等级</dt><dd>Mk.{beltTierRoman(belt.tier)}</dd></div>
        <div><dt>分拣器等级</dt><dd>Mk.{beltTierRoman(belt.sorterTier)}</dd></div>
        <div><dt>并行线路</dt><dd>×{belt.lanes}</dd></div>
        <div><dt>当前流量</dt><dd>{belt.lastFlow.toFixed(2)}/s</dd></div>
        <div><dt>线路上限</dt><dd>{capacity.toFixed(0)}/s</dd></div>
        <div><dt>分拣上限</dt><dd>{getSorterCapacity(belt).toFixed(0)}/s</dd></div>
      </dl>
      <div className="capacity-bar"><i style={{ width: `${Math.min(100, belt.lastFlow / capacity * 100)}%`, backgroundColor: item.color }} /></div>
      <label className="toggle-row">
        <input type="checkbox" checked={belt.priority === 1} onChange={(event) => onPriorityChange(belt.id, event.target.checked ? 1 : 0)} />
        <span>设为分流器优先线路</span>
      </label>
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
        </section>
      ) : null}
      {sorterTargetTier && sorterTargetId ? (
        <section className="equipment-upgrade equipment-upgrade--sorter">
          <header><span><ArrowUp size={14} />分拣器升级</span><strong>Mk.{beltTierRoman(belt.sorterTier)} → Mk.{beltTierRoman(sorterTargetTier)}</strong></header>
          <dl>
            <div><dt>分拣上限</dt><dd>{getSorterCapacity(belt).toFixed(0)} → {getSorterCapacity({ ...belt, sorterTier: sorterTargetTier }).toFixed(0)}/s</dd></div>
            <div><dt>升级分拣器</dt><dd>{sorterTargetStock}/{belt.lanes}</dd></div>
          </dl>
          <button type="button" disabled={!canUpgradeSorter(game, belt.id)} onClick={() => onSorterUpgrade(belt.id)} title={sorterTargetUnlocked ? `升级为分拣器 Mk.${beltTierRoman(sorterTargetTier)}` : `需要科技：${getTechnology(sorterTargetDefinition?.requiredTechId)?.name ?? "未解锁"}`}>
            {sorterTargetUnlocked ? <ArrowUp size={14} /> : <LockKeyhole size={14} />}
            {sorterTargetUnlocked ? `升级分拣器 ×${belt.lanes}` : "科技锁定"}
          </button>
        </section>
      ) : null}
      <button className="danger-command" type="button" onClick={() => onRemove(belt.id)}>
        <Trash2 size={15} /> 回收运输线
      </button>
    </div>
  );
}

function Fabricator({ game, onCraft, onCraftItem }: {
  game: GameState;
  onCraft: InspectorPanelProps["onCraft"];
  onCraftItem: InspectorPanelProps["onCraftItem"];
}) {
  const [mode, setMode] = useState<"construction" | "items">("construction");
  const [query, setQuery] = useState("");
  const [batches, setBatches] = useState<1 | 5 | 10>(1);
  const handcraftRecipes = (RECIPES_BY_BUILDING.assembling_machine_mk1 ?? []).filter((recipe) => {
    const term = query.trim().toLocaleLowerCase("zh-CN");
    if (!term) return true;
    const itemNames = [...recipe.inputs, ...recipe.outputs].map((entry) => getItem(entry.itemId).name).join(" ");
    return `${recipe.name} ${itemNames}`.toLocaleLowerCase("zh-CN").includes(term);
  });
  return (
    <div className="fabricator-workspace">
      <div className="fabricator-mode segmented-control" aria-label="基础制造模式">
        <button className={mode === "construction" ? "active" : ""} type="button" onClick={() => setMode("construction")}>建筑制造</button>
        <button className={mode === "items" ? "active" : ""} type="button" onClick={() => setMode("items")}>物品手工</button>
      </div>
      {mode === "items" ? (
        <div className="handcraft-tools">
          <label><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索手工配方" aria-label="搜索手工配方" /></label>
          <div aria-label="手工制造批量">
            {([1, 5, 10] as const).map((count) => <button className={batches === count ? "active" : ""} type="button" key={count} onClick={() => setBatches(count)}>×{count}</button>)}
          </div>
        </div>
      ) : null}
      <div className={`fabricator-list${mode === "items" ? " fabricator-list--items" : ""}`}>
      {mode === "construction" ? CONSTRUCTION.map((definition) => {
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
                return (
                  <span className={current >= cost.amount ? "cost cost--ready" : "cost"} key={cost.itemId}>
                    <ItemMark itemId={cost.itemId} /> {formatAmount(current)}/{cost.amount}
                  </span>
                );
              })}
            </div>
          </article>
        );
      }) : handcraftRecipes.map((recipe) => {
        const output = recipe.outputs[0];
        const unlocked = !recipe.requiredTechId || isTechnologyCompleted(game, recipe.requiredTechId);
        const available = canHandcraftRecipe(game, recipe.id, batches);
        return (
          <article className="fabricator-row handcraft-row" key={recipe.id}>
            <header>
              <ItemMark itemId={output.itemId} />
              <div><strong>{getItem(output.itemId).name}</strong><span>{recipe.duration}s 配方 · 单批 ×{output.amount}</span></div>
              <button type="button" disabled={!available} onClick={() => onCraftItem(recipe.id, batches)} title={`手工制造${getItem(output.itemId).name}`}>
                {unlocked ? <Hammer size={14} /> : <LockKeyhole size={14} />} {unlocked ? `制作 ×${output.amount * batches}` : "锁定"}
              </button>
            </header>
            {!unlocked && recipe.requiredTechId ? <div className="fabricator-lock"><LockKeyhole size={11} /> {getTechnology(recipe.requiredTechId)?.name}</div> : null}
            <div className="fabricator-costs">
              {recipe.inputs.map((input) => {
                const current = Math.floor(game.tray[input.itemId] ?? 0);
                const required = input.amount * batches;
                return <span className={current >= required ? "cost cost--ready" : "cost"} key={input.itemId}><ItemMark itemId={input.itemId} /> {formatAmount(current)}/{required}</span>;
              })}
            </div>
          </article>
        );
      })}
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
      {props.tab === "fabricate" ? <Fabricator game={props.game} onCraft={props.onCraft} onCraftItem={props.onCraftItem} /> : props.selectedEntity ? (
        <EntityInspector game={props.game} entity={props.selectedEntity} onRecipeChange={props.onRecipeChange} onLogisticsItemChange={props.onLogisticsItemChange} onFuelChange={props.onFuelChange} onEnergyModeChange={props.onEnergyModeChange} onStationModeChange={props.onStationModeChange} onStationVesselAdjust={props.onStationVesselAdjust} onStationDroneAdjust={props.onStationDroneAdjust} onStationWarperAdjust={props.onStationWarperAdjust} onStationWarpEnabled={props.onStationWarpEnabled} onStationMinimumLoadChange={props.onStationMinimumLoadChange} onSplitterModeChange={props.onSplitterModeChange} onInstallSprayCoater={props.onInstallSprayCoater} onProliferatorConfiguration={props.onProliferatorConfiguration} onUpgrade={props.onUpgradeEntity} onRemove={props.onRemoveEntity} />
      ) : props.selectedBelt ? (
        <BeltInspector game={props.game} belt={props.selectedBelt} onPriorityChange={props.onBeltPriorityChange} onUpgrade={props.onUpgradeBelt} onSorterUpgrade={props.onUpgradeSorter} onRemove={props.onRemoveBelt} />
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
}

const PLACEMENT_COUNTS: PlacementCount[] = [1, 2, 5, 10];

export function ConstructionDock({ game, placement, beltTier, placementCount, onPlacementChange, onBeltTierChange, onPlacementCountChange, onOpenFabricator }: ConstructionDockProps) {
  return (
    <footer className="construction-dock">
      <div className="dock-label">
        <div className="dock-summary">
          <span>施工托盘</span>
          <strong>{Object.values(game.construction).reduce((sum, amount) => sum + (amount ?? 0), 0)}</strong>
        </div>
        <div className="placement-count" aria-label="批量部署数量">
          {PLACEMENT_COUNTS.map((count) => (
            <button className={placementCount === count ? "active" : ""} type="button" key={count} aria-pressed={placementCount === count} onClick={() => onPlacementCountChange(count)}>×{count}</button>
          ))}
        </div>
      </div>
      <div className="construction-items">
        {BUILD_ORDER.map((id) => {
          const count = game.construction[id] ?? 0;
          const isBelt = isConveyorBeltId(id);
          const itemBeltTier = isBelt ? getBeltTier(id) : null;
          const active = isBelt ? beltTier === itemBeltTier : placement === id;
          const label = isBelt ? `传送带 Mk.${beltTierRoman(itemBeltTier!)}` : getBuilding(id).name;
          const requiredCount = isBelt ? 1 : placementCount;
          const compatiblePlanet = isBelt ? game.activePlanetId !== "giant" : canPlaceBuildingOnPlanet(id, game.activePlanetId);
          return (
            <button
              className={`construction-item${active ? " construction-item--active" : ""}`}
              type="button"
              key={id}
              disabled={count < requiredCount || !compatiblePlanet}
              draggable={count >= requiredCount && compatiblePlanet && !isBelt}
              onClick={() => {
                if (count < requiredCount || !compatiblePlanet) return;
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
              title={!compatiblePlanet ? id === "geothermal_power_station" ? `${label}只能部署在烬原 II` : game.activePlanetId === "giant" ? `${label}不能部署在气态巨星` : `${label}只能部署在气态巨星` : isBelt ? `选择${label}连接节点端口` : `部署${label}${placementCount > 1 ? ` ×${placementCount}` : ""}`}
            >
              <i>{buildIcon(id)}</i>
              <span>{label}</span>
              <strong>×{count}</strong>
            </button>
          );
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
      <i style={{ backgroundColor: item.color }}>{item.symbol}</i>
      <span>{item.name}</span>
      <strong>×{formatAmount(cargo.amount)}</strong>
    </div>
  );
}

export function HeaderControls({
  game,
  onPauseToggle,
  onReset,
  onOpenResources,
  onOpenInspector,
  onOpenRecipes,
  onOpenTechnology,
  onOpenStatistics,
}: {
  game: GameState;
  onPauseToggle: () => void;
  onReset: () => void;
  onOpenResources: () => void;
  onOpenInspector: () => void;
  onOpenRecipes: () => void;
  onOpenTechnology: () => void;
  onOpenStatistics: () => void;
}) {
  const powerTone = game.metrics.powerFactor >= 0.999 ? "positive" : game.metrics.powerFactor > 0 ? "warning" : "negative";
  return (
    <header className="game-header">
      <div className="brand-lockup">
        <i><Power size={21} /></i>
        <div><span>{getPlanet(game.activePlanetId).code}生产协议</span><strong>行星工厂网络</strong></div>
      </div>
      <div className="header-metrics">
        <div><Zap size={16} /><span>电网负载</span><strong>{game.metrics.demandKw.toFixed(0)}<small>/{game.metrics.generationKw.toFixed(0)} kW</small></strong></div>
        <div className={`metric-tone metric-tone--${powerTone}`}><Power size={16} /><span>供电效率</span><strong>{Math.round(game.metrics.powerFactor * 100)}<small>%</small></strong></div>
        <div><Factory size={16} /><span>生产通量</span><strong>{game.metrics.totalItemsPerMinute.toFixed(1)}<small>/min</small></strong></div>
        <div><FlaskConical size={16} /><span>蓝 / 红 / 黄 / 紫 / 绿 / 白矩阵</span><strong>{formatAmount(game.totalProduced.electromagnetic_matrix ?? 0)}<small> / {formatAmount(game.totalProduced.energy_matrix ?? 0)} / {formatAmount(game.totalProduced.structure_matrix ?? 0)} / {formatAmount(game.totalProduced.information_matrix ?? 0)} / {formatAmount(game.totalProduced.gravity_matrix ?? 0)} / {formatAmount(game.totalProduced.universe_matrix ?? 0)}</small></strong></div>
      </div>
      <div className="header-actions">
        <button type="button" onClick={onOpenStatistics} title="打开生产统计" aria-label="打开生产统计"><BarChart3 size={17} /></button>
        <button type="button" onClick={onOpenRecipes} title="打开配方图鉴" aria-label="打开配方图鉴"><BookOpen size={17} /></button>
        <button type="button" onClick={onOpenTechnology} title="打开科技树" aria-label="打开科技树"><FlaskConical size={17} /></button>
        <button className="mobile-toggle" type="button" onClick={onOpenResources} title="物资托盘" aria-label="打开物资托盘"><PackageOpen size={17} /></button>
        <button className="mobile-toggle" type="button" onClick={onOpenInspector} title="检查器" aria-label="打开检查器"><PanelRight size={17} /></button>
        <button type="button" onClick={onPauseToggle} title={game.paused ? "继续模拟" : "暂停模拟"} aria-label={game.paused ? "继续模拟" : "暂停模拟"}>
          {game.paused ? <Play size={17} /> : <Pause size={17} />}
        </button>
        <button type="button" onClick={onReset} title="重置当前工厂" aria-label="重置当前工厂"><Trash2 size={17} /></button>
      </div>
    </header>
  );
}
