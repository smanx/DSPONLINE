export type DecimalIntegerString = string;
export type QuantityInput = number | bigint | DecimalIntegerString;

interface ParsedQuantity {
  negative: boolean;
  digits: string;
}

const CHINESE_LARGE_NUMBER_UNITS = [
  { divisorZeros: 4, suffix: "万" },
  { divisorZeros: 8, suffix: "亿" },
  { divisorZeros: 12, suffix: "兆" },
  { divisorZeros: 16, suffix: "京" },
  { divisorZeros: 20, suffix: "垓" },
  { divisorZeros: 24, suffix: "秭" },
  { divisorZeros: 28, suffix: "穰" },
  { divisorZeros: 32, suffix: "沟" },
  { divisorZeros: 36, suffix: "涧" },
  { divisorZeros: 40, suffix: "正" },
  { divisorZeros: 44, suffix: "载" },
] as const;

function parseQuantity(value: QuantityInput): ParsedQuantity | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const integer = Math.trunc(value);
    const negative = integer < 0;
    // Number#toString switches to exponent notation at 1e21. BigInt expands
    // the represented integer without introducing an invalid `e+` digit run.
    return { negative, digits: BigInt(Math.abs(integer)).toString() };
  }
  const raw = typeof value === "bigint" ? value.toString() : value.trim();
  if (!/^-?\d+$/.test(raw)) return null;
  const negative = raw.startsWith("-");
  const digits = raw.replace(/^-/, "").replace(/^0+(?=\d)/, "");
  return { negative: negative && digits !== "0", digits };
}

function groupedDigits(digits: string): string {
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) groups.unshift(digits.slice(Math.max(0, end - 3), end));
  return groups.join(",");
}

function decimalScaled(digits: string, divisorZeros: number): string {
  const wholeLength = Math.max(0, digits.length - divisorZeros);
  const whole = wholeLength > 0 ? digits.slice(0, wholeLength) : "0";
  const paddedFraction = `${"0".repeat(Math.max(0, divisorZeros - digits.length))}${digits.slice(wholeLength)}`;
  const numericWhole = Number(whole);
  const decimalPlaces = numericWhole < 10 ? 2 : numericWhole < 100 ? 1 : 0;
  if (decimalPlaces === 0) return whole;
  const fraction = paddedFraction.slice(0, decimalPlaces).padEnd(decimalPlaces, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export function formatQuantityExact(value: QuantityInput): string {
  const parsed = parseQuantity(value);
  if (!parsed) return "--";
  return `${parsed.negative ? "-" : ""}${groupedDigits(parsed.digits)}`;
}

export function formatQuantityScientific(value: QuantityInput): string {
  const parsed = parseQuantity(value);
  if (!parsed) return "--";
  if (parsed.digits === "0") return "0";
  const significant = parsed.digits.padEnd(4, "0").slice(0, 4);
  const fraction = significant.slice(1).replace(/0+$/, "");
  const mantissa = fraction ? `${significant[0]}.${fraction}` : significant[0];
  return `${parsed.negative ? "-" : ""}${mantissa}e+${parsed.digits.length - 1}`;
}

export function formatQuantityCompact(value: QuantityInput): string {
  const parsed = parseQuantity(value);
  if (!parsed) return "--";
  const sign = parsed.negative ? "-" : "";
  if (parsed.digits.length < 5) return `${sign}${groupedDigits(parsed.digits)}`;
  const unit = CHINESE_LARGE_NUMBER_UNITS.find(({ divisorZeros }) => parsed.digits.length <= divisorZeros + 4);
  if (unit) return `${sign}${decimalScaled(parsed.digits, unit.divisorZeros)}${unit.suffix}`;
  return formatQuantityScientific(`${sign}${parsed.digits}`);
}

export function normalizeDecimalIntegerString(value: unknown, fallback = "0", maximumDigits = 64): DecimalIntegerString {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return fallback;
    return Math.floor(value).toString();
  }
  if (typeof value === "bigint") return value < 0n ? fallback : value.toString();
  if (typeof value !== "string" || !/^\d+$/.test(value)) return fallback;
  const normalized = value.replace(/^0+(?=\d)/, "");
  return normalized.length <= maximumDigits ? normalized : fallback;
}
