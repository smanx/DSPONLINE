import { Factory, FlaskConical, MapPin } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getCompatibleRecipeBuildings, getItem, getPlanet } from "../game/content";
import { getConsumingRecipes, getProducingRecipes, getResearchUses, getResourceSources } from "../game/recipeGraph";
import type { ItemId } from "../game/types";

interface TooltipAnchor {
  left: number;
  top?: number;
  bottom?: number;
}

const KIND_LABELS = {
  solid: "固体物品",
  fluid: "流体物品",
  matrix: "科研矩阵",
} as const;

export function ItemHoverCard({ itemId, children, className = "" }: {
  itemId: ItemId;
  children: ReactNode;
  className?: string;
}) {
  const [anchor, setAnchor] = useState<TooltipAnchor | null>(null);
  const item = getItem(itemId);
  const details = useMemo(() => ({
    producers: getProducingRecipes(itemId),
    consumers: getConsumingRecipes(itemId),
    research: getResearchUses(itemId),
    sources: getResourceSources(itemId),
  }), [itemId]);

  useEffect(() => {
    if (!anchor) return;
    const close = () => setAnchor(null);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [anchor]);

  const open = (element: HTMLElement) => {
    const bounds = element.getBoundingClientRect();
    const width = Math.min(286, window.innerWidth - 16);
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, bounds.left + bounds.width / 2 - width / 2));
    const below = bounds.bottom < window.innerHeight * 0.58;
    setAnchor(below
      ? { left, top: bounds.bottom + 8 }
      : { left, bottom: window.innerHeight - bounds.top + 8 });
  };

  const primaryRecipe = details.producers[0];
  const primaryInputs = primaryRecipe?.inputs.map((input) => `${getItem(input.itemId).name} ×${input.amount}`).join(" + ");
  const primaryEquipment = primaryRecipe
    ? getCompatibleRecipeBuildings(primaryRecipe).map((building) => building.shortName).join(" / ")
    : "";
  return (
    <span
      className={`item-reference${className ? ` ${className}` : ""}`}
      onMouseEnter={(event) => open(event.currentTarget)}
      onMouseLeave={() => setAnchor(null)}
    >
      {children}
      {anchor ? createPortal(
        <aside className="item-hover-card" role="tooltip" style={anchor}>
          <header>
            <i style={{ backgroundColor: item.color }}>{item.symbol}</i>
            <span><strong>{item.name}</strong><small>{KIND_LABELS[item.kind]}</small></span>
          </header>
          <p>{item.description}</p>
          {details.sources.length > 0 ? (
            <div className="item-hover-line">
              <MapPin size={13} />
              <span><b>来源</b>{details.sources[0].label} · {details.sources[0].planetIds.map((id) => getPlanet(id).name).join(" / ")}{details.sources.length > 1 ? ` · 另 ${details.sources.length - 1} 种` : ""}</span>
            </div>
          ) : null}
          {primaryRecipe ? (
            <div className="item-hover-line">
              <Factory size={13} />
              <span><b>配方</b>{primaryInputs || "无需物料"} · {primaryEquipment} {primaryRecipe.duration}s{details.producers.length > 1 ? ` · 另 ${details.producers.length - 1} 种` : ""}</span>
            </div>
          ) : null}
          {details.consumers.length > 0 || details.research.length > 0 ? (
            <div className="item-hover-line">
              <FlaskConical size={13} />
              <span><b>用途</b>{details.consumers.length} 项生产配方{details.research.length > 0 ? ` · ${details.research.length} 项科技` : ""}</span>
            </div>
          ) : null}
          {details.sources.length === 0 && !primaryRecipe ? <div className="item-hover-empty">暂无已登记的生产来源</div> : null}
        </aside>,
        document.body,
      ) : null}
    </span>
  );
}
