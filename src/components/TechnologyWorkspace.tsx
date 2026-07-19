import { Check, FlaskConical, Gauge, ListOrdered, LockKeyhole, PackageCheck, Pickaxe, Play, Rocket, Satellite, Timer, X, Zap } from "lucide-react";
import type { CSSProperties } from "react";
import { MATRIX_ITEM_IDS, PLANET_LIST, TECHNOLOGY_LIST, getItem, getTechnology } from "../game/content";
import { canQueueTechnology, getDysonSailAbsorptionMultiplier, getInterstellarCargoCapacity, getLogisticsSpeedMultiplier, getMiningSpeedMultiplier, getPlanetaryCargoCapacity, getRayReceiverCapacityKw, getRecipeSpeedMultiplier, getSolarSailLifetimeSeconds, isTechnologyCompleted } from "../game/engine";
import type { GameState, ItemId, TechId } from "../game/types";
import { ItemHoverCard } from "./ItemReference";

interface TechnologyWorkspaceProps {
  open: boolean;
  game: GameState;
  onClose: () => void;
  onSelect: (techId: TechId) => void;
  onRemoveQueued: (techId: TechId) => void;
}

function networkMatrixStock(game: GameState, itemId: ItemId): number {
  const nodeStock = game.entities.reduce((sum, entity) =>
    sum + (entity.inputs[itemId] ?? 0) + (entity.outputs[itemId] ?? 0), 0);
  const trayStock = PLANET_LIST.reduce((sum, planet) => sum + (planet.id === game.activePlanetId
    ? game.tray[itemId] ?? 0
    : game.planetTrays[planet.id][itemId] ?? 0), 0);
  return Math.floor(nodeStock + trayStock + (game.cargo?.itemId === itemId ? game.cargo.amount : 0));
}

export function TechnologyWorkspace({ open, game, onClose, onSelect, onRemoveQueued }: TechnologyWorkspaceProps) {
  if (!open) return null;
  const selected = getTechnology(game.research.selectedTechId);
  const selectedProgress = selected ? game.research.progressByTech[selected.id] ?? {} : {};
  const selectedCostTotal = selected?.costs.reduce((sum, cost) => sum + cost.amount, 0) ?? 0;
  const selectedProgressTotal = selected?.costs.reduce((sum, cost) =>
    sum + Math.min(cost.amount, selectedProgress[cost.itemId] ?? 0), 0) ?? 0;
  const maximumTier = Math.max(...TECHNOLOGY_LIST.map((technology) => technology.tier));

  return (
    <section className="technology-workspace" role="dialog" aria-modal="true" aria-label="科技树">
      <header className="technology-header">
        <div className="technology-title">
          <i><FlaskConical size={20} /></i>
          <div><span>星系科研协议</span><strong>科技树</strong></div>
        </div>
        <div className="technology-summary">
          {MATRIX_ITEM_IDS.map((itemId) => {
            const item = getItem(itemId);
            return <span className="matrix-stock" key={itemId}><ItemHoverCard itemId={itemId}><i style={{ backgroundColor: item.color }}>{item.symbol}</i></ItemHoverCard><strong>{networkMatrixStock(game, itemId)}</strong></span>;
          })}
          <span>已完成 <strong>{game.research.completedTechIds.length}/{TECHNOLOGY_LIST.length}</strong></span>
        </div>
        <button className="technology-close" type="button" onClick={onClose} title="关闭科技树" aria-label="关闭科技树"><X size={18} /></button>
      </header>

      <div className="research-focus">
        <div>
          <span>当前研究</span>
          <strong>{selected?.name ?? "未选择科技"}</strong>
        </div>
        <div className="research-progress">
          <i><b style={{ width: `${selectedCostTotal > 0 ? selectedProgressTotal / selectedCostTotal * 100 : 0}%` }} /></i>
          <span>{selected ? `${selectedProgressTotal} / ${selectedCostTotal} 矩阵` : "0 / 0 矩阵"}</span>
        </div>
        <div className="research-cost-list">
          {selected?.costs.map((cost) => {
            const item = getItem(cost.itemId);
            return <span key={cost.itemId}><ItemHoverCard itemId={cost.itemId}><i style={{ backgroundColor: item.color }}>{item.symbol}</i></ItemHoverCard>{selectedProgress[cost.itemId] ?? 0}/{cost.amount}</span>;
          })}
        </div>
        <p>{selected?.summary ?? "科研站处于科研模式时会按科技需求消耗蓝色、红色、黄色、紫色与绿色矩阵。"}</p>
        <div className="research-queue">
          <header><ListOrdered size={14} /><span>科研队列</span><strong>{game.research.queuedTechIds.length}</strong></header>
          <div>
            {game.research.queuedTechIds.length === 0 ? <span className="research-queue__empty">队列为空</span> : game.research.queuedTechIds.map((techId, index) => (
              <div className="research-queue__item" key={techId}>
                <b>{index + 1}</b>
                <span>{getTechnology(techId)?.name}</span>
                <button type="button" onClick={() => onRemoveQueued(techId)} title={`从科研队列移除${getTechnology(techId)?.name}`} aria-label={`从科研队列移除${getTechnology(techId)?.name}`}><X size={12} /></button>
              </div>
            ))}
          </div>
        </div>
        <section className="technology-upgrade-overview" aria-label="全局科技升级效果">
          <header><Gauge size={13} /><span>全局升级效果</span></header>
          <div>
            <span><Pickaxe size={13} /><small>固体采矿</small><strong>{getMiningSpeedMultiplier(game).toFixed(2)}×</strong></span>
            <span><FlaskConical size={13} /><small>科研吞吐</small><strong>{getRecipeSpeedMultiplier(game, "matrix_research").toFixed(2)}×</strong></span>
            <span><Rocket size={13} /><small>物流航速</small><strong>{getLogisticsSpeedMultiplier(game).toFixed(2)}×</strong></span>
            <span><PackageCheck size={13} /><small>机 / 船载荷</small><strong>{getPlanetaryCargoCapacity(game)} / {getInterstellarCargoCapacity(game)}</strong></span>
            <span><Timer size={13} /><small>太阳帆寿命</small><strong>{Math.round(getSolarSailLifetimeSeconds(game) / 60)} min</strong></span>
            <span><Satellite size={13} /><small>单站接收</small><strong>{(getRayReceiverCapacityKw(game) / 1000).toFixed(1)} MW</strong></span>
            <span><Zap size={13} /><small>壳面吸附</small><strong>{getDysonSailAbsorptionMultiplier(game).toFixed(2)}×</strong></span>
          </div>
        </section>
      </div>

      <div className="technology-tree" style={{ "--technology-tier-count": maximumTier + 1 } as CSSProperties}>
        {Array.from({ length: maximumTier + 1 }, (_, tier) => (
          <section className="technology-tier" key={tier}>
            <header><span>层级 {String(tier + 1).padStart(2, "0")}</span></header>
            <div>
              {TECHNOLOGY_LIST.filter((technology) => technology.tier === tier).map((technology) => {
                const complete = isTechnologyCompleted(game, technology.id);
                const active = game.research.selectedTechId === technology.id;
                const queuedIndex = game.research.queuedTechIds.indexOf(technology.id);
                const queued = queuedIndex >= 0;
                const available = canQueueTechnology(game, technology.id);
                const progress = game.research.progressByTech[technology.id] ?? {};
                const prerequisiteNames = technology.prerequisites.map((id) => getTechnology(id)?.name).filter(Boolean);
                return (
                  <button
                    className={`technology-node${complete ? " technology-node--complete" : ""}${active ? " technology-node--active" : ""}${queued ? " technology-node--queued" : ""}`}
                    type="button"
                    key={technology.id}
                    disabled={!available || active || queued}
                    onClick={() => onSelect(technology.id)}
                    title={available ? game.research.selectedTechId ? `加入科研队列：${technology.name}` : `开始研究：${technology.name}` : undefined}
                  >
                    <header>
                      <i>{complete ? <Check size={15} /> : active ? <Play size={15} /> : queued ? <ListOrdered size={15} /> : available ? <FlaskConical size={15} /> : <LockKeyhole size={15} />}</i>
                      <strong>{technology.name}</strong>
                      <span>{queued ? `#${queuedIndex + 1}` : `${technology.costs.reduce((sum, cost) => sum + Math.min(cost.amount, progress[cost.itemId] ?? 0), 0)}/${technology.costs.reduce((sum, cost) => sum + cost.amount, 0)}`}</span>
                    </header>
                    <p>{technology.summary}</p>
                    <div className="technology-costs">
                      {technology.costs.map((cost) => {
                        const item = getItem(cost.itemId);
                        return <span key={cost.itemId}><ItemHoverCard itemId={cost.itemId}><i style={{ backgroundColor: item.color }}>{item.symbol}</i></ItemHoverCard>{progress[cost.itemId] ?? 0}/{cost.amount}</span>;
                      })}
                    </div>
                    <div className="technology-unlocks">
                      {technology.unlocks.map((unlock) => <span key={unlock}>{unlock}</span>)}
                    </div>
                    {prerequisiteNames.length > 0 && !available && !complete && !active && !queued ? (
                      <small>前置：{prerequisiteNames.join("、")}</small>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
