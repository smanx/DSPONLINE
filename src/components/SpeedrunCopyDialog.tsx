import { Copy, ShieldCheck, X } from "lucide-react";
import { useRef } from "react";
import type { SaveSlotId } from "../game/storage";
import { AccessibleDialog } from "./AccessibleDialog";

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
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  if (!sourceLabel) return null;
  return (
    <AccessibleDialog
      open
      role="alertdialog"
      riskPolicy="dismissible"
      className="speedrun-copy-dialog"
      title={<><Copy aria-hidden="true" size={20} /> 复制为普通存档</>}
      description="单向模式复制"
      initialFocusRef={cancelButtonRef}
      onRequestClose={onCancel}
      actions={<>
        <button ref={cancelButtonRef} type="button" onClick={onCancel}><X aria-hidden="true" size={14} />取消</button>
        {openNormalSlots.map((slotId) => (
          <button className="primary" type="button" disabled={busy} onClick={() => onCopy(slotId)} key={slotId}>
            <Copy aria-hidden="true" size={14} />复制到普通槽位 {slotId}
          </button>
        ))}
        {openNormalSlots.length === 0 ? <button type="button" disabled>没有空的普通槽位</button> : null}
      </>}
    >
      <div className="speedrun-copy-content">
        <div className="save-delete-target">
          <span>速通来源</span>
          <strong>{sourceLabel}</strong>
          <small>原速通存档保持不变；只允许写入空的普通模式槽位。</small>
        </div>
        <p><ShieldCheck aria-hidden="true" size={14} /> 普通副本不会计入速通排行榜，且不能再转换回速通模式。</p>
      </div>
    </AccessibleDialog>
  );
}
