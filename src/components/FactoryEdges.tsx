import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, type ConnectionLineComponentProps, type Edge, type EdgeProps } from "@xyflow/react";
import { memo } from "react";
import type { BeltRouteMode, ItemId } from "../game/types";
import type { BeltHealth } from "../game/network";

interface PathPoint {
  x: number;
  y: number;
}

function roundedOrthogonalPath(points: PathPoint[], radius = 8): string {
  const compact = points.filter((point, index) => {
    if (index === 0) return true;
    const previous = points[index - 1];
    return Math.abs(point.x - previous.x) > 0.01 || Math.abs(point.y - previous.y) > 0.01;
  });
  if (compact.length < 2) return "";
  let path = `M${compact[0].x} ${compact[0].y}`;
  for (let index = 1; index < compact.length - 1; index += 1) {
    const previous = compact[index - 1];
    const corner = compact[index];
    const next = compact[index + 1];
    const incoming = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const outgoing = Math.hypot(next.x - corner.x, next.y - corner.y);
    if (incoming < 0.01 || outgoing < 0.01) continue;
    const cornerRadius = Math.min(radius, incoming / 2, outgoing / 2);
    const before = {
      x: corner.x - (corner.x - previous.x) / incoming * cornerRadius,
      y: corner.y - (corner.y - previous.y) / incoming * cornerRadius,
    };
    const after = {
      x: corner.x + (next.x - corner.x) / outgoing * cornerRadius,
      y: corner.y + (next.y - corner.y) / outgoing * cornerRadius,
    };
    path += `L${before.x} ${before.y}Q${corner.x} ${corner.y} ${after.x} ${after.y}`;
  }
  const last = compact[compact.length - 1];
  return `${path}L${last.x} ${last.y}`;
}

function controlledOrthogonalPath(sourceX: number, sourceY: number, targetX: number, targetY: number, centerY: number) {
  const direction = targetX >= sourceX ? 1 : -1;
  const lead = Math.min(34, Math.max(18, Math.abs(targetX - sourceX) / 4));
  const sourceLeadX = sourceX + lead * direction;
  const targetLeadX = targetX - lead * direction;
  return [
    roundedOrthogonalPath([
      { x: sourceX, y: sourceY },
      { x: sourceLeadX, y: sourceY },
      { x: sourceLeadX, y: centerY },
      { x: targetLeadX, y: centerY },
      { x: targetLeadX, y: targetY },
      { x: targetX, y: targetY },
    ]),
    (sourceLeadX + targetLeadX) / 2,
    centerY,
  ] as const;
}

export interface FactoryEdgeData extends Record<string, unknown> {
  visualSignature: string;
  itemId: ItemId;
  itemName: string;
  itemSymbol: string;
  color: string;
  tier: number;
  flow: number;
  capacity: number;
  stackSize: 1 | 2 | 4;
  congestion: number;
  monitored: boolean;
  durationSeconds: number;
  detailVisible: boolean;
  motionEnabled: boolean;
  batched: boolean;
  routeMode: BeltRouteMode;
  routeCenterY?: number;
  bundleIndex: number;
  bundleSize: number;
  health: BeltHealth;
  taskTone?: "normal" | "focus" | "dim" | "line-upstream" | "line-downstream" | "line-dim";
}

export type FactoryFlowEdge = Edge<FactoryEdgeData, "factory">;

/**
 * The default React Flow preview is easy to miss against a dense factory
 * canvas. Keep the preview in the same visual language as a belt, while
 * exposing valid/invalid state before the pointer is released.
 */
export function FactoryConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
  toPosition,
  connectionStatus,
}: ConnectionLineComponentProps) {
  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
  });
  const tone = connectionStatus === "valid" ? "valid" : connectionStatus === "invalid" ? "invalid" : "pending";
  const color = tone === "valid" ? "#8de0a9" : tone === "invalid" ? "#ef9b8f" : "#79d9ca";
  return (
    <g className={`factory-connection-preview factory-connection-preview--${tone}`} aria-hidden="true">
      <path className="factory-connection-preview__halo" d={path} />
      <path className="factory-connection-preview__path" d={path} style={{ stroke: color }} />
      <circle className="factory-connection-preview__target" cx={toX} cy={toY} r="7" style={{ fill: color }} />
    </g>
  );
}

export function FactoryEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  interactionWidth,
  selected,
  data,
}: EdgeProps<FactoryFlowEdge>) {
  const orthogonal = data?.routeMode !== "bezier";
  const route = orthogonal
    ? data?.routeCenterY !== undefined
      ? controlledOrthogonalPath(sourceX, sourceY, targetX, targetY, data.routeCenterY)
      : getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      centerY: data?.routeCenterY,
      borderRadius: 8,
      offset: 24,
      })
    : getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const [path, labelX, labelY] = route;
  if (data?.batched) {
    return <BaseEdge id={id} path={path} interactionWidth={interactionWidth} style={{ ...style, opacity: 0 }} />;
  }
  const active = Boolean(data && data.flow > 0.001);
  const packetCount = data ? Math.max(1, Math.min(4, Math.ceil(data.flow / Math.max(0.001, data.capacity) * 4))) : 0;
  const duration = data?.durationSeconds ?? 1;
  const visualPadding = 48;
  const visualLeft = Math.min(sourceX, targetX) - visualPadding;
  const visualTop = Math.min(sourceY, targetY, data?.routeCenterY ?? Number.POSITIVE_INFINITY) - visualPadding;
  const visualWidth = Math.max(1, Math.abs(targetX - sourceX) + visualPadding * 2);
  const visualBottom = Math.max(sourceY, targetY, data?.routeCenterY ?? Number.NEGATIVE_INFINITY) + visualPadding;
  const visualHeight = Math.max(1, visualBottom - visualTop);
  const taskTone = data?.taskTone ?? "normal";
  return (
    <>
      {/* The hit path is intentionally invisible; the visual portal is rendered below cards. */}
      <BaseEdge id={id} path={path} interactionWidth={interactionWidth} style={{ ...style, opacity: 0 }} />
      <EdgeLabelRenderer>
        <svg
          className={`factory-edge-visual-layer factory-edge-visual-layer--${taskTone}`}
          aria-hidden="true"
          width={visualWidth}
          height={visualHeight}
          viewBox={`${visualLeft} ${visualTop} ${visualWidth} ${visualHeight}`}
          preserveAspectRatio="none"
          style={{ left: visualLeft, top: visualTop }}
        >
          <path
            className={`factory-edge-visual-path factory-edge-visual-path--${data?.health ?? "idle"}${active ? " factory-edge-visual-path--active" : ""}${selected ? " factory-edge-visual-path--selected" : ""}`}
            d={path}
            markerEnd={markerEnd}
            style={style}
          />
          {active && data?.motionEnabled ? (
            <g className="factory-cargo-packets">
              {Array.from({ length: packetCount }, (_, index) => (
                <circle className="factory-cargo-packet" cx="0" cy="0" r={selected ? 5 : 4} fill={data.color} key={index}>
                  <animateMotion path={path} dur={`${duration}s`} begin={`${-(duration / packetCount) * index}s`} repeatCount="indefinite" />
                </circle>
              ))}
            </g>
          ) : null}
        </svg>
        {data?.detailVisible ? (
          <div
            className={`react-flow__edge-text factory-edge-label nodrag nopan factory-edge-label--${taskTone}${selected ? " factory-edge-label--selected" : ""}${data.congestion > 0.8 ? " factory-edge-label--congested" : ""}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            <i style={{ backgroundColor: data.color }}>{data.itemSymbol}</i>
            <span>Mk.{data.tier === 3 ? "III" : data.tier === 2 ? "II" : "I"}</span>
            {data.bundleSize > 1 ? <em>束 {data.bundleIndex + 1}/{data.bundleSize}</em> : null}
            {data.stackSize > 1 ? <em>×{data.stackSize}</em> : null}
            <strong>{data.flow.toFixed(1)} / {data.capacity.toFixed(0)} s⁻¹</strong>
            {data.monitored ? <b>{Math.round(data.congestion * 100)}%</b> : null}
          </div>
        ) : null}
      </EdgeLabelRenderer>
    </>
  );
}

const MemoFactoryEdge = memo(FactoryEdge, (previous, next) =>
  previous.id === next.id &&
  previous.selected === next.selected &&
  previous.sourceX === next.sourceX &&
  previous.sourceY === next.sourceY &&
  previous.targetX === next.targetX &&
  previous.targetY === next.targetY &&
  previous.data?.visualSignature === next.data?.visualSignature,
);

export const EDGE_TYPES = { factory: MemoFactoryEdge };
