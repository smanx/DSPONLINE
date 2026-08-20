import { formatPowerKw, formatPowerKwExact } from "../game/units";
import { ExactValue } from "./ExactValue";

export function PowerValue({ valueKw, className = "", interactive = true }: { valueKw: number; className?: string; interactive?: boolean }) {
  const compact = formatPowerKw(valueKw);
  const exact = formatPowerKwExact(valueKw);
  return <ExactValue className={`power-value${className ? ` ${className}` : ""}`} compact={compact} label={exact} interactive={interactive} />;
}
