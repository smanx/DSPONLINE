import { ChevronDown, ChevronUp, GripHorizontal, X } from "lucide-react";
import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import type { MobileSheetSnap } from "../../hooks/useMobileNavigation";
import { alignToDevicePixel } from "../../game/displayPixels";

const SNAP_ORDER: MobileSheetSnap[] = ["peek", "half", "full"];

export function MobileSheetFrame({ title, detail, snap, allowPeek = false, onSnap, onClose, children, footer, className = "" }: {
  title: string;
  detail?: string;
  snap: MobileSheetSnap;
  allowPeek?: boolean;
  onSnap: (snap: MobileSheetSnap) => void;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const dragRef = useRef<{ pointerId: number; y: number } | null>(null);
  const [dragY, setDragY] = useState(0);
  const minimumIndex = allowPeek ? 0 : 1;
  const snapIndex = SNAP_ORDER.indexOf(snap);

  const finishDrag = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    } catch { /* Pointer capture may already be released by the browser. */ }
    const delta = event.clientY - drag.y;
    setDragY(0);
    if (delta < -48 && snapIndex < SNAP_ORDER.length - 1) onSnap(SNAP_ORDER[snapIndex + 1]);
    else if (delta > 48 && snapIndex > minimumIndex) onSnap(SNAP_ORDER[snapIndex - 1]);
    else if (delta > 64 && snapIndex === minimumIndex) onClose();
  };

  return (
    <div className="mobile-next-sheet-layer" data-sheet-snap={snap}>
      <button className="mobile-next-sheet-backdrop" type="button" onClick={onClose} aria-label={`关闭${title}`} />
      <section
        className={`mobile-next-sheet mobile-next-sheet--${snap}${dragY !== 0 ? " mobile-next-sheet--dragging" : ""}${className ? ` ${className}` : ""}`}
        style={dragY !== 0 ? { "--mobile-sheet-drag-y": `${alignToDevicePixel(Math.max(-36, dragY))}px` } as CSSProperties : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header
          className="mobile-next-sheet__handle"
          onPointerDown={(event) => {
            if (event.button !== 0 || event.target instanceof Element && event.target.closest("button")) return;
            dragRef.current = { pointerId: event.pointerId, y: event.clientY };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            setDragY(alignToDevicePixel(event.clientY - drag.y));
          }}
          onPointerUp={finishDrag}
          onPointerCancel={(event) => {
            dragRef.current = null;
            setDragY(0);
            try {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            } catch { /* Pointer capture may already be released by the browser. */ }
          }}
        >
          <i aria-hidden="true"><GripHorizontal size={22} /></i>
          <span><strong>{title}</strong>{detail ? <small>{detail}</small> : null}</span>
          <nav aria-label={`${title}抽屉高度`}>
            {snapIndex < SNAP_ORDER.length - 1 ? <button type="button" onClick={() => onSnap(SNAP_ORDER[snapIndex + 1])} aria-label={`展开${title}`}><ChevronUp size={20} /></button> : null}
            {snapIndex > minimumIndex ? <button type="button" onClick={() => onSnap(SNAP_ORDER[snapIndex - 1])} aria-label={`收起${title}`}><ChevronDown size={20} /></button> : null}
            <button type="button" onClick={onClose} aria-label={`关闭${title}`}><X size={20} /></button>
          </nav>
        </header>
        <div className="mobile-next-sheet__content">{children}</div>
        {footer ? <footer className="mobile-next-sheet__footer">{footer}</footer> : null}
      </section>
    </div>
  );
}
