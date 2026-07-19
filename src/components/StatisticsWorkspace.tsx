import { AlertTriangle, BarChart3, Box, CircleCheckBig, Factory, Search, X, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { getItem, getPlanet } from "../game/content";
import { calculateFactoryStatistics, type ItemStatistics } from "../game/statistics";
import type { GameState, ItemId } from "../game/types";
import { ItemHoverCard } from "./ItemReference";

type StatisticsTab = "production" | "power" | "issues";
type ItemFilter = "all" | "producing" | "deficit" | "blocked";
type ItemSort = "production" | "consumption" | "net" | "inventory" | "name";

interface StatisticsWorkspaceProps {
  open: boolean;
  game: GameState;
  onClose: () => void;
}

function ItemMark({ itemId }: { itemId: ItemId }) {
  const item = getItem(itemId);
  return <ItemHoverCard itemId={itemId}><i className="item-mark" style={{ backgroundColor: item.color }}>{item.symbol}</i></ItemHoverCard>;
}

function rate(value: number): string {
  if (Math.abs(value) < 0.005) return "0.00";
  return value.toFixed(2);
}

function reserveTime(seconds: number): string {
  if (seconds <= 0) return "-";
  if (seconds < 60) return `${Math.floor(seconds)} s`;
  return `${Math.floor(seconds / 60)} min ${Math.floor(seconds % 60)} s`;
}

function sortItems(items: ItemStatistics[], sort: ItemSort): ItemStatistics[] {
  return [...items].sort((a, b) => {
    if (sort === "name") return getItem(a.itemId).name.localeCompare(getItem(b.itemId).name, "zh-CN");
    if (sort === "inventory") return b.inventory - a.inventory;
    if (sort === "consumption") return b.consumptionPerMinute - a.consumptionPerMinute;
    if (sort === "net") return a.netPerMinute - b.netPerMinute;
    return b.productionPerMinute - a.productionPerMinute;
  });
}

export function StatisticsWorkspace({ open, game, onClose }: StatisticsWorkspaceProps) {
  const [tab, setTab] = useState<StatisticsTab>("production");
  const [filter, setFilter] = useState<ItemFilter>("all");
  const [sort, setSort] = useState<ItemSort>("production");
  const [query, setQuery] = useState("");
  const statistics = useMemo(() => calculateFactoryStatistics(game), [game]);
  const items = useMemo(() => sortItems(statistics.items.filter((item) => {
    if (query && !getItem(item.itemId).name.includes(query.trim())) return false;
    if (filter === "producing") return item.productionPerMinute > 0;
    if (filter === "deficit") return item.netPerMinute < -0.005;
    if (filter === "blocked") return item.blockedProducerCount > 0;
    return true;
  }), sort), [filter, query, sort, statistics.items]);

  if (!open) return null;
  const generationUtilization = game.metrics.generationKw > 0
    ? Math.min(100, game.metrics.demandKw / game.metrics.generationKw * 100)
    : game.metrics.demandKw > 0 ? 100 : 0;

  return (
    <section className="statistics-workspace" role="dialog" aria-modal="true" aria-label="生产统计">
      <header className="statistics-header">
        <div className="statistics-title">
          <i><BarChart3 size={20} /></i>
          <div><span>{getPlanet(game.activePlanetId).name}电网 · 星系物流</span><strong>生产统计</strong></div>
        </div>
        <div className="statistics-headline">
          <span>生产 <strong>{rate(statistics.totalProductionPerMinute)}/min</strong></span>
          <span>消耗 <strong>{rate(statistics.totalConsumptionPerMinute)}/min</strong></span>
          <span className={statistics.issues.length > 0 ? "has-issues" : ""}>异常 <strong>{statistics.issues.length}</strong></span>
        </div>
        <button className="statistics-close" type="button" onClick={onClose} title="关闭生产统计" aria-label="关闭生产统计"><X size={18} /></button>
      </header>

      <nav className="statistics-tabs" role="tablist" aria-label="统计视图">
        <button type="button" role="tab" aria-selected={tab === "production"} className={tab === "production" ? "active" : ""} onClick={() => setTab("production")}><Factory size={15} />生产</button>
        <button type="button" role="tab" aria-selected={tab === "power"} className={tab === "power" ? "active" : ""} onClick={() => setTab("power")}><Zap size={15} />电力</button>
        <button type="button" role="tab" aria-selected={tab === "issues"} className={tab === "issues" ? "active" : ""} onClick={() => setTab("issues")}><AlertTriangle size={15} />瓶颈 <strong>{statistics.issues.length}</strong></button>
      </nav>

      {tab === "production" ? (
        <div className="statistics-content statistics-production">
          <div className="statistics-toolbar">
            <label className="statistics-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="筛选物品" aria-label="筛选统计物品" /></label>
            <div className="statistics-filter" aria-label="物品统计筛选">
              {(["all", "producing", "deficit", "blocked"] as ItemFilter[]).map((option) => (
                <button type="button" className={filter === option ? "active" : ""} key={option} onClick={() => setFilter(option)}>
                  {{ all: "全部", producing: "生产中", deficit: "净消耗", blocked: "堵塞" }[option]}
                </button>
              ))}
            </div>
            <label className="statistics-sort"><span>排序</span><select value={sort} onChange={(event) => setSort(event.target.value as ItemSort)}><option value="production">生产量</option><option value="consumption">消耗量</option><option value="net">净增量</option><option value="inventory">库存</option><option value="name">物品名称</option></select></label>
          </div>
          <div className={`statistics-table${items.length === 0 ? " statistics-table--empty" : ""}`}>
            <header><span>物品</span><span>生产 / min</span><span>消耗 / min</span><span>净增量 / min</span><span>网络库存</span><span>节点</span></header>
            <div>
              {items.length === 0 ? <div className="statistics-empty"><Box size={20} /><span>没有符合条件的物品</span></div> : items.map((item) => (
                <div className="statistics-row" key={item.itemId}>
                  <span className="statistics-item"><ItemMark itemId={item.itemId} /><strong>{getItem(item.itemId).name}</strong></span>
                  <span className="rate-positive">+{rate(item.productionPerMinute)}</span>
                  <span className="rate-negative">-{rate(item.consumptionPerMinute)}</span>
                  <span className={item.netPerMinute > 0.005 ? "rate-positive" : item.netPerMinute < -0.005 ? "rate-negative" : "rate-neutral"}>{item.netPerMinute > 0 ? "+" : ""}{rate(item.netPerMinute)}</span>
                  <span>{item.inventory.toLocaleString("zh-CN")}</span>
                  <span className={item.blockedProducerCount > 0 ? "node-count node-count--blocked" : "node-count"}>{item.producerCount} / {item.consumerCount}{item.blockedProducerCount > 0 ? ` · ${item.blockedProducerCount} 堵塞` : ""}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {tab === "power" ? (
        <div className="statistics-content statistics-power">
          <div className="power-summary-band">
            <div><span>电力需求</span><strong>{game.metrics.demandKw.toFixed(0)} kW</strong></div>
            <div><span>可用容量</span><strong>{game.metrics.generationKw.toFixed(0)} kW</strong></div>
            <div><span>风力容量</span><strong>{game.metrics.windGenerationKw.toFixed(0)} kW</strong></div>
            <div><span>太阳能容量</span><strong>{game.metrics.solarGenerationKw.toFixed(0)} kW</strong></div>
            <div><span>地热容量</span><strong>{game.metrics.geothermalGenerationKw.toFixed(0)} kW</strong></div>
            <div><span>射线电力</span><strong>{game.metrics.rayGenerationKw.toFixed(0)} kW</strong></div>
            <div><span>火电出力</span><strong>{game.metrics.thermalGenerationKw.toFixed(0)} kW</strong></div>
            <div><span>聚变出力</span><strong>{game.metrics.fusionGenerationKw.toFixed(0)} kW</strong></div>
            <div><span>人造恒星</span><strong>{game.metrics.artificialStarGenerationKw.toFixed(0)} kW</strong></div>
            <div><span>供电效率</span><strong>{Math.round(game.metrics.powerFactor * 100)}%</strong></div>
            <div><span>燃料续航</span><strong>{reserveTime(game.metrics.fuelReserveSeconds)}</strong></div>
            <div><span>储能水平</span><strong>{game.metrics.storedEnergyMj.toFixed(1)} / {game.metrics.storageCapacityMj.toFixed(0)} MJ</strong></div>
            <div><span>储能充电</span><strong>{game.metrics.storageChargeKw.toFixed(0)} kW</strong></div>
            <div><span>储能放电</span><strong>{game.metrics.storageDischargeKw.toFixed(0)} kW</strong></div>
            <div><span>在轨太阳帆</span><strong>{game.dysonSwarm.sailsInOrbit.toLocaleString("zh-CN")}</strong></div>
            <div><span>戴森云功率</span><strong>{(game.dysonSwarm.generationKw / 1000).toFixed(2)} MW</strong></div>
            <div><span>永久结构点</span><strong>{game.dysonSphere.structurePoints.toLocaleString("zh-CN")}</strong></div>
            <div><span>壳面太阳帆</span><strong>{game.dysonSphere.shellSails.toLocaleString("zh-CN")}</strong></div>
            <div><span>戴森球功率</span><strong>{(game.dysonSphere.generationKw / 1000).toFixed(2)} MW</strong></div>
          </div>
          <div className="grid-load"><i><b style={{ width: `${generationUtilization}%` }} /></i><span>容量利用率</span><strong>{Math.round(generationUtilization)}%</strong></div>
          <section className="consumer-ledger">
            <header><span>耗电设备</span><span>当前需求</span><span>额定需求</span><span>状态</span></header>
            <div>
              {statistics.powerConsumers.length === 0 ? <div className="statistics-empty"><Zap size={20} /><span>暂无耗电设备</span></div> : statistics.powerConsumers.map((consumer) => (
                <div className="consumer-row" key={consumer.entityId}>
                  <span><strong>{consumer.equipmentName}</strong><small>{consumer.entityId}</small></span>
                  <span>{consumer.activeDemandKw.toFixed(0)} kW</span>
                  <span>{consumer.ratedDemandKw.toFixed(0)} kW</span>
                  <span className={`status-text status-text--${consumer.status.tone}`}>{consumer.status.label}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {tab === "issues" ? (
        <div className="statistics-content statistics-issues">
          <header className="issues-heading"><AlertTriangle size={18} /><div><span>需处理设备</span><strong>{statistics.issues.length}</strong></div></header>
          <div className="issue-list">
            {statistics.issues.length === 0 ? <div className="statistics-empty"><CircleCheckBig size={20} /><span>生产网络运行正常</span></div> : statistics.issues.map((issue) => (
              <div className={`issue-row issue-row--${issue.status.tone}`} key={issue.entityId}>
                <i><AlertTriangle size={14} /></i>
                <span><strong>{issue.equipmentName}</strong><small>{issue.processName}</small></span>
                <span>{issue.status.label}</span>
                <code>{issue.entityId}</code>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
