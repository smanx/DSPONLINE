import { formatQuantityCompact, formatQuantityExact, type QuantityInput } from "../game/quantityFormat";
import { ExactValue } from "./ExactValue";

export function QuantityValue({ value, unit, className = "" }: { value: QuantityInput; unit?: string; className?: string }) {
  const compact = formatQuantityCompact(value);
  const exact = formatQuantityExact(value);
  const label = unit ? `${exact} ${unit}` : exact;
  return <ExactValue
    className={className}
    compact={<>{compact}{unit ? <small>{unit}</small> : null}</>}
    label={label}
  />;
}
