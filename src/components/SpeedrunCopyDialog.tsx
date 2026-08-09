import { Copy, ShieldCheck, X } from "lucide-react";
import type { SaveSlotId } from "../game/storage";

export function SpeedrunCopyDialog({
  sourceLabel,
  openNormalSlots,
  busy,
  onCancel,
  onCopy,
}: {
  sourceLabel: string | null;
  openNormalSlots: SaveSlotId[];
  busy: boolean;
  onCancel: () => void;
  onCopy: (slotId: SaveSlotId) => void;
}) {
  if (!sourceLabel) return null;
  return (
    <div className="save-delete-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section className="save-delete-dialog speedrun-copy-dialog" role="alertdialog" aria-modal="true" aria-labelledby="speedrun-copy-title">
        <header>
          <i><Copy size={20} /></i>
          <span><small>单向模式复制</small><strong id="speedrun-copy-title">复制为普通存档</strong></span>
          <button type="button" onClick={onCancel} aria-label="取消复制速通存档"><X size={16} /></button>
        </header>
        <div className="save-delete-target">
          <span>速通来源</span>
          <strong>{sourceLabel}</strong>
          <small>原速通存档保持不变；只允许写入空的普通模式槽位。</small>
        </div>
        <p><ShieldCheck size={14} /> 普通副本不会计入速通排行榜，且不能再转换回速通模式。</p>
        <footer>
          <button type="button" onClick={onCancel}>取消</button>
          {openNormalSlots.map((slotId) => (
            <button className="primary" type="button" disabled={busy} onClick={() => onCopy(slotId)} key={slotId}>
              <Copy size={14} />复制到普通槽位 {slotId}
            </button>
          ))}
          {openNormalSlots.length === 0 ? <button type="button" disabled>没有空的普通槽位</button> : null}
        </footer>
      </section>
    </div>
  );
}
