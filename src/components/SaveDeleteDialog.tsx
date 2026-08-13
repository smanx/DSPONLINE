import { AlertTriangle, ArrowRight, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AccessibleDialog } from "./AccessibleDialog";

export interface SaveDeleteTarget {
  label: string;
  details: string;
  scope?: "local" | "cloud";
}

export function SaveDeleteDialog({ target, onCancel, onDelete }: {
  target: SaveDeleteTarget | null;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => setStep(1), [target]);
  useEffect(() => {
    if (target && step === 2) cancelButtonRef.current?.focus({ preventScroll: true });
  }, [step, target]);
  if (!target) return null;

  const isFinalConfirmation = step === 2;
  const explanation = target.scope === "cloud"
    ? isFinalConfirmation
      ? "请再次核对模式、槽位和修订号。此操作不会删除本地存档，也不会跨模式删除。"
      : "只删除上方模式与槽位对应的云存档；本地存档、另一模式和其他云端槽位不会受到影响。"
    : isFinalConfirmation
      ? "请再次确认目标信息。此操作只删除上方列出的存档，不会清空当前正在运行的工厂。"
      : "删除后无法从该槽位继续游戏。主存档、其他槽位和云存档不会受到影响。";

  return (
    <AccessibleDialog
      open
      role={isFinalConfirmation ? "alertdialog" : "dialog"}
      riskPolicy={isFinalConfirmation ? "explicit" : "dismissible"}
      title={<><AlertTriangle aria-hidden="true" size={20} /> 删除{target.label}</>}
      description={isFinalConfirmation ? "第二次确认 · 最后一步" : "第一次确认"}
      initialFocusRef={cancelButtonRef}
      onRequestClose={onCancel}
      actions={<>
        <button ref={cancelButtonRef} type="button" onClick={onCancel}><X aria-hidden="true" size={14} />取消</button>
        {isFinalConfirmation
          ? <button className="danger" type="button" onClick={onDelete}><Trash2 aria-hidden="true" size={14} />确认永久删除</button>
          : <button className="warning" type="button" onClick={() => setStep(2)}>继续确认<ArrowRight aria-hidden="true" size={14} /></button>}
      </>}
    >
      <div className="save-delete-content">
        <div className="save-delete-target"><span>即将删除</span><strong>{target.label}</strong><small>{target.details}</small></div>
        <p>{explanation}</p>
      </div>
    </AccessibleDialog>
  );
}
