/**
 * The world vocabulary's numbers, through the REAL `createAdminStore` (issue 1392, epic 1357).
 *
 * ── WHAT THIS CLOSES, AND WHY NOTHING ELSE COULD ──────────────────────────────────────────
 * `adminStore.js` is a gateway file, and this change is bounded to ONE added executable line in
 * it: the recipe corpus that `buildWorldScopeState` is not otherwise handed. Every other
 * assertion about the reference count calls `buildWorldScopeState` directly with a `recipes`
 * argument of its own, so deleting that line leaves the whole suite green — measured, 501 tests
 * across 13 suites — while the product renders every world recipe category as `Unused` under a
 * red one-click delete. A bound nothing guards is a bound in name only.
 *
 * So this drives the composition rather than the leaf: the real store, the shared services
 * fixture, one recipe carrying a category and one world vocabulary entry naming it, and the
 * assertion is on the PUBLISHED `viewState`.
 *
 * ── AND WHY IT ASSERTS `silentlyDeletable` AS WELL AS THE COUNT ────────────────────────────
 * The count alone would let a fix that restored the number but not the gate pass. The consequence
 * of the missing line is not a wrong figure a GM might notice — it is a destructive affordance:
 * `0` publishes `silentlyDeletable: true`, which paints the row `Unused` under the immediate
 * delete and removes the confirm from a category forty recipes may be using.
 */
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import test from 'node:test';

import { createAdminStore } from '../src/ui/svelte/stores/adminStore.js';
import { createWorldVocabularyStore } from '../src/systems/WorldVocabularyStore.js';
import { createServices, makeRecipe, makeSystem } from './helpers/adminStoreServices.js';

/** A loaded world vocabulary store over a bare `Map`, exactly as `src/main.js` builds one. */
function vocabularyStore(payload) {
  const values = new Map([['worldVocabulary', payload]]);
  const store = createWorldVocabularyStore({
    getSetting: (key) => values.get(key),
    setSetting: async (key, value) => values.set(key, value),
  });
  store.load();
  return store;
}

test('the published viewState carries a REAL world recipe-category reference count', async () => {
  const system = makeSystem({
    components: [{ id: 'c1', name: 'Ash Salt', category: 'Reagent', tags: ['herb'] }],
  });
  const recipes = [
    makeRecipe({ id: 'r1', category: 'Potions' }),
    makeRecipe({ id: 'r2', category: 'Potions' }),
  ];
  const services = createServices(system, recipes, [], {
    getVocabularyScopeStore: () =>
      vocabularyStore({
        componentCategories: [{ id: 'reagent', name: 'Reagent' }],
        recipeCategories: [
          { id: 'potions', name: 'Potions' },
          { id: 'curiosities', name: 'Curiosities' },
        ],
      }),
  });

  const store = createAdminStore(services);
  try {
    // The publish is the tail of an ASYNC refresh, so a synchronous read of `viewState` sees the
    // pre-publish shape. Selecting the fixture's system is what every other adminStore suite
    // drives it with.
    await store.selectSystem('sys1');
    const vocabulary = get(store.viewState).worldScope.vocabulary;

    // NON-VACUITY FIRST: the leg has to be wired at all before its numbers mean anything.
    assert.equal(vocabulary.available, true, 'the vocabulary leg reached the published viewState');
    assert.equal(vocabulary.total, 3);

    const potions = vocabulary.recipeCategories.find((row) => row.id === 'potions');
    assert.equal(
      potions.totalUsage,
      2,
      'the recipe corpus must reach the projection from THIS file; a world recipe category the ' +
        'store cannot count publishes 0'
    );
    assert.equal(
      potions.silentlyDeletable,
      false,
      'and a category two recipes use must never be offered for a one-click delete'
    );

    // THE POSITIVE CONTROL, so a "confirm everything" repair reds here rather than passing: an
    // entry nothing names is still genuinely deletable in one click.
    const unused = vocabulary.recipeCategories.find((row) => row.id === 'curiosities');
    assert.equal(unused.totalUsage, 0);
    assert.equal(unused.silentlyDeletable, true);

    // The component half travels through the same call, off the crafting-system roster the
    // store already had — so a repair that threaded recipes and dropped the roster reds too.
    const reagent = vocabulary.componentCategories.find((row) => row.id === 'reagent');
    assert.equal(reagent.totalUsage, 1);
  } finally {
    store.destroy?.();
  }
});
