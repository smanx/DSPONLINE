import { CheckSquare, Search, Square, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { ITEMS, getPlanet } from "../game/content";
import type { GameState, ItemId } from "../game/types";
import { MAX_PLANET_TRAY_ITEM_LIMIT, MIN_PLANET_TRAY_ITEM_LIMIT, getPlanetTrayItemLimit, type PlanetTrayDiscardRequest } from "../game/engine";
import { formatQuantityCompact, formatQuantityExact } from "../game/quantityFormat";
import "../styles/tray-management.css";
import { AccessibleDialog } from "./AccessibleDialog";
import { ItemGlyph } from "./ItemReference";

type DiscardMode = "half" | "all";

export function TrayManagementDialog({ game, onDiscard, onSetItemLimit, onClose }: {
  game: GameState;
  onDiscard: (requests: PlanetTrayDiscardRequest[]) => void;
  onSetItemLimit?: (value: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<ItemId>>(() => new Set());
  const [confirmation, setConfirmation] = useState<{ mode: DiscardMode; requests: PlanetTrayDiscardRequest[]; skipped: number } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const confirmationCancelRef = useRef<HTMLButtonElement>(null);
  const itemLimit = getPlanetTrayItemLimit(game);
  const [limitDraft, setLimitDraft] = useState(String(itemLimit));
  const [limitError, setLimitError] = useState<string | null>(null);
  const commitLimit = () => {
    const raw = limitDraft.trim().replaceAll(",", "");
    if (!/^[0-9]+$/.test(raw)) {
      setLimitError("请输入十进制正整数，不支持小数、负数或指数格式");
      return;
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < MIN_PLANET_TRAY_ITEM_LIMIT || value > MAX_PLANET_TRAY_ITEM_LIMIT) {
      setLimitError("允许范围为 1,000 至 100,000,000");
      return;
    }
    setLimitError(null);
    setLimitDraft(String(value));
    onSetItemLimit?.(value);
  };
  const allItems = useMemo(() => (Object.entries(game.tray) as Array<[ItemId, number]>)
    .filter(([, amount]) => Math.floor(amount) > 0)
    .sort((a, b) => b[1] - a[1]), [game.tray]);
  const term = query.trim().toLocaleLowerCase("zh-CN");
  const visibleItems = term
    ? allItems.filter(([itemId]) => `${ITEMS[itemId].name} ${itemId}`.toLocaleLowerCase("zh-CN").includes(term))
    : allItems;
  const selectedItems = allItems.filter(([itemId]) => selected.has(itemId));
  const buildConfirmation = (mode: DiscardMode) => {
    const requests = selectedItems.flatMap(([itemId, amount]) => {
      const requested = mode === "half" ? Math.floor(amount / 2) : Math.floor(amount);
      return requested > 0 ? [{ itemId, amount: requested }] : [];
    });
    if (requests.length === 0) return;
    setConfirmation({ mode, requests, skipped: mode === "half" ? selectedItems.length - requests.length : 0 });
  };
  const selectedTotal = confirmation?.requests.reduce((sum, request) => sum + request.amount, 0) ?? 0;
  const toggle = (itemId: ItemId) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    return next;
  });
  return <>
    <AccessibleDialog
      open
      title="管理当前行星物资托盘"
      layout="bare"
      ariaLabel="管理当前行星物资托盘"
      backdropClassName="tray-management"
      initialFocusRef={searchInputRef}
      onRequestClose={onClose}
    >
      <header>
        <div><span>{getPlanet(game.activePlanetId).name}</span><strong>物资托盘管理</strong></div>
        <button type="button" onClick={onClose} title="关闭物资管理" aria-label="关闭物资管理"><X size={19} /></button>
      </header>
      {onSetItemLimit ? <div className="tray-management__limit"><span>每种物资库存上限</span><div>{([10_000, 100_000, 1_000_000, 100_000_000] as const).map((value) => <button type="button" className={itemLimit === value ? "active" : ""} key={value} onClick={() => { setLimitDraft(String(value)); setLimitError(null); onSetItemLimit(value); }}>{value === 10_000 ? "1万" : value === 100_000 ? "10万" : value === 1_000_000 ? "100万" : "1亿"}</button>)}</div><label><input inputMode="numeric" value={limitDraft} onChange={(event) => setLimitDraft(event.target.value)} onBlur={commitLimit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} aria-label="自定义每种物资库存上限" /><button type="button" onClick={commitLimit}>应用</button></label>{limitError ? <p role="alert">{limitError}</p> : null}</div> : null}
      <div className="tray-management__toolbar">
        <label><Search size={17} /><input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索物资" aria-label="搜索托盘物资" /></label>
        <button type="button" onClick={() => setSelected(selected.size === allItems.length ? new Set() : new Set(allItems.map(([itemId]) => itemId)))}>
          {selected.size === allItems.length && allItems.length > 0 ? <CheckSquare size={17} /> : <Square size={17} />}全选
        </button>
      </div>
      <p>已选择 <strong>{selected.size}</strong> / 全部 <strong>{allItems.length}</strong> 种。全选包含当前搜索中隐藏的物资。</p>
      <div className="tray-management__list">
        {visibleItems.map(([itemId, amount]) => <button className={selected.has(itemId) ? "selected" : ""} type="button" key={itemId} onClick={() => toggle(itemId)}>
          {selected.has(itemId) ? <CheckSquare size={18} /> : <Square size={18} />}
          <ItemGlyph itemId={itemId} />
          <span><strong>{ITEMS[itemId].name}</strong><small>{formatQuantityExact(Math.floor(amount))}</small></span>
        </button>)}
        {visibleItems.length === 0 ? <div className="tray-management__empty">没有符合条件的库存</div> : null}
      </div>
      <footer>
        <button type="button" onClick={onClose}>取消</button>
        <button type="button" disabled={!selectedItems.some(([, amount]) => amount >= 2)} onClick={() => buildConfirmation("half")}>删除一半</button>
        <button className="danger" type="button" disabled={selected.size === 0} onClick={() => buildConfirmation("all")}><Trash2 size={17} />全部删除</button>
      </footer>
    </AccessibleDialog>
    {confirmation ? <AccessibleDialog
      open
      title="确认删除托盘物资"
      layout="bare"
      ariaLabel="确认删除托盘物资"
      role="alertdialog"
      riskPolicy="explicit"
      backdropClassName="tray-discard-confirm"
      initialFocusRef={confirmationCancelRef}
      onRequestClose={() => undefined}
    >
        <header><Trash2 size={20} /><div><span>不可撤销操作</span><strong>再次确认删除</strong></div></header>
        <p>将从 <strong>{getPlanet(game.activePlanetId).name}</strong> 删除 {confirmation.requests.length} 种物资，共 <strong title={formatQuantityExact(selectedTotal)}>{formatQuantityCompact(selectedTotal)}</strong> 件。</p>
        {confirmation.skipped > 0 ? <p>{confirmation.skipped} 种库存不足 2 件，已跳过。</p> : null}
        <ul>{confirmation.requests.slice(0, 8).map((request) => <li key={request.itemId}><span>{ITEMS[request.itemId].name}</span><strong>{formatQuantityExact(request.amount)}</strong></li>)}</ul>
        {confirmation.requests.length > 8 ? <p>另有 {confirmation.requests.length - 8} 种物资</p> : null}
        <footer><button ref={confirmationCancelRef} type="button" onClick={() => setConfirmation(null)}>返回</button><button className="danger" type="button" onClick={() => { onDiscard(confirmation.requests); setConfirmation(null); setSelected(new Set()); }}>确认删除</button></footer>
    </AccessibleDialog> : null}
  </>;
}
