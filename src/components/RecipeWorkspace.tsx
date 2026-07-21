import {
  ArrowRight,
  BookOpen,
  Check,
  Clock3,
  Factory,
  FlaskConical,
  LockKeyhole,
  MapPin,
  Pickaxe,
  Pin,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ITEMS, PLANET_LIST, RECIPES, getBuilding, getCompatibleRecipeBuildings, getItem, getPlanet, getTechnology } from "../game/content";
import { isTechnologyCompleted } from "../game/engine";
import {
  getConsumingRecipes,
  getProducingRecipes,
  getResearchUses,
  getResourceSources,
  getVirtualRecipeResult,
} from "../game/recipeGraph";
import { getRecipeRates } from "../game/recipeGraph";
import { validateContentCatalog } from "../game/content";
import type { GameState, ItemId, RecipeDefinition } from "../game/types";
import { ItemGlyph, ItemHoverCard } from "./ItemReference";

type ItemFilter = "all" | "raw" | "solid" | "fluid" | "matrix";

function networkItemStock(game: GameState, itemId: ItemId): number {
  const nodeStock = game.entities.reduce((sum, entity) =>
    sum + (entity.inputs[itemId] ?? 0) + (entity.outputs[itemId] ?? 0), 0);
  const trayStock = PLANET_LIST.reduce((sum, planet) => sum + (planet.id === game.activePlanetId
    ? game.tray[itemId] ?? 0
    : game.planetTrays[planet.id][itemId] ?? 0), 0);
  return Math.floor(nodeStock + trayStock + (game.cargo?.itemId === itemId ? game.cargo.amount : 0));
}

function ItemMark({ itemId }: { itemId: ItemId }) {
  return (
    <ItemHoverCard itemId={itemId}>
      <ItemGlyph itemId={itemId} className="item-mark" />
    </ItemHoverCard>
  );
}

function ItemLink({ itemId, amount, ratePerMinute, onSelect }: {
  itemId: ItemId;
  amount?: number;
  ratePerMinute?: number;
  onSelect: (itemId: ItemId) => void;
}) {
  return (
    <button className="recipe-item-link" type="button" onClick={() => onSelect(itemId)} title={`查看${getItem(itemId).name}`}>
      <ItemMark itemId={itemId} />
      <span>{getItem(itemId).name}</span>
      {amount != null ? <strong>×{amount}</strong> : null}
      {ratePerMinute != null ? <small>{ratePerMinute.toFixed(1)}/min</small> : null}
    </button>
  );
}

function RecipeFlowCard({ recipe, game, onSelect }: {
  recipe: RecipeDefinition;
  game: GameState;
  onSelect: (itemId: ItemId) => void;
}) {
  const building = getBuilding(recipe.buildingId);
  const compatibleBuildings = getCompatibleRecipeBuildings(recipe);
  const equipmentLabel = compatibleBuildings.length > 1
    ? `${building.name} +${compatibleBuildings.length - 1} 高阶`
    : building.name;
  const unlocked = !recipe.requiredTechId || isTechnologyCompleted(game, recipe.requiredTechId);
  const virtualResult = getVirtualRecipeResult(recipe);
  const rates = getRecipeRates(recipe, building.speed);
  return (
    <article className="recipe-method">
      <header>
        <i><Factory size={15} /></i>
        <span><strong>{recipe.name}</strong><small title={compatibleBuildings.map((candidate) => candidate.name).join(" / ")}>{equipmentLabel}</small></span>
        <em><Clock3 size={12} />{recipe.duration}s</em>
      </header>
      <div className="recipe-flow">
        <div>
          <small>输入</small>
          {recipe.inputs.length > 0
            ? recipe.inputs.map((input) => <ItemLink itemId={input.itemId} amount={input.amount} ratePerMinute={rates.inputPerMinute[input.itemId]} onSelect={onSelect} key={input.itemId} />)
            : <span className="recipe-flow-empty">{recipe.buildingId === "ray_receiver" ? "戴森系统能量" : "无需物料"}</span>}
        </div>
        <ArrowRight size={17} />
        <div>
          <small>输出</small>
          {recipe.outputs.length > 0
            ? recipe.outputs.map((output) => <ItemLink itemId={output.itemId} amount={output.amount} ratePerMinute={rates.outputPerMinute[output.itemId]} onSelect={onSelect} key={output.itemId} />)
            : <span className="recipe-virtual-output">{virtualResult ?? "流程产出"}</span>}
        </div>
      </div>
      <footer>
        <span>{building.speed.toFixed(2)}× 设备速度 · {rates.cyclesPerMinute.toFixed(1)} 批/min</span>
        {recipe.requiredTechId ? (
          <span className={unlocked ? "recipe-unlock recipe-unlock--ready" : "recipe-unlock"}>
            {unlocked ? <Check size={11} /> : <LockKeyhole size={11} />}{getTechnology(recipe.requiredTechId)?.name}
          </span>
        ) : <span className="recipe-unlock recipe-unlock--ready"><Check size={11} />基础配方</span>}
      </footer>
    </article>
  );
}

export function RecipeWorkspace({ open, game, onClose, focusItemId, onFocus }: {
  open: boolean;
  game: GameState;
  onClose: () => void;
  focusItemId?: ItemId | null;
  onFocus: (itemId: ItemId | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ItemFilter>("all");
  const [selectedItemId, setSelectedItemId] = useState<ItemId>(focusItemId ?? game.recipeFocus.itemId ?? "iron_ore");
  const itemList = Object.values(ITEMS);
  useEffect(() => {
    if (!focusItemId) return;
    setSelectedItemId(focusItemId);
    setQuery("");
    setFilter("all");
  }, [focusItemId]);
  const visibleItems = useMemo(() => itemList.filter((item) => {
    const term = query.trim().toLocaleLowerCase("zh-CN");
    const matchesSearch = !term || `${item.name} ${item.symbol} ${item.id} ${item.description}`.toLocaleLowerCase("zh-CN").includes(term);
    if (!matchesSearch) return false;
    if (filter === "raw") return getResourceSources(item.id).length > 0;
    if (filter === "solid") return item.kind === "solid";
    if (filter === "fluid") return item.kind === "fluid";
    if (filter === "matrix") return item.kind === "matrix";
    return true;
  }), [filter, itemList, query]);

  if (!open) return null;
  const item = getItem(selectedItemId);
  const sources = getResourceSources(selectedItemId);
  const producingRecipes = getProducingRecipes(selectedItemId);
  const consumingRecipes = getConsumingRecipes(selectedItemId);
  const researchUses = getResearchUses(selectedItemId);
  const upstreamItems = [...new Set(producingRecipes.flatMap((recipe) => recipe.inputs.map((input) => input.itemId)))];
  const downstreamItems = [...new Set(consumingRecipes.flatMap((recipe) => recipe.outputs.map((output) => output.itemId)))];
  const stock = networkItemStock(game, selectedItemId);
  const catalogAudit = validateContentCatalog();

  const selectItem = (itemId: ItemId) => {
    setSelectedItemId(itemId);
  };

  return (
    <section className="recipe-workspace" role="dialog" aria-modal="true" aria-label="配方图鉴">
      <header className="recipe-header">
        <div className="recipe-title">
          <i><BookOpen size={20} /></i>
          <div><span>星系生产资料库</span><strong>配方图鉴</strong></div>
        </div>
        <div className="recipe-headline">
          <span>物品 <strong>{itemList.length}</strong></span>
          <span>配方 <strong>{Object.keys(RECIPES).length}</strong></span>
          <span className={catalogAudit.valid ? "recipe-audit recipe-audit--valid" : "recipe-audit"} title={catalogAudit.valid ? "内容数据校验通过" : catalogAudit.issues.map((issue) => issue.message).join("；")}>数据 <strong>{catalogAudit.valid ? "OK" : `${catalogAudit.issues.length} 项`}</strong></span>
        </div>
        <button className="recipe-close" type="button" onClick={onClose} title="关闭配方图鉴" aria-label="关闭配方图鉴"><X size={18} /></button>
      </header>

      <div className="recipe-toolbar">
        <label className="recipe-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索物品、缩写或说明" aria-label="搜索配方物品" /></label>
        <div className="recipe-filters" aria-label="配方物品分类">
          {(["all", "raw", "solid", "fluid", "matrix"] as ItemFilter[]).map((option) => (
            <button className={filter === option ? "active" : ""} type="button" key={option} onClick={() => setFilter(option)}>
              {{ all: "全部", raw: "天然资源", solid: "固体", fluid: "流体", matrix: "矩阵" }[option]}
            </button>
          ))}
        </div>
        <span className="recipe-result-count">{visibleItems.length} 项</span>
      </div>

      <div className="recipe-layout">
        <aside className="recipe-index" aria-label="物品索引">
          {visibleItems.length === 0 ? <div className="recipe-index-empty">没有符合条件的物品</div> : visibleItems.map((candidate) => {
            const producerCount = getProducingRecipes(candidate.id).length;
            const natural = getResourceSources(candidate.id).length > 0;
            return (
              <button className={selectedItemId === candidate.id ? "active" : ""} type="button" key={candidate.id} onClick={() => selectItem(candidate.id)}>
                <ItemMark itemId={candidate.id} />
                <span><strong>{candidate.name}</strong><small>{natural ? "天然资源" : producerCount > 0 ? `${producerCount} 种生产方式` : "特殊来源"}</small></span>
                <em>{networkItemStock(game, candidate.id)}</em>
              </button>
            );
          })}
        </aside>

        <div className="recipe-detail">
          <header className="recipe-item-header">
            <ItemMark itemId={selectedItemId} />
            <div><span>{item.kind === "matrix" ? "科研矩阵" : item.kind === "fluid" ? "流体物品" : sources.length > 0 ? "天然资源" : "工业物品"}</span><strong>{item.name}</strong><p>{item.description}</p></div>
            <div className="recipe-item-actions">
              <button type="button" className={game.recipeFocus.itemId === selectedItemId ? "active" : ""} onClick={() => onFocus(game.recipeFocus.itemId === selectedItemId ? null : selectedItemId)} title={game.recipeFocus.itemId === selectedItemId ? "取消主界面聚焦" : "固定生产链到主界面"}><Pin size={14} />{game.recipeFocus.itemId === selectedItemId ? "已固定" : "固定到主界面"}</button>
            </div>
            <dl>
              <div><dt>网络库存</dt><dd>{stock.toLocaleString("zh-CN")}</dd></div>
              <div><dt>生产方式</dt><dd>{producingRecipes.length + sources.length}</dd></div>
              <div><dt>下游流程</dt><dd>{consumingRecipes.length}</dd></div>
            </dl>
          </header>

          <section className="recipe-relations">
            <div><span>上游材料</span><div>{upstreamItems.length > 0 ? upstreamItems.map((id) => <ItemLink itemId={id} onSelect={selectItem} key={id} />) : <small>无合成上游</small>}</div></div>
            <ArrowRight size={16} />
            <div><span>当前物品</span><div><ItemLink itemId={selectedItemId} onSelect={selectItem} /></div></div>
            <ArrowRight size={16} />
            <div><span>下游产物</span><div>{downstreamItems.length > 0 ? downstreamItems.map((id) => <ItemLink itemId={id} onSelect={selectItem} key={id} />) : <small>无实体产物</small>}</div></div>
          </section>

          <section className="recipe-section">
            <header><Factory size={16} /><span>生产方式</span><strong>{producingRecipes.length + sources.length}</strong></header>
            <div className="recipe-method-grid">
              {sources.map((source) => (
                <article className="recipe-method recipe-method--source" key={`${source.extractorBuildingId}-${source.label}`}>
                  <header><i><Pickaxe size={15} /></i><span><strong>{source.label}</strong><small>{getBuilding(source.extractorBuildingId).name}</small></span><em><MapPin size={12} />天然来源</em></header>
                  <div className="recipe-source-planets">
                    {source.planetIds.map((planetId) => <span key={planetId}><i style={{ color: getPlanet(planetId).color }}><MapPin size={13} /></i>{getPlanet(planetId).name}</span>)}
                  </div>
                  <footer><span>{source.manual ? "可手动采集或自动开采" : "必须部署采集设备"}</span><span className="recipe-unlock recipe-unlock--ready"><Check size={11} />资源来源</span></footer>
                </article>
              ))}
              {producingRecipes.map((recipe) => <RecipeFlowCard recipe={recipe} game={game} onSelect={selectItem} key={recipe.id} />)}
              {sources.length === 0 && producingRecipes.length === 0 ? <div className="recipe-section-empty">暂无已登记的生产方式</div> : null}
            </div>
          </section>

          <section className="recipe-section">
            <header><ArrowRight size={16} /><span>作为原料</span><strong>{consumingRecipes.length}</strong></header>
            <div className="recipe-method-grid">
              {consumingRecipes.map((recipe) => <RecipeFlowCard recipe={recipe} game={game} onSelect={selectItem} key={recipe.id} />)}
              {consumingRecipes.length === 0 ? <div className="recipe-section-empty">当前没有后续生产配方</div> : null}
            </div>
          </section>

          {researchUses.length > 0 ? (
            <section className="recipe-section recipe-research-uses">
              <header><FlaskConical size={16} /><span>科研用途</span><strong>{researchUses.length}</strong></header>
              <div>{researchUses.map((technology) => (
                <span key={technology.id}><i>{isTechnologyCompleted(game, technology.id) ? <Check size={12} /> : <FlaskConical size={12} />}</i><strong>{technology.name}</strong><small>消耗 {technology.costs.find((cost) => cost.itemId === selectedItemId)?.amount ?? 0}</small></span>
              ))}</div>
            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}
