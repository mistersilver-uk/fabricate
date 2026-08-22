import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { installFoundryEnv } from './helpers/foundryEnv.js';
import { SETTING_KEYS } from '../src/config/settings.js';

// Install the minimal Foundry env (settings-backed Map) BEFORE importing the managers,
// which read game.settings at construction/reload time.
const env = installFoundryEnv();
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { Recipe } = await import('../src/models/Recipe.js');
const { REVISION_SCOPES } = await import('../src/systems/revisionTokens.js');

let idSeq = 0;
function makeRecipeData(overrides = {}) {
  return {
    id: overrides.id || `recipe-${++idSeq}`,
    name: overrides.name || 'Test Recipe',
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
    resultGroups: [{ id: 'result-group-1', results: [{ id: 'result-1', itemUuid: 'Item.result', quantity: 1 }] }],
    ...overrides,
  };
}
const recipeJSON = (overrides) => Recipe.fromJSON(makeRecipeData(overrides)).toJSON();

describe('CraftingSystemManager.reload', () => {
  beforeEach(() => env.settings.clear());

  it('rebuilds the in-memory map from the persisted setting', () => {
    env.settings.set(SETTING_KEYS.CRAFTING_SYSTEMS, [{ id: 's1', name: 'Alpha' }]);
    const mgr = new CraftingSystemManager(new RecipeManager());
    assert.equal(mgr.reload(), true, 'empty -> populated is a change');
    assert.equal(mgr.getSystem('s1')?.name, 'Alpha');
  });

  it('returns false when the persisted systems are unchanged (writing-client no-op)', () => {
    env.settings.set(SETTING_KEYS.CRAFTING_SYSTEMS, [{ id: 's1', name: 'Alpha' }]);
    const mgr = new CraftingSystemManager(new RecipeManager());
    mgr.reload();
    assert.equal(mgr.reload(), false, 'a second reload with no setting change reports no change');
  });

  it('returns true and reflects an edit made on another client', () => {
    env.settings.set(SETTING_KEYS.CRAFTING_SYSTEMS, [{ id: 's1', name: 'Alpha' }]);
    const mgr = new CraftingSystemManager(new RecipeManager());
    mgr.reload();

    // Another client's save replicates into the setting.
    env.settings.set(SETTING_KEYS.CRAFTING_SYSTEMS, [
      { id: 's1', name: 'Alpha renamed' },
      { id: 's2', name: 'Beta' },
    ]);
    assert.equal(mgr.reload(), true);
    assert.equal(mgr.getSystem('s1')?.name, 'Alpha renamed');
    assert.equal(mgr.getSystem('s2')?.name, 'Beta');
  });

  it('drops a removed system on reload, and advances only its scope', () => {
    env.settings.set(SETTING_KEYS.CRAFTING_SYSTEMS, [
      { id: 's1', name: 'Alpha' },
      { id: 's2', name: 'Beta' },
    ]);
    const mgr = new CraftingSystemManager(new RecipeManager());
    mgr.reload();
    const before = {
      s1: mgr.revision(REVISION_SCOPES.system('s1')),
      s2: mgr.revision(REVISION_SCOPES.system('s2')),
    };

    env.settings.set(SETTING_KEYS.CRAFTING_SYSTEMS, [{ id: 's1', name: 'Alpha' }]);
    assert.equal(mgr.reload(), true);

    assert.equal(mgr.getSystems().length, 1);
    assert.equal(mgr.getSystem('s2'), null);
    // The delete leg of the narrow advance. `revisionTokens` names delete among the mutations
    // that MUST advance the narrow scope, and asserting only the ids and the count leaves an
    // advance that walked changed-and-added entries alone indistinguishable from a correct one.
    assert.notEqual(
      mgr.revision(REVISION_SCOPES.system('s2')),
      before.s2,
      'a consumer still holding a cache for the deleted system must stop trusting it'
    );
    assert.equal(
      mgr.revision(REVISION_SCOPES.system('s1')),
      before.s1,
      'and the surviving system is untouched by its neighbour going away'
    );
  });
});

describe('RecipeManager.reload', () => {
  beforeEach(() => env.settings.clear());

  it('rebuilds the in-memory map and reports change / no-change', () => {
    env.settings.set(SETTING_KEYS.RECIPES, [recipeJSON({ id: 'r1', name: 'One' })]);
    const mgr = new RecipeManager();
    assert.equal(mgr.reload(), true);
    assert.equal(mgr.getRecipe('r1')?.name, 'One');
    assert.equal(mgr.reload(), false, 'no setting change -> no reported change');
  });

  it('reflects an edited/added recipe from another client', () => {
    env.settings.set(SETTING_KEYS.RECIPES, [recipeJSON({ id: 'r1', name: 'One' })]);
    const mgr = new RecipeManager();
    mgr.reload();

    env.settings.set(SETTING_KEYS.RECIPES, [
      recipeJSON({ id: 'r1', name: 'One edited' }),
      recipeJSON({ id: 'r2', name: 'Two' }),
    ]);
    assert.equal(mgr.reload(), true);
    assert.equal(mgr.getRecipe('r1')?.name, 'One edited');
    assert.ok(mgr.getRecipe('r2'), 'the newly-added recipe is present');
  });
});
