import { MAX_BUILDING_BUFFER_LIMIT, MIN_BUILDING_BUFFER_LIMIT } from "./engine";

export type BuildingBufferLimitValidation =
  | { ok: true; value: number }
  | { ok: false; reason: string };

export function validateBuildingBufferLimitInput(raw: string): BuildingBufferLimitValidation {
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
  if (parsed < MIN_BUILDING_BUFFER_LIMIT) return { ok: false, reason: `缓存上限不能低于 ${MIN_BUILDING_BUFFER_LIMIT.toLocaleString("zh-CN")}` };
  if (parsed > MAX_BUILDING_BUFFER_LIMIT) return { ok: false, reason: `缓存上限不能高于 ${MAX_BUILDING_BUFFER_LIMIT.toLocaleString("zh-CN")}` };
  return { ok: true, value: parsed };
}
