/**
 * The library-search route-scope contract (issue 1462).
 *
 * The manager clears the store-backed library searches whenever the GM's navigation SCOPE
 * changes, where the scope is `browserViewForScopeChange` — the same browser/detail-editor
 * map a crafting-system scope change already uses. That map is what makes the one preserved
 * round trip (a browser and its own detail editor) fall out of an existing structure rather
 * than a second hand-maintained list.
 *
 * The property pinned here is the one a first draft of that feature violated:
 *
 *   a route that WRITES a library search must not share a search scope with any other
 *   reachable route, except the detail editor the map deliberately pairs it with.
 *
 * The draft wrapped the scope in a `SEARCH_SCOPED_BROWSERS` set and returned `null` for
 * anything outside it, which collapsed EVERY non-library route onto one shared scope. So
 * `access` — which renders its own recipe search box and writes the shared term — sat at the
 * same scope as `tags`, the two never compared unequal, and Access -> Tags & Categories
 * cleared nothing. Tags counts vocabulary references over the filtered recipe rows, and a
 * referenced entry that reads `Unused` there deletes in ONE click with no confirm strip.
 *
 * This is a SOURCE scan because `searchScopeForView` and `SCOPE_BROWSER_BY_VIEW` are private
 * to the root component and cannot be imported. It is written to fail loudly rather than
 * quietly: every derived collection is asserted non-empty first, because a mechanical grep
 * that matches nothing passes in silence and this repository has shipped that.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { repoRoot, stripComments } from './helpers/sourceScan.js';

const ROOT_COMPONENT = 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte';

// Comments are blanked before matching: this file's own prose names the call sites and the
// route guards it polices, and so does the root component's.
const source = stripComments(readFileSync(resolve(repoRoot, ROOT_COMPONENT), 'utf8'));

/** `SCOPE_BROWSER_BY_VIEW`, read out of the component rather than restated here. */
function scopeMap() {
  const block = source.match(/const SCOPE_BROWSER_BY_VIEW = \{([\s\S]*?)\};/);
  assert.ok(block, 'SCOPE_BROWSER_BY_VIEW is still declared as an object literal in the root');
  const entries = [...block[1].matchAll(/'([a-z0-9-]+)':\s*'([a-z0-9-]+)'/g)].map((m) => [
    m[1],
    m[2],
  ]);
  assert.ok(entries.length >= 5, 'the scope map still pairs every browser with its detail editor');
  return Object.fromEntries(entries);
}

const SCOPE_BY_VIEW = scopeMap();

/** `searchScopeForView`, reproduced from the map the component actually declares. */
function searchScopeForView(view) {
  return SCOPE_BY_VIEW[view] || view;
}

/** Every route the router renders, taken from its own `currentView === '…'` guards. */
function reachableRoutes() {
  const guards = [...source.matchAll(/currentView === '([a-z0-9-]+)'/g)].map((m) => m[1]);
  assert.ok(guards.length > 20, 'the route guards are still spelled `currentView === \'…\'`');
  return [...new Set([...guards, ...Object.keys(SCOPE_BY_VIEW)])].sort();
}

/**
 * Every route that WRITES a store-backed library search, with the term it writes.
 *
 * The owning route is the nearest preceding `currentView === '…'` guard, which is how the
 * router's `{:else if}` chain expresses "this route renders this surface".
 */
function searchWriterRoutes() {
  const guards = [...source.matchAll(/currentView === '([a-z0-9-]+)'/g)].map((m) => ({
    route: m[1],
    index: m.index,
  }));
  const writers = [...source.matchAll(/store\.(setRecipeSearch|setItemSearch)\?\.\(/g)].map(
    (m) => ({ term: m[1], index: m.index })
  );
  assert.ok(writers.length > 0, 'the scan still finds the search-write call sites at all');
  return writers.map(({ term, index }) => {
    const owner = guards.filter((guard) => guard.index < index).at(-1);
    assert.ok(owner, `a ${term} call site sits outside every route guard, so it has no scope`);
    return { route: owner.route, term };
  });
}

describe('manager library-search route scope', () => {
  // An EXACT set, not a subset, and deliberately so. A fourth surface binding one of these
  // pairs is exactly the change that has to re-answer the question below, so it fails here
  // and is added in the same commit. It also proves the scan is not vacuous: a grep that
  // silently stopped matching would empty this and fail, rather than pass.
  const EXPECTED_WRITERS = [
    { route: 'access', term: 'setRecipeSearch' },
    { route: 'components', term: 'setItemSearch' },
    { route: 'recipes', term: 'setRecipeSearch' },
  ];

  const byRouteThenTerm = (left, right) =>
    left.route === right.route
      ? left.term.localeCompare(right.term)
      : left.route.localeCompare(right.route);

  // THE ASSERTION THAT KEEPS THE OTHERS HONEST.
  //
  // Everything below MODELS `searchScopeForView` from `SCOPE_BROWSER_BY_VIEW`, and that model
  // is sound only while the real function is exactly `browserViewForScopeChange`. The draft
  // that shipped the defect wrapped it in a `SEARCH_SCOPED_BROWSERS` set returning `null` for
  // anything outside two routes — a change a map-derived model cannot see at all, which would
  // leave every case here passing over the exact defect they exist to catch. So the bodies of
  // both functions are pinned verbatim: a wrapper, a set, or any second source of truth about
  // which routes own a search fails HERE, loudly, instead of going quiet everywhere else.
  it('derives the scope from the browser map alone, with no second source of truth', () => {
    const scopeBody = source.match(/function searchScopeForView\(view\) \{([\s\S]*?)\n {2}\}/);
    assert.ok(scopeBody, 'searchScopeForView is still a declared function in the root');
    assert.equal(
      scopeBody[1].trim(),
      'return browserViewForScopeChange(view);',
      'searchScopeForView must be browserViewForScopeChange and nothing else'
    );

    const browserBody = source.match(
      /function browserViewForScopeChange\(view\) \{([\s\S]*?)\n {2}\}/
    );
    assert.ok(browserBody, 'browserViewForScopeChange is still a declared function in the root');
    assert.equal(browserBody[1].trim(), 'return SCOPE_BROWSER_BY_VIEW[view] || view;');
  });

  it('pins every route that writes a store-backed library search', () => {
    assert.deepEqual([...searchWriterRoutes()].sort(byRouteThenTerm), EXPECTED_WRITERS);
  });

  it('gives every search-writing route a scope no other reachable route shares', () => {
    const writers = searchWriterRoutes();
    const routes = reachableRoutes();

    for (const { route, term } of writers) {
      const scope = searchScopeForView(route);
      for (const other of routes) {
        if (other === route) continue;
        // The ONE deliberate exception: the detail editor the map pairs with this browser.
        // That pairing is what preserves the search across the editor round trip.
        if (SCOPE_BY_VIEW[other] === route) continue;
        assert.notEqual(
          searchScopeForView(other),
          scope,
          `"${other}" shares a search scope with "${route}", which writes ${term}. ` +
            'Navigating between them would not change scope, so the term would survive onto ' +
            'a screen that renders no search box for it — the issue 1462 defect. Either give ' +
            'the routes distinct scopes or pair them explicitly in SCOPE_BROWSER_BY_VIEW.'
        );
      }
    }
  });

  it('keeps the preserved round trip expressible: each writer browser owns a detail editor scope', () => {
    // The complement of the case above. It would go red if a future edit "fixed" the
    // distinctness assertion by deleting the pairing that makes the round trip work.
    const paired = Object.entries(SCOPE_BY_VIEW).filter(([, browser]) => browser === 'recipes');
    assert.deepEqual(paired, [['recipe-edit', 'recipes']]);
    assert.equal(searchScopeForView('recipe-edit'), searchScopeForView('recipes'));
    assert.equal(searchScopeForView('component-edit'), searchScopeForView('components'));
  });
});
