/**
 * Tests for the Crafting sub-tab navigation model
 * (src/ui/svelte/apps/manager/crafting/craftingNav.js): the conditional sub-tab
 * set derived from `visibilityMode`, the active-view → sub-tab mapping, the
 * crafting-route membership test, and the availability/redirect pair the manager
 * router reconciles the active view with (issue 1151).
 *
 * node:test + node:assert/strict. Pure, dependency-free module.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  CRAFTING_CONDITIONAL_VIEWS,
  CRAFTING_VIEWS,
  buildCraftingNavItems,
  activeCraftingTab,
  isCraftingRoute,
  isCraftingViewAvailable,
  resolveCraftingRedirect,
} from '../src/ui/svelte/apps/manager/crafting/craftingNav.js';
import { craftingEffect } from '../src/ui/svelte/apps/manager/crafting/craftingVisibility.js';

const repoRoot = resolve(import.meta.dirname, '..');

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
//
// ONE table serves the nav-item set, the redirect target and the per-view
// availability answers (issue 1151), rather than three parallel arrays repeating
// the same eight (visibilityMode, resolutionMode) pairs: a second copy of the
// cell list is exactly the near-identical block SonarCloud's new-code duplication
// gate counts against `tests/**`.
//
// `redirect` is the view `resolveCraftingRedirect` resolves for the cell: the
// FIRST mode-conditional entry the system offers, in rail order, and `recipes`
// when it offers none. That is deliberately NOT the Checks sibling's `items[0]`,
// which would always be `recipes` here and would move a GM off the surface that
// governs who may see what onto a browser.
const CRAFTING_MODE_CASES = [
  {
    visibilityMode: 'global',
    resolutionMode: 'simple',
    expected: ['recipes', 'settings'],
    redirect: 'recipes',
  },
  {
    visibilityMode: 'global',
    resolutionMode: 'alchemy',
    expected: ['recipes', 'knowledge', 'settings'],
    // The settled edge case: a `global` alchemy system DOES offer a
    // mode-conditional entry, so sending the GM to Recipes would assert it offers
    // none.
    redirect: 'knowledge',
  },
  {
    visibilityMode: 'restricted',
    resolutionMode: 'simple',
    expected: ['recipes', 'access', 'settings'],
    redirect: 'access',
  },
  {
    visibilityMode: 'restricted',
    resolutionMode: 'alchemy',
    expected: ['recipes', 'access', 'knowledge', 'settings'],
    redirect: 'access',
  },
  {
    visibilityMode: 'item',
    resolutionMode: 'simple',
    expected: ['recipes', 'books-scrolls', 'knowledge', 'settings'],
    redirect: 'books-scrolls',
  },
  {
    visibilityMode: 'item',
    resolutionMode: 'alchemy',
    expected: ['recipes', 'books-scrolls', 'knowledge', 'settings'],
    redirect: 'books-scrolls',
  },
  {
    visibilityMode: 'knowledge',
    resolutionMode: 'simple',
    expected: ['recipes', 'books-scrolls', 'knowledge', 'settings'],
    redirect: 'books-scrolls',
  },
  {
    visibilityMode: 'knowledge',
    resolutionMode: 'alchemy',
    expected: ['recipes', 'books-scrolls', 'knowledge', 'settings'],
    redirect: 'books-scrolls',
  },
];

const argsFor = ({ visibilityMode, resolutionMode }) => ({ visibilityMode, resolutionMode });

for (const { visibilityMode, resolutionMode, expected } of CRAFTING_MODE_CASES) {
  test(`the ${visibilityMode} + ${resolutionMode} cell resolves the Knowledge gate`, () => {
    const items = buildCraftingNavItems({ visibilityMode, resolutionMode, recipeCount: 2 });
    assert.deepEqual(ids(items), expected);
  });
}

for (const cell of CRAFTING_MODE_CASES) {
  test(`the ${cell.visibilityMode} + ${cell.resolutionMode} cell redirects to ${cell.redirect}`, () => {
    const args = argsFor(cell);
    assert.equal(resolveCraftingRedirect(args), cell.redirect);
    // The target is DERIVED from the builder rather than read out of a hard-coded
    // table: whatever it returns must be the view of an item the same arguments
    // actually emit, so the rail and the router cannot disagree.
    assert.ok(
      buildCraftingNavItems(args).some((item) => item.view === cell.redirect),
      `${cell.redirect} must be a view the rail renders for this cell`
    );
  });
}

test('resolveCraftingRedirect pins the unknown/absent-mode fallback', () => {
  // `craftingEffect` already resolves unknown or absent input to `knowledge`, and
  // the redirect inherits that rather than restating it.
  assert.equal(resolveCraftingRedirect(), 'books-scrolls');
  assert.equal(resolveCraftingRedirect({ visibilityMode: 'nope' }), 'books-scrolls');
});

for (const cell of CRAFTING_MODE_CASES) {
  test(`availability in the ${cell.visibilityMode} + ${cell.resolutionMode} cell`, () => {
    const args = argsFor(cell);
    const effect = craftingEffect(cell.visibilityMode);
    // The always-present routes. `recipe-edit` is the one the issue's own proposed
    // clause (`items.some((item) => item.view === view)`) would have ejected the GM
    // from, because no nav item carries that view under ANY mode.
    for (const view of ['recipes', 'recipe-edit', 'crafting-settings']) {
      assert.equal(isCraftingViewAvailable(view, args), true, `${view} is never redirected`);
    }
    assert.equal(isCraftingViewAvailable('access', args), cell.visibilityMode === 'restricted');
    assert.equal(isCraftingViewAvailable('books-scrolls', args), effect.showBooksScrolls);
    assert.equal(
      isCraftingViewAvailable('knowledge', args),
      effect.showBooksScrolls || cell.resolutionMode === 'alchemy'
    );
    // The parent collapse: `recipe-item-edit` is owned by Books & Scrolls, so it is
    // caught exactly when that entry is unavailable and at no other time.
    assert.equal(
      isCraftingViewAvailable('recipe-item-edit', args),
      isCraftingViewAvailable('books-scrolls', args)
    );
    // A view outside the group has no owning entry, so it is never "available" —
    // the root's own `isCraftingView` guard makes that answer unreachable.
    assert.equal(isCraftingViewAvailable('components', args), false);
  });
}

test('the ordered conditional constant is exactly what the builder can mode-gate', () => {
  const emitted = new Set();
  for (const cell of CRAFTING_MODE_CASES) {
    for (const item of buildCraftingNavItems(argsFor(cell))) emitted.add(item.view);
  }
  emitted.delete('recipes');
  emitted.delete('crafting-settings');
  // Anti-drift: a fifth mode-gated entry added to the builder without being listed
  // in the constant fails here, which is what keeps the resolver a pure read of the
  // builder's output rather than a second copy of its gates.
  assert.deepEqual([...emitted].sort(), [...CRAFTING_CONDITIONAL_VIEWS].sort());
  // Rail order, which is also the redirect's precedence order.
  assert.deepEqual(CRAFTING_CONDITIONAL_VIEWS, ['access', 'books-scrolls', 'knowledge']);
});

test('the Knowledge entry carries no count badge and the brain icon', () => {
  const items = buildCraftingNavItems({
    visibilityMode: 'knowledge',
    recipeCount: 7,
    recipeItemCount: 3,
  });
  const knowledge = items.find((item) => item.id === 'knowledge');
  assert.equal(knowledge.view, 'knowledge');
  assert.equal(knowledge.icon, 'fas fa-brain');
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

// Root-source pin, mirroring the one in `tests/checks-nav.test.js`. The rail and the
// router must read ONE argument object: if the router built its own bag the two could
// disagree about what the selected system offers, which is the whole defect issue 1151
// reports. `craftingNavArgs.visibilityMode` is pinned to the DEFAULTED
// `craftingVisibilityMode` because that same derived feeds `BooksScrollsView`,
// `RecipeItemEditor` and `ItemPageInspector` — and `RecipeItemEditor`'s own prop default
// is `'item'`, so a bare `selectedSystem?.visibilityMode` would silently flip its Limits
// card from learning caps to use caps for a system with no persisted mode.
test('the manager root reads one craftingNavArgs for both the rail and the router', () => {
  const rootSource = readFileSync(
    resolve(repoRoot, 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte'),
    'utf8'
  );

  assert.match(
    rootSource,
    /import \{[\s\S]*?resolveCraftingRedirect[\s\S]*?\} from '\.\/crafting\/craftingNav\.js'/
  );
  assert.match(
    rootSource,
    /import \{[\s\S]*?isCraftingViewAvailable[\s\S]*?\} from '\.\/crafting\/craftingNav\.js'/
  );
  assert.match(rootSource, /const craftingVisibilityMode = \$derived\(\s*selectedSystem\?\./);
  assert.match(
    rootSource,
    /const craftingNavArgs = \$derived\(\{\s*visibilityMode: craftingVisibilityMode,\s*resolutionMode: craftingResolutionMode,/
  );
  assert.match(
    rootSource,
    /const craftingNavItems = \$derived\(buildCraftingNavItems\(craftingNavArgs\)\)/
  );
  assert.match(
    rootSource,
    /isCraftingView\(view\) && !isCraftingViewAvailable\(view, craftingNavArgs\)\s*\)?\s*return resolveCraftingRedirect\(craftingNavArgs\);/
  );
});
