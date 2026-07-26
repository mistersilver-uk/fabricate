/**
 * Crafting sub-tab navigation model (issue 511, PR-B redesign).
 *
 * The Crafting group in the GM manager rail shows a conditional set of sub-tabs
 * whose membership depends on the system's `visibilityMode`. This module is the
 * single source of truth for that set: the router (which owns the rail) imports
 * `buildCraftingNavItems` to render the visible tabs, `activeCraftingTab` to
 * highlight the tab for the active view, and `isCraftingRoute` to decide whether
 * the active view belongs to the Crafting group at all.
 *
 * The visibility of the Access and Books & Scrolls tabs derives from
 * `craftingEffect(visibilityMode)` so the conditional surface stays in lockstep
 * with the Settings effect panel and the Books & Scrolls editor. Recipes and
 * Settings are always present.
 *
 * Pure and dependency-free apart from the visibility matrix: no Svelte, no
 * Foundry. Safe to import anywhere.
 */
import { craftingEffect } from './craftingVisibility.js';

/**
 * Every view id that belongs to the Crafting group, in reading order. A view
 * outside this set is not part of the Crafting sub-navigation.
 * @type {readonly string[]}
 */
export const CRAFTING_VIEWS = Object.freeze([
  'recipes',
  'recipe-edit',
  'access',
  'books-scrolls',
  'recipe-item-edit',
  // The GM Knowledge surface (issue 785). Membership here is load-bearing: without
  // it `isCraftingRoute('knowledge')` is false, the Crafting group collapses the
  // moment the surface opens and the rail highlight is dropped — with no existing
  // test failing.
  'knowledge',
  'crafting-settings',
]);

// The sub-tab a given active view belongs under. Editor/detail views collapse
// onto their parent browse tab so the rail highlight stays stable while editing.
const TAB_BY_VIEW = {
  recipes: 'recipes',
  'recipe-edit': 'recipes',
  access: 'access',
  'books-scrolls': 'books-scrolls',
  'recipe-item-edit': 'books-scrolls',
  knowledge: 'knowledge',
  'crafting-settings': 'settings',
};

/**
 * Build the ordered list of visible Crafting sub-tabs for a system.
 *
 * Recipes and Settings are always shown. Access appears only when the visibility
 * mode grants per-recipe access (`restricted`); Books & Scrolls appears only when
 * the mode is item- or knowledge-gated. Order is: Recipes, Access, Books &
 * Scrolls, Knowledge, Settings.
 *
 * Knowledge's gate is deliberately WIDER than Books & Scrolls': it is shown when
 * the visibility effect grants Books & Scrolls OR the system resolves as alchemy.
 * `learnRecipeOnCraft` writes `learnedRecipes` under every visibility mode, and
 * under `global` alchemy those entries are the sole reveal source, so a
 * `showBooksScrolls`-only gate would leave the GM no lever at all in that
 * documented discovery-only configuration.
 *
 * @param {object} args
 * @param {string} [args.visibilityMode] One of the visibility modes; unknown or
 *   absent input resolves via {@link craftingEffect} (→ knowledge).
 * @param {string} [args.resolutionMode] The system's recipe resolution mode; only
 *   `alchemy` widens the Knowledge gate.
 * @param {number} [args.recipeCount] Badge count for the Recipes tab.
 * @param {number} [args.recipeItemCount] Badge count for the Books & Scrolls tab.
 * @returns {Array<{ id: string, view: string, icon: string, labelKey: string, labelFallback: string, count?: number }>}
 */
export function buildCraftingNavItems({
  visibilityMode,
  resolutionMode,
  recipeCount,
  recipeItemCount,
} = {}) {
  const effect = craftingEffect(visibilityMode);
  const items = [
    {
      id: 'recipes',
      view: 'recipes',
      icon: 'fas fa-scroll',
      labelKey: 'FABRICATE.Admin.Manager.Nav.Recipes',
      labelFallback: 'Recipes',
      count: recipeCount ?? 0,
    },
  ];

  if (effect.showAccess) {
    items.push({
      id: 'access',
      view: 'access',
      icon: 'fas fa-user-lock',
      labelKey: 'FABRICATE.Admin.Manager.Nav.Access',
      labelFallback: 'Access',
    });
  }

  if (effect.showBooksScrolls) {
    items.push({
      id: 'books-scrolls',
      view: 'books-scrolls',
      icon: 'fas fa-book',
      labelKey: 'FABRICATE.Admin.Manager.Nav.BooksScrolls',
      labelFallback: 'Books & Scrolls',
      count: recipeItemCount ?? 0,
    });
  }

  // No count property by design: the roll-up would need the per-character
  // projection, which is a no-op precisely while the rail is rendered. The sibling
  // Access entry is count-less for the same reason, and `craftingNavCount` sums
  // `item.count || 0`, so this leaves the Crafting parent badge unchanged.
  if (effect.showBooksScrolls || resolutionMode === 'alchemy') {
    items.push({
      id: 'knowledge',
      view: 'knowledge',
      icon: 'fas fa-brain',
      labelKey: 'FABRICATE.Admin.Manager.Nav.Knowledge',
      labelFallback: 'Knowledge',
    });
  }

  items.push({
    id: 'settings',
    view: 'crafting-settings',
    icon: 'fas fa-sliders',
    labelKey: 'FABRICATE.Admin.Manager.Crafting.CraftingTabs.Settings',
    labelFallback: 'Settings',
  });

  return items;
}

/**
 * The sub-tab id that owns a given active view (for rail highlighting). Returns
 * `null` for a view outside the Crafting group.
 *
 * @param {string} view The active view id.
 * @returns {string|null}
 */
export function activeCraftingTab(view) {
  return TAB_BY_VIEW[view] ?? null;
}

/**
 * Whether a view belongs to the Crafting group.
 *
 * @param {string} view The view id to test.
 * @returns {boolean}
 */
export function isCraftingRoute(view) {
  return CRAFTING_VIEWS.includes(view);
}
