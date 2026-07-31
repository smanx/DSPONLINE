import { ArrowLeft, Boxes, Check, ChevronRight, CircleOff, Factory, Gauge, PackageOpen, Power, Route, Ship, Sparkles, X, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { ITEMS, STAR_SYSTEM_LIST, getItem, getPlanet, getStarSystem } from "../game/content";
import { canStartSystemSpaceStation, getInterstellarStationUpgradeStatus, getSpaceStationProgress, getSpaceStationState, isSpaceStationFreeBuildTestMode, SPACE_STATION_MODULE_BASE_COSTS } from "../game/systemSpaceStation";
import { formatQuantityCompact } from "../game/quantityFormat";
import type { GameState, ItemId, SpaceStationOutputPortIndex, StarSystemId } from "../game/types";

function quantity(value: string | number | undefined): string {
  if (typeof value === "number") return formatQuantityCompact(Math.max(0, Math.floor(value)));
  return formatQuantityCompact(Number(value ?? "0"));
}

function statusLabel(status: "not-started" | "building" | "operational"): string {
  return status === "operational" ? "已运行" : status === "building" ? "施工中" : "未开工";
}

export interface SystemSpaceStationWorkspaceProps {
  open: boolean;
  game: GameState;
  systemId: StarSystemId;
  mobile?: boolean;
  onClose: () => void;
  onStartConstruction: (systemId: StarSystemId) => void;
  onDeliverMaterial: (systemId: StarSystemId, planetId: GameState["activePlanetId"], itemId: ItemId, amount: number) => void;
  onUpgradeStation: (entityId: string) => void;
  onUpgradeAllStations: (systemId?: StarSystemId) => void;
  onRequestMode: (entityId: string, mode: "legacy" | "elevator") => void;
  onSetOutput: (entityId: string, portIndex: SpaceStationOutputPortIndex, itemId: ItemId | null) => void;
  onSetModuleCount: (systemId: StarSystemId, module: "backbone" | "energy" | "interstellar", count: number) => void;
}

export function SystemSpaceStationWorkspace({
  open,
  game,
  systemId,
  mobile = false,
  onClose,
  onStartConstruction,
  onDeliverMaterial,
  onUpgradeStation,
  onUpgradeAllStations,
  onRequestMode,
  onSetOutput,
  onSetModuleCount,
}: SystemSpaceStationWorkspaceProps) {
  const [selectedPlanetId, setSelectedPlanetId] = useState(game.activePlanetId);
  const [selectedItemId, setSelectedItemId] = useState<ItemId | null>(null);
  const system = getStarSystem(systemId);
  const station = getSpaceStationState(game, systemId);
  const progress = getSpaceStationProgress(game, systemId);
  const stations = useMemo(() => game.entities.filter((entity) => entity.buildingId === "interstellar_logistics_station" && getPlanet(entity.planetId).systemId === systemId), [game.entities, systemId]);
  const pendingUpgradeCount = stations.filter((entity) => (entity.stationTier ?? 1) < 2).length;
  const readyUpgradeCount = stations.filter((entity) => getInterstellarStationUpgradeStatus(game, entity.id).blocker === "ready").length;
  if (!open) return null;

  return <section className={`system-space-station-workspace${mobile ? " system-space-station-workspace--mobile" : ""}`} role="dialog" aria-modal="true" aria-label={`${system.name}空间站`}>
    <header className="system-space-station-header">
      <div className="system-space-station-title"><i><Sparkles size={20} /></i><span><small>恒星系空间站</small><strong>{system.name}</strong></span><b>{statusLabel(station.status)}</b></div>
      <button type="button" className="system-space-station-close" onClick={onClose} aria-label="关闭空间站"><X size={18} /></button>
    </header>
    <div className="system-space-station-scroll">
      <section className="system-space-station-overview">
        <div className="system-space-station-overview-main"><span>四阶段联合施工</span><strong>{Math.round(progress.progress * 100)}%</strong><small>{quantity(progress.delivered)} / {quantity(progress.total)} 材料单位</small><div className="system-space-station-progress"><i style={{ width: `${Math.round(progress.progress * 100)}%` }} /></div></div>
        <div className="system-space-station-kpis"><span><Boxes size={15} />共享库存<strong>{Object.values(station.inventory).reduce((sum, value) => sum + Number(value), 0).toLocaleString("zh-CN")}</strong></span><span><Route size={15} />空间站<strong>{stations.length}</strong></span><span><Ship size={15} />舰队忙碌<strong>{game.galacticHubNetwork.fleetBusy.toLocaleString("zh-CN")}</strong></span><span><Zap size={15} />翘曲器<strong>{quantity(game.galacticHubNetwork.warpers)}</strong></span></div>
      </section>

      {station.status === "not-started" ? <section className="system-space-station-card system-space-station-start"><Factory size={22} /><div><strong>空间站项目尚未开工</strong><span>需要解锁系统空间站工程，并在当前恒星系的一颗行星放置施工发射平台。</span></div><button type="button" disabled={!canStartSystemSpaceStation(game, systemId)} onClick={() => onStartConstruction(systemId)}>开始施工</button></section> : null}

      {station.status === "building" ? <section className="system-space-station-card"><header><PackageOpen size={17} /><strong>阶段材料交付</strong><span>材料从对应行星物资托盘交付，不会转移其他行星库存。</span></header><div className="system-space-station-delivery-tools"><label><span>交付行星</span><select value={selectedPlanetId} onChange={(event) => setSelectedPlanetId(event.target.value as GameState["activePlanetId"])}>{system.planetIds.map((planetId) => <option value={planetId} key={planetId}>{getPlanet(planetId).name}</option>)}</select></label><label><span>材料</span><select value={selectedItemId ?? progress.nextRequirement?.itemId ?? ""} onChange={(event) => setSelectedItemId((event.target.value || null) as ItemId | null)}><option value="">选择材料</option>{progress.requirements.map((requirement) => <option value={requirement.itemId} key={`${requirement.phaseIndex}:${requirement.itemId}`}>{getItem(requirement.itemId).name} · {quantity(station.delivered[requirement.itemId] ?? "0")}/{quantity(requirement.requiredAmount)}</option>)}</select></label><button type="button" disabled={!selectedItemId && !progress.nextRequirement} onClick={() => { const itemId = selectedItemId ?? progress.nextRequirement?.itemId; if (itemId) onDeliverMaterial(systemId, selectedPlanetId, itemId, 1_000_000); }}>交付托盘库存</button></div><div className="system-space-station-requirements">{progress.requirements.map((requirement) => <div className={Number(station.delivered[requirement.itemId] ?? "0") >= Number(requirement.requiredAmount) ? "complete" : ""} key={`${requirement.phaseIndex}:${requirement.itemId}`}><span>{requirement.name}</span><strong>{getItem(requirement.itemId).name}</strong><em>{quantity(station.delivered[requirement.itemId] ?? "0")} / {quantity(requirement.requiredAmount)}</em>{Number(station.delivered[requirement.itemId] ?? "0") >= Number(requirement.requiredAmount) ? <Check size={14} /> : null}</div>)}</div></section> : null}

      {station.status === "operational" ? <>
        <section className="system-space-station-card"><header><Gauge size={17} /><strong>系统共享仓库</strong><span>电梯模式上传到这里，再按输出口容量公平分配。</span></header><div className="system-space-station-inventory">{Object.entries(station.inventory).filter(([, amount]) => Number(amount) > 0).sort(([left], [right]) => left.localeCompare(right)).map(([itemId, amount]) => <span key={itemId}><b>{getItem(itemId as ItemId).name}</b><strong>{quantity(amount)}</strong></span>)}{Object.values(station.inventory).every((amount) => Number(amount) <= 0) ? <em>共享仓库当前为空</em> : null}</div></section>
        <section className="system-space-station-card"><header><Power size={17} /><strong>功能模块</strong><span>模块成本每十级翻倍，拆除会返还对应成本的一半。</span></header><div className="system-space-station-modules">{(Object.keys(SPACE_STATION_MODULE_BASE_COSTS) as Array<"backbone" | "energy" | "interstellar">).map((module) => <label key={module}><span>{module === "backbone" ? "物流主干" : module === "energy" ? "能源核心" : "星际运输"}</span><input type="number" min={0} max={1_000_000} value={station.modules[module]} onChange={(event) => onSetModuleCount(systemId, module, Math.max(0, Math.floor(Number(event.target.value) || 0)))} /></label>)}</div></section>
      </> : null}

        <section className="system-space-station-card"><header><Route size={17} /><strong>星际物流站</strong><span>升级原地完成，传统航线在切换完成前继续运行。</span></header><div className="system-space-station-bulk-actions"><button type="button" disabled={pendingUpgradeCount === 0} onClick={() => onUpgradeAllStations(systemId)}><Sparkles size={15} />一键升级本系全部 Mk.II{pendingUpgradeCount > 0 ? `（${pendingUpgradeCount}）` : ""}</button><small>{pendingUpgradeCount === 0 ? "本系物流站均已升级" : `当前 ${readyUpgradeCount}/${pendingUpgradeCount} 座满足科技与材料条件`}</small></div><div className="system-space-station-stations">{stations.length === 0 ? <em>当前恒星系还没有星际物流站</em> : stations.map((entity) => { const upgradeStatus = getInterstellarStationUpgradeStatus(game, entity.id); return <article key={entity.id}><div><strong>{getPlanet(entity.planetId).name}</strong><small>{entity.stationTier === 2 ? "Mk.II" : "Mk.I"} · {entity.stationOperationMode === "elevator" ? "太空电梯" : "传统物流"}{entity.stationModeTransition ? " · 等待航线完成" : ""}</small></div><div className="system-space-station-station-actions">{entity.stationTier !== 2 ? <button type="button" onClick={() => onUpgradeStation(entity.id)}>升级 Mk.II</button> : <><button type="button" className={entity.stationOperationMode === "legacy" ? "active" : ""} onClick={() => onRequestMode(entity.id, "legacy")}>传统模式</button><button type="button" className={entity.stationOperationMode === "elevator" ? "active" : ""} onClick={() => onRequestMode(entity.id, "elevator")}>电梯模式</button></>}</div>{entity.stationTier !== 2 ? <p className={`system-space-station-upgrade-status system-space-station-upgrade-status--${upgradeStatus.blocker}`}>{upgradeStatus.reason}</p> : null}{entity.stationTier === 2 && entity.stationOperationMode === "elevator" ? <div className="system-space-station-outputs">{Array.from({ length: 5 }, (_, index) => { const current = entity.elevatorOutputItems?.[index] ?? null; return <label key={index}><span>输出 {index + 1}</span><select value={current ?? ""} onChange={(event) => { const next = (event.target.value || null) as ItemId | null; if (next !== current) { if (!window.confirm("第一次确认：更换输出口会断开该口现有线路，并返还施工件。是否继续？")) return; if (!window.confirm("第二次确认：仅该输出口的线路会被拆除，线路物资将退回共享仓库。确定执行？")) return; } onSetOutput(entity.id, index as SpaceStationOutputPortIndex, next); }}><option value="">空</option>{Object.keys(ITEMS).map((itemId) => <option value={itemId} key={itemId}>{getItem(itemId as ItemId).name}</option>)}</select></label>; })}</div> : null}</article>; })}</div></section>
    </div>
    <footer className="system-space-station-footer"><span><CircleOff size={14} />状态写入 GameState v44，旧物流路线不会被覆盖{isSpaceStationFreeBuildTestMode() ? " · 本地测试：升级与施工材料为 0" : ""}</span><button type="button" onClick={onClose}><ArrowLeft size={15} />返回工厂</button></footer>
  </section>;
}
