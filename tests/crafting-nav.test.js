/**
 * Tests for the Crafting sub-tab navigation model
 * (src/ui/svelte/apps/manager/crafting/craftingNav.js): the conditional sub-tab
 * set derived from `visibilityMode`, the active-view → sub-tab mapping, and the
 * crafting-route membership test.
 *
 * node:test + node:assert/strict. Pure, dependency-free module.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CRAFTING_VIEWS,
  buildCraftingNavItems,
  activeCraftingTab,
  isCraftingRoute,
} from '../src/ui/svelte/apps/manager/crafting/craftingNav.js';

const ids = (items) => items.map((item) => item.id);

test('CRAFTING_VIEWS lists every crafting-group view', () => {
  assert.deepEqual(CRAFTING_VIEWS, [
    'recipes',
    'recipe-edit',
    'access',
    'books-scrolls',
    'recipe-item-edit',
    'knowledge',
    'crafting-settings',
  ]);
});

test('global mode shows only Recipes and Settings', () => {
  const items = buildCraftingNavItems({ visibilityMode: 'global', recipeCount: 3, recipeItemCount: 5 });
  assert.deepEqual(ids(items), ['recipes', 'settings']);
});

test('restricted mode inserts Access after Recipes, no Books & Scrolls', () => {
  const items = buildCraftingNavItems({ visibilityMode: 'restricted', recipeCount: 3, recipeItemCount: 5 });
  assert.deepEqual(ids(items), ['recipes', 'access', 'settings']);
});

test('item mode shows Books & Scrolls but not Access', () => {
  const items = buildCraftingNavItems({ visibilityMode: 'item', recipeCount: 3, recipeItemCount: 5 });
  assert.deepEqual(ids(items), ['recipes', 'books-scrolls', 'knowledge', 'settings']);
});

test('knowledge mode shows Books & Scrolls but not Access', () => {
  const items = buildCraftingNavItems({ visibilityMode: 'knowledge', recipeCount: 3, recipeItemCount: 5 });
  assert.deepEqual(ids(items), ['recipes', 'books-scrolls', 'knowledge', 'settings']);
});

test('an unknown/absent visibility mode falls back to knowledge (Books & Scrolls shown)', () => {
  assert.deepEqual(ids(buildCraftingNavItems({ visibilityMode: 'nope' })), [
    'recipes',
    'books-scrolls',
    'knowledge',
    'settings',
  ]);
  assert.deepEqual(ids(buildCraftingNavItems()), [
    'recipes',
    'books-scrolls',
    'knowledge',
    'settings',
  ]);
});

// The Knowledge surface (issue 785) is gated on
// `effect.showBooksScrolls || resolutionMode === 'alchemy'`, which is strictly
// WIDER than the Books & Scrolls gate. All four cells of the gate matrix are
// pinned below; `global` + alchemy is the cell that motivates the widening
// (learned recipes are the sole reveal source there, so a showBooksScrolls-only
// gate would leave the GM no lever at all) and `restricted` + alchemy is the cell
// that shows Access and Knowledge but NOT Books & Scrolls.
const KNOWLEDGE_GATE_CASES = [
  { visibilityMode: 'global', resolutionMode: 'simple', expected: ['recipes', 'settings'] },
  {
    visibilityMode: 'global',
    resolutionMode: 'alchemy',
    expected: ['recipes', 'knowledge', 'settings'],
  },
  {
    visibilityMode: 'restricted',
    resolutionMode: 'simple',
    expected: ['recipes', 'access', 'settings'],
  },
  {
    visibilityMode: 'restricted',
    resolutionMode: 'alchemy',
    expected: ['recipes', 'access', 'knowledge', 'settings'],
  },
  {
    visibilityMode: 'item',
    resolutionMode: 'simple',
    expected: ['recipes', 'books-scrolls', 'knowledge', 'settings'],
  },
  {
    visibilityMode: 'item',
    resolutionMode: 'alchemy',
    expected: ['recipes', 'books-scrolls', 'knowledge', 'settings'],
  },
  {
    visibilityMode: 'knowledge',
    resolutionMode: 'simple',
    expected: ['recipes', 'books-scrolls', 'knowledge', 'settings'],
  },
  {
    visibilityMode: 'knowledge',
    resolutionMode: 'alchemy',
    expected: ['recipes', 'books-scrolls', 'knowledge', 'settings'],
  },
];

for (const { visibilityMode, resolutionMode, expected } of KNOWLEDGE_GATE_CASES) {
  test(`the ${visibilityMode} + ${resolutionMode} cell resolves the Knowledge gate`, () => {
    const items = buildCraftingNavItems({ visibilityMode, resolutionMode, recipeCount: 2 });
    assert.deepEqual(ids(items), expected);
  });
}

test('the Knowledge entry carries no count badge and the boxes-stacked icon', () => {
  const items = buildCraftingNavItems({
    visibilityMode: 'knowledge',
    recipeCount: 7,
    recipeItemCount: 3,
  });
  const knowledge = items.find((item) => item.id === 'knowledge');
  assert.equal(knowledge.view, 'knowledge');
  assert.equal(knowledge.icon, 'fas fa-boxes-stacked');
  assert.equal(knowledge.labelKey, 'FABRICATE.Admin.Manager.Nav.Knowledge');
  assert.equal(knowledge.labelFallback, 'Knowledge');
  // A count property would change the Crafting parent badge, which sums
  // `item.count || 0` over its visible sub-tabs.
  assert.equal('count' in knowledge, false);
  assert.equal(
    items.reduce((sum, item) => sum + (item.count || 0), 0),
    10
  );
});

test('Recipes and Books & Scrolls carry counts; Access and Settings do not', () => {
  const items = buildCraftingNavItems({ visibilityMode: 'knowledge', recipeCount: 12, recipeItemCount: 4 });
  const recipes = items.find((item) => item.id === 'recipes');
  const books = items.find((item) => item.id === 'books-scrolls');
  const settings = items.find((item) => item.id === 'settings');
  assert.equal(recipes.count, 12);
  assert.equal(books.count, 4);
  assert.equal('count' in settings, false);
});

test('Access has no count and defaults counts to 0 when omitted', () => {
  const items = buildCraftingNavItems({ visibilityMode: 'restricted' });
  const access = items.find((item) => item.id === 'access');
  const recipes = items.find((item) => item.id === 'recipes');
  assert.equal('count' in access, false);
  assert.equal(recipes.count, 0);
});

test('every nav item carries id, view, icon, labelKey and labelFallback', () => {
  const items = buildCraftingNavItems({ visibilityMode: 'restricted', recipeCount: 1, recipeItemCount: 1 });
  for (const item of items) {
    assert.equal(typeof item.id, 'string');
    assert.equal(typeof item.view, 'string');
    assert.match(item.icon, /^fas fa-/);
    assert.equal(typeof item.labelKey, 'string');
    assert.equal(typeof item.labelFallback, 'string');
  }
});

test('the icons match the design brief', () => {
  const items = buildCraftingNavItems({ visibilityMode: 'restricted' });
  const byId = Object.fromEntries(items.map((item) => [item.id, item.icon]));
  assert.equal(byId.recipes, 'fas fa-scroll');
  assert.equal(byId.access, 'fas fa-user-lock');
  assert.equal(byId.settings, 'fas fa-sliders');
  assert.equal(buildCraftingNavItems({ visibilityMode: 'item' }).find((i) => i.id === 'books-scrolls').icon, 'fas fa-book');
});

test('activeCraftingTab collapses editor views onto their parent tab', () => {
  assert.equal(activeCraftingTab('recipes'), 'recipes');
  assert.equal(activeCraftingTab('recipe-edit'), 'recipes');
  assert.equal(activeCraftingTab('access'), 'access');
  assert.equal(activeCraftingTab('books-scrolls'), 'books-scrolls');
  assert.equal(activeCraftingTab('recipe-item-edit'), 'books-scrolls');
  // Without this entry the sub-tab highlight never lights on the Knowledge route.
  assert.equal(activeCraftingTab('knowledge'), 'knowledge');
  assert.equal(activeCraftingTab('crafting-settings'), 'settings');
});

test('activeCraftingTab returns null for a view outside the group', () => {
  assert.equal(activeCraftingTab('components'), null);
  assert.equal(activeCraftingTab(undefined), null);
});

test('isCraftingRoute is true for every crafting view and false otherwise', () => {
  for (const view of CRAFTING_VIEWS) {
    assert.equal(isCraftingRoute(view), true, `${view} is a crafting route`);
  }
  for (const view of ['components', 'essences', 'system-edit', 'gathering', '', undefined]) {
    assert.equal(isCraftingRoute(view), false, `${view} is not a crafting route`);
  }
});
