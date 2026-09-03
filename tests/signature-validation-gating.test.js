/**
 * Regression: RecipeManager only enforces ingredient-signature uniqueness for
 * alchemy-mode systems.
 *
 * Signatures exist so the engine can *infer* which recipe a player is crafting
 * from the submitted ingredients (CraftingEngine._matchAlchemySignature, gated
 * on resolutionMode === 'alchemy'). In every selected-recipe mode the player
 * picks the recipe, so overlapping base materials — iron+wood → axe OR spear OR
 * shield — are never ambiguous and must not be rejected.
 *
 * Reproduces the Mythwright 0.5.x update failure: a routed system whose recipes
 * share base materials had 98/105 recipes rejected with "Overlapping signatures"
 * on update, because every already-persisted recipe collided with its peers.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let idSeq = 0;
const settingsStore = new Map();

let resolutionMode = 'routed';
const components = [
  { id: 'comp-a', name: 'comp-a', tags: [] },
  { id: 'comp-b', name: 'comp-b', tags: [] },
];

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
  fabricate: {
    getCraftingSystemManager: () => ({
      getSystem: (id) => (id === 'sys-1' ? { id, resolutionMode, components } : null),
    }),
  },
  settings: {
    get: (_namespace, key) => settingsStore.get(key),
    set: async (_namespace, key, value) => {
      settingsStore.set(key, value);
      return value;
    },
  },
};

globalThis.ui = {
  notifications: { info() {}, warn() {}, error() {} },
};

const { Recipe } = await import('../src/models/Recipe.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');

// Two recipes that both require the same single component → overlapping
// signatures. In selected-recipe modes this is legal; in alchemy it is not.
function makeRecipeData(id, name) {
  return {
    id,
    name,
    craftingSystemId: 'sys-1',
    ingredientSets: [
      {
        id: `${id}-set`,
        ingredientGroups: [
          { id: `${id}-grp`, name: 'Ingredients', options: [{ componentId: 'comp-a', quantity: 1 }] },
        ],
        essences: {},
      },
    ],
    resultGroups: [{ id: `${id}-rg`, results: [{ id: `${id}-r`, itemUuid: 'Item.result', quantity: 1 }] }],
  };
}

// One stored, ENABLED recipe — the cohort a not-yet-stored candidate is scanned against
// (issue 1167). Deliberately a single recipe, so the corpus is collision-free until the
// candidate joins it and any conflict reported is the one the candidate introduces.
function seedManagerWithOneEnabledRecipe() {
  const manager = new RecipeManager();
  manager.initialized = true;
  manager.recipes.set('r-a', new Recipe(makeRecipeData('r-a', 'Forge a Spear')));
  return manager;
}

function seedManagerWithCollidingRecipes() {
  const manager = new RecipeManager();
  manager.initialized = true;
  // Pre-persist both colliding recipes (mirrors the update flow, where every
  // recipe already exists before re-import re-validates it).
  manager.recipes.set('r-a', new Recipe(makeRecipeData('r-a', 'Forge a Spear')));
  manager.recipes.set('r-b', new Recipe(makeRecipeData('r-b', 'Forge an Axe')));
  return manager;
}

describe('RecipeManager signature validation gating', () => {
  beforeEach(() => {
    settingsStore.clear();
  });

  it('persists a conflicting recipe update in alchemy mode (signatures no longer block persistence)', async () => {
    resolutionMode = 'alchemy';
    const manager = seedManagerWithCollidingRecipes();

    // A plain edit (no enable transition) must persist even though the signature conflicts — the
    // conflict only blocks activation, not persistence.
    const updated = await manager.updateRecipe('r-b', { name: 'Forge an Axe (edited)' });
    assert.equal(updated.name, 'Forge an Axe (edited)');
  });

  it('rejects enabling a recipe with a conflicting signature in alchemy mode', async () => {
    resolutionMode = 'alchemy';
    const manager = seedManagerWithCollidingRecipes();
    // r-b starts disabled so the next update is an explicit enable transition.
    manager.recipes.get('r-b').enabled = false;

    await assert.rejects(
      () => manager.updateRecipe('r-b', { enabled: true }),
      /Cannot enable.*Overlapping signatures/,
      'Alchemy systems must reject activating an ambiguous recipe'
    );
  });

  it('allows overlapping signatures in routed (selected-recipe) mode', async () => {
    resolutionMode = 'routed';
    const manager = seedManagerWithCollidingRecipes();

    const updated = await manager.updateRecipe('r-b', { name: 'Forge an Axe (edited)' });
    assert.equal(updated.name, 'Forge an Axe (edited)');
  });

  it('allows overlapping signatures in simple mode', async () => {
    resolutionMode = 'simple';
    const manager = seedManagerWithCollidingRecipes();

    const updated = await manager.updateRecipe('r-b', { name: 'Forge an Axe (simple)' });
    assert.equal(updated.name, 'Forge an Axe (simple)');
  });

  it('reports a stored, uncontested alchemy recipe as activatable (the candidate is never double-counted)', () => {
    resolutionMode = 'alchemy';
    const manager = seedManagerWithOneEnabledRecipe();

    const result = manager.canActivateRecipe('r-a');
    assert.ok(result.valid, `an uncontested recipe must stay activatable: ${result.errors.join(', ')}`);
  });

  it('reports a stored recipe colliding with an enabled peer as not activatable', () => {
    resolutionMode = 'alchemy';
    const manager = seedManagerWithCollidingRecipes();

    const result = manager.canActivateRecipe('r-b');
    assert.ok(!result.valid, 'a recipe colliding with an enabled peer must not be activatable');
    assert.ok(
      result.errors.some((error) => /Overlapping signatures/.test(error)),
      `expected an overlapping-signature error, got: ${result.errors.join(', ')}`
    );
  });
});

/**
 * Issue 1167: the collision gate must see the CANDIDATE, not only the stored corpus.
 *
 * `createRecipe` and `importRecipes` both run the activation gate BEFORE the recipe
 * reaches `this.recipes`, so a cohort built purely by substituting the candidate for its
 * stored copy matched nothing, `validateSystem` never scanned the candidate, and no
 * conflict could name its id — the gate passed unconditionally on exactly the two paths
 * that introduce a first-time collision.
 */
describe('RecipeManager signature gating for a not-yet-stored candidate', () => {
  beforeEach(() => {
    settingsStore.clear();
  });

  it('refuses createRecipe for an enabled alchemy recipe colliding with a stored enabled recipe', async () => {
    resolutionMode = 'alchemy';
    const manager = seedManagerWithOneEnabledRecipe();

    await assert.rejects(
      () => manager.createRecipe(makeRecipeData('r-c', 'Forge a Pike')),
      /Cannot enable recipe "Forge a Pike".*Overlapping signatures/,
      'a create that introduces an alchemy signature collision must be refused'
    );
    assert.ok(!manager.recipes.has('r-c'), 'the refused recipe must not be stored');
  });

  it('births a colliding allowIncomplete create disabled rather than refusing it', async () => {
    resolutionMode = 'alchemy';
    const manager = seedManagerWithOneEnabledRecipe();

    const created = await manager.createRecipe(makeRecipeData('r-c', 'Forge a Pike'), {
      allowIncomplete: true,
    });

    assert.equal(created.enabled, false, 'a drafting create must be born disabled, not refused');
    assert.equal(
      manager.recipes.get('r-c')?.enabled,
      false,
      'the stored draft must carry the disabled state'
    );
  });

  it('admits a create whose only collision partner is disabled', async () => {
    resolutionMode = 'alchemy';
    const manager = seedManagerWithOneEnabledRecipe();
    manager.recipes.get('r-a').enabled = false;

    const created = await manager.createRecipe(makeRecipeData('r-c', 'Forge a Pike'));

    assert.equal(created.enabled, true, 'only ENABLED recipes contest a signature');
  });

  it('creates a colliding recipe unchanged in routed (selected-recipe) mode', async () => {
    resolutionMode = 'routed';
    const manager = seedManagerWithOneEnabledRecipe();

    const created = await manager.createRecipe(makeRecipeData('r-c', 'Forge a Pike'));

    assert.equal(created.enabled, true, 'non-alchemy systems must short-circuit the gate');
    assert.ok(manager.recipes.has('r-c'), 'the recipe must be stored');
  });

  it('skips and reports a colliding recipe on import instead of importing it', async () => {
    resolutionMode = 'alchemy';
    const manager = seedManagerWithOneEnabledRecipe();

    const result = await manager.importRecipes([makeRecipeData('r-c', 'Forge a Pike')]);

    assert.equal(result.imported, 0, 'a colliding recipe must not be imported');
    assert.equal(result.skipped, 1);
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflicts[0].recipeId, 'r-c');
    assert.equal(result.conflicts[0].reason, 'signature-conflict');
    assert.ok(
      (result.conflicts[0].errors || []).some((error) => /Overlapping signatures/.test(error)),
      `expected an overlapping-signature error, got: ${(result.conflicts[0].errors || []).join(', ')}`
    );
    assert.ok(!manager.recipes.has('r-c'), 'the skipped recipe must not be stored');
  });

  it('imports the non-colliding recipes of a batch alongside the skipped one', async () => {
    resolutionMode = 'alchemy';
    const manager = seedManagerWithOneEnabledRecipe();
    const distinct = makeRecipeData('r-d', 'Forge a Shield');
    distinct.ingredientSets[0].ingredientGroups[0].options = [{ componentId: 'comp-b', quantity: 1 }];

    const result = await manager.importRecipes([makeRecipeData('r-c', 'Forge a Pike'), distinct]);

    assert.equal(result.imported, 1, 'a collision must not abort the rest of the batch');
    assert.equal(result.skipped, 1);
    assert.ok(manager.recipes.has('r-d'));
  });

  it('imports the first of two recipes that collide only with EACH OTHER, and skips the second', async () => {
    resolutionMode = 'alchemy';
    const manager = new RecipeManager();
    manager.initialized = true;

    // Neither recipe exists yet, so each is evaluated against a cohort the import loop is
    // itself building — which only works if the cohort read is fresh once the first
    // recipe lands in the map.
    const result = await manager.importRecipes([
      makeRecipeData('r-c', 'Forge a Pike'),
      makeRecipeData('r-d', 'Forge a Halberd'),
    ]);

    assert.equal(result.imported, 1, 'the first recipe of a mutually colliding pair imports');
    assert.equal(result.skipped, 1, 'the second is skipped against the first');
    assert.equal(result.conflicts[0].recipeId, 'r-d');
    assert.equal(result.conflicts[0].reason, 'signature-conflict');
  });

  it('imports a colliding recipe unchanged in simple mode', async () => {
    resolutionMode = 'simple';
    const manager = seedManagerWithOneEnabledRecipe();

    const result = await manager.importRecipes([makeRecipeData('r-c', 'Forge a Pike')]);

    assert.equal(result.imported, 1, 'non-alchemy systems must short-circuit the gate');
    assert.equal(result.conflicts.length, 0);
  });

  it('reports a structurally invalid recipe as invalid, not as a signature conflict', async () => {
    resolutionMode = 'alchemy';
    const manager = seedManagerWithOneEnabledRecipe();
    const broken = makeRecipeData('r-e', 'Forge Nothing');
    broken.resultGroups = [];

    const result = await manager.importRecipes([broken]);

    assert.equal(result.skipped, 1);
    assert.equal(result.conflicts[0].reason, 'invalid');
  });
});
