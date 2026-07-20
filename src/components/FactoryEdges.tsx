import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";
import type { ItemId } from "../game/types";

export interface FactoryEdgeData extends Record<string, unknown> {
  itemId: ItemId;
  itemName: string;
  itemSymbol: string;
  color: string;
  tier: 1 | 2 | 3;
  flow: number;
  capacity: number;
  stackSize: 1 | 2 | 4;
  congestion: number;
  monitored: boolean;
  durationSeconds: number;
  detailVisible: boolean;
  motionEnabled: boolean;
  taskTone?: "normal" | "focus" | "dim";
}

export type FactoryFlowEdge = Edge<FactoryEdgeData, "factory">;

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
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const active = Boolean(data && data.flow > 0.001);
  const packetCount = data ? Math.max(1, Math.min(4, Math.ceil(data.flow / Math.max(0.001, data.capacity) * 4))) : 0;
  const duration = data?.durationSeconds ?? 1;
  const visualPadding = 48;
  const visualLeft = Math.min(sourceX, targetX) - visualPadding;
  const visualTop = Math.min(sourceY, targetY) - visualPadding;
  const visualWidth = Math.max(1, Math.abs(targetX - sourceX) + visualPadding * 2);
  const visualHeight = Math.max(1, Math.abs(targetY - sourceY) + visualPadding * 2);
  const taskTone = data?.taskTone ?? "normal";
  return (
    <>
      {/* The edge wrapper stays on top only for its transparent interaction path. */}
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
            className={`factory-edge-visual-path${active ? " factory-edge-visual-path--active" : ""}${selected ? " factory-edge-visual-path--selected" : ""}`}
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
            {data.stackSize > 1 ? <em>×{data.stackSize}</em> : null}
            <strong>{data.flow.toFixed(1)} / {data.capacity.toFixed(0)} s⁻¹</strong>
            {data.monitored ? <b>{Math.round(data.congestion * 100)}%</b> : null}
          </div>
        ) : null}
      </EdgeLabelRenderer>
    </>
  );
}

export const EDGE_TYPES = { factory: FactoryEdge };
