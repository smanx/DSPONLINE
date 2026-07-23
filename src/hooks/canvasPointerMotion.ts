export interface CanvasPointerMotionSession {
  generation: number;
  primaryPointerId: number | null;
  pointerDown: boolean;
  dragging: boolean;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  edgeVelocityX: number;
  edgeVelocityY: number;
}

export function createCanvasPointerMotionSession(): CanvasPointerMotionSession {
  return {
    generation: 0,
    primaryPointerId: null,
    pointerDown: false,
    dragging: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    edgeVelocityX: 0,
    edgeVelocityY: 0,
  };
}

export function beginCanvasPointerMotion(
  current: CanvasPointerMotionSession,
  pointerId: number,
  x: number,
  y: number,
): CanvasPointerMotionSession {
  return {
    ...current,
    generation: current.generation + 1,
    primaryPointerId: pointerId,
    pointerDown: true,
    dragging: false,
    startX: x,
    startY: y,
    lastX: x,
    lastY: y,
    edgeVelocityX: 0,
    edgeVelocityY: 0,
  };
}

export function moveCanvasPointerMotion(
  current: CanvasPointerMotionSession,
  pointerId: number,
  x: number,
  y: number,
  dragThreshold = 8,
): CanvasPointerMotionSession {
  if (!current.pointerDown || current.primaryPointerId !== pointerId) return current;
  const dragging = current.dragging || Math.hypot(x - current.startX, y - current.startY) >= dragThreshold;
  return { ...current, dragging, lastX: x, lastY: y };
}

export function setCanvasPointerEdgeVelocity(
  current: CanvasPointerMotionSession,
  x: number,
  y: number,
): CanvasPointerMotionSession {
  if (!current.pointerDown || !current.dragging) {
    if (current.edgeVelocityX === 0 && current.edgeVelocityY === 0) return current;
    return { ...current, edgeVelocityX: 0, edgeVelocityY: 0 };
  }
  if (current.edgeVelocityX === x && current.edgeVelocityY === y) return current;
  return { ...current, edgeVelocityX: x, edgeVelocityY: y };
}

export function stopCanvasPointerMotion(current: CanvasPointerMotionSession): CanvasPointerMotionSession {
  if (current.primaryPointerId == null && !current.pointerDown && !current.dragging &&
    current.edgeVelocityX === 0 && current.edgeVelocityY === 0) return current;
  return {
    ...current,
    generation: current.generation + 1,
    primaryPointerId: null,
    pointerDown: false,
    dragging: false,
    edgeVelocityX: 0,
    edgeVelocityY: 0,
  };
}

export function canvasPointerMotionFrameIsActive(current: CanvasPointerMotionSession, generation: number): boolean {
  return current.generation === generation && current.primaryPointerId != null && current.pointerDown && current.dragging &&
    (current.edgeVelocityX !== 0 || current.edgeVelocityY !== 0);
}
