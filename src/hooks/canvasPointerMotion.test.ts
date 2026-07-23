import { describe, expect, it } from "vitest";
import {
  beginCanvasPointerMotion,
  canvasPointerMotionFrameIsActive,
  createCanvasPointerMotionSession,
  moveCanvasPointerMotion,
  setCanvasPointerEdgeVelocity,
  stopCanvasPointerMotion,
} from "./canvasPointerMotion";

describe("canvas pointer motion session", () => {
  it("requires a pressed pointer to cross the drag threshold before edge motion", () => {
    let session = beginCanvasPointerMotion(createCanvasPointerMotionSession(), 7, 10, 10);
    session = moveCanvasPointerMotion(session, 7, 15, 15);
    session = setCanvasPointerEdgeVelocity(session, 4, 0);
    expect(session.dragging).toBe(false);
    expect(session.edgeVelocityX).toBe(0);
    session = moveCanvasPointerMotion(session, 7, 24, 10);
    session = setCanvasPointerEdgeVelocity(session, 4, 0);
    expect(canvasPointerMotionFrameIsActive(session, session.generation)).toBe(true);
  });

  it("invalidates stale RAF generations and stops idempotently", () => {
    let session = beginCanvasPointerMotion(createCanvasPointerMotionSession(), 1, 0, 0);
    session = moveCanvasPointerMotion(session, 1, 20, 0);
    session = setCanvasPointerEdgeVelocity(session, 4, 0);
    const staleGeneration = session.generation;
    const stopped = stopCanvasPointerMotion(session);
    expect(canvasPointerMotionFrameIsActive(stopped, staleGeneration)).toBe(false);
    expect(stopCanvasPointerMotion(stopped)).toBe(stopped);
  });

  it("second-pointer takeover cannot revive the first pointer motion", () => {
    let session = beginCanvasPointerMotion(createCanvasPointerMotionSession(), 1, 0, 0);
    session = moveCanvasPointerMotion(session, 1, 20, 0);
    session = setCanvasPointerEdgeVelocity(session, 4, 0);
    const firstGeneration = session.generation;
    session = stopCanvasPointerMotion(session);
    expect(moveCanvasPointerMotion(session, 1, 40, 0)).toBe(session);
    expect(canvasPointerMotionFrameIsActive(session, firstGeneration)).toBe(false);
  });
});
