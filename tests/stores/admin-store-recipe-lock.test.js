/**
 * The Recipe Studio's two store-side additions (issue 643):
 *
 *   - `toggleRecipeLocked(recipeId, locked)` — persists BOTH directions and is
 *     NEVER gated, in explicit contrast to `toggleRecipeEnabled`. `locked` was
 *     persisted and engine-honoured but had no UI write path at all.
 *   - `toggleRecipeEnabled`'s blocked-enable SUPPRESSION invariant: when the
 *     caller owns the message (the library's in-window flash), the Foundry
 *     notification must NOT also fire, or the GM sees the same error twice.
 *   - the `checkSummary` projection (§9): the row cannot resolve a DC itself.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

const { createAdminStore } = await import('../../src/ui/svelte/stores/adminStore.js');

function makeRecipe(overrides = {}) {
  const id = overrides.id || 'r1';
  const json = {
    id,
    name: overrides.name || 'Recipe',
    craftingSystemId: 'sys1',
    checkTierId: overrides.checkTierId ?? null,
  };
  return {
    id,
    name: overrides.name || 'Recipe',
    description: '',
    img: 'recipe.png',
    category: 'general',
    enabled: overrides.enabled !== false,
    locked: overrides.locked === true,
    checkTierId: overrides.checkTierId ?? null,
    craftingSystemId: 'sys1',
    ingredientSets: [],
    resultGroups: [],
    isSimpleRecipe: () => true,
    toJSON: () => json,
    ...overrides,
  };
}

function createServices({ recipes, system = {}, updateRecipe, notify }) {
  const systems = [
    {
      id: 'sys1',
      name: 'System One',
      description: '',
      resolutionMode: 'simple',
      features: {},
      categories: [],
      itemTags: [],
      essenceDefinitions: [],
      items: [],
      requirements: { time: { enabled: false }, currency: { enabled: false, units: [] } },
      craftingCheck: {},
      recipeVisibility: { listMode: 'global' },
      recipeItemDefinitions: [],
      ...system,
    },
  ];
  return {
    getSetting: (key) => (key === 'lastManagedCraftingSystem' ? 'sys1' : ''),
    setSetting: async () => {},
    getCraftingSystemManager: () => ({
      getSystems: () => systems,
      getSystem: (id) => systems.find((s) => s.id === id) || null,
      getItems: () => [],
    }),
    getRecipeManager: () => ({
      getRecipes: () => recipes,
      getRecipe: (id) => recipes.find((r) => r.id === id) || null,
      updateRecipe,
    }),
    getScriptMacros: () => [],
    getSceneOptions: () => [],
    getWorldUsers: () => [],
    localize: (key) => key,
    notify: notify || { info: () => {}, warn: () => {}, error: () => {} },
  };
}

function rowFor(store, id) {
  return (get(store.viewState).recipes || []).find((recipe) => recipe.id === id);
}

// A crafting check is only USABLE when it has an authored roll formula.
const USABLE_SIMPLE_CHECK = { rollFormula: '1d20 + @abilities.int.mod', dc: 15 };

describe('adminStore toggleRecipeLocked', () => {
  it('persists locking AND unlocking', async () => {
    const writes = [];
    const recipes = [makeRecipe({ id: 'r1' })];
    const store = createAdminStore(
      createServices({
        recipes,
        updateRecipe: async (id, updates, options) => {
          writes.push({ id, updates, options });
        },
      })
    );
    await store.refresh();

    assert.equal(await store.toggleRecipeLocked('r1', true), true);
    assert.equal(await store.toggleRecipeLocked('r1', false), true);

    assert.deepEqual(
      writes.map((write) => write.updates),
      [{ locked: true }, { locked: false }]
    );
    assert.deepEqual(
      writes.map((write) => write.id),
      ['r1', 'r1']
    );
  });

  it('is NEVER gated — an incomplete recipe still locks (the contrast with enable)', async () => {
    const writes = [];
    const notified = [];
    // The same recipe manager that REFUSES to enable an incomplete recipe.
    const recipes = [makeRecipe({ id: 'r1', enabled: false })];
    const store = createAdminStore(
      createServices({
        recipes,
        notify: { info: () => {}, warn: () => {}, error: (message) => notified.push(message) },
        updateRecipe: async (id, updates, options) => {
          if (updates.enabled === true) throw new Error('recipe is incomplete');
          writes.push({ id, updates, options });
        },
      })
    );
    await store.refresh();

    assert.equal(await store.toggleRecipeEnabled('r1', true), false, 'enable is gated');
    assert.equal(await store.toggleRecipeLocked('r1', true), true, 'lock is not');

    assert.deepEqual(writes, [
      { id: 'r1', updates: { locked: true }, options: { allowIncomplete: true, notify: false } },
    ]);
    assert.equal(notified.length, 1, 'only the refused enable notified');
  });

  it('coerces the locked flag to a real boolean', async () => {
    const writes = [];
    const store = createAdminStore(
      createServices({
        recipes: [makeRecipe({ id: 'r1' })],
        updateRecipe: async (id, updates) => writes.push(updates),
      })
    );
    await store.refresh();
    await store.toggleRecipeLocked('r1', 'yes');
    assert.deepEqual(writes, [{ locked: false }]);
  });
});

describe('adminStore toggleRecipeEnabled blocked-enable suppression', () => {
  function blockedStore(notified) {
    return createAdminStore(
      createServices({
        recipes: [makeRecipe({ id: 'r1', enabled: false })],
        notify: { info: () => {}, warn: () => {}, error: (message) => notified.push(message) },
        updateRecipe: async () => {
          throw new Error('recipe is incomplete');
        },
      })
    );
  }

  it('notifies through Foundry when no in-window flash owns the message', async () => {
    const notified = [];
    const store = blockedStore(notified);
    await store.refresh();

    assert.equal(await store.toggleRecipeEnabled('r1', true), false);
    assert.deepEqual(notified, ['recipe is incomplete']);
  });

  it('SUPPRESSES the Foundry notification when onBlocked owns the message', async () => {
    const notified = [];
    const flashed = [];
    const store = blockedStore(notified);
    await store.refresh();

    assert.equal(
      await store.toggleRecipeEnabled('r1', true, { onBlocked: (message) => flashed.push(message) }),
      false
    );

    assert.deepEqual(flashed, ['recipe is incomplete'], 'the flash receives the localized reason');
    assert.deepEqual(notified, [], 'the same error must not also fire as a Foundry notification');
  });
});

describe('adminStore recipe check-pill projection', () => {
  async function projectWith(system, recipeOverrides = {}) {
    const store = createAdminStore(
      createServices({
        recipes: [makeRecipe({ id: 'r1', ...recipeOverrides })],
        system,
        updateRecipe: async () => {},
      })
    );
    await store.refresh();
    return rowFor(store, 'r1');
  }

  it('shows no check when the system check has no authored roll formula', async () => {
    // "Checks enabled" is NOT the same as usable — an unusable check has no DC.
    const row = await projectWith({
      resolutionMode: 'simple',
      features: { craftingChecks: true },
      craftingCheck: { simple: { dc: 18 } },
    });
    assert.deepEqual(row.checkSummary, { kind: 'none', dc: null });
  });

  it('resolves the static default DC of a usable simple check', async () => {
    const row = await projectWith({
      resolutionMode: 'simple',
      craftingCheck: { simple: { ...USABLE_SIMPLE_CHECK, dc: 18 } },
    });
    assert.deepEqual(row.checkSummary, { kind: 'dc', dc: 18 });
  });

  it("resolves the recipe's selected check tier over the default DC", async () => {
    const row = await projectWith(
      {
        resolutionMode: 'simple',
        craftingCheck: {
          simple: {
            ...USABLE_SIMPLE_CHECK,
            dc: 12,
            tiers: [
              { id: 't-easy', name: 'Easy', dc: 10 },
              { id: 't-hard', name: 'Hard', dc: 22 },
            ],
          },
        },
      },
      { checkTierId: 't-hard' }
    );
    assert.deepEqual(row.checkSummary, { kind: 'dc', dc: 22 });
  });

  it('resolves a routedByCheck system against the routed check slot', async () => {
    const row = await projectWith({
      resolutionMode: 'routedByCheck',
      craftingCheck: { simple: { rollFormula: '1d20', dc: 5 }, routed: { rollFormula: '1d20', dc: 17 } },
    });
    assert.deepEqual(row.checkSummary, { kind: 'dc', dc: 17 });
  });

  it('reports a dynamic DC rather than inventing a number', async () => {
    const row = await projectWith({
      resolutionMode: 'simple',
      craftingCheck: { simple: { ...USABLE_SIMPLE_CHECK, dcMode: 'dynamic', macroUuid: 'Macro.x' } },
    });
    assert.deepEqual(row.checkSummary, { kind: 'dynamic', dc: null });
  });

  it('reports progressive as its own kind', async () => {
    const row = await projectWith({
      resolutionMode: 'progressive',
      craftingCheck: { progressive: { rollFormula: '1d20' } },
    });
    assert.deepEqual(row.checkSummary, { kind: 'progressive', dc: null });
  });

  // The two check-LESS kinds are not the same fact and the row must not tell the GM they
  // are. A routedByIngredients craft resolves off the ingredient set that was used, so no
  // check is a WORKING configuration — reported neutrally as `ingredients`. Every other
  // mode with no usable check genuinely cannot be rolled for, and stays the `none` warning
  // the GM can scan a library for.
  it('reports a check-less routedByIngredients system as routed, not as a warning', async () => {
    const row = await projectWith({
      resolutionMode: 'routedByIngredients',
      craftingCheck: { simple: { dc: 12 } },
    });
    assert.deepEqual(row.checkSummary, { kind: 'ingredients', dc: null });
  });

  it('still resolves the DC of a routedByIngredients system that DOES have a usable check', async () => {
    // The routed-by-ingredients pass/fail gate shares the `simple` check slot, so a usable
    // one there is a real DC and must not be flattened into "By ingredients".
    const row = await projectWith({
      resolutionMode: 'routedByIngredients',
      craftingCheck: { simple: { ...USABLE_SIMPLE_CHECK, dc: 14 } },
    });
    assert.deepEqual(row.checkSummary, { kind: 'dc', dc: 14 });
  });

  it('shows no check for an alchemy system whose alchemy check mode is none', async () => {
    const row = await projectWith({
      resolutionMode: 'alchemy',
      alchemy: { checkMode: 'none' },
      craftingCheck: { simple: USABLE_SIMPLE_CHECK },
    });
    assert.deepEqual(row.checkSummary, { kind: 'none', dc: null });
  });
});

describe('adminStore recipe I/O projection', () => {
  it('projects the result ITEM count alongside the result GROUP count', async () => {
    // "N out" is only meaningful in simple/progressive; tier- and set-keyed modes
    // render the group count, so the row needs BOTH numbers (issue 643 §9).
    const recipe = makeRecipe({
      id: 'r1',
      ingredientSets: [{ id: 's1', ingredients: [{ id: 'i1' }, { id: 'i2' }], groups: [] }],
      resultGroups: [
        { id: 'g1', results: [{ id: 'x1' }, { id: 'x2' }] },
        { id: 'g2', results: [{ id: 'x3' }] },
      ],
    });
    const store = createAdminStore(createServices({ recipes: [recipe], updateRecipe: async () => {} }));
    await store.refresh();

    const row = rowFor(store, 'r1');
    assert.equal(row.resultGroupCount, 2);
    assert.equal(row.resultItemCount, 3);
    assert.equal(row.ingredientCount, 2);
  });
});

// The recipe-list projection is a hand-built ALLOWLIST: a field it omits is invisible
// to the editor, which then seeds its draft from `undefined`. For a default-true flag
// that failure is SILENT and inverted — the toggle card reads default-true and renders
// ON for a recipe the GM had explicitly authored OFF, and saving that draft writes the
// wrong value back. Only a `false` fixture can catch it (issue 651).
describe('adminStore recipe projection — allowPlayerResultReorder', () => {
  it('projects an authored FALSE (the mutation: drop it from the projection)', async () => {
    const store = createAdminStore(
      createServices({
        recipes: [makeRecipe({ id: 'r1', allowPlayerResultReorder: false })],
        updateRecipe: async () => {},
      })
    );
    await store.refresh();

    assert.equal(rowFor(store, 'r1').allowPlayerResultReorder, false);
  });

  it('defaults an absent flag to true, matching the model constructor', async () => {
    const store = createAdminStore(
      createServices({
        recipes: [makeRecipe({ id: 'r1' })],
        updateRecipe: async () => {},
      })
    );
    await store.refresh();

    assert.equal(rowFor(store, 'r1').allowPlayerResultReorder, true);
  });
});
