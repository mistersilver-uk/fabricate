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
        { id: 'primer', name: 'Primer', img: 'primer.png', sourceItemUuid: 'Item.aaa', enabled: true, caps: { item: { limitUses: true, maxUses: 2 }, learn: { limitLearning: false } } },
        { id: 'codex', name: '', img: '', sourceItemUuid: 'Item.bbb', enabled: false, caps: {} },
        { id: 'gone', name: 'Torn Page', sourceItemUuid: 'Item.zzz', caps: {} }
      ]
    });
    const recipes = [
      makeRecipe({ id: 'r1', name: 'Smelt Copper', category: 'smithing', recipeItemId: 'primer' }),
      makeRecipe({ id: 'r2', name: 'Forge Rivets', category: 'smithing', recipeItemId: 'primer' }),
      makeRecipe({ id: 'r3', name: 'Brew Tonic', category: 'alchemy', recipeItemId: 'codex' })
    ];
    return createAdminStore(createServices(system, recipes, capture));
  }

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
    // Name "Grand Codex" infers a Tome.
    assert.equal(codex.derivedType, 'Tome');
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
