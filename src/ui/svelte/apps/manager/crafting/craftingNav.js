/**
 * Crafting sub-tab navigation model (issue 511, PR-B redesign).
 *
 * The Crafting group in the GM manager rail shows a conditional set of sub-tabs
 * whose membership depends on the system's `visibilityMode`. This module is the
 * single source of truth for that set: the router (which owns the rail) imports
 * `buildCraftingNavItems` to render the visible tabs, `activeCraftingTab` to
 * highlight the tab for the active view, and `isCraftingRoute` to decide whether
 * the active view belongs to the Crafting group at all. Route reconciliation reads
 * the same model through `isCraftingViewAvailable` and `resolveCraftingRedirect`
 * (issue 1151), so a system that stops offering the entry owning the active route
 * cannot strand the GM on a surface with no rail entry to return to it.
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

/**
 * The MODE-CONDITIONAL views, in rail order.
 *
 * `recipes` and `crafting-settings` are unconditional, so they are deliberately not
 * members: they are never the subject of a redirect and never its target. Order is
 * rail order, which is also the redirect's precedence order — one ordering table,
 * so the rail and the router cannot disagree about which entry comes first.
 *
 * This is a read of what {@link buildCraftingNavItems} can EMIT, not a second copy
 * of its gates; `tests/crafting-nav.test.js` fails when a fifth mode-gated entry is
 * added to the builder without being listed here.
 * @type {readonly string[]}
 */
export const CRAFTING_CONDITIONAL_VIEWS = Object.freeze(['access', 'books-scrolls', 'knowledge']);

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

/**
 * Whether the sub-tab that OWNS a view is offered for a system (issue 1151).
 *
 * The test is taken over the owning ENTRY, never over the view, and that is the
 * whole point of routing it through {@link activeCraftingTab}: no nav item carries
 * the view `recipe-edit` or `recipe-item-edit` under any mode, so asking whether
 * some item's `view` equals the active one is false for both of them always, and a
 * router clause written that way would eject the GM from the recipe editor the
 * instant it opened. `crafting-settings` would survive that only by accident of the
 * id/view mismatch (the Settings item's id is `settings`), which is exactly the
 * vocabulary trap `checks/checksNav.js` warns about.
 *
 * `recipes`/`recipe-edit` own `recipes` and `crafting-settings` owns `settings`, and
 * both entries are unconditional, so neither is ever unavailable. `recipe-item-edit`
 * owns `books-scrolls` and therefore follows its parent.
 *
 * @param {string} view The active view id.
 * @param {object} [args] The same argument bag {@link buildCraftingNavItems} takes.
 * @returns {boolean} False for a view outside the Crafting group, which the router's
 *   own {@link isCraftingRoute} guard makes unreachable.
 */
export function isCraftingViewAvailable(view, args = {}) {
  const owner = activeCraftingTab(view);
  if (!owner) return false;
  return buildCraftingNavItems(args).some((item) => item.id === owner);
}

/**
 * The view to fall back to when the active Crafting route's owning entry is not in
 * the submenu for the selected system (issue 1151).
 *
 * It is the FIRST mode-conditional item {@link buildCraftingNavItems} emits, and
 * `recipes` when the system offers none. The rule is source-independent: it asks
 * only what the new system offers, never which view the GM was on, so one order —
 * rail order — answers every entry path.
 *
 * This deliberately departs from `resolveChecksRedirect`, which returns
 * `items[0]?.view`. `items[0]` is always `recipes` here, so the Checks shape would
 * produce a redirect that is technically valid and practically useless: a GM sent
 * from Access to Recipes has been moved off the surface that governs who may see
 * what onto a browser. The two resolvers share the property that matters — the
 * target is read out of the same builder the rail renders, never hard-coded — and
 * differ only in which item they select from it.
 *
 * Because the target is derived from the built list rather than from a
 * `visibilityMode` lookup table, the Knowledge entry's wider gate falls out
 * automatically: a `global` alchemy system lands on Knowledge, not Recipes.
 *
 * @param {object} [args] The same argument bag {@link buildCraftingNavItems} takes.
 * @returns {string} A view id the rail renders for those same arguments.
 */
export function resolveCraftingRedirect(args = {}) {
  const conditional = buildCraftingNavItems(args).find((item) =>
    CRAFTING_CONDITIONAL_VIEWS.includes(item.view)
  );
  return conditional?.view ?? 'recipes';
}
