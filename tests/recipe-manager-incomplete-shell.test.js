import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

let idSeq = 0;
const settingsStore = new Map();
const notifications = [];

globalThis.foundry = {
  utils: {
    randomID: () => `rid-${++idSeq}`,
    getProperty: (obj, path) =>
      String(path || '')
        .split('.')
        .reduce((value, key) => value?.[key], obj),
  },
};

globalThis.game = {
  user: { isGM: true },
  actors: [],
  fabricate: {},
  settings: {
    get: (_namespace, key) => settingsStore.get(key),
    set: async (_namespace, key, value) => {
      settingsStore.set(key, value);
      return value;
    },
  },
};

globalThis.ui = {
  notifications: {
    info: (message) => notifications.push({ level: 'info', message }),
    warn: (message) => notifications.push({ level: 'warn', message }),
    error: (message) => notifications.push({ level: 'error', message }),
  },
};

const { Recipe, DEFAULT_RECIPE_IMAGE } = await import('../src/models/Recipe.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { CraftingEngine } = await import('../src/systems/CraftingEngine.js');
const { ResolutionModeService } = await import('../src/systems/ResolutionModeService.js');
const { createAdminStore } = await import('../src/ui/svelte/stores/adminStore.js');

function makeManager() {
  const manager = new RecipeManager();
  manager.initialized = true;
  return manager;
}

function makeCompleteRecipeData(overrides = {}) {
  return {
    id: overrides.id || `recipe-${++idSeq}`,
    name: overrides.name || 'Complete Recipe',
    craftingSystemId: overrides.craftingSystemId || 'sys-1',
    ingredientSets: [
      {
        id: 'set-1',
        ingredientGroups: [
          {
            id: 'group-1',
            name: 'Ingredients',
            options: [{ id: 'ingredient-1', itemUuid: 'Item.ingredient', quantity: 1 }],
          },
        ],
        essences: {},
      },
    ],
    resultGroups: [
      {
        id: 'result-group-1',
        results: [{ id: 'result-1', itemUuid: 'Item.result', quantity: 1 }],
      },
    ],
    ...overrides,
  };
}

// An explicit multi-step recipe whose only step is missing its ingredient set
// (it has a populated result group, so it is structurally consistent). It is a
// non-craftable shell: structurally valid, but it fails completeness.
function makeMultiStepShellData(overrides = {}) {
  return {
    id: overrides.id || `recipe-${++idSeq}`,
    name: overrides.name || 'Multi Step Shell',
    craftingSystemId: overrides.craftingSystemId || 'sys-1',
    steps: [
      {
        id: 'step-1',
        name: 'Step One',
        ingredientSets: [],
        resultGroups: [
          {
            id: 'step-result-group-1',
            results: [{ id: 'step-result-1', itemUuid: 'Item.result', quantity: 1 }],
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('RecipeManager incomplete recipe shells', () => {
  beforeEach(() => {
    notifications.length = 0;
    settingsStore.clear();
  });

  it('persists an identity-only shell with allowIncomplete and applies model defaults', async () => {
    const manager = makeManager();

    const created = await manager.createRecipe(
      { craftingSystemId: 'sys-1' },
      { allowIncomplete: true }
    );

    assert.ok(created, 'createRecipe should return the persisted shell');
    assert.equal(created.name, 'Unnamed Recipe');
    assert.equal(created.img, DEFAULT_RECIPE_IMAGE);
    assert.equal(created.ingredientSets.length, 0);
    assert.equal(created.resultGroups.length, 0);
    // The shell is actually stored, not just returned.
    assert.equal(manager.getRecipe(created.id)?.id, created.id);
  });

  it('throws when creating an incomplete shell without the allowIncomplete flag (strict default unchanged)', async () => {
    const manager = makeManager();

    await assert.rejects(
      () => manager.createRecipe({ craftingSystemId: 'sys-1' }),
      /Invalid recipe/
    );
  });

  it('still throws on a structural error (duplicate result group id) even with allowIncomplete', async () => {
    const manager = makeManager();

    await assert.rejects(
      () =>
        manager.createRecipe(
          {
            craftingSystemId: 'sys-1',
            name: 'Bad Structure',
            resultGroups: [
              { id: 'dup', results: [{ id: 'r-1', itemUuid: 'Item.a', quantity: 1 }] },
              { id: 'dup', results: [{ id: 'r-2', itemUuid: 'Item.b', quantity: 1 }] },
            ],
          },
          { allowIncomplete: true }
        ),
      /duplicate result group/
    );
  });

  it('still throws on a structural error (invalid result) even with allowIncomplete', async () => {
    const manager = makeManager();

    // A populated result group with a result missing both itemUuid and componentId
    // is a structural (integrity) error that is NOT waived by allowIncomplete.
    await assert.rejects(
      () =>
        manager.createRecipe(
          {
            craftingSystemId: 'sys-1',
            name: 'Bad Result',
            resultGroups: [{ id: 'group-1', results: [{ id: 'r-1', quantity: 1 }] }],
          },
          { allowIncomplete: true }
        ),
      /Result must have componentId or itemUuid/
    );
  });

  it('updates a shell identity with allowIncomplete while the strict default would throw', async () => {
    const manager = makeManager();
    const created = await manager.createRecipe(
      { craftingSystemId: 'sys-1' },
      { allowIncomplete: true }
    );

    const updated = await manager.updateRecipe(
      created.id,
      { name: 'Renamed Shell' },
      { allowIncomplete: true }
    );
    assert.equal(updated.name, 'Renamed Shell');

    await assert.rejects(
      () => manager.updateRecipe(created.id, { name: 'Strict Rename' }),
      /Invalid recipe update/
    );
  });

  it('CraftingEngine.craft() rejects a persisted shell with the completeness message', async () => {
    const manager = makeManager();
    const shell = await manager.createRecipe(
      { craftingSystemId: 'sys-1' },
      { allowIncomplete: true }
    );

    const engine = new CraftingEngine({});
    const craftingActor = { name: 'Crafter', items: [] };
    const result = await engine.craft(craftingActor, [craftingActor], shell);

    assert.equal(result.success, false);
    assert.match(result.message, /Invalid recipe/);
    assert.match(result.message, /at least one ingredient set/);
  });

  it('evaluateCraftability / canCraft report canCraft:false for a shell', async () => {
    const manager = makeManager();
    const shell = await manager.createRecipe(
      { craftingSystemId: 'sys-1' },
      { allowIncomplete: true }
    );

    const sourceActor = { name: 'Source', items: [] };
    assert.equal(manager.evaluateCraftability([sourceActor], shell).canCraft, false);
    assert.equal(manager.canCraft([sourceActor], shell).canCraft, false);
  });

  it('creates a shell in a default simple system (the common case) without resolution-mode blocking', async () => {
    // Resolution-mode prerequisites (progressive/tiered crafting-check config) only
    // gate non-simple systems; the everyday simple system must accept a shell.
    const manager = makeManager();
    game.fabricate.getCraftingSystemManager = () => ({
      getSystem: (id) =>
        id === 'sys-simple' ? { id: 'sys-simple', resolutionMode: 'simple' } : null,
    });

    try {
      const shell = await manager.createRecipe(
        { craftingSystemId: 'sys-simple' },
        { allowIncomplete: true }
      );
      assert.ok(shell, 'a shell must persist in a simple system');
      assert.equal(manager.getRecipe(shell.id)?.craftingSystemId, 'sys-simple');
    } finally {
      delete game.fabricate.getCraftingSystemManager;
    }
  });

  it('creates a shell in a routed-mode system; cardinality completeness is waived by allowIncomplete', async () => {
    // A brand-new shell has no ingredient sets / result groups yet — a completeness
    // gap waived by allowIncomplete. The routed modes derive their routing basis
    // from the system mode and carry no per-recipe provider, so there is no
    // provider requirement to surface.
    const manager = makeManager();
    const csm = {
      getSystem: (id) =>
        id === 'sys-routed' ? { id: 'sys-routed', resolutionMode: 'routedByCheck' } : null,
    };
    game.fabricate.getCraftingSystemManager = () => csm;
    game.fabricate.getResolutionModeService = () => new ResolutionModeService(csm);

    try {
      const shell = await manager.createRecipe(
        { craftingSystemId: 'sys-routed', enabled: false },
        { allowIncomplete: true }
      );
      assert.ok(shell, 'a shell must persist in a routed-mode system');
      assert.equal(manager.getRecipe(shell.id)?.craftingSystemId, 'sys-routed');

      // Strict create (no allowIncomplete) still surfaces a completeness gap.
      await assert.rejects(
        () => manager.createRecipe({ craftingSystemId: 'sys-routed' }),
        /ingredient set|result group/
      );
    } finally {
      delete game.fabricate.getCraftingSystemManager;
      delete game.fabricate.getResolutionModeService;
    }
  });

  it('persists an explicit multi-step shell (a step missing its ingredient set) with allowIncomplete', async () => {
    const manager = makeManager();

    const created = await manager.createRecipe(
      makeMultiStepShellData({ name: 'Multi Step Shell' }),
      { allowIncomplete: true }
    );

    assert.ok(created, 'createRecipe should return the persisted multi-step shell');
    assert.equal(created.steps.length, 1);
    assert.equal(manager.getRecipe(created.id)?.id, created.id);
  });

  it('throws on an explicit multi-step shell without allowIncomplete (strict default unchanged)', async () => {
    const manager = makeManager();

    await assert.rejects(
      () => manager.createRecipe(makeMultiStepShellData({ name: 'Strict Multi Step' })),
      /Invalid recipe/
    );
  });

  it('CraftingEngine.craft() / evaluateCraftability reject a persisted multi-step shell', async () => {
    const manager = makeManager();
    const shell = await manager.createRecipe(
      makeMultiStepShellData({ name: 'Multi Step Reject' }),
      { allowIncomplete: true }
    );

    const engine = new CraftingEngine({});
    const craftingActor = { name: 'Crafter', items: [] };
    const result = await engine.craft(craftingActor, [craftingActor], shell);
    assert.equal(result.success, false);
    assert.match(result.message, /Invalid recipe/);
    assert.match(result.message, /at least one ingredient set/);

    const sourceActor = { name: 'Source', items: [] };
    assert.equal(manager.evaluateCraftability([sourceActor], shell).canCraft, false);
  });

  it('updateRecipe persists an ingredient set with an empty group / match-less option under allowIncomplete', async () => {
    // Reproduces the ingredient-editor authoring flow: add a group, add an option,
    // before a component/tag is chosen. With allowIncomplete the draft must persist;
    // a strict update still rejects it.
    const manager = makeManager();
    const created = await manager.createRecipe(
      { craftingSystemId: 'sys-1' },
      { allowIncomplete: true }
    );
    const ingredientSets = [
      { id: 'set-1', ingredientGroups: [{ id: 'g1', name: 'Base', options: [{ quantity: 1 }] }] },
    ];

    const updated = await manager.updateRecipe(
      created.id,
      { ingredientSets },
      { allowIncomplete: true }
    );
    assert.ok(updated, 'the draft ingredient set persists');
    assert.equal(
      manager.getRecipe(created.id)?.ingredientSets?.[0]?.ingredientGroups?.[0]?.options?.length,
      1,
      'the appended option is retained'
    );

    await assert.rejects(
      () => manager.updateRecipe(created.id, { ingredientSets }),
      /Invalid recipe update/,
      'a strict update still rejects the incomplete option'
    );
  });
});

describe('Recipe validate() vs validateStructure()', () => {
  it('validate() still rejects a shell (craftability contract unchanged)', () => {
    const shell = new Recipe({ craftingSystemId: 'sys-1' });
    const result = shell.validate();
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => /at least one ingredient set/.test(e)),
      'validate() must still report the missing-ingredient-set completeness error'
    );
    assert.ok(
      result.errors.some((e) => /at least one result group/.test(e)),
      'validate() must still report the missing-result-group completeness error'
    );
  });

  it('validateStructure() is valid for a clean shell', () => {
    const shell = new Recipe({ craftingSystemId: 'sys-1' });
    const result = shell.validateStructure();
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it('validateStructure() is invalid when a structural error is present', () => {
    const recipe = new Recipe({
      craftingSystemId: 'sys-1',
      resultGroups: [
        { id: 'dup', results: [{ id: 'r-1', itemUuid: 'Item.a', quantity: 1 }] },
        { id: 'dup', results: [{ id: 'r-2', itemUuid: 'Item.b', quantity: 1 }] },
      ],
    });
    const result = recipe.validateStructure();
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => /duplicate result group/.test(e)));
  });

  it('validate() and validateStructure() agree (both valid) for a complete recipe', () => {
    const recipe = new Recipe(makeCompleteRecipeData());
    assert.equal(recipe.validate().valid, true);
    assert.equal(recipe.validateStructure().valid, true);
  });

  it('validateStructure() waives an incomplete ingredient group/option (authoring draft persists)', () => {
    // An empty group and a match-less option are in-progress authoring states: the
    // ingredient editor creates them before the GM picks a component/tag. They must
    // persist structurally so the edit is not silently dropped.
    const recipe = new Recipe({
      craftingSystemId: 'sys-1',
      ingredientSets: [
        {
          id: 'set-1',
          ingredientGroups: [
            { id: 'g-empty', name: 'Empty', options: [] },
            { id: 'g-draft', name: 'Draft', options: [{ quantity: 1 }] },
          ],
        },
      ],
      resultGroups: [{ id: 'rg-1', results: [{ id: 'res-1', itemUuid: 'Item.x', quantity: 1 }] }],
    });
    assert.equal(
      recipe.validateStructure().valid,
      true,
      'incomplete groups/options are waived structurally'
    );

    // A negative option quantity is a structural error and still fails (the model
    // coerces 0 → 1 in the constructor, so use a negative to exercise the check).
    const badQty = new Recipe({
      craftingSystemId: 'sys-1',
      ingredientSets: [{ id: 's', ingredientGroups: [{ id: 'g', options: [{ quantity: -1 }] }] }],
      resultGroups: [{ id: 'rg', results: [{ id: 'r', itemUuid: 'Item.x', quantity: 1 }] }],
    });
    const badResult = badQty.validateStructure();
    assert.equal(badResult.valid, false, 'a negative option quantity still fails structurally');
    assert.ok(badResult.errors.some((e) => /positive number/.test(e)));
  });

  it('validate() still rejects an incomplete ingredient option (completeness contract)', () => {
    const recipe = new Recipe({
      craftingSystemId: 'sys-1',
      ingredientSets: [
        { id: 'set-1', ingredientGroups: [{ id: 'g', name: 'G', options: [{ quantity: 1 }] }] },
      ],
      resultGroups: [{ id: 'rg', results: [{ id: 'r', itemUuid: 'Item.x', quantity: 1 }] }],
    });
    const result = recipe.validate();
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => /match rule or specific item UUID/.test(e)),
      'validate() reports the match-less option'
    );
  });
});

// ---------------------------------------------------------------------------
// Store path with the real RecipeManager — exercises toggleRecipeEnabled,
// duplicateRecipe, and the derived `incomplete` view-model field through the
// actual adminStore, not stubbed manager fakes.
// ---------------------------------------------------------------------------

const STORE_SYSTEM_ID = 'sys-store';

function makeStoreServices(recipeManager) {
  const systemManager = {
    getSystems: () => [
      {
        id: STORE_SYSTEM_ID,
        name: 'Store System',
        description: '',
        resolutionMode: 'simple',
        features: {},
        recipeVisibility: { listMode: 'global' },
      },
    ],
    getSystem: (id) =>
      id === STORE_SYSTEM_ID ? { id: STORE_SYSTEM_ID, name: 'Store System' } : null,
    getItems: () => [],
    getRecipeItemDefinition: () => null,
  };

  return {
    getSetting: () => '',
    setSetting: async () => {},
    getCraftingSystemManager: () => systemManager,
    getRecipeManager: () => recipeManager,
    getScriptMacros: () => [],
    getSceneOptions: () => [],
    notify: {
      info: () => {},
      warn: () => {},
      error: (message) => notifications.push({ level: 'error', message }),
    },
    confirmDialog: async () => true,
    localize: (key) => key,
    copyToClipboard: async () => {},
  };
}

function recipeViewModel(store, recipeId) {
  return get(store.viewState).recipes.find((r) => r.id === recipeId) || null;
}

describe('adminStore recipe actions on incomplete shells (real manager)', () => {
  beforeEach(() => {
    notifications.length = 0;
    settingsStore.clear();
  });

  it('toggleRecipeEnabled flips a persisted incomplete shell without throwing', async () => {
    const manager = makeManager();
    const shell = await manager.createRecipe(
      { craftingSystemId: STORE_SYSTEM_ID, enabled: true },
      { allowIncomplete: true }
    );

    const store = createAdminStore(makeStoreServices(manager));
    await store.refresh();

    let result;
    await assert.doesNotReject(async () => {
      result = await store.toggleRecipeEnabled(shell.id, false);
    });
    assert.equal(result, true, 'toggle should report success');
    assert.equal(manager.getRecipe(shell.id).enabled, false, 'enabled flag must flip on the shell');
    assert.equal(
      notifications.some((n) => n.level === 'error'),
      false,
      'toggling a shell must not surface an error notification'
    );
  });

  it('duplicateRecipe of an incomplete shell produces another persisted shell', async () => {
    const manager = makeManager();
    const shell = await manager.createRecipe(
      { craftingSystemId: STORE_SYSTEM_ID, name: 'Shell To Copy' },
      { allowIncomplete: true }
    );
    const before = manager.getRecipes({ craftingSystemId: STORE_SYSTEM_ID }).length;

    const store = createAdminStore(makeStoreServices(manager));
    await store.refresh();

    let result;
    await assert.doesNotReject(async () => {
      result = await store.duplicateRecipe(shell.id);
    });
    assert.equal(result, true, 'duplicate should report success');

    const recipes = manager.getRecipes({ craftingSystemId: STORE_SYSTEM_ID });
    assert.equal(recipes.length, before + 1, 'duplicate must persist a new recipe');
    const copy = recipes.find((r) => r.id !== shell.id);
    assert.match(copy.name, /\(Copy\)$/);
    assert.equal(copy.validate().valid, false, 'the duplicate is still a non-craftable shell');
    assert.equal(copy.validateStructure().valid, true, 'the duplicate is structurally sound');
  });

  it('duplicateRecipe of a COMPLETE recipe still duplicates and persists', async () => {
    const manager = makeManager();
    const complete = await manager.createRecipe(
      makeCompleteRecipeData({ id: undefined, craftingSystemId: STORE_SYSTEM_ID, name: 'Done' })
    );
    const before = manager.getRecipes({ craftingSystemId: STORE_SYSTEM_ID }).length;

    const store = createAdminStore(makeStoreServices(manager));
    await store.refresh();

    const result = await store.duplicateRecipe(complete.id);
    assert.equal(result, true);

    const recipes = manager.getRecipes({ craftingSystemId: STORE_SYSTEM_ID });
    assert.equal(recipes.length, before + 1);
    const copy = recipes.find((r) => r.id !== complete.id);
    assert.equal(
      copy.validate().valid,
      true,
      'a complete recipe duplicates into a complete recipe'
    );
  });
});

describe('adminStore derived `incomplete` view-model field (real manager)', () => {
  beforeEach(() => {
    notifications.length = 0;
    settingsStore.clear();
  });

  async function buildListFor(recipeDataList) {
    const manager = makeManager();
    const created = [];
    for (const data of recipeDataList) {
      created.push(
        await manager.createRecipe(
          { ...data, craftingSystemId: STORE_SYSTEM_ID },
          { allowIncomplete: true }
        )
      );
    }
    const store = createAdminStore(makeStoreServices(manager));
    await store.refresh();
    return { store, created };
  }

  it('flags an implicit shell with no ingredient sets as incomplete', async () => {
    const { store, created } = await buildListFor([{ name: 'No Sets' }]);
    assert.equal(recipeViewModel(store, created[0].id).incomplete, true);
  });

  it('flags an implicit shell that has ingredient sets but no result groups as incomplete', async () => {
    const { store, created } = await buildListFor([
      {
        name: 'No Result Groups',
        ingredientSets: [
          {
            id: 'set-1',
            ingredientGroups: [
              {
                id: 'group-1',
                name: 'Ingredients',
                options: [{ id: 'ing-1', itemUuid: 'Item.ingredient', quantity: 1 }],
              },
            ],
            essences: {},
          },
        ],
      },
    ]);
    assert.equal(recipeViewModel(store, created[0].id).incomplete, true);
  });

  it('flags an ingredient set with no groups or essences as incomplete (count-only would miss it)', async () => {
    const { store, created } = await buildListFor([
      {
        name: 'Empty Ingredient Set',
        ingredientSets: [{ id: 'set-1', ingredientGroups: [], essences: {} }],
        resultGroups: [
          {
            id: 'result-group-1',
            results: [{ id: 'result-1', itemUuid: 'Item.result', quantity: 1 }],
          },
        ],
      },
    ]);
    const vm = recipeViewModel(store, created[0].id);
    assert.equal(
      vm.incomplete,
      true,
      'a set with no groups/essences is not craftable and must be flagged'
    );
  });

  it('flags a multi-step recipe with a step missing its ingredient set as incomplete', async () => {
    const { store, created } = await buildListFor([makeMultiStepShellData({ id: undefined })]);
    assert.equal(recipeViewModel(store, created[0].id).incomplete, true);
  });

  it('does NOT flag a complete implicit recipe', async () => {
    const { store, created } = await buildListFor([
      makeCompleteRecipeData({ id: undefined, name: 'Complete Implicit' }),
    ]);
    assert.equal(recipeViewModel(store, created[0].id).incomplete, false);
  });

  it('does NOT flag a complete multi-step recipe', async () => {
    const { store, created } = await buildListFor([
      {
        name: 'Complete Multi Step',
        steps: [
          {
            id: 'step-1',
            name: 'Step One',
            ingredientSets: [
              {
                id: 'set-1',
                ingredientGroups: [
                  {
                    id: 'group-1',
                    name: 'Ingredients',
                    options: [{ id: 'ing-1', itemUuid: 'Item.ingredient', quantity: 1 }],
                  },
                ],
                essences: {},
              },
            ],
            resultGroups: [
              {
                id: 'step-result-group-1',
                results: [{ id: 'step-result-1', itemUuid: 'Item.result', quantity: 1 }],
              },
            ],
          },
        ],
      },
    ]);
    assert.equal(recipeViewModel(store, created[0].id).incomplete, false);
  });
});

describe('Recipe complexity flag', () => {
  it('derives complex=true when a recipe has more than one ingredient set', () => {
    const recipe = new Recipe(
      makeCompleteRecipeData({
        ingredientSets: [
          { id: 'set-a', ingredientGroups: [], essences: {} },
          { id: 'set-b', ingredientGroups: [], essences: {} },
        ],
      })
    );
    assert.equal(recipe.complex, true);
  });

  it('derives complex=true when a recipe has more than one result group', () => {
    const recipe = new Recipe(
      makeCompleteRecipeData({
        resultGroups: [
          { id: 'rg-a', results: [{ id: 'r-a', itemUuid: 'Item.a', quantity: 1 }] },
          { id: 'rg-b', results: [{ id: 'r-b', itemUuid: 'Item.b', quantity: 1 }] },
        ],
      })
    );
    assert.equal(recipe.complex, true);
  });

  it('derives complex=true when any step holds more than one ingredient set', () => {
    const recipe = new Recipe({
      id: `recipe-${++idSeq}`,
      name: 'Stepped',
      steps: [
        {
          id: 'step-1',
          name: 'Step One',
          ingredientSets: [
            { id: 'set-a', ingredientGroups: [], essences: {} },
            { id: 'set-b', ingredientGroups: [], essences: {} },
          ],
          resultGroups: [{ id: 'rg', results: [] }],
        },
      ],
    });
    assert.equal(recipe.complex, true);
  });

  it('derives complex=false for a single-set, single-result recipe', () => {
    const recipe = new Recipe(makeCompleteRecipeData());
    assert.equal(recipe.complex, false);
  });

  it('honors an explicit complex flag over the derived default', () => {
    const forcedSimple = new Recipe(
      makeCompleteRecipeData({
        complex: false,
        ingredientSets: [
          { id: 'set-a', ingredientGroups: [], essences: {} },
          { id: 'set-b', ingredientGroups: [], essences: {} },
        ],
      })
    );
    assert.equal(forcedSimple.complex, false);

    const forcedComplex = new Recipe(makeCompleteRecipeData({ complex: true }));
    assert.equal(forcedComplex.complex, true);
  });

  it('round-trips complex through toJSON/fromJSON', () => {
    const recipe = new Recipe(makeCompleteRecipeData({ complex: true }));
    const json = recipe.toJSON();
    assert.equal(json.complex, true);
    const restored = Recipe.fromJSON(json);
    assert.equal(restored.complex, true);
  });
});
