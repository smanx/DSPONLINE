import { formatQuantityCompact } from "./quantityFormat";

export function formatKilowatts(value: number, maximumFractionDigits = 0): string {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (safe >= 10_000) return `${formatQuantityCompact(Math.floor(safe))} kW`;
  return `${safe.toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  })} kW`;
}
