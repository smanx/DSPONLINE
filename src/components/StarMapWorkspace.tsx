import { ArrowRight, Check, LockKeyhole, Navigation, Orbit, Sparkles, Telescope, X } from "lucide-react";
import type { CSSProperties } from "react";
import { STAR_SYSTEM_LIST, getItem, getPlanet, getStarSystem, getTechnology } from "../game/content";
import { canExploreStarSystem, isStarSystemUnlocked, isTechnologyCompleted } from "../game/engine";
import type { GameState, PlanetId, StarSystemId } from "../game/types";
import { ItemHoverCard } from "./ItemReference";

function formatDistance(distanceLy: number): string {
  return distanceLy <= 0 ? "本地" : `${distanceLy.toFixed(1)} 光年`;
}

export function StarMapWorkspace({
  open,
  game,
  onClose,
  onExplore,
  onTravel,
}: {
  open: boolean;
  game: GameState;
  onClose: () => void;
  onExplore: (systemId: StarSystemId) => void;
  onTravel: (planetId: PlanetId) => void;
}) {
  if (!open) return null;
  const activeSystemId = getPlanet(game.activePlanetId).systemId;
  const unlockedCount = STAR_SYSTEM_LIST.filter((system) => isStarSystemUnlocked(game, system.id)).length;

  return (
    <section className="star-map-workspace" role="dialog" aria-modal="true" aria-label="星图">
      <header className="star-map-header">
        <div className="star-map-title">
          <i><Telescope size={20} /></i>
          <div><span>恒星级导航阵列</span><strong>星图与行星探索</strong></div>
        </div>
        <div className="star-map-headline">
          <span>已勘探 <strong>{unlockedCount}/{STAR_SYSTEM_LIST.length}</strong></span>
          <span>当前坐标 <strong>{getStarSystem(activeSystemId).name}</strong></span>
          <span>最远航标 <strong>{Math.max(...STAR_SYSTEM_LIST.filter((system) => isStarSystemUnlocked(game, system.id)).map((system) => system.distanceLy)).toFixed(1)} ly</strong></span>
        </div>
        <button className="star-map-close" type="button" onClick={onClose} title="关闭星图" aria-label="关闭星图"><X size={18} /></button>
      </header>

      <div className="star-map-route" aria-label="恒星系航线">
        {STAR_SYSTEM_LIST.map((system, index) => {
          const unlocked = isStarSystemUnlocked(game, system.id);
          const active = activeSystemId === system.id;
          const technologyReady = !system.requiredTechId || isTechnologyCompleted(game, system.requiredTechId);
          const prerequisiteReady = !system.prerequisiteSystemId || isStarSystemUnlocked(game, system.prerequisiteSystemId);
          const suppliesReady = system.explorationCost.every((cost) => (game.tray[cost.itemId] ?? 0) >= cost.amount);
          const style = { "--system-color": system.color } as CSSProperties;
          return (
            <div className="star-map-route__segment" key={system.id}>
              {index > 0 ? <div className={`star-route-link${unlocked ? " star-route-link--open" : ""}`}><i /><ArrowRight size={16} /><span>{formatDistance(system.distanceLy)}</span></div> : null}
              <article className={`star-system-card${unlocked ? " star-system-card--unlocked" : " star-system-card--locked"}${active ? " star-system-card--active" : ""}`} style={style}>
                <header>
                  <i className="star-system-orb"><Sparkles size={20} /></i>
                  <div><span>{system.code}</span><strong>{system.name}</strong><small>{system.starType} · {formatDistance(system.distanceLy)}</small></div>
                  <em>{active ? <><Navigation size={12} /> 当前</> : unlocked ? <><Check size={12} /> 已发现</> : <><LockKeyhole size={12} /> 未勘探</>}</em>
                </header>
                <p>{system.description}</p>
                <div className="star-planet-list">
                  {system.planetIds.map((planetId) => {
                    const planet = getPlanet(planetId);
                    const current = game.activePlanetId === planetId;
                    const deviceCount = game.entities.reduce((sum, entity) => entity.planetId === planetId
                      ? sum + entity.machineCount + entity.minerCount
                      : sum, 0);
                    return (
                      <button
                        type="button"
                        key={planet.id}
                        disabled={!unlocked}
                        className={current ? "active" : ""}
                        onClick={() => onTravel(planet.id)}
                        title={unlocked ? `进入${planet.name}` : `${system.name}尚未勘探`}
                      >
                        <i style={{ color: planet.color }}><Orbit size={17} /></i>
                        <span><strong>{planet.name}</strong><small>{planet.environment}</small></span>
                        <em>{planet.kind === "gas-giant" ? "轨道" : `${deviceCount} 设备`}</em>
                        <p>{planet.resources}</p>
                      </button>
                    );
                  })}
                </div>
                {!unlocked ? (
                  <footer className="star-exploration">
                    <div className="star-exploration-requirements">
                      {system.requiredTechId ? (
                        <span className={technologyReady ? "ready" : ""}>
                          {technologyReady ? <Check size={12} /> : <LockKeyhole size={12} />}{getTechnology(system.requiredTechId)?.name}
                        </span>
                      ) : null}
                      {system.prerequisiteSystemId ? (
                        <span className={prerequisiteReady ? "ready" : ""}>
                          {prerequisiteReady ? <Check size={12} /> : <LockKeyhole size={12} />}先勘探{getStarSystem(system.prerequisiteSystemId).name}
                        </span>
                      ) : null}
                    </div>
                    <div className="star-exploration-costs">
                      {system.explorationCost.map((cost) => {
                        const item = getItem(cost.itemId);
                        const stock = Math.floor(game.tray[cost.itemId] ?? 0);
                        return (
                          <span className={stock >= cost.amount ? "ready" : ""} key={cost.itemId}>
                            <ItemHoverCard itemId={cost.itemId}><i style={{ backgroundColor: item.color }}>{item.symbol}</i></ItemHoverCard>
                            <b>{stock}/{cost.amount}</b>
                          </span>
                        );
                      })}
                    </div>
                    <button type="button" disabled={!canExploreStarSystem(game, system.id)} onClick={() => onExplore(system.id)} title={`消耗当前行星托盘补给勘探${system.name}`}>
                      <Telescope size={15} />勘探{system.name}
                    </button>
                    {!technologyReady ? <small>需要完成{getTechnology(system.requiredTechId)?.name}</small>
                      : !prerequisiteReady ? <small>尚未建立前置航标</small>
                        : !suppliesReady ? <small>当前行星托盘补给不足</small>
                          : null}
                  </footer>
                ) : (
                  <footer className="star-system-ready"><Check size={13} /><span>永久航标在线，可进行跨恒星运输</span></footer>
                )}
              </article>
            </div>
          );
        })}
      </div>
    </section>
  );
}
