import { ArrowUp, BoxSelect, Check, ChevronLeft, ChevronRight, Clock3, Copy, Download, FlipHorizontal2, Focus, Layers3, MousePointer2, PackageOpen, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Redo2, RotateCw, Route, Trash2, Undo2, Upload, WandSparkles, X } from "lucide-react";
import { getConstructionDefinition, getItem, getPlanet, getRecipe, getRecipesForBuilding } from "../game/content";
import { canPlaceBlueprint, canQueueBlueprint, getBlueprintRequirements, getConstructionQueueDeficits, isTechnologyCompleted } from "../game/engine";
import type { BlueprintDefinition, BlueprintMirror, BlueprintRotation, GameState, RecipeId } from "../game/types";
import { useRef, useState } from "react";

function blueprintBuildingSummary(blueprint: BlueprintDefinition): string[] {
  const counts = new Map<string, number>();
  for (const entity of blueprint.entities) {
    const name = getConstructionDefinition(entity.buildingId)?.name ?? entity.buildingId;
    counts.set(name, (counts.get(name) ?? 0) + entity.machineCount);
  }
  return [...counts].map(([name, amount]) => `${name} ×${amount}`);
}

export function CanvasSelectionTools({ selectionMode, blueprintCount, beltCount, canUndo, canRedo, canUndoAutoLayout, leftSidebarCollapsed, rightSidebarCollapsed, onModeChange, onOpenBlueprints, onOpenNetworks, onAutoLayout, onUndoAutoLayout, onUndo, onRedo, onToggleLeftSidebar, onToggleRightSidebar }: {
  selectionMode: boolean;
  blueprintCount: number;
  beltCount: number;
  canUndo: boolean;
  canRedo: boolean;
  canUndoAutoLayout: boolean;
  leftSidebarCollapsed: boolean;
  rightSidebarCollapsed: boolean;
  onModeChange: (enabled: boolean) => void;
  onOpenBlueprints: () => void;
  onOpenNetworks: () => void;
  onAutoLayout: () => void;
  onUndoAutoLayout: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleLeftSidebar: () => void;
  onToggleRightSidebar: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className={`canvas-selection-tools nodrag nopan${collapsed ? " canvas-selection-tools--collapsed" : ""}`} aria-label="画布选择工具">
      {!collapsed ? <>
        <button className={!selectionMode ? "active" : ""} type="button" onClick={() => onModeChange(false)} title="指针与节点移动" aria-label="指针模式"><MousePointer2 size={16} /></button>
        <button className={selectionMode ? "active" : ""} type="button" onClick={() => onModeChange(true)} title="拖拽框选节点，可按 Shift 增减选择" aria-label="框选模式"><BoxSelect size={16} /></button>
        <button type="button" onClick={onOpenBlueprints} title="打开蓝图库" aria-label="打开蓝图库"><Layers3 size={16} /><em>{blueprintCount}</em></button>
        <button type="button" onClick={onOpenNetworks} title="打开生产网络总览" aria-label="打开生产网络总览"><Route size={16} /><em>{beltCount}</em></button>
        <button type="button" onClick={onAutoLayout} title="按物流上下游自动整理当前行星" aria-label="自动整理当前行星布局"><WandSparkles size={16} /></button>
        <button type="button" disabled={!canUndoAutoLayout} onClick={onUndoAutoLayout} title="恢复到最近一次自动整理前的位置" aria-label="撤销最近一次自动整理"><Undo2 size={16} /></button>
        <span className="canvas-selection-tools__separator" />
        <button type="button" disabled={!canUndo} onClick={onUndo} title="撤销上一步工厂操作 (Ctrl+Z)" aria-label="撤销"><Undo2 size={16} /></button>
        <button type="button" disabled={!canRedo} onClick={onRedo} title="重做工厂操作 (Ctrl+Y)" aria-label="重做"><Redo2 size={16} /></button>
        <span className="canvas-selection-tools__separator canvas-sidebar-toggle" />
        <button className="canvas-sidebar-toggle" type="button" onClick={onToggleLeftSidebar} title={leftSidebarCollapsed ? "展开物资侧栏" : "折叠物资侧栏"} aria-label={leftSidebarCollapsed ? "展开物资侧栏" : "折叠物资侧栏"}>{leftSidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button>
        <button className="canvas-sidebar-toggle" type="button" onClick={onToggleRightSidebar} title={rightSidebarCollapsed ? "展开检查器侧栏" : "折叠检查器侧栏"} aria-label={rightSidebarCollapsed ? "展开检查器侧栏" : "折叠检查器侧栏"}>{rightSidebarCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}</button>
      </> : null}
      <button className="canvas-selection-tools__collapse" type="button" onClick={() => setCollapsed((current) => !current)} title={collapsed ? "展开画布工具" : "折叠画布工具"} aria-label={collapsed ? "展开画布工具" : "折叠画布工具"} aria-expanded={!collapsed}>
        {collapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>
    </div>
  );
}

export function SelectionToolbar({ selectedCount, eligibleCount, canUpgrade, onFocus, onAutoLayout, onCopy, onUpgrade, onRemove }: {
  selectedCount: number;
  eligibleCount: number;
  canUpgrade: boolean;
  onFocus: () => void;
  onAutoLayout: () => void;
  onCopy: () => void;
  onUpgrade: () => void;
  onRemove: () => void;
}) {
  if (selectedCount === 0) return null;
  return (
    <div className="selection-toolbar nodrag nopan" role="toolbar" aria-label="选区操作">
      <span><BoxSelect size={14} /><strong>{selectedCount}</strong> 已选</span>
      <button type="button" onClick={onFocus} title="定位到所选设备" aria-label="定位到所选设备"><Focus size={16} /></button>
      <button type="button" onClick={onAutoLayout} title="按物流上下游整理所选设备" aria-label="自动整理所选设备"><WandSparkles size={16} /></button>
      <button type="button" disabled={eligibleCount === 0} onClick={onCopy} title="复制所选设备为蓝图并进入粘贴" aria-label="复制所选为蓝图"><Copy size={16} /></button>
      <button type="button" disabled={!canUpgrade} onClick={onUpgrade} title="批量升级所有可升级设备" aria-label="批量升级所选设备"><ArrowUp size={16} /></button>
      <button className="danger" type="button" onClick={onRemove} title="批量回收所选设备" aria-label="批量回收所选设备"><Trash2 size={16} /></button>
    </div>
  );
}

export function BlueprintPlacementCursor({ blueprint, x, y }: { blueprint: BlueprintDefinition; x: number; y: number }) {
  return (
    <div className="blueprint-placement-cursor" style={{ left: x + 14, top: y + 14 }}>
      <Layers3 size={15} /><span>{blueprint.name}</span><strong>{blueprint.rotation ?? 0}°{blueprint.mirror === "horizontal" ? " · 镜像" : ""} · ×{blueprint.entities.length}</strong>
    </div>
  );
}

export function BlueprintWorkspace({ open, game, onClose, onDeploy, onRemove, onRename, onTransform, onRecipeOverride, onCancelQueue, onExport, onImport }: {
  open: boolean;
  game: GameState;
  onClose: () => void;
  onDeploy: (blueprintId: string) => void;
  onRemove: (blueprintId: string) => void;
  onRename: (blueprintId: string, name: string) => void;
  onTransform: (blueprintId: string, rotation: BlueprintRotation, mirror: BlueprintMirror) => void;
  onRecipeOverride: (blueprintId: string, sourceRecipeId: RecipeId, targetRecipeId: RecipeId) => void;
  onCancelQueue: (entryId: string) => void;
  onExport: (blueprintId: string) => void;
  onImport: (raw: string) => { success: boolean; message: string };
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const importRaw = (raw: string) => {
    const result = onImport(raw);
    setImportMessage(result.message);
    if (result.success) {
      setImportText("");
      window.setTimeout(() => {
        setImportOpen(false);
        setImportMessage(null);
      }, 900);
    }
  };
  if (!open) return null;
  return (
    <section className="blueprint-workspace" role="dialog" aria-modal="true" aria-label="蓝图库">
      <header className="blueprint-header">
        <div className="blueprint-title"><i><Layers3 size={20} /></i><div><span>生产网络模板</span><strong>蓝图库</strong></div></div>
        <div className="blueprint-headline"><span>模板 <strong>{game.blueprints.length}</strong></span><span>施工队列 <strong>{game.constructionQueue.length}</strong></span><span>部署行星 <strong>{getPlanet(game.activePlanetId).name}</strong></span></div>
        <div className="blueprint-header-actions"><button type="button" onClick={() => { setImportOpen((current) => !current); setImportMessage(null); }} title="导入蓝图" aria-label="导入蓝图"><Upload size={15} /></button><button className="blueprint-close" type="button" onClick={onClose} title="关闭蓝图库" aria-label="关闭蓝图库"><X size={18} /></button></div>
      </header>
      <input ref={fileInputRef} className="blueprint-import-file" type="file" accept="application/json,.json" aria-label="选择要导入的蓝图文件" onChange={async (event) => { const file = event.target.files?.[0]; if (file) importRaw(await file.text()); event.target.value = ""; }} />
      {importOpen ? <section className="blueprint-import-panel" aria-label="蓝图导入">
        <header><div><Upload size={15} /><span><strong>导入蓝图</strong><small>交换文件会校验当前内容目录中的设备、物品和配方。</small></span></div><button type="button" onClick={() => fileInputRef.current?.click()}><Upload size={13} />选择文件</button></header>
        <textarea value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="粘贴蓝图交换 JSON" aria-label="粘贴蓝图交换 JSON" />
        <footer><span className={importMessage?.startsWith("已导入") ? "ready" : ""}>{importMessage ?? "导出的蓝图可以直接在此粘贴。"}</span><button type="button" disabled={!importText.trim()} onClick={() => importRaw(importText)}><Check size={13} />导入到蓝图库</button></footer>
      </section> : null}
      <div className="blueprint-library">
        {game.blueprints.length === 0 ? (
          <div className="blueprint-empty"><BoxSelect size={26} /><strong>蓝图库为空</strong><span>在画布中框选设备，再使用选区复制命令建立模板。</span></div>
        ) : game.blueprints.map((blueprint) => {
          const requirements = getBlueprintRequirements(blueprint);
          const deployable = canPlaceBlueprint(game, blueprint.id);
          const compatible = canQueueBlueprint(game, blueprint.id);
          const recipeTemplates = blueprint.entities.filter((entity) => entity.recipeId);
          const sourceRecipeIds = [...new Set(recipeTemplates.flatMap((entity) => entity.recipeId ? [entity.recipeId] : []))];
          return (
            <article className="blueprint-card" key={blueprint.id}>
              <header>
                <i><Layers3 size={18} /></i>
                <label><span>蓝图名称</span><input defaultValue={blueprint.name} aria-label={`${blueprint.name}名称`} onBlur={(event) => onRename(blueprint.id, event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
                <em>{blueprint.entities.length} 节点 · {blueprint.belts.length} 线路 · {blueprint.externalPorts?.length ?? 0} 外部端口</em>
              </header>
              <div className="blueprint-composition">
                {blueprintBuildingSummary(blueprint).map((label) => <span key={label}>{label}</span>)}
              </div>
              <div className="blueprint-transform-controls">
                <span>部署方向</span>
                <div className="segmented-control">
                  {([0, 90, 180, 270] as BlueprintRotation[]).map((rotation) => <button className={(blueprint.rotation ?? 0) === rotation ? "active" : ""} type="button" key={rotation} onClick={() => onTransform(blueprint.id, rotation, blueprint.mirror ?? "none")}><RotateCw size={12} />{rotation}°</button>)}
                </div>
                <button className={blueprint.mirror === "horizontal" ? "blueprint-mirror active" : "blueprint-mirror"} type="button" onClick={() => onTransform(blueprint.id, blueprint.rotation ?? 0, blueprint.mirror === "horizontal" ? "none" : "horizontal")}><FlipHorizontal2 size={13} />水平镜像</button>
              </div>
              {sourceRecipeIds.length > 0 ? <div className="blueprint-parameters">
                <strong>配方参数</strong>
                {sourceRecipeIds.map((sourceRecipeId) => {
                  const template = recipeTemplates.find((entity) => entity.recipeId === sourceRecipeId)!;
                  const options = getRecipesForBuilding(template.buildingId).filter((recipe) => !recipe.requiredTechId || isTechnologyCompleted(game, recipe.requiredTechId));
                  return <label key={sourceRecipeId}><span>{getRecipe(sourceRecipeId)?.name ?? sourceRecipeId}</span><select value={blueprint.recipeOverrides?.[sourceRecipeId] ?? sourceRecipeId} onChange={(event) => onRecipeOverride(blueprint.id, sourceRecipeId, event.target.value as RecipeId)}>{options.map((recipe) => <option value={recipe.id} key={recipe.id}>{recipe.name}</option>)}</select></label>;
                })}
              </div> : null}
              {(blueprint.externalPorts?.length ?? 0) > 0 ? <div className="blueprint-external-ports"><strong>外部接口</strong><div>{blueprint.externalPorts!.map((port) => <span key={port.key}>{port.direction === "input" ? "输入" : "输出"} · {getItem(port.itemId).name}</span>)}</div></div> : null}
              <div className="blueprint-requirements">
                <strong>施工需求</strong>
                <div>{requirements.map((requirement) => {
                  const stock = Math.floor(game.construction[requirement.constructionId] ?? 0);
                  return <span className={stock >= requirement.amount ? "ready" : ""} key={requirement.constructionId}>{stock >= requirement.amount ? <Check size={11} /> : <PackageOpen size={11} />}{getConstructionDefinition(requirement.constructionId)?.name ?? requirement.constructionId} {stock}/{requirement.amount}</span>;
                })}</div>
              </div>
              <footer>
                <button className="blueprint-export" type="button" onClick={() => onExport(blueprint.id)} title={`导出${blueprint.name}`}><Download size={14} />导出</button>
                <button type="button" disabled={!compatible} onClick={() => onDeploy(blueprint.id)} title={!compatible ? "当前行星不兼容" : deployable ? `在${getPlanet(game.activePlanetId).name}部署${blueprint.name}` : "点击画布创建缺料施工订单"}>{deployable ? <Copy size={14} /> : <Clock3 size={14} />}{deployable ? "部署" : "排队部署"}</button>
                <button className="danger" type="button" onClick={() => onRemove(blueprint.id)} title={`删除${blueprint.name}`} aria-label={`删除${blueprint.name}`}><Trash2 size={14} /></button>
              </footer>
            </article>
          );
        })}
      </div>
      {game.constructionQueue.length > 0 ? <section className="construction-queue-panel">
        <header><Clock3 size={16} /><div><span>自动施工协议</span><strong>待建队列</strong></div><em>{game.constructionQueue.length}</em></header>
        <div>{game.constructionQueue.map((entry) => {
          const deficits = getConstructionQueueDeficits(game, entry.id);
          return <article key={entry.id}><div><strong>{entry.blueprintName}</strong><span>{getPlanet(entry.planetId).name} · {entry.rotation}°{entry.mirror === "horizontal" ? " · 镜像" : ""}</span></div><p>{deficits.length === 0 ? "材料齐备，等待下一模拟周期" : deficits.map((deficit) => `${getConstructionDefinition(deficit.constructionId)?.name ?? deficit.constructionId} -${deficit.missing}`).join(" · ")}</p><button type="button" onClick={() => onCancelQueue(entry.id)} title="取消施工订单" aria-label={`取消${entry.blueprintName}施工订单`}><X size={13} /></button></article>;
        })}</div>
      </section> : null}
    </section>
  );
}
