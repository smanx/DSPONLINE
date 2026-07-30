export interface FormatPowerOptions {
  maximumFractionDigits?: number;
}

const POWER_UNITS = [
  { unit: "kW", divisor: 1 },
  { unit: "MW", divisor: 1_000 },
  { unit: "GW", divisor: 1_000_000 },
  { unit: "TW", divisor: 1_000_000_000 },
  { unit: "PW", divisor: 1_000_000_000_000 },
  { unit: "EW", divisor: 1_000_000_000_000_000 },
  { unit: "ZW", divisor: 1_000_000_000_000_000_000 },
  { unit: "YW", divisor: 1_000_000_000_000_000_000_000 },
  { unit: "RW", divisor: 1_000_000_000_000_000_000_000_000 },
  { unit: "QW", divisor: 1_000_000_000_000_000_000_000_000_000 },
] as const;

function safePower(valueKw: number): number {
  if (!Number.isFinite(valueKw)) return 0;
  return Object.is(valueKw, -0) ? 0 : valueKw;
}

function automaticDigits(scaled: number): number {
  const absolute = Math.abs(scaled);
  if (absolute < 10) return 2;
  if (absolute < 100) return 1;
  return 0;
}

export function formatPowerKw(valueKw: number, options: FormatPowerOptions = {}): string {
  const value = safePower(valueKw);
  const absolute = Math.abs(value);
  let unitIndex = 0;
  for (let index = 1; index < POWER_UNITS.length; index += 1) {
    if (absolute < POWER_UNITS[index].divisor) break;
    unitIndex = index;
  }
  let scaled = value / POWER_UNITS[unitIndex].divisor;
  let digits = options.maximumFractionDigits ?? automaticDigits(scaled);
  let rounded = Number(scaled.toFixed(digits));
  if (Math.abs(rounded) >= 1_000 && unitIndex < POWER_UNITS.length - 1) {
    unitIndex += 1;
    scaled = value / POWER_UNITS[unitIndex].divisor;
    digits = options.maximumFractionDigits ?? automaticDigits(scaled);
    rounded = Number(scaled.toFixed(digits));
  }
  if (unitIndex === POWER_UNITS.length - 1 && Math.abs(rounded) > 999) {
    return `${scaled.toExponential(2).replace("e+", "e")} QW`;
  }
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  return `${normalized.toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })} ${POWER_UNITS[unitIndex].unit}`;
}

export function formatPowerKwExact(valueKw: number): string {
  const value = safePower(valueKw);
  return `${value.toLocaleString("zh-CN", { maximumFractionDigits: 6 })} kW`;
}

/** @deprecated Use formatPowerKw for all new power displays. */
export function formatKilowatts(value: number, maximumFractionDigits?: number): string {
  return formatPowerKw(value, maximumFractionDigits === undefined ? {} : { maximumFractionDigits });
}
