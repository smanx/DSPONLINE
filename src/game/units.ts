export function formatKilowatts(value: number, maximumFractionDigits = 0): string {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  return `${safe.toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  })} kW`;
}
