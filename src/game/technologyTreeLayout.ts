import type { FontScale, TechnologyLayoutMode } from "./types";

export interface TechnologyTierGrid {
  rows: number;
  columns: number;
  columnWidth: number;
  estimatedCardHeight: number;
}

/**
 * Dense tiers expand into adjacent horizontal sub-columns. This keeps the
 * shared tree viewport vertical-scroll-free without shrinking readable text.
 */
export function getTechnologyTierGrid(
  nodeCount: number,
  layout: TechnologyLayoutMode,
  fontScale: FontScale,
  viewportHeight: number,
): TechnologyTierGrid {
  const count = Math.max(0, Math.floor(nodeCount));
  const scale = Math.max(0.8, Math.min(2, fontScale));
  const compact = layout === "compact";
  // Use a conservative upper bound rather than the average card height. Late
  // tiers contain longer prerequisite and unlock labels; an average lets the
  // grid choose an extra row that only becomes too tall after the distant
  // `content-visibility:auto` card is materialized.
  const naturalCardHeight = compact
    ? 120 + 60 * scale
    : 70 + 140 * scale;
  const gap = compact ? 6 : 10;
  const verticalChrome = compact ? 46 : 56;
  // A reduced shell-safe workspace can be shorter than the conservative card
  // estimate at 150%/200%. Cap the CSS minimum to the real row budget; card
  // width still grows with the font scale so text remains readable without
  // introducing a hidden vertical scroll range below the construction dock.
  const viewportCardBudget = Math.max(1, Math.floor(viewportHeight) - verticalChrome);
  const estimatedCardHeight = Math.min(naturalCardHeight, viewportCardBudget);
  const usableHeight = Math.max(estimatedCardHeight, viewportCardBudget);
  const rows = Math.max(1, Math.min(Math.max(1, count), Math.floor((usableHeight + gap) / (estimatedCardHeight + gap))));
  const columns = count === 0 ? 1 : Math.max(1, Math.ceil(count / rows));
  // Keep roughly the same characters per line as text scales up. More width is
  // cheap in a horizontal-only tree and prevents a single 200% card from
  // becoming taller than the fixed viewport.
  const columnWidth = Math.round((compact ? 190 : 250) * scale);
  return { rows, columns, columnWidth, estimatedCardHeight };
}
