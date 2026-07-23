import { Check, CircleDot, ClipboardCopy, ClipboardPaste, Gauge, GitBranch, Layers3, LockKeyhole, Orbit, Pause, Play, Plus, RadioTower, Rocket, Sparkles, Sun, Trash2, X, Zap } from "lucide-react";
import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import { STAR_SYSTEM_LIST, getPlanet, getStarSystem } from "../game/content";
import { createDysonLayerTemplate, getDysonEngineeringSnapshot, getDysonPlanTotals, isStarSystemUnlocked, isTechnologyCompleted, type DysonLayerTemplate } from "../game/engine";
import { getStarSystemProfile } from "../game/galaxy";
import { formatKilowatts } from "../game/units";
import type { DysonLayerState, DysonLaunchMode, DysonLaunchThrottle, GameState, StarSystemId } from "../game/types";
import { QuantityValue } from "./QuantityValue";
import { formatQuantityCompact, formatQuantityExact } from "../game/quantityFormat";

const VIEW_CENTER = 300;

function pointAt(angle: number, radius: number) {
  const radians = (angle - 90) * Math.PI / 180;
  return { x: Math.cos(radians) * radius, y: Math.sin(radians) * radius };
}

function angularDistance(source: number, target: number): number {
  const direct = ((target - source) % 360 + 360) % 360;
  return direct || 360;
}

function shellPath(layer: DysonLayerState, sourceAngle: number, targetAngle: number, radius: number): string {
  const source = pointAt(sourceAngle, radius);
  const target = pointAt(targetAngle, radius);
  const distance = angularDistance(sourceAngle, targetAngle);
  return `M 0 0 L ${source.x.toFixed(2)} ${source.y.toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 ${distance > 180 ? 1 : 0} 1 ${target.x.toFixed(2)} ${target.y.toFixed(2)} Z`;
}

export function DysonPlannerWorkspace({
  open,
  game,
  onClose,
  onAddLayer,
  onAddStandardLayer,
  onSelectLayer,
  onOrbitChange,
  onRemoveLayer,
  onPasteLayer,
  onAddNode,
  onRemoveNode,
  onConnectNodes,
  onAutoConnect,
  onPlanShell,
  onClearShell,
  onLaunchModeChange,
  onLaunchThrottleChange,
  onLaunchEnabledChange,
  onAddSwarmOrbit,
  onSelectSwarmOrbit,
  onSwarmOrbitChange,
  onRemoveSwarmOrbit,
}: {
  open: boolean;
  game: GameState;
  onClose: () => void;
  onAddLayer: (systemId: StarSystemId) => void;
  onAddStandardLayer: (systemId: StarSystemId) => void;
  onSelectLayer: (systemId: StarSystemId, layerId: string) => void;
  onOrbitChange: (systemId: StarSystemId, layerId: string, orbit: { radius?: number; inclination?: number; longitude?: number }) => void;
  onRemoveLayer: (systemId: StarSystemId, layerId: string) => void;
  onPasteLayer: (systemId: StarSystemId, template: DysonLayerTemplate) => void;
  onAddNode: (systemId: StarSystemId, layerId: string, angle: number) => void;
  onRemoveNode: (systemId: StarSystemId, layerId: string, nodeId: string) => void;
  onConnectNodes: (systemId: StarSystemId, layerId: string, sourceNodeId: string, targetNodeId: string) => void;
  onAutoConnect: (systemId: StarSystemId, layerId: string) => void;
  onPlanShell: (systemId: StarSystemId, layerId: string) => void;
  onClearShell: (systemId: StarSystemId, layerId: string) => void;
  onLaunchModeChange: (mode: DysonLaunchMode) => void;
  onLaunchThrottleChange: (throttle: DysonLaunchThrottle) => void;
  onLaunchEnabledChange: (enabled: boolean) => void;
  onAddSwarmOrbit: (systemId: StarSystemId) => void;
  onSelectSwarmOrbit: (systemId: StarSystemId, orbitId: string) => void;
  onSwarmOrbitChange: (systemId: StarSystemId, orbitId: string, changes: { radius?: number; inclination?: number; longitude?: number }) => void;
  onRemoveSwarmOrbit: (systemId: StarSystemId, orbitId: string) => void;
}) {
  const activePlanetSystem = getPlanet(game.activePlanetId).systemId;
  const [systemId, setSystemId] = useState<StarSystemId>(activePlanetSystem);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [layerClipboard, setLayerClipboard] = useState<DysonLayerTemplate | null>(null);
  useEffect(() => {
    if (open) setSystemId(activePlanetSystem);
  }, [activePlanetSystem, open]);
  useEffect(() => setSelectedNodeId(null), [systemId]);
  const plan = game.dysonPlans[systemId];
  const swarmOrbits = game.dysonEngineering.orbitsBySystem[systemId] ?? [];
  const activeSwarmOrbit = swarmOrbits.find((orbit) => orbit.id === game.dysonEngineering.activeOrbitBySystem[systemId]) ?? swarmOrbits[0] ?? null;
  const engineering = getDysonEngineeringSnapshot(game, systemId);
  const starProfile = getStarSystemProfile(game, systemId);
  const activeLayer = plan.layers.find((layer) => layer.id === plan.activeLayerId) ?? plan.layers[0] ?? null;
  const totals = getDysonPlanTotals(plan);
  const programReady = isTechnologyCompleted(game, "dyson_sphere_program");
  const shellReady = isTechnologyCompleted(game, "dyson_shell");
  const maximumRadius = Math.max(50_000, ...plan.layers.map((layer) => layer.radius), ...swarmOrbits.map((orbit) => orbit.radius));
  const visualRadiusByLayer = useMemo(() => new Map(plan.layers.map((layer) => [
    layer.id,
    76 + layer.radius / maximumRadius * 190,
  ])), [maximumRadius, plan.layers]);
  const visualRadiusBySwarmOrbit = useMemo(() => new Map(swarmOrbits.map((orbit) => [
    orbit.id,
    64 + orbit.radius / maximumRadius * 176,
  ])), [maximumRadius, swarmOrbits]);

  if (!open) return null;

  const addNodeFromCanvas = (event: ReactMouseEvent<SVGSVGElement>) => {
    if (!activeLayer || !programReady) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width * 600 - VIEW_CENTER;
    const y = (event.clientY - bounds.top) / bounds.height * 600 - VIEW_CENTER;
    const angle = (Math.atan2(y, x) * 180 / Math.PI + 90 + 360) % 360;
    onAddNode(systemId, activeLayer.id, angle);
  };

  return (
    <section className="dyson-planner-workspace" role="dialog" aria-modal="true" aria-label="戴森球规划">
      <header className="dyson-planner-header">
        <div className="dyson-planner-title"><i><Orbit size={20} /></i><div><span>恒星巨构设计协议</span><strong>戴森球规划</strong></div></div>
        <div className="dyson-planner-headline">
          <span>恒星 <strong>{starProfile.starTypeName} · {starProfile.luminosity.toFixed(2)} L☉</strong></span>
          <span>结构 <strong><QuantityValue value={plan.structurePoints} /></strong></span>
          <span>壳面帆 <strong><QuantityValue value={plan.shellSails} /></strong></span>
          <span>本系功率 <strong>{formatKilowatts(engineering.projectedGenerationKw)}</strong></span>
        </div>
        <button className="dyson-planner-close" type="button" onClick={onClose} title="关闭戴森球规划" aria-label="关闭戴森球规划"><X size={18} /></button>
      </header>

      <div className="dyson-planner-layout">
        <aside className="dyson-plan-sidebar">
          <div className="dyson-system-tabs" aria-label="戴森球恒星系">
            {STAR_SYSTEM_LIST.filter((system) => isStarSystemUnlocked(game, system.id)).map((system) => (
              <button className={systemId === system.id ? "active" : ""} type="button" key={system.id} onClick={() => setSystemId(system.id)} title={`规划${system.name}戴森球`}>
                <i style={{ color: system.color }}><Sparkles size={14} /></i><span><strong>{system.name}</strong><small>{getStarSystemProfile(game, system.id).starTypeName} · {getStarSystemProfile(game, system.id).luminosity.toFixed(2)} L☉</small></span>
              </button>
            ))}
          </div>
          <div className="dyson-layer-heading"><span>壳层</span><strong>{plan.layers.length}/8</strong></div>
          <div className="dyson-layer-list">
            {plan.layers.map((layer, index) => {
              const layerStructure = layer.nodes.reduce((sum, node) => sum + node.requiredStructurePoints, 0) + layer.frames.reduce((sum, frame) => sum + frame.requiredStructurePoints, 0);
              const completed = layer.nodes.reduce((sum, node) => sum + node.completedStructurePoints, 0) + layer.frames.reduce((sum, frame) => sum + frame.completedStructurePoints, 0);
              return (
                <button className={activeLayer?.id === layer.id ? "active" : ""} type="button" key={layer.id} onClick={() => { onSelectLayer(systemId, layer.id); setSelectedNodeId(null); }}>
                  <b>{String(index + 1).padStart(2, "0")}</b><span><strong>{layer.name}</strong><small>{layer.radius.toLocaleString("zh-CN")} m · {layer.nodes.length} 节点</small></span><em title={`${formatQuantityExact(completed)} / ${formatQuantityExact(layerStructure)}`}>{formatQuantityCompact(completed)}/{formatQuantityCompact(layerStructure)}</em>
                </button>
              );
            })}
            {plan.layers.length === 0 ? <div className="dyson-layer-empty"><Orbit size={18} /><span>尚无壳层方案</span></div> : null}
          </div>
          <div className="dyson-layer-commands">
            <button type="button" disabled={!programReady || plan.layers.length >= 8} onClick={() => onAddLayer(systemId)} title="新建空白壳层"><Plus size={14} />空白层</button>
            <button type="button" disabled={!programReady || plan.layers.length >= 8} onClick={() => onAddStandardLayer(systemId)} title="新建八节点闭合标准壳层"><Layers3 size={14} />标准层</button>
            <button type="button" disabled={!activeLayer} onClick={() => activeLayer && setLayerClipboard(createDysonLayerTemplate(activeLayer))} title="复制当前壳层设计，不复制施工进度"><ClipboardCopy size={14} />复制</button>
            <button type="button" disabled={!layerClipboard || !programReady || plan.layers.length >= 8} onClick={() => layerClipboard && onPasteLayer(systemId, layerClipboard)} title={layerClipboard ? `在${getStarSystem(systemId).name}新增“${layerClipboard.name} 副本”` : "请先复制壳层"}><ClipboardPaste size={14} />粘贴{layerClipboard ? "副本" : ""}</button>
          </div>
          <div className="dyson-layer-heading dyson-swarm-heading"><span>太阳帆轨道</span><strong>{swarmOrbits.length}/8</strong></div>
          <div className="dyson-swarm-orbit-list">
            {swarmOrbits.map((orbit, index) => (
              <button className={activeSwarmOrbit?.id === orbit.id ? "active" : ""} type="button" key={orbit.id} onClick={() => onSelectSwarmOrbit(systemId, orbit.id)}>
                <b>{String(index + 1).padStart(2, "0")}</b>
                <span><strong>{orbit.name}</strong><small>{orbit.radius.toLocaleString("zh-CN")} m · {orbit.inclination}°</small></span>
                <em title={`${formatQuantityExact(orbit.sailsInOrbit)} 帆`}>{formatQuantityCompact(orbit.sailsInOrbit)} 帆</em>
              </button>
            ))}
          </div>
          <button className="dyson-add-swarm-orbit" type="button" disabled={!isTechnologyCompleted(game, "dyson_swarm") || swarmOrbits.length >= 8} onClick={() => onAddSwarmOrbit(systemId)}><Plus size={14} />新增太阳帆轨道</button>
        </aside>

        <section className="dyson-orbit-stage">
          <div className="dyson-stage-summary">
            <span><CircleDot size={13} />节点 <strong>{totals.nodeCount}</strong></span>
            <span><GitBranch size={13} />框架 <strong>{totals.frameCount}</strong></span>
            <span><Layers3 size={13} />壳面 <strong>{totals.shellCount}</strong></span>
            <span><Rocket size={13} />施工 <strong><QuantityValue value={totals.completedStructure} />/<QuantityValue value={totals.plannedStructure} /></strong></span>
            <span><Sun size={13} />在轨 <strong><QuantityValue value={engineering.orbitSails} /></strong></span>
            <span><Gauge size={13} />理论接收 <strong>{Math.round(engineering.theoreticalReceptionRate * 100)}%</strong></span>
            <span><RadioTower size={13} />接收站 <strong>{Math.round(engineering.receiverUtilization * 100)}%</strong></span>
          </div>
          <svg className="dyson-orbit-canvas" viewBox="0 0 600 600" role="img" aria-label={`${getStarSystem(systemId).name}戴森球轨道图`} onClick={addNodeFromCanvas}>
            <circle className="dyson-star-halo" cx={VIEW_CENTER} cy={VIEW_CENTER} r={Math.max(34, Math.min(58, 38 + Math.log2(Math.max(0.1, starProfile.luminosity)) * 5))} />
            <circle className="dyson-star-core" cx={VIEW_CENTER} cy={VIEW_CENTER} r={Math.max(14, Math.min(34, 22 + Math.log2(Math.max(0.1, starProfile.radiusMultiplier)) * 4))} style={{ color: getStarSystem(systemId).color }} />
            {swarmOrbits.map((orbit) => {
              const radius = visualRadiusBySwarmOrbit.get(orbit.id) ?? 90;
              const scaleY = 0.48 + Math.abs(Math.cos(orbit.inclination * Math.PI / 180)) * 0.52;
              return <ellipse className={`dyson-swarm-orbit-ring${activeSwarmOrbit?.id === orbit.id ? " active" : ""}`} cx={VIEW_CENTER} cy={VIEW_CENTER} rx={radius} ry={radius * scaleY} transform={`rotate(${orbit.longitude} ${VIEW_CENTER} ${VIEW_CENTER})`} key={orbit.id} />;
            })}
            {swarmOrbits.flatMap((orbit, orbitIndex) => {
              if (orbit.sailsInOrbit < 1) return [];
              const radius = visualRadiusBySwarmOrbit.get(orbit.id) ?? 90;
              const count = Math.min(10, Math.max(2, Math.ceil(Math.log2(orbit.sailsInOrbit + 1))));
              return Array.from({ length: count }, (_, index) => (
                <circle
                  className="dyson-swarm-particle"
                  cx={VIEW_CENTER}
                  cy={VIEW_CENTER - radius}
                  r={index % 3 === 0 ? 2.4 : 1.7}
                  style={{ animationDelay: `${-(orbitIndex * 0.31 + index * 0.43)}s`, animationDuration: `${5.4 + orbitIndex * 0.8 + index % 5 * 0.7}s` }}
                  key={`${orbit.id}-${index}`}
                />
              ));
            })}
            {plan.layers.map((layer) => {
              const radius = visualRadiusByLayer.get(layer.id) ?? 100;
              const scaleY = 0.45 + Math.abs(Math.cos(layer.inclination * Math.PI / 180)) * 0.55;
              const active = activeLayer?.id === layer.id;
              return (
                <g className={`dyson-orbit-layer${active ? " active" : ""}`} key={layer.id} transform={`translate(${VIEW_CENTER} ${VIEW_CENTER}) rotate(${layer.longitude}) scale(1 ${scaleY.toFixed(3)})`} onClick={(event) => { event.stopPropagation(); onSelectLayer(systemId, layer.id); }}>
                  {layer.shells.map((shell) => {
                    const source = layer.nodes.find((node) => node.id === shell.sourceNodeId);
                    const target = layer.nodes.find((node) => node.id === shell.targetNodeId);
                    if (!source || !target) return null;
                    const fill = shell.sailCapacity > 0 ? shell.absorbedSails / shell.sailCapacity : 0;
                    return <path className="dyson-shell-sector" d={shellPath(layer, source.angle, target.angle, radius)} style={{ opacity: 0.12 + fill * 0.48 }} key={shell.id} />;
                  })}
                  <circle className="dyson-orbit-ring" r={radius} />
                  {layer.frames.map((frame) => {
                    const source = layer.nodes.find((node) => node.id === frame.sourceNodeId);
                    const target = layer.nodes.find((node) => node.id === frame.targetNodeId);
                    if (!source || !target) return null;
                    const start = pointAt(source.angle, radius);
                    const end = pointAt(target.angle, radius);
                    const complete = frame.completedStructurePoints >= frame.requiredStructurePoints;
                    return <line className={complete ? "dyson-frame dyson-frame--complete" : "dyson-frame"} x1={start.x} y1={start.y} x2={end.x} y2={end.y} key={frame.id} />;
                  })}
                  {layer.nodes.map((node) => {
                    const point = pointAt(node.angle, radius);
                    const complete = node.completedStructurePoints >= node.requiredStructurePoints;
                    return (
                      <circle
                        className={`dyson-orbit-node${complete ? " dyson-orbit-node--complete" : ""}${selectedNodeId === node.id ? " selected" : ""}`}
                        cx={point.x}
                        cy={point.y}
                        r={selectedNodeId === node.id ? 8 : 6}
                        key={node.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (selectedNodeId && selectedNodeId !== node.id) {
                            onConnectNodes(systemId, layer.id, selectedNodeId, node.id);
                            setSelectedNodeId(null);
                          } else {
                            setSelectedNodeId(selectedNodeId === node.id ? null : node.id);
                          }
                        }}
                      />
                    );
                  })}
                </g>
              );
            })}
          </svg>
          {!programReady ? <div className="dyson-planner-lock"><LockKeyhole size={18} /><strong>戴森球计划尚未解锁</strong></div> : null}
        </section>

        <aside className="dyson-layer-inspector">
          {activeLayer ? (
            <>
              <header><i><Orbit size={17} /></i><div><span>当前壳层</span><strong>{activeLayer.name}</strong></div><em>{activeLayer.nodes.length} 节点</em></header>
              <label className="dyson-orbit-control"><span>轨道半径 <strong>{activeLayer.radius.toLocaleString("zh-CN")} m</strong></span><input type="range" min={5000} max={50000} step={500} value={activeLayer.radius} onChange={(event) => onOrbitChange(systemId, activeLayer.id, { radius: Number(event.target.value) })} /></label>
              <label className="dyson-orbit-control"><span>轨道倾角 <strong>{activeLayer.inclination}°</strong></span><input type="range" min={-90} max={90} step={1} value={activeLayer.inclination} onChange={(event) => onOrbitChange(systemId, activeLayer.id, { inclination: Number(event.target.value) })} /></label>
              <label className="dyson-orbit-control"><span>升交点经度 <strong>{activeLayer.longitude}°</strong></span><input type="range" min={0} max={359} step={1} value={activeLayer.longitude} onChange={(event) => onOrbitChange(systemId, activeLayer.id, { longitude: Number(event.target.value) })} /></label>
              <dl className="metric-ledger dyson-layer-ledger">
                <div><dt>节点</dt><dd>{activeLayer.nodes.filter((node) => node.completedStructurePoints >= node.requiredStructurePoints).length}/{activeLayer.nodes.length}</dd></div>
                <div><dt>框架</dt><dd>{activeLayer.frames.filter((frame) => frame.completedStructurePoints >= frame.requiredStructurePoints).length}/{activeLayer.frames.length}</dd></div>
                <div><dt>壳面容量</dt><dd><QuantityValue value={activeLayer.shells.reduce((sum, shell) => sum + shell.sailCapacity, 0)} /></dd></div>
                <div><dt>已吸附太阳帆</dt><dd><QuantityValue value={activeLayer.shells.reduce((sum, shell) => sum + shell.absorbedSails, 0)} /></dd></div>
              </dl>
              <div className="dyson-layer-actions">
                <button type="button" disabled={activeLayer.nodes.length < 3} onClick={() => onAutoConnect(systemId, activeLayer.id)}><GitBranch size={14} />闭合框架</button>
                <button type="button" disabled={!shellReady || activeLayer.nodes.length < 3} onClick={() => onPlanShell(systemId, activeLayer.id)}>{shellReady ? <Layers3 size={14} /> : <LockKeyhole size={14} />}规划壳面</button>
                <button type="button" disabled={activeLayer.shells.length === 0} onClick={() => onClearShell(systemId, activeLayer.id)}><X size={14} />清除壳面</button>
              </div>
              {selectedNodeId ? (
                <div className="dyson-node-selection"><span><CircleDot size={13} />已选节点</span><strong>{activeLayer.nodes.find((node) => node.id === selectedNodeId)?.angle.toFixed(1)}°</strong><button type="button" onClick={() => { onRemoveNode(systemId, activeLayer.id, selectedNodeId); setSelectedNodeId(null); }} title="删除已选节点" aria-label="删除已选戴森节点"><Trash2 size={13} /></button></div>
              ) : null}
              <button className="dyson-layer-remove" type="button" onClick={() => { onRemoveLayer(systemId, activeLayer.id); setSelectedNodeId(null); }}><Trash2 size={14} />删除当前壳层</button>
            </>
          ) : (
            <div className="dyson-inspector-empty"><Orbit size={24} /><strong>{getStarSystem(systemId).name}</strong><span>{programReady ? "0 个规划壳层" : "科技锁定"}</span></div>
          )}
          {activeSwarmOrbit ? (
            <section className="dyson-swarm-orbit-inspector" aria-label="太阳帆轨道参数">
              <header><i><Sun size={15} /></i><span><small>太阳帆轨道</small><strong>{activeSwarmOrbit.name}</strong></span><em><QuantityValue value={activeSwarmOrbit.sailsInOrbit} unit="帆" /></em></header>
              <label className="dyson-orbit-control"><span>轨道半径 <strong>{activeSwarmOrbit.radius.toLocaleString("zh-CN")} m</strong></span><input type="range" min={5000} max={50000} step={500} value={activeSwarmOrbit.radius} onChange={(event) => onSwarmOrbitChange(systemId, activeSwarmOrbit.id, { radius: Number(event.target.value) })} /></label>
              <label className="dyson-orbit-control"><span>轨道倾角 <strong>{activeSwarmOrbit.inclination}°</strong></span><input type="range" min={-90} max={90} step={1} value={activeSwarmOrbit.inclination} onChange={(event) => onSwarmOrbitChange(systemId, activeSwarmOrbit.id, { inclination: Number(event.target.value) })} /></label>
              <label className="dyson-orbit-control"><span>升交点经度 <strong>{activeSwarmOrbit.longitude}°</strong></span><input type="range" min={0} max={359} step={1} value={activeSwarmOrbit.longitude} onChange={(event) => onSwarmOrbitChange(systemId, activeSwarmOrbit.id, { longitude: Number(event.target.value) })} /></label>
              <div className="dyson-swarm-orbit-stats"><span>发射 <QuantityValue value={activeSwarmOrbit.totalLaunched} /></span><span>衰减 <QuantityValue value={activeSwarmOrbit.totalExpired} /></span><span>{formatKilowatts(activeSwarmOrbit.generationKw)}</span></div>
              <button type="button" disabled={swarmOrbits.length <= 1} onClick={() => onRemoveSwarmOrbit(systemId, activeSwarmOrbit.id)} title="删除当前太阳帆轨道"><Trash2 size={13} />删除轨道</button>
            </section>
          ) : null}
          <section className="dyson-launch-console" aria-label="戴森发射调度">
            <header><span><RadioTower size={14} />发射调度</span><button type="button" className={engineering.launchEnabled ? "active" : ""} onClick={() => onLaunchEnabledChange(!engineering.launchEnabled)} aria-label={engineering.launchEnabled ? "暂停戴森发射" : "启用戴森发射"}>{engineering.launchEnabled ? <Pause size={13} /> : <Play size={13} />}</button></header>
            <div className="dyson-launch-mode" role="group" aria-label="发射优先级">
              {(["balanced", "swarm", "sphere"] as DysonLaunchMode[]).map((mode) => <button type="button" className={engineering.launchMode === mode ? "active" : ""} onClick={() => onLaunchModeChange(mode)} key={mode}>{{ balanced: "均衡", swarm: "太阳帆", sphere: "火箭" }[mode]}</button>)}
            </div>
            <div className="dyson-launch-throttle" role="group" aria-label="发射节流">
              {([0.25, 0.5, 0.75, 1] as DysonLaunchThrottle[]).map((throttle) => <button type="button" className={engineering.launchThrottle === throttle ? "active" : ""} onClick={() => onLaunchThrottleChange(throttle)} key={throttle}>{Math.round(throttle * 100)}%</button>)}
            </div>
            <dl className="metric-ledger dyson-engineering-ledger">
              <div><dt>太阳帆队列</dt><dd>{engineering.queuedSails} · {engineering.sailLaunchesPerMinute}/min</dd></div>
              <div><dt>运载火箭队列</dt><dd>{engineering.queuedRockets} · {engineering.rocketLaunchesPerMinute}/min</dd></div>
              <div><dt>发射能耗</dt><dd>{engineering.launchEnergyPerMinuteMj.toFixed(1)} MJ/min</dd></div>
              <div><dt>计划功率</dt><dd>{formatKilowatts(engineering.projectedGenerationKw)}</dd></div>
              <div><dt>理论接收率</dt><dd>{Math.round(engineering.theoreticalReceptionRate * 100)}%</dd></div>
              <div><dt>接收站实际利用率</dt><dd>{Math.round(engineering.receiverUtilization * 100)}%</dd></div>
              <div><dt>戴森功率利用率</dt><dd>{Math.round(engineering.dysonPowerUtilization * 100)}%</dd></div>
              <div><dt>接收站状态</dt><dd>{engineering.blockedReceiverCount > 0 ? `${engineering.blockedReceiverCount}/${engineering.configuredReceiverCount} 受阻` : `${engineering.configuredReceiverCount} 台可用`}</dd></div>
              <div><dt>临界光子</dt><dd>{engineering.criticalPhotonPerMinute.toFixed(1)}/min</dd></div>
              <div><dt>反物质</dt><dd>{engineering.antimatterPerMinute.toFixed(1)}/min</dd></div>
              <div><dt>反物质回馈</dt><dd>{formatKilowatts(engineering.feedbackGenerationKw)}</dd></div>
            </dl>
            <div className="dyson-launch-cost"><span><Zap size={12} />单次成本</span><strong>帆 {engineering.launchEnergyPerSailMj.toFixed(1)} MJ · 火箭 {engineering.launchEnergyPerRocketMj.toFixed(0)} MJ</strong></div>
          </section>
          <footer className="dyson-plan-status">
            <span>{totals.completedStructure >= totals.plannedStructure && totals.plannedStructure > 0 ? <Check size={12} /> : <Rocket size={12} />}结构点 <QuantityValue value={plan.structurePoints} /></span>
            <span><Layers3 size={12} />壳面帆 <QuantityValue value={plan.shellSails} />/<QuantityValue value={totals.sailCapacity} /></span>
          </footer>
        </aside>
      </div>
    </section>
  );
}
