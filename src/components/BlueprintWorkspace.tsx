import { ArrowUp, BoxSelect, Check, Copy, Focus, Layers3, MousePointer2, PackageOpen, Trash2, X } from "lucide-react";
import { getConstructionDefinition, getPlanet } from "../game/content";
import { canPlaceBlueprint, getBlueprintRequirements } from "../game/engine";
import type { BlueprintDefinition, GameState } from "../game/types";

function blueprintBuildingSummary(blueprint: BlueprintDefinition): string[] {
  const counts = new Map<string, number>();
  for (const entity of blueprint.entities) {
    const name = getConstructionDefinition(entity.buildingId)?.name ?? entity.buildingId;
    counts.set(name, (counts.get(name) ?? 0) + entity.machineCount);
  }
  return [...counts].map(([name, amount]) => `${name} ×${amount}`);
}

export function CanvasSelectionTools({ selectionMode, blueprintCount, onModeChange, onOpenBlueprints }: {
  selectionMode: boolean;
  blueprintCount: number;
  onModeChange: (enabled: boolean) => void;
  onOpenBlueprints: () => void;
}) {
  return (
    <div className="canvas-selection-tools nodrag nopan" aria-label="画布选择工具">
      <button className={!selectionMode ? "active" : ""} type="button" onClick={() => onModeChange(false)} title="指针与节点移动" aria-label="指针模式"><MousePointer2 size={16} /></button>
      <button className={selectionMode ? "active" : ""} type="button" onClick={() => onModeChange(true)} title="拖拽框选节点，可按 Shift 增减选择" aria-label="框选模式"><BoxSelect size={16} /></button>
      <button type="button" onClick={onOpenBlueprints} title="打开蓝图库" aria-label="打开蓝图库"><Layers3 size={16} /><em>{blueprintCount}</em></button>
    </div>
  );
}

export function SelectionToolbar({ selectedCount, eligibleCount, canUpgrade, onFocus, onCopy, onUpgrade, onRemove }: {
  selectedCount: number;
  eligibleCount: number;
  canUpgrade: boolean;
  onFocus: () => void;
  onCopy: () => void;
  onUpgrade: () => void;
  onRemove: () => void;
}) {
  if (selectedCount === 0) return null;
  return (
    <div className="selection-toolbar nodrag nopan" role="toolbar" aria-label="选区操作">
      <span><BoxSelect size={14} /><strong>{selectedCount}</strong> 已选</span>
      <button type="button" onClick={onFocus} title="定位到所选设备" aria-label="定位到所选设备"><Focus size={16} /></button>
      <button type="button" disabled={eligibleCount === 0} onClick={onCopy} title="复制所选设备为蓝图并进入粘贴" aria-label="复制所选为蓝图"><Copy size={16} /></button>
      <button type="button" disabled={!canUpgrade} onClick={onUpgrade} title="批量升级所有可升级设备" aria-label="批量升级所选设备"><ArrowUp size={16} /></button>
      <button className="danger" type="button" onClick={onRemove} title="批量回收所选设备" aria-label="批量回收所选设备"><Trash2 size={16} /></button>
    </div>
  );
}

export function BlueprintPlacementCursor({ blueprint, x, y }: { blueprint: BlueprintDefinition; x: number; y: number }) {
  return (
    <div className="blueprint-placement-cursor" style={{ left: x + 14, top: y + 14 }}>
      <Layers3 size={15} /><span>{blueprint.name}</span><strong>×{blueprint.entities.length}</strong>
    </div>
  );
}

export function BlueprintWorkspace({ open, game, onClose, onDeploy, onRemove, onRename }: {
  open: boolean;
  game: GameState;
  onClose: () => void;
  onDeploy: (blueprintId: string) => void;
  onRemove: (blueprintId: string) => void;
  onRename: (blueprintId: string, name: string) => void;
}) {
  if (!open) return null;
  return (
    <section className="blueprint-workspace" role="dialog" aria-modal="true" aria-label="蓝图库">
      <header className="blueprint-header">
        <div className="blueprint-title"><i><Layers3 size={20} /></i><div><span>生产网络模板</span><strong>蓝图库</strong></div></div>
        <div className="blueprint-headline"><span>模板 <strong>{game.blueprints.length}</strong></span><span>部署行星 <strong>{getPlanet(game.activePlanetId).name}</strong></span></div>
        <button className="blueprint-close" type="button" onClick={onClose} title="关闭蓝图库" aria-label="关闭蓝图库"><X size={18} /></button>
      </header>
      <div className="blueprint-library">
        {game.blueprints.length === 0 ? (
          <div className="blueprint-empty"><BoxSelect size={26} /><strong>蓝图库为空</strong><span>在画布中框选设备，再使用选区复制命令建立模板。</span></div>
        ) : game.blueprints.map((blueprint) => {
          const requirements = getBlueprintRequirements(blueprint);
          const deployable = canPlaceBlueprint(game, blueprint.id);
          return (
            <article className="blueprint-card" key={blueprint.id}>
              <header>
                <i><Layers3 size={18} /></i>
                <label><span>蓝图名称</span><input defaultValue={blueprint.name} aria-label={`${blueprint.name}名称`} onBlur={(event) => onRename(blueprint.id, event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
                <em>{blueprint.entities.length} 节点 · {blueprint.belts.length} 线路</em>
              </header>
              <div className="blueprint-composition">
                {blueprintBuildingSummary(blueprint).map((label) => <span key={label}>{label}</span>)}
              </div>
              <div className="blueprint-requirements">
                <strong>施工需求</strong>
                <div>{requirements.map((requirement) => {
                  const stock = Math.floor(game.construction[requirement.constructionId] ?? 0);
                  return <span className={stock >= requirement.amount ? "ready" : ""} key={requirement.constructionId}>{stock >= requirement.amount ? <Check size={11} /> : <PackageOpen size={11} />}{getConstructionDefinition(requirement.constructionId)?.name ?? requirement.constructionId} {stock}/{requirement.amount}</span>;
                })}</div>
              </div>
              <footer>
                <button type="button" disabled={!deployable} onClick={() => onDeploy(blueprint.id)} title={deployable ? `在${getPlanet(game.activePlanetId).name}部署${blueprint.name}` : "施工库存不足或当前行星不兼容"}><Copy size={14} />部署</button>
                <button className="danger" type="button" onClick={() => onRemove(blueprint.id)} title={`删除${blueprint.name}`} aria-label={`删除${blueprint.name}`}><Trash2 size={14} /></button>
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}
