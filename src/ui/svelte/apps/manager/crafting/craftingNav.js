/**
 * The one Crafting sub-tab model the rail, the availability test and the redirect read, so they
 * cannot disagree. `openspec/specs/ui-integration/spec.md` → "GM Crafting Admin" is canonical for
 * membership, the wider `Knowledge` gate and the owning-entry reconciliation. Pure JS.
 */
import { craftingEffect } from './craftingVisibility.js';

/** Every view id in the Crafting group, in reading order; membership is what `isCraftingRoute` asks. */
export const CRAFTING_VIEWS = Object.freeze([
  'recipes',
  'recipe-edit',
  'access',
  'books-scrolls',
  'recipe-item-edit',
  'knowledge',
  'crafting-settings',
]);

/** The mode-conditional views in rail order, which is also the redirect's precedence order. */
export const CRAFTING_CONDITIONAL_VIEWS = Object.freeze(['access', 'books-scrolls', 'knowledge']);

// Editor and detail views collapse onto their parent browse tab so the highlight survives editing.
const TAB_BY_VIEW = {
  recipes: 'recipes',
  'recipe-edit': 'recipes',
  access: 'access',
  'books-scrolls': 'books-scrolls',
  'recipe-item-edit': 'books-scrolls',
  knowledge: 'knowledge',
  'crafting-settings': 'settings',
};

/** The visible sub-tabs in rail order; an unknown `visibilityMode` resolves via `craftingEffect`. */
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

  // Count-less by design: `craftingNavCount` sums `item.count || 0`, so the parent badge holds.
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

/** The sub-tab id owning `view` for rail highlighting, or `null` outside the Crafting group. */
export function activeCraftingTab(view) {
  return TAB_BY_VIEW[view] ?? null;
}

/** Whether a view belongs to the Crafting group. */
export function isCraftingRoute(view) {
  return CRAFTING_VIEWS.includes(view);
}

/**
 * Whether the entry that OWNS `view` is offered here; false outside the group. Asked over the
 * owning entry, never the view: no nav item carries `recipe-edit` or `recipe-item-edit`, so an
 * `item.view === view` clause would eject the GM from either editor.
 */
export function isCraftingViewAvailable(view, args = {}) {
  const owner = activeCraftingTab(view);
  if (!owner) return false;
  return buildCraftingNavItems(args).some((item) => item.id === owner);
}

/**
 * Where to send a GM whose route's owning entry left the submenu: the first mode-conditional item
 * {@link buildCraftingNavItems} emits, else `recipes`. It reads only what the new system offers.
 */
export function resolveCraftingRedirect(args = {}) {
  const conditional = buildCraftingNavItems(args).find((item) =>
    CRAFTING_CONDITIONAL_VIEWS.includes(item.view)
  );
  return conditional?.view ?? 'recipes';
}
