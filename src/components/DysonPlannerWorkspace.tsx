import { Check, CircleDot, GitBranch, Layers3, LockKeyhole, Orbit, Plus, Rocket, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import { STAR_SYSTEM_LIST, getPlanet, getStarSystem } from "../game/content";
import { getDysonPlanTotals, isStarSystemUnlocked, isTechnologyCompleted } from "../game/engine";
import type { DysonLayerState, GameState, StarSystemId } from "../game/types";

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
  onAddNode,
  onRemoveNode,
  onConnectNodes,
  onAutoConnect,
  onPlanShell,
  onClearShell,
}: {
  open: boolean;
  game: GameState;
  onClose: () => void;
  onAddLayer: (systemId: StarSystemId) => void;
  onAddStandardLayer: (systemId: StarSystemId) => void;
  onSelectLayer: (systemId: StarSystemId, layerId: string) => void;
  onOrbitChange: (systemId: StarSystemId, layerId: string, orbit: { radius?: number; inclination?: number; longitude?: number }) => void;
  onRemoveLayer: (systemId: StarSystemId, layerId: string) => void;
  onAddNode: (systemId: StarSystemId, layerId: string, angle: number) => void;
  onRemoveNode: (systemId: StarSystemId, layerId: string, nodeId: string) => void;
  onConnectNodes: (systemId: StarSystemId, layerId: string, sourceNodeId: string, targetNodeId: string) => void;
  onAutoConnect: (systemId: StarSystemId, layerId: string) => void;
  onPlanShell: (systemId: StarSystemId, layerId: string) => void;
  onClearShell: (systemId: StarSystemId, layerId: string) => void;
}) {
  const activePlanetSystem = getPlanet(game.activePlanetId).systemId;
  const [systemId, setSystemId] = useState<StarSystemId>(activePlanetSystem);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  useEffect(() => {
    if (open) setSystemId(activePlanetSystem);
  }, [activePlanetSystem, open]);
  useEffect(() => setSelectedNodeId(null), [systemId]);
  const plan = game.dysonPlans[systemId];
  const activeLayer = plan.layers.find((layer) => layer.id === plan.activeLayerId) ?? plan.layers[0] ?? null;
  const totals = getDysonPlanTotals(plan);
  const programReady = isTechnologyCompleted(game, "dyson_sphere_program");
  const shellReady = isTechnologyCompleted(game, "dyson_shell");
  const maximumRadius = Math.max(50_000, ...plan.layers.map((layer) => layer.radius));
  const visualRadiusByLayer = useMemo(() => new Map(plan.layers.map((layer) => [
    layer.id,
    76 + layer.radius / maximumRadius * 190,
  ])), [maximumRadius, plan.layers]);

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
          <span>结构 <strong>{game.dysonSphere.structurePoints}</strong></span>
          <span>壳面帆 <strong>{game.dysonSphere.shellSails}</strong></span>
          <span>功率 <strong>{(game.dysonSphere.generationKw / 1000).toFixed(2)} MW</strong></span>
        </div>
        <button className="dyson-planner-close" type="button" onClick={onClose} title="关闭戴森球规划" aria-label="关闭戴森球规划"><X size={18} /></button>
      </header>

      <div className="dyson-planner-layout">
        <aside className="dyson-plan-sidebar">
          <div className="dyson-system-tabs" aria-label="戴森球恒星系">
            {STAR_SYSTEM_LIST.filter((system) => isStarSystemUnlocked(game, system.id)).map((system) => (
              <button className={systemId === system.id ? "active" : ""} type="button" key={system.id} onClick={() => setSystemId(system.id)} title={`规划${system.name}戴森球`}>
                <i style={{ color: system.color }}><Sparkles size={14} /></i><span><strong>{system.name}</strong><small>{system.starType}</small></span>
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
                  <b>{String(index + 1).padStart(2, "0")}</b><span><strong>{layer.name}</strong><small>{layer.radius.toLocaleString("zh-CN")} m · {layer.nodes.length} 节点</small></span><em>{completed}/{layerStructure}</em>
                </button>
              );
            })}
            {plan.layers.length === 0 ? <div className="dyson-layer-empty"><Orbit size={18} /><span>尚无壳层方案</span></div> : null}
          </div>
          <div className="dyson-layer-commands">
            <button type="button" disabled={!programReady || plan.layers.length >= 8} onClick={() => onAddLayer(systemId)} title="新建空白壳层"><Plus size={14} />空白层</button>
            <button type="button" disabled={!programReady || plan.layers.length >= 8} onClick={() => onAddStandardLayer(systemId)} title="新建八节点闭合标准壳层"><Layers3 size={14} />标准层</button>
          </div>
        </aside>

        <section className="dyson-orbit-stage">
          <div className="dyson-stage-summary">
            <span><CircleDot size={13} />节点 <strong>{totals.nodeCount}</strong></span>
            <span><GitBranch size={13} />框架 <strong>{totals.frameCount}</strong></span>
            <span><Layers3 size={13} />壳面 <strong>{totals.shellCount}</strong></span>
            <span><Rocket size={13} />施工 <strong>{totals.completedStructure}/{totals.plannedStructure}</strong></span>
          </div>
          <svg className="dyson-orbit-canvas" viewBox="0 0 600 600" role="img" aria-label={`${getStarSystem(systemId).name}戴森球轨道图`} onClick={addNodeFromCanvas}>
            <circle className="dyson-star-halo" cx={VIEW_CENTER} cy={VIEW_CENTER} r="42" />
            <circle className="dyson-star-core" cx={VIEW_CENTER} cy={VIEW_CENTER} r="24" style={{ color: getStarSystem(systemId).color }} />
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
                <div><dt>壳面容量</dt><dd>{activeLayer.shells.reduce((sum, shell) => sum + shell.sailCapacity, 0)}</dd></div>
                <div><dt>已吸附太阳帆</dt><dd>{activeLayer.shells.reduce((sum, shell) => sum + shell.absorbedSails, 0)}</dd></div>
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
          <footer className="dyson-plan-status">
            <span>{totals.completedStructure >= totals.plannedStructure && totals.plannedStructure > 0 ? <Check size={12} /> : <Rocket size={12} />}结构点 {plan.structurePoints}</span>
            <span><Layers3 size={12} />壳面帆 {plan.shellSails}/{totals.sailCapacity}</span>
          </footer>
        </aside>
      </div>
    </section>
  );
}
