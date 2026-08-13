import { Activity, BarChart3, BookOpen, Boxes, Calculator, Command, Database, Factory, Flag, Gauge, Globe2, Layers3, LogOut, Network, Orbit, PackageCheck, RadioTower, Route, Save, Settings, ShieldCheck, Smartphone, Telescope, TriangleAlert, Trophy, UserRound } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { OperationsTab } from "../OperationsWorkspace";
import type { StatisticsTab } from "../StatisticsWorkspace";
import type { MobileWorkspaceId } from "../../hooks/useMobileNavigation";
import { WorkspaceFrame } from "../WorkspaceFrame";

const RECENT_WORKSPACES_KEY = "dsp-idle-network.mobile-recent-workspaces.v1";

interface HubAction {
  id: string;
  label: string;
  detail: string;
  icon: ReactNode;
  run: () => void;
  disabled?: boolean;
  danger?: boolean;
}

function readRecentWorkspaces(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_WORKSPACES_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string").slice(0, 3) : [];
  } catch {
    return [];
  }
}

export function MobileWorkspaceHub({ hasConstructionCenter, onOpenWorkspace, onOpenStatistics, onOpenOperations, onOpenGalaxy, onOpenCommandPalette, onSwitchLegacy, onRequestExit, onClose }: {
  hasConstructionCenter: boolean;
  onOpenWorkspace: (id: MobileWorkspaceId) => void;
  onOpenStatistics: (tab: StatisticsTab) => void;
  onOpenOperations: (tab: OperationsTab) => void;
  onOpenGalaxy: (tab: "ranking" | "cloud" | "account") => void;
  onOpenCommandPalette: () => void;
  onSwitchLegacy: () => void;
  onRequestExit: () => void;
  onClose: () => void;
}) {
  const [recentIds, setRecentIds] = useState(readRecentWorkspaces);
  const groups = useMemo(() => {
    const production: HubAction[] = [
      { id: "statistics", label: "生产统计", detail: "产量、消耗、效率和电力", icon: <BarChart3 size={21} />, run: () => onOpenStatistics("production") },
      { id: "management", label: "生产管理", detail: "全行星设备、缺料与堵塞", icon: <Factory size={21} />, run: () => onOpenStatistics("management") },
      { id: "recipes", label: "生产资料库", detail: "物品、建筑、物流、能源、星球与科研", icon: <BookOpen size={21} />, run: () => onOpenWorkspace("recipes") },
      { id: "networks", label: "网络诊断", detail: "运输吞吐、断料与拥堵", icon: <Network size={21} />, run: () => onOpenStatistics("networks") },
      { id: "planning", label: "工业规划", detail: "按目标产量反推设备需求", icon: <Calculator size={21} />, run: () => onOpenStatistics("planning") },
    ];
    const expansion: HubAction[] = [
      { id: "star-map", label: "星图与星际工业", detail: "探索、殖民、航线与行星分工", icon: <Telescope size={21} />, run: () => onOpenWorkspace("star-map") },
      { id: "logistics", label: "物流管理", detail: "跨星球编辑物流塔、轨道采集器与量子模式", icon: <Route size={21} />, run: () => onOpenOperations("logistics") },
      { id: "dyson", label: "戴森规划", detail: "太阳帆、轨道、壳层和发射", icon: <Orbit size={21} />, run: () => onOpenWorkspace("dyson") },
      { id: "galaxy", label: "银河网络", detail: "排行榜、云存档与终局档案", icon: <Globe2 size={21} />, run: () => onOpenGalaxy("ranking") },
    ];
    const tools: HubAction[] = [
      { id: "campaign", label: "主线任务", detail: "章节目标、奖励与卡点定位", icon: <Flag size={21} />, run: () => onOpenWorkspace("campaign") },
      { id: "blueprints", label: "蓝图库", detail: "保存、导入与部署生产布局", icon: <Layers3 size={21} />, run: () => onOpenWorkspace("blueprints") },
      { id: "construction-center", label: "建筑制造中心", detail: hasConstructionCenter ? "自动补足施工库存" : "需要先建造并放置建筑制造中心", icon: <Boxes size={21} />, run: () => onOpenWorkspace("construction-center"), disabled: !hasConstructionCenter },
      { id: "alerts", label: "警报与成就", detail: "停机原因、里程碑与定位", icon: <TriangleAlert size={21} />, run: () => onOpenOperations("alerts") },
      { id: "command", label: "命令面板", detail: "搜索设备、物品和快速动作", icon: <Command size={21} />, run: onOpenCommandPalette },
    ];
    const system: HubAction[] = [
      { id: "saves", label: "存档管理", detail: "保存、槽位、快照、导入和导出", icon: <Save size={21} />, run: () => onOpenOperations("saves") },
      { id: "cloud", label: "云存档", detail: "主存档、手动槽位与冲突处理", icon: <Database size={21} />, run: () => onOpenGalaxy("cloud") },
      { id: "account", label: "账号", detail: "登录、邮箱、设备与数据安全", icon: <UserRound size={21} />, run: () => onOpenGalaxy("account") },
      { id: "settings", label: "游戏设置", detail: "字号、性能、动效和自动保存", icon: <Settings size={21} />, run: () => onOpenOperations("settings") },
      { id: "performance", label: "性能监控", detail: "FPS、Worker、内存与卡顿归因", icon: <Activity size={21} />, run: () => onOpenOperations("performance") },
      { id: "packs", label: "内容包", detail: "注册、依赖、启停与版本", icon: <PackageCheck size={21} />, run: () => onOpenOperations("packs") },
      { id: "support", label: "诊断与反馈", detail: "运行状态、问题反馈和数据说明", icon: <ShieldCheck size={21} />, run: () => onOpenOperations("support") },
      { id: "legacy-ui", label: "切换经典手机界面", detail: "立即回到原有手机布局，偏好会保留", icon: <Smartphone size={21} />, run: onSwitchLegacy },
      { id: "return-menu", label: "保存并返回主菜单", detail: "保存当前工厂后离开游戏", icon: <LogOut size={21} />, run: onRequestExit, danger: true },
    ];
    return [
      { id: "production", label: "生产", icon: <Gauge size={17} />, actions: production },
      { id: "expansion", label: "扩张", icon: <RadioTower size={17} />, actions: expansion },
      { id: "tools", label: "工具", icon: <Route size={17} />, actions: tools },
      { id: "system", label: "系统", icon: <Settings size={17} />, actions: system },
    ];
  }, [hasConstructionCenter, onOpenCommandPalette, onOpenGalaxy, onOpenOperations, onOpenStatistics, onOpenWorkspace, onRequestExit, onSwitchLegacy]);
  const allActions = groups.flatMap((group) => group.actions);
  const recentActions = recentIds.flatMap((id) => allActions.find((action) => action.id === id) ?? []);
  const runAction = (action: HubAction) => {
    if (action.disabled) return;
    if (action.id !== "legacy-ui" && action.id !== "return-menu") {
      const next = [action.id, ...recentIds.filter((id) => id !== action.id)].slice(0, 3);
      setRecentIds(next);
      try { window.localStorage.setItem(RECENT_WORKSPACES_KEY, JSON.stringify(next)); } catch { /* Recent UI history is optional. */ }
    }
    action.run();
  };
  const actionButton = (action: HubAction) => (
    <button className={`${action.danger ? "danger " : ""}${action.disabled ? "disabled" : ""}`.trim()} type="button" disabled={action.disabled} onClick={() => runAction(action)} key={action.id}>
      <i>{action.icon}</i><span><strong>{action.label}</strong><small>{action.detail}</small></span><b aria-hidden="true">›</b>
    </button>
  );

  return (
    <WorkspaceFrame className="mobile-next-workspace-hub" ariaLabel="更多工作区" onRequestClose={onClose}>
      <div className="mobile-next-workspace-hub__scroll">
        {recentActions.length > 0 ? <section><header><Trophy size={17} /><strong>最近使用</strong></header><div>{recentActions.map(actionButton)}</div></section> : null}
        {groups.map((group) => <section key={group.id}><header>{group.icon}<strong>{group.label}</strong></header><div>{group.actions.map(actionButton)}</div></section>)}
      </div>
    </WorkspaceFrame>
  );
}
