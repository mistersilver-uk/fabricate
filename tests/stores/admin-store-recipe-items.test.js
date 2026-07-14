/**
 * Books & Scrolls recipe-item projection (issue 511).
 *
 * Covers the enriched recipe-item projection that feeds the Books & Scrolls
 * library: async name/img/type resolution via `fromUuid`, the derived linked
 * `recipes[]` (reverse ref through `recipe.recipeItemId`), the world-actor
 * `learnedByCount`, `linkMissing` for broken links, and the `setRecipeItemEnabled`
 * action.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

const { createAdminStore } = await import('../../src/ui/svelte/stores/adminStore.js');

function makeRecipe(overrides = {}) {
  const id = overrides.id || `recipe-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    name: overrides.name || `Recipe ${id}`,
    description: '',
    img: 'recipe.png',
    category: overrides.category || 'general',
    enabled: overrides.enabled !== undefined ? overrides.enabled : true,
    locked: false,
    visibility: {},
    ingredientSets: [],
    recipeItemId: overrides.recipeItemId || '',
    craftingSystemId: overrides.craftingSystemId || 'sys1',
    isSimpleRecipe: () => true,
    toJSON: () => ({ id, name: overrides.name || `Recipe ${id}`, craftingSystemId: overrides.craftingSystemId || 'sys1' }),
    ...overrides
  };
}

function makeSystem(overrides = {}) {
  return {
    id: 'sys1',
    name: 'System One',
    description: '',
    resolutionMode: 'simple',
    visibilityMode: 'item',
    features: {},
    categories: [],
    itemTags: [],
    essenceDefinitions: [],
    items: [],
    requirements: { time: { enabled: false }, currency: { enabled: false, units: [] } },
    craftingCheck: { mode: 'passFail', macroUuid: null, outcomes: [] },
    recipeVisibility: { listMode: 'global' },
    recipeItemDefinitions: [],
    ...overrides
  };
}

function createServices(system, recipes, capture) {
  const systems = [system];
  const systemManager = {
    getSystems: () => systems,
    getSystem: (id) => systems.find((s) => s.id === id) || null,
    getItems: () => [],
    updateRecipeItemDefinition: async (systemId, recipeItemId, patch) => {
      capture.push({ systemId, recipeItemId, patch });
      const def = (system.recipeItemDefinitions || []).find((d) => d.id === recipeItemId);
      if (def && Object.prototype.hasOwnProperty.call(patch, 'enabled')) def.enabled = patch.enabled;
    }
  };
  const recipeManager = {
    getRecipes: (filter) =>
      filter?.craftingSystemId ? recipes.filter((r) => r.craftingSystemId === filter.craftingSystemId) : recipes,
    getRecipe: (id) => recipes.find((r) => r.id === id) || null
  };
  return {
    getSetting: (key) => (key === 'lastManagedCraftingSystem' ? 'sys1' : ''),
    setSetting: async () => {},
    getCraftingSystemManager: () => systemManager,
    getRecipeManager: () => recipeManager,
    getScriptMacros: () => [],
    getSceneOptions: () => [],
    getWorldUsers: () => [],
    localize: (key) => key,
    notify: { info: () => {}, warn: () => {}, error: () => {} }
  };
}

function recipeItemById(vs, id) {
  return (vs.selectedSystem?.recipeItemDefinitions || []).find((d) => d.id === id);
}

let originalFromUuid;
let originalGame;

beforeEach(() => {
  originalFromUuid = globalThis.fromUuid;
  originalGame = globalThis.game;
  globalThis.fromUuid = async (uuid) => {
    if (uuid === 'Item.aaa') return { name: 'Journeyman Primer', img: 'resolved-primer.png', type: 'loot' };
    if (uuid === 'Item.bbb') return { name: 'Grand Codex', img: 'resolved-codex.png', type: 'book' };
    return null; // Item.zzz is a broken link
  };
  globalThis.game = {
    i18n: { localize: (key) => key, format: (key) => key },
    actors: {
      contents: [
        { id: 'a1', flags: { fabricate: { learnedRecipes: { r1: 1 } } } },
        { id: 'a2', flags: { fabricate: { learnedRecipes: { r2: 1 } } } },
        { id: 'a3', flags: { fabricate: { learnedRecipes: { r3: 1 } } } }
      ]
    }
  };
});

afterEach(() => {
  globalThis.fromUuid = originalFromUuid;
  globalThis.game = originalGame;
});

describe('adminStore Books & Scrolls recipe-item projection', () => {
  function buildStore(capture = []) {
    const system = makeSystem({
      recipeItemDefinitions: [
        { id: 'primer', name: 'Primer', img: 'primer.png', originItemUuid: 'Item.aaa', enabled: true, caps: { item: { limitUses: true, maxUses: 2 }, learn: { limitLearning: false } } },
        { id: 'codex', name: '', img: '', originItemUuid: 'Item.bbb', enabled: false, caps: {} },
        { id: 'gone', name: 'Torn Page', originItemUuid: 'Item.zzz', caps: {} }
      ]
    });
    const recipes = [
      makeRecipe({ id: 'r1', name: 'Smelt Copper', category: 'smithing', recipeItemId: 'primer' }),
      makeRecipe({ id: 'r2', name: 'Forge Rivets', category: 'smithing', recipeItemId: 'primer' }),
      makeRecipe({ id: 'r3', name: 'Brew Tonic', category: 'alchemy', recipeItemId: 'codex' })
    ];
    return createAdminStore(createServices(system, recipes, capture));
  }

  it('derives recipes[] from the definition.recipeIds membership (many-to-many)', async () => {
    // Migrated shape: membership lives on the books; a recipe may belong to SEVERAL.
    const system = makeSystem({
      recipeItemDefinitions: [
        { id: 'book-a', name: 'Book A', originItemUuid: 'Item.aaa', recipeIds: ['r1', 'r2'], caps: {} },
        { id: 'book-b', name: 'Book B', originItemUuid: 'Item.bbb', recipeIds: ['r2'], caps: {} }
      ]
    });
    const recipes = [
      makeRecipe({ id: 'r1', name: 'Smelt Copper', category: 'smithing' }),
      makeRecipe({ id: 'r2', name: 'Forge Rivets', category: 'smithing' })
    ];
    const store = createAdminStore(createServices(system, recipes, []));
    await store.refresh();
    const vs = get(store.viewState);

    const bookA = recipeItemById(vs, 'book-a');
    assert.deepEqual(bookA.recipes.map((r) => r.id).sort(), ['r1', 'r2']);
    assert.equal(bookA.derivedType, 'Book'); // 2 recipes
    const bookB = recipeItemById(vs, 'book-b');
    assert.deepEqual(bookB.recipes.map((r) => r.id), ['r2']); // r2 is in BOTH books
    assert.equal(bookB.derivedType, 'Scroll'); // 1 recipe
  });

  it('setRecipeBookMembership writes only the changed definitions and skips a no-op', async () => {
    const capture = [];
    const system = makeSystem({
      recipeItemDefinitions: [
        { id: 'book-a', name: 'A', originItemUuid: 'Item.aaa', recipeIds: ['r1'], caps: {} },
        { id: 'book-b', name: 'B', originItemUuid: 'Item.bbb', recipeIds: [], caps: {} },
        { id: 'book-c', name: 'C', originItemUuid: 'Item.ccc', recipeIds: ['r1', 'r2'], caps: {} }
      ]
    });
    const store = createAdminStore(
      createServices(system, [makeRecipe({ id: 'r1' }), makeRecipe({ id: 'r2' })], capture)
    );
    await store.refresh();

    // Want r1 in B and C: remove from A, add to B, C unchanged (already a member).
    await store.setRecipeBookMembership('r1', ['book-b', 'book-c']);
    assert.deepEqual(
      capture.map((c) => c.recipeItemId).sort(),
      ['book-a', 'book-b'],
      'only the changed definitions are written (C, already a member, is skipped)'
    );
    const patchFor = (id) => capture.find((c) => c.recipeItemId === id).patch.recipeIds;
    assert.deepEqual(patchFor('book-a'), [], 'r1 removed from A');
    assert.deepEqual(patchFor('book-b'), ['r1'], 'r1 added to B');

    // Reconciling to the CURRENT membership (r1 already in A and C) writes nothing.
    capture.length = 0;
    await store.setRecipeBookMembership('r1', ['book-a', 'book-c']);
    assert.equal(capture.length, 0, 'a no-op membership change writes nothing');
  });

  it('resolves linked-item name/img/type asynchronously and passes through caps + enabled', async () => {
    const store = buildStore();
    await store.refresh();
    const vs = get(store.viewState);

    const primer = recipeItemById(vs, 'primer');
    assert.equal(primer.resolvedName, 'Journeyman Primer');
    assert.equal(primer.resolvedImg, 'resolved-primer.png');
    assert.equal(primer.derivedType, 'Book');
    assert.equal(primer.enabled, true);
    assert.equal(primer.linkMissing, false);
    assert.equal(primer.caps.item.limitUses, true);
    assert.equal(primer.caps.item.maxUses, 2);

    const codex = recipeItemById(vs, 'codex');
    assert.equal(codex.resolvedName, 'Grand Codex');
    assert.equal(codex.enabled, false);
    // codex links exactly one recipe (r3) → Scroll.
    assert.equal(codex.derivedType, 'Scroll');
  });

  it('derives the Type from the linked-recipe count (Book 2+, Scroll 1, Incomplete 0)', async () => {
    const store = buildStore();
    await store.refresh();
    const vs = get(store.viewState);

    // primer links r1 + r2 → Book; codex links r3 → Scroll; gone links nothing → Incomplete.
    assert.equal(recipeItemById(vs, 'primer').derivedType, 'Book');
    assert.equal(recipeItemById(vs, 'codex').derivedType, 'Scroll');
    assert.equal(recipeItemById(vs, 'gone').derivedType, 'Incomplete');
  });

  it('derives recipes[] via the reverse recipe.recipeItemId ref', async () => {
    const store = buildStore();
    await store.refresh();
    const vs = get(store.viewState);

    const primer = recipeItemById(vs, 'primer');
    assert.deepEqual(
      primer.recipes.map((r) => r.id).sort(),
      ['r1', 'r2']
    );
    assert.deepEqual(primer.recipes.find((r) => r.id === 'r1'), { id: 'r1', name: 'Smelt Copper', category: 'smithing' });

    const codex = recipeItemById(vs, 'codex');
    assert.deepEqual(codex.recipes.map((r) => r.id), ['r3']);

    const gone = recipeItemById(vs, 'gone');
    assert.deepEqual(gone.recipes, []);
  });

  it('publishes the async-enriched projection under a NEW selectedSystem reference so the UI re-propagates', async () => {
    // Regression: the phase-1 (synchronous, empty recipes[]) and phase-2 (async,
    // enriched) publishes must be DIFFERENT selectedSystem object references. When
    // phase-2 mutated the phase-1 object in place and re-published the same
    // reference, Svelte's `selectedSystem` $derived never re-propagated the enriched
    // recipeItemDefinitions, so the Books & Scrolls recipe counts froze on the empty
    // phase-1 projection after any refresh (e.g. switching visibility mode).
    const store = buildStore();
    const seen = [];
    const unsub = store.viewState.subscribe((vs) => {
      if (vs.selectedSystem) seen.push(vs.selectedSystem);
    });
    await store.refresh();
    unsub();

    assert.ok(seen.length >= 2, 'both the sync and async publishes fired');
    assert.equal(new Set(seen).size, seen.length, 'each selectedSystem publish is a distinct reference');
    // Sanity: the final published projection carries the enriched recipes[].
    assert.deepEqual(
      seen.at(-1).recipeItemDefinitions.find((d) => d.id === 'primer').recipes.map((r) => r.id).sort(),
      ['r1', 'r2']
    );
  });

  it('counts distinct world actors that learned any linked recipe', async () => {
    const store = buildStore();
    await store.refresh();
    const vs = get(store.viewState);

    // primer links r1 + r2 → actors a1 and a2 → 2 distinct learners.
    assert.equal(recipeItemById(vs, 'primer').learnedByCount, 2);
    // codex links r3 → actor a3 → 1 learner.
    assert.equal(recipeItemById(vs, 'codex').learnedByCount, 1);
    // gone links nothing → 0.
    assert.equal(recipeItemById(vs, 'gone').learnedByCount, 0);
  });

  it('marks an unresolvable link as linkMissing and keeps the stored-name fallback', async () => {
    const store = buildStore();
    await store.refresh();
    const gone = recipeItemById(get(store.viewState), 'gone');
    assert.equal(gone.linkMissing, true);
    assert.equal(gone.resolvedName, 'Torn Page');
  });

  it('setRecipeItemEnabled persists only the enabled flag and refreshes', async () => {
    const capture = [];
    const store = buildStore(capture);
    await store.refresh();

    await store.setRecipeItemEnabled('primer', false);
    assert.deepEqual(capture.at(-1), { systemId: 'sys1', recipeItemId: 'primer', patch: { enabled: false } });
    assert.equal(recipeItemById(get(store.viewState), 'primer').enabled, false);
  });
});
