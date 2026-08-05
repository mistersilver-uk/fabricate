/**
 * `adminStore.applyComponentBulkEdit(componentIds, edit)` (issue 772) — the store-public
 * surface over `CraftingSystemManager.applyBulkEditToComponents`.
 *
 * It resolves the selected system itself, forwards the staged edit VERBATIM (an empty
 * `essences` map and a zero `difficulty` are real "clear" instructions, so the store must
 * not prune "empty" keys), refreshes so the browser rows re-render off the republished
 * `itemCards`, and routes a failure through `notify.error` while returning `false`.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { createServices, makeSystem } from '../helpers/adminStoreServices.js';

const { createAdminStore } = await import('../../src/ui/svelte/stores/adminStore.js');

let originalGame;

beforeEach(() => {
  originalGame = globalThis.game;
  globalThis.game = { i18n: { localize: (key) => key, format: (key) => key } };
});

afterEach(() => {
  globalThis.game = originalGame;
});

function buildStore({ applyImpl, worldHasSystems = true } = {}) {
  const system = makeSystem({
    features: { itemTags: true, essences: true },
    itemTags: ['herb', 'rare'],
    essenceDefinitions: [{ id: 'earth', name: 'Earth', icon: 'fas fa-mountain' }],
    items: [
      { id: 'c1', name: 'Iron Ore', category: 'general', tags: [], essences: {} },
      { id: 'c2', name: 'Sage', category: 'general', tags: ['herb'], essences: {} },
    ],
  });
  const calls = [];
  const errors = [];
  const worldSystems = worldHasSystems ? [system] : [];
  const services = createServices(system, [], [], {
    getCraftingSystemManager: () => ({
      getSystems: () => worldSystems,
      getSystem: (id) => worldSystems.find((s) => s.id === id) || null,
      getItems: () => system.items,
      applyBulkEditToComponents: async (systemId, componentIds, edit) => {
        calls.push({ systemId, componentIds, edit });
        return applyImpl
          ? applyImpl(systemId, componentIds, edit)
          : { updated: componentIds.length, componentIds };
      },
    }),
    notify: { info: () => {}, warn: () => {}, error: (message) => errors.push(message) },
    // `selectedSystemId` is seeded from this setting and re-resolved against the world's
    // systems on refresh, so "no system selected" needs BOTH blanked, not just this one.
    getSetting: () => '',
  });
  return { store: createAdminStore(services), calls, errors, system };
}

describe('adminStore.applyComponentBulkEdit (issue 772)', () => {
  it('calls the set-apply primitive with the selected system id and the staged edit', async () => {
    const { store, calls } = buildStore();
    await store.selectSystem('sys1');

    const result = await store.applyComponentBulkEdit(['c1', 'c2'], {
      category: 'Reagent',
      addTags: ['rare'],
      removeTags: ['herb'],
    });

    assert.deepEqual(result, { updated: 2, componentIds: ['c1', 'c2'] });
    assert.equal(calls.length, 1, 'ONE set-apply write for the whole selection');
    assert.equal(calls[0].systemId, 'sys1');
    assert.deepEqual(calls[0].componentIds, ['c1', 'c2']);
    assert.deepEqual(calls[0].edit, {
      category: 'Reagent',
      addTags: ['rare'],
      removeTags: ['herb'],
    });
  });

  it('accepts a Set of ids (the browser holds the selection as one)', async () => {
    const { store, calls } = buildStore();
    await store.selectSystem('sys1');

    const result = await store.applyComponentBulkEdit(new Set(['c2']), { difficulty: 9 });

    assert.deepEqual(result, { updated: 1, componentIds: ['c2'] });
    assert.deepEqual(calls[0].componentIds, ['c2']);
  });

  it('forwards an empty essences map and a zero difficulty UNPRUNED', async () => {
    const { store, calls } = buildStore();
    await store.selectSystem('sys1');

    await store.applyComponentBulkEdit(['c1'], { essences: {}, difficulty: 0 });

    // Both are "clear this axis" instructions; a store that dropped them as empty would
    // silently turn a destructive apply into a no-op.
    assert.deepEqual(calls[0].edit, { essences: {}, difficulty: 0 });
  });

  it('refreshes, so the republished itemCards reflect the write', async () => {
    const { store, calls, system } = buildStore({
      applyImpl: (_systemId, componentIds) => {
        // Stand in for the real primitive's persist: mutate the system the store reads.
        for (const item of system.items) {
          if (componentIds.includes(item.id)) item.category = 'Reagent';
        }
        return { updated: componentIds.length, componentIds };
      },
    });
    await store.selectSystem('sys1');
    assert.ok(
      get(store.viewState).itemCards.every((card) => card.category === 'general'),
      'pre-condition: nothing is in Reagent yet'
    );

    await store.applyComponentBulkEdit(['c1', 'c2'], { category: 'Reagent' });

    assert.equal(calls.length, 1);
    const cards = get(store.viewState).itemCards;
    assert.equal(cards.length, 2);
    assert.ok(
      cards.every((card) => card.category === 'Reagent'),
      'the rows re-render off the refreshed projection with no bespoke invalidation'
    );
  });

  it('notifies and returns null when the primitive throws', async () => {
    const { store, errors } = buildStore({
      applyImpl: () => {
        throw new Error('boom');
      },
    });
    await store.selectSystem('sys1');

    const result = await store.applyComponentBulkEdit(['c1'], { category: 'Reagent' });

    assert.equal(result, null);
    assert.deepEqual(errors, ['boom']);
  });

  it('is a no-op when there is no selection', async () => {
    const { store, calls } = buildStore();
    await store.selectSystem('sys1');

    assert.equal(await store.applyComponentBulkEdit([], { category: 'Reagent' }), null);
    assert.equal(await store.applyComponentBulkEdit(undefined, { category: 'Reagent' }), null);
    assert.equal(calls.length, 0, 'the primitive is never reached without ids');
  });

  it('is a no-op when no system is selected', async () => {
    const { store, calls } = buildStore({ worldHasSystems: false });

    assert.equal(await store.applyComponentBulkEdit(['c1'], { category: 'Reagent' }), null);
    assert.equal(calls.length, 0);
  });
});
