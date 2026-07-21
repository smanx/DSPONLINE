import { useRef, useState, type HTMLAttributes, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";

type HorizontalPanBindings<T extends HTMLElement> = Pick<HTMLAttributes<T>,
  "onWheel" | "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onContextMenu">;

export function useHorizontalPan<T extends HTMLElement>(): { bindings: HorizontalPanBindings<T>; isPanning: boolean } {
  const dragRef = useRef<{ pointerId: number; startX: number; startScrollLeft: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const finishPan = (event: ReactPointerEvent<T>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setIsPanning(false);
  };

  return {
    isPanning,
    bindings: {
      onWheel: (event) => {
        const wheelEvent = event as ReactWheelEvent<T>;
        const surface = wheelEvent.currentTarget;
        if (surface.scrollWidth <= surface.clientWidth) return;
        const delta = Math.abs(wheelEvent.deltaY) >= Math.abs(wheelEvent.deltaX) ? wheelEvent.deltaY : wheelEvent.deltaX;
        if (delta === 0) return;
        surface.scrollLeft += delta;
        wheelEvent.preventDefault();
      },
      onPointerDown: (event) => {
        const pointerEvent = event as ReactPointerEvent<T>;
        if (pointerEvent.button !== 2) return;
        pointerEvent.preventDefault();
        pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
        dragRef.current = {
          pointerId: pointerEvent.pointerId,
          startX: pointerEvent.clientX,
          startScrollLeft: pointerEvent.currentTarget.scrollLeft,
        };
        setIsPanning(true);
      },
      onPointerMove: (event) => {
        const pointerEvent = event as ReactPointerEvent<T>;
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== pointerEvent.pointerId) return;
        pointerEvent.currentTarget.scrollLeft = drag.startScrollLeft - (pointerEvent.clientX - drag.startX);
      },
      onPointerUp: (event) => finishPan(event as ReactPointerEvent<T>),
      onPointerCancel: (event) => finishPan(event as ReactPointerEvent<T>),
      onContextMenu: (event) => event.preventDefault(),
    },
  };
}
