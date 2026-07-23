import { useId, useState, type KeyboardEvent, type MouseEvent } from "react";
import { formatQuantityCompact, formatQuantityExact, type QuantityInput } from "../game/quantityFormat";

export function QuantityValue({ value, unit, className = "" }: { value: QuantityInput; unit?: string; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const tooltipId = useId();
  const compact = formatQuantityCompact(value);
  const exact = formatQuantityExact(value);
  const label = unit ? `${exact} ${unit}` : exact;
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
    className={`quantity-value${expanded ? " quantity-value--expanded" : ""}${className ? ` ${className}` : ""}`}
    role="button"
    tabIndex={0}
    aria-label={label}
    aria-describedby={tooltipId}
    title={label}
    onClick={toggle}
    onKeyDown={onKeyDown}
    onBlur={() => setExpanded(false)}
  >
    <span>{compact}{unit ? <small>{unit}</small> : null}</span>
    <span className="quantity-value__tooltip" id={tooltipId} role="tooltip">{label}</span>
  </span>;
}
