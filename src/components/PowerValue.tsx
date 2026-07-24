import { useId, useState, type KeyboardEvent, type MouseEvent } from "react";
import { formatPowerKw, formatPowerKwExact } from "../game/units";

export function PowerValue({ valueKw, className = "" }: { valueKw: number; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const tooltipId = useId();
  const compact = formatPowerKw(valueKw);
  const exact = formatPowerKwExact(valueKw);
  const toggle = (event: MouseEvent<HTMLSpanElement>) => {
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
    }
  };
  return <span
    className={`quantity-value power-value${expanded ? " quantity-value--expanded" : ""}${className ? ` ${className}` : ""}`}
    role="button"
    tabIndex={0}
    aria-label={exact}
    aria-describedby={tooltipId}
    title={exact}
    onClick={toggle}
    onKeyDown={onKeyDown}
    onBlur={() => setExpanded(false)}
  >
    <span>{compact}</span>
    <span className="quantity-value__tooltip" id={tooltipId} role="tooltip">{exact}</span>
  </span>;
}
