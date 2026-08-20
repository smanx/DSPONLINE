import { MAX_BELT_LANES, MAX_BUILDING_BUFFER_LIMIT, MAX_PROLIFERATOR_BUFFER_LIMIT, MIN_BUILDING_BUFFER_LIMIT, MIN_PROLIFERATOR_BUFFER_LIMIT } from "./engine";

export type BuildingBufferLimitValidation =
  | { ok: true; value: number }
  | { ok: false; reason: string };

function validateIntegerLimitInput(raw: string, minimum: number, maximum: number): BuildingBufferLimitValidation {
  const value = raw.trim();
  if (!value) return { ok: false, reason: "请输入缓存上限" };
  if (!/^\d+$/.test(value)) {
    if (/^-/.test(value)) return { ok: false, reason: "缓存上限不能为负数" };
    if (/[.]/.test(value)) return { ok: false, reason: "缓存上限只接受整数" };
    if (/[eE]/.test(value)) return { ok: false, reason: "缓存上限不接受指数格式" };
    return { ok: false, reason: "缓存上限只能包含数字" };
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return { ok: false, reason: "缓存上限超出安全整数范围" };
  if (parsed < minimum) return { ok: false, reason: `缓存上限不能低于 ${minimum.toLocaleString("zh-CN")}` };
  if (parsed > maximum) return { ok: false, reason: `缓存上限不能高于 ${maximum.toLocaleString("zh-CN")}` };
  return { ok: true, value: parsed };
}

export function validateBuildingBufferLimitInput(raw: string): BuildingBufferLimitValidation {
  return validateIntegerLimitInput(raw, MIN_BUILDING_BUFFER_LIMIT, MAX_BUILDING_BUFFER_LIMIT);
}

export function validateProliferatorBufferLimitInput(raw: string): BuildingBufferLimitValidation {
  return validateIntegerLimitInput(raw, MIN_PROLIFERATOR_BUFFER_LIMIT, MAX_PROLIFERATOR_BUFFER_LIMIT);
}

export function validateDefaultBeltLanesInput(raw: string): BuildingBufferLimitValidation {
  const value = raw.trim();
  if (!value) return { ok: false, reason: "请输入默认并联数量" };
  if (!/^\d+$/.test(value)) {
    if (/^-/.test(value)) return { ok: false, reason: "默认并联数量不能为负数" };
    if (/[.]/.test(value)) return { ok: false, reason: "默认并联数量只接受整数" };
    if (/[eE]/.test(value)) return { ok: false, reason: "默认并联数量不接受指数格式" };
    return { ok: false, reason: "默认并联数量只能包含数字" };
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return { ok: false, reason: "默认并联数量超出安全整数范围" };
  if (parsed < 1) return { ok: false, reason: "默认并联数量不能低于 1" };
  if (parsed > MAX_BELT_LANES) return { ok: false, reason: `默认并联数量不能高于 ${MAX_BELT_LANES}` };
  return { ok: true, value: parsed };
}
