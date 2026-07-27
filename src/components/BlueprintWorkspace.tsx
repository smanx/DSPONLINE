import { ArrowUp, BoxSelect, Check, ChevronLeft, ChevronRight, Clock3, Copy, Download, FlipHorizontal2, Focus, Layers3, Lock, MousePointer2, PackageOpen, Palette, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Redo2, RotateCw, Route, Trash2, Undo2, Unlock, Upload, WandSparkles, X } from "lucide-react";
import { getConstructionDefinition, getItem, getPlanet, getRecipe, getRecipesForBuilding } from "../game/content";
import { canPlaceBlueprint, canQueueBlueprint, getBlueprintFleetLoadPreview, getBlueprintRequirements, getConstructionQueueDeficits, isTechnologyCompleted } from "../game/engine";
import type { BlueprintDefinition, BlueprintMirror, BlueprintRotation, CanvasRegion, GameState, RecipeId } from "../game/types";
import { Fragment, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

function blueprintBuildingSummary(blueprint: BlueprintDefinition): string[] {
  const counts = new Map<string, number>();
  for (const entity of blueprint.entities) {
    const name = getConstructionDefinition(entity.buildingId)?.name ?? entity.buildingId;
    counts.set(name, (counts.get(name) ?? 0) + entity.machineCount);
  }
  return [...counts].map(([name, amount]) => `${name} ×${amount}`);
}

export function CanvasSelectionTools({ selectionMode, regionMode, blueprintCount, beltCount, regionCount, canUndo, canRedo, canUndoAutoLayout, leftSidebarCollapsed, rightSidebarCollapsed, onModeChange, onRegionModeChange, onOpenBlueprints, onOpenNetworks, onAutoLayout, onUndoAutoLayout, onUndo, onRedo, onToggleLeftSidebar, onToggleRightSidebar }: {
  selectionMode: boolean;
  regionMode: boolean;
  blueprintCount: number;
  beltCount: number;
  regionCount: number;
  canUndo: boolean;
  canRedo: boolean;
  canUndoAutoLayout: boolean;
  leftSidebarCollapsed: boolean;
  rightSidebarCollapsed: boolean;
  onModeChange: (enabled: boolean) => void;
  onRegionModeChange: (enabled: boolean) => void;
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
        <button className={!selectionMode && !regionMode ? "active" : ""} type="button" onClick={() => onModeChange(false)} title="指针与节点移动" aria-label="指针模式"><MousePointer2 size={16} /></button>
        <button className={selectionMode ? "active" : ""} type="button" onClick={() => onModeChange(true)} title="拖拽框选节点，可按 Shift 增减选择" aria-label="框选模式"><BoxSelect size={16} /></button>
        <button className={regionMode ? "active" : ""} type="button" onClick={() => onRegionModeChange(!regionMode)} title="在空白画布拖拽创建生产区域" aria-label="生产区域模式"><Palette size={16} /><em>{regionCount}</em></button>
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

export interface CanvasRegionRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CanvasRegionResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

const CANVAS_REGION_RESIZE_HANDLES: CanvasRegionResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const CANVAS_REGION_RESIZE_LABELS: Record<CanvasRegionResizeHandle, string> = {
  n: "调整上边界",
  ne: "调整右上角",
  e: "调整右边界",
  se: "调整右下角",
  s: "调整下边界",
  sw: "调整左下角",
  w: "调整左边界",
  nw: "调整左上角",
};

export function CanvasRegionLayer({ regions, draft, selectedRegionId, resizePreview, resizeHandleSize = 16, onSelect, onResizeStart }: {
  regions: CanvasRegion[];
  draft: CanvasRegionRectangle | null;
  selectedRegionId: string | null;
  resizePreview?: { regionId: string; rectangle: CanvasRegionRectangle } | null;
  resizeHandleSize?: number;
  onSelect: (regionId: string) => void;
  onResizeStart?: (event: ReactPointerEvent<HTMLButtonElement>, region: CanvasRegion, handle: CanvasRegionResizeHandle) => void;
}) {
  return <>
    {regions.map((region) => {
      const rectangle = resizePreview?.regionId === region.id ? resizePreview.rectangle : region;
      const selected = selectedRegionId === region.id;
      const handleX = (handle: CanvasRegionResizeHandle) => handle.includes("w") ? rectangle.x : handle.includes("e") ? rectangle.x + rectangle.width : rectangle.x + rectangle.width / 2;
      const handleY = (handle: CanvasRegionResizeHandle) => handle.includes("n") ? rectangle.y : handle.includes("s") ? rectangle.y + rectangle.height : rectangle.y + rectangle.height / 2;
      return <Fragment key={region.id}>
        <div
          className={`canvas-region${selected ? " canvas-region--selected canvas-region--resizable" : ""}`}
          style={{
            left: rectangle.x,
            top: rectangle.y,
            width: rectangle.width,
            height: rectangle.height,
            borderColor: region.borderColor,
            backgroundColor: `${region.fillColor}24`,
            color: region.borderColor,
          } as CSSProperties}
        >
          <button className="canvas-region__label nodrag nopan" type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onSelect(region.id); }} title={`编辑${region.name}`}><Palette size={12} /><span>{region.name}</span></button>
        </div>
        {selected ? CANVAS_REGION_RESIZE_HANDLES.map((handle) => <button
            className={`canvas-region__resize-handle canvas-region__resize-handle--${handle} nodrag nopan`}
            type="button"
            key={handle}
            style={{
              left: handleX(handle),
              top: handleY(handle),
              color: region.borderColor,
              "--canvas-region-handle-size": `${resizeHandleSize}px`,
            } as CSSProperties}
            aria-label={`${CANVAS_REGION_RESIZE_LABELS[handle]}：${region.name}`}
            title={CANVAS_REGION_RESIZE_LABELS[handle]}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
              onResizeStart?.(event, region, handle);
            }}
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
          />) : null}
      </Fragment>;
    })}
    {draft ? <div className="canvas-region canvas-region--draft" style={{ left: draft.x, top: draft.y, width: draft.width, height: draft.height } as CSSProperties}><span>新生产区域</span></div> : null}
  </>;
}

export function CanvasRegionEditor({ region, onChange, onRemove, onClose }: {
  region: CanvasRegion;
  onChange: (changes: Partial<Pick<CanvasRegion, "name" | "fillColor" | "borderColor">>) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  return (
    <section className="canvas-region-editor nodrag nopan" aria-label="生产区域设置">
      <Palette size={15} />
      <label><span>区域名称</span><input key={region.id} defaultValue={region.name} maxLength={28} onBlur={(event) => onChange({ name: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
      <label className="canvas-region-editor__color"><span>背景</span><input type="color" value={region.fillColor} onChange={(event) => onChange({ fillColor: event.target.value })} /></label>
      <label className="canvas-region-editor__color"><span>边框</span><input type="color" value={region.borderColor} onChange={(event) => onChange({ borderColor: event.target.value })} /></label>
      <button className="danger" type="button" onClick={onRemove} title="删除生产区域" aria-label="删除生产区域"><Trash2 size={14} /></button>
      <button type="button" onClick={onClose} title="关闭区域设置" aria-label="关闭区域设置"><X size={14} /></button>
    </section>
  );
}

export function SelectionToolbar({ selectedCount, selectedBeltCount, eligibleCount, canUpgrade, canUpgradeBelts, canLock, canUnlock, onFocus, onAutoLayout, onCopy, onUpgrade, onUpgradeBelts, onLock, onUnlock, onRemove, onClear, onDone }: {
  selectedCount: number;
  selectedBeltCount: number;
  eligibleCount: number;
  canUpgrade: boolean;
  canUpgradeBelts: boolean;
  canLock: boolean;
  canUnlock: boolean;
  onFocus: () => void;
  onAutoLayout: () => void;
  onCopy: () => void;
  onUpgrade: () => void;
  onUpgradeBelts: () => void;
  onLock: () => void;
  onUnlock: () => void;
  onRemove: () => void;
  onClear: () => void;
  onDone: () => void;
}) {
  if (selectedCount + selectedBeltCount === 0) return null;
  return (
    <div className="selection-toolbar nodrag nopan" role="toolbar" aria-label="选区操作">
      <span><BoxSelect size={14} /><strong>{selectedCount}</strong> 节点 · <strong>{selectedBeltCount}</strong> 线路</span>
      <button type="button" disabled={selectedCount === 0} onClick={onFocus} title="定位到所选设备" aria-label="定位到所选设备"><Focus size={16} /></button>
      <button type="button" disabled={selectedCount === 0} onClick={onAutoLayout} title="按物流上下游整理所选设备" aria-label="自动整理所选设备"><WandSparkles size={16} /></button>
      <button type="button" disabled={eligibleCount === 0} onClick={onCopy} title="复制所选设备为蓝图并进入粘贴" aria-label="复制所选为蓝图"><Copy size={16} /></button>
      <button type="button" disabled={!canUpgrade} onClick={onUpgrade} title="批量升级所有可升级设备" aria-label="批量升级所选设备"><ArrowUp size={16} /></button>
      <button type="button" disabled={!canUpgradeBelts} onClick={onUpgradeBelts} title="一键升级所有选中传送带并保持连接" aria-label="一键升级所选传送带"><Route size={16} /><ArrowUp size={12} /></button>
      <button type="button" disabled={!canLock} onClick={onLock} title="锁定所选建筑" aria-label="锁定所选建筑"><Lock size={16} /></button>
      <button type="button" disabled={!canUnlock} onClick={onUnlock} title="解锁所选建筑" aria-label="解锁所选建筑"><Unlock size={16} /></button>
      <button className="danger" type="button" onClick={onRemove} title="批量回收所选设备与线路" aria-label="批量回收所选设备与线路"><Trash2 size={16} /></button>
      <button type="button" onClick={onClear} title="清空当前选择" aria-label="清空选择"><X size={16} /></button>
      <button className="confirm" type="button" onClick={onDone} title="完成多选并返回指针模式" aria-label="完成多选"><Check size={16} /></button>
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

export function BlueprintWorkspace({ open, game, onClose, onDeploy, onRemove, onRename, onTransform, onRecipeOverride, onCancelQueue, onExport, onImport, mobile = false, mobileSubview, onMobileOpenDetail }: {
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
  mobile?: boolean;
  mobileSubview?: string | null;
  onMobileOpenDetail?: (subview: string) => void;
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
  const detailBlueprintId = mobile && mobileSubview?.startsWith("blueprint:") ? mobileSubview.slice(10) : null;
  const visibleBlueprints = detailBlueprintId ? game.blueprints.filter((blueprint) => blueprint.id === detailBlueprintId) : game.blueprints;
  return (
    <section className={`blueprint-workspace${mobile ? ` mobile-workspace mobile-blueprints${detailBlueprintId ? " mobile-workspace--detail" : ""}` : ""}`} role="dialog" aria-modal="true" aria-label="蓝图库">
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
        ) : visibleBlueprints.map((blueprint) => {
          const requirements = getBlueprintRequirements(blueprint);
          const fleet = getBlueprintFleetLoadPreview(game, blueprint.id);
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
              {mobile && !detailBlueprintId ? <button className="mobile-blueprint-open" type="button" onClick={() => onMobileOpenDetail?.(`blueprint:${blueprint.id}`)}>查看与部署<ChevronRight size={18} /></button> : null}
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
              {fleet.drones.target > 0 || fleet.vessels.target > 0 ? <div className="blueprint-requirements blueprint-fleet-targets">
                <strong>载具目标</strong>
                <div>
                  {fleet.drones.target > 0 ? <span className={fleet.drones.shortfall === 0 ? "ready" : ""}><PackageOpen size={11} />运输机 {fleet.drones.loaded}/{fleet.drones.target}{fleet.drones.shortfall > 0 ? ` · 缺 ${fleet.drones.shortfall}` : ""}</span> : null}
                  {fleet.vessels.target > 0 ? <span className={fleet.vessels.shortfall === 0 ? "ready" : ""}><PackageOpen size={11} />运输船 {fleet.vessels.loaded}/{fleet.vessels.target}{fleet.vessels.shortfall > 0 ? ` · 缺 ${fleet.vessels.shortfall}` : ""}</span> : null}
                </div>
              </div> : null}
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
