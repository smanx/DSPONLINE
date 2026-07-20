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
  durationSeconds: number;
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
  selected,
  data,
}: EdgeProps<FactoryFlowEdge>) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const active = Boolean(data && data.flow > 0.001);
  const packetCount = data ? Math.max(1, Math.min(4, Math.ceil(data.flow / Math.max(0.001, data.capacity) * 4))) : 0;
  const duration = data?.durationSeconds ?? 1;
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {active && data ? (
        <g className="factory-cargo-packets" aria-hidden="true">
          {Array.from({ length: packetCount }, (_, index) => (
            <circle className="factory-cargo-packet" cx="0" cy="0" r={selected ? 5 : 4} fill={data.color} key={index}>
              <animateMotion path={path} dur={`${duration}s`} begin={`${-(duration / packetCount) * index}s`} repeatCount="indefinite" />
            </circle>
          ))}
        </g>
      ) : null}
      {data ? (
        <EdgeLabelRenderer>
          <div
            className={`react-flow__edge-text factory-edge-label nodrag nopan${selected ? " factory-edge-label--selected" : ""}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            <i style={{ backgroundColor: data.color }}>{data.itemSymbol}</i>
            <span>Mk.{data.tier === 3 ? "III" : data.tier === 2 ? "II" : "I"}</span>
            <strong>{data.flow.toFixed(1)} / {data.capacity.toFixed(0)} s⁻¹</strong>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const EDGE_TYPES = { factory: FactoryEdge };
