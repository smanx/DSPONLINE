import { Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";

function clampQuantity(value: number, min: number, max: number): number {
  const lower = Math.max(0, Math.floor(min));
  const upper = Math.max(lower, Math.floor(max));
  return Math.max(lower, Math.min(upper, Math.floor(Number.isFinite(value) ? value : lower)));
}

export function QuantityStepper({ value, min = 1, max, label, disabled = false, maxLabel = "最大", onChange, onMax }: {
  value: number;
  min?: number;
  max: number;
  label: string;
  disabled?: boolean;
  maxLabel?: string;
  onChange: (value: number) => void;
  onMax?: () => number;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = (raw = draft) => {
    const parsed = /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : min;
    const next = clampQuantity(parsed, min, max);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };
  const set = (next: number) => {
    const normalized = clampQuantity(next, min, max);
    setDraft(String(normalized));
    onChange(normalized);
  };
  return <div className="quantity-stepper" role="group" aria-label={label}>
    <button type="button" disabled={disabled || value <= min} onClick={() => set(value - 1)} aria-label={`${label}减少 1`}><Minus size={14} /></button>
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      disabled={disabled}
      value={draft}
      aria-label={`${label}数量`}
      onChange={(event) => {
        if (/^\d*$/.test(event.target.value)) setDraft(event.target.value);
      }}
      onBlur={() => commit()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          event.currentTarget.blur();
        }
      }}
    />
    <button type="button" disabled={disabled || value >= Math.max(min, max)} onClick={() => set(value + 1)} aria-label={`${label}增加 1`}><Plus size={14} /></button>
    <button className="quantity-stepper__max" type="button" disabled={disabled || max < min} onClick={() => set(onMax ? onMax() : max)}>{maxLabel}</button>
  </div>;
}
