/**
 * The recipe validity contract: a recipe may be persisted while invalid/incomplete, but may only be
 * activated (enabled === true) when fully valid. Plus RecipeManager.disableSignatureConflicts, which
 * reconciles alchemy systems after a deletion by disabling every recipe in a signature conflict.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { installFoundryEnv } from './helpers/foundryEnv.js';

let resolutionMode = 'alchemy';
const components = [
  { id: 'comp-a', name: 'comp-a', tags: [] },
  { id: 'comp-b', name: 'comp-b', tags: [] },
];

const { settings: settingsStore } = installFoundryEnv({
  craftingSystemManager: {
    getSystem: (id) => (id === 'sys-1' ? { id, resolutionMode, components } : null),
  },
});

const { Recipe } = await import('../src/models/Recipe.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');

function completeRecipe(id, name, componentId, extra = {}) {
  return {
    id,
    name,
    craftingSystemId: 'sys-1',
    ingredientSets: [
      {
        id: `${id}-set`,
        ingredientGroups: [
          {
            id: `${id}-grp`,
            name: 'Ingredients',
            options: [{ componentId, quantity: 1 }],
          },
        ],
        essences: {},
      },
    ],
    resultGroups: [
      { id: `${id}-rg`, results: [{ id: `${id}-r`, itemUuid: 'Item.result', quantity: 1 }] },
    ],
    ...extra,
  };
}

function makeManager() {
  const manager = new RecipeManager();
  manager.initialized = true;
  return manager;
}

describe('recipe activation gate', () => {
  beforeEach(() => {
    settingsStore.clear();
    resolutionMode = 'alchemy';
  });

  it('persists an incomplete shell as disabled instead of throwing (drafting create)', async () => {
    const manager = makeManager();
    const shell = await manager.createRecipe(
      { craftingSystemId: 'sys-1', name: 'Draft' },
      { allowIncomplete: true }
    );
    assert.equal(shell.enabled, false, 'an invalid draft is born disabled');
  });

  it('creates a complete, non-conflicting recipe enabled', async () => {
    const manager = makeManager();
    const created = await manager.createRecipe(
      completeRecipe('r-a', 'A', 'comp-a', { enabled: true })
    );
    assert.equal(created.enabled, true);
  });

  it('allows enabling a complete, non-conflicting recipe', async () => {
    const manager = makeManager();
    manager.recipes.set('r-c', new Recipe(completeRecipe('r-c', 'C', 'comp-b', { enabled: false })));

    const updated = await manager.updateRecipe('r-c', { enabled: true });
    assert.equal(updated.enabled, true);
  });

  it('rejects enabling an incomplete recipe', async () => {
    const manager = makeManager();
    const shell = await manager.createRecipe(
      { craftingSystemId: 'sys-1', name: 'Draft' },
      { allowIncomplete: true }
    );

    // The real enable path (adminStore.toggleRecipeEnabled) passes allowIncomplete, so persistence
    // waives completeness and the activation gate is what rejects the enable.
    await assert.rejects(
      () => manager.updateRecipe(shell.id, { enabled: true }, { allowIncomplete: true }),
      /Cannot enable.*at least one ingredient set/
    );
  });

  it('persists a conflicting edit without an enable transition', async () => {
    const manager = makeManager();
    manager.recipes.set('r-a', new Recipe(completeRecipe('r-a', 'A', 'comp-a')));
    manager.recipes.set('r-b', new Recipe(completeRecipe('r-b', 'B', 'comp-a')));

    const updated = await manager.updateRecipe('r-b', { name: 'B edited' });
    assert.equal(updated.name, 'B edited');
  });
});

describe('RecipeManager.disableSignatureConflicts', () => {
  beforeEach(() => {
    settingsStore.clear();
    resolutionMode = 'alchemy';
  });

  it('disables every enabled recipe in a conflict and leaves distinct recipes enabled', async () => {
    const manager = makeManager();
    manager.save = async () => {};
    manager.recipes.set('r-a', new Recipe(completeRecipe('r-a', 'Forge Axe', 'comp-a')));
    manager.recipes.set('r-b', new Recipe(completeRecipe('r-b', 'Forge Spear', 'comp-a')));
    manager.recipes.set('r-c', new Recipe(completeRecipe('r-c', 'Forge Shield', 'comp-b')));

    const disabled = await manager.disableSignatureConflicts('sys-1');

    assert.deepEqual(
      disabled.map((d) => d.name).sort((a, b) => a.localeCompare(b)),
      ['Forge Axe', 'Forge Spear'],
      'both conflicting recipes are disabled and reported'
    );
    assert.equal(manager.recipes.get('r-a').enabled, false);
    assert.equal(manager.recipes.get('r-b').enabled, false);
    assert.equal(manager.recipes.get('r-c').enabled, true, 'distinct recipe stays enabled');
  });

  it('is a no-op outside alchemy mode', async () => {
    resolutionMode = 'routed';
    const manager = makeManager();
    manager.save = async () => {};
    manager.recipes.set('r-a', new Recipe(completeRecipe('r-a', 'A', 'comp-a')));
    manager.recipes.set('r-b', new Recipe(completeRecipe('r-b', 'B', 'comp-a')));

    const disabled = await manager.disableSignatureConflicts('sys-1');

    assert.deepEqual(disabled, []);
    assert.equal(manager.recipes.get('r-a').enabled, true);
    assert.equal(manager.recipes.get('r-b').enabled, true);
  });

  it('leaves a recipe enabled when its only collision partner is already disabled', async () => {
    // Issue 649: `SignatureValidator.validateSystem` is now enabled-scoped, so the scan
    // is the exact complement of the runtime matcher's `if (!recipe.enabled) continue;`.
    // A disabled recipe no longer counts against the gate, so the still-enabled recipe
    // (whose sole collision partner is disabled) is collision-free among the enabled set
    // and STAYS enabled — the domain-correct outcome (no runtime ambiguity), and
    // `disableSignatureConflicts` reports nothing.
    const manager = makeManager();
    manager.save = async () => {};
    manager.recipes.set('r-a', new Recipe(completeRecipe('r-a', 'A', 'comp-a', { enabled: false })));
    manager.recipes.set('r-b', new Recipe(completeRecipe('r-b', 'B', 'comp-a')));

    const disabled = await manager.disableSignatureConflicts('sys-1');

    assert.deepEqual(disabled, [], 'nothing to disable — the enabled residual is collision-free');
    assert.equal(manager.recipes.get('r-b').enabled, true, 'the enabled recipe stays enabled');
  });
});
