import { ArrowRight, Check, ChevronDown, Clock3, PackageOpen, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getItem } from "../game/content";
import type { ItemDefinition, ItemId, RecipeDefinition, RecipeId } from "../game/types";
import { ItemGlyph } from "./ItemReference";

function usePicker(open: boolean, onClose: () => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [onClose, open]);
  return inputRef;
}

function PickerPortal({ children }: { children: React.ReactNode }) {
  return typeof document === "undefined" ? children : createPortal(children, document.body);
}

export function RecipeCatalogPicker({ value, recipes, onChange, compact = false }: {
  value: RecipeId | undefined;
  recipes: RecipeDefinition[];
  onChange: (recipeId: RecipeId) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const close = () => { setOpen(false); setQuery(""); };
  const inputRef = usePicker(open, close);
  const current = recipes.find((recipe) => recipe.id === value) ?? recipes[0];
  const term = query.trim().toLocaleLowerCase("zh-CN");
  const filtered = recipes.filter((recipe) => {
    if (!term) return true;
    const items = [...recipe.inputs, ...recipe.outputs].map((entry) => getItem(entry.itemId).name).join(" ");
    return `${recipe.name} ${items}`.toLocaleLowerCase("zh-CN").includes(term);
  });
  return (
    <>
      <button className={`catalog-picker-trigger${compact ? " catalog-picker-trigger--compact" : ""}`} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label="选择当前配方">
        <span>{current?.name ?? "选择配方"}</span><ChevronDown size={13} />
      </button>
      {open ? <PickerPortal><div className="catalog-picker-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
        <section className="catalog-picker" role="dialog" aria-modal="true" aria-label="配方选择面板">
          <header><div><span>生产目录</span><strong>选择配方</strong></div><button type="button" onClick={close} title="关闭配方选择" aria-label="关闭配方选择"><X size={16} /></button></header>
          <label className="catalog-picker-search"><Search size={15} /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索配方、原料或产物" aria-label="搜索配方" /></label>
          <div className="recipe-catalog-grid">
            {filtered.map((recipe) => <button type="button" className={recipe.id === value ? "active" : ""} onClick={() => { onChange(recipe.id); close(); }} key={recipe.id}>
              <header><span><strong>{recipe.name}</strong><small><Clock3 size={11} />{recipe.duration}s</small></span>{recipe.id === value ? <Check size={14} /> : null}</header>
              <div><span>{recipe.inputs.length ? recipe.inputs.map((input) => <i title={`${getItem(input.itemId).name} ×${input.amount}`} key={input.itemId}><ItemGlyph itemId={input.itemId} /><b>{input.amount}</b></i>) : <em>连续</em>}</span><ArrowRight size={13} /><span>{recipe.outputs.length ? recipe.outputs.map((output) => <i title={`${getItem(output.itemId).name} ×${output.amount}`} key={output.itemId}><ItemGlyph itemId={output.itemId} /><b>{output.amount}</b></i>) : <em>流程</em>}</span></div>
            </button>)}
            {filtered.length === 0 ? <p className="catalog-picker-empty"><PackageOpen size={20} />没有匹配的配方</p> : null}
          </div>
        </section>
      </div></PickerPortal> : null}
    </>
  );
}

export function ItemCatalogPicker({ value, items, disabledIds, onChange, allowClear = false, label = "选择物品" }: {
  value?: ItemId;
  items: ItemDefinition[];
  disabledIds?: Set<ItemId>;
  onChange: (itemId: ItemId | null) => void;
  allowClear?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const close = () => { setOpen(false); setQuery(""); };
  const inputRef = usePicker(open, close);
  const current = items.find((item) => item.id === value);
  const term = query.trim().toLocaleLowerCase("zh-CN");
  const filtered = items.filter((item) => !term || `${item.name} ${item.symbol} ${item.description}`.toLocaleLowerCase("zh-CN").includes(term));
  return (
    <>
      <button className="catalog-picker-trigger catalog-picker-trigger--item" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={label}>
        {current ? <><ItemGlyph itemId={current.id} /><span>{current.name}</span></> : <span>{label}</span>}<ChevronDown size={13} />
      </button>
      {open ? <PickerPortal><div className="catalog-picker-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
        <section className="catalog-picker catalog-picker--items" role="dialog" aria-modal="true" aria-label="物品选择面板">
          <header><div><span>物流目录</span><strong>{label}</strong></div><button type="button" onClick={close} title="关闭物品选择" aria-label="关闭物品选择"><X size={16} /></button></header>
          <label className="catalog-picker-search"><Search size={15} /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索物品名称、符号或说明" aria-label="搜索物品" /></label>
          <div className="item-catalog-grid">
            {allowClear ? <button type="button" className={!value ? "active" : ""} onClick={() => { onChange(null); close(); }}><i><X size={14} /></i><span><strong>未配置</strong><small>释放当前槽位</small></span></button> : null}
            {filtered.map((item) => {
              const disabled = disabledIds?.has(item.id) && item.id !== value;
              return <button type="button" disabled={disabled} className={item.id === value ? "active" : ""} onClick={() => { onChange(item.id); close(); }} key={item.id}><ItemGlyph itemId={item.id} /><span><strong>{item.name}</strong><small>{item.kind === "fluid" ? "流体" : item.kind === "matrix" ? "矩阵" : "固体"} · {item.symbol}</small></span>{item.id === value ? <Check size={13} /> : null}</button>;
            })}
            {filtered.length === 0 ? <p className="catalog-picker-empty"><PackageOpen size={20} />没有匹配的物品</p> : null}
          </div>
        </section>
      </div></PickerPortal> : null}
    </>
  );
}
