import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ExactValueProps {
  className?: string;
  compact: ReactNode;
  label: string;
}

function hasCoarsePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true;
}

export function ExactValue({ className = "", compact, label }: ExactValueProps) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();
  const visible = expanded || hovered || focused;

  useEffect(() => {
    if (!expanded && !hovered) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setExpanded(false);
        if (event.type === "pointermove") setHovered(false);
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(false);
        setHovered(false);
        rootRef.current?.blur();
      }
    };
    document.addEventListener("pointerdown", closeOnOutside, true);
    document.addEventListener("pointermove", closeOnOutside, true);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside, true);
      document.removeEventListener("pointermove", closeOnOutside, true);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [expanded, hovered]);

  useLayoutEffect(() => {
    if (!visible) return;
    const position = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const right = Math.max(8, window.innerWidth - rect.right);
      setTooltipStyle(rect.top >= 54
        ? { right, bottom: Math.max(8, window.innerHeight - rect.top + 7) }
        : { right, top: Math.min(window.innerHeight - 8, rect.bottom + 7) });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [visible, label]);

  const toggle = (event: MouseEvent<HTMLSpanElement>) => {
    if (!hasCoarsePointer()) return;
    event.stopPropagation();
    setExpanded((current) => !current);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      setExpanded((current) => !current);
    } else if (event.key === "Escape") {
      setExpanded(false);
      setHovered(false);
      event.currentTarget.blur();
    }
  };

  return <>
    <span
      ref={rootRef}
      className={`quantity-value${expanded ? " quantity-value--expanded" : ""}${hovered ? " quantity-value--hovered" : ""}${className ? ` ${className}` : ""}`}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-describedby={visible ? tooltipId : undefined}
      aria-expanded={expanded}
      onClick={toggle}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(false);
          setExpanded(false);
        }
      }}
      onMouseEnter={() => setHovered(true)}
    >
      <span>{compact}</span>
    </span>
    {visible && typeof document !== "undefined" ? createPortal(
      <span className="quantity-value__tooltip" style={tooltipStyle} id={tooltipId} role="tooltip">{label}</span>,
      document.body,
    ) : null}
  </>;
}
