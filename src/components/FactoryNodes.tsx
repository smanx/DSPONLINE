import {
  Atom,
  Database,
  Droplets,
  Factory,
  Flame,
  FlaskConical,
  Gauge,
  GitFork,
  Hand,
  Orbit,
  Pickaxe,
  RadioTower,
  Rocket,
  Satellite,
  Sun,
  Wind,
  Zap,
} from "lucide-react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { FUEL_ENERGY_MJ, FUEL_ITEM_IDS, ITEMS, MATRIX_ITEM_IDS, getBuilding, getExtractorBuildingId, getItem, getRecipe, getRecipesForBuilding } from "../game/content";
import { getStationVesselCapacity } from "../game/engine";
import { ItemHoverCard } from "./ItemReference";
import type {
  BuildingId,
  CargoStack,
  DraggedItemSourceKind,
  DysonSwarmState,
  DysonSphereState,
  EntityKind,
  EntityOperatingStatus,
  FactoryEntity,
  ItemAmount,
  ItemId,
  PlacementCount,
  RecipeId,
  TechId,
} from "../game/types";

export interface FactoryNodeData extends Record<string, unknown> {
  entity: FactoryEntity;
  cargo: CargoStack | null;
  placement: BuildingId | null;
  placementCount: PlacementCount;
  miningEntityId: string | null;
  onMiningStart: (entityId: string) => void;
  onMiningStop: () => void;
  onPickOutput: (entityId: string, itemId: ItemId) => void;
  onPickInput: (entityId: string, itemId: ItemId) => void;
  onDropCargo: (entityId: string) => void;
  onDropDraggedItem: (targetEntityId: string, itemId: ItemId, sourceKind: DraggedItemSourceKind, sourceId?: string) => void;
  onInstallMiner: (entityId: string, count: PlacementCount) => void;
  onAddBuilding: (entityId: string, buildingId: BuildingId, count: PlacementCount) => void;
  onRecipeChange: (entityId: string, recipeId: RecipeId) => void;
  onFuelChange: (entityId: string, itemId: ItemId) => void;
  researchLabel: string | null;
  researchCosts: ItemAmount[];
  connectedInputItemIds: ItemId[];
  completedTechIds: TechId[];
  networkTime: number;
  paused: boolean;
  activeLogisticsEntityIds: string[];
  dysonSwarm: DysonSwarmState;
  dysonSphere: DysonSphereState;
  status: EntityOperatingStatus;
}

export type FactoryFlowNode = Node<FactoryNodeData, EntityKind>;

function formatAmount(value: number): string {
  return Math.floor(value).toLocaleString("zh-CN");
}

function ItemBadge({ itemId, amount, muted = false }: { itemId: ItemId; amount: number; muted?: boolean }) {
  const item = getItem(itemId);
  return (
    <ItemHoverCard itemId={itemId} className="item-reference--badge">
      <span className={`item-badge${muted ? " item-badge--muted" : ""}`}>
        <i style={{ backgroundColor: item.color }}>{item.symbol}</i>
        <span>{item.name}</span>
        <strong>{formatAmount(amount)}</strong>
      </span>
    </ItemHoverCard>
  );
}

function WorkCycle({
  label,
  progress,
  active,
  efficiency,
}: {
  label: string;
  progress: number;
  active: boolean;
  efficiency: number;
}) {
  const normalized = Math.max(0, Math.min(1, progress));
  const percent = Math.round(normalized * 100);
  return (
    <div
      className={`work-cycle${active ? " work-cycle--active" : ""}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <i style={{ width: `${percent}%` }} />
      <span>{label}</span>
      <strong>{active ? `${percent}% · 效率 ${Math.round(efficiency * 100)}%` : percent > 0 ? `${percent}% · 暂停` : "待机"}</strong>
    </div>
  );
}

interface OutputSlotProps {
  entityId: string;
  itemId: ItemId;
  amount: number;
  onPick: (entityId: string, itemId: ItemId) => void;
}

function OutputSlot({ entityId, itemId, amount, onPick }: OutputSlotProps) {
  const enabled = amount > 0.001;
  const pick = () => enabled && onPick(entityId, itemId);
  return (
    <div className="node-port node-port--output">
      <button
        className="node-slot nodrag nopan"
        type="button"
        disabled={!enabled}
        draggable={enabled}
        onClick={(event) => { event.stopPropagation(); pick(); }}
        onDragStart={(event) => {
          event.stopPropagation();
          event.dataTransfer.setData("application/factory-item", itemId);
          event.dataTransfer.setData("application/factory-source-kind", "node");
          event.dataTransfer.setData("application/factory-source-id", entityId);
          event.dataTransfer.effectAllowed = "move";
        }}
        title={`拿取${ITEMS[itemId].name}`}
      >
        <ItemBadge itemId={itemId} amount={amount} muted={!enabled} />
      </button>
      <Handle id={`out:${itemId}`} type="source" position={Position.Right} className="factory-handle factory-handle--output nodrag nopan" />
    </div>
  );
}

interface InputSlotProps {
  entityId: string;
  itemId: ItemId;
  amount: number;
  cargo: CargoStack | null;
  onDropCargo: (entityId: string) => void;
  onPickInput: (entityId: string, itemId: ItemId) => void;
  onDropDraggedItem: FactoryNodeData["onDropDraggedItem"];
}

function InputSlot({ entityId, itemId, amount, cargo, onDropCargo, onPickInput, onDropDraggedItem }: InputSlotProps) {
  const compatible = cargo?.itemId === itemId;
  const dropCargo = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (compatible) onDropCargo(entityId);
    else if (!cargo && amount >= 1) onPickInput(entityId, itemId);
  };
  const dropDragged = (event: React.DragEvent) => {
    const draggedItem = event.dataTransfer.getData("application/factory-item") as ItemId;
    if (draggedItem !== itemId) return;
    event.preventDefault();
    event.stopPropagation();
    const sourceKind = event.dataTransfer.getData("application/factory-source-kind") as DraggedItemSourceKind;
    const sourceId = event.dataTransfer.getData("application/factory-source-id") || undefined;
    onDropDraggedItem(entityId, draggedItem, sourceKind, sourceId);
  };
  return (
    <div className={`node-port node-port--input${compatible ? " node-port--compatible" : ""}`}>
      <Handle id={`in:${itemId}`} type="target" position={Position.Left} className="factory-handle factory-handle--input nodrag nopan" />
      <button
        className="node-slot nodrag nopan"
        type="button"
        draggable={amount >= 1}
        onClick={dropCargo}
        onDragStart={(event) => {
          event.stopPropagation();
          event.dataTransfer.setData("application/factory-item", itemId);
          event.dataTransfer.setData("application/factory-source-kind", "node-input");
          event.dataTransfer.setData("application/factory-source-id", entityId);
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("application/factory-item")) event.preventDefault();
        }}
        onDrop={dropDragged}
        title={compatible ? `投入${ITEMS[itemId].name}` : amount >= 1 && !cargo ? `取出${ITEMS[itemId].name}` : `投入${ITEMS[itemId].name}`}
      >
        <ItemBadge itemId={itemId} amount={amount} muted={amount <= 0.001} />
      </button>
    </div>
  );
}

export function VeinNode({ data, selected }: NodeProps<FactoryFlowNode>) {
  const { entity, cargo, placement } = data;
  const resourceId = entity.resourceId!;
  const resource = getItem(resourceId);
  const mining = data.miningEntityId === entity.id;
  const output = entity.outputs[resourceId] ?? 0;
  const extractorId = getExtractorBuildingId(resourceId);
  const extractor = getBuilding(extractorId);
  const fluid = resource.kind === "fluid";
  const water = resourceId === "water";
  const sulfuricOcean = resourceId === "sulfuric_acid";
  const remote = resourceId === "silicon_ore" || resourceId === "titanium_ore";
  const installing = placement === extractorId;

  const install = (event: React.MouseEvent) => {
    if (!installing) return;
    event.preventDefault();
    event.stopPropagation();
    data.onInstallMiner(entity.id, data.placementCount);
  };

  return (
    <article
      className={`factory-node vein-node${selected ? " factory-node--selected" : ""}${installing ? " factory-node--placement" : ""}`}
      onClick={install}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("application/factory-building")) event.preventDefault();
      }}
      onDrop={(event) => {
        const buildingId = event.dataTransfer.getData("application/factory-building") as BuildingId;
        if (buildingId !== extractorId) return;
        event.preventDefault();
        event.stopPropagation();
        data.onInstallMiner(entity.id, data.placementCount);
      }}
    >
      <header className="factory-node__header">
        <div className="node-icon" style={{ color: resource.color }}>{fluid ? <Droplets size={18} /> : <Pickaxe size={18} />}</div>
        <div>
          <span>{water ? "海洋水源" : sulfuricOcean ? "硫酸海洋" : fluid ? "原油涌泉" : remote ? "远端矿区" : "资源矿脉"}</span>
          <strong>{resource.name}</strong>
        </div>
        <small>∞</small>
      </header>
      <div className="vein-readout">
        <span>{extractor.shortName} <strong>×{entity.minerCount}</strong></span>
        <span title={data.status.label}>{entity.minerCount > 0 ? `${data.status.label} · ${entity.productionRate.toFixed(1)}/min` : data.status.label}</span>
      </div>
      {entity.minerCount > 0 ? (
        <WorkCycle label="采矿周期" progress={entity.progress} active={!data.paused && entity.utilization > 0.001} efficiency={entity.utilization} />
      ) : null}
      {fluid ? (
        <div className="manual-mine manual-mine--locked"><Droplets size={16} /><span>{entity.minerCount > 0 ? `由${extractor.shortName}自动抽取` : `需要${extractor.name}`}</span></div>
      ) : (
        <button
          className={`manual-mine nodrag nopan${mining ? " manual-mine--active" : ""}`}
          type="button"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            data.onMiningStart(entity.id);
          }}
          onPointerUp={data.onMiningStop}
          onPointerCancel={data.onMiningStop}
          title={`长按采集${resource.name}`}
        >
          <Hand size={16} />
          <span>{mining ? "采集中" : "采集"}</span>
          <i />
        </button>
      )}
      <OutputSlot entityId={entity.id} itemId={resourceId} amount={output} onPick={data.onPickOutput} />
      {cargo?.itemId === resourceId ? <span className="node-cargo-match">同类物资已拿起</span> : null}
    </article>
  );
}

export function MachineNode({ data, selected }: NodeProps<FactoryFlowNode>) {
  const { entity, cargo, placement } = data;
  const building = getBuilding(entity.buildingId!);
  const recipe = getRecipe(entity.recipeId);
  const researchInputs = MATRIX_ITEM_IDS.filter((itemId) =>
    data.researchCosts.some((cost) => cost.itemId === itemId) ||
    data.connectedInputItemIds.includes(itemId) ||
    (entity.inputs[itemId] ?? 0) > 0 ||
    data.completedTechIds.includes(itemId as TechId))
    .map((itemId) => ({ itemId, amount: 1 }));
  const inputs = recipe?.id === "matrix_research" ? researchInputs : recipe?.inputs ?? [];
  const acceptsCargo = cargo && inputs.some((input) => input.itemId === cargo.itemId);
  const adding = placement === entity.buildingId;
  const utilizationTone = data.status.tone === "running" ? "good" : data.status.tone === "warning" ? "partial" : data.status.tone === "blocked" ? "blocked" : "idle";
  const recipeOptions = getRecipesForBuilding(entity.buildingId!).filter((option) =>
    !option.requiredTechId || data.completedTechIds.includes(option.requiredTechId));
  const railEjector = entity.buildingId === "em_rail_ejector";
  const rayReceiver = entity.buildingId === "ray_receiver";
  const launchSilo = entity.buildingId === "vertical_launching_silo";
  const rayPowerMode = recipe?.id === "ray_power";
  const speedMultiplier = recipe?.id === "matrix_research"
    ? 1 + (data.completedTechIds.includes("research_speed_1") ? 0.25 : 0) +
      (data.completedTechIds.includes("research_speed_2") ? 0.25 : 0) +
      (data.completedTechIds.includes("research_speed_3") ? 0.25 : 0)
    : 1;

  const add = (event: React.MouseEvent) => {
    if (!adding) return;
    event.preventDefault();
    event.stopPropagation();
    data.onAddBuilding(entity.id, entity.buildingId!, data.placementCount);
  };

  return (
    <article
      className={`factory-node machine-node${building.tier && building.tier > 1 ? ` factory-node--tier-${building.tier}` : ""}${selected ? " factory-node--selected" : ""}${adding ? " factory-node--placement" : ""}${acceptsCargo ? " factory-node--accepts-cargo" : ""}`}
      onClick={add}
      onDragOver={(event) => {
        if (event.dataTransfer.types.some((type) => type === "application/factory-item" || type === "application/factory-building")) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const buildingId = event.dataTransfer.getData("application/factory-building") as BuildingId;
        if (buildingId && buildingId === entity.buildingId) {
          data.onAddBuilding(entity.id, buildingId, data.placementCount);
          return;
        }
        const draggedItem = event.dataTransfer.getData("application/factory-item") as ItemId;
        if (draggedItem) {
          const sourceKind = event.dataTransfer.getData("application/factory-source-kind") as DraggedItemSourceKind;
          const sourceId = event.dataTransfer.getData("application/factory-source-id") || undefined;
          data.onDropDraggedItem(entity.id, draggedItem, sourceKind, sourceId);
        }
      }}
    >
      <header className="factory-node__header">
        <div className={`node-icon${rayReceiver ? " node-icon--ray" : railEjector || launchSilo ? " node-icon--orbit" : ""}`}>
          {entity.buildingId === "miniature_particle_collider" ? <Atom size={18} /> : railEjector ? <Satellite size={18} /> : launchSilo ? <Rocket size={18} /> : rayReceiver ? <RadioTower size={18} /> : <Factory size={18} />}
        </div>
        <div>
          <span>{railEjector ? "恒星轨道设施" : launchSilo ? "戴森球建造设施" : rayReceiver ? "戴森系统接收设施" : building.shortName}</span>
          <strong>{recipe?.name ?? "未指定配方"}</strong>
        </div>
        <small>×{entity.machineCount}</small>
      </header>
      {selected ? (
        <label className="node-inline-select nodrag nopan" onPointerDown={(event) => event.stopPropagation()}>
          <span>生产配方</span>
          <select value={entity.recipeId} onChange={(event) => data.onRecipeChange(entity.id, event.target.value as RecipeId)}>
            {recipeOptions.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}
          </select>
        </label>
      ) : null}
      <div className="machine-status">
        <span className={`status-dot status-dot--${utilizationTone}`} />
        <span title={data.status.label}>{data.status.label}</span>
        <strong>{entity.productionRate.toFixed(1)}/min</strong>
      </div>
      {rayPowerMode ? (
        <div className="ray-reception">
          <RadioTower size={14} />
          <span>连续接收</span>
          <strong>{(entity.powerOutputKw ?? 0).toFixed(0)} kW · {Math.round(entity.utilization * 100)}%</strong>
        </div>
      ) : (
        <WorkCycle
          label={recipe?.id === "matrix_research" ? "科研周期" : railEjector ? "太阳帆发射" : launchSilo ? "火箭发射" : rayReceiver ? "光子周期" : entity.buildingId === "miniature_particle_collider" ? "对撞周期" : entity.buildingId === "oil_refinery" || entity.buildingId === "chemical_plant" ? "加工周期" : "生产周期"}
          progress={entity.progress}
          active={!data.paused && entity.utilization > 0.001}
          efficiency={entity.utilization}
        />
      )}
      {!rayPowerMode ? <div className="node-io">
        <div className="node-io__column">
          <span className="node-io__label">输入</span>
          {inputs.length > 0 ? inputs.map((input) => (
            <InputSlot
              key={input.itemId}
              entityId={entity.id}
              itemId={input.itemId}
              amount={entity.inputs[input.itemId] ?? 0}
              cargo={cargo}
              onDropCargo={data.onDropCargo}
              onPickInput={data.onPickInput}
              onDropDraggedItem={data.onDropDraggedItem}
            />
          )) : rayReceiver ? (
            <div className="stellar-input"><Sun size={14} /><span>戴森系统能量</span></div>
          ) : null}
        </div>
        <div className="node-io__column node-io__column--output">
          <span className="node-io__label">{recipe?.id === "matrix_research" ? "科研" : "输出"}</span>
          {recipe?.id === "matrix_research" ? (
            <div className="research-target">
              <FlaskConical size={14} />
              <span>{data.researchLabel ?? "未选择科技"}</span>
            </div>
          ) : recipe && recipe.outputs.length > 0 ? recipe.outputs.map((output) => (
            <OutputSlot
              key={output.itemId}
              entityId={entity.id}
              itemId={output.itemId}
              amount={entity.outputs[output.itemId] ?? 0}
              onPick={data.onPickOutput}
            />
          )) : railEjector ? (
            <div className="orbital-target"><Orbit size={14} /><span>在轨 {formatAmount(data.dysonSwarm.sailsInOrbit)} 帆</span></div>
          ) : launchSilo ? (
            <div className="orbital-target"><Rocket size={14} /><span>结构 {formatAmount(data.dysonSphere.structurePoints)} 点</span></div>
          ) : null}
        </div>
      </div> : null}
      <footer className="factory-node__footer">
        <span><Zap size={11} /> {rayReceiver ? `${(entity.powerOutputKw ?? 0).toFixed(0)} kW 接收` : `${((building.powerDemandKw ?? 0) * entity.machineCount).toFixed(0)} kW`}</span>
        <span><Gauge size={11} /> {railEjector ? `累计 ${formatAmount(data.dysonSwarm.totalLaunched)} 帆` : launchSilo ? `累计 ${formatAmount(data.dysonSphere.totalRocketsLaunched)} 枚` : `${(building.speed * speedMultiplier).toFixed(2)}×`}</span>
      </footer>
    </article>
  );
}

export function LogisticsNode({ data, selected }: NodeProps<FactoryFlowNode>) {
  const { entity, cargo, placement } = data;
  const building = getBuilding(entity.buildingId!);
  const itemId = entity.storedItemId;
  const cargoKind = cargo ? getItem(cargo.itemId).kind : null;
  const acceptsCargo = Boolean(cargo && (!itemId || cargo.itemId === itemId) && (
    building.accepts === "any" || building.accepts === cargoKind || (building.accepts === "solid" && cargoKind === "matrix")
  ));
  const adding = placement === entity.buildingId;
  const isSplitter = entity.kind === "splitter";
  const isStation = entity.kind === "station";
  const stationVesselCapacity = getStationVesselCapacity(entity);
  const stationVessels = Math.min(stationVesselCapacity, Math.max(0, Math.floor(entity.stationVessels ?? 0)));

  return (
    <article
      className={`factory-node logistics-node${isStation ? " station-node" : ""}${selected ? " factory-node--selected" : ""}${adding ? " factory-node--placement" : ""}${acceptsCargo ? " factory-node--accepts-cargo" : ""}`}
      onClick={(event) => {
        if (!adding) return;
        event.preventDefault();
        event.stopPropagation();
        data.onAddBuilding(entity.id, entity.buildingId!, data.placementCount);
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.some((type) => type === "application/factory-item" || type === "application/factory-building")) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const buildingId = event.dataTransfer.getData("application/factory-building") as BuildingId;
        if (buildingId === entity.buildingId) {
          data.onAddBuilding(entity.id, buildingId, data.placementCount);
          return;
        }
        const draggedItem = event.dataTransfer.getData("application/factory-item") as ItemId;
        if (!draggedItem) return;
        const sourceKind = event.dataTransfer.getData("application/factory-source-kind") as DraggedItemSourceKind;
        const sourceId = event.dataTransfer.getData("application/factory-source-id") || undefined;
        data.onDropDraggedItem(entity.id, draggedItem, sourceKind, sourceId);
      }}
    >
      <header className="factory-node__header">
        <div className="node-icon">{isStation ? <Orbit size={18} /> : isSplitter ? <GitFork size={18} /> : <Database size={18} />}</div>
        <div><span>{isStation ? "跨行星运输" : isSplitter ? "物流分配" : "物流缓存"}</span><strong>{building.name}</strong></div>
        <small>×{entity.machineCount}</small>
      </header>
      <WorkCycle
        label={isStation ? "运输船航程" : "物流周期"}
        progress={isStation ? entity.stationProgress ?? 0 : data.networkTime % 1}
        active={!data.paused && (isStation ? entity.utilization > 0.001 : data.activeLogisticsEntityIds.includes(entity.id))}
        efficiency={isStation ? entity.utilization : data.activeLogisticsEntityIds.includes(entity.id) ? 1 : 0}
      />
      {itemId ? (
        <div className="node-io logistics-io">
          <div className="node-io__column">
            <span className="node-io__label">输入</span>
            <InputSlot entityId={entity.id} itemId={itemId} amount={entity.inputs[itemId] ?? 0} cargo={cargo} onDropCargo={data.onDropCargo} onPickInput={data.onPickInput} onDropDraggedItem={data.onDropDraggedItem} />
          </div>
          <div className="node-io__column node-io__column--output">
            <span className="node-io__label">输出</span>
            <OutputSlot entityId={entity.id} itemId={itemId} amount={entity.outputs[itemId] ?? 0} onPick={data.onPickOutput} />
          </div>
        </div>
      ) : (
        <div className="logistics-empty">{isStation ? "在检查器中选择星际货物" : "拖入物品或在检查器中选择缓存类型"}</div>
      )}
      <footer className="factory-node__footer">
        <span title={data.status.label}>{data.status.label}</span>
        <span title={isStation ? `累计 ${entity.stationTrips ?? 0} 航次` : undefined}>{isStation ? `${entity.stationMode === "demand" ? "需求" : "供应"} · ${stationVessels}/${stationVesselCapacity} 舰队` : isSplitter ? entity.distributionMode === "priority" ? "优先分流" : "均衡分流" : `${building.outputCapacity * entity.machineCount} 容量`}</span>
      </footer>
    </article>
  );
}

export function PowerNode({ data, selected }: NodeProps<FactoryFlowNode>) {
  const { entity, placement, cargo } = data;
  const building = getBuilding(entity.buildingId!);
  const adding = placement === entity.buildingId;
  const thermal = entity.buildingId === "thermal_power_plant";
  const fuelId = entity.fuelItemId;
  const ratedPower = (building.powerGenerationKw ?? 0) * entity.machineCount;
  return (
    <article
      className={`factory-node power-node${thermal ? " thermal-node" : ""}${selected ? " factory-node--selected" : ""}${adding ? " factory-node--placement" : ""}`}
      onClick={(event) => {
        if (!adding) return;
        event.preventDefault();
        event.stopPropagation();
        data.onAddBuilding(entity.id, entity.buildingId!, data.placementCount);
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("application/factory-building") ||
          (thermal && event.dataTransfer.types.includes("application/factory-item"))) event.preventDefault();
      }}
      onDrop={(event) => {
        const buildingId = event.dataTransfer.getData("application/factory-building") as BuildingId;
        if (buildingId === entity.buildingId) {
          event.preventDefault();
          event.stopPropagation();
          data.onAddBuilding(entity.id, buildingId, data.placementCount);
          return;
        }
        if (!thermal) return;
        const draggedItem = event.dataTransfer.getData("application/factory-item") as ItemId;
        if (!draggedItem) return;
        event.preventDefault();
        event.stopPropagation();
        const sourceKind = event.dataTransfer.getData("application/factory-source-kind") as DraggedItemSourceKind;
        const sourceId = event.dataTransfer.getData("application/factory-source-id") || undefined;
        data.onDropDraggedItem(entity.id, draggedItem, sourceKind, sourceId);
      }}
    >
      <header className="factory-node__header">
        <div className="node-icon node-icon--power">{thermal ? <Flame size={19} /> : <Wind size={19} />}</div>
        <div>
          <span>{thermal ? "可调度能源" : "行星电网"}</span>
          <strong>{building.name}</strong>
        </div>
        <small>×{entity.machineCount}</small>
      </header>
      {thermal && selected ? (
        <label className="node-inline-select nodrag nopan" onPointerDown={(event) => event.stopPropagation()}>
          <span>燃烧燃料</span>
          <select value={fuelId ?? ""} onChange={(event) => data.onFuelChange(entity.id, event.target.value as ItemId)}>
            <option value="" disabled>选择燃料</option>
            {FUEL_ITEM_IDS.map((itemId) => <option value={itemId} key={itemId}>{ITEMS[itemId].name} · {FUEL_ENERGY_MJ[itemId]} MJ</option>)}
          </select>
        </label>
      ) : null}
      <div className="power-output">
        {thermal ? <Flame size={17} /> : <Zap size={17} />}
        <span>{thermal ? data.status.label : "额定发电"}</span>
        <strong>{thermal ? `${(entity.powerOutputKw ?? 0).toFixed(0)} / ${ratedPower.toFixed(0)} kW` : `${ratedPower.toFixed(0)} kW`}</strong>
      </div>
      {thermal && fuelId ? (
        <div className="thermal-fuel">
          <InputSlot entityId={entity.id} itemId={fuelId} amount={entity.inputs[fuelId] ?? 0} cargo={cargo} onDropCargo={data.onDropCargo} onPickInput={data.onPickInput} onDropDraggedItem={data.onDropDraggedItem} />
          <span>炉膛余热 <strong>{(entity.fuelRemainingMj ?? 0).toFixed(2)} MJ</strong></span>
        </div>
      ) : thermal ? <div className="thermal-empty">未配置燃料</div> : null}
    </article>
  );
}

export const NODE_TYPES = {
  vein: VeinNode,
  machine: MachineNode,
  power: PowerNode,
  storage: LogisticsNode,
  splitter: LogisticsNode,
  station: LogisticsNode,
};
