import { BarChart3, BookOpen, Check, Command, Factory, Flag, FlaskConical, Focus, Gauge, Globe2, Map, PackageOpen, Pause, Play, Search, Settings2, Telescope, WandSparkles, Wrench, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ITEMS, getBuilding, getPlanet } from "../game/content";
import type { GameState, ItemId } from "../game/types";

export type CommandWorkspace = "operations" | "campaign" | "galaxy" | "star-map" | "statistics" | "recipes" | "technology" | "blueprints" | "dyson" | "inspector" | "resources";

interface CommandPaletteProps {
  open: boolean;
  game: GameState;
  onClose: () => void;
  onOpenWorkspace: (workspace: CommandWorkspace) => void;
  onFocusRecipe: (itemId: ItemId) => void;
  onFocusEntity: (entityId: string) => void;
  onAutoLayout: () => void;
  onPauseToggle: () => void;
  onTogglePerformance: () => void;
  onToggleReducedMotion: () => void;
  onReset: () => void;
}

interface PaletteCommand {
  id: string;
  label: string;
  detail: string;
  icon: ReactNode;
  run: () => void;
}

export function CommandPalette({ open, game, onClose, onOpenWorkspace, onFocusRecipe, onFocusEntity, onAutoLayout, onPauseToggle, onTogglePerformance, onToggleReducedMotion, onReset }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const paletteRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const run = (action: () => void) => {
    action();
    onClose();
  };
  const commands = useMemo<PaletteCommand[]>(() => {
    const workspace = (id: string, label: string, detail: string, icon: ReactNode, target: CommandWorkspace): PaletteCommand => ({
      id,
      label,
      detail,
      icon,
      run: () => run(() => onOpenWorkspace(target)),
    });
    const base: PaletteCommand[] = [
      workspace("star-map", "打开星图与星际工业", "探索、航线和行星角色", <Telescope size={16} />, "star-map"),
      workspace("galaxy", "打开银河网络", "账户、累计发电与白矩阵排行榜", <Globe2 size={16} />, "galaxy"),
      workspace("statistics", "打开生产统计", "网络、吞吐和工业规划", <BarChart3 size={16} />, "statistics"),
      workspace("recipes", "打开配方图鉴", "搜索原料、设备和生产链", <BookOpen size={16} />, "recipes"),
      workspace("technology", "打开科技树", "科研队列和解锁路径", <FlaskConical size={16} />, "technology"),
      workspace("operations", "打开运营中心", "警报、设置和存档", <Gauge size={16} />, "operations"),
      workspace("campaign", "打开主线任务", "查看章节目标和奖励", <Flag size={16} />, "campaign"),
      workspace("blueprints", "打开蓝图库", "部署和管理生产蓝图", <Factory size={16} />, "blueprints"),
      workspace("dyson", "打开戴森规划", "轨道、壳层和发射", <Map size={16} />, "dyson"),
      workspace("inspector", "打开设备检查器", "查看当前选中设备", <Wrench size={16} />, "inspector"),
      workspace("resources", "打开物资托盘", "库存与跨星球物资", <PackageOpen size={16} />, "resources"),
      { id: "pause", label: game.paused ? "继续模拟" : "暂停模拟", detail: "Space", icon: game.paused ? <Play size={16} /> : <Pause size={16} />, run: () => run(onPauseToggle) },
      { id: "performance", label: game.settings.performanceMode ? "关闭性能模式" : "开启性能模式", detail: "降低大规模工厂视觉负载", icon: <Gauge size={16} />, run: () => run(onTogglePerformance) },
      { id: "motion", label: game.settings.reducedMotion ? "开启动态效果" : "减少动态效果", detail: "尊重动效偏好", icon: <Settings2 size={16} />, run: () => run(onToggleReducedMotion) },
      { id: "auto-layout", label: "整理当前行星生产网络", detail: "按物流上下游自动排列全部设备", icon: <WandSparkles size={16} />, run: () => run(onAutoLayout) },
      { id: "reset", label: "重置当前工厂", detail: "清空当前存档并重新开始", icon: <X size={16} />, run: () => run(onReset) },
    ];
    const itemCommands: PaletteCommand[] = Object.values(ITEMS).map((item) => ({
      id: `recipe:${item.id}`,
      label: `聚焦配方：${item.name}`,
      detail: `${item.symbol} · 打开上下游生产链`,
      icon: <span className="command-item-swatch" style={{ backgroundColor: item.color }}>{item.symbol.slice(0, 3)}</span>,
      run: () => run(() => onFocusRecipe(item.id)),
    }));
    const entityCommands: PaletteCommand[] = game.entities.map((entity) => {
      const name = entity.buildingId ? getBuilding(entity.buildingId).name : entity.resourceId ? ITEMS[entity.resourceId].name : "生产节点";
      const recipe = entity.recipeId ? ` · ${entity.recipeId}` : "";
      return {
        id: `entity:${entity.id}`,
        label: `定位：${name}`,
        detail: `${getPlanet(entity.planetId).name} · ${entity.id}${recipe}`,
        icon: <Focus size={16} />,
        run: () => run(() => onFocusEntity(entity.id)),
      };
    });
    return [...base, ...itemCommands, ...entityCommands];
  }, [game.entities, game.paused, game.settings.performanceMode, game.settings.reducedMotion, onAutoLayout, onFocusEntity, onFocusRecipe, onOpenWorkspace, onPauseToggle, onReset, onTogglePerformance, onToggleReducedMotion]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    if (!normalized) return commands.slice(0, 12);
    return commands.filter((command) => `${command.label} ${command.detail}`.toLocaleLowerCase("zh-CN").includes(normalized)).slice(0, 16);
  }, [commands, query]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery("");
    setActiveIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(timer);
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  if (!open) return null;
  return (
    <div className="command-palette-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={paletteRef} className="command-palette" role="dialog" aria-modal="true" aria-label="命令面板" onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const focusable = [...(paletteRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? [])];
        if (focusable.length === 0) return;
        const current = focusable.indexOf(document.activeElement as HTMLElement);
        const next = event.shiftKey
          ? current <= 0 ? focusable.length - 1 : current - 1
          : current >= focusable.length - 1 ? 0 : current + 1;
        event.preventDefault();
        focusable[next].focus();
      }}>
        <header>
          <div className="command-palette-title"><i><Command size={17} /></i><span><strong>命令面板</strong><small>搜索设备、工作区、设置或物品</small></span></div>
          <button type="button" onClick={onClose} title="关闭命令面板" aria-label="关闭命令面板"><X size={16} /></button>
        </header>
        <label className="command-palette-search"><Search size={16} /><input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, Math.max(0, filtered.length - 1))); }
          else if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)); }
          else if (event.key === "Enter") { event.preventDefault(); filtered[activeIndex]?.run(); }
          else if (event.key === "Escape") { event.preventDefault(); onClose(); }
        }} placeholder="输入设备、物品、工作区或动作" aria-label="搜索命令" autoComplete="off" /><kbd>Esc</kbd></label>
        <div className="command-palette-list" role="listbox" aria-label="命令结果">
          {filtered.map((command, index) => <button type="button" role="option" aria-selected={index === activeIndex} className={index === activeIndex ? "active" : ""} key={command.id} onMouseEnter={() => setActiveIndex(index)} onClick={command.run}><i>{command.icon}</i><span><strong>{command.label}</strong><small>{command.detail}</small></span>{index === activeIndex ? <Check size={14} /> : null}</button>)}
          {filtered.length === 0 ? <div className="command-palette-empty">没有匹配的命令或物品</div> : null}
        </div>
        <footer><span><kbd>↑</kbd><kbd>↓</kbd>选择</span><span><kbd>Enter</kbd>执行</span><span><kbd>Esc</kbd>关闭</span></footer>
      </section>
    </div>
  );
}
