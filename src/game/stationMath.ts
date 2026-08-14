import type { DecimalIntegerString } from "./types";

export const STATION_MAX_INTEGER_DIGITS = 256;

function cappedDecimal(value: bigint): DecimalIntegerString {
  if (value <= 0n) return "0";
  const text = value.toString();
  return text.length <= STATION_MAX_INTEGER_DIGITS
    ? text
    : "9".repeat(STATION_MAX_INTEGER_DIGITS);
}

export function normalizeStationInteger(
  value: unknown,
  fallback: DecimalIntegerString = "0",
): DecimalIntegerString {
  if (typeof value === "bigint") {
    const text = value.toString();
    return value >= 0n && text.length <= STATION_MAX_INTEGER_DIGITS ? text : fallback;
  }
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : fallback;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value)) return fallback;
  const normalized = value.replace(/^0+(?=\d)/, "");
  return normalized.length <= STATION_MAX_INTEGER_DIGITS ? normalized : fallback;
}

export function stationInteger(value: unknown): bigint {
  return BigInt(normalizeStationInteger(value));
}

export function addStationInteger(left: unknown, right: unknown): DecimalIntegerString {
  return cappedDecimal(stationInteger(left) + stationInteger(right));
}

export function subtractStationInteger(left: unknown, right: unknown): DecimalIntegerString {
  return cappedDecimal(stationInteger(left) - stationInteger(right));
}

export function minStationInteger(...values: unknown[]): DecimalIntegerString {
  if (values.length === 0) return "0";
  return cappedDecimal(values.map(stationInteger).reduce((minimum, value) => value < minimum ? value : minimum));
}

export function stationIntegerFromBigInt(value: bigint): DecimalIntegerString {
  return cappedDecimal(value);
}

export function parsePositiveStationInteger(value: unknown): bigint | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? BigInt(value) : null;
  if (typeof value === "bigint") return value > 0n && value.toString().length <= STATION_MAX_INTEGER_DIGITS ? value : null;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value) || value.length > STATION_MAX_INTEGER_DIGITS) return null;
  return BigInt(value);
}

export function stationCompletionBasisPoints(delivered: unknown, required: unknown): number {
  const target = stationInteger(required);
  if (target <= 0n) return 10_000;
  const completed = stationInteger(delivered);
  return Number((completed >= target ? target : completed) * 10_000n / target);
}

export function multiplyStationIntegerBasisPoints(value: unknown, basisPoints: number): DecimalIntegerString {
  const normalizedBasisPoints = BigInt(Math.max(0, Math.min(10_000, Math.floor(basisPoints))));
  return cappedDecimal(stationInteger(value) * normalizedBasisPoints / 10_000n);
}
