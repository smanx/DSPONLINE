import { formatQuantityCompact, formatQuantityExact, type QuantityInput } from "../game/quantityFormat";
import { ExactValue } from "./ExactValue";

export function QuantityValue({ value, unit, className = "", interactive = true }: { value: QuantityInput; unit?: string; className?: string; interactive?: boolean }) {
  const compact = formatQuantityCompact(value);
  const exact = formatQuantityExact(value);
  const label = unit ? `${exact} ${unit}` : exact;
  return <ExactValue
    className={className}
    compact={<>{compact}{unit ? <small>{unit}</small> : null}</>}
    label={label}
    interactive={interactive}
  />;
}
