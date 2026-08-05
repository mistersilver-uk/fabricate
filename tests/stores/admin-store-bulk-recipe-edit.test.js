/**
 * `adminStore.applyRecipeBulkEdit(recipeIds, edit)` (issue 1010) — the store-public
 * surface over `CraftingSystemManager.applyBulkEditToRecipes`.
 *
 * It resolves the selected system itself, forwards the staged edit VERBATIM, refreshes so
 * the browser rows re-render off the republished projection, and routes a failure through
 * `notify.error` while returning `null`.
 *
 * The core contract under test is the UNPRUNED forward. Three of the six edit keys are
 * falsy but real — `enabled: false`, `locked: false` and `checkTierId: null` — and a
 * present `checkTierId: null` ("clear to the system default") means something different
 * from an absent one ("leave the tier alone"), so a store that pruned "empty" keys would
 * silently turn one instruction into the other.
 *
 * The manager is stubbed here: this suite covers the SEAM. `applyBulkEditToRecipes`'s own
 * behaviour (save counting, the blocked-enable retry, the book reconcile) is covered by
 * `tests/apply-bulk-edit-to-recipes.test.js`.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { createServices, makeSystem, makeRecipe } from '../helpers/adminStoreServices.js';

const { createAdminStore } = await import('../../src/ui/svelte/stores/adminStore.js');

let originalGame;

beforeEach(() => {
  originalGame = globalThis.game;
  globalThis.game = { i18n: { localize: (key) => key, format: (key) => key } };
});

afterEach(() => {
  globalThis.game = originalGame;
});

function makeResult(recipeIds, overrides = {}) {
  return {
    updated: recipeIds.length,
    recipeIds,
    blockedEnables: 0,
    blockedRecipeIds: [],
    rejected: 0,
    rejectedRecipeIds: [],
    booksUpdated: 0,
    bookIds: [],
    // Membership EDGES, distinct from `booksUpdated`'s DEFINITIONS — the post-apply
    // notification reports these, so a normalizer that dropped them would report `0`
    // additions for a write that made twelve.
    bookAdditions: 0,
    bookRemovals: 0,
    ...overrides,
  };
}

function buildStore({ applyImpl, worldHasSystems = true } = {}) {
  const recipes = [
    makeRecipe({ id: 'r1', name: 'Brew Antidote', craftingSystemId: 'sys1', category: 'general' }),
    makeRecipe({ id: 'r2', name: 'Forge Blade', craftingSystemId: 'sys1', category: 'general' }),
  ];
  const system = makeSystem({ recipeItemDefinitions: [{ id: 'book-1', name: 'Grimoire' }] });
  const calls = [];
  const errors = [];
  const worldSystems = worldHasSystems ? [system] : [];
  const services = createServices(system, recipes, [], {
    getCraftingSystemManager: () => ({
      getSystems: () => worldSystems,
      getSystem: (id) => worldSystems.find((s) => s.id === id) || null,
      getItems: () => [],
      applyBulkEditToRecipes: async (systemId, recipeIds, edit) => {
        calls.push({ systemId, recipeIds, edit });
        return applyImpl ? applyImpl(systemId, recipeIds, edit) : makeResult(recipeIds);
      },
    }),
    notify: { info: () => {}, warn: () => {}, error: (message) => errors.push(message) },
    // `selectedSystemId` is seeded from this setting and re-resolved against the world's
    // systems on refresh, so "no system selected" needs BOTH blanked, not just this one.
    getSetting: () => '',
  });
  return { store: createAdminStore(services), calls, errors, recipes };
}

describe('adminStore.applyRecipeBulkEdit (issue 1010)', () => {
  it('calls the set-apply primitive with the selected system id and the staged edit', async () => {
    const { store, calls } = buildStore();
    await store.selectSystem('sys1');

    const result = await store.applyRecipeBulkEdit(['r1', 'r2'], {
      category: 'Alchemy',
      addBookIds: ['book-1'],
      removeBookIds: [],
    });

    assert.deepEqual(result, makeResult(['r1', 'r2']));
    assert.equal(calls.length, 1, 'ONE set-apply write for the whole selection');
    assert.equal(calls[0].systemId, 'sys1', 'the store resolves the system, not the caller');
    assert.deepEqual(calls[0].recipeIds, ['r1', 'r2']);
    assert.deepEqual(calls[0].edit, {
      category: 'Alchemy',
      addBookIds: ['book-1'],
      removeBookIds: [],
    });
  });

  it('accepts a Set of ids (the browser holds the selection as one)', async () => {
    const { store, calls } = buildStore();
    await store.selectSystem('sys1');

    const result = await store.applyRecipeBulkEdit(new Set(['r2']), { category: 'Alchemy' });

    assert.equal(result.updated, 1);
    assert.deepEqual(calls[0].recipeIds, ['r2']);
  });

  it('forwards a null checkTierId, a false enabled and a false locked UNPRUNED', async () => {
    const { store, calls } = buildStore();
    await store.selectSystem('sys1');

    await store.applyRecipeBulkEdit(['r1'], {
      enabled: false,
      locked: false,
      checkTierId: null,
    });

    // All three are real instructions — disable, unlock, clear to the system default.
    // A store that dropped them as empty would turn a destructive apply into a no-op,
    // and would make "clear the tier" indistinguishable from "leave the tier alone".
    assert.deepEqual(calls[0].edit, { enabled: false, locked: false, checkTierId: null });
    assert.ok(
      Object.hasOwn(calls[0].edit, 'checkTierId'),
      'a staged null must survive as a PRESENT key: presence is the whole signal'
    );
  });

  it('never synthesizes an absent checkTierId into the forwarded edit', async () => {
    const { store, calls } = buildStore();
    await store.selectSystem('sys1');

    await store.applyRecipeBulkEdit(['r1'], { category: 'Alchemy' });

    // The inverse of the case above: an unstaged tier axis must reach the primitive as
    // an ABSENT key. Defaulting it to null here would clear every selected recipe's
    // check tier on an edit that never touched the axis.
    assert.equal(
      Object.hasOwn(calls[0].edit, 'checkTierId'),
      false,
      'an unstaged check tier stays absent'
    );
    assert.deepEqual(Object.keys(calls[0].edit), ['category'], 'no key is invented');
  });

  it('refreshes, so the republished recipe rows reflect the write', async () => {
    const { store, calls, recipes } = buildStore({
      applyImpl: (_systemId, recipeIds) => {
        // Stand in for the real primitive's persist: mutate what the store reads back.
        for (const recipe of recipes) {
          if (recipeIds.includes(recipe.id)) recipe.category = 'Alchemy';
        }
        return makeResult(recipeIds);
      },
    });
    await store.selectSystem('sys1');
    assert.ok(
      get(store.viewState).recipes.every((row) => row.category === 'general'),
      'pre-condition: nothing is in Alchemy yet'
    );

    await store.applyRecipeBulkEdit(['r1', 'r2'], { category: 'Alchemy' });

    assert.equal(calls.length, 1);
    const rows = get(store.viewState).recipes;
    assert.equal(rows.length, 2);
    assert.ok(
      rows.every((row) => row.category === 'Alchemy'),
      'the rows re-render off the refreshed projection with no bespoke invalidation'
    );
  });

  it('returns the blocked and rejected counts through to the caller', async () => {
    const { store } = buildStore({
      applyImpl: () =>
        makeResult(['r1'], {
          updated: 1,
          blockedEnables: 1,
          blockedRecipeIds: ['r2'],
          rejected: 1,
          rejectedRecipeIds: ['r3'],
          booksUpdated: 1,
          bookIds: ['book-1'],
          bookAdditions: 3,
          bookRemovals: 2,
        }),
    });
    await store.selectSystem('sys1');

    const result = await store.applyRecipeBulkEdit(['r1', 'r2', 'r3'], { enabled: true });

    // A blocked enable is a PARTIAL success: a boolean could not express it, and the
    // post-apply notification is the authority on both counts.
    assert.equal(result.updated, 1);
    assert.equal(result.blockedEnables, 1);
    assert.deepEqual(result.blockedRecipeIds, ['r2']);
    assert.equal(result.rejected, 1);
    assert.deepEqual(result.rejectedRecipeIds, ['r3']);
    assert.equal(result.booksUpdated, 1);
    assert.deepEqual(result.bookIds, ['book-1']);
    // The edge counts are the ones the notification reports, and they are NOT derivable
    // from `booksUpdated`: one definition here carries five edges.
    assert.equal(result.bookAdditions, 3);
    assert.equal(result.bookRemovals, 2);
  });

  it('fills in every count when the primitive reports a partial result', async () => {
    const { store } = buildStore({ applyImpl: () => ({ updated: 2 }) });
    await store.selectSystem('sys1');

    const result = await store.applyRecipeBulkEdit(['r1', 'r2'], { locked: true });

    // The notification reads every count unconditionally, so none may be undefined.
    assert.deepEqual(result, makeResult([], { updated: 2 }));
  });

  it('notifies and returns null when the primitive throws', async () => {
    const { store, errors } = buildStore({
      applyImpl: () => {
        throw new Error('boom');
      },
    });
    await store.selectSystem('sys1');

    const result = await store.applyRecipeBulkEdit(['r1'], { category: 'Alchemy' });

    assert.equal(result, null);
    assert.deepEqual(errors, ['boom']);
  });

  it('notifies and returns null when the primitive refuses a non-GM caller', async () => {
    // `_assertGM` throws before any write. The seam must report it, not the panel: a
    // silent `null` would leave the GM staring at an unchanged selection.
    const { store, errors } = buildStore({
      applyImpl: () => {
        throw new Error('GM permissions required: apply recipe bulk edit');
      },
    });
    await store.selectSystem('sys1');

    const result = await store.applyRecipeBulkEdit(['r1'], { enabled: true });

    assert.equal(result, null);
    assert.deepEqual(errors, ['GM permissions required: apply recipe bulk edit']);
  });

  it('surfaces a coded activation failure through the shared localizer', async () => {
    const { store, errors } = buildStore({
      applyImpl: () => {
        const err = new Error('Cannot enable recipe recipe-abc123: ingredientGroupUnknownTag');
        err.recipeName = 'Brew Antidote';
        err.activationIssues = [
          { code: 'ingredientGroupUnknownTag', params: { group: 'Herbs', tag: 'rare' } },
        ];
        throw err;
      },
    });
    await store.selectSystem('sys1');

    const result = await store.applyRecipeBulkEdit(['r1'], { enabled: true });

    assert.equal(result, null);
    assert.equal(errors.length, 1);
    // The GM gets the coded, id-free copy the single-recipe toggle already produces —
    // NOT the error's raw English aggregate, which names the internal recipe id.
    assert.equal(
      errors[0],
      'Cannot enable recipe "Brew Antidote": Ingredient group "Herbs" references unknown tag "rare"'
    );
  });

  it('is a no-op when there is no selection', async () => {
    const { store, calls } = buildStore();
    await store.selectSystem('sys1');

    assert.equal(await store.applyRecipeBulkEdit([], { category: 'Alchemy' }), null);
    assert.equal(await store.applyRecipeBulkEdit(undefined, { category: 'Alchemy' }), null);
    assert.equal(calls.length, 0, 'the primitive is never reached without ids');
  });

  it('is a no-op when no system is selected', async () => {
    const { store, calls } = buildStore({ worldHasSystems: false });

    assert.equal(await store.applyRecipeBulkEdit(['r1'], { category: 'Alchemy' }), null);
    assert.equal(calls.length, 0);
  });

  it('is a no-op for a non-object or empty edit', async () => {
    const { store, calls } = buildStore();
    await store.selectSystem('sys1');

    assert.equal(await store.applyRecipeBulkEdit(['r1'], null), null);
    assert.equal(await store.applyRecipeBulkEdit(['r1'], 'category'), null);
    assert.equal(await store.applyRecipeBulkEdit(['r1'], {}), null);
    assert.equal(await store.applyRecipeBulkEdit(['r1']), null, 'the default edit is empty');
    assert.equal(calls.length, 0, 'an unstaged draft never reaches a world write');
  });
});
