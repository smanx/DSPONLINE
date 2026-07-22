import { AlertTriangle, ArrowRight, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

export interface SaveDeleteTarget {
  label: string;
  details: string;
}

export function SaveDeleteDialog({ target, onCancel, onDelete }: {
  target: SaveDeleteTarget | null;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  useEffect(() => setStep(1), [target]);
  if (!target) return null;
  return (
    <div className="save-delete-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section className="save-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="save-delete-title">
        <header><i><AlertTriangle size={20} /></i><span><small>{step === 1 ? "第一次确认" : "第二次确认 · 最后一步"}</small><strong id="save-delete-title">删除{target.label}</strong></span><button type="button" onClick={onCancel} aria-label="取消删除存档"><X size={16} /></button></header>
        <div className="save-delete-target"><span>即将删除</span><strong>{target.label}</strong><small>{target.details}</small></div>
        <p>{step === 1 ? "删除后无法从该槽位继续游戏。主存档、其他槽位和云存档不会受到影响。" : "请再次确认目标信息。此操作只删除上方列出的存档，不会清空当前正在运行的工厂。"}</p>
        <footer><button type="button" onClick={onCancel}>取消</button>{step === 1 ? <button className="warning" type="button" onClick={() => setStep(2)}>继续确认<ArrowRight size={14} /></button> : <button className="danger" type="button" onClick={onDelete}><Trash2 size={14} />确认永久删除</button>}</footer>
      </section>
    </div>
  );
}
