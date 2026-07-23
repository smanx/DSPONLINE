import { Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";

function clampQuantity(value: number, max: number): number {
  const upper = Math.max(1, Math.floor(max));
  return Math.max(1, Math.min(upper, Math.floor(Number.isFinite(value) ? value : 1)));
}

export function QuantityStepper({ value, max, label, disabled = false, onChange, onMax }: {
  value: number;
  max: number;
  label: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  onMax?: () => number;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = (raw = draft) => {
    const parsed = /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : 1;
    const next = clampQuantity(parsed, max);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };
  const set = (next: number) => {
    const normalized = clampQuantity(next, max);
    setDraft(String(normalized));
    onChange(normalized);
  };
  return <div className="quantity-stepper" role="group" aria-label={label}>
    <button type="button" disabled={disabled || value <= 1} onClick={() => set(value - 1)} aria-label={`${label}减少 1`}><Minus size={14} /></button>
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
    <button type="button" disabled={disabled || value >= Math.max(1, max)} onClick={() => set(value + 1)} aria-label={`${label}增加 1`}><Plus size={14} /></button>
    <button className="quantity-stepper__max" type="button" disabled={disabled || max < 1} onClick={() => set(onMax ? onMax() : max)}>最大</button>
  </div>;
}
